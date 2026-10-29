"""Trello : jeton jamais servi, lecture seule, journal amorcé sans bruit."""

import json
import unittest
import urllib.error
import urllib.parse
import urllib.request
from unittest import mock

from tests import _path  # noqa: F401

import events
import store
import trello

KEY = "api-key-test"
TOKEN = "token-secret-test"


def card(i, closed=False, due="2026-10-20T12:00:00.000Z"):
    return {
        "id": f"id{i}", "name": f"Carte {i}", "shortLink": f"sl{i}",
        "shortUrl": f"https://trello.com/c/sl{i}", "closed": closed, "due": due,
        "dueComplete": False, "pos": i, "idBoard": "b1", "idList": "l1",
        "badges": {"comments": 2, "checkItems": 4, "checkItemsChecked": 1},
        "board": {"id": "b1", "name": "Sprint", "shortUrl": "https://trello.com/b/xx/sprint"},
        "list": {"id": "l1", "name": "En cours", "pos": 10},
    }


def notif(i, date="2026-10-20T08:00:00.000Z"):
    return {
        "id": f"n{i}", "unread": True, "type": "commentCard", "date": date,
        "data": {"text": "bonjour", "card": {"name": "Carte 1", "shortLink": "sl1",
                                              "shortUrl": "https://trello.com/c/sl1"},
                 "board": {"name": "Sprint"}},
        "memberCreator": {"fullName": "Bob"},
        "display": {"translation": "Bob a commenté Carte 1"},
    }


class Resp:
    def __init__(self, code, body, headers=None):
        self.status = code
        self._body = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.headers = {k.lower(): v for k, v in (headers or {"content-type": "application/json"}).items()}

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self, n=-1):
        if n is None or n < 0:
            return self._body
        return self._body[:n]


class Fake:
    def __init__(self):
        self.requests = []
        self.member = {"fullName": "Ada L", "username": "ada"}
        self.member_code = 200
        self.cards = [card(1), card(2, closed=True)]
        self.cards_code = 200
        self.board_cards = None
        self.boards = [{
            "id": "b1", "name": "Sprint", "shortUrl": "https://trello.com/b/xx/sprint",
            "lists": [{"id": "l1", "name": "En cours", "pos": 10}],
        }]
        self.notifs = [notif(1)]
        self.notifs_code = 200
        self.search_body = {"cards": [], "actions": [], "boards": []}
        self.search_code = 200
        self.card_body = {}
        self.comment_body = {"id": "c1", "data": {"card": {"shortUrl": "https://trello.com/c/sl1"}}}
        self.files = {}

    def __call__(self, req):
        self.requests.append(req)
        url = req.full_url
        if url in self.files:
            ctype, data = self.files[url]
            return Resp(200, data, {"content-type": ctype})
        if "/members/me/boards" in url:
            return Resp(200, self.boards)
        if "/boards/" in url and "/cards/" not in url:
            board = dict(self.boards[0]) if self.boards else {"id": "b1", "name": "Sprint"}
            src = self.cards if self.board_cards is None else self.board_cards
            board["cards"] = [c for c in src if not c.get("closed")]
            return Resp(200, board)
        if "/members/me/cards" in url:
            return Resp(self.cards_code, self.cards, {"retry-after": "12"} if self.cards_code == 429 else None)
        if "/notifications" in url:
            return Resp(self.notifs_code, self.notifs)
        if "/members/me" in url:
            return Resp(self.member_code, self.member)
        if "/search?" in url:
            return Resp(self.search_code, self.search_body)
        if "/actions/comments" in url:
            return Resp(200, self.comment_body)
        if "/cards/" in url:
            return Resp(200, self.card_body)
        return Resp(404, {})


class AuthTest(unittest.TestCase):
    def setUp(self):
        store.write_secret(trello.SECRET_KEY, None)
        trello._reset()
        trello.set_enabled(True)
        trello._state["building"] = False
        self.fake = Fake()
        self._patch = mock.patch.object(trello, "_open", self.fake)
        self._patch.start()

    def tearDown(self):
        self._patch.stop()
        store.write_secret(trello.SECRET_KEY, None)

    def test_status_hides_key_and_token(self):
        trello.set_key(KEY)
        trello.connect(TOKEN)
        st = trello.status()
        blob = json.dumps(st)
        self.assertTrue(st["connected"])
        self.assertEqual(st["name"], "Ada L")
        self.assertNotIn("api_key", st)
        self.assertNotIn("token", st)
        self.assertNotIn(KEY, blob)
        self.assertNotIn(TOKEN, blob)
        req = self.fake.requests[-1]
        self.assertNotIn("token=", req.full_url)
        self.assertNotIn(TOKEN, req.full_url)
        self.assertIn("OAuth", req.get_header("Authorization"))

    def test_authorize_is_read_write_forever_without_account(self):
        trello.set_key(KEY)
        url = trello.authorize_url()
        q = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
        self.assertEqual(q["scope"], ["read,write"])
        self.assertEqual(q["expiration"], ["never"])
        self.assertEqual(q["response_type"], ["token"])
        self.assertNotIn("return_url", q)
        self.assertNotIn("account", q["scope"][0])

    def test_rejected_token_is_not_stored(self):
        trello.set_key(KEY)
        self.fake.member_code = 401
        with self.assertRaises(ValueError):
            trello.connect(TOKEN)
        self.assertFalse(trello.connected())
        self.assertNotIn(TOKEN, json.dumps(store.read_secret(trello.SECRET_KEY)))

    def test_forget_clears_the_secret(self):
        trello.set_key(KEY)
        trello.connect(TOKEN)
        trello.forget()
        self.assertFalse(trello.configured())
        self.assertFalse(store.read_secret(trello.SECRET_KEY))

    def test_disconnect_keeps_the_key(self):
        trello.set_key(KEY)
        trello.connect(TOKEN)
        trello.disconnect()
        self.assertTrue(trello.configured())
        self.assertFalse(trello.connected())

    def test_empty_key_keeps_the_current_and_a_new_one_drops_the_token(self):
        trello.set_key(KEY)
        trello.connect(TOKEN)
        trello.set_key("  ")
        self.assertTrue(trello.connected())
        self.assertEqual(store.read_secret(trello.SECRET_KEY)["api_key"], KEY)
        trello.set_key("autre-cle")
        secret = store.read_secret(trello.SECRET_KEY)
        self.assertEqual(secret["api_key"], "autre-cle")
        self.assertNotIn("token", secret)
        self.assertFalse(trello.connected())


class ReadTest(unittest.TestCase):
    def setUp(self):
        events.clear()
        store.write_secret(trello.SECRET_KEY, {
            "api_key": KEY, "token": TOKEN, "name": "Ada", "username": "ada"})
        trello._reset()
        trello.set_enabled(True)
        trello._state["building"] = False
        self.fake = Fake()
        self._patch = mock.patch.object(trello, "_open", self.fake)
        self._patch.start()

    def tearDown(self):
        self._patch.stop()

    def test_completed_due_stays_on_the_open_list(self):
        raw = card(1)
        raw["dueComplete"] = True
        got = trello.normalize_cards([raw])
        self.assertEqual(len(got), 1)
        self.assertTrue(got[0]["due_complete"])
        self.assertEqual(got[0]["due"], raw["due"])

    def test_switched_off_reads_nothing_and_keeps_the_token(self):
        trello.set_enabled(False)
        self.assertFalse(trello.kickoff())
        self.assertEqual(trello.search("bonjour"), [])
        self.assertEqual(trello.search("x"), [])
        body = trello.payload()
        self.assertEqual(body["cards"], [])
        self.assertEqual(body["unreads"], [])
        self.assertFalse(body["enabled"])
        self.assertFalse(body["configured"])
        self.assertTrue(trello.connected())
        self.assertEqual(self.fake.requests, [])

    def test_board_and_list_names_come_from_the_catalogue(self):
        raw = card(1)
        raw.pop("board")
        raw.pop("list")
        got = trello.normalize_cards([raw], self.fake.boards)
        self.assertEqual(got[0]["board"], "Sprint")
        self.assertEqual(got[0]["list"], "En cours")
        self.assertEqual(got[0]["list_pos"], 10)

    def test_board_background_stays_on_trello_backgrounds(self):
        detail = {
            "id": "b1", "name": "Sprint", "shortUrl": "https://trello.com/b/xx/sprint",
            "lists": [], "cards": [],
            "prefs": {
                "backgroundImage": "https://evil.example/a.jpg",
                "backgroundBrightness": "dark",
                "permissionLevel": "private",
            },
        }
        board, _ = trello._board_view(detail, set())
        self.assertEqual(board["background"], "")
        self.assertNotIn("evil.example", json.dumps(board))
        self.assertEqual(board["background_brightness"], "dark")
        detail["prefs"]["backgroundImage"] = "http://trello-backgrounds.s3.amazonaws.com/a.jpg"
        board, _ = trello._board_view(detail, set())
        self.assertEqual(board["background"], "")
        detail["prefs"]["backgroundImage"] = "https://trello-backgrounds.s3.amazonaws.com/a.jpg"
        board, _ = trello._board_view(detail, set())
        self.assertEqual(board["background"], detail["prefs"]["backgroundImage"])
        detail["prefs"]["backgroundImage"] = 'https://trello-backgrounds.s3.amazonaws.com/a.jpg");background:url(https://evil.example/x)'
        board, _ = trello._board_view(detail, set())
        self.assertEqual(board["background"], "")
        detail["prefs"]["backgroundImage"] = "https://user:secret@trello-backgrounds.s3.amazonaws.com/a.jpg"
        board, _ = trello._board_view(detail, set())
        self.assertEqual(board["background"], "")
        self.assertNotIn("secret", json.dumps(board))
        detail["prefs"]["backgroundImage"] = "https://trello-backgrounds.s3.amazonaws.com.evil.example/a.jpg"
        board, _ = trello._board_view(detail, set())
        self.assertEqual(board["background"], "")
        detail["prefs"]["backgroundBrightness"] = "neon"
        detail["prefs"]["backgroundImage"] = "https://trello-backgrounds.s3.amazonaws.com/a.jpg"
        board, _ = trello._board_view(detail, set())
        self.assertEqual(board["background"], "https://trello-backgrounds.s3.amazonaws.com/a.jpg")
        self.assertEqual(board["background_brightness"], "")
        board, _ = trello._board_view({"id": "b1", "name": "Sprint", "lists": [], "cards": []}, set())
        self.assertEqual(board["background"], "")
        self.assertEqual(board["background_brightness"], "")

    def test_a_board_shows_every_visible_card_and_not_an_archived_list(self):
        other = card(4)
        archived = card(6)
        archived["idList"] = "l-old"
        archived["list"] = {"id": "l-old", "name": "Audio", "pos": 99}
        self.fake.board_cards = [card(1), other]
        self.fake.cards = [card(1), archived]
        self.fake.boards[0]["lists"].append({"id": "l2", "name": "Vide", "pos": 20, "closed": False})
        trello.rebuild()
        body = trello.payload()
        got = {c["short_link"]: c for c in body["cards"]}
        self.assertEqual(set(got), {"sl1", "sl4", "sl6"})
        self.assertTrue(got["sl1"]["mine"])
        self.assertFalse(got["sl4"]["mine"])
        self.assertTrue(got["sl6"]["mine"])
        lists = body["boards"][0]["lists"]
        self.assertEqual([l["id"] for l in lists], ["l1", "l2"])
        self.assertNotIn("l-old", [l["id"] for l in lists])

    def test_someone_elses_new_card_stays_quiet_until_it_is_yours(self):
        self.fake.board_cards = [card(1), card(4)]
        self.fake.cards = [card(1)]
        self.fake.notifs = []
        trello.rebuild()
        self.fake.board_cards = [card(1), card(4), card(5)]
        trello.rebuild()
        self.assertEqual(events.payload()["events"], [])
        self.fake.cards = [card(1), card(4)]
        trello.rebuild()
        kinds = [e["kind"] for e in events.payload()["events"]]
        self.assertEqual(kinds, ["tr-task"])

    def test_closed_card_is_dropped_and_board_kept(self):
        got = trello.normalize_cards(self.fake.cards)
        self.assertEqual([c["short_link"] for c in got], ["sl1"])
        self.assertEqual(got[0]["board"], "Sprint")
        self.assertEqual(got[0]["list"], "En cours")
        self.assertEqual(got[0]["comments"], 2)
        self.assertEqual(got[0]["checks_done"], 1)

    def test_first_read_is_silent_and_methods_are_gets(self):
        trello.rebuild()
        self.assertEqual(events.payload()["events"], [])
        self.assertTrue(self.fake.requests)
        self.assertTrue(all(r.get_method() == "GET" for r in self.fake.requests))
        self.assertEqual(len(trello.payload()["cards"]), 1)

    def test_second_read_announces_only_the_new_card_and_notif(self):
        trello.rebuild()
        self.fake.cards = [card(1), card(3)]
        self.fake.notifs = [notif(1), notif(2, "2026-10-21T09:00:00.000Z")]
        trello.rebuild()
        kinds = [e["kind"] for e in events.payload()["events"]]
        self.assertCountEqual(kinds, ["tr-task", "tr-notif"])
        self.assertTrue(all(e["source"] == "trello" for e in events.payload()["events"]))
        # même notif, même date : rien de plus
        before = len(events.payload()["events"])
        trello.rebuild()
        self.assertEqual(len(events.payload()["events"]), before)

    def test_rate_limit_does_not_retry_immediately(self):
        self.fake.cards_code = 429
        trello.rebuild()
        self.assertEqual(len(self.fake.requests), 1)
        self.assertIn("limite", trello.status()["error"])

    def test_kickoff_skips_while_a_read_runs(self):
        trello._state["building"] = True
        self.assertFalse(trello.kickoff())
        self.assertEqual(self.fake.requests, [])

    def test_search_is_cached_and_skipped_when_disconnected(self):
        self.fake.search_body = {"cards": [card(9)], "actions": [], "boards": []}
        trello.search("bonjour")
        trello.search("Bonjour")
        self.assertEqual(len(self.fake.requests), 1)
        trello.disconnect()
        trello.search("bonjour")
        self.assertEqual(len(self.fake.requests), 1)

    def test_search_429_is_a_single_call(self):
        self.fake.search_code = 429
        with self.assertRaises(RuntimeError):
            trello.search("bonjour")
        self.assertEqual(len(self.fake.requests), 1)

    def test_foreign_image_is_not_fetched(self):
        before = len(self.fake.requests)
        with self.assertRaises(ValueError):
            trello.attachment("https://evil.example/a.png")
        self.assertEqual(len(self.fake.requests), before)
        self.fake.card_body = {
            "desc": "voir",
            "checklists": [{"name": "Étapes", "checkItems": [{"name": "un", "state": "complete"}]}],
            "actions": [{"id": "a1", "type": "commentCard", "date": "2026-10-20T10:00:00.000Z",
                         "memberCreator": {"fullName": "Bob"}, "data": {"text": "ok"}}],
            "attachments": [
                {"name": "a.png", "url": "https://trello.com/1/cards/sl1/a.png", "mimeType": "image/png"},
                {"name": "a.svg", "url": "https://trello.com/1/cards/sl1/a.svg", "mimeType": "image/svg+xml"},
                {"name": "ext.png", "url": "https://evil.example/a.png", "mimeType": "image/png"},
            ],
        }
        got = trello.card_text("https://trello.com/c/sl1")
        self.assertEqual(got["text"], "voir")
        self.assertTrue(got["checklists"][0]["items"][0]["completed"])
        self.assertEqual(got["comments"][0]["who"], "Bob")
        self.assertEqual(list(got["images"]), ["a.png"])
        with self.assertRaises(ValueError):
            trello.attachment("https://trello.com/1/cards/sl1/a.svg")
        before = len(self.fake.requests)
        with self.assertRaises(ValueError):
            trello.attachment("https://evil.example/a.png")
        self.assertEqual(len(self.fake.requests), before)
        self.fake.files["https://trello.com/1/cards/sl1/a.png"] = ("image/png", b"x" * (trello.ATTACH_MAX + 2))
        with self.assertRaises(RuntimeError):
            trello.attachment("https://trello.com/1/cards/sl1/a.png")

    def test_redirect_off_trello_is_refused(self):
        req = urllib.request.Request("https://api.trello.com/1/members/me")
        with self.assertRaises(urllib.error.HTTPError):
            trello._StayOnTrello().redirect_request(
                req, None, 302, "found", {}, "https://evil.example/steal")


class ReportTest(unittest.TestCase):
    def setUp(self):
        store.write_secret(trello.SECRET_KEY, {"api_key": KEY, "token": TOKEN, "username": "ada"})
        store.write(store.TR_POSTED, {})
        trello._reset()
        trello.set_enabled(True)
        self.fake = Fake()
        self._patch = mock.patch.object(trello, "_open", self.fake)
        self._patch.start()
        self.issue = {
            "repo": "org/api", "number": 4, "url": "https://github.com/org/api/issues/4",
            "tr_url": "https://trello.com/c/sl1", "report": {"id": 9, "body": "Fait"},
        }

    def tearDown(self):
        self._patch.stop()

    def _posts(self):
        return [r for r in self.fake.requests if r.get_method() == "POST"]

    def test_publish_once_and_dismiss_sends_nothing(self):
        trello.publish_report(self.issue)
        again = trello.publish_report(self.issue)
        self.assertEqual(len(self._posts()), 1)
        post = self._posts()[0]
        self.assertIn("/cards/sl1/actions/comments", post.full_url)
        self.assertNotIn("token=", post.full_url)
        self.assertLessEqual(len(urllib.parse.parse_qs(post.data.decode())["text"][0]), trello.COMMENT_MAX)
        self.assertEqual(again.get("url"), "https://trello.com/c/sl1")
        n = len(self.fake.requests)
        trello.dismiss({"repo": "org/api", "number": 8})
        self.assertEqual(len(self._posts()), 1)
        self.assertEqual(len(self.fake.requests), n)

    def test_long_report_is_cut(self):
        self.issue["report"]["body"] = "x" * 20000
        trello.publish_report(self.issue)
        text = urllib.parse.parse_qs(self._posts()[0].data.decode())["text"][0]
        self.assertLessEqual(len(text), trello.COMMENT_MAX)

    def test_dismiss_can_be_undone_without_a_post(self):
        trello.dismiss(self.issue)
        self.assertTrue(trello.posted()["org/api#4"]["dismissed"])
        n = len(self.fake.requests)
        done = trello.dismiss(self.issue, undo=True)
        self.assertNotIn("org/api#4", done)
        self.assertEqual(len(self.fake.requests), n)
        self.assertEqual(self._posts(), [])

    def test_bad_card_url_is_refused_without_post(self):
        self.issue["tr_url"] = "https://evil.example/c/sl1"
        with self.assertRaises(ValueError):
            trello.publish_report(self.issue)
        self.assertEqual(self._posts(), [])


if __name__ == "__main__":
    unittest.main()
