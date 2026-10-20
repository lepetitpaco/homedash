/**
 * Journal de performance (Réglages → Affichage, désactivé par défaut) : les
 * actions de la page, écrites par le serveur dans data/perf/ (perflog.py).
 * Des noms d'onglets et de domaines, jamais d'adresse complète ni de contenu.
 */
import { desktop } from './desktop'

let on = false

/** Suivre `ui.perfLog` : éteint, rien ne part. */
export function setPerfLog(enabled: boolean) {
  on = enabled
}

export function perfEvent(event: string, detail: Record<string, unknown> = {}) {
  if (!on) return
  void fetch('api/perf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'page', kind: 'event', event, client: desktop ? 'app' : 'browser', ...detail }),
    keepalive: true,
  }).catch(() => undefined)
}

export type PerfUsage = {
  enabled: boolean
  files: number
  bytes: number
  mb: number
  warn_mb: number
  since: string | null
  keep_days: number
  path: string
}

export async function perfUsage(): Promise<PerfUsage> {
  const res = await fetch('api/perf', { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as PerfUsage
}

export async function perfClear(): Promise<PerfUsage> {
  const res = await fetch('api/perf', { method: 'DELETE' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as PerfUsage
}
