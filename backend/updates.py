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
import errlog
import events
import store

CHANGELOG   = Path(os.environ.get("CHANGELOG", Path(__file__).resolve().parent.parent / "CHANGELOG.md"))
# Mode d'emploi, affiché dans Réglages → Aide (copié dans l'image comme le changelog).
GUIDE       = Path(os.environ.get("GUIDE", Path(__file__).resolve().parent.parent / "GUIDE.md"))
REPO        = os.environ.get("HOMEDASH_REPO", "davidgennaoui/homedash")
BRANCH      = os.environ.get("HOMEDASH_BRANCH", "main")
CHECK_EVERY = 10 * 60      # un appel à GitHub (6/h, sur un plafond de 5 000)
VERSION     = "version.json"
# Avec le dossier du projet (transmis par compose), la commande se colle depuis
# n'importe quel terminal ; sans lui, elle suppose qu'on y est déjà.
_DIR        = os.environ.get("HOMEDASH_DIR", "").strip()
COMMAND     = (f"cd {shlex.quote(_DIR)} && " if _DIR else "") + "git pull && docker compose up -d --build"
# Appli de bureau : la construire sur ce Mac plutôt que la télécharger.
DESKTOP_COMMAND = (f"cd {shlex.quote(_DIR)} && " if _DIR else "") + "sh desktop/build-local.sh --install"
# Windows : PowerShell 5.1 (celui d'origine) ne connaît pas `&&` ; `;` enchaîne.
# Le dossier n'y est presque jamais connu (pas de PWD dans l'environnement).
_WIN_CD         = f'cd "{_DIR}"; ' if _DIR else ""
COMMAND_WINDOWS = _WIN_CD + "git pull; docker compose up -d --build"
DESKTOP_COMMAND_WINDOWS = _WIN_CD + "powershell -ExecutionPolicy Bypass -File desktop\\build-windows.ps1 -Install"

_state = {"latest": None, "incoming": [], "checked_at": None, "error": None}
_lock  = threading.Lock()


# ── Changelog ────────────────────────────────────────────────────────────────
_HEAD = re.compile(r"^##\s+(\d+\.\d+\.\d+)\s*(?:[—-]\s*(.+))?$")
# Sous le titre d'une version : `Appli de bureau : 1.4.0` = elle demande cette
# version de l'appli de bureau (ou plus récente).
_DESKTOP = re.compile(r"^(?:💻\s*)?\**Appli de bureau\s*:?\**\s*:?\s*(\d+\.\d+\.\d+)", re.I)

def parse(text):
    """`## 1.2.0 — 2026-10-13` suivi de lignes `- …` → [{version, date, items}],
    plus `desktop` si une ligne `Appli de bureau : X.Y.Z` suit le titre."""
    out = []
    for line in (text or "").splitlines():
        m = _HEAD.match(line.strip())
        if m:
            out.append({"version": m.group(1), "date": (m.group(2) or "").strip(), "items": []})
        elif out and not out[-1]["items"] and _DESKTOP.match(line.strip()):
            out[-1]["desktop"] = _DESKTOP.match(line.strip()).group(1)
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

def guide():
    """Texte de GUIDE.md ; vide s'il manque (la page Aide le dit)."""
    try:
        return GUIDE.read_text(encoding="utf-8")
    except OSError:
        return ""

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
        return _set(error="connecte un compte GitHub (Réglages) pour que homedash vérifie les mises à jour")
    status, body, _ = mods[0].probe(f"/repos/{REPO}/contents/CHANGELOG.md", mods[0].token(),
                                    {"ref": BRANCH})
    if status != 200 or not isinstance(body, dict):
        why = ("ton compte GitHub n'a pas accès au dépôt homedash"
               if status in (403, 404) else "GitHub ne répond pas pour le moment")
        errlog.record("serveur", f"vérification des mises à jour : {why}", f"GitHub {status} sur {REPO}")
        return _set(error=f"impossible de vérifier les mises à jour : {why}")
    try:
        remote = parse(base64.b64decode(body.get("content") or "").decode("utf-8"))
    except Exception as e:
        errlog.record("serveur", "vérification des mises à jour", f"changelog distant illisible : {e}")
        return _set(error="impossible de vérifier les mises à jour pour le moment")
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
        # Dossier du projet sur la machine : l'appli de bureau y lance la mise à jour.
        "dir": _DIR,
        "command_windows": COMMAND_WINDOWS,
        "repo": REPO,
        # Appli de bureau : construite sur la machine (plus de release à télécharger).
        "desktop_command": DESKTOP_COMMAND,
        "desktop_command_windows": DESKTOP_COMMAND_WINDOWS,
        "checked_at": state["checked_at"],
        "error": state["error"],
    }

def _loop():
    time.sleep(20)          # laisser les comptes se connecter
    while True:
        try:
            check()
        except Exception as e:
            errlog.record("serveur", "vérification des mises à jour", repr(e))
            _set(error="impossible de vérifier les mises à jour pour le moment")
        time.sleep(CHECK_EVERY)

def start():
    threading.Thread(target=_loop, daemon=True, name="updates").start()
