import type { CustomTab } from '../types'

export type DockerLink = { id: string; label: string; url: string; container: string; image: string; port: number }

/** Les liens choisis, sous forme de sites : calculés, jamais écrits dans la config. */
export function dockerTabs(links: DockerLink[], hidden: string[] = []): CustomTab[] {
  return links
    .filter((l) => !hidden.includes(l.id))
    .map((l) => ({ id: `dk-${l.id}`, label: l.label, url: l.url, embed: true, icon: '🐳', notify: false, capture: false }))
}
