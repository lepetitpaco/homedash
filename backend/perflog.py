"""Journal de performance : ce que homedash consomme, jour après jour.

Un fichier par jour et par source dans `data/perf/` (`server-AAAA-MM-JJ.jsonl`,
`app-AAAA-MM-JJ.jsonl`), une ligne JSON par mesure ou par action, gardés
`KEEP_DAYS` jours. Ni sauvegardé (backup.py ne prend que la config et les
notes), ni versionné (data/ est hors git). `scripts/perf-report.py` les résume.

  · serveur : toutes les 5 min, mémoire et CPU du process, threads, appels à
    GitHub, scans Local, et le nombre de requêtes par route (qui sonde quoi) ;
  · appli de bureau et page : envoyés par `POST /api/perf` — mémoire et CPU par
    site toutes les 5 min, et les actions (onglet ouvert, mis en veille…).

On n'y écrit que des noms de domaine et des chiffres : jamais une adresse
complète, un titre de page ou un contenu.
"""

import json
import os
import re
import sys
import threading
import time
from collections import Counter
from datetime import date, datetime, timedelta

import store

EVERY     = 300          # s entre deux mesures du serveur
KEEP_DAYS = 30
SOURCES   = {"server", "app", "page"}
MAX_LINE  = 16 * 1024    # une mesure de l'appli (20 sites) tient largement

# Réglages → Affichage → « Journal de performance » (`ui.perfLog`). Éteint, rien
# n'est écrit : ni mesure du serveur, ni mesure reçue de l'appli ou de la page.
_enabled  = False
WARN_MB   = 50           # au-delà, Réglages affiche un avertissement

_lock     = threading.Lock()
_requests = Counter()    # route -> requêtes depuis la dernière mesure
_scans    = Counter()    # « local » -> scans du disque depuis la dernière mesure
_timed    = {}           # opération -> [nombre, durée totale, pire durée] depuis la dernière mesure

# Au-delà, une opération a sa propre ligne « slow » (en plus du cumul) : c'est
# elle qu'on cherchera en relisant le journal.
SLOW = {"github": 20.0, "local": 3.0, "basecamp": 10.0, "config": 3.0}


def perf_dir():
    return store.DATA_DIR / "perf"


def _route(path):
    """`/api/github/user/ada` → `/api/github/user/*` : on compte des routes, pas des valeurs."""
    path = path.split("?", 1)[0]
    for prefix in ("/api/github/user/", "/api/github/users/", "/api/github/repos/", "/api/github/members/",
                   "/api/github/accounts/", "/api/backups/"):
        if path.startswith(prefix):
            return prefix + "*"
    return path if path.startswith("/api/") else "(page)"


def hit(method, path):
    with _lock:
        _requests[f"{method} {_route(path)}"] += 1


def scanned(what="local"):
    with _lock:
        _scans[what] += 1


def configure(enabled):
    global _enabled
    _enabled = bool(enabled)


def clear():
    """Vide le journal (Réglages) : seulement nos fichiers."""
    d = perf_dir()
    gone = 0
    if d.is_dir():
        for p in d.glob("*.jsonl"):
            if re.fullmatch(r"(server|app|page)-\d{4}-\d{2}-\d{2}\.jsonl", p.name):
                p.unlink()
                gone += 1
    return gone


def usage():
    """Pour Réglages : actif ou non, nombre de fichiers, place prise, plus ancien jour."""
    d = perf_dir()
    files = sorted(d.glob("*.jsonl")) if d.is_dir() else []
    size = sum(p.stat().st_size for p in files)
    days = sorted({p.stem.split("-", 1)[1] for p in files if "-" in p.stem})
    return {"enabled": _enabled, "files": len(files), "bytes": size,
            "mb": round(size / (1024 * 1024), 2), "warn_mb": WARN_MB,
            "since": days[0] if days else None, "keep_days": KEEP_DAYS, "path": "data/perf/"}


def timed(op, took, **detail):
    """Une opération lourde vient de finir en `took` secondes (cycle GitHub,
    scan Local, lecture Basecamp, écriture de config)."""
    with _lock:
        n, total, worst = _timed.get(op, (0, 0.0, 0.0))
        _timed[op] = (n + 1, total + took, max(worst, took))
    if _enabled and took >= SLOW.get(op, float("inf")):
        try:
            append("server", {"kind": "slow", "op": op, "took_s": round(took, 2), **detail})
        except Exception:
            pass


def append(source, record):
    """Ajoute une ligne au fichier du jour de `source`."""
    if source not in SOURCES or not isinstance(record, dict):
        raise ValueError("mesure refusée")
    if not _enabled:
        return False
    line = json.dumps({"t": datetime.now().isoformat(timespec="seconds"), **record}, ensure_ascii=False)
    if len(line) > MAX_LINE:
        raise ValueError("mesure trop grosse")
    d = perf_dir()
    with _lock:
        d.mkdir(parents=True, exist_ok=True)
        with open(d / f"{source}-{date.today().isoformat()}.jsonl", "a", encoding="utf-8") as f:
            f.write(line + "\n")


def prune(today=None):
    """Supprime les fichiers de plus de `KEEP_DAYS` jours (seulement les nôtres)."""
    limit = (today or date.today()) - timedelta(days=KEEP_DAYS)
    d = perf_dir()
    if not d.is_dir():
        return 0
    gone = 0
    for p in d.iterdir():
        m = re.fullmatch(r"(server|app|page)-(\d{4}-\d{2}-\d{2})\.jsonl", p.name)
        if m and date.fromisoformat(m.group(2)) < limit:
            p.unlink()
            gone += 1
    return gone


def _rss_mb():
    """Mémoire résidente actuelle (Linux : /proc ; ailleurs : le pic, faute de mieux)."""
    try:
        with open("/proc/self/status", encoding="utf-8") as f:
            for line in f:
                if line.startswith("VmRSS:"):
                    return round(int(line.split()[1]) / 1024, 1)
    except OSError:
        pass
    try:
        import resource
        peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return round(peak / (1024 * 1024 if sys.platform == "darwin" else 1024), 1)
    except Exception:
        return None


def sample(github_stats, prev):
    """Une mesure du serveur. `prev` = (heure, temps CPU, stats GitHub) de la précédente."""
    now, cpu = time.time(), time.process_time()
    with _lock:
        requests, scans = dict(_requests), dict(_scans)
        ops = {k: {"n": n, "avg_s": round(total / n, 2), "max_s": round(worst, 2)} for k, (n, total, worst) in _timed.items()}
        _requests.clear()
        _scans.clear()
        _timed.clear()
    p_now, p_cpu, p_gh = prev
    wall = max(1e-6, now - p_now)
    record = {
        "kind": "sample",
        "rss_mb": _rss_mb(),
        "cpu_pct": round(100 * (cpu - p_cpu) / wall, 2),
        "threads": threading.active_count(),
        "github_calls": github_stats["calls"] - p_gh["calls"],
        "github_304": github_stats["hits"] - p_gh["hits"],
        "local_scans": scans.get("local", 0),
        "ops": ops,
        "requests": requests,
    }
    return record, (now, cpu, dict(github_stats))


def _loop(github_stats):
    prev = (time.time(), time.process_time(), dict(github_stats()))
    day = date.today()
    while True:
        time.sleep(EVERY)
        try:
            record, prev = sample(github_stats(), prev)
            append("server", record)
            if date.today() != day:
                day = date.today()
                prune()
        except Exception as e:
            print(f"✗ journal de perf : {e}", file=sys.stderr, flush=True)


def start(github_stats):
    """`github_stats()` → {"calls", "hits"} cumulés, tous comptes."""
    try:
        prune()
        append("server", {"kind": "event", "event": "start", "pid": os.getpid()})
    except Exception as e:
        print(f"✗ journal de perf : {e}", file=sys.stderr, flush=True)
    threading.Thread(target=_loop, args=(github_stats,), daemon=True, name="perflog").start()
