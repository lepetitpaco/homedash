"""Sauvegardes de data/ : instantanés datés dans data/backups/, export, restauration.

Ce qui est sauvegardé, c'est ce qu'on a saisi : la config (liens, infos, réglages,
sections github/local), les notes et les compteurs. Pas le journal — il se
reconstruit tout seul et pèse à lui seul plus que tout le reste — ni le jeton
GitHub : une sauvegarde se télécharge, se copie, s'envoie, et un jeton n'a rien à
faire dans un fichier qui voyage.

Une restauration commence toujours par un instantané de l'état courant : se
tromper de fichier se répare en restaurant celui d'avant.
"""

import json
import re
import threading
import time
from datetime import datetime

import store

DIR      = store.DATA_DIR / "backups"
KEEP     = 30                    # instantanés conservés, les plus anciens partent
AUTO_GAP = 24 * 3600             # un instantané automatique par jour
FILES    = {"config": store.CONFIG, "notes": store.NOTES, "usage": store.USAGE}
_NAME    = re.compile(r"^\d{8}-\d{6}-[a-z0-9-]{1,40}\.json$")
_lock    = threading.Lock()


def bundle(reason="export"):
    files = {}
    for key, name in FILES.items():
        try:
            files[key] = store.read(name, None)
        except ValueError:
            files[key] = None          # fichier cassé : on sauve le reste
    return {"homedash_backup": 1, "created": time.time(), "reason": reason, "files": files}


def _slug(reason):
    return re.sub(r"[^a-z0-9]+", "-", reason.lower()).strip("-")[:40] or "manuelle"


def snapshot(reason="manuelle"):
    """Écrit un instantané et renvoie son nom. Deux dans la même seconde ne
    s'écrasent pas : le suffixe change."""
    with _lock:
        DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        name  = f"{stamp}-{_slug(reason)}.json"
        n = 1
        while (DIR / name).exists():
            n += 1
            name = f"{stamp}-{_slug(reason)}-{n}.json"
        tmp = DIR / (name + ".tmp")
        tmp.write_text(json.dumps(bundle(reason), ensure_ascii=False, indent=1) + "\n")
        tmp.replace(DIR / name)
        for old in sorted(DIR.glob("*.json"))[:-KEEP]:
            old.unlink(missing_ok=True)
        return name


def listing():
    if not DIR.exists():
        return []
    out = []
    for p in sorted(DIR.glob("*.json"), reverse=True):
        if not _NAME.match(p.name):
            continue
        st = p.stat()
        out.append({"name": p.name, "size": st.st_size, "created": st.st_mtime,
                    "reason": p.stem[16:]})
    return out


def path(name):
    """Chemin d'un instantané, ou None : le nom vient de l'URL, il est vérifié
    avant de toucher au disque."""
    if not _NAME.match(name or ""):
        return None
    p = DIR / name
    return p if p.is_file() else None


def load(name):
    p = path(name)
    return json.loads(p.read_text()) if p else None


def delete(name):
    p = path(name)
    if p:
        p.unlink()
    return bool(p)


def check(data):
    """Message d'erreur, ou None si `data` est une sauvegarde restaurable."""
    if not isinstance(data, dict) or data.get("homedash_backup") != 1:
        return "ce fichier n'est pas une sauvegarde homedash"
    files = data.get("files")
    if not isinstance(files, dict) or not files.get("config"):
        return "sauvegarde sans config"
    problem = store.validate_config(files["config"])
    if problem:
        return f"config invalide : {problem}"
    if files.get("notes") is not None:
        problem = store.validate_notes(files["notes"])
        if problem:
            return f"notes invalides : {problem}"
    if files.get("usage") is not None and not isinstance(files["usage"], dict):
        return "compteurs invalides"
    return None


def restore(data):
    """Restaure après un instantané de l'état courant. Renvoie le nom de cet
    instantané — de quoi revenir en arrière."""
    problem = check(data)
    if problem:
        raise ValueError(problem)
    before = snapshot("avant-restauration")
    store.backup_config()
    for key, name in FILES.items():
        if data["files"].get(key) is not None:
            store.write(name, data["files"][key])
    return before


def latest_good():
    """La sauvegarde la plus récente dont la config se relit : {name, created} ou None."""
    for entry in listing():
        try:
            data = load(entry["name"])
        except (OSError, ValueError):
            continue
        if not check(data) and isinstance((data.get("files") or {}).get("config"), dict):
            return {"name": entry["name"], "created": entry["created"]}
    return None


def repair():
    """config.json ne se relit plus : il est mis de côté (rien n'est perdu), puis
    la dernière sauvegarde valide est restaurée. Renvoie {restored, aside} ou lève
    ValueError s'il n'y a aucune sauvegarde utilisable."""
    good = latest_good()
    if not good:
        raise ValueError("aucune sauvegarde utilisable")
    aside = store.set_aside(store.CONFIG)
    restore(load(good["name"]))
    return {"restored": good["name"], "created": good["created"], "aside": aside}


def _auto_loop():
    while True:
        try:
            latest = max((b["created"] for b in listing() if b["reason"] == "auto"), default=0)
            if time.time() - latest >= AUTO_GAP and store.path_of(store.CONFIG).exists():
                print(f"💾 sauvegarde automatique : {snapshot('auto')}", flush=True)
        except Exception as e:
            print(f"✗ sauvegarde automatique : {e}", flush=True)
        time.sleep(3600)


def start_auto():
    threading.Thread(target=_auto_loop, daemon=True).start()
