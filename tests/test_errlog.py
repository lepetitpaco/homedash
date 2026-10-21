"""Journal d'erreurs et réparation d'une config abîmée (Réglages → Aide)."""

import unittest

from tests import _path  # noqa: F401  (DATA_DIR temporaire, backend/ dans sys.path)

import backup
import errlog
import store


class ErrlogTest(unittest.TestCase):
    def setUp(self):
        errlog.clear()
        errlog._recent.clear()

    def test_records_newest_first_with_shown_and_detail(self):
        errlog.record("page", "homedash ne répond pas", "TypeError: Failed to fetch", "chargement")
        errlog.record("serveur", "réglages illisibles", "config.json illisible : Expecting ','", "GET /api/config")
        got = errlog.listing()
        self.assertEqual([e["source"] for e in got], ["serveur", "page"])
        self.assertEqual(got[1]["shown"], "homedash ne répond pas")
        self.assertIn("Failed to fetch", got[1]["detail"])

    def test_secrets_are_masked(self):
        errlog.record("serveur", "x", "token ghp_" + "a" * 36 + " et Bearer abcdefghijklmnop, ?code=12345&x")
        detail = errlog.listing()[0]["detail"]
        self.assertNotIn("ghp_", detail)
        self.assertNotIn("abcdefghijklmnop", detail)
        self.assertNotIn("12345", detail)

    def test_burst_is_capped(self):
        for _ in range(10):
            errlog.record("page", "boucle", "même erreur", "x")
        self.assertEqual(len(errlog.listing()), errlog.BURST)


class BrokenConfigTest(unittest.TestCase):
    def test_trailing_comma_is_reported_with_its_line_then_repaired(self):
        store.write(store.CONFIG, {"groups": [], "title": "ok"})
        good = backup.snapshot("manuelle")
        store.path_of(store.CONFIG).write_text('{\n  "groups": [],\n  "title": "ok",\n}\n')
        with self.assertRaises(store.Broken) as err:
            store.read(store.CONFIG, {})
        self.assertEqual(err.exception.line, 4)
        self.assertEqual(backup.latest_good()["name"], good)

        done = backup.repair()
        self.assertEqual(store.read(store.CONFIG, {})["title"], "ok")
        aside = store.path_of(done["aside"])                       # la version abîmée est gardée
        self.assertTrue(aside.exists())
        self.assertIn('"title": "ok",\n}', aside.read_text())
        aside.unlink()


if __name__ == "__main__":
    unittest.main()
