#!/usr/bin/env node
// Compare les réponses GET de deux serveurs homedash (1.x Python et 2.0 TypeScript)
// lancés sur deux copies des mêmes données. Lecture seule : aucune écriture n'est envoyée.
//
//   node scripts/parity.mjs http://ancien:80 http://nouveau:7779
//
// Les champs qui bougent d'eux-mêmes (horodatages, durées, compteurs d'appels)
// sont ignorés ; tout autre écart est listé. Code de sortie 1 s'il y en a.

const [, , OLD, NEW] = process.argv
if (!OLD || !NEW) {
  console.error('usage : node scripts/parity.mjs <ancien> <nouveau>')
  process.exit(2)
}

const ROUTES = [
  '/api/config',
  '/api/notes',
  '/api/usage',
  '/api/events',
  '/api/errors',
  '/api/backups',
  '/api/perf',
  '/api/guide',
  '/api/local/roots',
  '/api/local/browse?path=~',
  '/api/local',
  '/api/github/accounts',
  '/api/github',
  '/api/github/auth',
  '/api/basecamp',
  '/api/basecamp/auth',
]

// Champs propres à un instant ou à un process : jamais comparés.
const VOLATILE = new Set([
  'updated_at', 'took', 'building', 'checked_at', 'ts', 'stats', 'rate_remaining', 'fetched_at',
  'trigger', 'watching', 'created', 'size', 'expires_at', 'bytes', 'mb', 'files', 'since', 'version',
])

function norm(v) {
  if (Array.isArray(v)) return v.map(norm)
  if (v && typeof v === 'object') {
    const out = {}
    for (const k of Object.keys(v).sort()) if (!VOLATILE.has(k)) out[k] = norm(v[k])
    return out
  }
  // 1.0 (Python) et 1 (JS) : même nombre
  return typeof v === 'number' ? Math.round(v * 1000) / 1000 : v
}

function diff(a, b, at, out) {
  if (out.length > 30) return
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${at}: longueur ${a.length} ≠ ${b.length}`)
    for (let i = 0; i < Math.min(a.length, b.length); i++) diff(a[i], b[i], `${at}[${i}]`, out)
    return
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in a)) out.push(`${at}.${k}: absent de l'ancien`)
      else if (!(k in b)) out.push(`${at}.${k}: absent du nouveau`)
      else diff(a[k], b[k], `${at}.${k}`, out)
    }
    return
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${at}: ${JSON.stringify(a)?.slice(0, 120)} ≠ ${JSON.stringify(b)?.slice(0, 120)}`)
}

async function get(base, route) {
  // `fetch` impose le Host de l'adresse : les deux serveurs doivent l'autoriser (HOMEDASH_HOSTS).
  const res = await fetch(base + route)
  const text = await res.text()
  try {
    return [res.status, JSON.parse(text)]
  } catch {
    return [res.status, text]
  }
}

let bad = 0
for (const route of ROUTES) {
  const [[sa, a], [sb, b]] = await Promise.all([get(OLD, route), get(NEW, route)])
  const out = []
  if (sa !== sb) out.push(`statut ${sa} ≠ ${sb}`)
  // Deux refus identiques ne prouvent rien : un statut d'erreur des deux côtés est un échec.
  else if (sa >= 400) out.push(`statut ${sa} des deux côtés : ${JSON.stringify(a).slice(0, 120)}`)
  diff(norm(a), norm(b), '', out)
  if (out.length) {
    bad += 1
    console.log(`✗ ${route}`)
    for (const line of out.slice(0, 30)) console.log(`    ${line}`)
  } else console.log(`✓ ${route}`)
}
process.exit(bad ? 1 : 0)
