/**
 * Résumé du journal de performance (data/perf/, voir perflog.ts), jour par jour.
 *
 * Servi à la page (Réglages → Aide → Journal de performance) et imprimé par
 * `scripts/perf-report.mjs`.
 */

import fs from 'node:fs'
import path from 'node:path'

import { ASLEEP } from './perflog.ts'

type Row = Record<string, any>

function readRows(p: string): Row[] {
  let text: string
  try {
    text = fs.readFileSync(p, 'utf-8')
  } catch {
    return []
  }
  const out: Row[] = []
  for (const line of text.split('\n')) {
    if (!line) continue
    try {
      out.push(JSON.parse(line))
    } catch {
      /* ligne tronquée (arrêt brutal) : ignorée */
    }
  }
  return out
}

const nums = (xs: unknown[]) => xs.filter((x): x is number => typeof x === 'number')
const avg = (xs: unknown[]) => {
  const n = nums(xs)
  return n.length ? n.reduce((a, b) => a + b, 0) / n.length : 0
}
const top = (xs: unknown[]) => {
  const n = nums(xs)
  return n.length ? Math.max(...n) : 0
}
const r1 = (x: number) => Math.round(x * 10) / 10
const r2 = (x: number) => Math.round(x * 100) / 100
const when = (t: unknown) => (typeof t === 'string' && t.length >= 16 ? t.slice(11, 16) : '?')

function counter(): Map<string, number> {
  return new Map()
}
function add(c: Map<string, number>, k: string, n = 1) {
  c.set(k, (c.get(k) || 0) + n)
}
function mostCommon(c: Map<string, number>, n?: number): [string, number][] {
  const all = [...c].sort((a, b) => b[1] - a[1])
  return n === undefined ? all : all.slice(0, n)
}

function server(rows: Row[]) {
  const samples = rows.filter((r) => r.kind === 'sample')
  const ops = new Map<string, [number, number, number]>()
  const routes = counter()
  for (const s of samples) {
    for (const [k, o] of Object.entries((s.ops || {}) as Record<string, Row>)) {
      const cur = ops.get(k) || [0, 0, 0]
      cur[0] += o.n || 0
      cur[1] += (o.avg_s || 0) * (o.n || 0)
      cur[2] = Math.max(cur[2], o.max_s || 0)
      ops.set(k, cur)
    }
    for (const [k, n] of Object.entries((s.requests || {}) as Record<string, number>)) add(routes, k, n)
  }
  const slow = rows.filter((r) => r.kind === 'slow' && (r.took_s || 0) < ASLEEP)
  const asleep = rows.filter((r) => r.kind === 'asleep' || (r.kind === 'slow' && (r.took_s || 0) >= ASLEEP))
  return {
    samples: samples.length,
    mem_mb: Math.round(avg(samples.map((s) => s.rss_mb))),
    mem_peak_mb: Math.round(top(samples.map((s) => s.rss_mb))),
    cpu: r1(avg(samples.map((s) => s.cpu_pct))),
    cpu_peak: r1(top(samples.map((s) => s.cpu_pct))),
    github_calls: samples.reduce((a, s) => a + (s.github_calls || 0), 0),
    github_304: samples.reduce((a, s) => a + (s.github_304 || 0), 0),
    local_scans: samples.reduce((a, s) => a + (s.local_scans || 0), 0),
    ops: [...ops].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([op, [n, total, worst]]) => ({ op, n, avg_s: r2(n ? total / n : 0), max_s: r2(worst) })),
    slow: slow.map((r) => ({ at: when(r.t), op: r.op, took_s: r.took_s })),
    asleep: asleep.map((r) => ({ at: when(r.t), op: r.op, took_s: r.took_s })),
    routes: mostCommon(routes, 6).map(([route, n]) => ({ route, n })),
  }
}

function app(rows: Row[], pageRows: Row[]) {
  const samples = rows.filter((r) => r.kind === 'sample')
  const per = new Map<string, Row[]>()
  for (const s of samples) {
    for (const t of (s.tabs || []) as Row[]) {
      let name = t.tab || t.host || '?'
      if (t.account) name += ` (${t.account})`
      per.set(name, [...(per.get(name) || []), t])
    }
  }
  const loads = new Map<string, unknown[]>()
  for (const r of pageRows) {
    if (r.kind === 'event' && r.event === 'load') {
      const k = r.tab || r.host || '?'
      loads.set(k, [...(loads.get(k) || []), r.ms])
    }
  }
  const tabs = [...per].map(([name, ts]) => {
    const ms = loads.get(name.split(' (')[0]) || []
    return {
      tab: name,
      mb: Math.round(avg(ts.map((t) => t.mb))),
      peak_mb: Math.round(top(ts.map((t) => t.mb))),
      cpu: r1(avg(ts.map((t) => t.cpu))),
      seen: ts.length,
      load_s: ms.length ? r1(avg(ms) / 1000) : null,
      loads: ms.length,
    }
  })
  // Les plus gourmands sur la journée (moyenne × présence).
  tabs.sort((a, b) => b.mb * b.seen - a.mb * a.seen)
  const spikes = rows
    .filter((r) => r.kind === 'spike')
    .map((sp) => {
      const t0: string = sp.t || ''
      const at = Date.parse(t0)
      const before = Number.isNaN(at)
        ? []
        : pageRows.filter((p) => {
            if (p.kind !== 'event') return false
            const d = at - Date.parse(p.t || t0)
            return d >= 0 && d <= 90_000
          })
      return {
        at: when(t0),
        reason: sp.reason,
        grew_mb: sp.grew_mb || 0,
        total_mb: sp.total_mb,
        cpu: sp.cpu,
        tabs: [...((sp.tabs || []) as Row[])]
          .sort((a, b) => (b.mb || 0) - (a.mb || 0))
          .slice(0, 3)
          .map((t) => ({ tab: t.tab, mb: t.mb, cpu: t.cpu })),
        before: before.map((p) => `${p.event} ${p.tab || p.host || ''}`.trim()).slice(-12),
      }
    })
  const events = counter()
  for (const r of rows) if (r.kind === 'event') add(events, String(r.event))
  const actions = counter()
  for (const r of pageRows) if (r.kind === 'event') add(actions, String(r.event))
  return {
    samples: samples.length,
    mem_mb: Math.round(avg(samples.map((s) => s.total_mb))),
    mem_peak_mb: Math.round(top(samples.map((s) => s.total_mb))),
    cpu: r1(avg(samples.map((s) => s.cpu))),
    cpu_peak: r1(top(samples.map((s) => s.cpu))),
    page_mb: Math.round(avg(samples.map((s) => s.page_mb))),
    tabs,
    spikes,
    events: Object.fromEntries(events),
    actions: Object.fromEntries(mostCommon(actions)),
  }
}

export function daysAvailable(perfDir: string): string[] {
  try {
    return [
      ...new Set(
        fs
          .readdirSync(perfDir)
          .filter((n) => n.endsWith('.jsonl') && n.includes('-'))
          .map((n) => n.slice(0, -6).split('-').slice(1).join('-')),
      ),
    ].sort()
  } catch {
    return []
  }
}

const isoDay = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export type DayReport = { day: string; server: ReturnType<typeof server>; app: ReturnType<typeof app> }

/** Les `days` derniers jours ayant des mesures, du plus récent au plus ancien. */
export function report(perfDir: string, days = 7): DayReport[] {
  const first = isoDay(new Date(Date.now() - (days - 1) * 86400 * 1000))
  const out: DayReport[] = []
  for (const day of daysAvailable(perfDir).reverse()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < first) continue
    const load = (src: string) => readRows(path.join(perfDir, `${src}-${day}.jsonl`))
    out.push({ day, server: server(load('server')), app: app(load('app'), load('page')) })
  }
  return out
}

const pad = (s: unknown, n: number, right = false) => (right ? String(s).padStart(n) : String(s).padEnd(n))

/** Le même résumé en texte (script, « Copier pour une issue »). */
export function text(daysReport: DayReport[]): string {
  const lines: string[] = []
  for (const r of [...daysReport].reverse()) {
    const s = r.server
    const a = r.app
    lines.push(`## ${r.day}`, 'Serveur')
    if (s.samples) {
      lines.push(`  mémoire ${s.mem_mb} Mo (pic ${s.mem_peak_mb}), CPU ${s.cpu} % (pic ${s.cpu_peak}), ${s.samples} mesures`)
      lines.push(
        `  GitHub ${s.github_calls} appels, plus ${s.github_304} « rien de neuf » (304, gratuits) · Local ${s.local_scans} scans du disque`,
      )
      for (const o of s.ops)
        lines.push(`  ${pad(o.op, 9)} ${pad(o.n, 5, true)} fois, ${o.avg_s.toFixed(2)} s en moyenne, pire ${o.max_s.toFixed(2)} s`)
      for (const o of s.slow.slice(0, 10)) lines.push(`  ⚠ lent à ${o.at} : ${o.op} ${o.took_s} s`)
      if (s.slow.length > 10) lines.push(`  … et ${s.slow.length - 10} autres opérations lentes`)
      if (s.asleep.length) lines.push('  mis à part (machine en veille ?) : ' + s.asleep.map((o) => `${o.op} à ${o.at}`).join(', '))
      if (s.routes.length) lines.push('  routes les plus sondées : ' + s.routes.map((x) => `${x.route} ×${x.n}`).join(', '))
    } else {
      lines.push('  (aucune mesure)')
    }
    lines.push('Appli de bureau')
    if (a.samples) {
      lines.push(
        `  total ${a.mem_mb} Mo (pic ${a.mem_peak_mb}), CPU ${a.cpu} % (pic ${a.cpu_peak}), page homedash ${a.page_mb} Mo, ${a.samples} mesures`,
      )
      if (a.tabs.length) {
        lines.push('  par onglet (mémoire moyenne / pic, CPU moyen, chargement moyen) :')
        for (const t of a.tabs) {
          const load = t.load_s !== null ? `  ${t.load_s} s ×${t.loads}` : ''
          lines.push(`    ${pad(t.tab, 28)} ${pad(t.mb, 5, true)} / ${pad(t.peak_mb, 5, true)} Mo  ${pad(t.cpu, 5, true)} %${load}`)
        }
      }
      const ev = Object.entries(a.events)
      if (ev.length) lines.push('  appli : ' + ev.map(([e, n]) => `${e} ×${n}`).join(', '))
      for (const sp of a.spikes)
        lines.push(
          `  ⚠ pic à ${sp.at} (${sp.reason}, +${sp.grew_mb} Mo) : ${sp.total_mb} Mo, CPU ${sp.cpu} % — ` +
            sp.tabs.map((t) => `${t.tab} ${t.mb} Mo`).join(', ') +
            (sp.before.length ? ` — juste avant : ${sp.before.join(', ')}` : ''),
        )
    } else {
      lines.push("  (aucune mesure de l'appli : journal coupé, ou appli de bureau pas lancée)")
    }
    const act = Object.entries(a.actions)
    if (act.length) {
      lines.push('Page')
      lines.push('  actions : ' + act.map(([e, n]) => `${e} ×${n}`).join(', '))
    }
    lines.push('')
  }
  return lines.join('\n')
}
