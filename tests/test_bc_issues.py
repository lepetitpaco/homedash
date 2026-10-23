"""Issues GitHub liées à une tâche Basecamp : marqueurs, rapport, création.

Aucun appel réseau : `gh` est remplacé par un faux qui répond selon le chemin
et note chaque appel.
"""

import io
import json
import unittest
import urllib.error
from unittest import mock

from tests import _path

import accounts

TASK = "https://3.basecamp.com/123/buckets/456/todos/789"


def issue(number, body, **extra):
    return {"number": number, "title": f"issue {number}", "body": body, "comments": 0,
            "html_url": f"https://github.com/org/api/issues/{number}", "state": "open",
            "updated_at": f"2026-10-2{number}T10:00:00Z", **extra}


def comment(cid, body, html=""):
    return {"id": cid, "body": body, "body_html": html, "user": {"login": "moi"},
            "html_url": f"https://github.com/org/api/issues/1#c{cid}",
            "created_at": "2026-10-22T10:00:00Z"}


class ReportTest(unittest.TestCase):

    def setUp(self):
        self.gh = accounts._load_module("bc-report")

    def test_last_marked_comment_wins_and_marker_is_stripped(self):
        r = self.gh.bc_report([
            comment(1, "<!-- homedash:bc-report -->\nancien"),
            comment(2, "<!-- homedash:bc-report -->\n**Fait** : tout",
                    "<!-- homedash:bc-report -->\n<p><strong>Fait</strong> : tout</p>"),
            comment(3, "merci !"),
        ])
        self.assertEqual(r["id"], 2)
        self.assertEqual(r["body"], "**Fait** : tout")
        self.assertEqual(r["html"], "<p><strong>Fait</strong> : tout</p>")

    def test_marker_must_open_the_comment(self):
        self.assertIsNone(self.gh.bc_report([comment(1, "voir <!-- homedash:bc-report --> plus bas")]))
        self.assertIsNone(self.gh.bc_report([]))


class FetchTest(unittest.TestCase):

    def setUp(self):
        self.gh = accounts._load_module("bc-fetch")
        self.gh.configure({"me": "moi", "repos": ["org/api"]})
        self.calls = []
        issues = [
            issue(1, f"Tâche\n<!-- homedash:bc {TASK} -->", comments=2),
            issue(2, "sans lien"),
            issue(3, f"<!-- homedash:bc {TASK} -->", pull_request={"url": "…"}),
        ]
        comments = [comment(10, "ok"), comment(11, "<!-- homedash:bc-report -->\nC'est fait.")]

        def fake_gh(path, token, params=None, cache=True, accept=None):
            self.calls.append((path, accept))
            return comments if path.endswith("/comments") else issues
        self.gh.gh = fake_gh

    def test_only_linked_issues_with_their_report(self):
        [got] = self.gh.fetch_bc_issues("t")
        self.assertEqual((got["repo"], got["number"], got["bc_url"]), ("org/api", 1, TASK))
        self.assertEqual(got["report"]["body"], "C'est fait.")
        # commentaires lus seulement pour l'issue liée, au format qui donne le HTML
        self.assertEqual([c for c in self.calls if c[0].endswith("/comments")],
                         [("/repos/org/api/issues/1/comments", "application/vnd.github.full+json")])

    def test_payload_lists_repos_with_owner(self):
        self.gh._data["issues"] = []
        self.assertEqual(self.gh.bc_issues(), {"issues": [], "repos": ["org/api"]})


class ReportEventTest(unittest.TestCase):
    """Un rapport qui apparaît (ou change) sur une issue liée sonne la cloche."""

    def setUp(self):
        self.gh = accounts._load_module("bc-event")

    def item(self, rid=None):
        return {"repo": "org/api", "number": 1, "title": "t", "url": "u",
                "report": {"id": rid} if rid else None}

    def events(self, before, after):
        return self.gh._diff({"issues": before}, {"issues": after}, ("issues",))

    def test_new_report_rings_once(self):
        [ev] = self.events([self.item()], [self.item(5)])
        self.assertEqual((ev["kind"], ev["source"]), ("bc-report", "basecamp"))
        self.assertEqual(self.events([self.item(5)], [self.item(5)]), [])

    def test_new_issue_with_report_and_replaced_report_ring(self):
        self.assertEqual(len(self.events([], [self.item(5)])), 1)
        self.assertEqual(len(self.events([self.item(5)], [self.item(6)])), 1)


class CreateTest(unittest.TestCase):
    """`create_issue` : seule écriture vers GitHub, limitée aux repos suivis."""

    def setUp(self):
        self.gh = accounts._load_module("bc-create")
        self.gh.configure({"me": "moi", "repos": ["org/api"]})
        self.gh.apply_token("t", "ui")

    def test_posts_to_the_tracked_repo(self):
        sent = []

        def fake_open(req, timeout=None):
            sent.append(req)
            return io.BytesIO(json.dumps({"number": 7, "html_url": "https://github.com/org/api/issues/7"}).encode())
        with mock.patch("urllib.request.urlopen", fake_open):
            got = self.gh.create_issue("org/api", "Titre", "Corps")
        self.assertEqual(got, {"number": 7, "url": "https://github.com/org/api/issues/7"})
        [req] = sent
        self.assertEqual((req.method, req.full_url), ("POST", "https://api.github.com/repos/org/api/issues"))
        self.assertEqual(json.loads(req.data), {"title": "Titre", "body": "Corps"})

    def test_linked_issue_shows_at_once(self):
        self.gh._data["issues"] = []

        def fake_open(req, timeout=None):
            return io.BytesIO(json.dumps({"number": 8, "html_url": "https://github.com/org/api/issues/8"}).encode())
        with mock.patch("urllib.request.urlopen", fake_open):
            self.gh.create_issue("org/api", "Titre", f"Besoin\n<!-- homedash:bc {TASK} -->")
        [i] = self.gh._data["issues"]
        self.assertEqual((i["repo"], i["number"], i["bc_url"], i["report"]), ("org/api", 8, TASK, None))

    def test_untracked_or_foreign_repo_is_refused_without_calling(self):
        with mock.patch("urllib.request.urlopen") as op:
            for repo in ("org/autre", "pirate/api", "api", ""):
                with self.assertRaises(ValueError):
                    self.gh.create_issue(repo, "t", "b")
            op.assert_not_called()

    def test_read_only_token_says_so(self):
        err = urllib.error.HTTPError("u", 403, "Forbidden", {}, io.BytesIO(b"{}"))
        with mock.patch("urllib.request.urlopen", side_effect=err):
            with self.assertRaises(self.gh.CannotWrite):
                self.gh.create_issue("org/api", "t", "b")


if __name__ == "__main__":
    unittest.main()
