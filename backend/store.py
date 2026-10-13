"""Stockage : des fichiers JSON dans data/, écrits de façon atomique.

Le répertoire est monté en volume (et non chaque fichier séparément) : ça permet
d'écrire dans un temporaire puis de renommer, donc jamais de fichier tronqué si le
process meurt en pleine écriture — ce qu'un bind-mount de fichier interdit.
"""

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

def write(name, payload):
    """Écriture atomique : temporaire dans le même répertoire puis rename."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    target = path_of(name)
    tmp    = target.with_suffix(target.suffix + ".tmp")
    with _lock(name):
        with open(tmp, "w", encoding="utf-8") as f:
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
        write(SECRETS, data)
        os.chmod(path_of(SECRETS), 0o600)

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
