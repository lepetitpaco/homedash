const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

/** Champ indexé : [texte, poids]. */
export type Field = [string | undefined, number]

/**
 * Score une chaîne face à une requête.
 * -1 = pas de match. Plus le score est haut, meilleur c'est.
 * Égalité > début de chaîne > début de mot > sous-chaîne > sous-séquence floue.
 */
function scoreText(haystack: string, needle: string): number {
  const h = normalize(haystack)
  const n = normalize(needle)
  if (!n) return 0

  if (h === n) return 1000
  if (h.startsWith(n)) return 800 - Math.min(h.length, 100)
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (new RegExp(`\\b${escaped}`).test(h)) return 600 - Math.min(h.length, 100)
  const idx = h.indexOf(n)
  if (idx >= 0) return 400 - Math.min(idx, 100)

  // sous-séquence : "mpa" -> "mon-projet-api"
  let hi = 0
  let gaps = 0
  for (const ch of n) {
    const found = h.indexOf(ch, hi)
    if (found === -1) return -1
    gaps += found - hi
    hi = found + 1
  }
  return 200 - Math.min(gaps, 150)
}

/** Meilleur score pondéré sur l'ensemble des champs d'un item. */
export function scoreFields(fields: Field[], query: string): number {
  let best = -1
  for (const [text, weight] of fields) {
    if (!text) continue
    const s = scoreText(text, query)
    if (s < 0) continue
    best = Math.max(best, s * weight)
  }
  return best
}

/** Trie les items par pertinence, en ne gardant que ceux qui matchent. */
export function rank<T>(items: T[], toFields: (item: T) => Field[], query: string, limit = 40): T[] {
  const q = query.trim()
  if (!q) return []
  return items
    .map((item) => ({ item, score: scoreFields(toFields(item), q) }))
    .filter((r) => r.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.item)
}
