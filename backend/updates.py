"""Version installée, changelog, et « une mise à jour est disponible ».

La version est celle du haut de `CHANGELOG.md`, copié dans l'image au build :
c'est la même source pour le panneau de version (barre du haut) et pour la comparaison avec le
dépôt GitHub de homedash. Celle-ci passe par le jeton d'un compte connecté (le
dépôt peut être privé) ; sans jeton ou sans accès, l'onglet le dit et rien ne
sonne.

Deux protections pour les données de chacun :
  · `on_start()` prend un instantané de data/ quand la version installée change
    (après un `git pull && docker compose up --build`), AVANT que la migration
    de config ne tourne — une mise à jour qui abîmerait quelque chose se
    restaure depuis Réglages → Sauvegardes ;
  · ce module ne lit et n'écrit que `data/version.json` et le journal.
"""

import base64
import os
import re
import shlex
import threading
import time
from pathlib import Path

import accounts
import backup
import events
import store

CHANGELOG   = Path(os.environ.get("CHANGELOG", Path(__file__).resolve().parent.parent / "CHANGELOG.md"))
REPO        = os.environ.get("HOMEDASH_REPO", "davidgennaoui/homedash")
BRANCH      = os.environ.get("HOMEDASH_BRANCH", "main")
CHECK_EVERY = 6 * 3600
VERSION     = "version.json"
# Avec le dossier du projet (transmis par compose), la commande se colle depuis
# n'importe quel terminal ; sans lui, elle suppose qu'on y est déjà.
_DIR        = os.environ.get("HOMEDASH_DIR", "").strip()
COMMAND     = (f"cd {shlex.quote(_DIR)} && " if _DIR else "") + "git pull && docker compose up -d --build"
# Appli de bureau : la construire sur ce Mac plutôt que la télécharger.
DESKTOP_COMMAND = (f"cd {shlex.quote(_DIR)} && " if _DIR else "") + "sh desktop/build-local.sh --install"

_state = {"latest": None, "incoming": [], "checked_at": None, "error": None}
_lock  = threading.Lock()


# ── Changelog ────────────────────────────────────────────────────────────────
_HEAD = re.compile(r"^##\s+(\d+\.\d+\.\d+)\s*(?:[—-]\s*(.+))?$")

def parse(text):
    """`## 1.2.0 — 2026-10-13` suivi de lignes `- …` → [{version, date, items}]."""
    out = []
    for line in (text or "").splitlines():
        m = _HEAD.match(line.strip())
        if m:
            out.append({"version": m.group(1), "date": (m.group(2) or "").strip(), "items": []})
        elif out and line.startswith("- "):
            out[-1]["items"].append(line[2:].strip())
        elif out and out[-1]["items"] and line.startswith("  ") and line.strip():
            out[-1]["items"][-1] += " " + line.strip()      # suite d'une puce
    return out

def key(version):
    return tuple(int(x) for x in re.findall(r"\d+", version or "0")[:3])

def entries():
    try:
        return parse(CHANGELOG.read_text(encoding="utf-8"))
    except OSError:
        return []

def current():
    e = entries()
    return e[0]["version"] if e else "0.0.0"


# ── Instantané avant mise à jour ─────────────────────────────────────────────
def on_start():
    """À appeler au démarrage, avant le chargement de la config."""
    now = current()
    before = _read().get("version")
    if before == now:
        return
    if before and store.path_of(store.CONFIG).exists():
        name = backup.snapshot(f"avant-{now}")
        print(f"💾 mise à jour {before} → {now} : données sauvegardées ({name})", flush=True)
    store.write(VERSION, {**_read(), "version": now})


# ── Version disponible sur GitHub ────────────────────────────────────────────
def check():
    mods = [m for m in accounts.all_mods() if m.token()]
    if not mods:
        return _set(error="aucun compte GitHub connecté : impossible de vérifier les mises à jour")
    status, body, _ = mods[0].probe(f"/repos/{REPO}/contents/CHANGELOG.md", mods[0].token(),
                                    {"ref": BRANCH})
    if status != 200 or not isinstance(body, dict):
        why = ("pas de CHANGELOG.md sur GitHub, ou dépôt inaccessible avec ce jeton"
               if status in (403, 404) else f"GitHub a répondu {status}")
        return _set(error=f"{why} ({REPO})")
    try:
        remote = parse(base64.b64decode(body.get("content") or "").decode("utf-8"))
    except Exception as e:
        return _set(error=f"changelog distant illisible : {e}")
    mine = key(current())
    incoming = [e for e in remote if key(e["version"]) > mine]
    latest = remote[0]["version"] if remote else None
    _set(latest=latest, incoming=incoming, error=None)
    if incoming and _read().get("announced") != latest:
        # Une seule annonce par version, même après un redémarrage.
        events.record([events.event(
            "update", "info", "github",
            f"⬆️ homedash {latest} disponible",
            body=f"Dans le dossier du projet : {COMMAND}",
            url=f"https://github.com/{REPO}/blob/{BRANCH}/CHANGELOG.md",
            tag=f"update:{latest}", sticky=True,
        )])
        store.write(VERSION, {**_read(), "announced": latest})

def _read():
    try:
        return store.read(VERSION, {}) or {}
    except ValueError:
        return {}

def _set(**kw):
    with _lock:
        _state.update(kw, checked_at=time.time())

def payload():
    with _lock:
        state = dict(_state)
    return {
        "current": current(),
        "entries": entries(),
        "latest": state["latest"],
        "incoming": state["incoming"],
        "update": bool(state["incoming"]),
        "command": COMMAND,
        "repo": REPO,
        # Appli de bureau : dernière release (seules les versions de l'appli en
        # ont une), ou la construire soi-même.
        "desktop_url": f"https://github.com/{REPO}/releases/latest",
        "desktop_command": DESKTOP_COMMAND,
        "checked_at": state["checked_at"],
        "error": state["error"],
    }

def _loop():
    time.sleep(20)          # laisser les comptes se connecter
    while True:
        try:
            check()
        except Exception as e:
            _set(error=str(e))
        time.sleep(CHECK_EVERY)

def start():
    threading.Thread(target=_loop, daemon=True, name="updates").start()
