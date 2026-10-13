#!/usr/bin/env python3
"""homedash — serveur unique : fichiers statiques + API JSON + données GitHub.

Remplace server.js. Python stdlib uniquement, aucune dépendance.
"""

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
import events
import localgit
import store

PUBLIC_DIR = Path(os.environ.get("PUBLIC_DIR", "/app/public")).resolve()
PORT       = int(os.environ.get("PORT", "80"))
HOST       = os.environ.get("HOST", "0.0.0.0")
MAX_BODY   = 2 * 1024 * 1024

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

def load_sections():
    """(Re)configure les couches GitHub et Local depuis config.json. À chaud."""
    try:
        cfg = store.read(store.CONFIG, {})
    except ValueError as e:
        print(f"⚠ {e}", file=sys.stderr, flush=True)
        return
    accounts.configure(cfg)
    localgit.configure(cfg.get("local") or {})

def reload_all():
    """Après toute écriture de config (Réglages, restauration) : recharge les
    sections, vide les caches, et réveille ce qui dormait faute de config — un
    premier dossier de dépôts ajouté depuis la page doit suffire."""
    load_sections()
    accounts.invalidate_all()
    localgit.invalidate()
    if localgit.enabled():
        localgit.start_watch()
        localgit.kickoff("réglages")
    accounts.kickoff_all()

def adopt_login(acc_id, login):
    """Premier branchement d'un compte : son login devient l'utilisateur observé,
    pour que l'onglet GitHub ait de quoi s'afficher dès la connexion. Ne remplace
    jamais une valeur déjà saisie."""
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

    def _json(self, payload, status=200):
        self._send(status, json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                   "application/json; charset=utf-8")

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
        try:
            if path.startswith("/api/"):
                return self._api_get(path)
            return self._static(path)
        except Exception as e:
            self._err(500, str(e))

    do_HEAD = do_GET

    def do_PUT(self):
        return self._api_write(urllib.parse.urlparse(self.path).path)

    def do_POST(self):
        return self._api_write(urllib.parse.urlparse(self.path).path)

    def do_DELETE(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/api/usage":
            store.write(store.USAGE, {})
            return self._json({})
        if path == "/api/events":
            events.clear()
            return self._json({"ok": True})
        if path == "/api/github/token":
            mod = self._acc()
            if not mod:
                return self._err(404, "compte inconnu")
            accounts.set_token(mod.ACCOUNT["id"], None)
            reload_all()
            # un GH_TOKEN d'environnement peut reprendre la main : on le dit
            return self._json({"source": mod.token_source(), **mod.whoami()})
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
        if path == "/api/config":
            try:
                return self._json(store.read(store.CONFIG, {}))
            except ValueError as e:
                return self._err(500, str(e))
        if path == "/api/notes":
            return self._json(store.read(store.NOTES, []))
        if path == "/api/usage":
            return self._json(store.read(store.USAGE, {}))
        if path == "/api/github/accounts":
            return self._json({"accounts": accounts.listing()})
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
            return self._json(localgit.browse((q.get("path") or ["~"])[0]))
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
        if path == "/api/health":
            return self._json({"ok": True, "github": accounts.enabled(),
                               "local": localgit.enabled(),
                               "accounts": len(accounts.all_mods())})
        return self._err(404, "route inconnue")

    # ── écritures ─────────────────────────────────────────────────────────────
    def _api_write(self, path):
        try:
            if path == "/api/config":
                if self.command != "PUT":
                    return self._err(405, "PUT attendu")
                cfg     = self._body()
                problem = store.validate_config(cfg)
                if problem:
                    return self._err(422, problem)
                if "github_accounts" in cfg:
                    cfg = accounts.normalized(cfg)   # `github` suit le premier compte
                store.backup_config()
                store.write(store.CONFIG, cfg)
                reload_all()              # github/local ont peut-être changé
                return self._json({"ok": True, "savedAt": time.time()})

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
    load_sections()

    backup.start_auto()

    connected = [m for m in accounts.all_mods() if m.token()]
    if not connected:
        print("ℹ GitHub non connecté — Réglages → Compte", flush=True)
    else:
        print(f"ℹ GitHub : {len(connected)} compte(s) connecté(s)", flush=True)
    accounts.kickoff_all()   # premier fetch au démarrage : la page n'attend pas

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
