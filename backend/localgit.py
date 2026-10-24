"""Dépôts locaux : quelles branches traînent, lesquelles sont supprimables.

Le pendant local de `github.py`. Là où GitHub dit ce qui existe sur le distant,
ce module dit ce qu'il y a sur le disque et confronte les deux — c'est de l'écart
entre les deux que sortent les branches mergées oubliées et les `refs/remotes`
périmés faute de `git fetch --prune`.

Rien n'est jamais exécuté ni écrit : `gitread` ne sait que lire, et les commandes
proposées sont du texte à copier. C'est délibéré — un tableau de bord qui
supprime des branches tout seul est un tableau de bord qu'on n'ose plus ouvrir.
"""

import calendar
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import events
import accounts as github   # vue regroupée de tous les comptes
import gitread
import perflog

CFG = {
    "enabled": True,
    # {"path": "~/dev/projects"} : chemin côté hôte, résolu par `resolve()`.
    # `as` (facultatif) est ce qui apparaît dans les commandes à copier-coller.
    "roots": [],
    "max_depth": 3,
    "ignore": ["node_modules", "vendor", "archived", "dist", "build", "cache",
               "var", "storage", "Pdf", "tmp"],
    "protected": ["master", "main", "develop", "preprod", "staging", "prod"],
    "check_dirty": True,
    "refresh": 120,
    "walk_limit": 4000,
    "pr_lookups": 30,
    # Surveillance : période en secondes du contrôle d'empreinte (0 = désactivée).
    "watch": 2,
    # On arrête de surveiller quand plus personne ne regarde depuis ce délai.
    "watch_idle": 300,
}
_cfg_lock = threading.Lock()

# La PR d'une branche disparue du distant ne changera plus. C'est le seul appel
# réseau du scan et, sans cache, il coûtait ~1,3 s des 1,5 s d'un cycle. Clé sur
# le sha local : si la branche bouge, on redemande.
_pr_cache = {}
_pr_lock  = threading.Lock()

def _lookup_pr(repo, branch, sha, owner=None):
    key = (repo, branch, sha)
    with _pr_lock:
        if key in _pr_cache:
            return _pr_cache[key]
    found = github.pr_for_branch(repo, branch, owner)
    with _pr_lock:
        if len(_pr_cache) > 500:
            _pr_cache.clear()
        _pr_cache[key] = found
    return found

def configure(local_cfg):
    with _cfg_lock:
        CFG.update({k: v for k, v in (local_cfg or {}).items() if not k.startswith("_")})

# ── Chemins : hôte ↔ conteneur ───────────────────────────────────────────────
# Le docker-compose monte le dossier personnel de l'hôte en lecture seule sur
# /host, et HOST_HOME dit ce qu'il vaut côté hôte. Les dossiers choisis dans la
# page s'écrivent `~/…` : ils restent valables hors Docker (backend lancé sur
# l'hôte, où `~` est le vrai dossier personnel) comme dans le conteneur.
HOST_MOUNT = os.environ.get("HOST_MOUNT", "/host")
# Chacun range ses projets où il veut : le disque est monté aussi, en lecture
# seule, sur /hostdisk (`C:` sous Windows, `/Volumes` sur Mac : ce que Docker
# Desktop partage d'office), et HOST_DISK dit ce qu'il vaut côté hôte. Seul
# l'onglet Local s'en sert ; les onglets perso restent au dossier personnel.
DISK_MOUNT = os.environ.get("DISK_MOUNT", "/hostdisk")
# Dossiers du dossier personnel qui ne contiennent jamais de clones : les
# masquer rend l'explorateur lisible, et évite d'y lancer un comptage.
BROWSE_SKIP = {"Library", "Applications", "Movies", "Music", "Pictures", "Public",
               "OrbStack", "go", "snap"}
# Même chose à la racine du disque (Windows : système, corbeille…).
DISK_SKIP = {"Windows", "Program Files", "Program Files (x86)", "ProgramData", "Recovery",
             "PerfLogs", "System Volume Information", "Config.Msi"}

def home_base():
    """Le dossier personnel tel que ce process le voit."""
    return HOST_MOUNT if os.path.isdir(HOST_MOUNT) else str(Path.home())

def home_display():
    return (os.environ.get("HOST_HOME") or str(Path.home())).rstrip("/")

def disk_base():
    """Le disque monté, ou rien (backend lancé hors Docker, montage absent)."""
    return DISK_MOUNT if os.path.isdir(DISK_MOUNT) else None

def disk_display():
    """Le disque côté hôte : `C:` (Windows) ou `/Volumes` (Mac)."""
    return (os.environ.get("HOST_DISK") or "").replace("\\", "/").rstrip("/")

def _under(path, prefix, fold=False):
    a, b = (path.lower(), prefix.lower()) if fold else (path, prefix)
    return a == b or a.startswith(b + "/")

def resolve(path):
    """Chemin affiché (`~/dev`, ou absolu côté hôte) → chemin lisible ici."""
    path = (path or "").replace("\\", "/").rstrip("/") or "/"
    base = home_base()
    if path == "~" or path.startswith("~/"):
        return base + path[1:]
    home = home_display().replace("\\", "/")
    if base != home and _under(path, home):
        return base + path[len(home):]
    disk, shown = disk_base(), disk_display()
    # `C:` : la lettre du lecteur s'écrit en majuscule ou non
    if disk and shown and _under(path, shown, fold=shown.endswith(":")):
        return disk + path[len(shown):]
    return path

def display(path):
    """Inverse de `resolve` : ce qu'on montre et ce qu'on met dans les commandes."""
    base = home_base().rstrip("/")
    if path == base or path.startswith(base + "/"):
        return "~" + path[len(base):]
    disk, shown = disk_base(), disk_display()
    if disk and shown and _under(path, disk):
        host = shown + path[len(disk):]
        # Windows : le dossier personnel est aussi sur le disque ; vu par là, il
        # reste `~/…`, sinon un même clone serait lu deux fois sous deux noms.
        home = home_display().replace("\\", "/")
        if home and _under(host, home, fold=shown.endswith(":")):
            return "~" + host[len(home):]
        return host
    return path

def browse_starts():
    """Points de départ du choix d'un dossier de clones : le dossier personnel, et le disque."""
    out = [{"label": "Dossier personnel", "path": "~"}]
    if disk_base() and disk_display():
        out.append({"label": disk_display() + ("/" if disk_display().endswith(":") else ""),
                    "path": disk_display()})
    return out

def _roots():
    out, seen = [], set()
    for entry in CFG.get("roots") or []:
        if isinstance(entry, str):
            entry = {"path": entry}
        shown = entry.get("as") or entry.get("path")
        # `path` d'abord (anciennes configs : /repos monté à part), puis le
        # chemin affiché résolu — c'est lui qui survit à un changement de montage.
        for cand in (entry.get("path"), resolve(entry.get("path")), resolve(shown)):
            if cand and os.path.isdir(cand):
                real = os.path.realpath(cand)
                if real not in seen:
                    seen.add(real)
                    out.append({"path": cand.rstrip("/"), "as": (shown or cand).rstrip("/")})
                break
    return out

def root_status():
    """Chaque racine configurée et si elle est lisible — pour la page Réglages."""
    live = {r["as"] for r in _roots()}
    out = []
    for entry in CFG.get("roots") or []:
        if isinstance(entry, str):
            entry = {"path": entry}
        shown = (entry.get("as") or entry.get("path") or "").rstrip("/")
        out.append({"as": shown, "ok": shown in live})
    return out

def browse(path="~", files=False):
    """Sous-dossiers de `path` (lecture seule) : de quoi choisir un dossier de
    clones dans la page. Limité au dossier personnel et au disque monté, après
    `realpath` (un lien vers le conteneur est refusé), rien au-dessus.
    `files` : ses fichiers aussi (choix d'un fichier pour un onglet perso) :
    dossier personnel seulement, c'est tout ce que `localfile` sert."""
    bases = [os.path.realpath(home_base())]
    if not files and disk_base():
        bases.append(os.path.realpath(disk_base()))
    target = os.path.realpath(resolve(path or "~"))
    base = next((b for b in bases if target == b or target.startswith(b + "/")), None)
    if base is None:
        return {"error": "hors du dossier personnel" if files else "hors des dossiers lisibles"}
    if not os.path.isdir(target):
        return {"error": f"{path} introuvable"}
    ignore = set(CFG.get("ignore") or [])
    dirs, found = [], []
    try:
        entries = sorted(os.scandir(target), key=lambda e: e.name.lower())
    except OSError as e:
        return {"error": str(e)}
    for e in entries:
        if e.name.startswith(".") or e.name in ignore:
            continue
        if not files and target == base and e.name in (DISK_SKIP if base != bases[0] else BROWSE_SKIP):
            continue
        if e.name.startswith("$"):              # $Recycle.Bin, $WinREAgent…
            continue
        try:
            if not e.is_dir(follow_symlinks=False):
                if files and e.is_file():
                    found.append({"name": e.name, "path": display(e.path)})
                continue
            git = os.path.exists(os.path.join(e.path, ".git"))
        except OSError:
            continue
        dirs.append({"name": e.name, "path": display(e.path), "git": git})
    shown = display(target)
    parent = None if target == base else display(os.path.dirname(target))
    if files:
        # pas de comptage de dépôts : on choisit un fichier, pas un dossier de clones
        return {"path": shown, "parent": parent, "dirs": dirs, "files": found,
                "repos": {"count": 0, "partial": False}}
    return {"path": shown, "parent": parent, "dirs": dirs, "starts": browse_starts(),
            "repos": _count_repos(target, ignore, int(CFG.get("max_depth", 3)))}

def _count_repos(root, ignore, max_depth, budget=3000):
    """Dépôts que l'onglet trouverait sous `root`. Plafonné : sur un dossier
    personnel entier, le parcours complet coûterait des secondes."""
    found, seen, stack = 0, 0, [(root, 0)]
    while stack:
        path, depth = stack.pop()
        seen += 1
        if seen > budget:
            return {"count": found, "partial": True}
        try:
            entries = list(os.scandir(path))
        except OSError:
            continue
        for e in entries:
            if e.name == ".git":
                found += 1
            elif depth < max_depth and not e.name.startswith(".") and e.name not in ignore \
                    and not (depth == 0 and path == home_base() and e.name in BROWSE_SKIP) \
                    and not (depth == 0 and path == disk_base() and (e.name in DISK_SKIP or e.name.startswith("$"))):
                try:
                    if e.is_dir(follow_symlinks=False):
                        stack.append((e.path, depth + 1))
                except OSError:
                    pass
    return {"count": found, "partial": False}

def enabled():
    return bool(CFG.get("enabled", True) and _roots())

# ── Correspondance dépôt local ↔ dépôt GitHub ────────────────────────────────
def _parse_remote(url):
    """`git@github.com:Org/repo.git` ou `https://github.com/Org/repo` → (org, repo)."""
    if not url:
        return None, None
    clean = url.rstrip("/")
    if clean.endswith(".git"):
        clean = clean[:-4]
    if "github.com" not in clean:
        return None, None
    tail = clean.split("github.com", 1)[1].lstrip(":/")
    parts = tail.split("/")
    return (parts[0], parts[1]) if len(parts) >= 2 else (None, None)

def _display(path, roots):
    for root in roots:
        if path == root["path"] or path.startswith(root["path"] + "/"):
            return root["as"] + path[len(root["path"]):]
    return path

# ── Verdict d'une branche ─────────────────────────────────────────────────────
# Ordre = priorité d'affichage : ce qui appelle une action passe devant.
_ORDER = {"gone": 0, "closed-pr": 1, "squashed": 2, "gone-merged": 3, "merged": 4,
          "local-only": 5, "diverged": 6, "unpushed": 7, "behind": 8,
          "ok": 9, "protected": 10}

def _verdict(b, default_branch):
    """Un état, une explication, et le drapeau de suppression qui va avec.

    Le distant fait foi quand on le connaît (`on_github`, lu sur l'API) ; le
    `refs/remotes/origin/*` local sert de repli et n'est justement pas fiable —
    c'est lui qui survit à la suppression d'une branche faute de `--prune`.
    """
    name    = b["name"]
    known   = b["on_github"] is not None
    on_gh   = b["on_github"] if known else b["remote_ref"]
    merged  = b["ahead_default"] == 0
    pr      = b.get("pr") or {}
    ahead   = b["ahead_default"]
    # Trois traces d'un `git push` passé, dans l'ordre de fiabilité décroissante.
    # Sans ce faisceau, une branche poussée puis élaguée en local serait annoncée
    # « jamais poussée », c'est-à-dire le contraire de la vérité.
    pushed_once = b["remote_ref"] or bool(b["upstream"]) or bool(pr)

    if b["protected"]:
        if b["behind_default"]:
            return "behind", f"{b['behind_default']} commit(s) de retard sur {default_branch} (GitHub)", None
        return "protected", "branche de référence", None

    if merged and not on_gh:
        state, advice, flag = ("gone-merged",
                               f"intégrée à {default_branch} puis supprimée sur GitHub : "
                               "plus rien à garder ici", "-d")
    elif merged:
        state, advice, flag = ("merged",
                               f"déjà entièrement intégrée à {default_branch} "
                               "(elle existe encore sur GitHub)", "-d")
    elif not on_gh and pr.get("merged"):
        state, advice, flag = ("squashed",
                               f"PR #{pr['number']} mergée puis branche supprimée : son contenu "
                               f"est dans {default_branch}, sous une autre forme", "-D")
    elif not on_gh and pr:
        state, advice, flag = ("closed-pr",
                               f"PR #{pr['number']} fermée sans être mergée, branche supprimée "
                               f"sur GitHub : {ahead} commit(s) n'existent plus que sur ce disque", None)
    elif not on_gh and pushed_once:
        # `remote_ref` disparaît au premier `fetch --prune`, mais
        # `branch.<x>.merge` reste dans .git/config : c'est lui qui garde la
        # trace d'un `push -u` une fois le ref distant nettoyé.
        state, advice, flag = ("gone",
                               f"envoyée sur GitHub puis supprimée là-bas, et {ahead} commit(s) "
                               f"ne sont pas dans {default_branch} : vérifier avant de jeter", "-D")
    elif not on_gh:
        state, advice, flag = ("local-only",
                               f"jamais envoyée sur GitHub : {ahead} commit(s) de travail en "
                               f"cours, sur ce disque seulement",
                               None)
    elif b["push_ahead"] is None:
        # GitHub la connaît, mais aucun origin/<b> sur ce disque (jamais fetchée,
        # ou poussée vers un autre remote) : rien pour comparer. « À jour » serait
        # une affirmation sans fondement.
        state, advice, flag = ("unknown",
                               f"existe sur GitHub, mais ce disque n'en a pas la copie : "
                               f"une synchro (git fetch) permettra de comparer", None)
    elif b["push_ahead"] and b["push_behind"]:
        state, advice, flag = ("diverged",
                               f"différente de GitHub : {b['push_ahead']} commit(s) ici seulement, "
                               f"{b['push_behind']} sur GitHub seulement", None)
    elif b["push_ahead"]:
        state, advice, flag = "unpushed", f"{b['push_ahead']} commit(s) pas encore envoyé(s) sur GitHub", None
    elif b["push_behind"]:
        state, advice, flag = "behind", f"{b['push_behind']} commit(s) à récupérer de GitHub", None
    else:
        state, advice, flag = "ok", "à jour avec GitHub", None

    if b["current"] and flag:
        # On ne supprime pas la branche sur laquelle on est — et git non plus.
        advice += f" · branche courante : `git switch {default_branch}` d'abord"
        flag = None
    return state, advice, flag

# ── « Est-ce que je perds quelque chose en supprimant ? » ────────────────────
# Axe distinct de l'état : l'état dit où en est la branche, la sûreté dit si son
# contenu existe ailleurs. C'est la seule question qui compte avant un `branch -d`,
# et c'est celle à laquelle git répond le plus mal — `-d` refuse une branche
# squashée dont il ne reste pourtant rien à sauver.
def _safety(b, default_branch):
    ahead = b["ahead_default"]
    pr    = b.get("pr") or {}
    on_gh = b["on_github"] if b["on_github"] is not None else b["remote_ref"]

    if ahead == 0:
        return {"level": "merged", "label": "✓ sauvegardée",
                "detail": f"chacun de ses commits est déjà dans {default_branch} sur GitHub"}
    if pr.get("merged"):
        return {"level": "squash", "label": "✓ PR mergée",
                "detail": f"PR #{pr['number']} mergée : son contenu est dans {default_branch} "
                          "sur GitHub, sous une autre forme (commits regroupés au merge), "
                          "ou ce disque n'est pas encore synchronisé"}
    if on_gh and b["push_ahead"] == 0:
        return {"level": "pushed", "label": "↑ sur GitHub",
                "detail": f"pas encore mergée, mais GitHub a les mêmes {ahead} commit(s) : "
                          "rien n'existe uniquement ici"}
    if on_gh and b["push_ahead"] is None:
        return {"level": "partial", "label": "? non comparée",
                "detail": "la branche existe sur GitHub mais ce disque n'en a pas la copie : "
                          "impossible de comparer avant une synchro (git fetch)"}
    if on_gh:
        n = b["push_ahead"] or 0
        return {"level": "partial", "label": f"⚠ {n} pas sur GitHub",
                "detail": f"la branche est sur GitHub, mais {n} commit(s) d'ici n'y sont pas encore"}
    if b["remote_ref"] or b["upstream"] or pr:
        return {"level": "local", "label": "⚠ effacée de GitHub",
                "detail": f"poussée par le passé puis supprimée sur GitHub : les {ahead} "
                          "commit(s) n'ont plus de copie en ligne"}
    return {"level": "local", "label": "⚠ jamais envoyée",
            "detail": f"travail en cours : {ahead} commit(s) qui n'ont jamais quitté "
                      "ce disque, aucune copie nulle part"}

SAFE_LEVELS = ("merged", "squash", "pushed")

def _action(b, safety):
    """La conclusion, en un mot : garder ou jeter.

    C'est la colonne qu'on lit en diagonale, donc elle ne dit qu'une chose et
    l'état détaillé reste à droite. Invariant : « à supprimer » exige que le
    contenu existe ailleurs. Un drapeau `-D` seul ne suffit pas — `git branch -D`
    accepte justement d'effacer une branche dont rien n'est sauvegardé, et
    afficher « à supprimer » dans ce cas serait un conseil de perdre du travail.
    """
    safe = safety["level"] in SAFE_LEVELS
    if b["delete"] and safe:
        return {"kind": "delete", "label": "🗑 à supprimer",
                "detail": f"{safety['detail']} — `git branch {b['delete']} {b['name']}`"}
    if b["delete"]:
        return {"kind": "check", "label": "🔍 à vérifier",
                "detail": f"{safety['detail']}. `git branch -D` l'effacerait quand même : "
                          "relire ces commits avant de lancer quoi que ce soit"}
    # `protected` avant `current` : sur les dépôts où l'on reste sur master, « tu es
    # dessus » s'affichait partout sans rien apprendre. « référence » situe la branche.
    if b["protected"]:
        here = " · et tu es dessus" if b["current"] else ""
        return {"kind": "ref", "label": "🏠 référence",
                "detail": f"branche de référence du dépôt, jamais proposée à la "
                          f"suppression{here}"}
    if b["current"]:
        return {"kind": "current", "label": "📍 tu es dessus",
                "detail": "branche courante : git refuse de la supprimer, et nous aussi"}
    if safety["level"] not in SAFE_LEVELS:
        return {"kind": "keep", "label": "⚠ à garder", "detail": safety["detail"]}
    return {"kind": "work", "label": "🔧 en cours", "detail": safety["detail"]}

# ── Lecture d'un dépôt ────────────────────────────────────────────────────────
def _read_repo(worktree, roots, facts, budget):
    path    = str(worktree)
    display = _display(path, roots)
    entry = {
        "path": path, "display": display, "name": os.path.basename(path),
        "org": None, "repo": None, "url": None, "error": None,
        "default_branch": None, "head": None, "detached": False,
        "branches": [], "stashes": 0, "fetched_at": None, "dirty": None,
        "linked": False,
        "commands": [], "counts": {},
    }
    repo = None
    try:
        repo = gitread.Repo(worktree)
        org, name = _parse_remote(repo.remote_url())
        entry["org"], entry["repo"] = org, name
        entry["url"] = f"https://github.com/{org}/{name}" if org and name else None

        head_branch, head_sha = repo.head()
        entry["head"]     = head_branch or (head_sha[:8] if head_sha else None)
        entry["detached"] = head_branch is None and bool(head_sha)

        snapshot = github.remote_snapshot(name) if name else None
        entry["linked"] = snapshot is not None
        default  = (snapshot or {}).get("default") or repo.default_branch() or "master"
        entry["default_branch"] = default
        entry["fetched_at"]     = repo.fetched_at()
        entry["stashes"]        = repo.stash_count()
        if CFG.get("check_dirty", True):
            entry["dirty"] = repo.modified()

        refs      = repo.refs
        heads     = {k[len("refs/heads/"):]: v for k, v in refs.items()
                     if k.startswith("refs/heads/")}
        remotes   = {k[len("refs/remotes/origin/"):]: v for k, v in refs.items()
                     if k.startswith("refs/remotes/origin/")}
        base_sha  = remotes.get(default) or heads.get(default)
        protected = set(CFG.get("protected") or []) | {default}
        limit     = CFG.get("walk_limit", 4000)

        for branch, sha in sorted(heads.items()):
            tip = repo.commit(sha) or {}
            ahead_d, behind_d, capped = repo.ahead_behind(sha, base_sha, limit)
            remote_sha = remotes.get(branch)
            if remote_sha:
                push_a, push_b, _ = repo.ahead_behind(sha, remote_sha, limit)
            else:
                push_a, push_b = None, None

            fact = facts.get((name, branch)) if name else None
            on_github = None
            if snapshot is not None:
                on_github = branch in snapshot["branches"]

            b = {
                "name": branch, "sha": sha, "short": sha[:8],
                "current": branch == head_branch,
                "protected": branch in protected,
                "upstream": repo.upstream_of(branch),
                "remote_ref": branch in remotes,
                "remote_sha": remote_sha,
                "ahead_default": ahead_d or 0, "behind_default": behind_d or 0,
                "capped": capped,
                "push_ahead": push_a, "push_behind": push_b,
                "on_github": on_github,
                "date": tip.get("time") or 0,
                "author": tip.get("author") or "",
                "subject": tip.get("subject") or "",
                "pr": (fact or {}).get("pr"),
            }
            state, advice, flag = _verdict(b, default)
            # `gone` et `local-only` sont les deux seuls cas où l'on ne sait pas
            # si le travail est perdu : un appel par branche, en 304 les fois
            # suivantes, et le verdict devient exploitable.
            if state in ("gone", "local-only") and name and snapshot is not None \
                    and budget.acquire(blocking=False):
                found = _lookup_pr(name, branch, sha, entry["org"])
                if found:
                    b["pr"] = found
                    state, advice, flag = _verdict(b, default)
            b["state"], b["advice"], b["delete"] = state, advice, flag
            b["safety"] = _safety(b, default)
            b["action"] = _action(b, b["safety"])
            entry["branches"].append(b)

        entry["branches"].sort(
            key=lambda b: (not b["current"], _ORDER.get(b["state"], 99), -b["date"]))
        entry["counts"] = {
            "branches": len(entry["branches"]),
            "deletable": sum(1 for b in entry["branches"] if b["delete"] == "-d"),
            "squashed":  sum(1 for b in entry["branches"]
                             if b["state"] == "squashed" and b["delete"] == "-D"),
            "risky":     sum(1 for b in entry["branches"]
                             if b["delete"] == "-D" and b["state"] != "squashed"),
            "unpushed":  sum(1 for b in entry["branches"] if b["state"] == "unpushed"),
            "safe":      sum(1 for b in entry["branches"]
                             if b["safety"]["level"] in SAFE_LEVELS),
            "at_risk":   sum(1 for b in entry["branches"]
                             if b["safety"]["level"] not in SAFE_LEVELS),
        }
        entry["commands"] = _commands(entry)
    except Exception as e:
        entry["error"] = f"{type(e).__name__}: {e}"
    finally:
        if repo is not None:
            repo.close()
    return entry

# ── Commandes proposées (jamais exécutées) ───────────────────────────────────
_SAFE = set("-_./~@+")

def _quote(name):
    """Un nom de branche n'a rien d'arbitraire mais peut contenir des caractères
    que le shell interprète — les slashs de `fix/…` passent, pas le reste."""
    return name if all(c.isalnum() or c in _SAFE for c in name) else f"'{name}'"

def _shell_path(path):
    """Nu si le shell n'y touchera pas : entre guillemets, `~/dev/…` resterait
    littéral et le `cd` échouerait."""
    return path if all(c.isalnum() or c in _SAFE for c in path) else f'"{path}"'

def _commands(entry):
    cd      = f'cd {_shell_path(entry["display"])}'
    default = entry["default_branch"]
    out     = [{
        "id": "fetch", "label": "Rafraîchir le distant",
        "cmd": f"{cd} && git fetch --prune",
        "hint": "met à jour les refs distantes et supprime celles dont la branche "
                "n'existe plus sur GitHub — c'est ce qui rend cette page fiable",
    }]

    safe = [b["name"] for b in entry["branches"] if b["delete"] == "-d"]
    if safe:
        out.append({
            "id": "delete", "label": f"Supprimer {len(safe)} branche(s) mergée(s)",
            "cmd": f"{cd} && git branch -d {' '.join(_quote(n) for n in safe)}",
            "hint": f"`-d` refuse de supprimer une branche non mergée dans origin/{default} : "
                    "si git râle, c'est que la page se trompe, pas l'inverse",
        })

    squashed = [b["name"] for b in entry["branches"]
                if b["state"] == "squashed" and b["delete"] == "-D"]
    if squashed:
        out.append({
            "id": "squashed", "label": f"Supprimer {len(squashed)} branche(s) squashée(s)",
            "cmd": f"{cd} && git branch -D {' '.join(_quote(n) for n in squashed)}",
            "hint": "leur PR est mergée : le contenu est dans le distant sous un autre "
                    "sha, ce qui force `-D` là où `-d` refuserait à tort",
        })

    risky = [b["name"] for b in entry["branches"]
             if b["delete"] == "-D" and b["state"] != "squashed"]
    if risky:
        out.append({
            "id": "force", "label": f"Forcer {len(risky)} branche(s) sans distant",
            "cmd": f"{cd} && git branch -D {' '.join(_quote(n) for n in risky)}",
            "danger": True,
            "hint": "aucune PR mergée retrouvée pour ces branches : `-D` ne vérifie rien "
                    "et leurs commits n'existent nulle part ailleurs. À relire une par une",
        })

    head = next((b for b in entry["branches"] if b["current"]), None)
    if head and head["push_behind"] and not head["push_ahead"]:
        # Seulement en retard : le pull avance la branche sans commit de merge.
        # Divergée, un `git pull` sans réglage refuse de choisir : rien de proposé.
        # Sans amont configuré, `git pull` seul ne sait pas quoi tirer.
        pull = "git pull" if head["upstream"] else f"git pull origin {_quote(head['name'])}"
        out.append({
            "id": "pull", "label": f"Tirer origin/{head['name']}",
            "cmd": f"{cd} && {pull}",
            "hint": f"{head['push_behind']} commit(s) poussé(s) sur origin/{head['name']} "
                    "qui ne sont pas encore ici",
        })
    if head and head["name"] != default and head["behind_default"]:
        # Merge et non rebase, même pour une branche jamais poussée : rien n'est
        # réécrit, et les conflits se règlent une fois au lieu de commit par commit.
        out.append({
            "id": "merge", "label": f"Rattraper origin/{default}",
            "cmd": f"{cd} && git fetch origin && git merge origin/{default}",
            "hint": f"{head['name']} a {head['behind_default']} commit(s) de retard sur "
                    f"origin/{default}",
        })
    return out

# ── Journal : une branche locale devenue supprimable ─────────────────────────
# On note l'APPARITION, jamais l'état : sans ça, chaque scan re-signalerait tout
# ce qui traîne depuis des semaines. Et on se branche sur le disque plutôt que
# sur l'événement « PR mergée » — une PR mergée dont aucune copie locale n'existe
# ne mérite pas d'entrée, une branche devenue supprimable autrement (effacée sur
# GitHub par quelqu'un d'autre) la mérite tout autant.
_prev_removable = set()
_prev_repos = set()
_seed = {"done": False, "start": time.time()}
# Une PR mergée il y a plus longtemps n'est pas une nouvelle, c'est un vieux
# merge que le scan découvre seulement maintenant : les recherches de PR sont
# limitées (`pr_lookups`) par passage, une branche bascule donc des heures
# après le démarrage. Pareil pour un dépôt jamais vu (nouveau dossier).
RECENT_MERGE = 2 * 86400

def _old_merge(pr, now=None):
    """Vrai si la PR a été mergée il y a plus de RECENT_MERGE."""
    raw = (pr or {}).get("merged_at")
    if not raw:
        return False
    try:
        ts = calendar.timegm(time.strptime(raw.replace("Z", ""), "%Y-%m-%dT%H:%M:%S"))
    except (ValueError, OverflowError):
        return False
    return (now or time.time()) - ts > RECENT_MERGE

def _removable(repos):
    """{(dépôt, branche): (dépôt, branche)} — les « 🗑 à supprimer » du moment."""
    return {(r["name"], b["name"]): (r, b)
            for r in repos if not r.get("error")
            for b in r["branches"] if b["action"]["kind"] == "delete"}

def _record_cleanup(repos):
    global _prev_removable, _prev_repos
    current = _removable(repos)
    seen_repos, _prev_repos = _prev_repos, {r["name"] for r in repos if not r.get("error")}

    # Amorçage. Tant que GitHub n'a pas répondu, les verdicts reposent sur les
    # seuls `refs/remotes` locaux : sa première réponse en bascule un paquet d'un
    # coup, et ce n'est pas un événement, c'est l'information qui arrive. On
    # amorce donc jusqu'au premier scan éclairé — avec une sortie de secours au
    # bout de deux minutes, sinon un token mort couperait le journal pour de bon.
    if not _seed["done"]:
        lit = (not github.enabled()) or github.remote_version() > 0
        if lit or time.time() - _seed["start"] > 120:
            _seed["done"] = True
        _prev_removable = set(current)
        return

    fresh = [current[k] for k in current if k not in _prev_removable]
    _prev_removable = set(current)
    # Déjà annoncée (avant un redémarrage) : le journal s'en souvient, pas nous.
    told = events.tags_since(time.time() - RECENT_MERGE)
    # Une même branche dans plusieurs dépôts (mergée partout d'un coup) : une ligne.
    groups = {}
    for repo, b in fresh:
        pr = b.get("pr") or {}
        key = f"local:{repo['name']}/{b['name']}"
        if repo["name"] not in seen_repos or _old_merge(pr) or key in told:
            continue
        groups.setdefault((b["name"], bool(pr.get("merged_at"))), []).append((repo, pr, key))
    out = []
    for (name, merged), items in groups.items():
        names = [r["name"] for r, _, _ in items]
        what = "est mergée" if merged else "n'existe plus sur GitHub"
        where = names[0] if len(names) == 1 else f"{len(names)} dépôts"
        body = ("Ta copie locale peut être supprimée" if len(names) == 1
                else f"Copies locales à supprimer : {', '.join(names)}") + " (commande dans l'onglet Local)."
        keys = [k for _, _, k in items]
        repo, pr, _ = items[0]
        out.append(events.event(
            "local-cleanup", "warn", "local", f"🧹 {name} {what} · {where}", body,
            repo["name"], pr.get("url") or repo.get("url") or "",
            keys[0] if len(keys) == 1 else f"local:{name}", keys=keys))
    events.record(out)

# ── État partagé ──────────────────────────────────────────────────────────────
_data  = {"repos": []}
_state = {"ts": 0.0, "building": False, "lock": threading.Lock(),
          "error": None, "took": 0.0, "gh": -1,
          # dernière requête du front : sans spectateur, la surveillance dort
          "seen": 0.0, "trigger": None, "watching": False}
_sigs  = {}          # chemin -> empreinte du dernier scan

def invalidate():
    with _state["lock"]:
        _state["ts"] = 0.0

def rebuild(trigger=None):
    started = time.monotonic()
    gh_version = github.remote_version()
    try:
        roots  = _roots()
        ignore = set(CFG.get("ignore") or [])
        depth  = int(CFG.get("max_depth", 3))
        facts  = github.branch_facts_index()

        seen, worktrees = set(), []
        for root in roots:
            for path in gitread.discover(root["path"], ignore, depth):
                key = str(path)
                if key not in seen:
                    seen.add(key)
                    worktrees.append(path)

        # Plafond d'appels GitHub pour tout le cycle, partagé entre les threads :
        # une branche disparue ne réapparaîtra pas, inutile de payer 200 requêtes
        # pour le redécouvrir.
        budget  = threading.Semaphore(int(CFG.get("pr_lookups", 30)))
        ordered = sorted(worktrees, key=str)
        # En parallèle : le coût est en lstat sur le volume monté et en appels
        # GitHub, deux attentes qui libèrent le GIL. Pool volontairement petit,
        # un bind-mount macOS ne va pas plus vite qu'on ne le sollicite.
        if len(ordered) > 1:
            with ThreadPoolExecutor(max_workers=min(6, len(ordered))) as ex:
                repos = list(ex.map(lambda w: _read_repo(w, roots, facts, budget), ordered))
        else:
            repos = [_read_repo(w, roots, facts, budget) for w in ordered]
        _data["repos"] = repos
        try:
            _record_cleanup(repos)
        except Exception as e:
            # Le journal est un confort ; l'onglet Local est la garantie. Jamais
            # le premier ne doit emporter le second.
            print(f"✗ Journal (local) : {e}", file=sys.stderr, flush=True)
        _sigs.clear()
        for r in repos:
            _sigs[r["path"]] = gitread.signature(r["path"])
        with _state["lock"]:
            _state["ts"], _state["error"] = time.time(), None
            _state["took"] = time.monotonic() - started
            _state["gh"] = gh_version
            _state["trigger"] = trigger
        print(f"✅ Local : {len(repos)} dépôts lus en {_state['took']:.2f}s", flush=True)
        perflog.scanned("local")
        perflog.timed("local", _state["took"], repos=len(repos))
    except Exception as e:
        with _state["lock"]:
            _state["error"] = str(e)
        print(f"✗ Local : {e}", file=sys.stderr, flush=True)
    finally:
        with _state["lock"]:
            _state["building"] = False

def kickoff(trigger=None):
    with _state["lock"]:
        if _state["building"]:
            return False
        _state["building"] = True
    threading.Thread(target=rebuild, args=(trigger,), daemon=True).start()
    return True

# ── Surveillance : réagir à une commande tapée dans un terminal ──────────────
# Un index touché ne vaut pas un fetch : on ne relit pas plus souvent que ça
# pour lui, alors qu'un changement de refs déclenche immédiatement.
INDEX_DEBOUNCE = 30

def _priority(cause):
    """Ordre de `_WATCHED` : ce qui touche aux refs prime sur l'index."""
    order = list(gitread.CAUSE.values())
    return order.index(cause) if cause in order else len(order)


def _watch_loop():
    """Relance un scan dès qu'un `git` a touché à un dépôt.

    Sept `stat` par dépôt, 0,3 ms pour dix — assez bon marché pour tourner toutes
    les deux secondes. Le scan complet, lui, coûte 200 ms : on ne le déclenche que
    sur changement constaté. Et on ne surveille rien tant que personne ne regarde,
    pour ne pas tenir le volume monté éveillé la nuit.
    """
    tick = 0
    while True:
        period = max(1, int(CFG.get("watch", 2) or 2))
        time.sleep(period)
        if not CFG.get("watch") or not enabled():
            continue
        with _state["lock"]:
            idle = time.time() - _state["seen"] > int(CFG.get("watch_idle", 300))
            busy = _state["building"]
        if idle or busy:
            continue

        tick += 1
        try:
            # On regarde TOUS les dépôts avant de conclure : s'arrêter au premier
            # qui bouge laisserait un `git fetch` derrière un simple index touché.
            causes = []
            for path, before in list(_sigs.items()):
                after = gitread.signature(path)
                if after != before:
                    causes.append(gitread.what_changed(before, after) or "dépôt modifié")
            cause = min(causes, key=_priority) if causes else None

            # Un éditeur avec intégration git (VS Code) lance `git status` en
            # boucle, ce qui réécrit `.git/index` sans que rien d'intéressant
            # n'ait changé. Seul ce cas est temporisé ; un fetch passe tout de suite.
            if cause == gitread.CAUSE["index"]:
                if time.time() - _state.get("index_scan", 0) < INDEX_DEBOUNCE:
                    continue
                _state["index_scan"] = time.time()
            # Un dépôt fraîchement cloné n'a pas d'empreinte : on relit la liste
            # de temps en temps (9 ms), pas à chaque tour.
            if cause is None and tick % 5 == 0:
                found = {str(p) for r in _roots()
                         for p in gitread.discover(r["path"], set(CFG.get("ignore") or []),
                                                   int(CFG.get("max_depth", 3)))}
                if found != set(_sigs):
                    cause = "dépôt ajouté ou retiré"
            if cause:
                print(f"👀 Local : {cause} → relecture", flush=True)
                kickoff(cause)
        except Exception as e:
            print(f"✗ Local (surveillance) : {e}", file=sys.stderr, flush=True)

def start_watch():
    with _state["lock"]:
        if _state["watching"]:
            return
        _state["watching"] = True
    threading.Thread(target=_watch_loop, daemon=True).start()

def payload():
    if not enabled():
        return {"enabled": False,
                "error": None if CFG.get("enabled", True)
                         else "onglet Local désactivé — Réglages → Fonctionnalités",
                "hint": "aucun dossier de dépôts — Réglages → Dépôts locaux"}
    with _state["lock"]:
        _state["seen"] = time.time()          # quelqu'un regarde : la surveillance vit
        stale = (time.time() - _state["ts"] >= max(15, int(CFG.get("refresh", 120)))
                 # GitHub a répondu depuis le dernier scan : les verdicts « existe
                 # sur le distant » se basaient jusque-là sur les seuls refs locaux
                 or _state["gh"] != github.remote_version())
    if stale:
        kickoff()
    with _state["lock"]:
        ts, err, building, took = (_state["ts"], _state["error"],
                                   _state["building"], _state["took"])
        trigger, watching = _state["trigger"], _state["watching"]

    repos = _data["repos"]
    # Le `fetch --prune` global : c'est lui qui rend cette page exacte, et le
    # relancer dépôt par dépôt est précisément la corvée qu'on cherche à éviter.
    paths  = [_shell_path(r["display"]) for r in repos if not r["error"]]
    global_commands = []
    if paths:
        global_commands.append({
            "id": "fetch-all",
            "label": f"Rafraîchir les {len(paths)} dépôts",
            "cmd": "for d in " + " ".join(paths) +
                   '; do printf "\\n== %s\\n" "$d"; git -C "$d" fetch --prune; done',
            "hint": "supprime les refs distantes dont la branche n'existe plus sur "
                    "GitHub — après ça, « distant supprimé » veut vraiment dire "
                    "supprimé, et les compteurs de retard sont à jour",
        })
    totals = {
        "repos":     len(repos),
        "branches":  sum(r["counts"].get("branches", 0) for r in repos),
        "deletable": sum(r["counts"].get("deletable", 0) for r in repos),
        "squashed":  sum(r["counts"].get("squashed", 0) for r in repos),
        "risky":     sum(r["counts"].get("risky", 0) for r in repos),
        "unpushed":  sum(r["counts"].get("unpushed", 0) for r in repos),
        "dirty":     sum(1 for r in repos if (r.get("dirty") or {}).get("count")),
        "safe":      sum(r["counts"].get("safe", 0) for r in repos),
        "at_risk":   sum(r["counts"].get("at_risk", 0) for r in repos),
    }
    return {
        "enabled": True, "updated_at": ts, "building": building,
        "error": err, "took": took,
        "refresh": max(15, int(CFG.get("refresh", 120))),
        # `watch` sert aussi de cadence au front : inutile de sonder plus vite
        # que le serveur ne peut constater un changement.
        "watch": int(CFG.get("watch", 2) or 0),
        "watching": watching,
        "trigger": trigger,
        "github_linked": github.enabled(),
        "roots": [r["as"] for r in _roots()],
        "repos": repos, "totals": totals, "global_commands": global_commands,
    }
