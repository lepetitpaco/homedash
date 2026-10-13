/** Compteurs d'ouverture, stockés côté serveur (data/usage.json). */
const LEGACY_KEY = 'homedash:usage'
const ENDPOINT = 'api/usage'

export type Usage = Record<string, { count: number; last: number }>

function sanitize(parsed: unknown): Usage {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const out: Usage = {}
  for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
    const entry = v as { count?: unknown; last?: unknown }
    out[id] = {
      count: typeof entry?.count === 'number' ? entry.count : 0,
      last: typeof entry?.last === 'number' ? entry.last : 0,
    }
  }
  return out
}

export async function load(): Promise<Usage> {
  let server: Usage = {}
  try {
    const res = await fetch(`${ENDPOINT}?t=${Date.now()}`, { cache: 'no-store' })
    if (res.ok) server = sanitize(await res.json())
  } catch {
    /* serveur injoignable */
  }
  // migration unique depuis le localStorage : on additionne les compteurs
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (raw) {
      const local = sanitize(JSON.parse(raw))
      const merged: Usage = { ...server }
      for (const [id, entry] of Object.entries(local)) {
        const cur = merged[id] ?? { count: 0, last: 0 }
        merged[id] = { count: cur.count + entry.count, last: Math.max(cur.last, entry.last) }
      }
      if (Object.keys(local).length > 0) {
        await fetch(ENDPOINT, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(merged),
        }).catch(() => undefined)
        localStorage.removeItem(LEGACY_KEY)
        return merged
      }
    }
  } catch {
    /* stockage indisponible */
  }
  return server
}

export async function bump(id: string): Promise<Usage> {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) return sanitize(await res.json())
  } catch {
    /* hors ligne */
  }
  return {}
}

export async function clear(): Promise<void> {
  try {
    await fetch(ENDPOINT, { method: 'DELETE' })
  } catch {
    /* hors ligne */
  }
}

/** Classement décroissant (fréquence puis récence), limité à `limit`. */
export function topIds(usage: Usage, limit: number): string[] {
  return Object.entries(usage)
    .sort((a, b) => b[1].count - a[1].count || b[1].last - a[1].last)
    .slice(0, limit)
    .map(([id]) => id)
}
