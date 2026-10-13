"""Plusieurs comptes GitHub dans une même instance.

Chaque compte a son jeton et ses réglages (repos suivis, équipe, Renovate…). Le
module `github.py` est chargé une fois PAR COMPTE : chaque copie a ses propres
globales — jeton, cache ETag, données, amorçage du journal —, donc les comptes
se rafraîchissent en parallèle sans rien partager, et l'onglet GitHub ne fait
que choisir lequel il affiche.

Config : `github_accounts` = [{"id", "label", …réglages d'un compte…}]. Une
config d'avant n'a que la section `github` : elle devient le compte « main ».
`github` reste tenu à jour avec le premier compte (le front y lit org/login
pour la carte Repos).

Jetons : `secrets.json` → `github_tokens` = {id: jeton}. L'ancien
`github_token` et `GH_TOKEN` valent pour le compte « main » (ou le premier).
"""

import importlib.util
import re
import sys
import threading
from pathlib import Path

import store

_HERE   = Path(__file__).resolve().parent
_mods   = {}                 # id -> module github chargé pour ce compte
_order  = []                 # ids dans l'ordre de la config
_labels = {}
_lock   = threading.RLock()


# ── Config ────────────────────────────────────────────────────────────────────
def from_config(cfg):
    """Liste des comptes de la config, anciennes configs comprises."""
    accs = cfg.get("github_accounts")
    if isinstance(accs, list) and accs:
        return [a for a in accs if isinstance(a, dict) and a.get("id")]
    gh = cfg.get("github") or {}
    return [{"id": "main", "label": gh.get("label") or "", **gh}]


def settings_of(acc):
    """Réglages d'un compte tels que `github.configure()` les attend."""
    return {k: v for k, v in acc.items() if k not in ("id", "label")}


def normalized(cfg):
    """Config avec `github_accounts` explicite et `github` = premier compte.
    Appelé avant toute écriture de config qui touche aux comptes."""
    accs = from_config(cfg)
    cfg["github_accounts"] = accs
    cfg["github"] = settings_of(accs[0]) if accs else {}
    return cfg


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


def _token_for(acc_id, first_id):
    saved = _tokens()
    if saved.get(acc_id):
        return saved[acc_id], "ui"
    # Héritage d'une instance à un seul compte : l'ancien jeton et GH_TOKEN
    # reviennent au compte principal.
    if acc_id in ("main", first_id):
        legacy = store.read_secret("github_token")
        if legacy:
            return legacy, "ui"
        mod = _mods.get(acc_id)
        env = mod._find_token() if mod else None
        if env:
            return env, "env"
    return None, None


def set_token(acc_id, value):
    """Enregistre (ou retire, avec None) le jeton d'un compte."""
    with _lock:
        saved = _tokens()
        if value:
            saved[acc_id] = value
        else:
            saved.pop(acc_id, None)
        store.write_secret("github_tokens", saved)
        if acc_id == (_order[0] if _order else "main"):
            store.write_secret("github_token", None)   # l'ancien emplacement n'a plus cours
        mod = _mods.get(acc_id)
        if mod:
            tok, src = _token_for(acc_id, _order[0] if _order else acc_id)
            mod.apply_token(tok, src)


def forget(acc_id):
    """Compte supprimé : son jeton part avec lui, ancien emplacement compris."""
    with _lock:
        saved = _tokens()
        if saved.pop(acc_id, None) is not None:
            store.write_secret("github_tokens", saved)
        if acc_id == "main":
            store.write_secret("github_token", None)


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
            tok, src = _token_for(acc["id"], ids[0])
            mod.apply_token(tok, src)


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


def invalidate_all():
    for mod in all_mods():
        mod.invalidate()


# ── Vue regroupée, pour l'onglet Local ───────────────────────────────────────
# localgit importe ce module sous le nom `github` : mêmes fonctions, mais sur
# l'ensemble des comptes. Un dépôt local est confronté au compte qui le suit.
def enabled():
    return any(m.token() and m.enabled() for m in all_mods())


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
