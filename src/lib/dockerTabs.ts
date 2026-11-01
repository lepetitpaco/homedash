import type { CustomTab } from '../types'

export type DockerPort = { port: number; url: string }
export type DockerEntry = { id: string; label: string; image: string; running: boolean; ports: DockerPort[] }

/** Identifiant de site d'une ligne : ni dans la config, ni réutilisable par un onglet. */
export const dockerTabId = (e: Pick<DockerEntry, 'id'>) => `dk-${e.id}`

/** Les lignes en marche et choisies, sous forme de sites : calculés, jamais écrits dans la config. */
export function dockerTabs(entries: DockerEntry[], hidden: string[] = []): CustomTab[] {
  return entries
    .filter((e) => e.running && !hidden.includes(e.id))
    .map((e) => ({ id: dockerTabId(e), label: e.label, url: e.ports[0].url, embed: true, notify: false, capture: false }))
}

/** Les lignes éteintes et choisies : affichées fades, sans clic. */
export const dockerStopped = (entries: DockerEntry[], hidden: string[] = []) => entries.filter((e) => !e.running && !hidden.includes(e.id))

/** Couleurs des monogrammes : toutes lisibles avec des lettres blanches, en thème clair comme sombre. */
export const MONOGRAM_COLORS = ['#b91c1c', '#c2410c', '#a16207', '#15803d', '#0f766e', '#0369a1', '#1d4ed8', '#6d28d9', '#a21caf', '#be123c']

/** Deux lettres et une couleur stable pour un projet ou un container : `homedash-dev` → HD, `tiroir` → TI. */
export function monogram(container: string): { letters: string; color: string } {
  const words = container.split(/[-_.]+/).filter(Boolean)
  const letters = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase()
  let hash = 0
  for (const c of container) hash = (hash * 31 + c.charCodeAt(0)) >>> 0
  return { letters, color: MONOGRAM_COLORS[hash % MONOGRAM_COLORS.length] }
}
