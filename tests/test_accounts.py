"""Plusieurs comptes GitHub : migration de config, jetons, isolation, routage.

Aucun appel réseau : les modules `github` chargés par compte sont configurés
avec des jetons factices, et `pr_for_branch` est remplacé par un enregistreur
pour vérifier seulement *quel compte* est interrogé.
"""

import copy
import json
import unittest
from unittest import mock

from tests import _path

import accounts
import store


def reset_secrets():
    p = store.path_of(store.SECRETS)
    if p.exists():
        p.unlink()


class MigrationTest(unittest.TestCase):

    LEGACY = {
        "groups": [],
        "github": {"org": "mon-org", "me": "moi", "label": "Boulot",
                   "repos": ["api", "front", "perso/blog"],
                   "branch_repos": ["api"], "upstream_repo": "socle"},
        "repos": {"items": [{"name": "api"}, {"name": "blog", "owner": "perso"}]},
    }

    def test_legacy_github_section_becomes_main_account(self):
        cfg, changed = accounts.migrate(copy.deepcopy(self.LEGACY))
        self.assertTrue(changed)
        self.assertNotIn("github", cfg)
        [main] = cfg["github_accounts"]
        self.assertEqual(main["id"], "main")
        self.assertEqual(main["label"], "Boulot")
        self.assertNotIn("org", main)
        self.assertEqual(main["repos"], ["mon-org/api", "mon-org/front", "perso/blog"])
        self.assertEqual(main["branch_repos"], ["mon-org/api"])
        self.assertEqual(main["upstream_repo"], "mon-org/socle")

    def test_card_items_get_the_old_org_as_owner(self):
        cfg, _ = accounts.migrate(copy.deepcopy(self.LEGACY))
        items = cfg["repos"]["items"]
        self.assertEqual(items[0]["owner"], "mon-org")
        self.assertEqual(items[1]["owner"], "perso")       # déjà renseigné : intact

    def test_migration_is_idempotent(self):
        cfg, _ = accounts.migrate(copy.deepcopy(self.LEGACY))
        again, changed = accounts.migrate(copy.deepcopy(cfg))
        self.assertFalse(changed)
        self.assertEqual(again, cfg)

    def test_empty_config_gets_one_account(self):
        cfg, _ = accounts.migrate({"groups": []})
        self.assertEqual([a["id"] for a in cfg["github_accounts"]], ["main"])

    def test_from_config_reads_migrated_accounts_only(self):
        cfg = {"github_accounts": [{"id": "main"}, {"label": "sans id"}, "n'importe quoi",
                                   {"id": "perso", "label": "Perso"}]}
        self.assertEqual([a["id"] for a in accounts.from_config(cfg)], ["main", "perso"])

    def test_normalized_matches_migrate(self):
        self.assertEqual(accounts.normalized(copy.deepcopy(self.LEGACY)),
                         accounts.migrate(copy.deepcopy(self.LEGACY))[0])

    def test_settings_of_strips_identity(self):
        self.assertEqual(accounts.settings_of({"id": "x", "label": "X", "me": "moi"}),
                         {"me": "moi"})

    def test_slug(self):
        self.assertEqual(accounts.slug("Perso", set()), "perso")
        self.assertEqual(accounts.slug("Client X !", set()), "client-x")
        self.assertEqual(accounts.slug("Perso", {"perso"}), "perso-2")
        self.assertEqual(accounts.slug("Perso", {"perso", "perso-2"}), "perso-3")
        self.assertEqual(accounts.slug("", set()), "compte")
        self.assertEqual(accounts.slug("éé", set()), "compte")
        self.assertLessEqual(len(accounts.slug("x" * 80, set())), 24)


class TokensTest(unittest.TestCase):

    def setUp(self):
        reset_secrets()
        self.addCleanup(reset_secrets)
        self.addCleanup(accounts.configure, {"github_accounts": []})

    def test_legacy_token_moves_to_first_account(self):
        store.write_secret("github_token", "ancien")
        accounts.migrate_secrets("main")
        self.assertIsNone(store.read_secret("github_token"))
        self.assertEqual(store.read_secret("github_tokens"), {"main": "ancien"})

    def test_legacy_token_never_overwrites_a_newer_one(self):
        store.write_secret("github_tokens", {"main": "récent"})
        store.write_secret("github_token", "ancien")
        accounts.migrate_secrets("main")
        self.assertEqual(store.read_secret("github_tokens"), {"main": "récent"})

    def test_set_token_and_forget(self):
        accounts.configure({"github_accounts": [{"id": "a"}, {"id": "b"}]})
        accounts.set_token("a", "tok-a")
        accounts.set_token("b", "tok-b")
        self.assertEqual(accounts.get("a").token(), "tok-a")
        self.assertEqual(accounts.get("b").token(), "tok-b")
        accounts.set_token("a", None)
        self.assertIsNone(accounts.get("a").token())
        accounts.forget("b")
        self.assertEqual(store.read_secret("github_tokens"), {})

    def test_tokens_never_land_in_config(self):
        cfg = {"groups": [], "github_accounts": [{"id": "a", "me": "moi"}]}
        accounts.configure(cfg)
        accounts.set_token("a", "secret-xyz")
        self.assertNotIn("secret-xyz", json.dumps(cfg))


class IsolationTest(unittest.TestCase):
    """Chaque compte a sa copie de `github.py` : rien ne doit fuir de l'une à l'autre."""

    def test_two_loaded_modules_share_nothing(self):
        m1 = accounts._load_module("iso-un")
        m2 = accounts._load_module("iso-deux")
        self.assertIsNot(m1, m2)
        m1.configure({"me": "un", "repos": ["org-un/api"]})
        m2.configure({"me": "deux", "repos": ["org-deux/blog"]})
        m1.apply_token("jeton-un", "ui")
        m2.apply_token(None, None)

        self.assertEqual(m1.CFG["repos"], ["api"])
        self.assertEqual(m2.CFG["repos"], ["blog"])
        self.assertEqual(m1.owner("api"), "org-un")
        self.assertEqual(m2.owner("api"), "")
        self.assertEqual(m1.token(), "jeton-un")
        self.assertIsNone(m2.token())
        self.assertIsNot(m1.CFG, m2.CFG)
        self.assertIsNot(m1._OWNERS, m2._OWNERS)

    def test_configure_semantics(self):
        m = accounts._load_module("iso-cfg")
        m.configure({"me": "moi", "repos": ["o/a", "o/b"]})
        self.assertEqual(m.CFG["branch_repos"], ["a", "b"])     # clé absente = repos
        m.configure({"me": "moi", "repos": ["o/a"], "branch_repos": []})
        self.assertEqual(m.CFG["branch_repos"], [])             # vide = vide
        m.configure({"me": "moi", "upstream_repo": "o/socle"})
        self.assertEqual(m.CFG["upstream_repo"], "socle")
        self.assertEqual(m.owner("socle"), "o")
        m.configure({"me": "moi"})
        self.assertEqual(m.owner("a"), "")                      # rien ne survit
        self.assertEqual(m.owner("a", hint="remote-org"), "remote-org")


class RoutingTest(unittest.TestCase):
    """`pr_for_branch` (vue regroupée de l'onglet Local) interroge le bon compte."""

    def setUp(self):
        reset_secrets()
        self.addCleanup(reset_secrets)
        self.addCleanup(accounts.configure, {"github_accounts": []})
        accounts.configure({"github_accounts": [
            {"id": "boulot", "me": "moi", "repos": ["mon-org/api"]},
            {"id": "perso", "me": "moi", "repos": [], "branch_repos": ["perso/blog"]},
        ]})
        accounts.set_token("boulot", "t1")
        accounts.set_token("perso", "t2")
        self.calls = []
        for acc_id in ("boulot", "perso"):
            mod = accounts.get(acc_id)
            mod.pr_for_branch = (lambda repo, branch, hint=None, _id=acc_id:
                                 self.calls.append((_id, repo, branch, hint)) or {"from": _id})

    def test_routes_to_the_account_tracking_the_repo(self):
        self.assertEqual(accounts.pr_for_branch("api", "fix")["from"], "boulot")
        self.assertEqual(accounts.pr_for_branch("blog", "fix", "perso")["from"], "perso")
        self.assertEqual(self.calls[-1], ("perso", "blog", "fix", "perso"))

    def test_untracked_repo_goes_to_first_connected_account(self):
        self.assertEqual(accounts.pr_for_branch("inconnu", "x")["from"], "boulot")
        accounts.set_token("boulot", None)
        self.assertEqual(accounts.pr_for_branch("inconnu", "x")["from"], "perso")
        # Un compte sans jeton n'est jamais interrogé, même s'il suit le repo.
        self.assertEqual(accounts.pr_for_branch("api", "x")["from"], "perso")

    def test_no_connected_account(self):
        accounts.set_token("boulot", None)
        accounts.set_token("perso", None)
        self.assertIsNone(accounts.pr_for_branch("api", "x"))
        self.assertEqual(self.calls, [])

    def test_get_falls_back_to_first_account(self):
        self.assertIs(accounts.get("n'existe pas"), accounts.get("boulot"))
        self.assertEqual([m.ACCOUNT["id"] for m in accounts.all_mods()], ["boulot", "perso"])

    def test_removed_account_is_forgotten(self):
        accounts.configure({"github_accounts": [{"id": "boulot", "me": "moi"}]})
        self.assertEqual([m.ACCOUNT["id"] for m in accounts.all_mods()], ["boulot"])



class RemoteVersionTest(unittest.TestCase):
    """L'onglet Local relit tout le disque à chaque nouvelle version : elle ne doit
    bouger que si les branches distantes ont changé, pas à chaque relecture."""

    def test_version_only_moves_when_the_remote_changes(self):
        m = accounts._load_module("ver-test")
        m.CFG["repos"] = ["api"]
        branches = [{"name": "main", "commit": {"sha": "a"}}, {"name": "feat", "commit": {"sha": "b"}}]

        def gh(path, token, params=None, cache=True):
            return {"default_branch": "main"} if path.endswith("/api") else list(branches)

        with mock.patch.object(m, "gh", gh), mock.patch.object(m, "_branch_fact", lambda *a: None):
            m._repo_branch_facts(("api", "t"))
            v1 = m.remote_version()
            m._repo_branch_facts(("api", "t"))
            self.assertEqual(m.remote_version(), v1, "même distant : même version")
            branches[1] = {"name": "feat", "commit": {"sha": "c"}}
            m._repo_branch_facts(("api", "t"))
            self.assertEqual(m.remote_version(), v1 + 1, "un nouveau commit : nouvelle version")

if __name__ == "__main__":
    unittest.main()
