/**
 * Journal de performance : ce que homedash consomme, jour après jour.
 *
 * Un fichier par jour et par source dans `data/perf/` (`server-AAAA-MM-JJ.jsonl`,
 * `app-…`, `page-…`), une ligne JSON par mesure ou action, gardés KEEP_DAYS
 * jours. Que des noms de domaine et des chiffres : jamais une adresse complète,
 * un titre de page ou un contenu.
 */

import fs from 'node:fs'
import path from 'node:path'

import * as store from './store.ts'

export const EVERY = 300 // s entre deux mesures du serveur
export const KEEP_DAYS = 30
const SOURCES = new Set(['server', 'app', 'page'])
const MAX_LINE = 16 * 1024
export const WARN_MB = 50

/** Réglages → Affichage → « Journal de performance » (`ui.perfLog`). Éteint, rien n'est écrit. */
let enabled = false

let requests = new Map<string, number>()
let scans = new Map<string, number>()
let timedOps = new Map<string, [number, number, number]>()

/** Au-delà, une opération a sa propre ligne « slow ». */
const SLOW: Record<string, number> = { github: 20.0, local: 3.0, basecamp: 10.0, trello: 10.0, config: 3.0 }
/** Au-delà, c'est la machine mise en veille : ligne « asleep », hors du cumul. */
export const ASLEEP = 300.0

const FILE = /^(server|app|page)-(\d{4}-\d{2}-\d{2})\.jsonl$/

export function perfDir(): string {
  return path.join(store.DATA_DIR(), 'perf')
}

/** `/api/github/user/ada` → `/api/github/user/*` : on compte des routes, pas des valeurs. */
export function route(p: string): string {
  p = p.split('?', 1)[0]
  for (const prefix of ['/api/github/user/', '/api/github/users/', '/api/github/repos/', '/api/github/members/', '/api/github/accounts/', '/api/backups/']) {
    if (p.startsWith(prefix)) return prefix + '*'
  }
  return p.startsWith('/api/') ? p : '(page)'
}

const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) || 0) + 1)

export function hit(method: string, p: string): void {
  bump(requests, `${method} ${route(p)}`)
}

export function scanned(what = 'local'): void {
  bump(scans, what)
}

export function configure(on: boolean): void {
  enabled = !!on
}

export function isEnabled(): boolean {
  return enabled
}

function ours(): string[] {
  try {
    return fs.readdirSync(perfDir()).filter((n) => n.endsWith('.jsonl')).sort()
  } catch {
    return []
  }
}

/** Vide le journal (Réglages) : seulement nos fichiers. */
export function clear(): number {
  let gone = 0
  for (const n of ours()) {
    if (FILE.test(n)) {
      fs.rmSync(path.join(perfDir(), n))
      gone += 1
    }
  }
  return gone
}

export function usage() {
  const files = ours()
  const size = files.reduce((s, n) => s + fs.statSync(path.join(perfDir(), n)).size, 0)
  const days = [...new Set(files.filter((n) => n.includes('-')).map((n) => n.slice(0, -6).split('-').slice(1).join('-')))].sort()
  return {
    enabled,
    files: files.length,
    bytes: size,
    mb: Math.round((size / (1024 * 1024)) * 100) / 100,
    warn_mb: WARN_MB,
    since: days[0] ?? null,
    keep_days: KEEP_DAYS,
    path: 'data/perf/',
  }
}

/** Une opération lourde vient de finir en `took` secondes. */
export function timed(op: string, took: number, detail: Record<string, unknown> = {}): void {
  if (took >= ASLEEP) {
    if (enabled) {
      try {
        append('server', { kind: 'asleep', op, took_s: Math.round(took * 10) / 10, ...detail })
      } catch {
        /* rien */
      }
    }
    return
  }
  const [n, total, worst] = timedOps.get(op) || [0, 0, 0]
  timedOps.set(op, [n + 1, total + took, Math.max(worst, took)])
  if (enabled && took >= (SLOW[op] ?? Infinity)) {
    try {
      append('server', { kind: 'slow', op, took_s: Math.round(took * 100) / 100, ...detail })
    } catch {
      /* rien */
    }
  }
}

function isoSeconds(d = new Date()): string {
  return `${store.today(d)}T${d.toTimeString().slice(0, 8)}`
}

/** Ajoute une ligne au fichier du jour de `source`. */
export function append(source: unknown, rec: unknown): boolean {
  if (typeof source !== 'string' || !SOURCES.has(source) || !rec || typeof rec !== 'object' || Array.isArray(rec))
    throw new Error('mesure refusée')
  if (!enabled) return false
  const line = JSON.stringify({ t: isoSeconds(), ...(rec as object) })
  if (line.length > MAX_LINE) throw new Error('mesure trop grosse')
  fs.mkdirSync(perfDir(), { recursive: true })
  fs.appendFileSync(path.join(perfDir(), `${source}-${store.today()}.jsonl`), line + '\n')
  return true
}

/** Supprime les fichiers de plus de KEEP_DAYS jours (seulement les nôtres). */
export function prune(today: Date = new Date()): number {
  const limit = store.today(new Date(today.getTime() - KEEP_DAYS * 86400 * 1000))
  let gone = 0
  for (const n of ours()) {
    const m = FILE.exec(n)
    if (m && m[2] < limit) {
      fs.rmSync(path.join(perfDir(), n))
      gone += 1
    }
  }
  return gone
}

type Stats = { calls: number; hits: number }
type Prev = [number, number, Stats]

const cpuSeconds = () => {
  const u = process.cpuUsage()
  return (u.user + u.system) / 1e6
}

/** Une mesure du serveur. `prev` = (heure, temps CPU, stats GitHub) de la précédente. */
export function sample(githubStats: Stats, prev: Prev): [Record<string, unknown>, Prev] {
  const now = Date.now() / 1000
  const cpu = cpuSeconds()
  const reqs = Object.fromEntries(requests)
  const sc = Object.fromEntries(scans)
  const ops = Object.fromEntries(
    [...timedOps].map(([k, [n, total, worst]]) => [k, { n, avg_s: Math.round((total / n) * 100) / 100, max_s: Math.round(worst * 100) / 100 }]),
  )
  requests = new Map()
  scans = new Map()
  timedOps = new Map()
  const [pNow, pCpu, pGh] = prev
  const wall = Math.max(1e-6, now - pNow)
  const rec = {
    kind: 'sample',
    rss_mb: Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10,
    cpu_pct: Math.round(((100 * (cpu - pCpu)) / wall) * 100) / 100,
    github_calls: githubStats.calls - pGh.calls,
    github_304: githubStats.hits - pGh.hits,
    local_scans: (sc.local as number) || 0,
    ops,
    requests: reqs,
  }
  return [rec, [now, cpu, { ...githubStats }]]
}

/** `githubStats()` → {calls, hits} cumulés, tous comptes. */
export function start(githubStats: () => Stats): void {
  try {
    prune()
    append('server', { kind: 'event', event: 'start', pid: process.pid })
  } catch (e) {
    console.error(`✗ journal de perf : ${e}`)
  }
  let prev: Prev = [Date.now() / 1000, cpuSeconds(), { ...githubStats() }]
  let day = store.today()
  setInterval(() => {
    try {
      const [rec, next] = sample(githubStats(), prev)
      prev = next
      append('server', rec)
      if (store.today() !== day) {
        day = store.today()
        prune()
      }
    } catch (e) {
      console.error(`✗ journal de perf : ${e}`)
    }
  }, EVERY * 1000).unref()
}
