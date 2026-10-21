"""Plusieurs comptes GitHub dans une même instance.

Chaque compte a son jeton et ses réglages (repos suivis, équipe, Renovate…). Le
module `github.py` est chargé une fois PAR COMPTE : chaque copie a ses propres
globales — jeton, cache ETag, données, amorçage du journal —, donc les comptes
se rafraîchissent en parallèle sans rien partager, et l'onglet GitHub ne fait
que choisir lequel il affiche.

Config : `github_accounts` = [{"id", "label", …réglages d'un compte…}], seule
forme lue. Les anciennes (section `github` unique, clé `org` et noms courts,
jeton dans `github_token`) sont converties une fois par `migrate()`, appelé à
chaque chargement de config — une vieille sauvegarde restaurée passe donc par
le même chemin. Rien d'autre dans le code ne connaît l'ancien format.

Jetons : `secrets.json` → `github_tokens` = {id: jeton}.
"""

import importlib.util
import json
import re
import sys
import threading
import time
from pathlib import Path

import store

_HERE   = Path(__file__).resolve().parent
_mods   = {}                 # id -> module github chargé pour ce compte
_order  = []                 # ids dans l'ordre de la config
_labels = {}
_lock   = threading.RLock()


# ── Config ────────────────────────────────────────────────────────────────────
def from_config(cfg):
    """Liste des comptes de la config (déjà migrée)."""
    accs = cfg.get("github_accounts")
    if isinstance(accs, list):
        return [a for a in accs if isinstance(a, dict) and a.get("id")]
    return []


def settings_of(acc):
    """Réglages d'un compte tels que `github.configure()` les attend."""
    return {k: v for k, v in acc.items() if k not in ("id", "label")}


def normalized(cfg):
    """Config au format courant. Appelé avant toute écriture qui touche aux comptes."""
    return migrate(cfg)[0]


def _full(name, org):
    name = str(name).strip()
    return f"{org}/{name}" if org and name and "/" not in name else name


_SCHEME = re.compile(r"^[a-z][a-z0-9+.-]*://", re.I)
_OTHER  = re.compile(r"^(mailto|tel|file|data|javascript):", re.I)
_IPV4   = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")

def _full_url(url):
    """`notion.so` → `https://notion.so`, `localhost:3000` → `http://…` : sans
    schéma, la page prend l'adresse pour un de ses chemins (lien cassé, pas de
    favicon). Même règle que `withScheme()` (src/lib/url.ts)."""
    u = url.strip() if isinstance(url, str) else url
    if not isinstance(u, str) or not u or _SCHEME.match(u) or _OTHER.match(u) or u[0] in "/~.":
        return u
    host = re.split(r"[/?#]", u)[0]
    host = re.sub(r":\d+$", "", host).lower()
    local = host == "localhost" or host.endswith(".localhost") or bool(_IPV4.match(host))
    return ("http://" if local else "https://") + u

def migrate(cfg):
    """Ancien format → format courant. Renvoie (config, a_changé).

    · section `github` seule → `github_accounts` = [{"id": "main", …}] ;
    · clé `org` + noms courts → `propriétaire/repo`, `org` disparaît ;
    · entrées de la carte Repos sans `owner` → l'org du premier compte ;
    · la section `github` (copie du premier compte) disparaît ;
    · liens de Raccourcis tapés sans schéma (`notion.so`) → `https://notion.so`.
    Idempotent : une config déjà migrée ressort identique."""
    before = json.dumps(cfg, sort_keys=True)
    accs = cfg.get("github_accounts")
    if not isinstance(accs, list) or not accs:
        gh = cfg.get("github") if isinstance(cfg.get("github"), dict) else {}
        accs = [{"id": "main", "label": gh.get("label") or "",
                 **{k: v for k, v in gh.items() if k not in ("id", "label")}}]
    first_org = ""
    out = []
    for acc in accs:
        if not isinstance(acc, dict) or not acc.get("id"):
            continue
        acc = dict(acc)
        org = str(acc.pop("org", "") or "").strip()
        first_org = first_org or org
        for key in ("repos", "branch_repos", "base_site_repos"):
            if isinstance(acc.get(key), list):
                acc[key] = [_full(r, org) for r in acc[key] if str(r).strip()]
        if acc.get("upstream_repo"):
            acc["upstream_repo"] = _full(acc["upstream_repo"], org)
        out.append(acc)
    cfg["github_accounts"] = out or [{"id": "main", "label": ""}]
    cfg.pop("github", None)

    repos = cfg.get("repos")
    if first_org and isinstance(repos, dict) and isinstance(repos.get("items"), list):
        repos["items"] = [
            {**i, "owner": first_org} if isinstance(i, dict) and not i.get("owner") else i
            for i in repos["items"]
        ]
        if repos.get("defaultOwner") is None:
            repos["defaultOwner"] = first_org

    for group in cfg.get("groups") or []:
        if isinstance(group, dict) and isinstance(group.get("links"), list):
            for link in group["links"]:
                if isinstance(link, dict) and isinstance(link.get("url"), str):
                    link["url"] = _full_url(link["url"])
    return cfg, json.dumps(cfg, sort_keys=True) != before


def migrate_secrets(first_id):
    """L'ancien jeton unique (`github_token`) rejoint `github_tokens` sous le
    premier compte, s'il n'en a pas déjà un."""
    legacy = store.read_secret("github_token")
    if not legacy:
        return
    with _lock:
        saved = _tokens()
        saved.setdefault(first_id, legacy)
        store.write_secret("github_tokens", saved)
        store.write_secret("github_token", None)


def slug(label, taken):
    base = re.sub(r"[^a-z0-9]+", "-", (label or "compte").lower()).strip("-")[:24] or "compte"
    out, n = base, 2
    while out in taken:
        out, n = f"{base}-{n}", n + 1
    return out


# ── Jetons ────────────────────────────────────────────────────────────────────
def _tokens():
    saved = store.read_secret("github_tokens")
    return dict(saved) if isinstance(saved, dict) else {}


def _token_for(acc_id):
    tok = _tokens().get(acc_id)
    return (tok, "ui") if tok else (None, None)


def set_token(acc_id, value):
    """Enregistre (ou retire, avec None) le jeton d'un compte."""
    with _lock:
        saved = _tokens()
        if value:
            saved[acc_id] = value
        else:
            saved.pop(acc_id, None)
        store.write_secret("github_tokens", saved)
        mod = _mods.get(acc_id)
        if mod:
            mod.apply_token(*_token_for(acc_id))


def forget(acc_id):
    """Compte supprimé : son jeton part avec lui."""
    with _lock:
        saved = _tokens()
        if saved.pop(acc_id, None) is not None:
            store.write_secret("github_tokens", saved)


# ── Chargement ────────────────────────────────────────────────────────────────
def _load_module(acc_id):
    name = f"github_acc_{re.sub(r'[^a-z0-9_]', '_', acc_id)}"
    spec = importlib.util.spec_from_file_location(name, _HERE / "github.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def configure(cfg):
    """(Re)charge les comptes de la config. À chaud : un compte qui reste garde
    son module, donc ses caches ; un compte retiré est oublié."""
    accs = from_config(cfg)
    with _lock:
        ids = [a["id"] for a in accs]
        for gone in [i for i in _mods if i not in ids]:
            _mods.pop(gone)
        _order[:] = ids
        for acc in accs:
            mod = _mods.get(acc["id"]) or _load_module(acc["id"])
            _mods[acc["id"]] = mod
            _labels[acc["id"]] = acc.get("label") or ""
            mod.ACCOUNT.update(id=acc["id"], label=acc.get("label") or "")
            mod.configure(settings_of(acc))
            mod.apply_token(*_token_for(acc["id"]))


def get(acc_id=None):
    """Module du compte demandé, ou du premier s'il n'existe pas."""
    with _lock:
        if acc_id in _mods:
            return _mods[acc_id]
        return _mods[_order[0]] if _order else None


def all_mods():
    with _lock:
        return [_mods[i] for i in _order if i in _mods]


def listing():
    """Comptes pour le sélecteur : libellé, login du jeton, état."""
    out = []
    for mod in all_mods():
        me = mod.whoami() if mod.token() else {"ok": False}
        out.append({
            "id": mod.ACCOUNT["id"],
            "label": mod.ACCOUNT["label"] or me.get("login") or mod.ACCOUNT["id"],
            "login": me.get("login"),
            "avatar": me.get("avatar"),
            "ok": bool(me.get("ok")),
            "source": mod.token_source(),
            "enabled": bool(mod.token() and mod.enabled()),
        })
    return out


def kickoff_all():
    for mod in all_mods():
        if mod.token() and mod.enabled():
            mod.kickoff(mod.token())


# Page fermée ou cachée, plus personne ne sonde : le serveur relit quand même
# GitHub (tous les comptes) à ce rythme lent, pour que le journal et la cloche
# restent à jour. Page visible, c'est elle qui donne la cadence (`auto_refresh`).
SLOW_EVERY = 180


def _slow_loop():
    while True:
        time.sleep(60)
        for mod in all_mods():
            try:
                if mod.token() and mod.enabled() and mod.age() >= SLOW_EVERY:
                    mod.kickoff(mod.token())
            except Exception as e:
                print(f"✗ GitHub ({mod.ACCOUNT.get('id')}) : {e}", file=sys.stderr, flush=True)


def start_loop():
    threading.Thread(target=_slow_loop, daemon=True, name="github-slow").start()


def invalidate_all():
    for mod in all_mods():
        mod.invalidate()


# ── Vue regroupée, pour l'onglet Local ───────────────────────────────────────
# localgit importe ce module sous le nom `github` : mêmes fonctions, mais sur
# l'ensemble des comptes. Un dépôt local est confronté au compte qui le suit.
def enabled():
    return any(m.token() and m.enabled() for m in all_mods())


def github_stats():
    """Appels à GitHub et réponses 304 depuis le démarrage, tous comptes (journal de perf)."""
    out = {"calls": 0, "hits": 0}
    for m in all_mods():
        out["calls"] += m.STATS.get("calls", 0)
        out["hits"] += m.STATS.get("hits", 0)
    return out


def remote_version():
    return sum(m.remote_version() for m in all_mods())


def remote_snapshot(repo):
    for m in all_mods():
        snap = m.remote_snapshot(repo)
        if snap is not None:
            return snap
    return None


def branch_facts_index():
    out = {}
    for m in reversed(all_mods()):      # le premier compte l'emporte en cas de doublon
        out.update(m.branch_facts_index())
    return out


def pr_for_branch(repo, branch, hint=None):
    mods = [m for m in all_mods() if m.token()]
    # d'abord le compte qui suit ce repo, sinon celui dont le jeton voit le
    # propriétaire du remote — à défaut, le premier connecté
    for m in mods:
        if repo in (m.CFG.get("repos") or []) or repo in (m.CFG.get("branch_repos") or []):
            return m.pr_for_branch(repo, branch, hint)
    return mods[0].pr_for_branch(repo, branch, hint) if mods else None
