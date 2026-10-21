"""Changelog, version installée et instantané avant mise à jour."""

import json
import unittest

from tests import _path  # noqa: F401  (DATA_DIR temporaire avant tout import du backend)

import backup
import store
import updates

SAMPLE = """# Changelog

## 1.2.0 — 2026-10-14

- **Gras** et texte.
- Une puce
  sur deux lignes.

## 1.1.0 — 2026-10-13

- Avant.
"""


class ParseTest(unittest.TestCase):
    def test_versions_dates_items(self):
        e = updates.parse(SAMPLE)
        self.assertEqual([x["version"] for x in e], ["1.2.0", "1.1.0"])
        self.assertEqual(e[0]["date"], "2026-10-14")
        self.assertEqual(e[0]["items"], ["**Gras** et texte.", "Une puce sur deux lignes."])

    def test_desktop_requirement(self):
        e = updates.parse("## 2.0.0 — 2026-10-21\n\nAppli de bureau : 1.4.0\n\n- Mise à jour depuis l'appli.\n"
                          "\n## 1.9.0 — 2026-10-20\n\n- Rien pour l'appli.\n")
        self.assertEqual(e[0]["desktop"], "1.4.0")
        self.assertEqual(e[0]["items"], ["Mise à jour depuis l'appli."])
        self.assertNotIn("desktop", e[1])

    def test_version_order_is_numeric(self):
        self.assertGreater(updates.key("1.10.0"), updates.key("1.9.3"))

    def test_real_changelog_is_parseable_and_sorted(self):
        e = updates.entries()
        self.assertTrue(e, "CHANGELOG.md doit exister et contenir au moins une version")
        keys = [updates.key(x["version"]) for x in e]
        self.assertEqual(keys, sorted(keys, reverse=True), "versions du plus récent au plus ancien")
        self.assertTrue(all(x["items"] for x in e), "chaque version décrit ce qu'elle apporte")

    def test_guide_is_served_and_split_in_parts(self):
        text = updates.guide()
        self.assertIn("\n## ", text, "GUIDE.md : une page de l'Aide par titre `## `")

    def test_windows_commands_work_in_powershell_5(self):
        # PowerShell 5.1 (celui d'origine de Windows) refuse `&&`
        self.assertNotIn("&&", updates.COMMAND_WINDOWS)
        self.assertNotIn("&&", updates.DESKTOP_COMMAND_WINDOWS)
        self.assertIn("docker compose up -d --build", updates.COMMAND_WINDOWS)
        self.assertIn("build-windows.ps1", updates.DESKTOP_COMMAND_WINDOWS)

    def test_missing_guide_is_empty(self):
        saved = updates.GUIDE
        updates.GUIDE = saved.with_name("absent.md")
        try:
            self.assertEqual(updates.guide(), "")
        finally:
            updates.GUIDE = saved


class OnStartTest(unittest.TestCase):
    def setUp(self):
        for name in (updates.VERSION, store.CONFIG):
            store.path_of(name).unlink(missing_ok=True)
        store.write(store.CONFIG, {"groups": [], "title": "x"})

    def _snapshots(self):
        return [b["name"] for b in backup.listing() if b["reason"].startswith("avant-")]

    def test_first_start_records_version_without_snapshot(self):
        before = self._snapshots()
        updates.on_start()
        self.assertEqual(self._snapshots(), before)
        self.assertEqual(store.read(updates.VERSION, {})["version"], updates.current())

    def test_version_change_snapshots_data_first(self):
        store.write(updates.VERSION, {"version": "0.0.1", "announced": "9.9.9"})
        before = self._snapshots()
        updates.on_start()
        new = set(self._snapshots()) - set(before)
        self.assertEqual(len(new), 1)
        snap = json.loads(backup.path(new.pop()).read_text())
        self.assertEqual(snap["files"]["config"]["title"], "x")
        data = store.read(updates.VERSION, {})
        self.assertEqual(data["version"], updates.current())
        self.assertEqual(data["announced"], "9.9.9", "les autres clés de version.json sont conservées")

    def test_same_version_does_nothing(self):
        store.write(updates.VERSION, {"version": updates.current()})
        before = self._snapshots()
        updates.on_start()
        self.assertEqual(self._snapshots(), before)


if __name__ == "__main__":
    unittest.main()
