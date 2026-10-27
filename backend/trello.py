"""Trello — cartes assignées et notifications, en lecture seule.

Ce module lit Trello. Les GET passent par `_call()`. Les seules écritures :
obtenir rien chez Trello à la connexion (le jeton est collé, pas échangé), et
`publish_report()`, qui poste un commentaire sur une carte au clic. Rien ici ne
coche une carte, ne l'archive, ni ne marque une notification lue. Le scope
demandé est `read,write`, jamais `account` (celui qui permet de marquer lu).

Clé d'API et jeton vivent dans `data/secrets.json` (clé `trello`), jamais dans
config.json ni dans une réponse d'API. Les appels portent l'en-tête
Authorization, jamais `?token=`.
"""

import json
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

import events
import perflog
import store

API           = "https://api.trello.com/1"
AUTHORIZE_URL = "https://trello.com/1/authorize"
SECRET_KEY    = "trello"
EVERY         = 60
SCOPE         = "read,write"
COMMENT_MAX   = 16384
SEARCH_TTL    = 60
SEARCH_MAX    = 20
SAFE_IMAGES   = {"image/png", "image/jpeg", "image/gif", "image/webp"}
IMAGE_HOSTS   = {"trello.com", "www.trello.com", "api.trello.com"}
ATTACH_MAX    = 15 * 1024 * 1024

MEMBER = API + "/members/me?fields=fullName,username"
CARDS  = (API + "/members/me/cards?filter=open"
          "&fields=name,url,shortUrl,shortLink,due,dueComplete,closed,pos,idBoard,idList,badges"
          "&board=true&board_fields=name,shortUrl,url"
          "&list=true&list_fields=name,pos")
NOTIFS = (API + "/members/me/notifications?read_filter=unread&limit=50"
          "&memberCreator=true&display=true&memberCreator_fields=fullName")

_CARD_URL = re.compile(r"^https://trello\.com/c/([A-Za-z0-9]+)(?:/|$)")
_SHORT    = re.compile(r"^[A-Za-z0-9]+$")

_lock       = threading.Lock()
_post_lock  = threading.Lock()
_search_lock = threading.Lock()
_data       = {"cards": None, "unreads": None}
_state      = {"ts": 0.0, "building": False, "error": None, "retry_at": 0.0}
_seeded     = set()
_searches   = {}
_allowed    = {}          # url d'image lue sur une carte → type MIME annoncé
_on         = [True]


def _secret():
    v = store.read_secret(SECRET_KEY)
    return v if isinstance(v, dict) else {}

def _save_secret(value):
    store.write_secret(SECRET_KEY, value or None)

def configured():
    return bool(_secret().get("api_key"))

def connected():
    s = _secret()
    return bool(s.get("api_key") and s.get("token"))

def set_enabled(on):
    """Trello coupé : plus de lecture ni de recherche. La connexion est gardée."""
    _on[0] = bool(on)
    if not on:
        with _lock:
            _seeded.clear()

def active():
    return _on[0] and connected()

def _reset():
    with _lock:
        _data["cards"] = _data["unreads"] = None
        _state.update(ts=0.0, error=None, retry_at=0.0)
        _seeded.clear()
    with _search_lock:
        _searches.clear()
    _allowed.clear()


class _StayOnTrello(urllib.request.HTTPRedirectHandler):
    """Une redirection ne quitte pas les hôtes Trello : le jeton ne les suit pas."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if _trello_https(newurl):
            return super().redirect_request(req, fp, code, msg, headers, newurl)
        raise urllib.error.HTTPError(req.full_url, code, "redirection refusée", headers, fp)


_OPENER = urllib.request.build_opener(_StayOnTrello)


def _trello_https(url):
    try:
        parts = urllib.parse.urlparse(url or "")
    except ValueError:
        return False
    return parts.scheme == "https" and (parts.hostname or "").lower() in IMAGE_HOSTS


def _open(req):
    """Point de passage unique vers le réseau (remplacé dans les tests)."""
    return _OPENER.open(req, timeout=15)

def _oauth(key, token):
    def esc(v):
        return str(v).replace("\\", "\\\\").replace('"', '\\"')
    return f'OAuth oauth_consumer_key="{esc(key)}", oauth_token="{esc(token)}"'

def _call(method, url, data=None, key=None, token=None, raw=False):
    """Appel Trello. Les adresses que nous construisons ne portent ni clé ni jeton."""
    s = _secret()
    key = s.get("api_key") if key is None else key
    token = s.get("token") if token is None else token
    if not raw and ("token=" in url or "key=" in url):
        raise RuntimeError("jeton refusé dans l'adresse")
    headers = {"Accept": "application/json", "Authorization": _oauth(key or "", token or "")}
    if data is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with _open(req) as r:
            payload = (r.read(ATTACH_MAX + 1) if raw else r.read()) or b"null"
            code = getattr(r, "status", None) or getattr(r, "code", None) or 200
            hdrs = {k.lower(): v for k, v in (getattr(r, "headers", {}) or {}).items()}
            if raw:
                return code, payload, hdrs
            try:
                body = json.loads(payload)
            except json.JSONDecodeError:
                body = {}
            return code, body, hdrs
    except urllib.error.HTTPError as e:
        raw = e.read() if e.fp else b""
        try:
            body = json.loads(raw or b"null")
        except json.JSONDecodeError:
            body = {}
        hdrs = {k.lower(): v for k, v in (e.headers.items() if e.headers else [])}
        return e.code, body if isinstance(body, (dict, list)) else {}, hdrs
    except urllib.error.URLError as e:
        return 0, {"message": str(getattr(e, "reason", e))}, {}


def status():
    """État pour Réglages. Jamais de clé ni de jeton : seulement leur présence."""
    s = _secret()
    with _lock:
        err = _state["error"]
    return {
        "configured": configured(),
        "connected": connected(),
        "has_key": bool(s.get("api_key")),
        "name": s.get("name") or "",
        "username": s.get("username") or "",
        "error": err,
    }

def set_key(api_key):
    """Enregistre la clé. Vide = garder l'actuelle. Une clé différente oublie le jeton."""
    s = _secret()
    key = (api_key or "").strip()
    if not key:
        if s.get("api_key"):
            return
        raise ValueError("Colle la clé d'API.")
    same = key == s.get("api_key")
    nxt = {"api_key": key}
    if same and s.get("token"):
        nxt.update(token=s["token"], name=s.get("name") or "", username=s.get("username") or "")
    _save_secret(nxt)
    if not same:
        _reset()

def authorize_url():
    s = _secret()
    if not s.get("api_key"):
        raise ValueError("Enregistre d'abord la clé d'API.")
    q = urllib.parse.urlencode({
        "expiration": "never",
        "scope": SCOPE,
        "response_type": "token",
        "name": "homedash",
        "key": s["api_key"],
    })
    return f"{AUTHORIZE_URL}?{q}"

def connect(token):
    """Vérifie le jeton collé (`GET /members/me`) puis le garde. 401 : rien n'est écrit."""
    token = (token or "").strip()
    if not token:
        raise ValueError("Colle le jeton.")
    s = _secret()
    if not s.get("api_key"):
        raise ValueError("Enregistre d'abord la clé d'API.")
    code, body, _ = _call("GET", MEMBER, token=token)
    if code == 401:
        raise ValueError("Trello refuse ce jeton. Autorise à nouveau.")
    if code != 200 or not isinstance(body, dict) or not body.get("username"):
        raise RuntimeError("Trello n'a pas répondu. Réessaie.")
    _save_secret({
        "api_key": s["api_key"],
        "token": token,
        "name": body.get("fullName") or body.get("username") or "",
        "username": body.get("username") or "",
    })
    _reset()

def disconnect():
    s = _secret()
    _save_secret({"api_key": s["api_key"]} if s.get("api_key") else None)
    _reset()

def forget():
    _save_secret(None)
    _reset()


def _card(c):
    if not isinstance(c, dict) or c.get("closed"):
        return None
    board = c.get("board") if isinstance(c.get("board"), dict) else {}
    lst = c.get("list") if isinstance(c.get("list"), dict) else {}
    badges = c.get("badges") if isinstance(c.get("badges"), dict) else {}
    short = c.get("shortLink") or ""
    url = c.get("shortUrl") or (f"https://trello.com/c/{short}" if short else "")
    if not url:
        return None
    return {
        "id": c.get("id") or short,
        "short_link": short,
        "title": (c.get("name") or "").strip() or "(sans titre)",
        "url": url,
        "board_id": str(c.get("idBoard") or board.get("id") or ""),
        "board": board.get("name") or "Sans tableau",
        "board_url": board.get("shortUrl") or board.get("url") or "",
        "list_id": str(c.get("idList") or lst.get("id") or ""),
        "list": lst.get("name") or "Sans liste",
        "list_pos": lst.get("pos") if isinstance(lst.get("pos"), (int, float)) else 0,
        "pos": c.get("pos") if isinstance(c.get("pos"), (int, float)) else 0,
        "due": c.get("due") or None,
        "due_complete": bool(c.get("dueComplete")),
        "comments": badges.get("comments") or 0,
        "checks": badges.get("checkItems") or 0,
        "checks_done": badges.get("checkItemsChecked") or 0,
    }

def normalize_cards(body):
    if not isinstance(body, list):
        return []
    return [c for c in (_card(x) for x in body) if c]

def _ts(iso):
    try:
        return datetime.fromisoformat((iso or "").replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0

def _notif(n):
    if not isinstance(n, dict):
        return None
    data = n.get("data") if isinstance(n.get("data"), dict) else {}
    card = data.get("card") if isinstance(data.get("card"), dict) else {}
    board = data.get("board") if isinstance(data.get("board"), dict) else {}
    display = n.get("display") if isinstance(n.get("display"), dict) else {}
    trans = ((display.get("translationKey") and display.get("translation")) or display.get("translation") or "")
    if isinstance(trans, dict):
        trans = trans.get("text") or ""
    who = (n.get("memberCreator") or {}).get("fullName") or ""
    title = (trans or "").strip() or " ".join(x for x in (n.get("type") or "", card.get("name") or "") if x).strip() or "(sans titre)"
    short = card.get("shortLink") or ""
    url = card.get("shortUrl") or card.get("url") or (f"https://trello.com/c/{short}" if short else "")
    text = data.get("text") or ""
    return {
        "id": n.get("id"),
        "title": title,
        "url": url,
        "board": board.get("name") or "",
        "excerpt": (text if isinstance(text, str) else "")[:280],
        "creator": who,
        "ts": _ts(n.get("date")),
    }

def normalize_unreads(body):
    if not isinstance(body, list):
        return []
    out = [n for n in (_notif(x) for x in body) if n and n.get("id")]
    out.sort(key=lambda n: n["ts"], reverse=True)
    return out

def _diff(before, after, known):
    out = []
    if "unreads" in known:
        old = {(n["id"], n["ts"]) for n in before.get("unreads") or []}
        for n in after.get("unreads") or []:
            if (n["id"], n["ts"]) in old:
                continue
            who = f"{n['creator']} — " if n.get("creator") else ""
            out.append(events.event(
                "tr-notif", "info", "trello", f"📋 {who}{n['title']}",
                body=" · ".join(x for x in (n.get("board"), (n.get("excerpt") or "")[:140]) if x),
                repo=n.get("board") or "", url=n.get("url") or "", tag=f"tr:notif:{n['id']}"))
    if "cards" in known:
        old = {c["id"] for c in before.get("cards") or []}
        for c in after.get("cards") or []:
            if c["id"] in old:
                continue
            out.append(events.event(
                "tr-task", "info", "trello", f"📌 Nouvelle carte — {c['title']}",
                body=" · ".join(x for x in (c.get("board"), c.get("list")) if x),
                repo=c.get("board") or "", url=c.get("url") or "", tag=f"tr:task:{c['id']}"))
    return out

def _limit(code, headers):
    if code != 429:
        return None
    wait = 30
    try:
        wait = int((headers or {}).get("retry-after") or 30)
    except (TypeError, ValueError):
        wait = 30
    with _lock:
        _state["retry_at"] = time.time() + max(1, wait)
    return wait

def rebuild():
    """Relit cartes et notifications. Un seul à la fois (`kickoff`)."""
    started_at = time.monotonic()
    try:
        if not connected():
            return
        code, body, headers = _call("GET", CARDS)
        wait = _limit(code, headers)
        if wait is not None:
            raise RuntimeError(f"Trello limite les appels : nouvel essai dans {wait} s")
        if code == 401:
            raise RuntimeError("Le jeton Trello ne marche plus. Reconnecte-toi dans Réglages.")
        if code != 200:
            raise RuntimeError("Lecture des cartes impossible.")
        ncode, nbody, nheaders = _call("GET", NOTIFS)
        wait = _limit(ncode, nheaders)
        if wait is not None:
            raise RuntimeError(f"Trello limite les appels : nouvel essai dans {wait} s")
        if ncode == 401:
            raise RuntimeError("Le jeton Trello ne marche plus. Reconnecte-toi dans Réglages.")
        if ncode != 200:
            raise RuntimeError("Lecture des notifications impossible.")
        cards, unreads = normalize_cards(body), normalize_unreads(nbody)
        with _lock:
            before = {"cards": list(_data["cards"] or []), "unreads": list(_data["unreads"] or [])}
            _data["cards"], _data["unreads"] = cards, unreads
            known = tuple(k for k in ("cards", "unreads") if k in _seeded)
            _seeded.update(("cards", "unreads"))
            _state.update(ts=time.time(), error=None)
        if known:
            events.record(_diff(before, {"cards": cards, "unreads": unreads}, known))
        perflog.timed("trello", time.monotonic() - started_at)
    except Exception as e:
        with _lock:
            _state["error"] = str(e)
        print(f"✗ Trello : {e}", file=sys.stderr, flush=True)
    finally:
        with _lock:
            _state["building"] = False

def kickoff():
    with _lock:
        if _state["building"] or not active():
            return False
        _state["building"] = True
    threading.Thread(target=rebuild, daemon=True, name="trello").start()
    return True

def payload():
    s = _secret()
    with _lock:
        cards, unreads = _data["cards"], _data["unreads"]
        st = dict(_state)
    if not _on[0]:
        cards, unreads = None, None
    return {
        "configured": _on[0] and configured(),
        "enabled": active(),
        "account": s.get("name") or s.get("username") or "",
        "username": s.get("username") or "",
        "updated_at": st["ts"],
        "building": st["building"],
        "error": st["error"],
        "every": EVERY,
        "cards": cards or [],
        "unreads": unreads or [],
        "loaded": cards is not None,
        "posted": posted(),
    }

def _loop():
    while True:
        try:
            with _lock:
                due = time.time() >= _state["retry_at"]
            if due:
                kickoff()
        except Exception as e:
            print(f"✗ Trello : {e}", file=sys.stderr, flush=True)
        time.sleep(EVERY)

def start():
    threading.Thread(target=_loop, daemon=True, name="trello-loop").start()


def _found_card(c):
    board = c.get("board") if isinstance(c.get("board"), dict) else {}
    lst = c.get("list") if isinstance(c.get("list"), dict) else {}
    desc = c.get("desc") or ""
    return {
        "id": c.get("id"), "type": "card", "title": c.get("name") or "",
        "url": c.get("shortUrl") or c.get("url") or "",
        "board": board.get("name") or "", "parent": lst.get("name") or "",
        "due": c.get("due") or None, "creator": "",
        "excerpt": "" if desc == (c.get("name") or "") else (desc or "")[:300],
        "updated_at": c.get("dateLastActivity") or "",
    }

def _found_action(a):
    data = a.get("data") if isinstance(a.get("data"), dict) else {}
    card = data.get("card") if isinstance(data.get("card"), dict) else {}
    board = data.get("board") if isinstance(data.get("board"), dict) else {}
    url = card.get("shortUrl") or card.get("url") or ""
    if not url:
        return None
    kind = "comment" if a.get("type") == "commentCard" else (a.get("type") or "action")
    text = data.get("text") or ""
    return {
        "id": a.get("id"), "type": kind,
        "title": card.get("name") or (text[:80] if isinstance(text, str) else "") or kind,
        "url": url, "board": board.get("name") or "", "parent": "",
        "due": None,
        "creator": (a.get("memberCreator") or {}).get("fullName") or "",
        "excerpt": (text if isinstance(text, str) else "")[:300],
        "updated_at": a.get("date") or "",
        "comment_id": a.get("id") if kind == "comment" else None,
    }

def _search_items(body):
    body = body if isinstance(body, dict) else {}
    out = [_found_card(c) for c in body.get("cards") or [] if isinstance(c, dict)]
    for a in body.get("actions") or []:
        if isinstance(a, dict):
            item = _found_action(a)
            if item:
                out.append(item)
    for b in body.get("boards") or []:
        if not isinstance(b, dict):
            continue
        out.append({
            "id": b.get("id"), "type": "board", "title": b.get("name") or "",
            "url": b.get("shortUrl") or b.get("url") or "",
            "board": b.get("name") or "", "parent": "", "due": None, "creator": "",
            "excerpt": "", "updated_at": "",
        })
    return out[:20]

def search(q):
    """Cartes, commentaires et tableaux pour `q`. [] si non connecté. Cache 1 min."""
    q = (q or "").strip()
    if len(q) < 2 or not active():
        return []
    key = q.lower()
    with _search_lock:
        hit = _searches.get(key)
        if hit and time.time() - hit[0] < SEARCH_TTL:
            return hit[1]
    url = API + "/search?" + urllib.parse.urlencode({
        "query": q, "modelTypes": "cards,boards,actions",
        "cards_limit": 20, "boards_limit": 5, "actions_limit": 10, "partial": "true",
    })
    code, body, headers = _call("GET", url)
    if code == 429:
        _limit(code, headers)
        raise RuntimeError("Trello limite la recherche : réessaie dans un instant.")
    if code != 200:
        raise RuntimeError("Recherche Trello impossible.")
    items = _search_items(body)
    with _search_lock:
        if len(_searches) >= SEARCH_MAX:
            oldest = min(_searches, key=lambda k: _searches[k][0])
            _searches.pop(oldest, None)
        _searches[key] = (time.time(), items)
    return items


def short_of(url):
    m = _CARD_URL.match((url or "").split("?")[0].split("#")[0])
    return m.group(1) if m else None

def card_text(url):
    """Description, checklists et commentaires d'une carte. Un seul GET."""
    short = short_of(url)
    if not short or not _SHORT.match(short):
        raise ValueError("adresse de carte Trello attendue")
    if not connected():
        raise RuntimeError("Trello n'est pas connecté.")
    fields = ("fields=name,desc,shortUrl,url"
              "&checklists=all&actions=commentCard&actions_limit=50"
              "&attachments=true&attachment_fields=name,url,mimeType")
    code, body, _ = _call("GET", f"{API}/cards/{short}?{fields}")
    if code == 404:
        raise RuntimeError("Cette carte n'est plus accessible avec ce compte.")
    if code != 200 or not isinstance(body, dict):
        raise RuntimeError("Lecture de la carte impossible.")
    steps = []
    for cl in body.get("checklists") or []:
        if not isinstance(cl, dict):
            continue
        items = []
        for it in cl.get("checkItems") or []:
            if not isinstance(it, dict):
                continue
            items.append({"title": (it.get("name") or "").strip(), "completed": it.get("state") == "complete"})
        steps.append({"name": cl.get("name") or "Liste", "items": items})
    comments = []
    for a in body.get("actions") or []:
        if not isinstance(a, dict) or a.get("type") != "commentCard":
            continue
        data = a.get("data") if isinstance(a.get("data"), dict) else {}
        comments.append({
            "id": a.get("id"),
            "who": (a.get("memberCreator") or {}).get("fullName") or "",
            "date": (a.get("date") or "")[:16].replace("T", " "),
            "text": data.get("text") or "",
        })
    images = {}
    _allowed.clear()
    for att in body.get("attachments") or []:
        if not isinstance(att, dict):
            continue
        mime = (att.get("mimeType") or "").split(";")[0].strip().lower()
        link = att.get("url") or ""
        if mime in SAFE_IMAGES and _trello_https(link):
            images[att.get("name") or "image"] = link
            _allowed[link] = mime
    return {
        "text": body.get("desc") or "",
        "checklists": steps,
        "comments": comments,
        "images": images,
    }

def attachment(url):
    """Image déjà vue sur une carte de ce compte, hébergée par Trello. Toute autre adresse : refus, sans requête."""
    if not _trello_https(url):
        raise ValueError("image inconnue")
    mime = _allowed.get(url or "")
    if mime not in SAFE_IMAGES:
        raise ValueError("image inconnue")
    if not connected():
        raise RuntimeError("Trello n'est pas connecté.")
    code, body, headers = _call("GET", url, raw=True)
    if code != 200 or not isinstance(body, (bytes, bytearray)) or len(body) > ATTACH_MAX:
        raise RuntimeError("Image illisible.")
    got = (headers.get("content-type") or mime).split(";")[0].strip().lower()
    if got not in SAFE_IMAGES:
        raise ValueError("format refusé")
    return got, bytes(body)


def posted():
    try:
        v = store.read(store.TR_POSTED, {})
    except store.Broken:
        v = {}
    return v if isinstance(v, dict) else {}

def _post_comment(short, text):
    """Seule écriture vers Trello : un commentaire, sur une carte identifiée par shortLink."""
    if not _SHORT.match(short or ""):
        raise ValueError("adresse de carte Trello attendue")
    if not connected():
        raise RuntimeError("Trello n'est pas connecté.")
    endpoint = f"{API}/cards/{short}/actions/comments"
    data = urllib.parse.urlencode({"text": text}).encode()
    code, body, _ = _call("POST", endpoint, data=data)
    if code == 401:
        raise RuntimeError("Trello refuse le commentaire : reconnecte-toi.")
    if code in (403, 404):
        raise RuntimeError("Trello refuse le commentaire : la carte n'est plus accessible avec ce compte.")
    if code not in (200, 201) or not isinstance(body, dict):
        raise RuntimeError("Trello n'a pas pris le commentaire.")
    return (body.get("data") or {}).get("card", {}).get("shortUrl") or f"https://trello.com/c/{short}"

def dismiss(issue, undo=False):
    key = f"{issue['repo']}#{issue['number']}"
    with _post_lock:
        done = posted()
        if undo:
            done.pop(key, None)
        else:
            done[key] = {"ts": time.time(), "dismissed": True}
        store.write(store.TR_POSTED, done)
    return done

def publish_report(issue):
    """Publie le rapport en commentaire de la carte, une fois par rapport."""
    rep = issue.get("report") or {}
    if not rep.get("id"):
        raise ValueError("pas de rapport pour cette issue")
    key = str(rep["id"])
    short = short_of(issue.get("tr_url") or "")
    if not short:
        raise ValueError("adresse de carte Trello attendue")
    with _post_lock:
        done = posted()
        if key in done and done[key].get("url"):
            return done[key]
        footer = (f"\n\n— Rapport de l'issue GitHub {issue.get('repo') or ''} "
                  f"#{issue.get('number')}\n{issue.get('url') or ''}")
        text = ((rep.get("body") or "").strip() + footer).strip()
        if len(text) > COMMENT_MAX:
            text = text[: COMMENT_MAX - 1] + "…"
        url = _post_comment(short, text)
        done[key] = {"url": url, "ts": time.time()}
        store.write(store.TR_POSTED, done)
        return done[key]
