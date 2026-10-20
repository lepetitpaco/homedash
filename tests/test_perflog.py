"""Journal de performance : un fichier par jour et par source, 30 jours, des routes pas des valeurs."""

import json
import os
import time
import unittest
from datetime import date, timedelta

from tests import _path  # noqa: F401

import perflog


class PerfLogTest(unittest.TestCase):

    def setUp(self):
        perflog.configure(True)
        self.addCleanup(perflog.configure, False)
        d = perflog.perf_dir()
        if d.is_dir():
            for p in d.iterdir():
                p.unlink()

    def test_lines_go_to_the_file_of_the_day_and_source(self):
        perflog.append("app", {"kind": "sample", "total_mb": 900})
        perflog.append("page", {"kind": "event", "event": "open", "host": "x.com"})
        today = date.today().isoformat()
        line = json.loads((perflog.perf_dir() / f"app-{today}.jsonl").read_text().splitlines()[0])
        self.assertEqual((line["kind"], line["total_mb"]), ("sample", 900))
        self.assertIn("t", line)
        self.assertTrue((perflog.perf_dir() / f"page-{today}.jsonl").exists())

    def test_nothing_is_written_when_disabled(self):
        perflog.configure(False)
        self.assertFalse(perflog.append("app", {"kind": "sample"}))
        self.assertEqual(perflog.usage()["files"], 0)

    def test_usage_reports_the_size(self):
        perflog.append("server", {"kind": "event"})
        u = perflog.usage()
        self.assertEqual((u["enabled"], u["files"]), (True, 1))
        self.assertGreater(u["bytes"], 0)

    def test_unknown_source_and_huge_lines_are_refused(self):
        with self.assertRaises(ValueError):
            perflog.append("../config", {"a": 1})
        with self.assertRaises(ValueError):
            perflog.append("app", {"x": "y" * 20000})
        with self.assertRaises(ValueError):
            perflog.append("app", ["pas", "un", "objet"])

    def test_old_files_are_pruned_and_only_ours(self):
        d = perflog.perf_dir()
        d.mkdir(parents=True, exist_ok=True)
        old = (date.today() - timedelta(days=perflog.KEEP_DAYS + 1)).isoformat()
        (d / f"server-{old}.jsonl").write_text("{}\n")
        (d / "notes.txt").write_text("à garder")
        perflog.append("server", {"kind": "event"})
        self.assertEqual(perflog.prune(), 1)
        self.assertTrue((d / "notes.txt").exists())

    def test_routes_are_counted_without_their_values(self):
        perflog.hit("GET", "/api/github/user/ada")
        perflog.hit("GET", "/api/github/user/bob")
        perflog.hit("GET", "/api/local?x=1")
        perflog.scanned("local")
        record, _ = perflog.sample({"calls": 10, "hits": 8}, (time.time() - 300, time.process_time(), {"calls": 4, "hits": 4}))
        self.assertEqual(record["requests"], {"GET /api/github/user/*": 2, "GET /api/local": 1})
        self.assertEqual((record["github_calls"], record["github_304"], record["local_scans"]), (6, 4, 1))


if __name__ == "__main__":
    unittest.main()
