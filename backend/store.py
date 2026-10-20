"""Stockage : des fichiers JSON dans data/, écrits de façon atomique.

Le répertoire est monté en volume (et non chaque fichier séparément) : ça permet
d'écrire dans un temporaire puis de renommer, donc jamais de fichier tronqué si le
process meurt en pleine écriture — ce qu'un bind-mount de fichier interdit.
"""

import hashlib
import json
import os
import threading
from pathlib import Path

DATA_DIR = Path(os.environ.get("DATA_DIR", "/app/data"))

CONFIG      = "config.json"
CONFIG_PREV = "config.prev.json"
NOTES       = "notes.json"
USAGE       = "usage.json"
EVENTS      = "events.json"
# Le jeton GitHub saisi dans Réglages. Fichier à part, en 600, et jamais servi
# au navigateur ni inclus dans les sauvegardes : config.json, lui, transite
# entier par GET /api/config.
SECRETS     = "secrets.json"

_locks = {}
_locks_guard = threading.Lock()

def _lock(name):
    with _locks_guard:
        return _locks.setdefault(name, threading.Lock())

def path_of(name):
    return DATA_DIR / name

def read(name, default):
    p = path_of(name)
    if not p.exists():
        return default
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        raise ValueError(f"{name} illisible : {e}") from e

def write(name, payload, mode=0o644):
    """Écriture atomique : temporaire dans le même répertoire puis rename.
    `mode` s'applique dès la création du temporaire : `secrets.json` ne doit
    jamais exister, même un instant, lisible par d'autres."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    target = path_of(name)
    tmp    = target.with_suffix(target.suffix + ".tmp")
    with _lock(name):
        try:
            tmp.unlink()            # un reste d'écriture interrompue garderait ses droits
        except FileNotFoundError:
            pass
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
        with open(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, target)

def read_secret(key):
    try:
        return (read(SECRETS, {}) or {}).get(key)
    except ValueError:
        return None

def write_secret(key, value):
    """`value` à None retire la clé. Le fichier est créé en 600 avant d'y écrire."""
    with _lock("secrets-rmw"):
        try:
            data = read(SECRETS, {}) or {}
        except ValueError:
            data = {}
        if value is None:
            data.pop(key, None)
        else:
            data[key] = value
        write(SECRETS, data, mode=0o600)

def version(name):
    """Empreinte du fichier tel qu'il est sur le disque, ou "" s'il n'existe pas.
    Sert à refuser une écriture faite sur une version périmée (deux onglets, ou
    la page et une écriture du serveur) au lieu d'écraser l'autre en silence."""
    try:
        return hashlib.sha1(path_of(name).read_bytes()).hexdigest()[:16]
    except FileNotFoundError:
        return ""

def backup_config():
    try:
        write(CONFIG_PREV, read(CONFIG, {}))
    except Exception:
        pass          # premier démarrage, ou config déjà cassée : rien à sauver

# ── Validation de config.json ─────────────────────────────────────────────────
def validate_config(cfg):
    """Garde-fou avant écriture : l'UI peut envoyer n'importe quoi, et ce fichier
    est la seule source de vérité de la page. Retourne un message ou None."""
    if not isinstance(cfg, dict):
        return "la racine doit être un objet"
    if not isinstance(cfg.get("groups"), list):
        return '"groups" doit être un tableau'
    for i, group in enumerate(cfg["groups"]):
        if not isinstance(group, dict):
            return f"groups[{i}] doit être un objet"
        if not isinstance(group.get("name"), str) or not group["name"].strip():
            return f"groups[{i}].name manquant"
        if not isinstance(group.get("links"), list):
            return f"groups[{i}].links doit être un tableau"
        for j, link in enumerate(group["links"]):
            if not isinstance(link, dict):
                return f"groups[{i}].links[{j}] doit être un objet"
            for field in ("name", "url"):
                if not isinstance(link.get(field), str) or not link[field].strip():
                    return f"groups[{i}].links[{j}].{field} manquant"
    gh = cfg.get("github")
    if gh is not None and not isinstance(gh, dict):
        return '"github" doit être un objet'
    accs = cfg.get("github_accounts")
    if accs is not None:
        if not isinstance(accs, list):
            return '"github_accounts" doit être un tableau'
        seen = set()
        for i, acc in enumerate(accs):
            if not isinstance(acc, dict):
                return f"github_accounts[{i}] doit être un objet"
            if not isinstance(acc.get("id"), str) or not acc["id"].strip():
                return f"github_accounts[{i}].id manquant"
            if acc["id"] in seen:
                return f"github_accounts[{i}].id en double : {acc['id']}"
            seen.add(acc["id"])
            for key in ("repos", "branch_repos", "base_site_repos", "users"):
                v = acc.get(key)
                if v is not None and not (isinstance(v, list) and all(isinstance(x, str) for x in v)):
                    return f"github_accounts[{i}].{key} doit être une liste de textes"
            for key in ("merged_count", "cache_ttl", "auto_refresh"):
                v = acc.get(key)
                if v is not None and (isinstance(v, bool) or not isinstance(v, int) or v < 0):
                    return f"github_accounts[{i}].{key} doit être un entier positif"
    repos = cfg.get("repos")
    if repos is not None:
        if not isinstance(repos, dict):
            return '"repos" doit être un objet'
        items = repos.get("items")
        if items is not None:
            if not isinstance(items, list):
                return '"repos.items" doit être un tableau'
            for i, item in enumerate(items):
                if not isinstance(item, dict) or not isinstance(item.get("name"), str) or not item["name"].strip():
                    return f"repos.items[{i}].name manquant"
    ui = cfg.get("ui")
    if ui is not None and not isinstance(ui, dict):
        return '"ui" doit être un objet'
    tabs = cfg.get("tabs")
    if tabs is not None:
        if not isinstance(tabs, list):
            return '"tabs" doit être un tableau'
        seen = set()
        for i, tab in enumerate(tabs):
            if not isinstance(tab, dict):
                return f"tabs[{i}] doit être un objet"
            for field in ("id", "label", "url"):
                if not isinstance(tab.get(field), str) or not tab[field].strip():
                    return f"tabs[{i}].{field} manquant"
            if tab.get("session") is not None and not isinstance(tab["session"], str):
                return f"tabs[{i}].session doit être un texte"
            for flag in ("sleep", "kept", "embed", "capture", "preload"):
                if tab.get(flag) is not None and not isinstance(tab[flag], bool):
                    return f"tabs[{i}].{flag} doit être vrai ou faux"
            doms = tab.get("domains")
            if doms is not None and not (isinstance(doms, list) and all(isinstance(d, str) for d in doms)):
                return f"tabs[{i}].domains doit être une liste de textes"
            if tab["id"] in seen:
                return f"tabs[{i}].id en double : {tab['id']}"
            seen.add(tab["id"])
    for key in ("tabFolders", "tabSessions"):
        items = cfg.get(key)
        if items is None:
            continue
        if not isinstance(items, list):
            return f'"{key}" doit être un tableau'
        seen = set()
        for i, f in enumerate(items):
            if not isinstance(f, dict):
                return f"{key}[{i}] doit être un objet"
            for field in ("id", "name"):
                if not isinstance(f.get(field), str) or not f[field].strip():
                    return f"{key}[{i}].{field} manquant"
            if f["id"] in seen:
                return f"{key}[{i}].id en double : {f['id']}"
            seen.add(f["id"])
    order = cfg.get("pinnedOrder")
    if order is not None and not (isinstance(order, list) and all(isinstance(x, str) for x in order)):
        return '"pinnedOrder" doit être une liste de textes'
    bc = cfg.get("basecamp")
    if bc is not None:
        if not isinstance(bc, dict):
            return '"basecamp" doit être un objet'
        hidden = bc.get("hidden")
        if hidden is not None and not (isinstance(hidden, list) and all(isinstance(x, str) for x in hidden)):
            return '"basecamp.hidden" doit être une liste de textes'
    loc = cfg.get("local")
    if loc is not None:
        if not isinstance(loc, dict):
            return '"local" doit être un objet'
        if loc.get("roots") is not None and not isinstance(loc["roots"], list):
            return '"local.roots" doit être un tableau'
    return None

def validate_notes(notes):
    if not isinstance(notes, list):
        return "les notes doivent être un tableau"
    for i, n in enumerate(notes):
        if not isinstance(n, dict):
            return f"notes[{i}] doit être un objet"
        if not isinstance(n.get("id"), str) or not n["id"]:
            return f"notes[{i}].id manquant"
        if not isinstance(n.get("text"), str):
            return f"notes[{i}].text doit être une chaîne"
    return None

# ── Compteurs d'ouverture ─────────────────────────────────────────────────────
def bump_usage(link_id, now_ms):
    """Incrémente sous verrou : plusieurs onglets peuvent cliquer en même temps."""
    with _lock("usage-rmw"):
        usage = read(USAGE, {})
        if not isinstance(usage, dict):
            usage = {}
        entry = usage.get(link_id) or {"count": 0, "last": 0}
        usage[link_id] = {"count": int(entry.get("count", 0)) + 1, "last": now_ms}
        write(USAGE, usage)
        return usage
