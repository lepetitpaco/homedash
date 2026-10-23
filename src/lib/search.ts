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
    if (found === -1) return wordsScore(h, n)
    gaps += found - hi
    hi = found + 1
  }
  return 200 - Math.min(gaps, 150)
}

/**
 * Dernier recours : chaque mot tapé retrouvé dans un mot du texte, dans
 * n'importe quel ordre, avec une faute de frappe par mot de 4 lettres ou plus.
 * « shopping diag » → « Assistant Shoping interne (Diag) ». Classé après tout le reste.
 */
function wordsScore(h: string, n: string): number {
  const words = h.split(/[^a-z0-9]+/).filter(Boolean)
  let typos = 0
  for (const w of n.split(/[^a-z0-9]+/).filter(Boolean)) {
    if (words.some((x) => x.includes(w))) continue
    if (w.length >= 4 && words.some((x) => oneEditAway(x, w) || oneEditAway(x.slice(0, w.length), w))) {
      typos++
      continue
    }
    return -1
  }
  return typos || n.trim().includes(' ') ? 120 - typos * 20 : -1
}

/** Une lettre en plus, en moins, changée ou deux lettres inversées. */
function oneEditAway(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true // une lettre changée
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2) // inversion
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1)
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
