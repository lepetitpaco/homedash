/** Onglets perso : un site, ou un fichier / dossier du disque servi par `/api/file`. */
import type { CustomTab, TabFolder, TabSession } from '../types'

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

/**
 * Déplace l'onglet `id` juste avant `before` (null = à la fin) et le range
 * dans `folder` (absent = hors dossier). L'ordre des onglets d'un dossier est
 * celui du tableau : glisser-déposer et Réglages écrivent la même chose.
 */
export function moveTab(tabs: CustomTab[], id: string, before: string | null, folder?: string): CustomTab[] {
  const tab = tabs.find((t) => t.id === id)
  if (!tab || id === before) return tabs
  const { folder: _old, ...rest } = tab
  const moved: CustomTab = folder ? { ...rest, folder } : rest
  const others = tabs.filter((t) => t.id !== id)
  const at = before ? others.findIndex((t) => t.id === before) : -1
  if (at < 0) others.push(moved)
  else others.splice(at, 0, moved)
  return others
}

/** Dossier d'un onglet, s'il existe encore (un dossier supprimé ne garde personne). */
export function folderOf(t: CustomTab, folders: TabFolder[]): string | undefined {
  return t.folder && folders.some((f) => f.id === t.folder) ? t.folder : undefined
}

export function newFolderId(taken: string[]): string {
  let id = ''
  do id = `f-${Math.random().toString(36).slice(2, 8)}`
  while (taken.includes(id))
  return id
}

/** Couleurs des comptes et des dossiers : celles des conteneurs Firefox. */
export const COLORS = ['#37adff', '#00c79a', '#51cd00', '#ffcb00', '#ff9f00', '#ff613d', '#ff4bda', '#af51f5']

/** Compte d'un onglet, s'il existe encore (supprimé = connexion commune). */
export function sessionOf(t: CustomTab, sessions: TabSession[]): TabSession | undefined {
  return t.session ? sessions.find((s) => s.id === t.session) : undefined
}

export function newSessionId(taken: string[]): string {
  let id = ''
  do id = `s-${Math.random().toString(36).slice(2, 8)}`
  while (taken.includes(id))
  return id
}

/** Domaines qui vont de pair : un lien twitter.com s'ouvre dans l'onglet X. */
const ALIASES: Record<string, string[]> = {
  'x.com': ['twitter.com'],
  'youtube.com': ['youtu.be', 'm.youtube.com'],
  'instagram.com': ['instagr.am'],
}

const bare = (h: string) => h.toLowerCase().replace(/^www\./, '').replace(/\.$/, '')

/** Hôtes dont cet onglet capte les liens : le sien, ses alias, ses « autres domaines ». */
export function domainsOf(t: CustomTab): string[] {
  const own = bare(hostOf(t.url))
  if (!own) return []
  const extra = (t.domains ?? []).map((d) => bare(d.trim().replace(/^[a-z]+:\/\//i, '').split('/')[0])).filter(Boolean)
  return [...new Set([own, ...(ALIASES[own] ?? []), ...extra])]
}

/** `url` va-t-il vers un domaine de cet onglet ? (sous-domaines compris : mobile.x.com → x.com) */
export function capturesLink(t: CustomTab, url: string): boolean {
  if (!t.embed || isLocal(t.url) || t.capture === false) return false
  let h = ''
  try {
    h = bare(new URL(url).hostname)
  } catch {
    return false
  }
  return domainsOf(t).some((d) => h === d || h.endsWith('.' + d))
}

/** Même page (sans l'ancre ni la barre finale) : `#inbox` ou `/` en plus ne font pas un autre onglet. */
export function samePage(a: string, b: string): boolean {
  try {
    const x = new URL(a)
    const y = new URL(b)
    const path = (u: URL) => u.pathname.replace(/\/+$/, '')
    return bare(x.hostname) === bare(y.hostname) && path(x) === path(y) && x.search === y.search
  } catch {
    return false
  }
}

/**
 * Onglet où ouvrir un lien : un onglet qui capte ce domaine, de préférence du
 * même compte que l'onglet d'où vient le lien (deux Claude, perso et commun).
 */
export function linkTarget(url: string, tabs: CustomTab[], from?: CustomTab): CustomTab | undefined {
  const all = tabs.filter((t) => capturesLink(t, url))
  return all.find((t) => (t.session ?? '') === (from?.session ?? '')) ?? all[0]
}

/** Sites qui affichent des non-lus : chargés au démarrage de l'appli par défaut. */
const NOTIFYING = [
  'mail.google.com', 'chat.google.com', 'outlook.office.com', 'outlook.live.com', 'mail.proton.me',
  'web.whatsapp.com', 'messenger.com', 'web.telegram.org', 'app.slack.com', 'discord.com',
  'teams.microsoft.com', 'x.com', 'instagram.com', 'facebook.com', 'linkedin.com', 'bsky.app',
]

/**
 * Chargé dès le démarrage de l'appli ? Chaque site chargé coûte 100 à 400 Mo :
 * seuls ceux dont on veut les non-lus sans les ouvrir le sont d'office.
 */
export function preloads(t: CustomTab): boolean {
  if (t.preload !== undefined) return t.preload
  const h = hostOf(t.url).replace(/^www\./, '')
  return NOTIFYING.some((d) => h === d || h.endsWith('.' + d))
}
