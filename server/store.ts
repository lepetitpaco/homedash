/**
 * Stockage : des fichiers JSON dans data/, écrits de façon atomique.
 *
 * On écrit dans un temporaire du même dossier puis on renomme : jamais de
 * fichier tronqué si le process meurt en pleine écriture. Mêmes fichiers et
 * même format qu'en 1.x : un data/ d'avant se relit tel quel.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

let dataDir = path.resolve(process.env.DATA_DIR || 'data')

export function DATA_DIR(): string {
  return dataDir
}

/** Tests : un dossier temporaire, jamais le data/ réel. */
export function setDataDir(dir: string): void {
  dataDir = path.resolve(dir)
}

export const CONFIG = 'config.json'
export const CONFIG_PREV = 'config.prev.json'
export const NOTES = 'notes.json'
export const USAGE = 'usage.json'
export const EVENTS = 'events.json'
/** Rapports d'issues déjà publiés sur Basecamp (id du commentaire GitHub → lien). */
export const BC_POSTED = 'bc_posted.json'
/** Rapports d'issues déjà publiés sur Trello (id du commentaire GitHub → lien). */
export const TR_POSTED = 'tr_posted.json'
/**
 * Jetons saisis dans Réglages. Fichier à part, en 600, jamais servi au
 * navigateur ni inclus dans les sauvegardes simples : config.json, lui,
 * transite entier par GET /api/config.
 */
export const SECRETS = 'secrets.json'

export function pathOf(name: string): string {
  return path.join(dataDir, name)
}

/** Fichier présent mais pas du JSON valide (édité à la main) : `line` et `column` disent où. */
export class Broken extends Error {
  name: string
  file: string
  line: number | null
  column: number | null
  constructor(file: string, err: unknown, text: string) {
    super(`${file} illisible : ${err instanceof Error ? err.message : String(err)}`)
    this.name = 'Broken'
    this.file = file
    const msg = err instanceof Error ? err.message : ''
    const lc = /line (\d+) column (\d+)/.exec(msg)
    const pos = /position (\d+)/.exec(msg)
    if (lc) {
      this.line = Number(lc[1])
      this.column = Number(lc[2])
    } else if (pos) {
      const before = text.slice(0, Number(pos[1]))
      this.line = before.split('\n').length
      this.column = before.length - before.lastIndexOf('\n')
    } else {
      this.line = null
      this.column = null
    }
  }
}

export function read<T>(name: string, fallback: T): T {
  const p = pathOf(name)
  let text: string
  try {
    text = fs.readFileSync(p, 'utf-8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return fallback
    throw new Broken(name, e, '')
  }
  try {
    return JSON.parse(text) as T
  } catch (e) {
    throw new Broken(name, e, text)
  }
}

/** Fichier cassé mis de côté (`config.broken-AAAAMMJJ-HHMMSS.json`) avant d'être remplacé. */
export function setAside(name: string): string | null {
  const src = pathOf(name)
  if (!fs.existsSync(src)) return null
  const ext = path.extname(src)
  const dest = path.join(path.dirname(src), `${path.basename(src, ext)}.broken-${stamp()}${ext}`)
  fs.copyFileSync(src, dest)
  return path.basename(dest)
}

/** `AAAAMMJJ-HHMMSS`, heure locale. */
export function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** `AAAA-MM-JJ`, heure locale. */
export function today(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Le même JSON que la 1.x (indentation 2, accents en clair, retour final). */
export function dumps(payload: unknown): string {
  return JSON.stringify(payload, null, 2) + '\n'
}

/**
 * Écriture atomique : temporaire dans le même dossier puis rename. `mode`
 * s'applique dès la création du temporaire : secrets.json ne doit jamais
 * exister, même un instant, lisible par d'autres.
 */
export function write(name: string, payload: unknown, mode = 0o644): void {
  fs.mkdirSync(dataDir, { recursive: true })
  const target = pathOf(name)
  const tmp = target + '.tmp'
  fs.rmSync(tmp, { force: true })
  const fd = fs.openSync(tmp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, mode)
  try {
    fs.writeSync(fd, dumps(payload))
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  fs.renameSync(tmp, target)
}

export function readSecret<T = unknown>(key: string): T | undefined {
  try {
    return (read<Record<string, unknown>>(SECRETS, {}) || {})[key] as T | undefined
  } catch {
    return undefined
  }
}

/** `value` à undefined/null retire la clé. Le fichier est créé en 600 avant d'y écrire. */
export function writeSecret(key: string, value: unknown): void {
  let data: Record<string, unknown>
  try {
    data = read<Record<string, unknown>>(SECRETS, {}) || {}
  } catch {
    data = {}
  }
  if (value === undefined || value === null) delete data[key]
  else data[key] = value
  write(SECRETS, data, 0o600)
}

/**
 * Empreinte du fichier sur le disque, ou "" s'il n'existe pas. Sert à refuser
 * une écriture faite sur une version périmée au lieu d'écraser l'autre.
 */
export function version(name: string): string {
  try {
    return crypto.createHash('sha1').update(fs.readFileSync(pathOf(name))).digest('hex').slice(0, 16)
  } catch {
    return ''
  }
}

export function backupConfig(): void {
  try {
    write(CONFIG_PREV, read(CONFIG, {}))
  } catch {
    /* premier démarrage, ou config déjà cassée : rien à sauver */
  }
}

// ── Validation de config.json ──────────────────────────────────────────────────
/** Fonctionnalités qu'on peut couper (Réglages → Fonctionnalités) : clé absente = active. */
export const FEATURES = ['github', 'basecamp', 'local', 'trello'] as const

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const filled = (v: unknown) => isStr(v) && v.trim() !== ''
const strList = (v: unknown) => Array.isArray(v) && v.every(isStr)
const isInt = (v: unknown) => typeof v === 'number' && Number.isInteger(v)

export function featureOn(cfg: unknown, name: string): boolean {
  const features = isObj(cfg) ? cfg.features : undefined
  return !(isObj(features) && features[name] === false)
}

/**
 * Garde-fou avant écriture : l'UI peut envoyer n'importe quoi, et ce fichier
 * est la seule source de vérité de la page. Retourne un message ou null.
 */
export function validateConfig(cfg: unknown): string | null {
  if (!isObj(cfg)) return 'la racine doit être un objet'
  if (!Array.isArray(cfg.groups)) return '"groups" doit être un tableau'
  for (const [i, group] of cfg.groups.entries()) {
    if (!isObj(group)) return `groups[${i}] doit être un objet`
    if (!filled(group.name)) return `groups[${i}].name manquant`
    if (!Array.isArray(group.links)) return `groups[${i}].links doit être un tableau`
    for (const [j, link] of group.links.entries()) {
      if (!isObj(link)) return `groups[${i}].links[${j}] doit être un objet`
      for (const field of ['name', 'url']) {
        if (!filled(link[field])) return `groups[${i}].links[${j}].${field} manquant`
      }
    }
  }
  if (cfg.github !== undefined && cfg.github !== null && !isObj(cfg.github)) return '"github" doit être un objet'
  const accs = cfg.github_accounts
  if (accs !== undefined && accs !== null) {
    if (!Array.isArray(accs)) return '"github_accounts" doit être un tableau'
    const seen = new Set<string>()
    for (const [i, acc] of accs.entries()) {
      if (!isObj(acc)) return `github_accounts[${i}] doit être un objet`
      if (!filled(acc.id)) return `github_accounts[${i}].id manquant`
      const id = acc.id as string
      if (seen.has(id)) return `github_accounts[${i}].id en double : ${id}`
      seen.add(id)
      for (const key of ['repos', 'branch_repos', 'base_site_repos', 'users']) {
        const v = acc[key]
        if (v !== undefined && v !== null && !strList(v)) return `github_accounts[${i}].${key} doit être une liste de textes`
      }
      for (const key of ['merged_count', 'cache_ttl', 'auto_refresh']) {
        const v = acc[key]
        if (v !== undefined && v !== null && (!isInt(v) || (v as number) < 0))
          return `github_accounts[${i}].${key} doit être un entier positif`
      }
    }
  }
  const dockerCfg = cfg.docker
  if (dockerCfg !== undefined && dockerCfg !== null) {
    if (!isObj(dockerCfg)) return '"docker" doit être un objet'
    if (dockerCfg.hidden !== undefined && !Array.isArray(dockerCfg.hidden)) return '"docker.hidden" doit être un tableau'
  }
  const repos = cfg.repos
  if (repos !== undefined && repos !== null) {
    if (!isObj(repos)) return '"repos" doit être un objet'
    const items = repos.items
    if (items !== undefined && items !== null) {
      if (!Array.isArray(items)) return '"repos.items" doit être un tableau'
      for (const [i, item] of items.entries()) {
        if (!isObj(item) || !filled(item.name)) return `repos.items[${i}].name manquant`
      }
    }
  }
  const features = cfg.features
  if (features !== undefined && features !== null) {
    if (!isObj(features)) return '"features" doit être un objet'
    for (const [name, on] of Object.entries(features)) {
      if (typeof on !== 'boolean') return `features.${name} doit être vrai ou faux`
    }
  }
  if (cfg.ui !== undefined && cfg.ui !== null && !isObj(cfg.ui)) return '"ui" doit être un objet'
  const tabs = cfg.tabs
  if (tabs !== undefined && tabs !== null) {
    if (!Array.isArray(tabs)) return '"tabs" doit être un tableau'
    const seen = new Set<string>()
    for (const [i, tab] of tabs.entries()) {
      if (!isObj(tab)) return `tabs[${i}] doit être un objet`
      for (const field of ['id', 'label', 'url']) {
        if (!filled(tab[field])) return `tabs[${i}].${field} manquant`
      }
      for (const field of ['session', 'parent']) {
        if (tab[field] !== undefined && tab[field] !== null && !isStr(tab[field])) return `tabs[${i}].${field} doit être un texte`
      }
      for (const flag of ['sleep', 'kept', 'embed', 'capture', 'preload', 'notify']) {
        if (tab[flag] !== undefined && tab[flag] !== null && typeof tab[flag] !== 'boolean')
          return `tabs[${i}].${flag} doit être vrai ou faux`
      }
      const doms = tab.domains
      if (doms !== undefined && doms !== null && !strList(doms)) return `tabs[${i}].domains doit être une liste de textes`
      if (seen.has(tab.id as string)) return `tabs[${i}].id en double : ${tab.id}`
      seen.add(tab.id as string)
    }
  }
  for (const key of ['tabFolders', 'tabSessions']) {
    const items = cfg[key]
    if (items === undefined || items === null) continue
    if (!Array.isArray(items)) return `"${key}" doit être un tableau`
    const seen = new Set<string>()
    for (const [i, f] of items.entries()) {
      if (!isObj(f)) return `${key}[${i}] doit être un objet`
      for (const field of ['id', 'name']) {
        if (!filled(f[field])) return `${key}[${i}].${field} manquant`
      }
      if (seen.has(f.id as string)) return `${key}[${i}].id en double : ${f.id}`
      seen.add(f.id as string)
    }
  }
  const order = cfg.pinnedOrder
  if (order !== undefined && order !== null && !strList(order)) return '"pinnedOrder" doit être une liste de textes'
  const bc = cfg.basecamp
  if (bc !== undefined && bc !== null) {
    if (!isObj(bc)) return '"basecamp" doit être un objet'
    const hidden = bc.hidden
    if (hidden !== undefined && hidden !== null && !strList(hidden)) return '"basecamp.hidden" doit être une liste de textes'
    const repos = bc.repos
    if (repos !== undefined && repos !== null && !strList(repos)) return '"basecamp.repos" doit être une liste de textes'
  }
  const tr = cfg.trello
  if (tr !== undefined && tr !== null) {
    if (!isObj(tr)) return '"trello" doit être un objet'
    const hidden = tr.hidden
    if (hidden !== undefined && hidden !== null && !strList(hidden)) return '"trello.hidden" doit être une liste de textes'
    const repos = tr.repos
    if (repos !== undefined && repos !== null && !strList(repos)) return '"trello.repos" doit être une liste de textes'
  }
  const loc = cfg.local
  if (loc !== undefined && loc !== null) {
    if (!isObj(loc)) return '"local" doit être un objet'
    if (loc.roots !== undefined && loc.roots !== null && !Array.isArray(loc.roots)) return '"local.roots" doit être un tableau'
  }
  return null
}

export function validateNotes(notes: unknown): string | null {
  if (!Array.isArray(notes)) return 'les notes doivent être un tableau'
  for (const [i, n] of notes.entries()) {
    if (!isObj(n)) return `notes[${i}] doit être un objet`
    if (!filled(n.id) && !(isStr(n.id) && n.id)) return `notes[${i}].id manquant`
    if (!isStr(n.text)) return `notes[${i}].text doit être une chaîne`
  }
  return null
}

// ── Compteurs d'ouverture ──────────────────────────────────────────────────────
export function bumpUsage(linkId: string, nowMs: number): Record<string, { count: number; last: number }> {
  let usage = read<Record<string, { count?: number; last?: number }>>(USAGE, {})
  if (!isObj(usage)) usage = {}
  const entry = usage[linkId] || { count: 0, last: 0 }
  usage[linkId] = { count: Math.trunc(Number(entry.count || 0)) + 1, last: nowMs }
  write(USAGE, usage)
  return usage as Record<string, { count: number; last: number }>
}
