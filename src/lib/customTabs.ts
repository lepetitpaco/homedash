/** Onglets perso : un site, ou un fichier / dossier du disque servi par `/api/file`. */
import type { CustomTab } from '../types'

/** Chemin du disque (`~/…`, `/Users/…`, `file://…`) plutôt qu'adresse web. */
export function isLocal(url: string): boolean {
  const u = url.trim()
  return u.startsWith('~') || u.startsWith('/') || u.toLowerCase().startsWith('file://')
}

/**
 * Adresse à charger. Une page servie en http ne peut pas ouvrir `file://` : le
 * fichier passe par le serveur, en lecture seule, limité au dossier personnel.
 * Une adresse sans schéma (`example.com`) reçoit `https://`.
 */
export function srcOf(url: string): string {
  const u = url.trim()
  if (isLocal(u)) return `api/file?path=${encodeURIComponent(u)}`
  return /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`
}

export function hostOf(url: string): string {
  if (isLocal(url)) return ''
  try {
    return new URL(srcOf(url)).hostname.toLowerCase()
  } catch {
    return ''
  }
}

/**
 * Sites connus pour refuser l'affichage dans une autre page (X-Frame-Options /
 * frame-ancestors) : on le dit avant que l'utilisateur ne tombe sur une page blanche.
 */
const NO_EMBED = /(^|\.)(google\.com|github\.com|basecamp\.com|37signals\.com|slack\.com|notion\.so|figma\.com|linkedin\.com|facebook\.com|x\.com|twitter\.com|microsoft\.com|office\.com|live\.com|atlassian\.net|apple\.com|amazon\.[a-z.]+|youtube\.com)$/

export function refusesEmbed(url: string): boolean {
  return NO_EMBED.test(hostOf(url))
}

export const tabKey = (t: CustomTab) => `x:${t.id}` as const

export function newTabId(taken: string[]): string {
  let id = ''
  do id = `x-${Math.random().toString(36).slice(2, 8)}`
  while (taken.includes(id))
  return id
}
