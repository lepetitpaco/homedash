"""`gitread` contre git lui-même, sur de vrais dépôts temporaires.

Chaque lecture est comparée à la sortie de la commande git équivalente : refs
libres et empaquetées, HEAD, en-têtes de commit, ahead/behind, branche amont,
fichiers modifiés — et la lecture des objets dans les packfiles, deltas `ofs`
ET `ref` (un dépôt fraîchement cloné a tout dans les packs).
"""

import os
import shutil
import subprocess
import tempfile
import time
import unittest
from pathlib import Path

from tests import _path  # noqa: F401

import gitread

GIT = shutil.which("git")


def run(cwd, *args, env=None):
    return subprocess.run([GIT, *args], cwd=cwd, env=env, check=True,
                          capture_output=True, text=True).stdout.strip()


@unittest.skipUnless(GIT, "git absent")
class GitreadTest(unittest.TestCase):

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="homedash-gitread-"))
        self.repo = self.tmp / "repo"
        self.repo.mkdir()
        # Aucune config de l'utilisateur (signature GPG, hooks, templates…).
        self.env = {
            **os.environ,
            "HOME": str(self.tmp), "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": str(self.tmp / "gitconfig"),
            "GIT_AUTHOR_NAME": "Test", "GIT_AUTHOR_EMAIL": "t@example.com",
            "GIT_COMMITTER_NAME": "Test", "GIT_COMMITTER_EMAIL": "t@example.com",
        }
        self.clock = 1_700_000_000
        self.git("init", "-q", "-b", "main")
        self.git("config", "commit.gpgsign", "false")
        self.git("config", "remote.origin.url", "git@github.com:mon-org/api.git")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    # -- outils ----------------------------------------------------------------
    def git(self, *args):
        return run(self.repo, *args, env=self.env)

    def commit(self, msg, files=None):
        """Commit horodaté à la main : ahead_behind trie par date, et des commits
        de la même seconde ne testeraient pas grand-chose."""
        for name, content in (files or {f"{msg}.txt": msg}).items():
            p = self.repo / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content)
            self.git("add", name)
        self.clock += 60
        stamp = f"{self.clock} +0000"
        env = {**self.env, "GIT_AUTHOR_DATE": stamp, "GIT_COMMITTER_DATE": stamp}
        run(self.repo, "commit", "-q", "-m", msg, env=env)
        return self.git("rev-parse", "HEAD")

    def open(self):
        r = gitread.Repo(self.repo)
        self.addCleanup(r.close)
        return r

    def git_refs(self):
        out = self.git("for-each-ref", "--format=%(refname) %(objectname)")
        # Les symrefs (`origin/HEAD`) ne sont pas des refs pour gitread.
        pairs = (line.split(" ", 1) for line in out.splitlines())
        return {name: sha for name, sha in pairs if not name.endswith("/HEAD")}

    def build_history(self):
        """main ── 3 commits, feature ── 2 commits partis du 1er, main avancée de 2,
        un merge sur `merged`, et un origin/main un commit derrière main."""
        base = self.commit("init")
        self.git("switch", "-q", "-c", "feature")
        self.commit("f1")
        self.commit("f2")
        self.git("switch", "-q", "main")
        behind = self.commit("m1")
        self.commit("m2")
        self.git("switch", "-q", "-c", "merged", base)
        self.commit("g1")
        self.git("switch", "-q", "main")
        self.clock += 60
        env = {**self.env, "GIT_AUTHOR_DATE": f"{self.clock} +0000",
               "GIT_COMMITTER_DATE": f"{self.clock} +0000"}
        run(self.repo, "merge", "-q", "--no-ff", "-m", "merge merged", "merged", env=env)
        self.git("update-ref", "refs/remotes/origin/main", behind)
        self.git("update-ref", "refs/remotes/origin/feature",
                 self.git("rev-parse", "feature~1"))
        self.git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main")
        self.git("config", "branch.feature.remote", "origin")
        self.git("config", "branch.feature.merge", "refs/heads/feature")

    def assert_matches_git(self, r):
        self.assertEqual(r.refs, self.git_refs())
        branches = self.git("for-each-ref", "--format=%(refname:short)", "refs/heads")
        for name in branches.splitlines():
            sha = self.git("rev-parse", name)
            info = r.commit(sha)
            self.assertIsNotNone(info, name)
            self.assertEqual(info["subject"], self.git("log", "-1", "--format=%s", sha))
            self.assertEqual(info["author"], self.git("log", "-1", "--format=%an", sha))
            self.assertEqual(info["time"], int(self.git("log", "-1", "--format=%ct", sha)))
            parents = self.git("log", "-1", "--format=%P", sha).split()
            self.assertEqual(info["parents"], parents)
        for a, b in (("feature", "main"), ("main", "origin/main"), ("merged", "main"),
                     ("feature", "origin/feature"), ("main", "feature")):
            left, right = self.git("rev-list", "--left-right", "--count",
                                   f"{a}...{b}").split()
            ahead, behind, capped = r.ahead_behind(self.git("rev-parse", a),
                                                   self.git("rev-parse", b))
            self.assertEqual((ahead, behind), (int(left), int(right)), f"{a}...{b}")
            self.assertFalse(capped)

    # -- refs, HEAD, config ----------------------------------------------------
    def test_loose_refs_head_and_commits(self):
        self.build_history()
        r = self.open()
        self.assert_matches_git(r)
        self.assertEqual(r.head(), ("main", self.git("rev-parse", "main")))
        self.assertEqual(r.default_branch(), "main")
        self.assertEqual(r.remote_url(), "git@github.com:mon-org/api.git")
        self.assertEqual(r.upstream_of("feature"), "origin/feature")
        self.assertIsNone(r.upstream_of("merged"))

    def test_packed_refs(self):
        self.build_history()
        self.git("pack-refs", "--all")
        self.assertFalse((self.repo / ".git/refs/heads/feature").exists())
        self.assert_matches_git(self.open())

    def test_loose_ref_wins_over_packed_ref(self):
        self.build_history()
        self.git("pack-refs", "--all")
        self.git("update-ref", "refs/heads/feature", self.git("rev-parse", "main"))
        self.assertEqual(self.open().refs["refs/heads/feature"],
                         self.git("rev-parse", "main"))

    def test_detached_head(self):
        self.build_history()
        sha = self.git("rev-parse", "feature~1")
        self.git("switch", "-q", "--detach", sha)
        self.assertEqual(self.open().head(), (None, sha))

    def test_empty_repo(self):
        r = self.open()
        self.assertEqual(r.head(), ("main", None))
        self.assertEqual(r.refs, {})

    def test_ahead_behind_cap(self):
        self.build_history()
        r = self.open()
        _, _, capped = r.ahead_behind(self.git("rev-parse", "feature"),
                                      self.git("rev-parse", "main"), limit=1)
        self.assertTrue(capped)

    # -- packfiles -------------------------------------------------------------
    def big_history(self):
        """Un gros fichier modifié à la marge à chaque commit : de quoi forcer
        des chaînes de deltas sur les blobs (et sur les arbres)."""
        lines = [f"ligne {i} " + "x" * 60 for i in range(400)]
        for n in range(12):
            lines[n * 7] = f"modifiée au commit {n}"
            self.commit(f"c{n}", {"gros.txt": "\n".join(lines) + "\n",
                                  f"dir/f{n}.txt": f"{n}\n"})

    def pack_types(self):
        packs = list((self.repo / ".git/objects/pack").glob("*.pack"))
        self.assertTrue(packs)
        types = set()
        for pack in packs:
            data = pack.read_bytes()
            idx = pack.with_suffix(".idx")
            out = run(self.repo, "verify-pack", "-v", str(idx), env=self.env)
            for line in out.splitlines():
                parts = line.split()
                if len(parts) >= 5 and len(parts[0]) == 40:
                    off = int(parts[4])
                    types.add((data[off] >> 4) & 7)
        return types

    def assert_objects_readable(self):
        r = self.open()
        shas = self.git("rev-list", "--objects", "--all").split("\n")
        shas = [s.split()[0] for s in shas if s]
        loose = list((self.repo / ".git/objects").glob("[0-9a-f][0-9a-f]/*"))
        self.assertEqual(loose, [], "il reste des objets libres : le test ne lit pas les packs")
        for sha in shas:
            kind = self.git("cat-file", "-t", sha)
            found = r._store.raw(sha)
            self.assertIsNotNone(found, sha)
            expected = subprocess.run([GIT, "cat-file", kind, sha], cwd=self.repo,
                                      env=self.env, check=True, capture_output=True).stdout
            self.assertEqual(found[1], expected, f"{kind} {sha}")
        self.assert_matches_git(r)

    def test_pack_with_ofs_deltas(self):
        self.big_history()
        self.build_history()
        self.git("repack", "-adf", "-q")
        self.git("prune")
        self.assertIn(gitread.OBJ_OFS_DELTA, self.pack_types())
        self.assert_objects_readable()

    def test_pack_with_ref_deltas(self):
        self.big_history()
        self.build_history()
        run(self.repo, "-c", "repack.useDeltaBaseOffset=false", "repack", "-adf", "-q",
            env=self.env)
        self.git("prune")
        types = self.pack_types()
        self.assertIn(gitread.OBJ_REF_DELTA, types)
        self.assertNotIn(gitread.OBJ_OFS_DELTA, types)
        self.assert_objects_readable()

    def test_fresh_clone_reads_everything_from_packs(self):
        self.big_history()
        self.build_history()
        clone = self.tmp / "clone"
        run(self.tmp, "clone", "-q", "--no-local", str(self.repo), str(clone), env=self.env)
        r = gitread.Repo(clone)
        self.addCleanup(r.close)
        head = run(clone, "rev-parse", "HEAD", env=self.env)
        self.assertEqual(r.head()[1], head)
        self.assertIsNotNone(r.commit(head))
        self.assertEqual(r.default_branch(), "main")
        self.assertEqual(r.refs["refs/remotes/origin/feature"],
                         run(clone, "rev-parse", "origin/feature", env=self.env))

    # -- répertoire de travail -------------------------------------------------
    def git_modified(self):
        out = subprocess.run([GIT, "status", "--porcelain", "--untracked-files=no"],
                             cwd=self.repo, env=self.env, check=True,
                             capture_output=True, text=True).stdout
        return len([l for l in out.splitlines() if l.strip()])

    def test_modified_counts_like_git_status(self):
        self.commit("a", {"a.txt": "a\n", "b.txt": "b\n", "c.txt": "c\n",
                          "d.txt": "d\n", "sub/e.txt": "e\n"})
        r = self.open()
        self.assertEqual(r.modified(), {"known": True, "count": 0, "capped": False})

        time.sleep(1.1)                     # mtime distinct de celui de l'index
        (self.repo / "a.txt").write_text("a modifié\n")           # taille changée
        (self.repo / "b.txt").write_text("B\n")                   # même taille
        (self.repo / "c.txt").unlink()                            # supprimé
        os.utime(self.repo / "d.txt")                             # touché, identique
        (self.repo / "nouveau.txt").write_text("non suivi\n")     # hors périmètre

        got = self.open().modified()        # AVANT git status, qui réécrit l'index
        self.assertTrue(got["known"])
        self.assertEqual(got["count"], 3)
        self.assertEqual(got["count"], self.git_modified())

    def test_gitread_never_writes(self):
        self.big_history()
        self.build_history()
        self.git("repack", "-ad", "-q")
        (self.repo / "gros.txt").write_text("modifié\n")

        def snapshot():
            out = {}
            for p in (self.repo / ".git").rglob("*"):
                if p.is_file():
                    st = p.stat()
                    out[str(p)] = (st.st_mtime_ns, st.st_size)
            return out

        before = snapshot()
        r = gitread.Repo(self.repo)
        r.refs, r.head(), r.default_branch(), r.modified(), r.stash_count()
        for sha in r.refs.values():
            r.commit(sha)
        r.ahead_behind(self.git("rev-parse", "feature"), self.git("rev-parse", "main"))
        r.close()
        self.assertEqual(snapshot(), before)

    # -- découverte et empreinte -----------------------------------------------
    def test_discover_and_signature(self):
        self.commit("a")
        nested = self.repo / "vendor-lib"
        nested.mkdir()
        run(nested, "init", "-q", env=self.env)
        (self.tmp / "node_modules" / "x").mkdir(parents=True)
        run(self.tmp / "node_modules" / "x", "init", "-q", env=self.env)

        found = {str(p) for p in gitread.discover(self.tmp, ["node_modules"], 3)}
        self.assertEqual(found, {str(self.repo), str(nested)})

        before = gitread.signature(self.repo)
        time.sleep(0.01)
        (self.repo / ".git" / "FETCH_HEAD").write_text("")
        self.assertEqual(gitread.what_changed(before, gitread.signature(self.repo)),
                         "git fetch")


if __name__ == "__main__":
    unittest.main()
