/**
 * Sauvegardes de data/ : instantanés datés dans data/backups/, export, restauration.
 *
 * Ce qui est sauvegardé, c'est ce qu'on a saisi : la config, les notes et les
 * compteurs. Pas le journal, ni les jetons : une sauvegarde se télécharge, se
 * copie, s'envoie, et un jeton n'a rien à faire dans un fichier qui voyage
 * (l'export complet chiffré, lui, les emporte : fullexport.ts).
 *
 * Une restauration commence toujours par un instantané de l'état courant : se
 * tromper de fichier se répare en restaurant celui d'avant.
 */

import fs from 'node:fs'
import path from 'node:path'

import * as store from './store.ts'

export const KEEP = 30 // instantanés conservés, les plus anciens partent
export const AUTO_GAP = 24 * 3600 // un instantané automatique par jour
export const FILES: Record<string, string> = { config: store.CONFIG, notes: store.NOTES, usage: store.USAGE }
const NAME = /^\d{8}-\d{6}-[a-z0-9-]{1,40}\.json$/

export function dir(): string {
  return path.join(store.DATA_DIR(), 'backups')
}

export type Bundle = {
  homedash_backup: 1
  created: number
  reason: string
  files: Record<string, unknown>
}

export function bundle(reason = 'export'): Bundle {
  const files: Record<string, unknown> = {}
  for (const [key, name] of Object.entries(FILES)) {
    try {
      files[key] = store.read(name, null)
    } catch {
      files[key] = null // fichier cassé : on sauve le reste
    }
  }
  return { homedash_backup: 1, created: Date.now() / 1000, reason, files }
}

function slug(reason: string): string {
  return (
    reason
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'manuelle'
  )
}

function jsonFiles(): string[] {
  try {
    return fs.readdirSync(dir()).filter((n) => n.endsWith('.json')).sort()
  } catch {
    return []
  }
}

/** Écrit un instantané et renvoie son nom. Deux dans la même seconde ne s'écrasent pas. */
export function snapshot(reason = 'manuelle'): string {
  fs.mkdirSync(dir(), { recursive: true })
  const st = store.stamp()
  let name = `${st}-${slug(reason)}.json`
  let n = 1
  while (fs.existsSync(path.join(dir(), name))) {
    n += 1
    name = `${st}-${slug(reason)}-${n}.json`
  }
  const tmp = path.join(dir(), name + '.tmp')
  fs.writeFileSync(tmp, JSON.stringify(bundle(reason), null, 1) + '\n')
  fs.renameSync(tmp, path.join(dir(), name))
  const all = jsonFiles()
  for (const old of all.slice(0, Math.max(0, all.length - KEEP))) fs.rmSync(path.join(dir(), old), { force: true })
  return name
}

export type Entry = { name: string; size: number; created: number; reason: string }

export function listing(): Entry[] {
  const out: Entry[] = []
  for (const name of jsonFiles().reverse()) {
    if (!NAME.test(name)) continue
    const st = fs.statSync(path.join(dir(), name))
    out.push({ name, size: st.size, created: st.mtimeMs / 1000, reason: name.slice(16, -5) })
  }
  return out
}

/** Chemin d'un instantané, ou null : le nom vient de l'URL, il est vérifié avant de toucher au disque. */
export function pathOf(name: string | null | undefined): string | null {
  if (!NAME.test(name || '')) return null
  const p = path.join(dir(), name as string)
  try {
    return fs.statSync(p).isFile() ? p : null
  } catch {
    return null
  }
}

export function load(name: string): unknown {
  const p = pathOf(name)
  return p ? JSON.parse(fs.readFileSync(p, 'utf-8')) : null
}

export function remove(name: string): boolean {
  const p = pathOf(name)
  if (p) fs.rmSync(p)
  return !!p
}

/** Message d'erreur, ou null si `data` est une sauvegarde restaurable. */
export function check(data: unknown): string | null {
  const d = data as Partial<Bundle> | null
  if (!d || typeof d !== 'object' || Array.isArray(d) || d.homedash_backup !== 1) return "ce fichier n'est pas une sauvegarde homedash"
  const files = d.files as Record<string, unknown> | undefined
  if (!files || typeof files !== 'object' || Array.isArray(files) || !files.config) return 'sauvegarde sans config'
  let problem = store.validateConfig(files.config)
  if (problem) return `config invalide : ${problem}`
  if (files.notes !== undefined && files.notes !== null) {
    problem = store.validateNotes(files.notes)
    if (problem) return `notes invalides : ${problem}`
  }
  if (files.usage !== undefined && files.usage !== null && (typeof files.usage !== 'object' || Array.isArray(files.usage)))
    return 'compteurs invalides'
  return null
}

/** Restaure après un instantané de l'état courant. Renvoie le nom de cet instantané. */
export function restore(data: unknown): string {
  const problem = check(data)
  if (problem) throw new Error(problem)
  const before = snapshot('avant-restauration')
  restoreFiles((data as Bundle).files)
  return before
}

/** Écrit les fichiers d'une sauvegarde déjà vérifiée (l'appelant a pris l'instantané). */
export function restoreFiles(files: Record<string, unknown>): void {
  store.backupConfig()
  for (const [key, name] of Object.entries(FILES)) {
    if (files[key] !== undefined && files[key] !== null) store.write(name, files[key])
  }
}

/** La sauvegarde la plus récente dont la config se relit. */
export function latestGood(): { name: string; created: number } | null {
  for (const entry of listing()) {
    let data: unknown
    try {
      data = load(entry.name)
    } catch {
      continue
    }
    const cfg = (data as Bundle | null)?.files?.config
    if (!check(data) && cfg && typeof cfg === 'object' && !Array.isArray(cfg)) return { name: entry.name, created: entry.created }
  }
  return null
}

/**
 * config.json ne se relit plus : il est mis de côté (rien n'est perdu), puis
 * la dernière sauvegarde valide est restaurée.
 */
export function repair(): { restored: string; created: number; aside: string | null } {
  const good = latestGood()
  if (!good) throw new Error('aucune sauvegarde utilisable')
  const aside = store.setAside(store.CONFIG)
  restore(load(good.name))
  return { restored: good.name, created: good.created, aside }
}

function autoOnce(): void {
  try {
    const latest = Math.max(0, ...listing().filter((b) => b.reason === 'auto').map((b) => b.created))
    if (Date.now() / 1000 - latest >= AUTO_GAP && fs.existsSync(store.pathOf(store.CONFIG)))
      console.log(`💾 sauvegarde automatique : ${snapshot('auto')}`)
  } catch (e) {
    console.log(`✗ sauvegarde automatique : ${e}`)
  }
}

export function startAuto(): void {
  autoOnce()
  setInterval(autoOnce, 3600 * 1000).unref()
}
