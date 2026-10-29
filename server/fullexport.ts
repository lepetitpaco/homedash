/**
 * Export complet (#61) : tout homedash dans un fichier `.homedash` chiffré, pour
 * passer d'une machine à l'autre (Mac ↔ PC). Contrairement à l'export simple
 * (backup.ts), il emporte les jetons (GitHub, Basecamp) et les connexions des
 * sites (cookies des onglets, fournis par l'appli) : il n'existe donc que
 * chiffré, avec un mot de passe choisi à l'export.
 *
 * Chiffrement : clé tirée du mot de passe par scrypt, puis AES-256-GCM (un
 * octet modifié et le fichier est refusé). Rien n'est écrit à l'import sans
 * accord : l'aperçu ne fait que lire, l'import prend un instantané avant et
 * garde une copie des jetons qu'il remplace.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'

import * as backup from './backup.ts'
import * as store from './store.ts'

export const MIN_PASSWORD = 8
const N = 2 ** 15
const R = 8
const P = 1

type Obj = Record<string, any>

export type Payload = {
  homedash_full: 1
  created: number
  version: string
  files: { config: unknown; notes: unknown; usage: unknown }
  secrets: Obj
  /** {partition: cookies[]} tels que les donne Electron (`session.cookies.get`). */
  cookies: Record<string, Obj[]>
}

function key(password: string, salt: Buffer, n = N, r = R, p = P): Buffer {
  return crypto.scryptSync(password.normalize('NFC'), salt, 32, { N: n, r, p, maxmem: 128 * n * r * 2 })
}

function readJson<T>(name: string, fallback: T): T {
  try {
    return store.read<T>(name, fallback)
  } catch {
    return fallback
  }
}

/** Le contenu de l'export, en clair : ne quitte ce module que chiffré. */
export function collect(cookies: unknown, version: string): Payload {
  const jar: Record<string, Obj[]> = {}
  if (cookies && typeof cookies === 'object' && !Array.isArray(cookies)) {
    for (const [partition, list] of Object.entries(cookies as Obj)) {
      if (/^persist:homedash-tabs(-[a-z0-9-]{1,40})?$/.test(partition) && Array.isArray(list)) jar[partition] = list.filter((c) => c && typeof c === 'object')
    }
  }
  return {
    homedash_full: 1,
    created: Date.now() / 1000,
    version,
    files: backup.bundle('export-complet').files as Payload['files'],
    secrets: readJson<Obj>(store.SECRETS, {}),
    cookies: jar,
  }
}

/** Contenu → fichier `.homedash` (JSON, données chiffrées). */
export function seal(payload: Payload, password: string): string {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) throw new RangeError(`mot de passe de ${MIN_PASSWORD} caractères au moins`)
  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(password, salt), iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf-8'), cipher.final()])
  return JSON.stringify({
    homedash_full: 1,
    created: payload.created,
    kdf: { name: 'scrypt', N, r: R, p: P, salt: salt.toString('base64') },
    cipher: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  })
}

/** Fichier `.homedash` → contenu ; lève une erreur lisible si ce n'en est pas un ou si le mot de passe est faux. */
export function open(file: unknown, password: unknown): Payload {
  let f: Obj
  try {
    f = typeof file === 'string' ? JSON.parse(file) : (file as Obj)
  } catch {
    throw new RangeError("ce fichier n'est pas un export complet homedash")
  }
  if (!f || f.homedash_full !== 1 || f.cipher !== 'aes-256-gcm' || f.kdf?.name !== 'scrypt') throw new RangeError("ce fichier n'est pas un export complet homedash")
  const n = Number(f.kdf.N)
  const r = Number(f.kdf.r)
  const p = Number(f.kdf.p)
  // Paramètres bornés : un fichier fabriqué ne doit pas faire travailler la machine des minutes.
  if (!(n >= 2 ** 14 && n <= 2 ** 17 && r >= 1 && r <= 16 && p >= 1 && p <= 4)) throw new RangeError('fichier invalide')
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(String(password ?? ''), Buffer.from(f.kdf.salt, 'base64'), n, r, p), Buffer.from(f.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(f.tag, 'base64'))
    const clear = Buffer.concat([decipher.update(Buffer.from(f.data, 'base64')), decipher.final()])
    const payload = JSON.parse(clear.toString('utf-8'))
    if (payload?.homedash_full !== 1) throw new Error('contenu')
    return payload
  } catch {
    throw new RangeError('mot de passe incorrect, ou fichier abîmé')
  }
}

/** Ce que contient l'export, sans aucun secret : pour l'aperçu avant import. */
export function summary(p: Payload): Obj {
  const cfg = (p.files?.config || {}) as Obj
  const tokens = p.secrets?.github_tokens && typeof p.secrets.github_tokens === 'object' ? Object.keys(p.secrets.github_tokens).length : 0
  const cookies = Object.values(p.cookies || {}).reduce((n, list) => n + list.length, 0)
  const sites = new Set<string>()
  for (const list of Object.values(p.cookies || {})) for (const c of list) if (c.domain) sites.add(String(c.domain).replace(/^\./, ''))
  return {
    created: p.created,
    version: p.version,
    title: cfg.title || 'homedash',
    links: (cfg.groups || []).reduce((n: number, g: Obj) => n + (g.links || []).length, 0),
    tabs: (cfg.tabs || []).length,
    github_accounts: (cfg.github_accounts || []).length,
    github_tokens: tokens,
    basecamp: !!p.secrets?.basecamp?.access_token,
    notes: Array.isArray(p.files?.notes) ? (p.files.notes as unknown[]).length : 0,
    cookies,
    cookie_sites: sites.size,
    sessions: Object.keys(p.cookies || {}).length,
  }
}

/**
 * Applique un export : réglages, notes et compteurs (validés), jetons. Un
 * instantané est pris avant, et les jetons remplacés sont gardés à côté
 * (`secrets.avant-import-….json`, en 600). Rend les cookies, que l'appli remet
 * dans ses sessions.
 */
export function apply(p: Payload, include: { settings?: boolean; secrets?: boolean; cookies?: boolean }): { before: string; cookies: Record<string, Obj[]> } {
  const files = p.files || ({} as Payload['files'])
  if (include.settings) {
    const problem = backup.check({ homedash_backup: 1, files })
    if (problem) throw new RangeError(problem)
  }
  const before = backup.snapshot('avant-import')
  if (include.settings) backup.restoreFiles(files)
  if (include.secrets && p.secrets && typeof p.secrets === 'object') {
    const current = fs.existsSync(store.pathOf(store.SECRETS)) ? readJson<Obj>(store.SECRETS, {}) : null
    if (current && Object.keys(current).length) store.write(`secrets.avant-import-${store.stamp()}.json`, current, 0o600)
    store.write(store.SECRETS, p.secrets, 0o600)
  }
  return { before, cookies: include.cookies ? p.cookies || {} : {} }
}
