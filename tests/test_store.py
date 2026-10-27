"""Stockage : écriture atomique, secrets en 600, garde-fou de config.json."""

import json
import os
import stat
import unittest
from unittest import mock

from tests import _path

import store


def mode_of(path):
    return stat.S_IMODE(os.stat(path).st_mode)


class PinnedOrderTest(unittest.TestCase):

    def test_pinned_order_is_optional_list_of_strings(self):
        base = {"groups": []}
        self.assertIsNone(store.validate_config({**base, "pinnedOrder": ["Liens/GitHub"]}))
        self.assertIsNotNone(store.validate_config({**base, "pinnedOrder": "Liens/GitHub"}))


class BasecampConfigTest(unittest.TestCase):

    def test_hidden_projects_must_be_a_list_of_strings(self):
        base = {"groups": []}
        self.assertIsNone(store.validate_config(base))                      # clé absente : défaut
        self.assertIsNone(store.validate_config({**base, "basecamp": {"hidden": ["12"]}}))
        self.assertIsNotNone(store.validate_config({**base, "basecamp": {"hidden": [12]}}))
        self.assertIsNotNone(store.validate_config({**base, "basecamp": []}))
        self.assertIsNone(store.validate_config({**base, "trello": {"hidden": ["b1"]}}))
        self.assertIsNotNone(store.validate_config({**base, "trello": {"hidden": [1]}}))
        self.assertIsNotNone(store.validate_config({**base, "trello": []}))


class FeaturesTest(unittest.TestCase):
    """Réglages → Fonctionnalités : clé absente = active, sinon des booléens."""

    def test_absent_means_on(self):
        for cfg in ({}, {"features": {}}, {"features": {"basecamp": False}}, None):
            self.assertTrue(store.feature_on(cfg, "github"))
        self.assertFalse(store.feature_on({"features": {"github": False}}, "github"))

    def test_features_must_be_booleans(self):
        base = {"groups": []}
        self.assertIsNone(store.validate_config({**base, "features": {"github": False, "local": True}}))
        self.assertIsNotNone(store.validate_config({**base, "features": {"github": "non"}}))
        self.assertIsNotNone(store.validate_config({**base, "features": ["github"]}))


class WriteTest(unittest.TestCase):

    def tearDown(self):
        for p in _path.DATA_DIR.glob("t-*"):
            p.unlink()
        for name in (store.SECRETS, store.SECRETS + ".tmp"):
            p = store.path_of(name)
            if p.exists():
                p.unlink()

    def test_roundtrip(self):
        store.write("t-a.json", {"é": [1, 2]})
        self.assertEqual(store.read("t-a.json", None), {"é": [1, 2]})
        self.assertEqual(store.read("t-absent.json", "défaut"), "défaut")

    def test_unreadable_json_raises_a_clear_error(self):
        store.path_of("t-bad.json").write_text("{pas du json")
        with self.assertRaises(ValueError):
            store.read("t-bad.json", None)

    def test_crash_mid_write_keeps_the_previous_file(self):
        store.write("t-c.json", {"v": 1})
        with mock.patch.object(store.json, "dump", side_effect=OSError("disque plein")):
            with self.assertRaises(OSError):
                store.write("t-c.json", {"v": 2})
        self.assertEqual(store.read("t-c.json", None), {"v": 1})
        # Le temporaire abandonné ne bloque pas l'écriture suivante.
        store.write("t-c.json", {"v": 3})
        self.assertEqual(store.read("t-c.json", None), {"v": 3})

    def test_secrets_are_600_from_the_first_byte(self):
        seen = []
        real_replace = os.replace

        def spy(src, dst):
            seen.append(mode_of(src))          # droits du temporaire, avant le renommage
            return real_replace(src, dst)

        with mock.patch.object(store.os, "replace", side_effect=spy):
            store.write_secret("github_tokens", {"main": "jeton"})
        self.assertEqual(seen, [0o600])
        self.assertEqual(mode_of(store.path_of(store.SECRETS)), 0o600)

    def test_leftover_world_readable_tmp_does_not_leak_its_mode(self):
        tmp = store.path_of(store.SECRETS + ".tmp")
        tmp.write_text("{}")
        os.chmod(tmp, 0o644)
        store.write_secret("github_tokens", {"main": "jeton"})
        self.assertEqual(mode_of(store.path_of(store.SECRETS)), 0o600)

    def test_write_secret_adds_and_removes_keys(self):
        store.write_secret("a", 1)
        store.write_secret("b", 2)
        store.write_secret("a", None)
        self.assertEqual(json.loads(store.path_of(store.SECRETS).read_text()), {"b": 2})
        self.assertIsNone(store.read_secret("a"))
        self.assertEqual(store.read_secret("b"), 2)


class ValidateConfigTest(unittest.TestCase):

    def ok(self, cfg):
        self.assertIsNone(store.validate_config(cfg))

    def bad(self, cfg, fragment):
        problem = store.validate_config(cfg)
        self.assertIsNotNone(problem, cfg)
        self.assertIn(fragment, problem)

    def test_minimal_config(self):
        self.ok({"groups": []})
        self.ok({"title": "homedash", "groups": [
            {"name": "Liens", "links": [{"name": "GitHub", "url": "https://github.com/"}]}]})

    def test_groups_and_links(self):
        self.bad([], "racine")
        self.bad({}, "groups")
        self.bad({"groups": [{"links": []}]}, "groups[0].name")
        self.bad({"groups": [{"name": "  ", "links": []}]}, "groups[0].name")
        self.bad({"groups": [{"name": "x"}]}, "groups[0].links")
        self.bad({"groups": [{"name": "x", "links": [{"name": "a"}]}]}, "links[0].url")

    def test_sections(self):
        self.bad({"groups": [], "github": []}, "github")
        self.bad({"groups": [], "local": {"roots": "~/dev"}}, "local.roots")
        self.ok({"groups": [], "local": {"roots": [{"path": "~/dev"}]}})

    def test_github_accounts(self):
        self.ok({"groups": [], "github_accounts": [
            {"id": "main", "repos": ["o/a"], "auto_refresh": 15},
            {"id": "perso", "users": ["moi"]}]})
        self.bad({"groups": [], "github_accounts": {}}, "github_accounts")
        self.bad({"groups": [], "github_accounts": [{"label": "x"}]}, "id")
        self.bad({"groups": [], "github_accounts": [{"id": "a"}, {"id": "a"}]}, "double")
        self.bad({"groups": [], "github_accounts": [{"id": "a", "repos": "o/a"}]}, "repos")
        self.bad({"groups": [], "github_accounts": [{"id": "a", "repos": [1]}]}, "repos")
        self.bad({"groups": [], "github_accounts": [{"id": "a", "auto_refresh": -1}]},
                 "auto_refresh")
        self.bad({"groups": [], "github_accounts": [{"id": "a", "merged_count": True}]},
                 "merged_count")

    def test_repos_and_ui(self):
        self.ok({"groups": [], "repos": {"items": [{"name": "api", "owner": "o"}]}})
        self.bad({"groups": [], "repos": []}, "repos")
        self.bad({"groups": [], "repos": {"items": {}}}, "repos.items")
        self.bad({"groups": [], "repos": {"items": [{"owner": "o"}]}}, "repos.items[0]")
        self.bad({"groups": [], "ui": "sombre"}, "ui")

    def test_notes(self):
        self.assertIsNone(store.validate_notes([{"id": "1", "text": ""}]))
        self.assertIsNotNone(store.validate_notes({}))
        self.assertIsNotNone(store.validate_notes([{"id": "", "text": "x"}]))
        self.assertIsNotNone(store.validate_notes([{"id": "1", "text": 3}]))


class UsageTest(unittest.TestCase):

    def test_bump_usage(self):
        store.write(store.USAGE, {})
        store.bump_usage("lien", 1000)
        usage = store.bump_usage("lien", 2000)
        self.assertEqual(usage["lien"], {"count": 2, "last": 2000})



class TabsConfigTest(unittest.TestCase):

    def test_custom_tabs_are_optional_and_checked(self):
        base = {"groups": []}
        ok = {"id": "x1", "label": "Gmail", "url": "https://mail.google.com/"}
        self.assertIsNone(store.validate_config({**base, "tabs": [ok]}))
        self.assertIsNotNone(store.validate_config({**base, "tabs": {}}))
        self.assertIsNotNone(store.validate_config({**base, "tabs": [{**ok, "url": " "}]}))
        self.assertIsNotNone(store.validate_config({**base, "tabs": [ok, ok]}))
        self.assertIsNone(store.validate_config({**base, "tabs": [{**ok, "session": "pro"}]}))
        self.assertIsNotNone(store.validate_config({**base, "tabs": [{**ok, "session": 1}]}))
        self.assertIsNone(store.validate_config({**base, "tabs": [{**ok, "domains": ["twitter.com"]}]}))
        self.assertIsNotNone(store.validate_config({**base, "tabs": [{**ok, "domains": "twitter.com"}]}))
        self.assertIsNone(store.validate_config({**base, "tabs": [{**ok, "sleep": True, "kept": True}]}))
        self.assertIsNotNone(store.validate_config({**base, "tabs": [{**ok, "sleep": "oui"}]}))
        # notifications coupées par onglet : un booléen, absent = actives
        self.assertIsNone(store.validate_config({**base, "tabs": [{**ok, "notify": False}]}))
        self.assertIsNotNone(store.validate_config({**base, "tabs": [{**ok, "notify": "non"}]}))

    def test_tab_folders_are_optional_and_checked(self):
        base = {"groups": []}
        f = {"id": "f-1", "name": "Pro"}
        self.assertIsNone(store.validate_config({**base, "tabFolders": [f]}))
        self.assertIsNotNone(store.validate_config({**base, "tabFolders": [f, f]}))
        self.assertIsNotNone(store.validate_config({**base, "tabFolders": [{"id": "f-2", "name": ""}]}))
        self.assertIsNotNone(store.validate_config({**base, "tabFolders": "Pro"}))

    def test_tab_sessions_are_optional_and_checked(self):
        base = {"groups": []}
        s = {"id": "s-1", "name": "Pro", "color": "#37adff"}
        self.assertIsNone(store.validate_config({**base, "tabSessions": [s]}))
        self.assertIsNotNone(store.validate_config({**base, "tabSessions": [s, s]}))
        self.assertIsNotNone(store.validate_config({**base, "tabSessions": [{"id": "s-2", "name": " "}]}))


if __name__ == "__main__":
    unittest.main()
