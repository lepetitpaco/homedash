/**
 * Basecamp servi par le backend Python (`GET /api/basecamp`), en lecture seule :
 * la page n'affiche que des liens, rien n'est jamais modifié dans Basecamp.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export type BcStep = { title: string; url: string; due_on: string | null; completed: boolean }

export type BcTask = {
  id: number
  /** `card` = carte d'un tableau kanban, rangée par colonne. */
  kind: 'todo' | 'card'
  column_id: number | null
  /** Absent si le tableau n'a pas pu être lu : on range alors sous `list` (nom de colonne). */
  board_id?: number
  project_id: number | null
  title: string
  url: string
  type: string
  project: string
  project_url: string
  list: string
  list_url: string
  due_on: string | null
  starts_on: string | null
  comments: number
  steps: BcStep[]
}

export type BcNotif = {
  id: number
  title: string
  url: string
  project: string
  section: string
  type: string
  creator: string
  excerpt: string
  unread_count: number
  ts: number
}

export type BcColumn = { id: number; title: string; type: string; color: string | null }

export type BcBoard = { title: string; url: string; columns: BcColumn[] }

export type BcData = {
  configured: boolean
  enabled: boolean
  account: string
  app_href: string
  name: string
  updated_at: number
  building: boolean
  error: string | null
  every: number
  tasks: { priorities: BcTask[]; others: BcTask[] }
  unreads: BcNotif[]
  /** Tableaux kanban des cartes assignées, par id : colonnes dans l'ordre du tableau. */
  boards: Record<string, BcBoard>
  /** Faux tant que la première lecture n'a pas abouti. */
  loaded: boolean
}

export type BcStatus = {
  configured: boolean
  connected: boolean
  client_id: string
  has_secret: boolean
  redirect_uri: string
  name: string
  account: string
  accounts: number
  app_href: string
  expires_at: number | null
  error: string | null
}

/**
 * Sonde même onglet fermé : la pastille de l'onglet compte les notifs non lues.
 * Le serveur lit Basecamp à son rythme (`every`) ; sonder ne coûte qu'un JSON.
 */
export function useBasecamp(foreground: boolean) {
  const [data, setData] = useState<BcData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pulse, setPulse] = useState(0)
  const timer = useRef<number | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('api/basecamp', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const next = (await res.json()) as BcData
      setError(null)
      setData(next)
      return next
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    }
  }, [])

  useEffect(() => {
    let alive = true
    const tick = async () => {
      const next = await load()
      if (!alive) return
      const every = next?.building || (next?.enabled && !next.loaded) ? 2000 : (foreground ? 15 : 60) * 1000
      timer.current = window.setTimeout(tick, every)
    }
    void tick()
    return () => {
      alive = false
      if (timer.current) window.clearTimeout(timer.current)
    }
    // `pulse` relance la boucle après un ↻ (règle commune à tous les sondages).
  }, [load, foreground, pulse])

  const refresh = useCallback(() => {
    setData((d) => (d ? { ...d, building: true } : d))
    void fetch('api/basecamp/refresh', { method: 'POST' })
      .catch(() => undefined)
      .finally(() => setPulse((p) => p + 1))
  }, [])

  return { data, error, refresh }
}

// ── Réglages ────────────────────────────────────────────────────────────────
async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init })
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`)
  return body as T
}

const json = (method: string, payload: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
})

export const bcStatus = () => call<BcStatus>('api/basecamp/auth')
export const bcSetApp = (client_id: string, client_secret: string, redirect_uri: string) =>
  call<BcStatus>('api/basecamp/app', json('PUT', { client_id, client_secret, redirect_uri }))
export const bcForget = () => call<BcStatus>('api/basecamp/app', { method: 'DELETE' })
export const bcAuthorize = () => call<{ url: string }>('api/basecamp/authorize', { method: 'POST' })
export const bcCode = (code: string) => call<BcStatus>('api/basecamp/code', json('POST', { code }))
export const bcDisconnect = () => call<BcStatus>('api/basecamp/token', { method: 'DELETE' })

/**
 * Adresse de retour (« site de callback »). Launchpad refuse `localhost` et
 * `127.0.0.1` : on déclare une adresse publique, Basecamp y renvoie le
 * navigateur avec `?code=…`, et on recolle cette adresse ici. Le domaine est au
 * choix (le sien, idéalement : le code n'arrive alors que chez soi) ; le format
 * est fixe : `https://<domaine>/oauth`. Par défaut example.com, domaine réservé
 * aux exemples (géré par l'IANA).
 */
export const DEFAULT_CALLBACK_SITE = 'example.com'
export const CALLBACK_PATH = '/oauth'
export const ABOUT_URL = 'https://github.com/davidgennaoui/homedash'

export function redirectFor(site: string): string {
  return `https://${site}${CALLBACK_PATH}`
}

/**
 * Domaine saisi → domaine propre, ou `null` s'il n'est pas utilisable. Accepte
 * une adresse collée entière (`https://monsite.fr/truc` → `monsite.fr`). Vide =
 * le défaut.
 */
export function callbackSite(input: string): string | null {
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .split(/[/?#]/)[0]
    .replace(/\.$/, '')
  if (!host) return DEFAULT_CALLBACK_SITE
  if (host === 'localhost' || host.endsWith('.localhost') || /^[\d.]+$/.test(host) || host.includes(':')) return null
  return /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host) ? host : null
}

/** Domaine d'une adresse de retour enregistrée, pour pré-remplir le champ. */
export function siteOf(redirect: string): string {
  try {
    return new URL(redirect).hostname
  } catch {
    return ''
  }
}

/** Clé d'un projet : son id, sinon son nom. Sert aussi pour `basecamp.hidden`. */
export function projectKey(t: BcTask): string {
  return String(t.project_id ?? t.project)
}

/** Tâches en retard dans les projets affichés : la pastille de l'onglet. */
export function lateCount(data: BcData | null, hidden: string[]): number {
  if (!data?.enabled) return 0
  const off = new Set(hidden)
  return [...data.tasks.priorities, ...data.tasks.others].filter(
    (t) => !off.has(projectKey(t)) && dueOf(t.due_on)?.rank === 0,
  ).length
}

// ── Échéances ───────────────────────────────────────────────────────────────
export type Due = { cls: 'is-fail' | 'is-pending' | 'is-unknown'; label: string; rank: number }

const DAY = 86_400_000

function localDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** `2026-10-20` → badge, comparé au jour local (Basecamp donne une date sans heure). */
export function dueOf(due: string | null): Due | null {
  if (!due) return null
  const [y, m, d] = due.split('-').map(Number)
  if (!y || !m || !d) return null
  const diff = Math.round((new Date(y, m - 1, d).getTime() - localDay(new Date())) / DAY)
  if (diff < 0) return { cls: 'is-fail', label: diff === -1 ? 'hier' : `retard ${-diff} j`, rank: 0 }
  if (diff === 0) return { cls: 'is-pending', label: "aujourd'hui", rank: 1 }
  if (diff === 1) return { cls: 'is-unknown', label: 'demain', rank: 2 }
  const label = new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    ...(diff > 300 ? { year: 'numeric' } : {}),
  })
  return { cls: 'is-unknown', label, rank: 3 }
}
