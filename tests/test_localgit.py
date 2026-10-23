"""Verdicts de l'onglet Local : la seule logique où une erreur fait perdre du travail.

Les branches sont construites à la main, avec les mêmes clés que
`localgit._read_repo()`, puis passent par la même chaîne :
`_verdict` → `_safety` → `_action`, et `_commands` pour le dépôt.
"""

import itertools
import os
import shutil
import tempfile
import unittest
from unittest import mock

from tests import _path  # noqa: F401  (DATA_DIR temporaire, backend/ dans sys.path)

import localgit

DEFAULT = "main"


def branch(**over):
    """Branche locale « neutre » : poussée, à jour, pas mergée."""
    b = {
        "name": "feature/x", "sha": "a" * 40, "short": "aaaaaaaa",
        "current": False, "protected": False,
        "upstream": None, "remote_ref": False, "remote_sha": None,
        "ahead_default": 2, "behind_default": 0, "capped": False,
        "push_ahead": None, "push_behind": None,
        "on_github": None,
        "date": 0, "author": "", "subject": "", "pr": None,
    }
    b.update(over)
    return b


def judge(b):
    """Même enchaînement que `_read_repo()`."""
    state, advice, flag = localgit._verdict(b, DEFAULT)
    b["state"], b["advice"], b["delete"] = state, advice, flag
    b["safety"] = localgit._safety(b, DEFAULT)
    b["action"] = localgit._action(b, b["safety"])
    return b


class VerdictTest(unittest.TestCase):

    # -- mergées ---------------------------------------------------------------
    def test_merged_branch_still_on_github_is_deletable_with_d(self):
        b = judge(branch(ahead_default=0, on_github=True, remote_ref=True,
                         push_ahead=0, push_behind=0))
        self.assertEqual(b["state"], "merged")
        self.assertEqual(b["delete"], "-d")
        self.assertEqual(b["safety"]["level"], "merged")
        self.assertEqual(b["action"]["kind"], "delete")

    def test_merged_branch_deleted_on_github(self):
        b = judge(branch(ahead_default=0, on_github=False, remote_ref=True))
        self.assertEqual(b["state"], "gone-merged")
        self.assertEqual(b["delete"], "-d")
        self.assertEqual(b["action"]["kind"], "delete")

    def test_github_overrides_stale_local_remote_ref(self):
        # Le ref local survit à la suppression distante tant qu'on n'a pas fait
        # `fetch --prune` : GitHub doit l'emporter quand on le connaît.
        b = judge(branch(ahead_default=0, on_github=False, remote_ref=True))
        self.assertEqual(b["state"], "gone-merged")
        b = judge(branch(ahead_default=0, on_github=None, remote_ref=True))
        self.assertEqual(b["state"], "merged")       # repli sur le ref local

    # -- squashée --------------------------------------------------------------
    def test_squashed_branch_found_by_merged_pr(self):
        b = judge(branch(ahead_default=3, on_github=False, remote_ref=False,
                         pr={"number": 42, "merged": True}))
        self.assertEqual(b["state"], "squashed")
        self.assertEqual(b["delete"], "-D")
        self.assertEqual(b["safety"]["level"], "squash")
        self.assertEqual(b["action"]["kind"], "delete")

    # -- poussée puis supprimée vs jamais poussée -----------------------------
    def test_pushed_then_deleted_without_pr_is_never_to_delete(self):
        # Invariant CLAUDE.md : `-D` seul ne suffit pas pour « à supprimer ».
        b = judge(branch(ahead_default=2, on_github=False, remote_ref=True))
        self.assertEqual(b["state"], "gone")
        self.assertEqual(b["delete"], "-D")
        self.assertEqual(b["safety"]["level"], "local")
        self.assertEqual(b["safety"]["label"], "⚠ effacée du distant")
        self.assertEqual(b["action"]["kind"], "check")

    def test_upstream_alone_proves_a_past_push(self):
        # `fetch --prune` a effacé le ref distant ; `branch.<x>.merge` reste.
        b = judge(branch(ahead_default=2, on_github=None, remote_ref=False,
                         upstream="origin/feature/x"))
        self.assertEqual(b["state"], "gone")
        self.assertEqual(b["safety"]["label"], "⚠ effacée du distant")

    def test_pr_alone_proves_a_past_push(self):
        b = judge(branch(ahead_default=2, on_github=False,
                         pr={"number": 7, "merged": False}))
        self.assertEqual(b["state"], "closed-pr")
        self.assertIsNone(b["delete"])
        self.assertEqual(b["action"]["kind"], "keep")

    def test_never_pushed(self):
        b = judge(branch(ahead_default=2, on_github=False))
        self.assertEqual(b["state"], "local-only")
        self.assertIsNone(b["delete"])
        self.assertEqual(b["safety"]["label"], "⚠ jamais poussée")
        self.assertEqual(b["action"]["kind"], "keep")

    # -- poussée, en cours -----------------------------------------------------
    def test_pushed_work_in_progress(self):
        b = judge(branch(ahead_default=3, on_github=True, remote_ref=True,
                         push_ahead=0, push_behind=0))
        self.assertEqual(b["state"], "ok")
        self.assertEqual(b["safety"]["level"], "pushed")
        self.assertEqual(b["action"]["kind"], "work")

    def test_partially_pushed(self):
        b = judge(branch(ahead_default=3, on_github=True, remote_ref=True,
                         push_ahead=2, push_behind=0))
        self.assertEqual(b["state"], "unpushed")
        self.assertEqual(b["safety"]["level"], "partial")
        self.assertEqual(b["action"]["kind"], "keep")

    def test_on_github_without_local_remote_ref_is_not_up_to_date(self):
        # GitHub dit que la branche existe, mais aucun refs/remotes/origin/<b>
        # local (jamais fetchée, ou poussée vers un autre remote) → push_ahead
        # vaut None. Ni « à jour avec origin/… » ni « ⚠ 0 non poussé » : rien ne
        # permet de l'affirmer, l'état est « non comparée ».
        b = judge(branch(ahead_default=3, on_github=True, remote_ref=False,
                         push_ahead=None, push_behind=None))
        self.assertNotEqual(b["state"], "ok")
        self.assertNotIn("0 non poussé", b["safety"]["label"])

    def test_diverged(self):
        b = judge(branch(on_github=True, remote_ref=True, push_ahead=1, push_behind=2))
        self.assertEqual(b["state"], "diverged")
        self.assertIsNone(b["delete"])

    # -- jamais de suppression sur la courante ni une protégée -----------------
    def test_current_branch_is_never_deleted(self):
        b = judge(branch(ahead_default=0, on_github=True, remote_ref=True,
                         push_ahead=0, push_behind=0, current=True))
        self.assertEqual(b["state"], "merged")
        self.assertIsNone(b["delete"])
        self.assertIn("git switch", b["advice"])
        self.assertEqual(b["action"]["kind"], "current")

    def test_current_squashed_branch_is_never_deleted(self):
        b = judge(branch(ahead_default=3, on_github=False, current=True,
                         pr={"number": 1, "merged": True}))
        self.assertIsNone(b["delete"])
        self.assertNotEqual(b["action"]["kind"], "delete")

    def test_protected_branch_is_never_deleted(self):
        b = judge(branch(name="main", protected=True, ahead_default=0, on_github=False))
        self.assertEqual(b["state"], "protected")
        self.assertIsNone(b["delete"])
        self.assertEqual(b["action"]["kind"], "ref")

    def test_protected_branch_behind(self):
        b = judge(branch(name="main", protected=True, behind_default=4))
        self.assertEqual(b["state"], "behind")
        self.assertIsNone(b["delete"])

    # -- invariants, sur toutes les combinaisons -------------------------------
    def test_invariants_over_all_combinations(self):
        prs = [None, {"number": 1, "merged": True}, {"number": 2, "merged": False}]
        axes = itertools.product(
            [True, False],            # current
            [True, False],            # protected
            [None, "origin/x"],       # upstream
            [True, False],            # remote_ref
            [None, True, False],      # on_github
            [0, 3],                   # ahead_default
            [0, 2],                   # behind_default
            [None, 0, 1],             # push_ahead
            [None, 0, 1],             # push_behind
            prs,
        )
        n = 0
        for cur, prot, up, rref, ongh, ahead, behind, pa, pb, pr in axes:
            b = judge(branch(current=cur, protected=prot, upstream=up, remote_ref=rref,
                             on_github=ongh, ahead_default=ahead, behind_default=behind,
                             push_ahead=pa, push_behind=pb, pr=pr))
            ctx = dict(current=cur, protected=prot, upstream=up, remote_ref=rref,
                       on_github=ongh, ahead=ahead, pr=pr, state=b["state"])
            n += 1
            if b["action"]["kind"] == "delete":
                self.assertIn(b["safety"]["level"], localgit.SAFE_LEVELS, ctx)
            if cur or prot:
                self.assertIsNone(b["delete"], ctx)
                self.assertNotIn(b["action"]["kind"], ("delete", "check"), ctx)
            if b["delete"] == "-d":
                # `-d` n'est proposé que pour une branche entièrement mergée.
                self.assertEqual(ahead, 0, ctx)
            if not (rref or up or pr) and ongh is not True:
                # Jamais poussée : rien ne peut la dire sauvegardée ailleurs,
                # sauf si elle est déjà entièrement dans la branche par défaut.
                if ahead:
                    self.assertNotIn(b["safety"]["level"], localgit.SAFE_LEVELS, ctx)
        self.assertGreater(n, 1000)


class CommandsTest(unittest.TestCase):

    def entry(self, *branches, display="~/dev/projet"):
        return {"display": display, "default_branch": DEFAULT,
                "branches": [judge(b) for b in branches]}

    def by_id(self, cmds):
        return {c["id"]: c for c in cmds}

    def test_fetch_is_always_offered(self):
        cmds = localgit._commands(self.entry())
        self.assertEqual([c["id"] for c in cmds], ["fetch"])
        self.assertIn("git fetch --prune", cmds[0]["cmd"])

    def test_commands_follow_the_delete_flag(self):
        e = self.entry(
            branch(name="merged-one", ahead_default=0, on_github=True, remote_ref=True,
                   push_ahead=0, push_behind=0),
            branch(name="squashed-one", ahead_default=3, on_github=False,
                   pr={"number": 5, "merged": True}),
            branch(name="gone-one", ahead_default=2, on_github=False, remote_ref=True),
            branch(name="current-merged", ahead_default=0, on_github=True, remote_ref=True,
                   push_ahead=0, push_behind=0, current=True),
            branch(name="main", protected=True, ahead_default=0, on_github=True),
            branch(name="wip", ahead_default=2, on_github=False),
        )
        cmds = self.by_id(localgit._commands(e))
        self.assertIn("git branch -d merged-one", cmds["delete"]["cmd"])
        self.assertIn("git branch -D squashed-one", cmds["squashed"]["cmd"])
        self.assertIn("gone-one", cmds["force"]["cmd"])
        self.assertTrue(cmds["force"].get("danger"))
        every = " ".join(c["cmd"] for c in cmds.values())
        for never in ("current-merged", " main", "wip"):
            self.assertNotIn(never, every)

    def test_unsafe_branch_names_are_quoted(self):
        e = self.entry(branch(name="x;rm -rf ~", ahead_default=0, on_github=True,
                              remote_ref=True, push_ahead=0, push_behind=0))
        cmd = self.by_id(localgit._commands(e))["delete"]["cmd"]
        self.assertIn("'x;rm -rf ~'", cmd)

    def test_path_with_spaces_is_quoted_but_tilde_stays_bare(self):
        self.assertEqual(localgit._shell_path("~/dev/projet"), "~/dev/projet")
        self.assertEqual(localgit._shell_path("~/mes projets/x"), '"~/mes projets/x"')

    def test_default_branch_behind_is_pulled_not_merged(self):
        e = self.entry(branch(name="main", protected=True, current=True, ahead_default=0,
                              behind_default=3, on_github=True, remote_ref=True,
                              upstream="origin/main", push_ahead=0, push_behind=3))
        cmds = self.by_id(localgit._commands(e))
        self.assertEqual(cmds["pull"]["cmd"], "cd ~/dev/projet && git pull")
        self.assertNotIn("merge", cmds)

    def test_pull_names_the_branch_without_upstream(self):
        e = self.entry(branch(name="feat", current=True, ahead_default=0, on_github=True,
                              remote_ref=True, push_ahead=0, push_behind=2))
        self.assertIn("git pull origin feat", self.by_id(localgit._commands(e))["pull"]["cmd"])

    def test_no_pull_when_diverged(self):
        e = self.entry(branch(name="feat", current=True, on_github=True, remote_ref=True,
                              upstream="origin/feat", push_ahead=1, push_behind=2))
        self.assertNotIn("pull", self.by_id(localgit._commands(e)))

    def test_merge_even_for_never_pushed_head(self):
        e = self.entry(branch(name="wip", current=True, ahead_default=1,
                              behind_default=3, on_github=False))
        cmds = self.by_id(localgit._commands(e))
        self.assertIn("git fetch origin && git merge origin/main", cmds["merge"]["cmd"])
        self.assertNotIn("rebase", cmds)

    def test_merge_for_pushed_head(self):
        e = self.entry(branch(name="feat", current=True, ahead_default=1, behind_default=3,
                              on_github=True, remote_ref=True, push_ahead=0, push_behind=0))
        cmds = self.by_id(localgit._commands(e))
        self.assertIn("merge", cmds)
        self.assertNotIn("pull", cmds)

    def test_pull_then_merge_when_behind_both(self):
        e = self.entry(branch(name="feat", current=True, ahead_default=1, behind_default=3,
                              on_github=True, remote_ref=True, upstream="origin/feat",
                              push_ahead=0, push_behind=2))
        ids = [c["id"] for c in localgit._commands(e)]
        self.assertLess(ids.index("pull"), ids.index("merge"))


class RemoteParsingTest(unittest.TestCase):

    def test_parse_remote(self):
        for url in ("git@github.com:mon-org/api.git",
                    "https://github.com/mon-org/api.git",
                    "https://github.com/mon-org/api",
                    "ssh://git@github.com/mon-org/api.git"):
            self.assertEqual(localgit._parse_remote(url), ("mon-org", "api"), url)

    def test_parse_remote_without_url(self):
        org, name = localgit._parse_remote(None)
        self.assertIsNone(name)



class CleanupEventsTest(unittest.TestCase):
    """🧹 dans la cloche : seulement les branches devenues supprimables pour de bon,
    pas les vieux merges que le scan découvre tard (issue #5)."""

    def setUp(self):
        self.recorded = []
        self._record = localgit.events.record
        localgit.events.record = lambda items: self.recorded.extend(items)
        localgit._prev_removable, localgit._prev_repos = set(), set()
        localgit._seed["done"] = True

    def tearDown(self):
        localgit.events.record = self._record

    @staticmethod
    def repo(name, *branches):
        return {"name": name, "url": "", "branches": [
            {"name": b, "action": {"kind": "delete", "detail": ""}, "pr": pr} for b, pr in branches]}

    @staticmethod
    def iso(seconds_ago):
        import time
        return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - seconds_ago))

    def test_old_merge_found_late_is_silent_recent_one_is_reported(self):
        localgit._record_cleanup([self.repo("api")])                      # dépôt connu, rien à jeter
        localgit._record_cleanup([self.repo(
            "api",
            ("fix/vieux", {"merged_at": self.iso(90 * 86400), "url": ""}),  # PR #114 d'il y a 3 mois
            ("fix/hier", {"merged_at": self.iso(3600), "url": ""}),        # mergée il y a une heure
            ("supprimee", None),                                           # effacée sur GitHub, sans PR
        )])
        titles = [e["title"] for e in self.recorded]
        self.assertEqual(len(titles), 2, titles)
        self.assertTrue(any("fix/hier" in t for t in titles))
        self.assertTrue(any("supprimee" in t for t in titles))

    def test_repo_seen_for_the_first_time_produces_nothing(self):
        localgit._record_cleanup([self.repo("api")])
        localgit._record_cleanup([self.repo("api"), self.repo("nouveau", ("x", {"merged_at": self.iso(60)}))])
        self.assertEqual(self.recorded, [])


if __name__ == "__main__":
    unittest.main()



class DiskTest(unittest.TestCase):
    """Dossiers hors du dossier personnel (#31) : le disque monté en lecture seule."""

    def setUp(self):
        root = tempfile.mkdtemp(prefix="hd-disk-")
        self.addCleanup(shutil.rmtree, root, ignore_errors=True)
        self.home = os.path.join(root, "host")
        self.disk = os.path.join(root, "hostdisk")
        for d in ("dev/api/.git", "Library"):
            os.makedirs(os.path.join(self.home, d))
        for d in ("projets/site/.git", "Windows", "$Recycle.Bin", "Users"):
            os.makedirs(os.path.join(self.disk, d))
        open(os.path.join(self.home, "notes.md"), "w").close()
        # lien vers le conteneur (comme /Volumes/Macintosh HD → /) : jamais suivi
        os.symlink("/", os.path.join(self.disk, "Macintosh HD"))
        for name, value in (("HOST_MOUNT", self.home), ("DISK_MOUNT", self.disk)):
            p = mock.patch.object(localgit, name, value)
            p.start()
            self.addCleanup(p.stop)
        self.env({"HOST_HOME": "C:\\Users\\moi", "HOST_DISK": "C:"})

    def env(self, values):
        p = mock.patch.dict(os.environ, values)
        p.start()
        self.addCleanup(p.stop)

    def test_windows_paths_round_trip(self):
        self.assertEqual(localgit.resolve("C:/projets/site"), self.disk + "/projets/site")
        self.assertEqual(localgit.resolve("c:\\projets\\site"), self.disk + "/projets/site")
        self.assertEqual(localgit.display(self.disk + "/projets/site"), "C:/projets/site")
        self.assertEqual(localgit.resolve("~/dev"), self.home + "/dev")
        # le dossier personnel vu depuis le disque reste `~` : pas de doublon
        self.assertEqual(localgit.display(self.disk + "/Users/moi/dev"), "~/dev")

    def test_mac_volumes(self):
        self.env({"HOST_HOME": "/Users/moi", "HOST_DISK": "/Volumes"})
        self.assertEqual(localgit.resolve("/Volumes/projets"), self.disk + "/projets")
        self.assertEqual(localgit.display(self.disk + "/projets"), "/Volumes/projets")

    def test_browse_reaches_the_disk_but_not_beyond(self):
        top = localgit.browse("C:")
        self.assertEqual([d["name"] for d in top["dirs"]], ["projets", "Users"])   # système, $, lien : cachés
        self.assertIsNone(top["parent"])
        self.assertEqual([s["path"] for s in top["starts"]], ["~", "C:"])
        self.assertEqual(localgit.browse("C:/projets")["repos"]["count"], 1)
        self.assertIn("error", localgit.browse("C:/Macintosh HD"))           # lien vers le conteneur
        self.assertIn("error", localgit.browse("/etc"))

    def test_file_picker_stays_in_home(self):
        self.assertIn("error", localgit.browse("C:/projets", files=True))
        self.assertEqual([f["name"] for f in localgit.browse("~", files=True)["files"]], ["notes.md"])

    def test_without_disk_mount_nothing_changes(self):
        localgit.DISK_MOUNT = "/nexiste/pas"
        self.assertEqual(localgit.resolve("C:/projets"), "C:/projets")
        self.assertEqual([s["path"] for s in localgit.browse("~")["starts"]], ["~"])
