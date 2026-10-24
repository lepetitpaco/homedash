"""Résumé du journal de performance (Réglages → Aide, scripts/perf-report.py)."""

import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

from tests import _path  # noqa: F401  (backend/ dans sys.path)

import perfreport


class PerfReportTest(unittest.TestCase):
    def test_day_summary_and_text(self):
        day = date.today().isoformat()
        with tempfile.TemporaryDirectory() as d:
            w = lambda src, rows: Path(d, f"{src}-{day}.jsonl").write_text("\n".join(json.dumps(r) for r in rows) + "\n{coupé")
            w("server", [{"kind": "sample", "rss_mb": 100, "cpu_pct": 2, "github_calls": 5, "github_304": 40,
                          "ops": {"local": {"n": 2, "avg_s": 1.0, "max_s": 3.0}}},
                         {"kind": "slow", "t": f"{day}T10:02:00", "op": "basecamp", "took_s": 13.4},
                         # ancien journal : une veille notée comme lenteur ; nouveau : ligne « asleep »
                         {"kind": "slow", "t": f"{day}T16:32:00", "op": "github", "took_s": 549.0},
                         {"kind": "asleep", "t": f"{day}T17:00:00", "op": "local", "took_s": 548.6}])
            w("app", [{"kind": "sample", "total_mb": 2000, "cpu": 4, "page_mb": 120,
                       "tabs": [{"tab": "gChat", "mb": 300, "cpu": 1}, {"tab": "Youtube", "mb": 460, "cpu": 0}]},
                      {"kind": "sample", "total_mb": 2200, "cpu": 6, "page_mb": 120,
                       "tabs": [{"tab": "gChat", "mb": 500, "cpu": 2}]}])
            w("page", [{"kind": "event", "event": "load", "tab": "gChat", "ms": 600}])
            r = perfreport.report(d, 1)
        self.assertEqual(len(r), 1)
        app = r[0]["app"]
        self.assertEqual(app["mem_mb"], 2100)
        # gChat présent toute la journée passe devant YouTube, ouvert une fois
        self.assertEqual([t["tab"] for t in app["tabs"]], ["gChat", "Youtube"])
        self.assertEqual(app["tabs"][0]["peak_mb"], 500)
        self.assertEqual(app["tabs"][0]["load_s"], 0.6)
        self.assertEqual([o["op"] for o in r[0]["server"]["slow"]], ["basecamp"])
        self.assertEqual([o["op"] for o in r[0]["server"]["asleep"]], ["github", "local"])
        text = perfreport.text(r)
        self.assertIn("5 appels, plus 40", text)
        self.assertIn("lent à 10:02 : basecamp 13.4 s", text)
        self.assertIn("mis à part (machine en veille ?) : github à 16:32, local à 17:00", text)


if __name__ == "__main__":
    unittest.main()
