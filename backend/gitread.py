"""Lecture d'un dépôt git — sans binaire git, sans la moindre écriture.

Pourquoi relire les formats à la main plutôt qu'appeler git : *aucune* commande
git n'est en lecture seule. `git status` rafraîchit l'index, `git log` peut
écrire dans `.git/objects/info`, une commande interrompue laisse un `.lock`. Ici
le seul appel système d'écriture possible n'existe pas : tout passe par `open(…,
"rb")`, `os.lstat` et `mmap` en `ACCESS_READ`. La garantie « zéro modif » n'est
pas une promesse, c'est une propriété du code — et elle vaut aussi pour un dépôt
monté en lecture-écriture.

Ce qui est implémenté : refs (libres et empaquetées), objets (libres et dans les
packfiles, avec deltas), en-têtes de commit, comptage ahead/behind, et l'index
pour repérer les fichiers suivis modifiés.
"""

import binascii
import hashlib
import heapq
import mmap
import os
import struct
import zlib
from pathlib import Path

# ── Objets ────────────────────────────────────────────────────────────────────
OBJ_COMMIT, OBJ_TREE, OBJ_BLOB, OBJ_TAG, OBJ_OFS_DELTA, OBJ_REF_DELTA = 1, 2, 3, 4, 6, 7
_CHUNK = 1 << 16

def _inflate(mm, pos):
    """Décompresse un flux zlib à partir de `pos` sans lire tout le packfile."""
    d, out = zlib.decompressobj(), []
    while not d.eof:
        chunk = mm[pos:pos + _CHUNK]
        if not chunk:
            break
        pos += len(chunk)
        out.append(d.decompress(chunk))
    return b"".join(out)

def _varint(mm, pos):
    shift, value, c = 0, 0, 0x80
    while c & 0x80:
        c = mm[pos]
        pos += 1
        value |= (c & 0x7F) << shift
        shift += 7
    return value, pos

def _apply_delta(base, delta):
    """Format delta de git : tailles en varint, puis copies et insertions."""
    _, p = _varint(delta, 0)          # taille de la base, redondante
    size, p = _varint(delta, p)
    out = []
    n = len(delta)
    while p < n:
        cmd = delta[p]
        p += 1
        if cmd & 0x80:                # copie depuis la base
            off = length = 0
            for i, bit in enumerate((0x01, 0x02, 0x04, 0x08)):
                if cmd & bit:
                    off |= delta[p] << (i * 8)
                    p += 1
            for i, bit in enumerate((0x10, 0x20, 0x40)):
                if cmd & bit:
                    length |= delta[p] << (i * 8)
                    p += 1
            length = length or 0x10000
            out.append(base[off:off + length])
        elif cmd:                     # insertion littérale
            out.append(delta[p:p + cmd])
            p += cmd
        else:
            raise ValueError("instruction delta 0 réservée")
    data = b"".join(out)
    if len(data) != size:
        raise ValueError("taille delta incohérente")
    return data

class _Pack:
    """Un couple .idx / .pack, mappé en mémoire, ouvert en lecture seule."""

    def __init__(self, idx_path):
        self.idx_path  = idx_path
        self.pack_path = idx_path.with_suffix(".pack")
        self._idx = self._pack = None
        self._count = 0

    def _open(self):
        if self._idx is not None:
            return
        fi = open(self.idx_path, "rb")
        fp = open(self.pack_path, "rb")
        try:
            self._idx  = mmap.mmap(fi.fileno(), 0, access=mmap.ACCESS_READ)
            self._pack = mmap.mmap(fp.fileno(), 0, access=mmap.ACCESS_READ)
        finally:
            fi.close()
            fp.close()
        if self._idx[:4] != b"\xfftOc" or struct.unpack_from(">I", self._idx, 4)[0] != 2:
            raise ValueError(f"{self.idx_path.name} : index pack v2 attendu")
        self._count = struct.unpack_from(">I", self._idx, 8 + 255 * 4)[0]
        self._sha0  = 8 + 256 * 4                                   # table des sha
        self._crc0  = self._sha0 + self._count * 20
        self._ofs0  = self._crc0 + self._count * 4
        self._big0  = self._ofs0 + self._count * 4

    def close(self):
        for m in (self._idx, self._pack):
            if m is not None:
                m.close()
        self._idx = self._pack = None

    def _find(self, raw):
        """Recherche dichotomique dans la table de sha triée (fanout en amorce)."""
        self._open()
        first = raw[0]
        lo = struct.unpack_from(">I", self._idx, 8 + (first - 1) * 4)[0] if first else 0
        hi = struct.unpack_from(">I", self._idx, 8 + first * 4)[0]
        while lo < hi:
            mid = (lo + hi) // 2
            at  = self._sha0 + mid * 20
            cur = self._idx[at:at + 20]
            if cur < raw:
                lo = mid + 1
            elif cur > raw:
                hi = mid
            else:
                off = struct.unpack_from(">I", self._idx, self._ofs0 + mid * 4)[0]
                if off & 0x80000000:
                    off = struct.unpack_from(">Q", self._idx,
                                             self._big0 + (off & 0x7FFFFFFF) * 8)[0]
                return off
        return None

    def has(self, raw):
        return self._find(raw) is not None

    def get(self, raw, store):
        off = self._find(raw)
        return None if off is None else self._at(off, store)

    def _at(self, off, store):
        mm  = self._pack
        c   = mm[off]
        pos = off + 1
        kind, shift = (c >> 4) & 7, 4
        while c & 0x80:
            c = mm[pos]
            pos += 1
            shift += 7                       # la taille déclarée ne nous sert pas

        if kind == OBJ_OFS_DELTA:
            c = mm[pos]; pos += 1
            delta_off = c & 0x7F
            while c & 0x80:
                c = mm[pos]; pos += 1
                delta_off = ((delta_off + 1) << 7) | (c & 0x7F)
            base_kind, base = self._at(off - delta_off, store)
            return base_kind, _apply_delta(base, _inflate(mm, pos))

        if kind == OBJ_REF_DELTA:
            base_raw = mm[pos:pos + 20]
            pos += 20
            found = store.raw(binascii.hexlify(base_raw).decode())
            if found is None:
                raise ValueError("base ref-delta introuvable")
            base_kind, base = found
            return base_kind, _apply_delta(base, _inflate(mm, pos))

        return kind, _inflate(mm, pos)

class _Store:
    """Objets d'un dépôt : d'abord les objets libres, puis les packfiles."""

    def __init__(self, gitdir):
        self.gitdir = gitdir
        self._packs = None
        self._cache = {}

    @property
    def packs(self):
        if self._packs is None:
            pack_dir = self.gitdir / "objects" / "pack"
            try:
                self._packs = [_Pack(p) for p in sorted(pack_dir.glob("*.idx"))]
            except OSError:
                self._packs = []
        return self._packs

    def close(self):
        for p in self._packs or []:
            try:
                p.close()
            except Exception:
                pass
        self._packs = None
        self._cache.clear()

    def raw(self, sha):
        """(type, contenu) ou None. Les objets déjà lus restent en mémoire : le
        parcours ahead/behind repasse sur les mêmes commits d'une branche à l'autre."""
        hit = self._cache.get(sha)
        if hit is not None:
            return hit
        loose = self.gitdir / "objects" / sha[:2] / sha[2:]
        try:
            data = zlib.decompress(loose.read_bytes())
            head, _, body = data.partition(b"\0")
            kind = {b"commit": OBJ_COMMIT, b"tree": OBJ_TREE,
                    b"blob": OBJ_BLOB, b"tag": OBJ_TAG}.get(head.split(b" ")[0])
            found = (kind, body) if kind else None
        except (OSError, zlib.error):
            found = None
        if found is None:
            try:
                key = binascii.unhexlify(sha)
            except (binascii.Error, ValueError):
                return None
            for pack in self.packs:
                try:
                    found = pack.get(key, self)
                except Exception:
                    found = None
                if found is not None:
                    break
        if found is not None:
            self._cache[sha] = found
        return found

# ── Petits formats texte ──────────────────────────────────────────────────────
def _person(line):
    """`Nom <mail> 1712345678 +0200` → (nom, horodatage)."""
    try:
        head, _, rest = line.rpartition(">")
        name = head.rpartition("<")[0].strip() or head.strip()
        ts   = int(rest.split()[0])
    except (ValueError, IndexError):
        return line.strip(), 0
    return name, ts

def _parse_config(text):
    """Le format .git/config : sections `[a "b"]`, clés `k = v`, commentaires #/;."""
    out, section = {}, ""
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line[0] in "#;":
            continue
        if line.startswith("["):
            body = line[1:line.index("]")] if "]" in line else line[1:]
            if '"' in body:
                head, _, name = body.partition('"')
                section = f'{head.strip()}.{name.rstrip(chr(34))}'
            else:
                section = body.strip()
            continue
        key, _, value = line.partition("=")
        if not _:
            continue
        out[f"{section}.{key.strip()}"] = value.strip().strip('"')
    return out

# ── Dépôt ─────────────────────────────────────────────────────────────────────
class Repo:
    def __init__(self, worktree):
        self.worktree = Path(worktree)
        dot = self.worktree / ".git"
        if dot.is_file():                       # worktree lié ou sous-module
            text = dot.read_text(errors="replace").strip()
            target = text.partition("gitdir:")[2].strip() or text
            self.gitdir = (self.worktree / target).resolve()
        else:
            self.gitdir = dot
        self._store   = _Store(self.gitdir)
        self._refs    = None
        self._config  = None
        self._commits = {}

    def close(self):
        self._store.close()

    # -- fichiers -------------------------------------------------------------
    def _bytes(self, rel):
        try:
            with open(self.gitdir / rel, "rb") as f:
                return f.read()
        except OSError:
            return None

    def _text(self, rel):
        data = self._bytes(rel)
        return None if data is None else data.decode("utf-8", "replace")

    def mtime(self, rel):
        try:
            return (self.gitdir / rel).stat().st_mtime
        except OSError:
            return None

    # -- refs -----------------------------------------------------------------
    @property
    def config(self):
        if self._config is None:
            self._config = _parse_config(self._text("config") or "")
        return self._config

    @property
    def refs(self):
        """{ref complète: sha}. Les refs libres priment sur `packed-refs`."""
        if self._refs is not None:
            return self._refs
        refs = {}
        for line in (self._text("packed-refs") or "").splitlines():
            if not line or line[0] in "#^":
                continue
            sha, _, name = line.partition(" ")
            if len(sha) == 40 and name:
                refs[name.strip()] = sha
        root = self.gitdir / "refs"
        for base, dirs, files in os.walk(root):
            dirs.sort()
            for name in files:
                path = Path(base) / name
                try:
                    value = path.read_text(errors="replace").strip()
                except OSError:
                    continue
                key = "refs/" + str(path.relative_to(root)).replace(os.sep, "/")
                if value.startswith("ref:"):
                    continue                    # symref (refs/remotes/*/HEAD)
                if len(value) == 40:
                    refs[key] = value
        self._refs = refs
        return refs

    def symref(self, rel):
        """Cible d'un symref (`HEAD`, `refs/remotes/origin/HEAD`), ou None."""
        text = (self._text(rel) or "").strip()
        return text[4:].strip() if text.startswith("ref:") else None

    def head(self):
        """(nom de branche ou None si détachée, sha ou None si dépôt vide)."""
        target = self.symref("HEAD")
        if target:
            name = target[len("refs/heads/"):] if target.startswith("refs/heads/") else target
            return name, self.refs.get(target)
        text = (self._text("HEAD") or "").strip()
        return None, (text if len(text) == 40 else None)

    def default_branch(self):
        """Branche par défaut du distant : `origin/HEAD`, sinon master/main."""
        target = self.symref("refs/remotes/origin/HEAD")
        if target and target.startswith("refs/remotes/origin/"):
            return target[len("refs/remotes/origin/"):]
        for guess in ("master", "main"):
            if f"refs/remotes/origin/{guess}" in self.refs:
                return guess
        return None

    def remote_url(self, remote="origin"):
        return self.config.get(f'remote.{remote}.url')

    def upstream_of(self, branch):
        """`branch.<x>.remote` + `.merge` → « origin/x », ou None si non suivie."""
        remote = self.config.get(f"branch.{branch}.remote")
        merge  = self.config.get(f"branch.{branch}.merge")
        if not remote or not merge:
            return None
        short = merge[len("refs/heads/"):] if merge.startswith("refs/heads/") else merge
        return short if remote == "." else f"{remote}/{short}"

    # -- commits --------------------------------------------------------------
    def commit(self, sha):
        """{parents, author, time, subject} — l'en-tête seulement, jamais l'arbre."""
        if sha in self._commits:
            return self._commits[sha]
        found = self._store.raw(sha)
        info = None
        if found and found[0] == OBJ_COMMIT:
            head, _, body = found[1].partition(b"\n\n")
            parents, author, when = [], "", 0
            for line in head.decode("utf-8", "replace").splitlines():
                key, _, value = line.partition(" ")
                if key == "parent":
                    parents.append(value.strip())
                elif key == "author":
                    author, _ = _person(value)
                elif key == "committer":
                    _, when = _person(value)
            info = {
                "parents": parents, "author": author, "time": when,
                "subject": body.decode("utf-8", "replace").strip().splitlines()[0][:120]
                           if body.strip() else "",
            }
        self._commits[sha] = info
        return info

    def ahead_behind(self, a, b, limit=4000):
        """Commits propres à `a` puis à `b`. `capped` : parcours arrêté au plafond.

        Algorithme de git : on peint les deux histoires en descendant par date et
        on s'arrête quand tout le front est commun aux deux côtés — inutile de
        remonter jusqu'au commit initial pour savoir qu'une branche est mergée.
        """
        if not a or not b:
            return None, None, False
        if a == b:
            return 0, 0, False
        A, B, BOTH = 1, 2, 3
        flags, heap = {}, []

        def push(sha, flag):
            old = flags.get(sha, 0)
            if old | flag == old:
                return
            flags[sha] = old | flag
            info = self.commit(sha)
            if info is not None:
                heapq.heappush(heap, (-info["time"], sha))

        push(a, A)
        push(b, B)
        seen, capped = 0, False
        while heap:
            if all(flags.get(s) == BOTH for _, s in heap):
                break                    # sous la base de fusion : plus rien à compter
            if seen >= limit:
                capped = True
                break
            _, sha = heapq.heappop(heap)
            seen += 1
            info = self.commit(sha)
            if info is None:
                continue                 # objet absent (clone superficiel)
            flag = flags[sha]
            for parent in info["parents"]:
                push(parent, flag)
        ahead  = sum(1 for f in flags.values() if f == A)
        behind = sum(1 for f in flags.values() if f == B)
        return ahead, behind, capped

    # -- état du répertoire de travail ---------------------------------------
    def stash_count(self):
        log = self._text("logs/refs/stash")
        return len([l for l in log.splitlines() if l.strip()]) if log else 0

    def fetched_at(self):
        """Dernier contact avec le distant : mtime de FETCH_HEAD, sinon du dossier
        des refs distantes (un `git fetch` sans changement touche quand même l'un
        des deux)."""
        return self.mtime("FETCH_HEAD") or self.mtime("refs/remotes/origin")

    def modified(self, limit_hash=400, max_bytes=8 << 20):
        """Nombre de fichiers *suivis* modifiés (index vs disque).

        Les non-suivis sont hors périmètre : les compter exigerait d'implémenter
        toute la sémantique des .gitignore pour un signal qu'on ne saurait pas
        rendre fiable. `known=False` dit « je ne sais pas » plutôt que « propre ».
        """
        data = self._bytes("index")
        if not data or data[:4] != b"DIRC":
            return {"known": False, "count": 0, "capped": False}
        version, count = struct.unpack_from(">II", data, 4)
        if version not in (2, 3):
            # v4 comprime les chemins par préfixe : rare, et pas la peine ici
            return {"known": False, "count": 0, "capped": False}

        pos, changed, hashed, capped = 12, 0, 0, False
        root = str(self.worktree)
        for _ in range(count):
            start = pos
            ctime_s, _ctime_n, mtime_s, mtime_n = struct.unpack_from(">IIII", data, pos)
            mode, _uid, _gid, size = struct.unpack_from(">IIII", data, pos + 24)
            sha   = binascii.hexlify(data[pos + 40:pos + 60]).decode()
            flags = struct.unpack_from(">H", data, pos + 60)[0]
            pos  += 62
            if flags & 0x4000:                       # entrée étendue (v3)
                pos += 2
            end = data.index(b"\0", pos)
            name = data[pos:end].decode("utf-8", "replace")
            pos = end + 1
            pos += (8 - (pos - start) % 8) % 8       # bourrage sur 8 octets

            if flags & 0x3000:                       # conflit de fusion (stage > 0)
                changed += 1
                continue
            if flags & 0x8000:                       # assume-valid : git n'y regarde
                continue                             # pas non plus, on s'aligne
            if mode == 0o160000:                     # sous-module : pas notre affaire
                continue
            symlink = (mode & 0o170000) == 0o120000
            path = os.path.join(root, name)
            try:
                st = os.lstat(path)
            except OSError:
                changed += 1                         # suivi mais absent = supprimé
                continue
            if not symlink and st.st_size != size:
                changed += 1
                continue
            if int(st.st_mtime) == mtime_s and st.st_mtime_ns % 1_000_000_000 == mtime_n:
                continue                             # inchangé depuis l'index
            # mtime différent : seul le hash tranche. Un `git checkout` récent
            # remet des mtimes neufs sur des contenus identiques.
            if hashed >= limit_hash or st.st_size > max_bytes:
                capped = True
                continue
            hashed += 1
            try:
                if symlink:
                    blob = os.readlink(path).encode()
                else:
                    with open(path, "rb") as f:
                        blob = f.read()
            except OSError:
                changed += 1
                continue
            digest = hashlib.sha1(b"blob %d\0" % len(blob) + blob).hexdigest()
            if digest != sha:
                changed += 1
        return {"known": True, "count": changed, "capped": capped}

# ── Empreinte : « quelque chose a-t-il bougé ? » sans rien lire ──────────────
# Sept `stat` par dépôt, 0,3 ms pour dix dépôts à travers le bind-mount. Assez
# bon marché pour être interrogé toutes les deux secondes, ce qui permet de
# réagir à un `git fetch` tapé dans un terminal au lieu d'attendre le cycle.
_WATCHED = ("FETCH_HEAD", "HEAD", "packed-refs", "index",
            "refs/heads", "refs/remotes/origin", "refs/tags")

# Ce que chaque fichier trahit, pour dire à l'utilisateur ce qui l'a réveillé.
CAUSE = {
    "FETCH_HEAD":         "git fetch",
    "refs/remotes/origin": "refs distantes modifiées",
    "packed-refs":        "refs réempaquetées",
    "refs/heads":         "branche créée ou supprimée",
    "HEAD":               "changement de branche",
    "index":              "index modifié",
    "refs/tags":          "tags modifiés",
}

def signature(worktree):
    """{fichier: (mtime_ns, taille)} — comparable d'un appel à l'autre.

    Rien n'est ouvert : `git fetch` réécrit FETCH_HEAD même quand il ne ramène
    rien, donc son mtime suffit à savoir que la commande a été lancée.
    """
    gitdir = Path(worktree) / ".git"
    if gitdir.is_file():
        try:
            text = gitdir.read_text(errors="replace").strip()
            gitdir = (Path(worktree) / (text.partition("gitdir:")[2].strip() or text)).resolve()
        except OSError:
            return {}
    out = {}
    for rel in _WATCHED:
        try:
            st = os.stat(gitdir / rel)
            out[rel] = (st.st_mtime_ns, st.st_size)
        except OSError:
            out[rel] = None
    return out

def what_changed(before, after):
    """Libellé de la première différence, dans l'ordre de `_WATCHED`."""
    for rel in _WATCHED:
        if before.get(rel) != after.get(rel):
            return CAUSE.get(rel, rel)
    return None

# ── Découverte ────────────────────────────────────────────────────────────────
def discover(root, ignore, max_depth):
    """Tous les dépôts sous `root`. On continue de descendre *dans* un dépôt :
    un monorepo peut contenir des dépôts imbriqués (sous-modules, vendors)."""
    found = []

    def walk(path, depth):
        try:
            entries = sorted(os.scandir(path), key=lambda e: e.name)
        except OSError:
            return
        subdirs = []
        for entry in entries:
            if entry.name == ".git":          # dossier, ou fichier pour un worktree lié
                found.append(path)
                continue
            if entry.name in ignore or entry.name.startswith("."):
                continue
            if entry.is_dir(follow_symlinks=False):
                subdirs.append(entry.path)
        if depth >= max_depth:
            return
        for sub in subdirs:
            walk(Path(sub), depth + 1)

    walk(Path(root), 0)
    return found
