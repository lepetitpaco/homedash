"""Basecamp : lecture seule, secrets jamais servis, journal amorcé sans bruit."""

import io
import json
import unittest
import urllib.error
import urllib.parse
from pathlib import Path
from unittest import mock

from tests import _path  # noqa: F401  (DATA_DIR temporaire avant tout import du backend)

import basecamp
import events
import store

HREF = "https://3.basecampapi.com/123"

IDENTITY = {
    "identity": {"first_name": "Ada", "last_name": "L"},
    "accounts": [
        {"product": "bcx", "id": 1, "name": "Ancien", "href": "https://basecamp.com/1"},
        {"product": "bc3", "id": 123, "name": "Ma boîte", "href": HREF,
         "app_href": "https://3.basecamp.com/123"},
    ],
}


def task(i, title="Tâche"):
    return {"id": i, "content": title, "app_url": f"https://3.basecamp.com/123/todos/{i}",
            "bucket": {"name": "Projet", "app_url": "https://3.basecamp.com/123/buckets/9"},
            "parent": {"title": "Liste", "app_url": "https://3.basecamp.com/123/todolists/8"},
            "due_on": "2026-10-20", "children": []}


def notif(i, updated="2026-10-20T08:00:00Z"):
    return {"id": i, "title": f"Message {i}", "app_url": f"https://3.basecamp.com/123/m/{i}",
            "bucket_name": "Projet", "section": "inbox", "creator": {"name": "Bob"},
            "content_excerpt": "Bonjour", "unread_count": 1, "updated_at": updated,
            "readable_sgid": "sgid-secret-ish"}


def card(i, column=55):
    return {"id": i, "content": f"Carte {i}", "type": "Kanban::Card",
            "app_url": f"https://3.basecamp.com/123/buckets/9/card_tables/cards/{i}",
            "bucket": {"id": 9, "name": "Projet"},
            "parent": {"title": "En cours",
                       "app_url": f"https://3.basecamp.com/123/buckets/9/card_tables/columns/{column}"},
            "children": []}


BOARD = {"id": 77, "title": "Sprint", "app_url": "https://3.basecamp.com/123/buckets/9/card_tables/77",
         "lists": [{"id": 54, "title": "À faire", "type": "Kanban::Column"},
                   {"id": 55, "title": "En cours", "type": "Kanban::Column", "color": "blue"},
                   {"id": 56, "title": "Fait", "type": "Kanban::DoneColumn"}]}


class Fake:
    """Remplace le réseau : répond selon l'URL et garde chaque requête."""

    def __init__(self):
        self.requests = []
        self.assignments = {"priorities": [task(1)], "non_priorities": [task(2)]}
        self.readings = {"unreads": [notif(10)], "reads": []}
        self.status = {}

    def __call__(self, req):
        url = req.full_url
        self.requests.append((req.get_method(), url, req.data))
        code = self.status.get(urllib.parse.urlsplit(url).path)
        if code:
            raise urllib.error.HTTPError(url, code, "x", {}, io.BytesIO(b""))
        if url == basecamp.TOKEN_URL:
            body = {"access_token": "AT-" + str(len(self.requests)), "refresh_token": "RT",
                    "expires_in": 1209600}
        elif url == basecamp.IDENTITY_URL:
            body = IDENTITY
        elif url.endswith(basecamp.ASSIGNMENTS):
            body = self.assignments
        elif url.endswith(basecamp.READINGS):
            body = self.readings
        elif "/card_tables/columns/" in url:
            body = {"id": 55, "parent": {"url": f"{HREF}/card_tables/77.json"}}
        elif url.endswith("/card_tables/77.json"):
            body = BOARD
        elif url.endswith("/buckets/9/todos/2.json"):
            body = {"id": 2, "title": "Tâche 2", "comments_count": 1,
                    "description": "<div>Refaire la <strong>page</strong> :<ul><li>logo</li><li>"
                                   "<a href=\"https://x.fr\">lien</a></li></ul></div>"}
        elif req.get_method() == "POST" and url.endswith("/buckets/9/recordings/5/comments.json"):
            body = {"id": 900, "app_url": "https://3.basecamp.com/123/buckets/9/card_tables/cards/5#__recording_900"}
        elif url.endswith("/buckets/9/recordings/2/comments.json"):
            body = [{"creator": {"name": "Flo"}, "created_at": "2026-10-22T09:00:00Z",
                     "content": "<div>Pour vendredi&nbsp;!</div>"}]
        else:
            raise AssertionError(f"URL inattendue : {url}")
        resp = mock.MagicMock()
        resp.__enter__.return_value = resp
        resp.read.return_value = json.dumps(body).encode()
        resp.headers = {}
        return resp


class BasecampTest(unittest.TestCase):

    def setUp(self):
        store.write_secret(basecamp.SECRET_KEY, None)
        basecamp._reset()
        self.net = Fake()
        patch = mock.patch.object(basecamp, "_open", self.net)
        patch.start()
        self.addCleanup(patch.stop)
        self.recorded = []
        rec = mock.patch.object(events, "record", side_effect=lambda items: self.recorded.extend(items))
        rec.start()
        self.addCleanup(rec.stop)

    def connect(self):
        basecamp.set_app("cid", "CSECRET", "http://localhost:7777/api/basecamp/callback")
        basecamp.exchange("CODE")

    def build(self):
        with basecamp._lock:
            basecamp._state["building"] = True
        basecamp.rebuild()

    # ── lecture seule ────────────────────────────────────────────────────────
    def test_basecamp_itself_only_ever_receives_get(self):
        self.net.assignments["non_priorities"].append(card(5))
        self.connect()
        self.build()
        self.build()
        # jeton proche de l'expiration : renouvellement compris dans le parcours
        s = store.read_secret(basecamp.SECRET_KEY)
        store.write_secret(basecamp.SECRET_KEY, {**s, "expires_at": 0})
        self.build()
        self.assertTrue(self.net.requests)
        for method, url, data in self.net.requests:
            if url == basecamp.TOKEN_URL:
                self.assertEqual(method, "POST")
                continue
            self.assertEqual(method, "GET", url)
            self.assertIsNone(data, url)
        read = {urllib.parse.urlsplit(u).path for m, u, _ in self.net.requests if u.startswith(HREF)}
        self.assertEqual(read, {"/123" + basecamp.ASSIGNMENTS, "/123" + basecamp.READINGS,
                                "/123/card_tables/columns/55.json", "/123/card_tables/77.json"})

    def test_no_write_helper_exists(self):
        src = Path(basecamp.__file__).read_text(encoding="utf-8")
        for verb in ('"PUT"', '"DELETE"', '"PATCH"', "/my/unreads", "/my/priorities", "completion"):
            self.assertNotIn(verb, src)

    # ── contenu d'une tâche (pré-remplissage d'une issue) ────────────────────
    def test_task_text_reads_description_and_comments_with_get_only(self):
        self.connect()
        before = len(self.net.requests)
        text = basecamp.task_text("https://3.basecamp.com/123/buckets/9/todos/2")
        self.assertIn("Refaire la **page** :", text)
        self.assertIn("- logo", text)
        self.assertIn("- [lien](https://x.fr)", text)
        self.assertIn("**Flo** (2026-10-22) :\nPour vendredi\xa0!", text)
        done = self.net.requests[before:]
        self.assertEqual({m for m, _, _ in done}, {"GET"})
        self.assertTrue(all(u.startswith(HREF) for _, u, _ in done))

    def test_task_text_refuses_anything_but_a_task_address(self):
        self.connect()
        before = len(self.net.requests)
        for url in ("https://evil.example/x", "", "https://3.basecamp.com/123/buckets/9/messages/2"):
            with self.assertRaises(ValueError):
                basecamp.task_text(url)
        self.assertEqual(len(self.net.requests), before)

    # ── rapport d'une issue publié sur la tâche (seule écriture) ─────────────
    ISSUE = {"repo": "org/api", "number": 7, "url": "https://github.com/org/api/issues/7",
             "bc_url": "https://3.basecamp.com/123/buckets/9/card_tables/cards/5",
             "report": {"id": 41, "body": "**Fait**",
                        "html": '<p class="x"><strong>Fait</strong> <a href="javascript:alert(1)">pi\u00e8ge</a>'
                                '<a href="https://ok.fr">lien</a></p><script>alert(1)</script>'
                                '<h2 onclick="x()">Suite</h2><pre><code>a &lt; b</code></pre>'}}

    def setUp_post(self):
        store.write(store.BC_POSTED, {})
        self.addCleanup(store.write, store.BC_POSTED, {})
        self.connect()
        return len(self.net.requests)

    def test_report_is_posted_once_on_the_task_comments(self):
        before = self.setUp_post()
        got = basecamp.publish_report(self.ISSUE)
        again = basecamp.publish_report(self.ISSUE)
        self.assertEqual(got, again)
        self.assertIn("#__recording_900", got["url"])
        [(method, url, data)] = self.net.requests[before:]
        self.assertEqual((method, url), ("POST", f"{HREF}/buckets/9/recordings/5/comments.json"))
        content = json.loads(data)["content"]
        self.assertTrue(content.startswith('<div><strong>Fait</strong> pi\u00e8ge<a href="https://ok.fr">lien</a></div>'))
        for bad in ("script", "javascript", "onclick", "class=", "alert"):
            self.assertNotIn(bad, content)
        # une ligne vide entre deux blocs, pas dans un bloc
        self.assertIn("lien</a></div><div><br></div><h1>Suite</h1><div><br></div><pre>a &lt; b</pre>", content)
        self.assertIn('<a href="https://github.com/org/api/issues/7">org/api #7</a>', content)
        self.assertEqual(basecamp.payload()["posted"]["41"]["url"], got["url"])

    def test_dismiss_sends_nothing_and_can_be_undone(self):
        before = self.setUp_post()
        self.assertEqual(basecamp.dismiss(self.ISSUE)["org/api#7"]["dismissed"], True)
        self.assertNotIn("org/api#7", basecamp.dismiss(self.ISSUE, undo=True))
        self.assertEqual(len(self.net.requests), before)

    def test_report_needs_a_task_address_and_a_report(self):
        before = self.setUp_post()
        with self.assertRaises(ValueError):
            basecamp.publish_report({**self.ISSUE, "bc_url": "https://evil.example/x"})
        with self.assertRaises(ValueError):
            basecamp.publish_report({**self.ISSUE, "report": None})
        self.assertEqual(len(self.net.requests), before)

    # ── kanban ───────────────────────────────────────────────────────────────
    def test_cards_get_their_board_and_columns_in_board_order(self):
        self.net.assignments["non_priorities"].append(card(5))
        self.connect()
        self.build()
        self.build()
        p = basecamp.payload()
        c = next(t for t in p["tasks"]["others"] if t["id"] == 5)
        self.assertEqual((c["kind"], c["column_id"], c["board_id"]), ("card", 55, 77))
        self.assertEqual([x["title"] for x in p["boards"]["77"]["columns"]], ["À faire", "En cours", "Fait"])
        todo = next(t for t in p["tasks"]["others"] if t["id"] == 2)
        self.assertEqual((todo["kind"], todo["column_id"]), ("todo", None))
        cols = [u for _, u, _ in self.net.requests if "/card_tables/columns/" in u]
        self.assertEqual(len(cols), 1, "colonne → tableau lu une seule fois")

    def test_unreadable_board_does_not_break_the_tasks(self):
        self.net.assignments["non_priorities"].append(card(5))
        self.net.status["/123/card_tables/77.json"] = 403
        self.connect()
        self.build()
        p = basecamp.payload()
        self.assertIsNone(p["error"])
        self.assertEqual(p["boards"], {})
        self.assertEqual(len(p["tasks"]["others"]), 2)

    # ── secrets ──────────────────────────────────────────────────────────────
    def test_secrets_never_leave_secrets_json(self):
        self.connect()
        self.build()
        out = json.dumps([basecamp.status(), basecamp.payload()])
        for secret in ("CSECRET", "AT-", "RT", "sgid-secret-ish"):
            self.assertNotIn(secret, out)
        self.assertEqual(basecamp.status()["account"], "Ma boîte")   # le compte bc3, pas bcx

    def test_empty_secret_keeps_the_previous_one(self):
        self.connect()
        basecamp.set_app("cid", "", "http://localhost:7777/api/basecamp/callback")
        s = store.read_secret(basecamp.SECRET_KEY)
        self.assertEqual(s["client_secret"], "CSECRET")
        self.assertTrue(s.get("access_token"), "même appli : la connexion reste")
        basecamp.set_app("cid", "", "https://monsite.fr/oauth")
        s = store.read_secret(basecamp.SECRET_KEY)
        self.assertEqual(s["redirect_uri"], "https://monsite.fr/oauth")
        self.assertTrue(s.get("access_token"), "changer de site de callback ne déconnecte pas")
        basecamp.set_app("autre", "", "http://localhost:7777/api/basecamp/callback")
        self.assertFalse(store.read_secret(basecamp.SECRET_KEY).get("access_token"))

    def test_disconnect_keeps_the_app(self):
        self.connect()
        basecamp.disconnect()
        st = basecamp.status()
        self.assertTrue(st["configured"])
        self.assertFalse(st["connected"])

    # ── OAuth ────────────────────────────────────────────────────────────────
    def test_state_is_single_use_and_required(self):
        basecamp.set_app("cid", "s", "http://localhost:7777/api/basecamp/callback")
        url = basecamp.authorize_url()
        state = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)["state"][0]
        self.assertFalse(basecamp.check_state("inventé"))
        self.assertTrue(basecamp.check_state(state))
        self.assertFalse(basecamp.check_state(state))

    def test_parse_code_accepts_the_whole_redirect_url(self):
        self.assertEqual(basecamp.parse_code("  abc "), ("abc", None))
        self.assertEqual(basecamp.parse_code("https://x.test/cb?code=abc&state=st"), ("abc", "st"))

    def test_expired_token_is_refreshed_once_on_401(self):
        self.connect()
        self.net.status["/123" + basecamp.ASSIGNMENTS] = 401
        self.build()
        self.assertIn("HTTP 401", basecamp.payload()["error"])
        posts = [u for m, u, _ in self.net.requests if m == "POST"]
        self.assertEqual(len(posts), 2)        # échange + un seul renouvellement

    def test_api_links_are_turned_into_site_links(self):
        boost = {**notif(13), "type": "BoostReport",
                 "app_url": "https://3.basecampapi.com/123/my/boosts"}
        self.assertEqual(basecamp.normalize_unreads({"unreads": [boost]})[0]["url"],
                         "https://app.basecamp.com/123/my/boosts")
        self.assertEqual(basecamp.web_url("https://3.basecampapi.com/123/buckets/9/todos/4.json",
                                          "https://3.basecamp.com"),
                         "https://3.basecamp.com/123/buckets/9/todos/4")
        site = "https://app.basecamp.com/123/m/1"
        self.assertEqual(basecamp.web_url(site), site)

    def test_api_links_follow_the_account_site(self):
        self.net.readings["unreads"].append({**notif(14), "app_url": "https://3.basecampapi.com/123/my/boosts"})
        self.connect()
        self.build()
        urls = [n["url"] for n in basecamp.payload()["unreads"]]
        self.assertIn("https://3.basecamp.com/123/my/boosts", urls)      # app_href du compte (IDENTITY)

    # ── journal ──────────────────────────────────────────────────────────────
    def test_first_read_is_silent_then_only_news_is_logged(self):
        self.connect()
        self.build()
        self.assertEqual(self.recorded, [])
        self.assertEqual(len(basecamp.payload()["tasks"]["priorities"]), 1)
        self.net.assignments["non_priorities"].append(task(3, "Nouvelle"))
        self.net.readings["unreads"].append(notif(11))
        self.build()
        kinds = sorted(e["kind"] for e in self.recorded)
        self.assertEqual(kinds, ["bc-notif", "bc-task"])
        self.assertTrue(all(e["source"] == "basecamp" for e in self.recorded))
        self.recorded.clear()
        self.build()
        self.assertEqual(self.recorded, [])

    def test_reconnecting_reseeds(self):
        self.connect()
        self.build()
        self.connect()
        self.net.readings["unreads"].append(notif(12))
        self.build()
        self.assertEqual(self.recorded, [])


if __name__ == "__main__":
    unittest.main()
