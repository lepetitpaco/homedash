"""Journal d'erreurs : ce qui a raté, côté serveur comme côté page.

Une ligne JSON par erreur dans `data/logs/errors-AAAA-MM-JJ.jsonl`, gardé
KEEP_DAYS jours. Chaque entrée garde ce que l'utilisateur a lu (`shown`, en
français courant) et le détail technique (`detail`) : de quoi comprendre un
problème remonté en issue sans redemander. Affiché dans Réglages → Aide.

Jamais de secret : les jetons reconnaissables sont masqués avant écriture, et
les textes sont tronqués.
"""

import json
import re
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path

import store

KEEP_DAYS = 30
MAX_TEXT  = 600
MAX_LIST  = 200
# Page qui boucle sur une erreur : au plus N entrées identiques par minute.
BURST     = 3

_lock   = threading.Lock()
_recent = {}                      # (source, where, detail) -> [instants]

# Jetons GitHub, Basecamp (Bearer), secrets d'URL : remplacés par « *** ».
_SECRETS = re.compile(
    r"(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}"
    r"|(?:token|secret|password|code)=[^&\s\"']+)",
    re.I,
)


def _dir():
    return store.DATA_DIR / "logs"


def _clean(text):
    if text is None:
        return None
    text = _SECRETS.sub("***", str(text))
    return text if len(text) <= MAX_TEXT else text[:MAX_TEXT] + "…"


def record(source, shown, detail=None, where=None):
    """Note une erreur. `source` : serveur, page, appli… ; `shown` : le message
    vu par l'utilisateur ; `detail` : le message technique."""
    entry = {
        "ts": time.time(),
        "source": str(source)[:20],
        "where": _clean(where),
        "shown": _clean(shown),
        "detail": _clean(detail),
    }
    key = (entry["source"], entry["where"], entry["detail"] or entry["shown"])
    now = entry["ts"]
    with _lock:
        hits = [t for t in _recent.get(key, []) if now - t < 60]
        if len(hits) >= BURST:
            return
        _recent[key] = hits + [now]
        if len(_recent) > 500:
            _recent.clear()
        try:
            _dir().mkdir(parents=True, exist_ok=True)
            day = datetime.now().strftime("%Y-%m-%d")
            with open(_dir() / f"errors-{day}.jsonl", "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
            _prune()
        except OSError:
            pass                  # disque plein : l'erreur d'origine compte plus que son journal


def _prune():
    limit = (datetime.now() - timedelta(days=KEEP_DAYS)).strftime("%Y-%m-%d")
    for p in _dir().glob("errors-*.jsonl"):
        if p.stem[len("errors-"):] < limit:
            p.unlink(missing_ok=True)


def listing(limit=MAX_LIST):
    """Les erreurs les plus récentes d'abord."""
    out = []
    for p in sorted(_dir().glob("errors-*.jsonl"), reverse=True) if _dir().exists() else []:
        try:
            lines = p.read_text(encoding="utf-8").splitlines()
        except OSError:
            continue
        for line in reversed(lines):
            try:
                out.append(json.loads(line))
            except ValueError:
                continue
            if len(out) >= limit:
                return out
    return out


def clear():
    for p in _dir().glob("errors-*.jsonl") if _dir().exists() else []:
        p.unlink(missing_ok=True)
