"""Onglets perso : un fichier ou un dossier du disque, servi en lecture seule.

Une page servie en http ne peut pas ouvrir un lien `file://` (le navigateur le
bloque) : le fichier passe donc par `GET /api/file?path=…`. Même périmètre que
l'explorateur de Réglages : le dossier personnel (monté `:ro` sur /host), après
`realpath`, sans dossier ni fichier caché (`.ssh`, `.env`…). Rien n'est écrit,
rien n'est exécuté.
"""

import html
import mimetypes
import os
import urllib.parse

import localgit
import store

# Types qu'un navigateur exécute (scripts) : servis dans une origine opaque
# (`CSP: sandbox`), pour qu'une page du disque ne parle pas à l'API comme si
# elle était homedash. Le reste (PDF, images, texte) passe tel quel : Chrome
# refuse d'afficher un PDF dans un document sandboxé.
ACTIVE = {"text/html", "application/xhtml+xml", "image/svg+xml", "text/xml", "application/xml"}
SANDBOX = "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms"
# Sources, scripts, configs… : affichés comme du texte plutôt que téléchargés.
TEXTLIKE = {".md", ".txt", ".log", ".csv", ".tsv", ".json", ".yml", ".yaml", ".toml", ".ini",
            ".py", ".ts", ".tsx", ".js", ".jsx", ".sh", ".sql", ".css", ".env.example"}


def locate(path):
    """Chemin affiché (`~/…`, absolu de l'hôte ou `file://…`) → chemin réel
    lisible ici. Lève ValueError hors du dossier personnel ou caché."""
    path = (path or "").strip()
    if path.startswith("file://"):
        path = urllib.parse.unquote(urllib.parse.urlsplit(path).path)
    if not path:
        raise ValueError("chemin vide")
    base = os.path.realpath(localgit.home_base())
    target = os.path.realpath(localgit.resolve(path))
    if target != base and not target.startswith(base + "/"):
        raise ValueError("hors du dossier personnel")
    if any(part.startswith(".") for part in target[len(base):].split("/") if part):
        raise ValueError("fichier ou dossier caché : non servi")
    if not os.path.exists(target):
        raise ValueError(f"{path} introuvable")
    if _in_data_dir(target, base):
        raise ValueError("dossier de données homedash : non servi")
    return target


def _in_data_dir(target, base):
    """Le `data/` d'une instance homedash (celle-ci ou une autre) vit souvent
    dans le dossier personnel : jetons, mots de passe des Infos, sauvegardes.
    On le reconnaît à son `secrets.json`, à n'importe quel niveau."""
    d = target if os.path.isdir(target) else os.path.dirname(target)
    while d == base or d.startswith(base + "/"):
        if os.path.exists(os.path.join(d, store.SECRETS)):
            return True
        if d == base:
            break
        d = os.path.dirname(d)
    return False


def content_type(target):
    ext = os.path.splitext(target)[1].lower()
    if ext in TEXTLIKE:
        return "text/plain; charset=utf-8"
    ctype = mimetypes.guess_type(target)[0] or "application/octet-stream"
    if ctype.startswith("text/") or ctype in ACTIVE:
        ctype += "; charset=utf-8"
    return ctype


def headers(target):
    """En-têtes de la réponse : le sandbox pour ce qui peut exécuter du code."""
    ctype = content_type(target)
    out = {"Content-Type": ctype, "X-Content-Type-Options": "nosniff",
           "Content-Disposition": "inline; filename*=UTF-8''"
                                  + urllib.parse.quote(os.path.basename(target))}
    if ctype.split(";")[0] in ACTIVE:
        out["Content-Security-Policy"] = SANDBOX
    return out


def listing(target):
    """Un dossier : la liste de son contenu, chaque entrée renvoyant ici.
    Page sans script, servie elle aussi dans le sandbox."""
    shown = localgit.display(target)
    rows = []
    try:
        entries = sorted(os.scandir(target), key=lambda e: (not e.is_dir(), e.name.lower()))
    except OSError as e:
        entries, rows = [], [f"<li>✗ {html.escape(str(e))}</li>"]
    base = os.path.realpath(localgit.home_base())
    parent = os.path.dirname(target)
    if target != base:
        rows.append(f"<li><a href='?path={urllib.parse.quote(localgit.display(parent))}'>↰ ..</a></li>")
    for e in entries:
        if e.name.startswith("."):
            continue
        try:
            is_dir = e.is_dir()
        except OSError:
            continue
        href = "?path=" + urllib.parse.quote(localgit.display(e.path))
        rows.append(f"<li><a href='{href}'>{'📁' if is_dir else '📄'} {html.escape(e.name)}</a></li>")
    return (
        "<!doctype html><meta charset=utf-8><meta name=color-scheme content='light dark'>"
        f"<title>{html.escape(shown)}</title>"
        "<style>body{font:14px system-ui;margin:1.5rem}ul{list-style:none;padding:0}"
        "li{padding:.2rem 0}a{text-decoration:none}a:hover{text-decoration:underline}</style>"
        f"<h3><code>{html.escape(shown)}</code></h3><ul>{''.join(rows)}</ul>"
    ).encode()
