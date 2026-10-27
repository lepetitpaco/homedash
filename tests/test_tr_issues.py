"""Issues GitHub liées à une carte Trello. Le scan Basecamp n'est pas modifié."""

import io
import json
import unittest
from unittest import mock

from tests import _path  # noqa: F401

import accounts

CARD = "https://trello.com/c/sl1"
TASK = "https://3.basecamp.com/123/buckets/456/todos/789"


def issue(number, body, **extra):
    return {"number": number, "title": f"issue {number}", "body": body, "comments": 0,
            "html_url": f"https://github.com/org/api/issues/{number}", "state": "open",
            "updated_at": "2026-10-21T10:00:00Z", **extra}


def comment(cid, body):
    return {"id": cid, "body": body, "user": {"login": "moi"},
            "html_url": f"https://github.com/org/api/issues/1#c{cid}",
            "created_at": "2026-10-22T10:00:00Z"}


class FetchTest(unittest.TestCase):
    def setUp(self):
        self.gh = accounts._load_module("tr-fetch")
        self.gh.configure({"me": "moi", "repos": ["org/api"]})
        issues = [
            issue(1, f"Carte\n<!-- homedash:tr {CARD} -->", comments=1),
            issue(2, f"<!-- homedash:bc {TASK} -->"),
            issue(3, f"<!-- homedash:tr {CARD} -->", pull_request={"url": "…"}),
        ]
        comments = [comment(11, "<!-- homedash:tr-report -->\nC'est fait.")]

        def fake_gh(path, token, params=None, cache=True, accept=None):
            return comments if path.endswith("/comments") else issues
        self.gh.gh = fake_gh

    def test_only_trello_issues_and_basecamp_list_stays_separate(self):
        [got] = self.gh.fetch_tr_issues("t")
        self.assertEqual((got["number"], got["tr_url"], got["report"]["body"]), (1, CARD, "C'est fait."))
        self.gh._data["issues"] = [{"repo": "org/api", "number": 2, "bc_url": TASK}]
        self.assertEqual(self.gh.bc_issues()["issues"][0]["bc_url"], TASK)
        self.gh._data["tr_issues"] = [got]
        self.assertEqual(self.gh.tr_issues()["issues"][0]["tr_url"], CARD)
        self.assertNotIn("tr_url", self.gh.bc_issues()["issues"][0])


class ReportEventTest(unittest.TestCase):
    def setUp(self):
        self.gh = accounts._load_module("tr-event")

    def test_trello_report_does_not_ring_as_basecamp(self):
        item = {"repo": "org/api", "number": 1, "title": "t", "url": "u", "report": None}
        evs = self.gh._diff(
            {"issues": [], "tr_issues": []},
            {"issues": [], "tr_issues": [dict(item, report={"id": 5})]},
            ("issues",))
        self.assertEqual([(e["kind"], e["source"]) for e in evs], [("tr-report", "trello")])
        bc = self.gh._diff(
            {"issues": [dict(item, bc_url=TASK)], "tr_issues": []},
            {"issues": [dict(item, bc_url=TASK, report={"id": 5})], "tr_issues": []},
            ("issues",))
        self.assertEqual([(e["kind"], e["source"]) for e in bc], [("bc-report", "basecamp")])


class CreateTest(unittest.TestCase):
    def setUp(self):
        self.gh = accounts._load_module("tr-create")
        self.gh.configure({"me": "moi", "repos": ["org/api"]})
        self.gh.apply_token("t", "ui")
        self.gh._data["issues"] = []
        self.gh._data["tr_issues"] = []

    def test_untracked_repo_is_refused_without_calling(self):
        with mock.patch("urllib.request.urlopen") as op:
            with self.assertRaises(ValueError):
                self.gh.create_issue("org/autre", "t", "b")
            op.assert_not_called()

    def test_trello_marker_lands_on_the_trello_list_only(self):
        def fake_open(req, timeout=None):
            return io.BytesIO(json.dumps({"number": 8, "html_url": "https://github.com/org/api/issues/8"}).encode())
        with mock.patch("urllib.request.urlopen", fake_open):
            self.gh.create_issue("org/api", "Titre", f"Besoin\n<!-- homedash:tr {CARD} -->")
        self.assertEqual(self.gh._data["issues"], [])
        [i] = self.gh._data["tr_issues"]
        self.assertEqual(i["tr_url"], CARD)
