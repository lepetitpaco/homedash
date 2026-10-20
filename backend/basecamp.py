"""Basecamp — mes tâches et mes notifications, en lecture seule.

Ce module ne fait QUE lire Basecamp. Toute requête vers l'API passe par
`_api_get()`, qui ne sait faire que des GET ; les seuls POST partent vers
Launchpad (`TOKEN_URL`), pour obtenir ou renouveler le jeton. Rien ici ne
coche une tâche, ne marque une notification lue ni ne poste quoi que ce soit :
la page n'affiche que des liens vers Basecamp. Testé dans `test_basecamp`.

Connexion par OAuth 2 (Basecamp n'a pas de jeton personnel documenté) :
l'utilisateur déclare une appli sur launchpad.37signals.com/integrations,
colle son client id / secret dans Réglages, puis autorise l'accès. Le jeton
dure deux semaines et se renouvelle seul avec le refresh token. Tout vit dans
`data/secrets.json` (clé `basecamp`), jamais dans config.json ni dans une
réponse d'API.
"""

import json
import re
import secrets
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

import events
import store

AUTHORIZE_URL = "https://launchpad.37signals.com/authorization/new"
TOKEN_URL     = "https://launchpad.37signals.com/authorization/token"
IDENTITY_URL  = "https://launchpad.37signals.com/authorization.json"
# Exigé par Basecamp (400 sans) : nom de l'appli et un lien pour joindre l'auteur.
USER_AGENT    = "homedash (https://github.com/davidgennaoui/homedash)"
SECRET_KEY    = "basecamp"
EVERY         = 60          # s entre deux lectures ; 2 appels, presque toujours des 304
REFRESH_AHEAD = 24 * 3600   # renouvelle le jeton un jour avant son expiration
STATE_TTL     = 15 * 60     # durée de validité d'un lien d'autorisation

# Les lectures faites dans Basecamp : mes tâches, mes notifs, et les tableaux
# kanban de mes cartes (pour leurs colonnes, dans l'ordre du tableau).
ASSIGNMENTS = "/my/assignments.json"
READINGS    = "/my/readings.json"
COLUMN      = "/card_tables/columns/{}.json"
BOARD       = "/card_tables/{}.json"

_COLUMN_ID = re.compile(r"/card_tables/(?:columns|lists)/(\d+)")
_BOARD_ID  = re.compile(r"/card_tables/(\d+)(?:\.json)?$")

_lock   = threading.Lock()
_etags  = {}                # url -> (etag, payload)
_data   = {"tasks": None, "unreads": None, "boards": {}}
_state  = {"ts": 0.0, "building": False, "error": None, "retry_at": 0.0}
_seeded = set()             # sections déjà vues une fois : pas d'événement au premier passage
_states = {}                # state OAuth -> heure d'émission
_col_board = {}             # colonne -> tableau : une colonne ne change pas de tableau


# ── Secrets ──────────────────────────────────────────────────────────────────
def _secret():
    v = store.read_secret(SECRET_KEY)
    return v if isinstance(v, dict) else {}

def _save_secret(value):
    store.write_secret(SECRET_KEY, value or None)

def configured():
    s = _secret()
    return bool(s.get("client_id") and s.get("client_secret"))

def connected():
    s = _secret()
    return bool(s.get("access_token") and s.get("href"))

def _reset():
    """Jeton ou appli changés : caches et amorçage du journal valaient pour l'ancien."""
    with _lock:
        _etags.clear()
        _col_board.clear()
        _data["tasks"] = _data["unreads"] = None
        _data["boards"] = {}
        _state.update(ts=0.0, error=None, retry_at=0.0)
        _seeded.clear()


# ── HTTP ─────────────────────────────────────────────────────────────────────
def _open(req):
    """Point de passage unique vers le réseau (remplacé dans les tests)."""
    return urllib.request.urlopen(req, timeout=15)

def _post_token(params):
    """POST vers Launchpad pour obtenir un jeton : la seule écriture de ce
    module, et elle ne touche pas Basecamp lui-même."""
    body = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(TOKEN_URL, data=body, method="POST", headers={
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "User-Agent": USER_AGENT,
    })
    try:
        with _open(req) as r:
            return json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Launchpad a refusé ({e.code}) : code expiré, ou client id / secret / "
                           "adresse de retour différents de ceux de l'appli") from None
    except urllib.error.URLError as e:
        raise RuntimeError(f"Launchpad injoignable : {e.reason}") from None

def _get(url, token, cache=True):
    """GET authentifié, avec cache ETag (exigé par Basecamp). Retourne
    (statut, contenu, en-têtes) ; un 304 rend le contenu en cache."""
    cached = _etags.get(url) if cache else None
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json",
               "User-Agent": USER_AGENT}
    if cached:
        headers["If-None-Match"] = cached[0]
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with _open(req) as r:
            payload = json.loads(r.read() or b"null")
            etag = r.headers.get("ETag") if r.headers else None
            if cache and etag:
                _etags[url] = (etag, payload)
            return 200, payload, r.headers
    except urllib.error.HTTPError as e:
        if e.code == 304 and cached:
            return 200, cached[1], e.headers
        return e.code, None, e.headers
    except urllib.error.URLError as e:
        return 0, {"message": str(e.reason)}, {}

def _api_get(path, token, href):
    """Lecture dans le compte Basecamp. Ne fait que des GET, et seulement
    vers l'adresse du compte : c'est ce qui garantit la lecture seule."""
    return _get(href.rstrip("/") + path, token)


# ── OAuth ────────────────────────────────────────────────────────────────────
def set_app(client_id, client_secret, redirect_uri):
    """Enregistre l'appli Launchpad. Un secret vide garde le précédent (le
    navigateur ne le connaît pas, il ne peut pas le renvoyer)."""
    s = _secret()
    client_id = (client_id or "").strip()
    secret = (client_secret or "").strip() or s.get("client_secret") or ""
    redirect_uri = (redirect_uri or "").strip()
    if not client_id or not secret:
        raise ValueError("client id et client secret requis")
    if not redirect_uri.startswith(("http://", "https://")):
        raise ValueError("adresse de retour invalide (http://… ou https://…)")
    # L'adresse de retour ne sert qu'à la prochaine connexion : la changer ne
    # déconnecte pas. Changer d'appli, si.
    same = (s.get("client_id"), s.get("client_secret")) == (client_id, secret)
    new = {"client_id": client_id, "client_secret": secret, "redirect_uri": redirect_uri}
    if same:
        new = {**s, **new}           # même appli : la connexion reste valable
    else:
        _reset()                     # autre appli : l'ancien jeton ne vaut plus rien
    _save_secret(new)

def authorize_url():
    s = _secret()
    if not configured():
        raise ValueError("appli Basecamp non renseignée")
    state = secrets.token_urlsafe(24)
    now = time.time()
    with _lock:
        for k, t in list(_states.items()):
            if now - t > STATE_TTL:
                del _states[k]
        _states[state] = now
    return AUTHORIZE_URL + "?" + urllib.parse.urlencode({
        "response_type": "code",
        "client_id": s["client_id"], "redirect_uri": s["redirect_uri"], "state": state,
    })

def check_state(state):
    """Un retour d'autorisation doit porter un `state` émis ici : sans ce
    contrôle, un site tiers pourrait brancher SON compte Basecamp sur la page."""
    with _lock:
        t = _states.pop(state or "", None)
    return t is not None and time.time() - t <= STATE_TTL

def parse_code(text):
    """Le code seul, ou l'adresse de retour entière collée depuis la barre du
    navigateur → (code, state ou None)."""
    text = (text or "").strip()
    if "code=" in text:
        q = urllib.parse.parse_qs(urllib.parse.urlsplit(text).query or text.split("?", 1)[-1])
        return (q.get("code") or [""])[0], (q.get("state") or [None])[0]
    return text, None

def exchange(code):
    """Code d'autorisation → jeton, puis compte Basecamp visé."""
    s = _secret()
    if not configured():
        raise ValueError("appli Basecamp non renseignée")
    if not code:
        raise ValueError("code vide")
    tok = _post_token({
        "grant_type": "authorization_code",
        "client_id": s["client_id"], "client_secret": s["client_secret"],
        "redirect_uri": s["redirect_uri"], "code": code,
    })
    _store_token(s, tok)
    who = _identify()
    _reset()
    return who

def _store_token(s, tok):
    if not isinstance(tok, dict) or not tok.get("access_token"):
        raise RuntimeError("Launchpad n'a pas renvoyé de jeton")
    s = {**s, "access_token": tok["access_token"],
         "refresh_token": tok.get("refresh_token") or s.get("refresh_token"),
         "expires_at": time.time() + int(tok.get("expires_in") or 1209600)}
    _save_secret(s)
    return s

def _identify():
    """Qui est connecté, et sur quel compte Basecamp (le premier `bc3`)."""
    s = _secret()
    status, body, _ = _get(IDENTITY_URL, s["access_token"], cache=False)
    if status != 200 or not isinstance(body, dict):
        raise RuntimeError(f"Launchpad répond {status} à la lecture du compte")
    accs = [a for a in body.get("accounts") or [] if a.get("product") == "bc3"]
    if not accs:
        raise RuntimeError("ce compte 37signals n'a accès à aucun Basecamp")
    acc = accs[0]
    ident = body.get("identity") or {}
    name = " ".join(x for x in (ident.get("first_name"), ident.get("last_name")) if x)
    _save_secret({**s, "href": acc.get("href"), "app_href": acc.get("app_href"),
                  "account_name": acc.get("name"), "name": name,
                  "accounts": len(accs)})
    return {"name": name, "account": acc.get("name")}

def _refresh_token(s):
    if not s.get("refresh_token"):
        raise RuntimeError("connexion Basecamp expirée : reconnecte-toi dans Réglages → Basecamp")
    return _store_token(s, _post_token({
        "grant_type": "refresh_token",
        "refresh_token": s["refresh_token"], "client_id": s["client_id"],
        "client_secret": s["client_secret"],
    }))

def disconnect():
    """Oublie le jeton, garde l'appli : se reconnecter = un clic."""
    s = _secret()
    keep = {k: s[k] for k in ("client_id", "client_secret", "redirect_uri") if k in s}
    _save_secret(keep)
    _reset()

def forget():
    """Oublie tout, appli comprise."""
    _save_secret(None)
    _reset()

def status():
    """État pour Réglages. Jamais de jeton ni de secret : seulement leur présence."""
    s = _secret()
    with _lock:
        err = _state["error"]
    return {
        "configured": configured(),
        "connected": connected(),
        "client_id": s.get("client_id") or "",
        "has_secret": bool(s.get("client_secret")),
        "redirect_uri": s.get("redirect_uri") or "",
        "name": s.get("name") or "",
        "account": s.get("account_name") or "",
        "accounts": s.get("accounts") or 0,
        "app_href": s.get("app_href") or "",
        "expires_at": s.get("expires_at"),
        "error": err,
    }


# ── Lecture ──────────────────────────────────────────────────────────────────
def _task(a):
    parent = a.get("parent") or {}
    bucket = a.get("bucket") or {}
    url = a.get("app_url") or ""
    column = _COLUMN_ID.search(parent.get("app_url") or "")
    card = "/card_tables/cards/" in url or "card" in (a.get("type") or "").lower()
    return {
        "kind": "card" if card else "todo",
        "column_id": int(column.group(1)) if card and column else None,
        "id": a.get("id"),
        "title": (a.get("content") or a.get("title") or "").strip() or "(sans titre)",
        "url": a.get("app_url") or "",
        "type": a.get("type") or "",
        "project": bucket.get("name") or "",
        "project_id": bucket.get("id"),
        "project_url": bucket.get("app_url") or "",
        "list": parent.get("title") or "",
        "list_url": parent.get("app_url") or "",
        "due_on": a.get("due_on"),
        "starts_on": a.get("starts_on"),
        "comments": a.get("comments_count") or 0,
        "steps": [{"title": (c.get("content") or c.get("title") or "").strip(),
                   "url": c.get("app_url") or "", "due_on": c.get("due_on"),
                   "completed": bool(c.get("completed"))}
                  for c in a.get("children") or []],
    }

def _ts(iso):
    try:
        return datetime.fromisoformat((iso or "").replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0

def _notif(n):
    creator = n.get("creator") or {}
    return {
        "id": n.get("id"),
        "title": (n.get("title") or "").strip() or "(sans titre)",
        "url": n.get("app_url") or "",
        "project": n.get("bucket_name") or "",
        "section": n.get("section") or "",
        "type": n.get("type") or "",
        "creator": creator.get("name") or "",
        "excerpt": (n.get("content_excerpt") or "").strip()[:280],
        "unread_count": n.get("unread_count") or 0,
        "ts": _ts(n.get("updated_at") or n.get("created_at")),
    }

def normalize_tasks(body):
    body = body if isinstance(body, dict) else {}
    return {"priorities": [_task(a) for a in body.get("priorities") or []],
            "others": [_task(a) for a in body.get("non_priorities") or []]}

def normalize_unreads(body):
    body = body if isinstance(body, dict) else {}
    out = [_notif(n) for n in body.get("unreads") or []]
    out.sort(key=lambda n: n["ts"], reverse=True)
    return out

def _board_of(column_id, token, href):
    """Tableau d'une colonne, lu une fois puis gardé."""
    if column_id in _col_board:
        return _col_board[column_id]
    status, body, _ = _api_get(COLUMN.format(column_id), token, href)
    if status != 200 or not isinstance(body, dict):
        return None
    parent = body.get("parent") or {}
    m = _BOARD_ID.search(parent.get("url") or parent.get("app_url") or "")
    _col_board[column_id] = int(m.group(1)) if m else None
    return _col_board[column_id]

def read_boards(tasks, token, href):
    """Tableaux kanban des cartes assignées : nom, lien, colonnes dans l'ordre.
    Facultatif — un échec laisse les cartes rangées sous le nom de leur colonne."""
    boards, ids = {}, set()
    for t in tasks["priorities"] + tasks["others"]:
        if t["column_id"]:
            b = _board_of(t["column_id"], token, href)
            if b:
                t["board_id"] = b
                ids.add(b)
    for b in ids:
        status, body, _ = _api_get(BOARD.format(b), token, href)
        if status != 200 or not isinstance(body, dict):
            continue
        boards[str(b)] = {
            "title": body.get("title") or "Tableau",
            "url": body.get("app_url") or "",
            "columns": [{"id": c.get("id"), "title": c.get("title") or "",
                         "type": (c.get("type") or "").split("::")[-1],
                         "color": c.get("color")}
                        for c in body.get("lists") or []],
        }
    return boards

def _diff(before, after, todo):
    """Événements du cycle. Une section jamais vue ne produit rien : le premier
    passage déverserait sinon toutes les tâches et notifs en cours."""
    out = []
    if "unreads" in todo:
        old = {(n["id"], n["ts"]) for n in before.get("unreads") or []}
        for n in after.get("unreads") or []:
            if (n["id"], n["ts"]) in old:
                continue
            who = f"{n['creator']} — " if n["creator"] else ""
            out.append(events.event(
                "bc-notif", "info", "basecamp", f"🏕 {who}{n['title']}",
                body=" · ".join(x for x in (n["project"], n["excerpt"][:140]) if x),
                repo=n["project"], url=n["url"], tag=f"bc:notif:{n['id']}"))
    if "tasks" in todo:
        def ids(t):
            t = t or {}
            return {x["id"] for x in (t.get("priorities") or []) + (t.get("others") or [])}
        old = ids(before.get("tasks"))
        now = after.get("tasks") or {}
        for t in (now.get("priorities") or []) + (now.get("others") or []):
            if t["id"] in old:
                continue
            out.append(events.event(
                "bc-task", "info", "basecamp", f"📌 Nouvelle tâche — {t['title']}",
                body=" · ".join(x for x in (t["project"], t["list"]) if x),
                repo=t["project"], url=t["url"], tag=f"bc:task:{t['id']}"))
    return out

def rebuild():
    """Relit tâches et notifications. Un seul à la fois (`kickoff`)."""
    try:
        s = _secret()
        if not (s.get("access_token") and s.get("href")):
            return
        if (s.get("expires_at") or 0) - time.time() < REFRESH_AHEAD:
            s = _refresh_token(s)
        results = {}
        for name, path in (("tasks", ASSIGNMENTS), ("unreads", READINGS)):
            status, body, headers = _api_get(path, s["access_token"], s["href"])
            if status == 401:
                # Jeton révoqué ou expiré plus tôt que prévu : un renouvellement, une fois.
                s = _refresh_token(s)
                status, body, headers = _api_get(path, s["access_token"], s["href"])
            if status == 429:
                wait = int((headers or {}).get("Retry-After") or 30)
                with _lock:
                    _state["retry_at"] = time.time() + wait
                raise RuntimeError(f"Basecamp limite les appels : nouvel essai dans {wait} s")
            if status != 200:
                why = (body or {}).get("message") if status == 0 else f"HTTP {status}"
                raise RuntimeError(f"lecture de {path} impossible : {why}")
            results[name] = (normalize_tasks if name == "tasks" else normalize_unreads)(body)
        try:
            boards = read_boards(results["tasks"], s["access_token"], s["href"])
        except Exception as e:
            print(f"✗ Basecamp, tableaux : {e}", file=sys.stderr, flush=True)
            boards = {}
        with _lock:
            before = dict(_data)
            _data.update(results)
            _data["boards"] = boards
            known = tuple(k for k in results if k in _seeded)
            _seeded.update(results)
            _state.update(ts=time.time(), error=None)
        if known:
            events.record(_diff(before, _data, known))
    except Exception as e:
        with _lock:
            _state["error"] = str(e)
        print(f"✗ Basecamp : {e}", file=sys.stderr, flush=True)
    finally:
        with _lock:
            _state["building"] = False

def kickoff():
    with _lock:
        if _state["building"] or not connected():
            return False
        _state["building"] = True
    threading.Thread(target=rebuild, daemon=True, name="basecamp").start()
    return True

def payload():
    s = _secret()
    with _lock:
        tasks, unreads, boards = _data["tasks"], _data["unreads"], _data["boards"]
        st = dict(_state)
    return {
        "configured": configured(),
        "enabled": connected(),
        "account": s.get("account_name") or "",
        "app_href": s.get("app_href") or "",
        "name": s.get("name") or "",
        "updated_at": st["ts"],
        "building": st["building"],
        "error": st["error"],
        "every": EVERY,
        "tasks": tasks or {"priorities": [], "others": []},
        "unreads": unreads or [],
        "boards": boards or {},
        "loaded": tasks is not None,
    }

def _loop():
    # Le serveur lit Basecamp en continu, page ouverte ou non : c'est ce qui
    # nourrit la cloche, comme pour GitHub.
    while True:
        try:
            with _lock:
                due = time.time() >= _state["retry_at"]
            if due:
                kickoff()
        except Exception as e:
            print(f"✗ Basecamp : {e}", file=sys.stderr, flush=True)
        time.sleep(EVERY)

def start():
    threading.Thread(target=_loop, daemon=True, name="basecamp-loop").start()
