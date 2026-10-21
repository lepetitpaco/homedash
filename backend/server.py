#!/usr/bin/env python3
"""homedash — serveur unique : fichiers statiques + API JSON + données GitHub.

Python stdlib uniquement, aucune dépendance.
"""

import html
import json
import os
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import backup
import accounts
import basecamp
import events
import favicons
import localfile
import localgit
import perflog
import store
import updates

PUBLIC_DIR = Path(os.environ.get("PUBLIC_DIR", "/app/public")).resolve()
PORT       = int(os.environ.get("PORT", "80"))
HOST       = os.environ.get("HOST", "0.0.0.0")
MAX_BODY   = 2 * 1024 * 1024

# Noms sous lesquels la page est servie. Le port est publié sur 127.0.0.1 : tout
# autre `Host` vient d'un nom de domaine qu'un site tiers a fait pointer sur
# cette machine (DNS rebinding) pour lire l'API comme s'il était chez lui. Qui
# ouvre l'accès au réseau ajoute ses noms à HOMEDASH_HOSTS (séparés par des
# virgules : `homedash.lan,192.168.1.20`).
ALLOWED_HOSTS = {"localhost", "127.0.0.1", "::1", "host.docker.internal"} | {
    h.strip().lower() for h in os.environ.get("HOMEDASH_HOSTS", "").split(",") if h.strip()
}


def _hostname(value):
    """`localhost:7777` → `localhost`, `[::1]:7777` → `::1`, URL d'Origin comprise."""
    if not value:
        return ""
    if "://" in value:
        return (urllib.parse.urlsplit(value).hostname or "").lower()
    return (urllib.parse.urlsplit("//" + value).hostname or "").lower()

MIME = {
    ".html": "text/html; charset=utf-8",
    ".js":   "text/javascript; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg":  "image/svg+xml",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico":  "image/x-icon",
    ".woff2": "font/woff2",
    ".map":  "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
}

# Toute écriture de config passe sous ce verrou : Réglages (PUT complet) et les
# écritures partielles du serveur (comptes, login adopté) lisent-modifient-écrivent
# le même fichier, et la dernière arrivée effacerait l'autre.
_config_lock = threading.RLock()

def load_sections():
    """(Re)configure les couches GitHub et Local depuis config.json. À chaud.
    Une config d'un ancien format (y compris une vieille sauvegarde restaurée)
    est convertie ici, une fois, et réécrite."""
    with _config_lock:
        try:
            cfg = store.read(store.CONFIG, {})
        except ValueError as e:
            print(f"⚠ {e}", file=sys.stderr, flush=True)
            return
        cfg, changed = accounts.migrate(cfg or {})
        if changed and not store.validate_config(cfg):
            store.backup_config()
            store.write(store.CONFIG, cfg)
            print("ℹ config convertie au format courant", flush=True)
        accounts.migrate_secrets(cfg["github_accounts"][0]["id"])
    accounts.configure(cfg)
    localgit.configure(cfg.get("local") or {})
    # Journal de performance : désactivé par défaut (Réglages → Affichage).
    perflog.configure((cfg.get("ui") or {}).get("perfLog") is True)

def reload_all():
    """Après toute écriture de config (Réglages, restauration) : recharge les
    sections, vide les caches, et réveille ce qui dormait faute de config — un
    premier dossier de dépôts ajouté depuis la page doit suffire."""
    started_at = time.time()
    load_sections()
    accounts.invalidate_all()
    localgit.invalidate()
    if localgit.enabled():
        localgit.start_watch()
        localgit.kickoff("réglages")
    accounts.kickoff_all()
    perflog.timed("config", time.time() - started_at)

def adopt_login(acc_id, login):
    """Premier branchement d'un compte : son login devient l'utilisateur observé,
    pour que l'onglet GitHub ait de quoi s'afficher dès la connexion. Ne remplace
    jamais une valeur déjà saisie."""
    with _config_lock:
        _adopt_login(acc_id, login)

def _adopt_login(acc_id, login):
    cfg = accounts.normalized(store.read(store.CONFIG, {}) or {})
    acc = next((a for a in cfg["github_accounts"] if a["id"] == acc_id), None)
    if not acc:
        return
    changed = False
    if not acc.get("me"):
        acc["me"] = login
        changed = True
    if not acc.get("users"):
        acc["users"] = [acc["me"]]
        changed = True
    if not acc.get("label"):
        acc["label"] = login
        changed = True
    if changed and not store.validate_config(cfg):
        store.backup_config()
        store.write(store.CONFIG, accounts.normalized(cfg))

def edit_accounts(change):
    """Lit la config, applique `change(liste des comptes)`, réécrit, recharge."""
    with _config_lock:
        cfg = accounts.normalized(store.read(store.CONFIG, {}) or {})
        result = change(cfg["github_accounts"])
        store.backup_config()
        store.write(store.CONFIG, accounts.normalized(cfg))
    reload_all()
    return result

class Handler(BaseHTTPRequestHandler):
    server_version = "homedash"
    protocol_version = "HTTP/1.1"

    # ── réponses ──────────────────────────────────────────────────────────────
    def _send(self, status, body, content_type, cache="no-store"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, payload, status=200, headers=None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _download(self, body, filename):
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _query(self, key):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        return (q.get(key) or [None])[0]

    def _acc(self, acc_id=None):
        """Compte visé : `?account=` (ou celui passé), sinon le premier."""
        return accounts.get(acc_id or self._query("account"))

    def _err(self, status, message):
        self._json({"error": message}, status)

    def _refused(self, write):
        """Raison de refuser la requête, ou None.

        Sans ces contrôles, n'importe quel site ouvert dans le navigateur peut
        écrire ici : un POST `text/plain` part sans pré-vol CORS, et la réponse
        illisible n'empêche pas l'écriture (une restauration remplace toute la
        config). Trois verrous, chacun suffisant contre un cas :
          · `Host` connu — contre le DNS rebinding, qui rend la page « même
            origine » et lui ouvre aussi les lectures ;
          · `Origin` / `Sec-Fetch-Site` — une écriture venue d'un autre site ;
          · corps en `application/json` — un formulaire ou un `text/plain` ne
            peut pas le poser sans pré-vol, et le pré-vol n'est pas servi.
        """
        if _hostname(self.headers.get("Host")) not in ALLOWED_HOSTS:
            return "hôte non autorisé (HOMEDASH_HOSTS)"
        if not write:
            return None
        origin = self.headers.get("Origin")
        if origin and origin != "null" and _hostname(origin) not in ALLOWED_HOSTS:
            return "origine non autorisée"
        if origin == "null" or self.headers.get("Sec-Fetch-Site") == "cross-site":
            return "requête intersite refusée"
        if int(self.headers.get("Content-Length") or 0) > 0:
            ctype = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            if ctype != "application/json":
                return "Content-Type application/json attendu"
        return None

    def _body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            raise ValueError("payload trop volumineux")
        return json.loads(self.rfile.read(length) or b"null")

    def log_message(self, fmt, *args):
        pass          # une ligne par asset au démarrage n'apporte rien

    # ── routage ───────────────────────────────────────────────────────────────
    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        refused = self._refused(write=False)
        if refused:
            return self._err(403, refused)
        try:
            if path.startswith("/api/"):
                perflog.hit("GET", path)
                return self._api_get(path)
            return self._static(path)
        except Exception as e:
            self._err(500, str(e))

    do_HEAD = do_GET

    def do_PUT(self):
        refused = self._refused(write=True)
        if refused:
            return self._err(403, refused)
        path = urllib.parse.urlparse(self.path).path
        perflog.hit("PUT", path)
        return self._api_write(path)

    def do_POST(self):
        refused = self._refused(write=True)
        if refused:
            return self._err(403, refused)
        path = urllib.parse.urlparse(self.path).path
        if path != "/api/perf":          # le journal ne se compte pas lui-même
            perflog.hit("POST", path)
        return self._api_write(path)

    def do_DELETE(self):
        path = urllib.parse.urlparse(self.path).path
        refused = self._refused(write=True)
        if refused:
            return self._err(403, refused)
        if path == "/api/usage":
            store.write(store.USAGE, {})
            return self._json({})
        if path == "/api/events":
            events.clear()
            return self._json({"ok": True})
        if path == "/api/perf":
            perflog.clear()
            return self._json(perflog.usage())
        if path == "/api/github/token":
            mod = self._acc()
            if not mod:
                return self._err(404, "compte inconnu")
            accounts.set_token(mod.ACCOUNT["id"], None)
            reload_all()
            return self._json({"source": mod.token_source(), **mod.whoami()})
        if path == "/api/basecamp/token":
            basecamp.disconnect()
            return self._json(basecamp.status())
        if path == "/api/basecamp/app":
            basecamp.forget()
            return self._json(basecamp.status())
        if path.startswith("/api/github/accounts/"):
            acc_id = urllib.parse.unquote(path[len("/api/github/accounts/"):])
            def drop(accs):
                if not any(a["id"] == acc_id for a in accs):
                    return "compte inconnu"
                if len(accs) == 1:
                    return "dernier compte : déconnecte-le plutôt que de le supprimer"
                accs[:] = [a for a in accs if a["id"] != acc_id]
                return None
            problem = edit_accounts(drop)
            if problem:
                return self._err(422, problem)
            accounts.forget(acc_id)
            return self._json({"ok": True})
        if path.startswith("/api/backups/"):
            if not backup.delete(path[len("/api/backups/"):]):
                return self._err(404, "sauvegarde introuvable")
            return self._json({"ok": True})
        return self._err(404, "route inconnue")

    # ── lectures ──────────────────────────────────────────────────────────────
    def _api_get(self, path):
        if path == "/api/changelog":
            return self._json(updates.payload())
        if path == "/api/guide":
            return self._json({"text": updates.guide()})
        if path == "/api/config":
            try:
                with _config_lock:
                    cfg, ver = store.read(store.CONFIG, {}), store.version(store.CONFIG)
                return self._json(cfg, headers={"X-Config-Version": ver})
            except ValueError as e:
                return self._err(500, str(e))
        if path == "/api/notes":
            return self._json(store.read(store.NOTES, []))
        if path == "/api/usage":
            return self._json(store.read(store.USAGE, {}))
        if path == "/api/github/accounts":
            return self._json({"accounts": accounts.listing()})
        if path == "/api/basecamp":
            return self._json(basecamp.payload())
        if path == "/api/basecamp/auth":
            return self._json(basecamp.status())
        if path == "/api/basecamp/callback":
            return self._basecamp_callback()
        if path == "/api/file":
            return self._file(self._query("path"))
        if path == "/api/favicon":
            return self._favicon(self._query("host"))
        if path.startswith("/api/github"):
            mod = self._acc()
            if not mod:
                return self._json({"enabled": False, "accounts": []})
        if path == "/api/github":
            data = mod.payload(mod.token())
            # le sélecteur de compte vit dans la même réponse : un seul sondage
            return self._json({**data, "account": mod.ACCOUNT["id"],
                               "accounts": accounts.listing()})
        if path == "/api/github/auth":
            return self._json({"source": mod.token_source(), "account": mod.ACCOUNT["id"],
                               **mod.whoami(fresh=bool(self._query("fresh")))})
        if path == "/api/github/owners":
            return self._json({"owners": mod.owners()})
        if path.startswith("/api/github/repos/"):
            return self._json(mod.repos_of(urllib.parse.unquote(path[len("/api/github/repos/"):])))
        if path.startswith("/api/github/members/"):
            return self._json(mod.members_of(urllib.parse.unquote(path[len("/api/github/members/"):])))
        if path.startswith("/api/github/users/"):
            found = mod.lookup_user(urllib.parse.unquote(path[len("/api/github/users/"):]))
            return self._json(found) if found else self._err(404, "utilisateur GitHub introuvable")
        if path == "/api/local/browse":
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            return self._json(localgit.browse((q.get("path") or ["~"])[0],
                                              files=bool((q.get("files") or [""])[0])))
        if path == "/api/local/roots":
            return self._json({"roots": localgit.root_status(), "home": localgit.home_display()})
        if path == "/api/backups":
            return self._json({"backups": backup.listing()})
        if path == "/api/backup":
            # export à la volée de l'état courant, en téléchargement
            body = json.dumps(backup.bundle("export"), ensure_ascii=False, indent=1).encode()
            name = time.strftime("homedash-%Y%m%d-%H%M%S.json")
            return self._download(body, name)
        if path.startswith("/api/backups/"):
            p = backup.path(path[len("/api/backups/"):])
            if not p:
                return self._err(404, "sauvegarde introuvable")
            return self._download(p.read_bytes(), "homedash-" + p.name)
        if path == "/api/local":
            return self._json(localgit.payload())
        if path == "/api/events":
            # `since` = dernier seq connu du client. Le front demande pour
            # l'instant le journal entier (300 entrées, ~50 ko) : c'est plus
            # simple qu'un accumulateur côté navigateur, et deux onglets ouverts
            # ne peuvent pas diverger.
            q     = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            since = (q.get("since") or [""])[0]
            limit = (q.get("limit") or [""])[0]
            return self._json(events.payload(
                since=int(since) if since.isdigit() else None,
                limit=int(limit) if limit.isdigit() else events.MAX))
        if path == "/api/perf":
            # Réglages : journal actif ? et la place qu'il prend sur le disque.
            return self._json(perflog.usage())
        if path == "/api/health":
            return self._json({"ok": True, "github": accounts.enabled(),
                               "basecamp": basecamp.connected(),
                               "local": localgit.enabled(),
                               "accounts": len(accounts.all_mods())})
        return self._err(404, "route inconnue")

    # ── écritures ─────────────────────────────────────────────────────────────
    def _api_write(self, path):
        try:
            if path == "/api/config":
                if self.command != "PUT":
                    return self._err(405, "PUT attendu")
                cfg = self._body()
                if isinstance(cfg, dict):
                    cfg = accounts.normalized(cfg)
                problem = store.validate_config(cfg)
                if problem:
                    return self._err(422, problem)
                # `X-Config-Version` = version sur laquelle la page a travaillé.
                # Si le fichier a changé depuis (autre onglet, écriture du
                # serveur), on refuse : écraser ferait perdre l'autre en silence.
                # Sans en-tête (ancienne page, script), on écrit comme avant.
                base = self.headers.get("X-Config-Version")
                with _config_lock:
                    if base is not None and base != store.version(store.CONFIG):
                        return self._json({"error": "config modifiée ailleurs depuis le chargement de la page",
                                           "conflict": True}, 409)
                    store.backup_config()
                    store.write(store.CONFIG, cfg)
                reload_all()              # github/local ont peut-être changé
                # relu après reload_all : une migration a pu réécrire le fichier
                with _config_lock:
                    ver = store.version(store.CONFIG)
                return self._json({"ok": True, "savedAt": time.time(), "version": ver},
                                  headers={"X-Config-Version": ver})

            if path == "/api/github/token":
                body  = self._body() or {}
                mod   = self._acc(body.get("account"))
                value = (body.get("token") or "").strip()
                if not mod:
                    return self._err(404, "compte inconnu")
                if not value:
                    return self._err(422, "jeton vide")
                info = mod.whoami(value, fresh=True)
                if not info.get("ok"):
                    return self._err(422, info.get("error") or "jeton refusé")
                acc_id = mod.ACCOUNT["id"]
                accounts.set_token(acc_id, value)
                adopt_login(acc_id, info["login"])
                reload_all()
                return self._json({"source": mod.token_source(), "account": acc_id, **info})

            if path == "/api/github/accounts":
                label = ((self._body() or {}).get("label") or "").strip()[:40]
                def add(accs):
                    acc_id = accounts.slug(label, {a["id"] for a in accs})
                    accs.append({"id": acc_id, "label": label or acc_id, "users": [],
                                 "repos": [], "branch_repos": []})
                    return acc_id
                return self._json({"id": edit_accounts(add)})

            if path == "/api/backups":
                return self._json({"name": backup.snapshot("manuelle")})

            if path == "/api/basecamp/app":
                body = self._body() or {}
                try:
                    basecamp.set_app(body.get("client_id"), body.get("client_secret"),
                                     body.get("redirect_uri"))
                except ValueError as e:
                    return self._err(422, str(e))
                return self._json(basecamp.status())

            if path == "/api/basecamp/authorize":
                try:
                    return self._json({"url": basecamp.authorize_url()})
                except ValueError as e:
                    return self._err(422, str(e))

            if path == "/api/basecamp/code":
                # Repli quand l'adresse de retour n'est pas cette page : on colle
                # le code (ou l'adresse entière) vu dans la barre du navigateur.
                code, state = basecamp.parse_code((self._body() or {}).get("code"))
                if state is not None and not basecamp.check_state(state):
                    return self._err(422, "lien d'autorisation expiré : relance « Se connecter »")
                try:
                    basecamp.exchange(code)
                except (ValueError, RuntimeError) as e:
                    return self._err(422, str(e))
                basecamp.kickoff()
                return self._json(basecamp.status())

            if path == "/api/basecamp/refresh":
                return self._json({"ok": True, "started": basecamp.kickoff()})

            if path == "/api/perf":
                # Mesures de l'appli de bureau et actions de la page (perflog.py).
                body = self._body()
                if not isinstance(body, dict):
                    return self._err(422, "objet attendu")
                source = body.pop("source", None)
                try:
                    perflog.append(source, body)
                except ValueError as e:
                    return self._err(422, str(e))
                return self._json({"ok": True})

            if path == "/api/backup/restore" or (path.startswith("/api/backups/")
                                                  and path.endswith("/restore")):
                if path == "/api/backup/restore":
                    data = self._body()
                else:
                    data = backup.load(path[len("/api/backups/"):-len("/restore")])
                    if data is None:
                        return self._err(404, "sauvegarde introuvable")
                problem = backup.check(data)
                if problem:
                    return self._err(422, problem)
                with _config_lock:
                    before = backup.restore(data)
                reload_all()
                return self._json({"ok": True, "before": before})

            if path == "/api/notes":
                if self.command != "PUT":
                    return self._err(405, "PUT attendu")
                notes   = self._body()
                problem = store.validate_notes(notes)
                if problem:
                    return self._err(422, problem)
                store.write(store.NOTES, notes)
                return self._json({"ok": True})

            if path == "/api/usage":
                if self.command == "PUT":       # remplacement complet (migration)
                    usage = self._body()
                    if not isinstance(usage, dict):
                        return self._err(422, "les compteurs doivent être un objet")
                    store.write(store.USAGE, usage)
                    return self._json(usage)
                payload = self._body() or {}
                link_id = payload.get("id")
                if not isinstance(link_id, str) or not link_id:
                    return self._err(422, "id manquant")
                return self._json(store.bump_usage(link_id, int(time.time() * 1000)))

            if path == "/api/github/refresh":
                body    = self._body() if self.headers.get("Content-Length") else {}
                section = (body or {}).get("section")
                mod     = self._acc((body or {}).get("account"))
                if not mod:
                    return self._err(404, "compte inconnu")
                if section:
                    started = mod.kickoff(mod.token(), [section])
                else:
                    mod.invalidate()
                    started = mod.kickoff(mod.token())
                # started=False : un fetch tourne déjà, la demande est ignorée
                return self._json({"ok": True, "section": section or "all",
                                   "started": started})

            if path == "/api/changelog/check":
                updates.check()
                return self._json(updates.payload())

            if path == "/api/local/refresh":
                # Lecture seule de bout en bout : ce POST ne fait que relancer un
                # parcours des .git, il n'écrit rien et n'exécute aucune commande.
                localgit.invalidate()
                return self._json({"ok": True, "started": localgit.kickoff()})

            if path.startswith("/api/github/user/"):
                login = urllib.parse.unquote(path[len("/api/github/user/"):])
                mod = self._acc()
                if not mod or not mod.set_user(login):
                    return self._err(422, f"utilisateur inconnu : {login}")
                return self._json({"ok": True, "user": login})

            return self._err(404, "route inconnue")
        except ValueError as e:
            return self._err(400, f"JSON invalide : {e}")
        except Exception as e:
            return self._err(500, str(e))

    # ── retour d'autorisation Basecamp ───────────────────────────────────────
    def _basecamp_callback(self):
        """Launchpad renvoie ici le navigateur après « Autoriser ». Le `state`
        prouve que la demande est partie de cette page."""
        code  = self._query("code")
        state = self._query("state")
        error = self._query("error")
        if error:
            return self._page(f"Basecamp a refusé l'accès ({error}).", ok=False)
        if not code or not basecamp.check_state(state):
            return self._page("Lien d'autorisation expiré ou inconnu : relance « Se connecter » "
                              "depuis Réglages → Basecamp.", ok=False)
        try:
            basecamp.exchange(code)
        except (ValueError, RuntimeError) as e:
            return self._page(str(e), ok=False)
        basecamp.kickoff()
        self.send_response(303)
        self.send_header("Location", "/")
        self.send_header("Content-Length", "0")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    # ── icône d'un onglet perso, relayée pour que la page puisse la recadrer ──
    def _favicon(self, host):
        try:
            cfg = store.read(store.CONFIG, {}) or {}
        except ValueError:
            cfg = {}
        own = {(urllib.parse.urlsplit(t.get("url") or "").hostname or "").lower()
               for t in cfg.get("tabs") or [] if isinstance(t, dict)}
        try:
            body, ctype = favicons.get(host, (cfg.get("ui") or {}).get("faviconProvider"), own)
        except ValueError as e:
            return self._err(422, str(e))
        if not body:
            return self._err(404, "icône introuvable")
        self._send(200, body, ctype, cache="public, max-age=86400")

    # ── fichier local d'un onglet perso (lecture seule) ──────────────────────
    def _file(self, shown):
        try:
            target = localfile.locate(shown)
        except ValueError as e:
            return self._err(404, str(e))
        if os.path.isdir(target):
            body = localfile.listing(target)
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Security-Policy", "sandbox")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
            return
        size = os.path.getsize(target)
        self.send_response(200)
        for k, v in localfile.headers(target).items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(size))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        if self.command == "HEAD":
            return
        with open(target, "rb") as f:
            while chunk := f.read(1 << 16):
                self.wfile.write(chunk)

    def _page(self, message, ok):
        body = (
            "<!doctype html><meta charset=utf-8><title>homedash · Basecamp</title>"
            "<body style='font:15px system-ui;background:#0b0d12;color:#e5e7eb;padding:3rem'>"
            f"<p>{'✓' if ok else '✗'} {html.escape(message)}</p>"
            "<p><a style='color:#60a5fa' href='/'>Revenir à homedash</a></p>"
        ).encode()
        self._send(200 if ok else 400, body, "text/html; charset=utf-8")

    # ── statique ──────────────────────────────────────────────────────────────
    def _static(self, path):
        pathname = urllib.parse.unquote(path)
        if pathname.endswith("/"):
            pathname += "index.html"

        target = (PUBLIC_DIR / pathname.lstrip("/")).resolve()
        if target != PUBLIC_DIR and PUBLIC_DIR not in target.parents:
            return self._err(403, "interdit")   # traversée de répertoire

        if target.is_file():
            ext   = target.suffix
            # les assets Vite portent un hash dans leur nom → immuables
            cache = ("public, max-age=31536000, immutable"
                     if pathname.startswith("/assets/") else "no-cache")
            return self._send(200, target.read_bytes(),
                              MIME.get(ext, "application/octet-stream"), cache)

        if target.suffix:
            return self._err(404, "introuvable")

        index = PUBLIC_DIR / "index.html"
        if not index.is_file():
            return self._err(404, "build absent — lancer `npm run build`")
        return self._send(200, index.read_bytes(), MIME[".html"], "no-cache")

def main():
    store.DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not store.path_of(store.CONFIG).exists():
        # Instance neuve (une seconde instance, un data/ vide) : de quoi afficher
        # la page, tout le reste se remplit depuis Réglages.
        store.write(store.CONFIG, {"title": "homedash", "groups": [
            {"name": "Liens", "icon": "⭐", "links": [
                {"name": "GitHub", "url": "https://github.com/", "pinned": True}]}]})
        print("ℹ config.json créé — tout se règle dans l'onglet Réglages", flush=True)
    # Avant load_sections() : si la version a changé, les données sont
    # sauvegardées telles quelles, avant toute migration de config.
    updates.on_start()
    load_sections()

    backup.start_auto()
    updates.start()
    basecamp.start()

    connected = [m for m in accounts.all_mods() if m.token()]
    if not connected:
        print("ℹ GitHub non connecté — Réglages → Compte", flush=True)
    else:
        print(f"ℹ GitHub : {len(connected)} compte(s) connecté(s)", flush=True)
    accounts.kickoff_all()   # premier fetch au démarrage : la page n'attend pas
    accounts.start_loop()    # puis toutes les 3 min sans page (journal, cloche)
    perflog.start(accounts.github_stats)   # data/perf/ : ce que homedash consomme

    if localgit.enabled():
        localgit.kickoff("démarrage")
        # surveille les .git : un `git fetch` tapé dans un terminal rafraîchit
        # la page sans qu'on ait à cliquer
        localgit.start_watch()
    else:
        print("ℹ onglet Local : aucun dossier lisible — Réglages → Dépôts locaux", flush=True)

    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    srv.daemon_threads = True
    print(f"homedash sur http://{HOST}:{PORT} — data {store.DATA_DIR}", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()
