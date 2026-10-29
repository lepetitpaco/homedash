/**
 * Lecture d'un dépôt git : sans binaire git, sans la moindre écriture.
 *
 * Aucune commande git n'est en lecture seule (`git status` rafraîchit l'index,
 * une commande interrompue laisse un `.lock`). Ici tout passe par des lectures
 * (`openSync(…, 'r')`, `readSync`, `lstat`) : la garantie « zéro modif » est
 * une propriété du code, pas une promesse.
 *
 * Implémenté : refs (libres et empaquetées), objets (libres et dans les packs,
 * deltas `ofs` et `ref`), en-têtes de commit, ahead/behind, et l'index pour
 * repérer les fichiers suivis modifiés.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

export const OBJ_COMMIT = 1
export const OBJ_TREE = 2
export const OBJ_BLOB = 3
export const OBJ_TAG = 4
const OBJ_OFS_DELTA = 6
const OBJ_REF_DELTA = 7

type Obj = [number, Buffer]

/** Décompresse le flux zlib qui commence à `pos` ; `hint` = taille décompressée annoncée. */
function inflateAt(fd: number, pos: number, hint: number, fileSize: number): Buffer {
  let want = Math.max(4096, Math.ceil(hint * 1.02) + 1024)
  for (;;) {
    const len = Math.min(want, fileSize - pos)
    const buf = Buffer.alloc(Math.max(0, len))
    fs.readSync(fd, buf, 0, buf.length, pos)
    try {
      return zlib.inflateSync(buf)
    } catch (e) {
      if (len >= fileSize - pos) throw e
      want *= 4 // flux plus long que prévu : on relit plus large
    }
  }
}

function varint(buf: Buffer, pos: number): [number, number] {
  let shift = 0
  let value = 0
  let c = 0x80
  while (c & 0x80) {
    c = buf[pos]
    pos += 1
    value += (c & 0x7f) * 2 ** shift
    shift += 7
  }
  return [value, pos]
}

/** Format delta de git : tailles en varint, puis copies et insertions. */
export function applyDelta(base: Buffer, delta: Buffer): Buffer {
  let p = varint(delta, 0)[1] // taille de la base, redondante
  let size: number
  ;[size, p] = varint(delta, p)
  const out: Buffer[] = []
  const n = delta.length
  while (p < n) {
    const cmd = delta[p]
    p += 1
    if (cmd & 0x80) {
      let off = 0
      let length = 0
      for (const [i, bit] of [0x01, 0x02, 0x04, 0x08].entries()) {
        if (cmd & bit) {
          off += delta[p] * 2 ** (i * 8)
          p += 1
        }
      }
      for (const [i, bit] of [0x10, 0x20, 0x40].entries()) {
        if (cmd & bit) {
          length += delta[p] * 2 ** (i * 8)
          p += 1
        }
      }
      length = length || 0x10000
      out.push(base.subarray(off, off + length))
    } else if (cmd) {
      out.push(delta.subarray(p, p + cmd))
      p += cmd
    } else {
      throw new Error('instruction delta 0 réservée')
    }
  }
  const data = Buffer.concat(out)
  if (data.length !== size) throw new Error('taille delta incohérente')
  return data
}

/** Un couple .idx / .pack, ouvert en lecture seule. */
class Pack {
  idxPath: string
  packPath: string
  idx: Buffer | null = null
  fd: number | null = null
  size = 0
  count = 0
  sha0 = 0
  ofs0 = 0
  big0 = 0

  constructor(idxPath: string) {
    this.idxPath = idxPath
    this.packPath = idxPath.slice(0, -4) + '.pack'
  }

  open(): void {
    if (this.idx) return
    const idx = fs.readFileSync(this.idxPath)
    if (idx.readUInt32BE(0) !== 0xff744f63 || idx.readUInt32BE(4) !== 2) throw new Error(`${path.basename(this.idxPath)} : index pack v2 attendu`)
    this.fd = fs.openSync(this.packPath, 'r')
    this.size = fs.fstatSync(this.fd).size
    this.idx = idx
    this.count = idx.readUInt32BE(8 + 255 * 4)
    this.sha0 = 8 + 256 * 4
    const crc0 = this.sha0 + this.count * 20
    this.ofs0 = crc0 + this.count * 4
    this.big0 = this.ofs0 + this.count * 4
  }

  close(): void {
    if (this.fd !== null) fs.closeSync(this.fd)
    this.fd = null
    this.idx = null
  }

  /** Recherche dichotomique dans la table de sha triée (fanout en amorce). */
  find(raw: Buffer): number | null {
    this.open()
    const idx = this.idx as Buffer
    const first = raw[0]
    let lo = first ? idx.readUInt32BE(8 + (first - 1) * 4) : 0
    let hi = idx.readUInt32BE(8 + first * 4)
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      const at = this.sha0 + mid * 20
      const cmp = idx.compare(raw, 0, 20, at, at + 20)
      if (cmp > 0) hi = mid
      else if (cmp < 0) lo = mid + 1
      else {
        let off = idx.readUInt32BE(this.ofs0 + mid * 4)
        if (off & 0x80000000) off = Number(idx.readBigUInt64BE(this.big0 + (off & 0x7fffffff) * 8))
        return off
      }
    }
    return null
  }

  get(raw: Buffer, store: Store): Obj | null {
    const off = this.find(raw)
    return off === null ? null : this.at(off, store)
  }

  private byte(pos: number): number {
    const b = Buffer.alloc(1)
    fs.readSync(this.fd as number, b, 0, 1, pos)
    return b[0]
  }

  at(off: number, store: Store): Obj {
    // en-tête : type sur 3 bits, taille en varint (sert à dimensionner la lecture)
    const head = Buffer.alloc(32)
    fs.readSync(this.fd as number, head, 0, 32, off)
    let c = head[0]
    let p = 1
    const kind = (c >> 4) & 7
    let size = c & 0x0f
    let shift = 4
    while (c & 0x80) {
      c = head[p]
      p += 1
      size += (c & 0x7f) * 2 ** shift
      shift += 7
    }
    let pos = off + p
    if (kind === OBJ_OFS_DELTA) {
      c = this.byte(pos)
      pos += 1
      let deltaOff = c & 0x7f
      while (c & 0x80) {
        c = this.byte(pos)
        pos += 1
        deltaOff = (deltaOff + 1) * 128 + (c & 0x7f)
      }
      const [baseKind, base] = this.at(off - deltaOff, store)
      return [baseKind, applyDelta(base, inflateAt(this.fd as number, pos, size, this.size))]
    }
    if (kind === OBJ_REF_DELTA) {
      const baseRaw = Buffer.alloc(20)
      fs.readSync(this.fd as number, baseRaw, 0, 20, pos)
      pos += 20
      const found = store.raw(baseRaw.toString('hex'))
      if (!found) throw new Error('base ref-delta introuvable')
      return [found[0], applyDelta(found[1], inflateAt(this.fd as number, pos, size, this.size))]
    }
    return [kind, inflateAt(this.fd as number, pos, size, this.size)]
  }
}

const KINDS: Record<string, number> = { commit: OBJ_COMMIT, tree: OBJ_TREE, blob: OBJ_BLOB, tag: OBJ_TAG }

/** Objets d'un dépôt : d'abord les objets libres, puis les packs. */
class Store {
  gitdir: string
  private _packs: Pack[] | null = null
  private cache = new Map<string, Obj>()

  constructor(gitdir: string) {
    this.gitdir = gitdir
  }

  get packs(): Pack[] {
    if (this._packs === null) {
      const dir = path.join(this.gitdir, 'objects', 'pack')
      try {
        this._packs = fs
          .readdirSync(dir)
          .filter((n) => n.endsWith('.idx'))
          .sort()
          .map((n) => new Pack(path.join(dir, n)))
      } catch {
        this._packs = []
      }
    }
    return this._packs
  }

  close(): void {
    for (const p of this._packs || []) {
      try {
        p.close()
      } catch {
        /* rien */
      }
    }
    this._packs = null
    this.cache.clear()
  }

  /** (type, contenu) ou null ; les objets lus restent en mémoire (ahead/behind repasse dessus). */
  raw(sha: string): Obj | null {
    const hit = this.cache.get(sha)
    if (hit) return hit
    let found: Obj | null = null
    try {
      const data = zlib.inflateSync(fs.readFileSync(path.join(this.gitdir, 'objects', sha.slice(0, 2), sha.slice(2))))
      const nul = data.indexOf(0)
      const kind = KINDS[data.subarray(0, nul).toString('latin1').split(' ')[0]]
      found = kind ? [kind, data.subarray(nul + 1)] : null
    } catch {
      found = null
    }
    if (!found) {
      if (!/^[0-9a-f]{40}$/.test(sha)) return null
      const key = Buffer.from(sha, 'hex')
      for (const pack of this.packs) {
        try {
          found = pack.get(key, this)
        } catch {
          found = null
        }
        if (found) break
      }
    }
    if (found) this.cache.set(sha, found)
    return found
  }
}

// ── Petits formats texte ────────────────────────────────────────────────────────
/** `Nom <mail> 1712345678 +0200` → (nom, horodatage). */
function person(line: string): [string, number] {
  const i = line.lastIndexOf('>')
  if (i < 0) return [line.trim(), 0]
  const head = line.slice(0, i)
  const rest = line.slice(i + 1)
  const lt = head.lastIndexOf('<')
  const name = (lt >= 0 ? head.slice(0, lt).trim() : '') || head.trim()
  const ts = parseInt(rest.trim().split(/\s+/)[0], 10)
  if (Number.isNaN(ts)) return [line.trim(), 0]
  return [name, ts]
}

/** Le format .git/config : sections `[a "b"]`, clés `k = v`, commentaires #/;. */
export function parseConfig(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  let section = ''
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || '#;'.includes(line[0])) continue
    if (line.startsWith('[')) {
      const body = line.includes(']') ? line.slice(1, line.indexOf(']')) : line.slice(1)
      if (body.includes('"')) {
        const q = body.indexOf('"')
        section = `${body.slice(0, q).trim()}.${body.slice(q + 1).replace(/"+$/, '')}`
      } else {
        section = body.trim()
      }
      continue
    }
    const eq = line.indexOf('=')
    if (eq < 0) continue
    out[`${section}.${line.slice(0, eq).trim()}`] = line
      .slice(eq + 1)
      .trim()
      .replace(/^"+|"+$/g, '')
  }
  return out
}

export type Commit = { parents: string[]; author: string; time: number; subject: string }

function readText(p: string): string | null {
  try {
    return fs.readFileSync(p, 'utf-8')
  } catch {
    return null
  }
}

/** Le dossier .git réel d'un worktree (worktree lié ou sous-module : `.git` est un fichier). */
function gitdirOf(worktree: string): string | null {
  const dot = path.join(worktree, '.git')
  let st: fs.Stats
  try {
    st = fs.statSync(dot)
  } catch {
    return dot
  }
  if (!st.isFile()) return dot
  const text = (readText(dot) || '').trim()
  const target = text.split('gitdir:')[1]?.trim() || text
  return path.resolve(worktree, target)
}

// ── Dépôt ───────────────────────────────────────────────────────────────────────
export class Repo {
  worktree: string
  gitdir: string
  private store: Store
  private _refs: Record<string, string> | null = null
  private _config: Record<string, string> | null = null
  private commits = new Map<string, Commit | null>()

  constructor(worktree: string) {
    this.worktree = worktree
    this.gitdir = gitdirOf(worktree) as string
    this.store = new Store(this.gitdir)
  }

  close(): void {
    this.store.close()
  }

  /** (type, contenu) d'un objet, ou null : pour les tests, comparé à `git cat-file`. */
  rawObject(sha: string): [number, Buffer] | null {
    return this.store.raw(sha)
  }

  private bytes(rel: string): Buffer | null {
    try {
      return fs.readFileSync(path.join(this.gitdir, rel))
    } catch {
      return null
    }
  }

  private text(rel: string): string | null {
    const b = this.bytes(rel)
    return b === null ? null : b.toString('utf-8')
  }

  mtime(rel: string): number | null {
    try {
      return fs.statSync(path.join(this.gitdir, rel)).mtimeMs / 1000
    } catch {
      return null
    }
  }

  get config(): Record<string, string> {
    if (this._config === null) this._config = parseConfig(this.text('config') || '')
    return this._config
  }

  /** {ref complète: sha}. Les refs libres priment sur `packed-refs`. */
  get refs(): Record<string, string> {
    if (this._refs !== null) return this._refs
    const refs: Record<string, string> = {}
    for (const line of (this.text('packed-refs') || '').split(/\r?\n/)) {
      if (!line || '#^'.includes(line[0])) continue
      const sp = line.indexOf(' ')
      const sha = sp < 0 ? line : line.slice(0, sp)
      const name = sp < 0 ? '' : line.slice(sp + 1).trim()
      if (sha.length === 40 && name) refs[name] = sha
    }
    const root = path.join(this.gitdir, 'refs')
    const walk = (dir: string, rel: string) => {
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      for (const e of entries.filter((x) => !x.isDirectory())) {
        const value = (readText(path.join(dir, e.name)) || '').trim()
        if (!value || value.startsWith('ref:')) continue // symref (refs/remotes/*/HEAD)
        if (value.length === 40) refs[`refs/${rel}${e.name}`] = value
      }
      for (const e of entries.filter((x) => x.isDirectory())) walk(path.join(dir, e.name), `${rel}${e.name}/`)
    }
    walk(root, '')
    this._refs = refs
    return refs
  }

  /** Cible d'un symref (`HEAD`, `refs/remotes/origin/HEAD`), ou null. */
  symref(rel: string): string | null {
    const t = (this.text(rel) || '').trim()
    return t.startsWith('ref:') ? t.slice(4).trim() : null
  }

  /** [nom de branche ou null si détachée, sha ou null si dépôt vide]. */
  head(): [string | null, string | null] {
    const target = this.symref('HEAD')
    if (target) {
      const name = target.startsWith('refs/heads/') ? target.slice('refs/heads/'.length) : target
      return [name, this.refs[target] ?? null]
    }
    const t = (this.text('HEAD') || '').trim()
    return [null, t.length === 40 ? t : null]
  }

  /** Branche par défaut du distant : `origin/HEAD`, sinon master/main. */
  defaultBranch(): string | null {
    const target = this.symref('refs/remotes/origin/HEAD')
    if (target && target.startsWith('refs/remotes/origin/')) return target.slice('refs/remotes/origin/'.length)
    for (const guess of ['master', 'main']) if (`refs/remotes/origin/${guess}` in this.refs) return guess
    return null
  }

  remoteUrl(remote = 'origin'): string | undefined {
    return this.config[`remote.${remote}.url`]
  }

  /** `branch.<x>.remote` + `.merge` → « origin/x », ou null si non suivie. */
  upstreamOf(branch: string): string | null {
    const remote = this.config[`branch.${branch}.remote`]
    const merge = this.config[`branch.${branch}.merge`]
    if (!remote || !merge) return null
    const short = merge.startsWith('refs/heads/') ? merge.slice('refs/heads/'.length) : merge
    return remote === '.' ? short : `${remote}/${short}`
  }

  /** {parents, author, time, subject} : l'en-tête seulement, jamais l'arbre. */
  commit(sha: string): Commit | null {
    if (this.commits.has(sha)) return this.commits.get(sha) as Commit | null
    const found = this.store.raw(sha)
    let info: Commit | null = null
    if (found && found[0] === OBJ_COMMIT) {
      const data = found[1]
      const sep = data.indexOf('\n\n')
      const head = (sep < 0 ? data : data.subarray(0, sep)).toString('utf-8')
      const body = sep < 0 ? '' : data.subarray(sep + 2).toString('utf-8')
      const parents: string[] = []
      let author = ''
      let when = 0
      for (const line of head.split('\n')) {
        const sp = line.indexOf(' ')
        const key = sp < 0 ? line : line.slice(0, sp)
        const value = sp < 0 ? '' : line.slice(sp + 1)
        if (key === 'parent') parents.push(value.trim())
        else if (key === 'author') author = person(value)[0]
        else if (key === 'committer') when = person(value)[1]
      }
      const trimmed = body.trim()
      info = { parents, author, time: when, subject: trimmed ? trimmed.split(/\r?\n/)[0].slice(0, 120) : '' }
    }
    this.commits.set(sha, info)
    return info
  }

  /**
   * Commits propres à `a` puis à `b` ; `capped` : parcours arrêté au plafond.
   * Algorithme de git : on peint les deux histoires en descendant par date et
   * on s'arrête quand tout le front est commun aux deux côtés.
   */
  aheadBehind(a: string | null | undefined, b: string | null | undefined, limit = 4000): [number | null, number | null, boolean] {
    if (!a || !b) return [null, null, false]
    if (a === b) return [0, 0, false]
    const A = 1
    const B = 2
    const BOTH = 3
    const flags = new Map<string, number>()
    const heap = new Heap()
    const push = (sha: string, flag: number) => {
      const old = flags.get(sha) || 0
      if ((old | flag) === old) return
      flags.set(sha, old | flag)
      const info = this.commit(sha)
      if (info) heap.push(-info.time, sha)
    }
    push(a, A)
    push(b, B)
    let seen = 0
    let capped = false
    while (heap.size) {
      if (heap.items().every(([, s]) => flags.get(s) === BOTH)) break // sous la base de fusion
      if (seen >= limit) {
        capped = true
        break
      }
      const [, sha] = heap.pop()
      seen += 1
      const info = this.commit(sha)
      if (!info) continue // objet absent (clone superficiel)
      const flag = flags.get(sha) as number
      for (const parent of info.parents) push(parent, flag)
    }
    let ahead = 0
    let behind = 0
    for (const f of flags.values()) {
      if (f === A) ahead += 1
      else if (f === B) behind += 1
    }
    return [ahead, behind, capped]
  }

  stashCount(): number {
    const log = this.text('logs/refs/stash')
    return log ? log.split('\n').filter((l) => l.trim()).length : 0
  }

  /** Dernier contact avec le distant : mtime de FETCH_HEAD, sinon des refs distantes. */
  fetchedAt(): number | null {
    return this.mtime('FETCH_HEAD') || this.mtime('refs/remotes/origin')
  }

  /**
   * Nombre de fichiers *suivis* modifiés (index vs disque). `known=false` dit
   * « je ne sais pas » plutôt que « propre ».
   */
  modified(limitHash = 400, maxBytes = 8 << 20): { known: boolean; count: number; capped: boolean } {
    const data = this.bytes('index')
    if (!data || data.subarray(0, 4).toString('latin1') !== 'DIRC') return { known: false, count: 0, capped: false }
    const version = data.readUInt32BE(4)
    const count = data.readUInt32BE(8)
    if (version !== 2 && version !== 3) return { known: false, count: 0, capped: false }
    let pos = 12
    let changed = 0
    let hashed = 0
    let capped = false
    for (let k = 0; k < count; k++) {
      const start = pos
      const mtimeS = data.readUInt32BE(pos + 8)
      const mtimeN = data.readUInt32BE(pos + 12)
      const mode = data.readUInt32BE(pos + 24)
      const size = data.readUInt32BE(pos + 36)
      const sha = data.subarray(pos + 40, pos + 60).toString('hex')
      const flags = data.readUInt16BE(pos + 60)
      pos += 62
      if (flags & 0x4000) pos += 2 // entrée étendue (v3)
      const end = data.indexOf(0, pos)
      const name = data.subarray(pos, end).toString('utf-8')
      pos = end + 1
      pos += (8 - ((pos - start) % 8)) % 8 // bourrage sur 8 octets
      if (flags & 0x3000) {
        changed += 1 // conflit de fusion (stage > 0)
        continue
      }
      if (flags & 0x8000) continue // assume-valid : git n'y regarde pas non plus
      if (mode === 0o160000) continue // sous-module
      const symlink = (mode & 0o170000) === 0o120000
      const file = path.join(this.worktree, name)
      let st: fs.BigIntStats
      try {
        st = fs.lstatSync(file, { bigint: true })
      } catch {
        changed += 1 // suivi mais absent = supprimé
        continue
      }
      if (!symlink && Number(st.size) !== size) {
        changed += 1
        continue
      }
      if (st.mtimeNs / 1_000_000_000n === BigInt(mtimeS) && st.mtimeNs % 1_000_000_000n === BigInt(mtimeN)) continue
      // mtime différent : seul le hash tranche (un checkout récent remet des mtimes neufs)
      if (hashed >= limitHash || Number(st.size) > maxBytes) {
        capped = true
        continue
      }
      hashed += 1
      let blob: Buffer
      try {
        blob = symlink ? Buffer.from(fs.readlinkSync(file)) : fs.readFileSync(file)
      } catch {
        changed += 1
        continue
      }
      const digest = crypto.createHash('sha1').update(`blob ${blob.length}\0`).update(blob).digest('hex')
      if (digest !== sha) changed += 1
    }
    return { known: true, count: changed, capped }
  }
}

/** Tas min sur la clé (le plus grand temps sort en premier : clé = -temps). */
class Heap {
  private a: [number, string][] = []
  get size(): number {
    return this.a.length
  }
  items(): [number, string][] {
    return this.a
  }
  private less(i: number, j: number): boolean {
    const x = this.a[i]
    const y = this.a[j]
    return x[0] < y[0] || (x[0] === y[0] && x[1] < y[1])
  }
  push(k: number, v: string): void {
    this.a.push([k, v])
    let i = this.a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (!this.less(i, p)) break
      ;[this.a[i], this.a[p]] = [this.a[p], this.a[i]]
      i = p
    }
  }
  pop(): [number, string] {
    const top = this.a[0]
    const last = this.a.pop() as [number, string]
    if (this.a.length) {
      this.a[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < this.a.length && this.less(l, m)) m = l
        if (r < this.a.length && this.less(r, m)) m = r
        if (m === i) break
        ;[this.a[i], this.a[m]] = [this.a[m], this.a[i]]
        i = m
      }
    }
    return top
  }
}

// ── Empreinte : « quelque chose a-t-il bougé ? » sans rien lire ────────────────
const WATCHED = ['FETCH_HEAD', 'HEAD', 'packed-refs', 'index', 'refs/heads', 'refs/remotes/origin', 'refs/tags']

/** Ce que chaque fichier trahit, pour dire ce qui a réveillé la surveillance. */
export const CAUSE: Record<string, string> = {
  FETCH_HEAD: 'git fetch',
  'refs/remotes/origin': 'refs distantes modifiées',
  'packed-refs': 'refs réempaquetées',
  'refs/heads': 'branche créée ou supprimée',
  HEAD: 'changement de branche',
  index: 'index modifié',
  'refs/tags': 'tags modifiés',
}

export type Signature = Record<string, string | null>

/** {fichier: "mtime_ns:taille"} : comparable d'un appel à l'autre, rien n'est ouvert. */
export function signature(worktree: string): Signature {
  let gitdir: string | null
  try {
    gitdir = gitdirOf(worktree)
  } catch {
    return {}
  }
  const out: Signature = {}
  for (const rel of WATCHED) {
    try {
      const st = fs.statSync(path.join(gitdir as string, rel), { bigint: true })
      out[rel] = `${st.mtimeNs}:${st.size}`
    } catch {
      out[rel] = null
    }
  }
  return out
}

/** Libellé de la première différence, dans l'ordre de WATCHED. */
export function whatChanged(before: Signature, after: Signature): string | null {
  for (const rel of WATCHED) if ((before[rel] ?? null) !== (after[rel] ?? null)) return CAUSE[rel] || rel
  return null
}

/** Tous les dépôts sous `root` ; on descend aussi *dans* un dépôt (dépôts imbriqués). */
export function discover(root: string, ignore: Set<string>, maxDepth: number): string[] {
  const found: string[] = []
  const walk = (dir: string, depth: number) => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    const subdirs: string[] = []
    for (const e of entries) {
      if (e.name === '.git') {
        found.push(dir)
        continue
      }
      if (ignore.has(e.name) || e.name.startsWith('.')) continue
      if (e.isDirectory()) subdirs.push(path.join(dir, e.name).replace(/\\/g, '/'))
    }
    if (depth >= maxDepth) return
    for (const sub of subdirs) walk(sub, depth + 1)
  }
  walk(root, 0)
  return found
}
