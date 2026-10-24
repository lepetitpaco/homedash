"""Basecamp — mes tâches et mes notifications, en lecture seule.

Ce module lit Basecamp. Toute lecture passe par `_api_get()`, qui ne sait faire
que des GET ; les POST partent vers Launchpad (`TOKEN_URL`), pour obtenir ou
renouveler le jeton, et UNE exception : `publish_report()` poste un commentaire
sur une tâche, quand on clique « publier » sur le rapport d'une issue liée. Rien
ici ne coche une tâche ni ne marque une notification lue. Testé dans `test_basecamp`.

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
from collections import OrderedDict
from datetime import datetime
from html import escape as html_escape
from html.parser import HTMLParser

import events
import perflog
import store

AUTHORIZE_URL = "https://launchpad.37signals.com/authorization/new"
TOKEN_URL     = "https://launchpad.37signals.com/authorization/token"
IDENTITY_URL  = "https://launchpad.37signals.com/authorization.json"
# Exigé par Basecamp (400 sans) : nom de l'appli et un lien pour joindre l'auteur.
USER_AGENT    = "homedash (https://github.com/lepetitpaco/homedash)"
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
_API_HOST  = re.compile(r"^https://(\d+)\.basecampapi\.com/")
_BOARD_ID  = re.compile(r"/card_tables/(\d+)(?:\.json)?$")

_lock   = threading.Lock()
_etags  = {}                # url -> (etag, payload)
_data   = {"tasks": None, "unreads": None, "boards": {}}
_state  = {"ts": 0.0, "building": False, "error": None, "retry_at": 0.0}
_seeded = set()             # sections déjà vues une fois : pas d'événement au premier passage
_states = {}                # state OAuth -> heure d'émission
_col_board = {}             # colonne -> tableau : une colonne ne change pas de tableau
_on     = [True]            # faux : Basecamp coupé dans Réglages → Fonctionnalités


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

def set_enabled(on):
    """Basecamp coupé : plus de lecture ni de recherche, la page n'a plus d'onglet.
    La connexion est gardée ; rallumé, la lecture reprend."""
    _on[0] = bool(on)
    if not on:
        # Rallumé plus tard : ce qui a bougé entre-temps n'est pas une nouveauté.
        with _lock:
            _seeded.clear()

def active():
    return _on[0] and connected()

def _reset():
    """Jeton ou appli changés : caches et amorçage du journal valaient pour l'ancien."""
    with _lock:
        _etags.clear()
        _col_board.clear()
        _data["tasks"] = _data["unreads"] = None
        _data["boards"] = {}
        _state.update(ts=0.0, error=None, retry_at=0.0)
        _seeded.clear()
    with _search_lock:
        _searches.clear()
    with _files_lock:
        _files.clear()


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

def _api_get(path, token, href, cache=True):
    """Lecture dans le compte Basecamp. Ne fait que des GET, et seulement
    vers l'adresse du compte : c'est ce qui garantit la lecture seule."""
    return _get(href.rstrip("/") + path, token, cache)


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
SITE = "https://app.basecamp.com"

def _site():
    """Le site du compte (`app_href` donné par Launchpad), sans le chemin."""
    p = urllib.parse.urlsplit(_secret().get("app_href") or SITE)
    return f"{p.scheme}://{p.netloc}" if p.netloc else SITE

def web_url(url, site=SITE):
    """Lien à ouvrir dans le navigateur. Certaines notifs (« You've got
    Boosts! ») n'ont pour `app_url` qu'une adresse de l'API, illisible dans un
    navigateur : on la ramène sur le site du compte
    (3.basecampapi.com/123/my/boosts → app.basecamp.com/123/my/boosts)."""
    url = url or ""
    if not _API_HOST.match(url):
        return url
    url = _API_HOST.sub(site.rstrip("/") + "/", url)
    return url[:-5] if url.endswith(".json") else url

def _task(a, site=SITE):
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
        "url": web_url(a.get("app_url"), site),
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

def _notif(n, site=SITE):
    creator = n.get("creator") or {}
    return {
        "id": n.get("id"),
        "title": (n.get("title") or "").strip() or "(sans titre)",
        "url": web_url(n.get("app_url"), site),
        "project": n.get("bucket_name") or "",
        "section": n.get("section") or "",
        "type": n.get("type") or "",
        "creator": creator.get("name") or "",
        "excerpt": (n.get("content_excerpt") or "").strip()[:280],
        "unread_count": n.get("unread_count") or 0,
        "ts": _ts(n.get("updated_at") or n.get("created_at")),
    }

def normalize_tasks(body, site=SITE):
    body = body if isinstance(body, dict) else {}
    return {"priorities": [_task(a, site) for a in body.get("priorities") or []],
            "others": [_task(a, site) for a in body.get("non_priorities") or []]}

def normalize_unreads(body, site=SITE):
    body = body if isinstance(body, dict) else {}
    out = [_notif(n, site) for n in body.get("unreads") or []]
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
    started_at = time.time()
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
            results[name] = (normalize_tasks if name == "tasks" else normalize_unreads)(body, _site())
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
        perflog.timed("basecamp", time.time() - started_at)
    except Exception as e:
        with _lock:
            _state["error"] = str(e)
        print(f"✗ Basecamp : {e}", file=sys.stderr, flush=True)
    finally:
        with _lock:
            _state["building"] = False

def kickoff():
    with _lock:
        if _state["building"] or not active():
            return False
        _state["building"] = True
    threading.Thread(target=rebuild, daemon=True, name="basecamp").start()
    return True

def payload():
    s = _secret()
    with _lock:
        tasks, unreads, boards = _data["tasks"], _data["unreads"], _data["boards"]
        st = dict(_state)
    if not _on[0]:
        tasks, unreads, boards = None, None, {}
    return {
        "configured": _on[0] and configured(),
        "enabled": active(),
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
        "posted": posted(),
    }

# ── Recherche dans tout Basecamp ────────────────────────────────────────────
# Pour la barre de recherche de homedash : un GET `/search.json`, au fil de la
# frappe (la page attend une pause). Pas de cache ETag (une entrée par requête
# tapée), mais les réponses récentes sont gardées une minute.
SEARCH_MAX = 20             # résultats gardés (Basecamp en rend 50 par page)
SEARCH_TTL = 60             # secondes
_searches = {}              # requête (minuscules) → (horodatage, résultats)
_search_lock = threading.Lock()

def _found(x):
    """Résultat de recherche Basecamp → ce que la page affiche."""
    bucket, parent = x.get("bucket") or {}, x.get("parent") or {}
    text = re.sub(r"\s+", " ", x.get("plain_text_content") or x.get("plain_text_description") or "").strip()
    title = x.get("title") or ""
    return {
        "id": x.get("id"), "type": x.get("type") or "", "title": title,
        "url": x.get("app_url") or "", "project": bucket.get("name") or "",
        "parent": parent.get("title") or "", "status": x.get("status") or "",
        "completed": bool(x.get("completed")), "due_on": x.get("due_on"),
        "updated_at": x.get("updated_at") or "",
        "creator": (x.get("creator") or {}).get("name") or "",
        # extrait, sauf s'il ne fait que répéter le titre (to-do sans description)
        "excerpt": "" if text == title else text[:300],
    }

def search(q):
    """Tout Basecamp (tâches, cartes, messages, commentaires…) pour `q`,
    dans l'ordre de pertinence de Basecamp. [] si non connecté."""
    q = re.sub(r"\s+", " ", q or "").strip()[:100]
    s = _secret()
    if len(q) < 2 or not _on[0] or not (s.get("access_token") and s.get("href")):
        return []
    key, now = q.lower(), time.time()
    with _search_lock:
        hit = _searches.get(key)
        if hit and now - hit[0] < SEARCH_TTL:
            return hit[1]
    status, body, _ = _api_get("/search.json?" + urllib.parse.urlencode({"q": q}),
                               s["access_token"], s["href"], cache=False)
    if status != 200 or not isinstance(body, list):
        raise RuntimeError(f"recherche Basecamp impossible (HTTP {status})")
    # archivé ou à la corbeille : écarté (on cherche pour agir, pas pour fouiller) ;
    # terminé : après le reste, dans l'ordre de Basecamp
    items = [_found(x) for x in body
             if isinstance(x, dict) and x.get("app_url") and (x.get("status") or "active") == "active"]
    items.sort(key=lambda i: i["completed"])
    items = items[:SEARCH_MAX]
    with _search_lock:
        for k in [k for k, (ts, _) in _searches.items() if now - ts >= SEARCH_TTL]:
            del _searches[k]
        _searches[key] = (now, items)
    return items

# ── Contenu d'une tâche, à la demande ───────────────────────────────────────
# Pour pré-remplir une issue GitHub : description et échanges d'une tâche,
# lus au moment où on en fait une issue. Deux GET, rien de plus.
_TASK_URL = re.compile(r"/buckets/(\d+)/(todos|card_tables/cards)/(\d+)")
TASK_COMMENTS = 200         # échanges proposés au plus (les plus récents)
TASK_PAGES = 10             # pages de commentaires lues au plus

class _Text(HTMLParser):
    """HTML de Basecamp (éditeur Trix) → texte Markdown simple."""
    BLOCK = {"p", "div", "h1", "h2", "h3", "blockquote", "pre", "ul", "ol"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.href, self.list, self.files = [], None, [], []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "br" or tag in self.BLOCK:
            self.out.append("\n")
        if tag in ("ul", "ol"):
            self.list.append(tag)
        elif tag == "li":
            self.out.append("\n" + "  " * (len(self.list) - 1) + ("1. " if self.list[-1:] == ["ol"] else "- "))
        elif tag in ("strong", "b"):
            self.out.append("**")
        elif tag in ("em", "i"):
            self.out.append("*")
        elif tag == "a":
            self.href = a.get("href")
            self.out.append("[")
        elif tag == "bc-attachment":
            # Pièce jointe : lien vers Basecamp (l'adresse est dans `url` ; `href`
            # pour un fichier). Ouvrable seulement connecté à Basecamp : ni GitHub
            # ni Claude Code ne la voient, d'où la mention.
            name = a.get("filename") or a.get("caption") or "pièce jointe"
            icon = "🖼" if (a.get("content-type") or "").startswith("image/") else "📎"
            link = a.get("href") or a.get("url")
            if link and a.get("sgid"):
                self.files.append((a["sgid"], link, a.get("content-type") or ""))
            label = f"{icon} {name.replace('[', '(').replace(']', ')')}"
            self.out.append(f"\n[{label}](<{link}>) (sur Basecamp)\n" if link
                            else f"\n{label} (sur Basecamp)\n")

    def handle_endtag(self, tag):
        if tag in ("ul", "ol") and self.list:
            self.list.pop()
        if tag in self.BLOCK:
            self.out.append("\n")
        elif tag in ("strong", "b"):
            self.out.append("**")
        elif tag in ("em", "i"):
            self.out.append("*")
        elif tag == "a":
            self.out.append(f"]({self.href})" if self.href else "]")
            self.href = None

    def handle_data(self, data):
        self.out.append(data)

def html_text(raw):
    return html_parts(raw)[0]

def html_parts(raw):
    """Texte Markdown, et les pièces jointes rencontrées : [(sgid, lien, type)]."""
    p = _Text()
    p.feed(raw or "")
    p.close()
    text = re.sub(r"[ \t]+\n", "\n", "".join(p.out))
    return re.sub(r"\n{3,}", "\n\n", text).strip(), p.files

def task_text(url):
    """Contenu d'une tâche (to-do ou carte) pour en faire une issue :
    `text` = description et étapes, en Markdown ; `comments` = tous ses échanges,
    du plus ancien au plus récent, que la page propose de retenir un par un.
    `url` : adresse web de la tâche ; seuls ses numéros servent à lire l'API."""
    m = _TASK_URL.search(url or "")
    if not m:
        raise ValueError("adresse de tâche Basecamp attendue")
    s = _secret()
    if not (s.get("access_token") and s.get("href")):
        raise RuntimeError("Basecamp non connecté")
    bucket, kind, rid = m.groups()
    status, body, _ = _api_get(f"/buckets/{bucket}/{kind}/{rid}.json", s["access_token"], s["href"])
    if status != 200 or not isinstance(body, dict):
        raise RuntimeError(f"lecture de la tâche impossible (HTTP {status})")
    # to-do : `description` ; carte : `content` (le titre étant `title`)
    desc, files = html_parts(body.get("description") if kind == "todos" else body.get("content"))
    # sgid d'une pièce jointe → son adresse de téléchargement (API), pour afficher les images
    downloads = {x.get("sgid"): x.get("download_url") for x in body.get("description_attachments") or []}
    parts = [desc] if desc else []
    steps = [st for st in body.get("steps") or [] if st.get("title")]
    if steps:
        parts.append("### Étapes\n\n" + "\n".join(
            f"- [{'x' if st.get('completed') else ' '}] {st['title'].strip()}" for st in steps))
    comments = []
    if body.get("comments_count"):
        for c in _all_comments(bucket, rid, s):
            text, more = html_parts(c.get("content"))
            files += more
            downloads.update({x.get("sgid"): x.get("download_url") for x in c.get("content_attachments") or []})
            if text:
                comments.append({"id": c.get("id"), "who": (c.get("creator") or {}).get("name") or "?",
                                 "date": (c.get("created_at") or "")[:10], "text": text})
    # Images, pour la fiche de la page : lien du texte → adresse à passer à `attachment()`
    images = {link: downloads[sgid] for sgid, link, ctype in files
              if ctype.startswith("image/") and downloads.get(sgid)}
    return {"text": "\n\n".join(parts), "comments": comments[-TASK_COMMENTS:], "images": images}

# ── Image jointe, relayée pour la fiche d'une tâche ─────────────────────────
# La page ne peut pas afficher une image de Basecamp (il faut y être connecté,
# et le navigateur n'envoie pas la session pour une image d'un autre site) : le
# serveur la lit avec le jeton. Seulement une adresse `…/blobs/…` du compte, et
# seulement une image d'un format sûr (pas de SVG : il peut porter du script).
ATTACH_MAX = 15 * 1024 * 1024
IMAGE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/bmp"}
_files = OrderedDict()          # adresse → (type, octets), les plus récentes
_files_lock = threading.Lock()

def attachment(url):
    """(type, octets) d'une image jointe, par son adresse de téléchargement (API)."""
    s = _secret()
    if not (s.get("access_token") and s.get("href")):
        raise RuntimeError("Basecamp non connecté")
    if not (url or "").startswith(s["href"].rstrip("/") + "/blobs/"):
        raise ValueError("pièce jointe Basecamp attendue")
    with _files_lock:
        if url in _files:
            _files.move_to_end(url)
            return _files[url]
    req = urllib.request.Request(url, headers={"Accept": "image/*", "User-Agent": USER_AGENT})
    # Basecamp redirige vers un lien de stockage signé : le jeton ne doit pas l'y
    # suivre (refusé là-bas, et il n'a rien à y faire)
    req.add_unredirected_header("Authorization", f"Bearer {s['access_token']}")
    try:
        with _open(req) as r:
            ctype = (r.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            body = r.read(ATTACH_MAX + 1)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"pièce jointe illisible (HTTP {e.code})") from None
    except urllib.error.URLError as e:
        raise RuntimeError(f"Basecamp injoignable : {e.reason}") from None
    if ctype not in IMAGE_TYPES or len(body) > ATTACH_MAX:
        raise ValueError("pas une image affichable")
    with _files_lock:
        _files[url] = (ctype, body)
        while len(_files) > 40:
            _files.popitem(last=False)
    return ctype, body

def _all_comments(bucket, rid, s):
    """Tous les commentaires d'un enregistrement, page après page (en-tête `Link`),
    sans jamais suivre une adresse hors du compte."""
    status, page, headers = _api_get(f"/buckets/{bucket}/recordings/{rid}/comments.json",
                                     s["access_token"], s["href"])
    out = []
    for _ in range(TASK_PAGES):
        if status != 200 or not isinstance(page, list):
            break
        out += page
        nxt = re.search(r'<([^>]+)>;\s*rel="next"', (headers or {}).get("Link") or "")
        if not nxt or not nxt.group(1).startswith(s["href"].rstrip("/") + "/"):
            break
        status, page, headers = _get(nxt.group(1), s["access_token"])
    return out

# ── Rapport d'une issue → commentaire sur la tâche ──────────────────────────
# La seule écriture vers Basecamp, au clic sur « publier » : le rapport d'une
# issue liée (`github.bc_issues`), sur la tâche de cette issue, une fois.
COMMENTS = "/buckets/{}/recordings/{}/comments.json"
_post_lock = threading.Lock()

class _Rich(HTMLParser):
    """HTML rendu par GitHub → ce que l'éditeur de Basecamp accepte. Le reste
    (classes, code, tableaux, images) est réduit à son texte."""
    KEEP = {"strong", "em", "ul", "ol", "li", "blockquote", "pre", "div", "h1"}
    BLOCK = {"ul", "ol", "blockquote", "pre", "div", "h1"}
    # Ligne vide entre deux blocs, comme l'écrit l'éditeur de Basecamp : sans
    # elle, paragraphes et listes s'y collent.
    GAP = "<div><br></div>"
    MAP  = {"p": "div", "b": "strong", "i": "em", "h2": "h1", "h3": "h1", "h4": "strong",
            "h5": "strong", "h6": "strong", "code": None, "tt": None}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.stack, self.seen = [], [], False

    def handle_starttag(self, tag, attrs):
        if tag == "br":
            return self.out.append("<br>")
        if tag == "a":
            href = dict(attrs).get("href") or ""
            ok = href.startswith(("https://", "http://"))
            self.stack.append("a" if ok else None)
            if ok:
                self.out.append(f'<a href="{html_escape(href, quote=True)}">')
            return
        if tag in ("script", "style", "template"):
            return self.stack.append("-")        # contenu jeté avec la balise
        t = self.MAP.get(tag, tag if tag in self.KEEP else None)
        top = not any(x and x != "-" for x in self.stack)
        self.stack.append(t)
        if t:
            if top and t in self.BLOCK and self.seen:
                self.out.append(self.GAP)
            if top and t in self.BLOCK:
                self.seen = True
            self.out.append(f"<{t}>")

    def handle_endtag(self, tag):
        if tag == "br" or not self.stack:
            return
        t = self.stack.pop()
        if t and t != "-":
            self.out.append(f"</{t}>")

    def handle_data(self, data):
        # retours à la ligne du HTML de GitHub entre deux blocs : sans valeur ici
        if "-" in self.stack:
            return
        if any(self.stack) or data.strip():
            self.out.append(html_escape(data, quote=False))

def rich_html(raw):
    p = _Rich()
    p.feed(raw or "")
    p.close()
    return "".join(p.out).strip()

def posted():
    """Issues traitées : id du commentaire-rapport publié → {url, ts} ; issue
    écartée sans publication (`propriétaire/repo#n`) → {ts, dismissed}."""
    try:
        v = store.read(store.BC_POSTED, {})
    except store.Broken:
        v = {}
    return v if isinstance(v, dict) else {}

def _post_comment(task_url, content):
    m = _TASK_URL.search(task_url or "")
    if not m:
        raise ValueError("adresse de tâche Basecamp attendue")
    s = _secret()
    if not (s.get("access_token") and s.get("href")):
        raise RuntimeError("Basecamp n'est pas connecté.")
    if (s.get("expires_at") or 0) - time.time() < REFRESH_AHEAD:
        s = _refresh_token(s)
    bucket, _, rid = m.groups()
    for attempt in (1, 2):
        req = urllib.request.Request(
            s["href"].rstrip("/") + COMMENTS.format(bucket, rid), method="POST",
            data=json.dumps({"content": content}).encode("utf-8"),
            headers={"Authorization": f"Bearer {s['access_token']}", "User-Agent": USER_AGENT,
                     "Content-Type": "application/json", "Accept": "application/json"})
        try:
            with _open(req) as r:
                body = json.loads(r.read() or b"null")
            return (body or {}).get("app_url") or task_url
        except urllib.error.HTTPError as e:
            if e.code == 401 and attempt == 1:
                s = _refresh_token(s)
                continue
            if e.code in (403, 404):
                raise RuntimeError("Basecamp refuse le commentaire : la tâche n'est plus accessible "
                                   "avec ce compte.") from None
            raise RuntimeError(f"Basecamp n'a pas pris le commentaire (HTTP {e.code}).") from None
        except urllib.error.URLError as e:
            raise RuntimeError(f"Basecamp injoignable : {e.reason}") from None

def dismiss(issue, undo=False):
    """Écarte une issue liée sans publier son rapport (ou la rétablit). Rien
    n'est envoyé à Basecamp : seulement noté ici."""
    key = f"{issue['repo']}#{issue['number']}"
    with _post_lock:
        done = posted()
        if undo:
            done.pop(key, None)
        else:
            done[key] = {"ts": time.time(), "dismissed": True}
        store.write(store.BC_POSTED, done)
    return done

def publish_report(issue):
    """Publie le rapport d'une issue liée en commentaire de sa tâche, une seule
    fois par rapport. Retourne {url, ts} (celui d'avant si déjà publié)."""
    rep = issue.get("report") or {}
    if not rep.get("id"):
        raise ValueError("pas de rapport pour cette issue")
    key = str(rep["id"])
    with _post_lock:
        done = posted()
        if key in done:
            return done[key]
        link = (f'<a href="{html_escape(issue.get("url") or "", quote=True)}">'
                f'{html_escape(issue.get("repo") or "")} #{issue.get("number")}</a>')
        content = ((rich_html(rep.get("html")) or f"<div>{html_escape(rep.get('body') or '')}</div>")
                   + _Rich.GAP + f"<div><em>🤖 Rapport de l'issue GitHub {link}</em></div>")
        url = _post_comment(issue.get("bc_url"), content)
        done[key] = {"url": url, "ts": time.time()}
        store.write(store.BC_POSTED, done)
        return done[key]

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
