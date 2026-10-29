/**
 * Chemins du disque : affichés (`~/dev`, `/Volumes/…`, `C:/…`) ↔ lisibles ici.
 *
 * Dans l'appli, le serveur tourne sur la machine elle-même : le dossier
 * personnel est le vrai. En dev (Docker), le dossier personnel de l'hôte est
 * monté en lecture seule sur `HOST_MOUNT` (/host) et `HOST_HOME` dit ce qu'il
 * vaut côté hôte ; le disque est sur `DISK_MOUNT`, `HOST_DISK` côté hôte.
 *
 * Tous les chemins manipulés ici s'écrivent avec des `/`, Windows compris :
 * Node les accepte partout, et la page les montre ainsi.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** `C:\Users\ada` → `C:/Users/ada` ; enlève le `/` final (sauf racine). */
export function norm(p: string): string {
  let s = (p || '').replace(/\\/g, '/')
  if (s.length > 1 && s.endsWith('/') && !/^[A-Za-z]:\/$/.test(s)) s = s.replace(/\/+$/, '')
  return s
}

export function isDir(p: string | null | undefined): boolean {
  if (!p) return false
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

export function exists(p: string): boolean {
  try {
    fs.lstatSync(p)
    return true
  } catch {
    return false
  }
}

/** realpath qui ne lève pas : un chemin introuvable reste tel quel (comme os.path.realpath). */
export function real(p: string): string {
  try {
    return norm(fs.realpathSync.native(p))
  } catch {
    return norm(path.resolve(p))
  }
}

export function dirname(p: string): string {
  const d = path.posix.dirname(norm(p))
  return /^[A-Za-z]:$/.test(d) ? d + '/' : d
}

export function join(...parts: string[]): string {
  return norm(path.posix.join(...parts.map(norm)))
}

const hostMount = () => process.env.HOST_MOUNT || '/host'
const diskMount = () => process.env.DISK_MOUNT || '/hostdisk'

/** Le dossier personnel tel que ce process le voit. */
export function homeBase(): string {
  return isDir(hostMount()) ? norm(hostMount()) : norm(os.homedir())
}

/** Le dossier personnel tel que la personne le voit. */
export function homeDisplay(): string {
  return norm(process.env.HOST_HOME || os.homedir())
}

/** Le disque lisible ici, ou null. */
export function diskBase(): string | null {
  const d = diskMount()
  return isDir(d) ? norm(d) : null
}

/** Le disque côté personne : `C:` (Windows) ou `/Volumes` (Mac). */
export function diskDisplay(): string {
  return norm(process.env.HOST_DISK || '').replace(/\/+$/, '')
}

export function under(p: string, prefix: string, fold = false): boolean {
  const [a, b] = fold ? [p.toLowerCase(), prefix.toLowerCase()] : [p, prefix]
  return a === b || a.startsWith(b.endsWith('/') ? b : b + '/')
}

/** Lettre de lecteur, ou système insensible à la casse (Mac, Windows). */
function foldFor(shown: string): boolean {
  return shown.endsWith(':') || process.platform === 'win32'
}

/** Chemin affiché (`~/dev`, ou absolu côté hôte) → chemin lisible ici. */
export function resolve(p: string | null | undefined): string {
  let s = norm(p || '')
  if (s.length > 1) s = s.replace(/\/+$/, '')
  s = s || '/'
  const base = homeBase()
  if (s === '~' || s.startsWith('~/')) return base + s.slice(1)
  const home = homeDisplay()
  if (base !== home && under(s, home)) return base + s.slice(home.length)
  const disk = diskBase()
  const shown = diskDisplay()
  if (disk && shown && under(s, shown, foldFor(shown))) {
    const rest = s.slice(shown.length)
    return disk === '/' || disk.endsWith('/') ? disk.replace(/\/$/, '') + (rest || '/') : disk + rest
  }
  return s
}

/** Inverse de `resolve` : ce qu'on montre et ce qu'on met dans les commandes. */
export function display(p: string): string {
  const s = norm(p)
  const base = homeBase().replace(/\/$/, '')
  if (s === base || under(s, base, process.platform === 'win32')) return '~' + s.slice(base.length)
  const disk = diskBase()
  const shown = diskDisplay()
  if (disk && shown && under(s, disk.replace(/\/$/, '') || '/', foldFor(shown))) {
    const d = disk.replace(/\/$/, '')
    const host = shown + s.slice(d.length)
    const home = homeDisplay()
    if (home && under(host, home, foldFor(shown))) return '~' + host.slice(home.length)
    return host
  }
  return s
}
