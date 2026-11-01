/**
 * Changer de site au clavier (Ctrl+Tab) : l'ordre, du plus récemment utilisé au
 * plus ancien, et le déplacement dans la liste. Sans React, pour être testé.
 */

/** `key` passe en tête de l'historique. */
export function touchRecent(recent: string[], key: string): string[] {
  return [key, ...recent.filter((k) => k !== key)]
}

/** Les sites existants : les récents d'abord, puis ceux jamais ouverts, dans leur ordre. */
export function orderSites(recent: string[], keys: string[]): string[] {
  const known = new Set(keys)
  const first = recent.filter((k) => known.has(k))
  const seen = new Set(first)
  return [...first, ...keys.filter((k) => !seen.has(k))]
}

/** Position suivante ou précédente, en boucle. */
export function stepIndex(index: number, length: number, dir: 'next' | 'prev'): number {
  if (length < 1) return 0
  return (index + (dir === 'next' ? 1 : -1) + length) % length
}
