/**
 * Place des dossiers dans la barre de gauche. Chaque dossier note le site devant lequel il se
 * trouve (`before`) ; sans lui, ou si ce site n'est plus là, il va en bas, comme avant.
 * Sans React, pour être testé.
 */
import type { CustomTab, TabFolder } from '../types'

export type RailEntry = { tab: CustomTab } | { folder: TabFolder }

/** Sites hors dossier et dossiers, dans leur ordre d'affichage. */
export function railEntries(loose: CustomTab[], folders: TabFolder[]): RailEntry[] {
  const known = new Set(loose.map((t) => t.id))
  const before = (id: string) => folders.filter((f) => f.before === id).map((folder) => ({ folder }))
  return [
    ...loose.flatMap((tab) => [...before(tab.id), { tab }]),
    ...folders.filter((f) => !f.before || !known.has(f.before)).map((folder) => ({ folder })),
  ]
}

/**
 * Place un dossier juste avant une entrée : un site (`tab`), un autre dossier (`folder`), ou tout
 * en bas si rien n'est visé. Le tableau garde l'ordre des dossiers placés au même endroit.
 */
export function moveFolder(folders: TabFolder[], id: string, target: { tab?: string; folder?: string }): TabFolder[] {
  const moved = folders.find((f) => f.id === id)
  if (!moved || target.folder === id) return folders
  const { before: _old, ...rest } = moved
  const others = folders.filter((f) => f.id !== id)
  if (target.folder) {
    const at = others.findIndex((f) => f.id === target.folder)
    if (at < 0) return folders
    const anchor = others[at].before
    others.splice(at, 0, anchor ? { ...rest, before: anchor } : rest)
    return others
  }
  return target.tab ? [...others, { ...rest, before: target.tab }] : [...others, rest]
}

/**
 * Un site vient de bouger, ou d'entrer dans un dossier : les dossiers placés devant lui ne le
 * suivent pas, ils restent où ils étaient, devant le site qui venait après.
 */
export function keepFolderPlaces(prevLoose: CustomTab[], nextTabs: CustomTab[], folders: TabFolder[], isLoose: (t: CustomTab) => boolean): TabFolder[] {
  const ids = prevLoose.map((t) => t.id)
  const next = nextTabs.filter(isLoose).map((t) => t.id)
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])
  if (same(ids, next)) return folders
  // A-t-il bougé ? Absent de la liste, ou seul à différer entre les deux ordres.
  const moved = (id: string) => !next.includes(id) || same(ids.filter((x) => x !== id), next.filter((x) => x !== id))
  let changed = false
  const out = folders.map((f) => {
    if (!f.before || !ids.includes(f.before) || !moved(f.before)) return f
    const stay = ids.slice(ids.indexOf(f.before) + 1).find((x) => next.includes(x) && !moved(x))
    changed = true
    const { before: _old, ...rest } = f
    return stay ? { ...rest, before: stay } : rest
  })
  return changed ? out : folders
}

/** Où placer un nouveau dossier fait de ces sites : là où était le premier, devant le site suivant. */
export function placeForNew(loose: CustomTab[], ids: string[]): string | undefined {
  const order = loose.map((t) => t.id)
  const at = order.indexOf(ids[0])
  return at < 0 ? undefined : order.slice(at + 1).find((x) => !ids.includes(x))
}
