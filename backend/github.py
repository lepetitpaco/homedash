"""Couche données GitHub — aucun HTML, uniquement des dicts sérialisables.

Couche données GitHub. Ce qui compte et pourquoi :
  · cache ETag        — GitHub ne décompte pas les 304, sans ça un cycle coûte ~70 appels
  · attribution des branches par PR + auteurs de commits (jamais par préfixe de nom)
  · cache de faits par (repo, branche, sha) — changer d'utilisateur ne coûte aucun appel
  · portes Renovate   — quand une version base-site peut être propagée aux autres repos
"""

import json
import os
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import OrderedDict, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import events
import store
import perflog

MAX_WORKERS = 10
ETAG_MAX    = 1000

try:
    DISPLAY_TZ = ZoneInfo(os.environ.get("TZ", "Europe/Paris"))
except ZoneInfoNotFoundError:
    DISPLAY_TZ = None

# ── Configuration (clé "github" de config.json) ───────────────────────────────
DEFAULTS = {
    "me": "", "repos": [], "branch_repos": [], "base_site_repos": [],
    "upstream_repo": "base-site", "renovate_author": "renovate[bot]",
    "users": [], "merged_count": 10, "cache_ttl": 120, "auto_refresh": 15,
}
CFG = dict(DEFAULTS)
_cfg_lock = threading.Lock()
_OWNERS   = {}          # repo -> propriétaire, pour les entrées `propriétaire/repo`

def configure(github_cfg):
    """Applique la section `github` du config.json. Rechargeable à chaud."""
    with _cfg_lock:
        # Repartir des défauts : une clé retirée de la config ne doit pas survivre.
        CFG.clear()
        CFG.update(DEFAULTS)
        CFG.update({k: v for k, v in (github_cfg or {}).items() if not k.startswith("_")})
        # Clé absente = mêmes repos que les PRs (anciennes configs). Liste vide =
        # vide : c'est ce que Réglages écrit quand on coupe « Branches » partout.
        if "branch_repos" not in (github_cfg or {}):
            CFG["branch_repos"] = list(CFG.get("repos", []))
        if not CFG.get("users"):
            CFG["users"] = [CFG["me"]] if CFG.get("me") else []
        if CFG.get("disabled"):
            # Rallumé plus tard : ce qui a bougé entre-temps n'est pas une nouveauté.
            _seeded["sections"].clear()
        # `users` accepte l'ancien format {login: prefix} comme le nouveau [login]
        CFG["users"] = list(CFG["users"])
        # Chaque repo s'écrit `propriétaire/repo`. Partout ailleurs il reste
        # désigné par son seul nom — c'est la clé que l'onglet Local retrouve dans
        # l'URL de son remote — et `owner()` rend le propriétaire à l'appel.
        _OWNERS.clear()
        for key in ("repos", "branch_repos", "base_site_repos"):
            names = []
            for entry in CFG.get(key) or []:
                own, _, name = entry.rpartition("/")
                if own:
                    _OWNERS[name] = own
                names.append(name)
            CFG[key] = names

        # Le repo socle de Renovate s'écrit lui aussi `propriétaire/repo`.
        up = CFG.get("upstream_repo") or ""
        if "/" in up:
            own, _, name = up.rpartition("/")
            _OWNERS[name] = own
            CFG["upstream_repo"] = name
        # Socle laissé au défaut (`base-site`) : il vit chez le propriétaire de
        # ses repos dérivés.
        name = CFG.get("upstream_repo")
        if name and name not in _OWNERS and CFG.get("base_site_repos"):
            _OWNERS[name] = _OWNERS.get(CFG["base_site_repos"][0], "")

def owner(repo, hint=None):
    """Propriétaire d'un repo : celui écrit dans la config (`propriétaire/repo`),
    sinon celui du remote local (`hint`)."""
    return _OWNERS.get(repo) or hint or ""

def enabled():
    # Plus d'organisation obligatoire : chaque repo porte son propriétaire.
    # `disabled` : GitHub coupé dans Réglages → Fonctionnalités.
    return bool(CFG.get("me")) and not CFG.get("disabled")

# ── Token ─────────────────────────────────────────────────────────────────────
# Ce module est chargé UNE FOIS PAR COMPTE par `accounts.py` : chaque copie a
# ses propres globales (jeton, cache ETag, données, amorçage du journal). Rien
# ici ne sait qu'il existe d'autres comptes ; c'est `accounts` qui donne le
# jeton (`apply_token`) et route les requêtes.
_TOKEN = None
_SOURCE = None                    # "ui" | None
ACCOUNT = {"id": "main", "label": ""}

def apply_token(value, source):
    """Nouveau jeton (ou None) : on repart de zéro. Le cache ETag et l'amorçage
    du journal valaient pour l'ancien — sans ça, les repos visibles d'un seul
    des deux passeraient pour des nouveautés."""
    global _TOKEN, _SOURCE
    changed = value != _TOKEN
    _TOKEN, _SOURCE = value or None, (source if value else None)
    if changed:
        with _etags_lock:
            _etags.clear()
        _auth_cache.clear()
        _seeded["sections"].clear()
        invalidate()

def token():
    return _TOKEN

def token_source():
    return _SOURCE

def probe(path, tok, params=None):
    """(statut, contenu, en-têtes) sans cache — pour la page Réglages, qui a
    besoin de savoir *pourquoi* un appel échoue, ce que `gh()` ne dit pas."""
    url = "https://api.github.com" + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {tok}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "homedash/1.0",
    })
    try:
        with urllib.request.urlopen(req, timeout=12) as r:
            return r.status, json.loads(r.read() or b"null"), r.headers
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read() or b"null")
        except Exception:
            body = None
        return e.code, body, e.headers
    except Exception as e:
        return 0, {"message": str(e)}, {}

_auth_cache = {}

def whoami(tok=None, fresh=False):
    """Compte du jeton, mis en cache une minute : la page Réglages le redemande
    à chaque ouverture."""
    tok = tok or _TOKEN
    if not tok:
        return {"ok": False, "error": None}
    hit = _auth_cache.get(tok)
    if hit and not fresh and time.time() - hit[0] < 60:
        return hit[1]
    status, body, headers = probe("/user", tok)
    if status == 200:
        info = {"ok": True, "login": body["login"], "name": body.get("name"),
                "avatar": body.get("avatar_url"),
                # jeton classic : liste des scopes ; fine-grained : en-tête absent
                "scopes": (headers.get("X-OAuth-Scopes") if headers else None),
                "rate_remaining": headers.get("X-RateLimit-Remaining") if headers else None}
    elif status == 401:
        info = {"ok": False, "error": "jeton refusé par GitHub (expiré ou révoqué)"}
    elif status == 0:
        info = {"ok": False, "error": f"GitHub injoignable : {(body or {}).get('message')}"}
    else:
        info = {"ok": False, "error": f"GitHub répond {status}"}
    _auth_cache[tok] = (time.time(), info)
    return info

def _paged(path, tok, params, limit=500):
    out, page = [], 1
    while len(out) < limit:
        status, body, _ = probe(path, tok, {**params, "per_page": 100, "page": page})
        if status != 200:
            return out if out else status
        out += body or []
        if len(body or []) < 100:
            break
        page += 1
    return out

def owners():
    """Comptes dont le jeton voit des repos : le sien, ses orgs. Les orgs sont
    aussi déduites des repos — un jeton fine-grained sans la permission
    « Members » voit les repos d'une org mais pas la liste de ses orgs."""
    me = whoami()
    if not me.get("ok"):
        return []
    seen = {me["login"].lower(): {"login": me["login"], "type": "User", "avatar": me.get("avatar")}}
    orgs = _paged("/user/orgs", _TOKEN, {}, limit=200)
    for o in orgs if isinstance(orgs, list) else []:
        seen.setdefault(o["login"].lower(), {"login": o["login"], "type": "Organization",
                                             "avatar": o.get("avatar_url")})
    repos = _paged("/user/repos", _TOKEN, {"sort": "pushed"}, limit=300)
    for r in repos if isinstance(repos, list) else []:
        o = r.get("owner") or {}
        seen.setdefault(o.get("login", "").lower(), {"login": o.get("login"), "type": o.get("type"),
                                                     "avatar": o.get("avatar_url")})
    return [v for v in seen.values() if v["login"]]

# Pseudo-compte des Réglages : les repos d'autres comptes perso où le jeton est
# collaborateur (`/users/x/repos` n'en montrerait que les publics).
SHARED = "@partages"

def repos_of(account):
    """Repos visibles de `account`, les plus actifs d'abord."""
    me = whoami()
    if account == SHARED:
        data = _paged("/user/repos", _TOKEN, {"affiliation": "collaborator", "sort": "pushed"})
        # Ceux des orgs ont déjà leur onglet.
        if isinstance(data, list):
            data = [r for r in data if (r.get("owner") or {}).get("type") != "Organization"]
    elif me.get("ok") and account.lower() == me["login"].lower():
        data = _paged("/user/repos", _TOKEN, {"affiliation": "owner", "sort": "pushed"})
    else:
        data = _paged(f"/orgs/{account}/repos", _TOKEN, {"type": "all", "sort": "pushed"})
        if data == 404:
            data = _paged(f"/users/{account}/repos", _TOKEN, {"sort": "pushed"})
    if not isinstance(data, list):
        return {"error": f"GitHub répond {data} pour {account}"}
    data.sort(key=lambda r: r.get("pushed_at") or "", reverse=True)
    return {"repos": [{"name": r["name"], "full_name": r["full_name"],
                       "owner": r["owner"]["login"], "private": r.get("private"),
                       "archived": r.get("archived"), "pushed_at": r.get("pushed_at"),
                       "description": r.get("description")} for r in data]}

def members_of(org):
    data = _paged(f"/orgs/{org}/members", _TOKEN, {}, limit=300)
    if not isinstance(data, list):
        return {"error": "liste des membres inaccessible avec ce jeton"
                         if data in (403, 404) else f"GitHub répond {data}"}
    return {"members": [{"login": m["login"], "avatar": m.get("avatar_url")} for m in data]}

def lookup_user(login):
    status, body, _ = probe(f"/users/{urllib.parse.quote(login)}", _TOKEN)
    if status == 200:
        return {"login": body["login"], "name": body.get("name"), "avatar": body.get("avatar_url")}
    return None

# ── Appels API, avec requêtes conditionnelles ────────────────────────────────
_etags      = OrderedDict()   # url -> (etag, payload)
_etags_lock = threading.Lock()
STATS       = {"calls": 0, "hits": 0, "errors": 0}

def gh(path, token, params=None, cache=True, accept="application/vnd.github+json"):
    url = "https://api.github.com" + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    # même adresse, autre format (`full+json` : le HTML en plus) = autre entrée du cache
    key = url if accept == "application/vnd.github+json" else f"{url} {accept}"

    cached = None
    if cache:
        with _etags_lock:
            cached = _etags.get(key)
            if cached:
                _etags.move_to_end(key)

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": accept,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "homedash/1.0",
    }
    if cached:
        headers["If-None-Match"] = cached[0]

    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=12) as r:
            payload = json.loads(r.read())
            etag    = r.headers.get("ETag")
            if cache and etag:
                with _etags_lock:
                    _etags[key] = (etag, payload)
                    _etags.move_to_end(key)
                    while len(_etags) > ETAG_MAX:
                        _etags.popitem(last=False)
            with _etags_lock:
                STATS["calls"] += 1
            return payload
    except urllib.error.HTTPError as e:
        if e.code == 304 and cached:          # inchangé → hors quota
            with _etags_lock:
                STATS["hits"] += 1
            return cached[1]
        with _etags_lock:
            STATS["errors"] += 1
        print(f"    ✗ {path}: HTTP {e.code}", file=sys.stderr)
        # GitHub indisponible un instant (5xx) : la dernière réponse connue plutôt
        # qu'un vide. Sinon une liste disparaît un cycle puis « réapparaît », et
        # ses PRs passent pour nouvelles (cloche : « PR mergée » d'hier).
        return cached[1] if cached and e.code >= 500 else None
    except Exception as e:
        with _etags_lock:
            STATS["errors"] += 1
        print(f"    ✗ {path}: {e}", file=sys.stderr)
        return cached[1] if cached else None

# ── Utilitaires ───────────────────────────────────────────────────────────────
def fmt_dt(iso_str):
    if not iso_str:
        return ""
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return dt.astimezone(DISPLAY_TZ).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return iso_str[:19].replace("T", " ")

import re
_VERSION_RE = re.compile(r"\bv?(\d+\.\d+(?:\.\d+)?(?:[-.][\w]+)*)\b")

def parse_version(title):
    m = _VERSION_RE.search(title or "")
    return m.group(1) if m else None

def _check_state(r):
    """(état, icône) d'un check_run individuel."""
    conc, stat = r.get("conclusion"), r.get("status")
    if conc in ("failure", "error", "timed_out"):                 return "fail", "✗"
    if conc in ("success", "neutral"):                            return "pass", "✓"
    if stat in ("in_progress", "queued", "waiting", "pending"):    return "pending", "⟳"
    if conc in ("cancelled", "skipped"):                          return "unknown", "⊘"
    return "unknown", "?"

def fetch_check_runs(sha, repo, token):
    data = gh(f"/repos/{owner(repo)}/{repo}/commits/{sha}/check-runs", token, {"per_page": 100})
    return (data or {}).get("check_runs", [])

def ci_summary(runs):
    """Agrège des check_runs : {state, label, total, counts, checks[]}."""
    if not runs:
        return {"state": "unknown", "label": "No CI", "total": 0, "checks": []}
    checks = []
    for r in runs:
        state, icon = _check_state(r)
        checks.append({
            "name":  r.get("name", "?"),
            "state": state, "icon": icon,
            "url":   r.get("html_url") or r.get("details_url") or "",
        })
    n     = len(checks)
    fail  = sum(1 for c in checks if c["state"] == "fail")
    pend  = sum(1 for c in checks if c["state"] == "pending")
    ok    = sum(1 for c in checks if c["state"] == "pass")
    if fail:   state, label = "fail",    f"✗ {fail}/{n}"
    elif pend: state, label = "pending", f"⟳ {pend}/{n}"
    elif ok:   state, label = "pass",    f"✓ {ok}"
    else:      state, label = "unknown", f"⊘ {n}"
    return {"state": state, "label": label, "total": n, "checks": checks}

def ci_of(sha, repo, token):
    return ci_summary(fetch_check_runs(sha, repo, token))

# ── Attribution des branches ──────────────────────────────────────────────────
# Trois signaux, du plus fiable au moins fiable :
#   1. la PR dont head.ref == la branche  → son auteur a créé la branche
#   2. les commits propres à la branche (compare default...branche)
#   3. l'auteur du commit de tête, pour une branche déjà entièrement mergée
_branch_facts = {}
_branch_lock  = threading.Lock()
# Instantané des branches réellement présentes sur GitHub, par repo. Sert à
# l'onglet Local : un `refs/remotes/origin/x` local peut survivre des semaines à
# la suppression de la branche sur GitHub, faute de `git fetch --prune`.
_remote_state = {}

def _commit_author(c):
    """Un commit dont l'email n'est lié à aucun compte reste non attribué :
    mesuré 1 sur 344, un repli par alias de nom coûte plus qu'il ne rapporte."""
    return (c.get("author") or {}).get("login") or (c.get("committer") or {}).get("login")

def _branch_pr(repo, sha, name, token):
    """PR du commit de tête, seulement si elle pointe bien sur CETTE branche :
    un commit partagé entre branches remonte sinon la PR d'une autre."""
    for pr in gh(f"/repos/{owner(repo)}/{repo}/commits/{sha}/pulls", token, {"per_page": 20}) or []:
        if (pr.get("head") or {}).get("ref") != name:
            continue
        return {"number": pr["number"], "url": pr["html_url"],
                "author": (pr.get("user") or {}).get("login"),
                "merged": bool(pr.get("merged_at"))}
    return None

def _branch_fact(repo, base, b, token):
    name, sha = b["name"], b["commit"]["sha"]
    key = (repo, name, sha)
    with _branch_lock:
        hit = _branch_facts.get(key)
    if hit is not None:
        return hit

    cmp_ = gh(f"/repos/{owner(repo)}/{repo}/compare/"
              f"{urllib.parse.quote(base, safe='')}...{urllib.parse.quote(name, safe='')}",
              token, {"per_page": 100})
    if cmp_ is None:
        return None

    commits = cmp_.get("commits") or []
    ahead   = cmp_.get("ahead_by") or 0
    authors, pr = [], None

    if commits:
        for c in commits:
            a = _commit_author(c)
            if a and a not in authors:
                authors.append(a)
        creator, creator_src = _commit_author(commits[0]), "commit"
        last_author = _commit_author(commits[-1])
        date_raw    = commits[-1].get("commit", {}).get("author", {}).get("date", "")
    else:
        # Branche entièrement mergée : le merge base EST le commit de tête,
        # donc son auteur et sa date sortent du même appel, sans surcoût.
        mb          = cmp_.get("merge_base_commit") or {}
        date_raw    = mb.get("commit", {}).get("author", {}).get("date", "")
        tip         = _commit_author(mb)
        last_author = tip
        authors     = [tip] if tip else []
        creator, creator_src = tip, "tip"
        pr = _branch_pr(repo, sha, name, token)
        if pr and pr.get("author"):
            creator, creator_src = pr["author"], "pr"
            if pr["author"] not in authors:
                authors.append(pr["author"])

    fact = {
        "repo": repo, "name": name, "sha": sha, "base": base,
        "date": fmt_dt(date_raw), "date_raw": date_raw,
        "ahead": ahead, "merged": ahead == 0,
        "creator": creator, "creator_src": creator_src,
        "last_author": last_author, "authors": authors, "pr": pr,
        "url": f"https://github.com/{owner(repo)}/{repo}/tree/{urllib.parse.quote(name, safe='/')}",
    }
    with _branch_lock:
        _branch_facts[key] = fact
    return fact

def _repo_branch_facts(args):
    repo, token = args
    meta = gh(f"/repos/{owner(repo)}/{repo}", token) or {}
    base = meta.get("default_branch") or "master"

    branches, every, page = [], {}, 1
    while True:
        data = gh(f"/repos/{owner(repo)}/{repo}/branches", token, {"per_page": 100, "page": page}) or []
        branches += [b for b in data if b["name"] != base]
        every.update({b["name"]: b["commit"]["sha"] for b in data})
        if len(data) < 100:
            break
        page += 1
    with _branch_lock:
        before = _remote_state.get(repo) or {}
        # La version ne bouge que si le distant a changé : l'onglet Local relance
        # un scan complet du disque à chaque nouvelle version, et GitHub est relu
        # toutes les ~15 s (presque toujours des 304, donc rien de neuf).
        if before.get("default") != base or before.get("branches") != every:
            _remote_state["#version"] = _remote_state.get("#version", 0) + 1
        _remote_state[repo] = {"default": base, "branches": every, "ts": time.time()}

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        facts = [f for f in ex.map(lambda b: _branch_fact(repo, base, b, token), branches) if f]

    live = {(repo, b["name"], b["commit"]["sha"]) for b in branches}
    with _branch_lock:
        for k in [k for k in _branch_facts if k[0] == repo and k not in live]:
            del _branch_facts[k]
    return facts

def remote_version():
    """Compteur des instantanés distants. L'onglet Local s'en sert pour relancer
    son scan dès que GitHub a répondu, au lieu d'attendre son propre cycle."""
    with _branch_lock:
        return _remote_state.get("#version", 0)

def remote_snapshot(repo):
    """{default, branches: {nom: sha}, ts} tel que vu au dernier fetch, ou None
    si ce repo n'a jamais été interrogé (GitHub désactivé, repo hors config…)."""
    with _branch_lock:
        snap = _remote_state.get(repo)
        return dict(snap) if isinstance(snap, dict) else None

def branch_facts_index():
    """{(repo, branche): fait} — PR et état mergé, pour l'onglet Local."""
    with _branch_lock:
        return {(r, n): f for (r, n, _sha), f in _branch_facts.items()}

def pr_for_branch(repo, branch, hint=None):
    """PR dont `head.ref` est `branch`, même fermée, même branche supprimée.

    Recherche par nom de branche et non par sha : quand GitHub a squashé puis
    supprimé la branche, le commit local n'existe plus côté distant et seul le
    nom permet de retrouver la PR. Sans ça, impossible de distinguer « déjà
    mergée, tu peux jeter » de « du travail qui n'existe que chez toi »."""
    own = owner(repo, hint)
    if not _TOKEN or not own:
        return None
    data = gh(f"/repos/{own}/{repo}/pulls", _TOKEN,
              {"state": "all", "head": f"{own}:{branch}", "per_page": 10}) or []
    best = None
    for pr in data:
        if (pr.get("head") or {}).get("ref") != branch:
            continue
        cand = {"number": pr["number"], "url": pr["html_url"],
                "author": (pr.get("user") or {}).get("login"),
                "merged": bool(pr.get("merged_at")), "merged_at": pr.get("merged_at"),
                "state": pr.get("state")}
        if cand["merged"]:
            return cand                 # une PR mergée tranche, on s'arrête
        best = best or cand
    return best

def branch_role(fact, user):
    if fact.get("creator") == user:
        return "creator"
    if user in (fact.get("authors") or []):
        return "contributor"
    return None

def _neg_date(raw):
    return tuple(-ord(c) for c in (raw or ""))

def fetch_branches(token, user):
    repos = CFG.get("branch_repos") or []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        facts = [f for sub in ex.map(_repo_branch_facts, [(r, token) for r in repos]) for f in sub]
    mine = [{**f, "role": role} for f in facts if (role := branch_role(f, user))]
    mine.sort(key=lambda b: (b["merged"], _neg_date(b["date_raw"])))
    return mine

# ── PRs ───────────────────────────────────────────────────────────────────────
def fetch_prs(token, user):

    def repo_prs(repo):
        pulls = gh(f"/repos/{owner(repo)}/{repo}/pulls", token, {"state": "open", "per_page": 20}) or []
        return [(repo, pr) for pr in pulls if (pr.get("user") or {}).get("login") == user]

    def enrich(item):
        repo, pr = item
        return {
            "repo": repo, "number": pr["number"], "title": pr["title"],
            "branch": pr["head"]["ref"], "url": pr["html_url"],
            "created_at": fmt_dt(pr["created_at"]),
            "ci": ci_of(pr["head"]["sha"], repo, token),
        }

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        tasks = [i for sub in ex.map(repo_prs, CFG.get("repos", [])) for i in sub]
    if not tasks:
        return []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        return list(ex.map(enrich, tasks))

def fetch_merged(token, user):
    count = CFG.get("merged_count", 10)
    if not count:
        return []

    def repo_merged(repo):
        pulls = gh(f"/repos/{owner(repo)}/{repo}/pulls", token,
                   {"state": "closed", "per_page": count, "sort": "updated",
                    "direction": "desc"}) or []
        return [(repo, pr) for pr in pulls
                if (pr.get("user") or {}).get("login") == user and pr.get("merged_at")]

    def enrich(item):
        repo, pr = item
        sha = pr.get("merge_commit_sha") or pr["head"]["sha"]
        return {
            "repo": repo, "number": pr["number"], "title": pr["title"],
            # la branche sert à rapprocher la PR de sa copie locale, onglet Local
            "branch": (pr.get("head") or {}).get("ref"),
            "merged_at": fmt_dt(pr["merged_at"]), "merged_at_raw": pr["merged_at"],
            "url": pr["html_url"], "ci": ci_of(sha, repo, token),
        }

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        tasks = [i for sub in ex.map(repo_merged, CFG.get("repos", [])) for i in sub]
    if not tasks:
        return []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        out = list(ex.map(enrich, tasks))
    out.sort(key=lambda p: p["merged_at_raw"], reverse=True)
    return out[:count]

# ── Issues liées à Basecamp ───────────────────────────────────────────────────
# Une issue créée depuis l'onglet Basecamp porte `<!-- homedash:bc <adresse de la
# tâche> -->` ; le rapport à reporter sur la tâche est un commentaire qui commence
# par `<!-- homedash:bc-report -->`. Ici on les lit ; la création (`create_issue`)
# et la publication du rapport (`basecamp.publish_report`) se font au clic.
BC_LINK   = re.compile(r"<!--\s*homedash:bc\s+(https?://\S+?)\s*-->")
BC_REPORT = re.compile(r"\A\s*<!--\s*homedash:bc-report\s*-->\s*")
# issues relues par repo, les plus récemment modifiées (PRs comprises : l'API les
# mêle aux issues). Fermer une issue la remet en tête : son rapport reste visible.
BC_ISSUES_SCAN = 100

def bc_report(comments):
    """Dernier commentaire-rapport d'une issue, marqueur retiré ; None s'il n'y en a pas."""
    for c in reversed(comments or []):
        body = c.get("body") or ""
        if BC_REPORT.match(body):
            return {
                "id": c.get("id"), "url": c.get("html_url") or "",
                "body": BC_REPORT.sub("", body).strip(),
                # HTML rendu par GitHub : ce qui part sur Basecamp, jamais affiché ici
                "html": re.sub(r"<!--.*?-->", "", c.get("body_html") or "", flags=re.S).strip(),
                "author": (c.get("user") or {}).get("login") or "",
                "ts": c.get("updated_at") or c.get("created_at") or "",
            }
    return None

def fetch_bc_issues(token):
    def repo_issues(repo):
        items = gh(f"/repos/{owner(repo)}/{repo}/issues", token,
                   {"state": "all", "sort": "updated", "direction": "desc",
                    "per_page": BC_ISSUES_SCAN})
        out = []
        for it in items if isinstance(items, list) else []:
            m = BC_LINK.search(it.get("body") or "")
            if m and not it.get("pull_request"):
                out.append((repo, it, m.group(1)))
        return out

    def enrich(item):
        repo, it, bc_url = item
        report = None
        n = it.get("comments") or 0
        if n:
            # le rapport arrive en dernier : la dernière page suffit
            comments = gh(f"/repos/{owner(repo)}/{repo}/issues/{it['number']}/comments", token,
                          {"per_page": 100, "page": (n - 1) // 100 + 1},
                          accept="application/vnd.github.full+json")
            report = bc_report(comments if isinstance(comments, list) else [])
        return {
            "repo": f"{owner(repo)}/{repo}", "number": it["number"], "title": it.get("title") or "",
            "url": it.get("html_url") or "", "state": it.get("state") or "open",
            "bc_url": bc_url, "updated_at": it.get("updated_at") or "", "report": report,
        }

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        tasks = [i for sub in ex.map(repo_issues, CFG.get("repos", [])) for i in sub]
    if not tasks:
        return []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        out = list(ex.map(enrich, tasks))
    out.sort(key=lambda i: i["updated_at"], reverse=True)
    return out

class CannotWrite(Exception):
    """GitHub refuse la création : jeton en lecture seule, ou repo sans issues."""

def create_issue(repo, title, body):
    """Seule écriture de homedash vers GitHub : une issue, à la demande (onglet
    Basecamp). `repo` = `propriétaire/repo`, forcément un repo suivi par ce compte."""
    own, _, name = (repo or "").rpartition("/")
    if not own or name not in CFG.get("repos", []) or owner(name) != own:
        raise ValueError("repo non suivi par ce compte")
    if not _TOKEN:
        raise CannotWrite("compte GitHub non connecté")
    req = urllib.request.Request(
        f"https://api.github.com/repos/{own}/{name}/issues", method="POST",
        data=json.dumps({"title": title, "body": body}).encode("utf-8"),
        headers={"Authorization": f"Bearer {_TOKEN}", "Accept": "application/vnd.github+json",
                 "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "homedash/1.0",
                 "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            it = json.loads(r.read())
    except urllib.error.HTTPError as e:
        # 403 / 404 : pas le droit d'écrire (fine-grained en lecture seule) ; 410 : issues coupées
        if e.code in (403, 404, 410):
            raise CannotWrite(f"HTTP {e.code}") from e
        raise
    m = BC_LINK.search(body or "")
    if m:
        # visible tout de suite sur sa tâche, sans attendre la prochaine relecture
        _data["issues"] = [{
            "repo": repo, "number": it.get("number"), "title": it.get("title") or title,
            "url": it.get("html_url") or "", "state": "open", "bc_url": m.group(1),
            "updated_at": it.get("updated_at") or "", "report": None,
        }] + [i for i in _data["issues"] if (i["repo"], i["number"]) != (repo, it.get("number"))]
    return {"number": it.get("number"), "url": it.get("html_url") or ""}

def bc_issues():
    """Issues liées à Basecamp et repos où en créer, pour l'onglet Basecamp."""
    return {"issues": _data["issues"],
            "repos": [f"{owner(r)}/{r}" for r in CFG.get("repos", []) if owner(r)]}

# ── Renovate ──────────────────────────────────────────────────────────────────
def fetch_renovate(token):
    author   = CFG.get("renovate_author", "renovate[bot]")
    upstream = CFG.get("upstream_repo") or ""
    since    = (datetime.now(timezone.utc) - timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%SZ")

    def repo_data(args):
        repo, is_up = args
        opens, merged = [], []
        for pr in gh(f"/repos/{owner(repo)}/{repo}/pulls", token, {"state": "open", "per_page": 20}) or []:
            if (pr.get("user") or {}).get("login") != author:
                continue
            if not is_up and "base-site" not in (pr.get("head") or {}).get("ref", ""):
                continue
            opens.append((repo, pr, is_up))
        for pr in gh(f"/repos/{owner(repo)}/{repo}/pulls", token,
                     {"state": "closed", "per_page": 10, "sort": "updated",
                      "direction": "desc"}) or []:
            if (pr.get("user") or {}).get("login") != author:
                continue
            if not is_up and "base-site" not in (pr.get("head") or {}).get("ref", ""):
                continue
            if not (pr.get("merged_at") and pr["merged_at"] >= since):
                continue
            merged.append({
                "repo": repo, "number": pr["number"], "title": pr["title"],
                "merged_at": fmt_dt(pr["merged_at"]), "merged_at_raw": pr["merged_at"],
                "url": pr["html_url"], "merge_commit_sha": pr.get("merge_commit_sha"),
                "upstream": is_up, "version": parse_version(pr["title"]),
            })
        return opens, merged

    def enrich_open(args):
        repo, pr, is_up = args
        return {
            "repo": repo, "number": pr["number"], "title": pr["title"],
            "created_at": fmt_dt(pr["created_at"]), "url": pr["html_url"],
            "upstream": is_up, "version": parse_version(pr["title"]),
            "ci": ci_of(pr["head"]["sha"], repo, token),
        }

    def enrich_merged(pr):
        sha  = pr.get("merge_commit_sha")
        runs = fetch_check_runs(sha, pr["repo"], token) if sha else []
        return {**pr, "ci": ci_summary(runs)}

    # Sans repo dérivé, rien à suivre : un compte neuf (ou perso) ne doit pas
    # interroger un `base-site` par défaut qui n'existe pas chez lui.
    if not CFG.get("base_site_repos"):
        return [], []
    targets = [(r, False) for r in CFG.get("base_site_repos", []) if owner(r)]
    if upstream and owner(upstream):
        targets.append((upstream, True))

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        results = list(ex.map(repo_data, targets))
    opens  = [i for o, _ in results for i in o]
    merged = [i for _, m in results for i in m]

    if opens:
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
            opens = list(ex.map(enrich_open, opens))
    if merged:
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
            merged = list(ex.map(enrich_merged, merged))
    return opens, merged

# ── Portes : quand peut-on propager une version base-site ? ──────────────────
def version_gate(version, merged_prs):
    """Le premier projet mergé sert de test : tant que sa CI tourne, on ne
    propage pas la version aux autres projets."""
    same = [p for p in merged_prs if (p.get("version") or "—") == version]
    if not same:
        return None
    names = lambda items: ", ".join(sorted({p["repo"] for p in items}))
    state = lambda p: (p.get("ci") or {}).get("state")
    failed  = [p for p in same if state(p) == "fail"]
    running = [p for p in same if state(p) == "pending"]
    passed  = [p for p in same if state(p) == "pass"]
    if failed:
        return {"cls": "blocked", "icon": "⛔",
                "title": f"base-site {version} — CI en échec sur {names(failed)}",
                "detail": "Ne pas merger cette version sur les autres projets."}
    if running:
        return {"cls": "running", "icon": "⏳",
                "title": f"base-site {version} — build & tests en cours sur {names(running)}",
                "detail": "Attendre la CI verte avant de propager aux autres projets."}
    if passed:
        return {"cls": "ready", "icon": "✅",
                "title": f"base-site {version} — validée sur {names(passed)}",
                "detail": "Feu vert : les PRs restantes peuvent être mergées."}
    return None

def upstream_gate(up_open, up_merged):
    """État de la PR amont (dans le repo base-site lui-même)."""
    merged = sorted(up_merged, key=lambda p: p.get("merged_at_raw") or "", reverse=True)
    state  = lambda p: (p.get("ci") or {}).get("state")
    if merged:
        p, v = merged[0], merged[0].get("version") or "?"
        if state(p) == "pending":
            return {"cls": "running", "icon": "⏳", "version": p.get("version"),
                    "title": f"base-site {v} — mergée, build & tests en cours",
                    "detail": "Attendre la CI verte avant de merger les PRs des autres projets."}
        if state(p) == "fail":
            return {"cls": "blocked", "icon": "⛔", "version": p.get("version"),
                    "title": f"base-site {v} — CI en échec après merge",
                    "detail": "Ne pas merger les PRs downstream tant que ce n'est pas corrigé."}
        if state(p) == "pass":
            return {"cls": "ready", "icon": "✅", "version": None,
                    "title": f"base-site {v} — publiée, CI verte",
                    "detail": "Feu vert : les PRs Renovate downstream peuvent être mergées."}
        return {"cls": "running", "icon": "⏳", "version": p.get("version"),
                "title": f"base-site {v} — mergée, CI inconnue",
                "detail": "Aucun check sur le commit de merge — vérifier avant de propager."}
    if up_open:
        p = sorted(up_open, key=lambda x: x.get("created_at") or "", reverse=True)[0]
        v = p.get("version") or "?"
        if state(p) == "fail":
            return {"cls": "blocked", "icon": "⛔", "version": p.get("version"),
                    "title": f"base-site {v} — PR ouverte, CI en échec",
                    "detail": "La version amont n'est pas mergeable : rien à propager."}
        if state(p) == "pending":
            return {"cls": "running", "icon": "⏳", "version": p.get("version"),
                    "title": f"base-site {v} — PR ouverte, tests en cours",
                    "detail": "Pas encore mergée : les autres projets attendent cette version."}
        if state(p) == "pass":
            return {"cls": "open", "icon": "🟢", "version": p.get("version"),
                    "title": f"base-site {v} — PR ouverte, CI verte, à merger",
                    "detail": "Merger cette PR pour débloquer les autres projets."}
        return {"cls": "open", "icon": "🔵", "version": p.get("version"),
                "title": f"base-site {v} — PR ouverte",
                "detail": "Pas encore mergée : les autres projets attendent cette version."}
    return None

def group_by_version(items):
    groups = defaultdict(list)
    for p in items:
        groups[p.get("version") or "—"].append(p)
    def vkey(v):
        if v == "—":
            return (1, ())
        try:
            return (0, tuple(int(x) for x in re.findall(r"\d+", v)))
        except Exception:
            return (1, ())
    return [{"version": v, "items": items}
            for v, items in sorted(groups.items(), key=lambda kv: vkey(kv[0]), reverse=True)]

# ── Journal : ce qui a changé d'un cycle à l'autre ───────────────────────────
# Le diff vit ici et nulle part ailleurs. Il alimentait autrefois les seules
# notifications, calculées dans le navigateur ; il alimente maintenant le journal,
# dont les notifications ne sont qu'un rendu. Deux implémentations du même diff
# auraient fini par diverger, et c'est la page qui aurait eu tort.
# Sections déjà vues, ET pour quel utilisateur : la première passe ne notifie
# rien. L'utilisateur en fait partie parce que `_data` change en bloc quand on
# change d'observé — comparer les PRs de l'un à celles de l'autre produirait
# vingt « nouveauté » qui ne sont que le point de vue qui a bougé. Le drapeau ne
# peut pas vivre dans `set_user()` : un fetch déjà en vol le rétablirait juste
# après, et c'est le cycle suivant qui déborderait.
_seeded = {"user": None, "sections": set()}

def _pr_key(p):
    return f"{p['repo']}#{p['number']}"

def _by_key(items):
    return {_pr_key(p): p for p in items or []}

def _ci_state(p):
    return (p.get("ci") or {}).get("state")

def _diff(before, after, todo, since=None):
    """Événements du cycle, pour les seules sections `todo` déjà amorcées.

    Une section jamais vue ne produit rien : au premier fetch tout est « nouveau »
    et le journal se remplirait de l'état courant au lieu de ses changements.
    `since` (ISO UTC) : début du cycle précédent, moins une marge ; une PR mergée
    avant n'est pas annoncée.
    """
    out = []
    up  = CFG.get("upstream_repo") or "upstream"

    if "prs" in todo:
        old = _by_key(before.get("prs"))
        for pr in after.get("prs") or []:
            was = old.get(_pr_key(pr))
            if _ci_state(pr) == "fail" and _ci_state(was or {}) != "fail":
                out.append(events.event(
                    "pr-fail", "bad", "github",
                    f"✗ CI fail — {pr['repo']} #{pr['number']}", pr["title"],
                    pr["repo"], pr["url"], f"pr:{_pr_key(pr)}", sticky=True))
            # `was` obligatoire : une PR découverte déjà verte n'est pas un
            # passage au vert, c'est juste la première fois qu'on la voit.
            elif _ci_state(pr) == "pass" and was and _ci_state(was) != "pass":
                out.append(events.event(
                    "pr-pass", "ok", "github",
                    f"✓ CI pass — {pr['repo']} #{pr['number']}", pr["title"],
                    pr["repo"], pr["url"], f"pr:{_pr_key(pr)}"))

    # L'événement qu'on attend le plus souvent devant l'écran : « ça y est,
    # c'est mergé ». Il n'existait pas dans les notifications d'origine.
    just_merged = set()
    if "merged" in todo:
        old = _by_key(before.get("merged"))
        for pr in after.get("merged") or []:
            if _pr_key(pr) in old:
                continue
            # Absente du cycle d'avant mais mergée bien avant (liste tronquée,
            # réponse manquée) : ce n'est pas une nouvelle.
            if since and (pr.get("merged_at_raw") or "") < since:
                continue
            just_merged.add((pr["repo"], pr.get("branch")))
            out.append(events.event(
                "pr-merged", "ok", "github",
                f"🎉 PR mergée — {pr['repo']} #{pr['number']}", pr["title"],
                pr["repo"], pr["url"], f"merged:{_pr_key(pr)}", sticky=True))

    if "branches" in todo:
        old = {(b["repo"], b["name"]): b for b in before.get("branches") or []}
        for b in after.get("branches") or []:
            was = old.get((b["repo"], b["name"]))
            if not was or was.get("merged") or not b.get("merged"):
                continue
            # Mergée par une PR à moi : `pr-merged` l'a déjà dit, et le dire deux
            # fois pour un seul événement réel est le meilleur moyen qu'on cesse
            # de lire le journal.
            if (b["repo"], b["name"]) in just_merged:
                continue
            out.append(events.event(
                "branch-merged", "ok", "github",
                f"🌿 {b['name']} est mergée dans {b['base']}",
                f"{b['repo']} — plus rien de propre à cette branche.",
                b["repo"], b["url"], f"br:{b['repo']}/{b['name']}"))

    if "renovate" in todo:
        old = _by_key(before.get("renovate"))
        for pr in after.get("renovate") or []:
            was = old.get(_pr_key(pr))
            if not was:
                out.append(events.event(
                    "ren-new", "info", "github",
                    f"🤖 Renovate disponible — {pr['repo']}", pr["title"],
                    pr["repo"], pr["url"], f"ren:{_pr_key(pr)}"))
            elif _ci_state(pr) == "fail" and _ci_state(was) != "fail":
                out.append(events.event(
                    "ren-fail", "bad", "github",
                    f"🤖 Renovate CI fail — {pr['repo']} #{pr['number']}", pr["title"],
                    pr["repo"], pr["url"], f"renci:{_pr_key(pr)}", sticky=True))

        old = _by_key(before.get("renovate_merged"))
        for pr in after.get("renovate_merged") or []:
            was = old.get(_pr_key(pr))
            v   = f" v{pr['version']}" if pr.get("version") else ""
            if not was:
                out.append(events.event(
                    "rm-new", "ok", "github",
                    f"✅ Renovate mergée — {pr['repo']}{v}", pr["title"],
                    pr["repo"], pr["url"], f"rm:{_pr_key(pr)}"))
            elif _ci_state(pr) != _ci_state(was):
                # C'est CE signal qui débloque (ou bloque) les autres projets.
                if _ci_state(pr) == "pass":
                    out.append(events.event(
                        "rm-pass", "ok", "github",
                        f"🟢 {up}{v} validée sur {pr['repo']}",
                        "CI verte : tu peux merger les autres projets.",
                        pr["repo"], pr["url"], f"rmci:{_pr_key(pr)}", sticky=True))
                elif _ci_state(pr) == "fail":
                    out.append(events.event(
                        "rm-fail", "bad", "github",
                        f"⛔ {up}{v} KO sur {pr['repo']}",
                        "CI en échec après merge : ne pas propager.",
                        pr["repo"], pr["url"], f"rmci:{_pr_key(pr)}", sticky=True))

    # Rapport posté sur une issue liée : il attend d'être publié sur Basecamp.
    if "issues" in todo:
        old = {(i["repo"], i["number"]): i.get("report") for i in before.get("issues") or []}
        for i in after.get("issues") or []:
            rep = i.get("report")
            was = old.get((i["repo"], i["number"]))
            if rep and (not was or was.get("id") != rep.get("id")):
                out.append(events.event(
                    "bc-report", "ok", "basecamp",
                    f"📤 Rapport prêt — {i['repo']} #{i['number']}",
                    f"{i['title']} · à publier sur la tâche Basecamp",
                    i["repo"], i["url"], f"bcrep:{i['repo']}#{i['number']}", sticky=True))
    return out

# ── État partagé + rafraîchissement ──────────────────────────────────────────
_data  = {"branches": [], "prs": [], "renovate": [], "renovate_merged": [], "merged": [], "issues": []}
_state = {"ts": 0.0, "building": False, "lock": threading.Lock(), "user": None, "error": None}

def current_user():
    with _state["lock"]:
        return _state["user"] or CFG.get("me") or ""

def set_user(login):
    if login not in CFG.get("users", []):
        return False
    with _state["lock"]:
        _state["user"] = login
        _state["ts"]   = 0.0       # force un rafraîchissement
    return True

def invalidate():
    with _state["lock"]:
        _state["ts"] = 0.0

SECTIONS = ("branches", "prs", "renovate", "merged", "issues")

def rebuild(token, sections=None):
    """Rafraîchit tout, ou seulement les sections demandées (bouton ↻ d'une carte)."""
    started_at = time.monotonic()
    user = current_user()
    todo = tuple(s for s in (sections or SECTIONS) if s in SECTIONS) or SECTIONS
    label = "tout" if len(todo) == len(SECTIONS) else ", ".join(todo)
    print(f"⏳ GitHub : fetch {label} pour {user}… "
          f"[{datetime.now().strftime('%H:%M:%S')}]", flush=True)
    try:
        jobs = {
            "branches": lambda: fetch_branches(token, user),
            "prs":      lambda: fetch_prs(token, user),
            "renovate": lambda: fetch_renovate(token),
            "merged":   lambda: fetch_merged(token, user),
            "issues":   lambda: fetch_bc_issues(token),
        }
        with ThreadPoolExecutor(max_workers=len(todo)) as ex:
            futures = {name: ex.submit(jobs[name]) for name in todo}
        # Instantané d'avant : `_data[k]` est remplacé, jamais muté, donc garder
        # les références suffit — pas de copie profonde à payer.
        before = dict(_data)
        for name, future in futures.items():
            if name == "renovate":
                opens, merged = future.result()
                _data["renovate"], _data["renovate_merged"] = opens, merged
            else:
                _data[name] = future.result()
        if _seeded["user"] != user:
            # Renovate est indépendant de l'observé : inutile de le ré-amorcer.
            _seeded["user"] = user
            _seeded["sections"] -= {"branches", "prs", "merged"}
        known = tuple(s for s in todo if s in _seeded["sections"])
        _seeded["sections"].update(todo)
        if known:
            # Marge : l'horloge de GitHub et la nôtre ne sont pas réglées à la seconde.
            last = _state["ts"]
            since = (datetime.fromtimestamp(last - 600, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                     if last else None)
            found = _diff(before, _data, known, since)
            for ev in found:
                # plusieurs comptes : le journal dit lequel, et deux comptes ne
                # se remplacent pas la même notification
                ev["account"] = ACCOUNT["label"] or ACCOUNT["id"]
                ev["tag"] = f"{ACCOUNT['id']}:{ev['tag']}"
            events.record(found)
        with _state["lock"]:
            _state["ts"], _state["error"] = time.time(), None
        print(f"✅ GitHub à jour — {STATS['calls']} appels, {STATS['hits']} 304", flush=True)
        perflog.timed("github", time.monotonic() - started_at, account=ACCOUNT.get("id"))
    except Exception as e:
        with _state["lock"]:
            _state["error"] = str(e)
        print(f"✗ GitHub : {e}", file=sys.stderr, flush=True)
    finally:
        with _state["lock"]:
            _state["building"] = False

def kickoff(token, sections=None):
    """Lance un fetch si aucun n'est déjà en cours. Un seul point d'entrée, sinon
    le démarrage et la première requête en lancent deux en parallèle."""
    with _state["lock"]:
        if _state["building"]:
            return False
        _state["building"] = True
        if _state["user"] is None:
            _state["user"] = CFG.get("me")
    threading.Thread(target=rebuild, args=(token, sections), daemon=True).start()
    return True

def age():
    """Secondes depuis la dernière lecture complète de GitHub."""
    with _state["lock"]:
        return time.time() - _state["ts"]

def payload(token):
    """Snapshot complet ; relance un fetch en tâche de fond si le cache est périmé."""
    if not enabled():
        return {"enabled": False}
    if not token:
        return {"enabled": False, "error": "GitHub non connecté — Réglages → Connexion GitHub"}

    with _state["lock"]:
        if _state["user"] is None:
            _state["user"] = CFG.get("me")
        # Le front interroge toutes les `auto_refresh` secondes : si on attendait
        # `cache_ttl` (120 s) pour re-questionner GitHub, les transitions de CI
        # arriveraient avec 2 minutes de retard et les notifications avec elles.
        # Le cache ETag rend ces cycles quasi gratuits, donc on suit le front.
        every = CFG.get("auto_refresh") or CFG.get("cache_ttl", 120)
        stale = time.time() - _state["ts"] >= every
    if stale:
        kickoff(token)
    with _state["lock"]:
        user, ts, err = _state["user"], _state["ts"], _state["error"]
        building = _state["building"]

    branches = _data["branches"]
    up_open   = [p for p in _data["renovate"] if p.get("upstream")]
    up_merged = [p for p in _data["renovate_merged"] if p.get("upstream")]
    down_open   = [p for p in _data["renovate"] if not p.get("upstream")]
    down_merged = [p for p in _data["renovate_merged"] if not p.get("upstream")]

    open_groups = group_by_version(down_open)
    for g in open_groups:
        g["gate"] = version_gate(g["version"], down_merged + up_merged)

    return {
        "enabled":    True,
        "user":       user,
        "users":      CFG.get("users", []),
        "updated_at": ts,
        "building":   building,
        "error":      err,
        "auto_refresh": CFG.get("auto_refresh", 15),
        "branches": {
            "active": [b for b in branches if not b.get("merged")],
            "stale":  [b for b in branches if b.get("merged")],
        },
        "prs":    _data["prs"],
        "merged": _data["merged"],
        "renovate": {
            "upstream_open":   up_open,
            "upstream_merged": up_merged,
            "open_groups":     open_groups,
            "merged_groups":   group_by_version(down_merged),
            "gate":            upstream_gate(up_open, up_merged),
            "open_count":      len(down_open) + len(up_open),
        },
        "stats": dict(STATS),
    }
