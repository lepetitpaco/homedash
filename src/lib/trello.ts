/**
 * Trello servi par le backend Python (`GET /api/trello`). La page n'écrit pas
 * dans Trello : le commentaire de rapport part du serveur, au clic.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { dueOf } from './basecamp'
import { shown } from './errors'
import { sameOr, usePageVisible } from './visible'

export type TrCard = {
  id: string
  short_link: string
  title: string
  url: string
  board_id: string
  board: string
  board_url: string
  list_id: string
  list: string
  list_pos: number
  pos: number
  due: string | null
  due_complete: boolean
  comments: number
  checks: number
  checks_done: number
  /** Carte où le compte connecté est membre. Absent : on la traite comme sienne. */
  mine?: boolean
}

export type TrBoard = {
  id: string
  name: string
  url: string
  background?: string
  background_brightness?: string
  lists: { id: string; name: string; pos: number }[]
}

export type TrNotif = {
  id: string
  title: string
  url: string
  board: string
  excerpt: string
  creator: string
  ts: number
}

export type TrIssue = {
  account?: string
  repo: string
  number: number
  title: string
  url: string
  state: string
  tr_url: string
  updated_at: string
  report: { id: number; url: string; body: string; author: string; ts: string } | null
}

export type TrPosted = { url?: string; ts: number; dismissed?: boolean }

export type TrData = {
  configured: boolean
  enabled: boolean
  account: string
  username: string
  updated_at: number
  building: boolean
  error: string | null
  every: number
  cards: TrCard[]
  boards: TrBoard[]
  unreads: TrNotif[]
  loaded: boolean
  posted: Record<string, TrPosted>
  github?: { issues: TrIssue[]; repos: { account: string; repo: string }[] }
}

export type TrFound = {
  id: string
  type: string
  title: string
  url: string
  board: string
  parent: string
  due: string | null
  creator: string
  excerpt: string
  updated_at: string
  comment_id?: string | null
  mine?: boolean
}

export type TrStatus = {
  configured: boolean
  connected: boolean
  has_key: boolean
  name: string
  username: string
  error: string | null
}

/** Réglages → Trello prévient la page qu'une connexion a changé : l'onglet apparaît sans attendre. */
export const TR_CHANGED = 'homedash:trello-changed'

export function useTrello(foreground: boolean) {
  const [data, setData] = useState<TrData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pulse, setPulse] = useState(0)
  const timer = useRef<number | null>(null)
  const visible = usePageVisible()
  const lastText = useRef('')

  const load = useCallback(async (fresh: boolean) => {
    try {
      const res = await fetch(fresh ? 'api/trello?fresh=1' : 'api/trello', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const next = (await res.json()) as TrData
      setError(null)
      setData((prev) => sameOr(prev, next, lastText))
      return next
    } catch (e) {
      setError(shown('Trello', e))
      return null
    }
  }, [])

  useEffect(() => {
    let alive = true
    const tick = async () => {
      const next = await load(foreground && visible)
      if (!alive) return
      const every =
        next?.building || (next?.enabled && !next.loaded) ? 2000 : (!visible ? 300 : foreground ? 15 : 60) * 1000
      timer.current = window.setTimeout(tick, every)
    }
    void tick()
    return () => {
      alive = false
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [load, foreground, pulse, visible])

  const refresh = useCallback(() => {
    setData((d) => (d ? { ...d, building: true } : d))
    void fetch('api/trello/refresh', { method: 'POST' })
      .catch(() => undefined)
      .finally(() => setPulse((p) => p + 1))
  }, [])

  const reload = useCallback(() => setPulse((p) => p + 1), [])
  useEffect(() => {
    window.addEventListener(TR_CHANGED, reload)
    return () => window.removeEventListener(TR_CHANGED, reload)
  }, [reload])
  return { data, error, refresh, reload }
}

const SEARCH_PAUSE = 350

export function useTrSearch(query: string, enabled: boolean): { items: TrFound[] } {
  const [items, setItems] = useState<TrFound[]>([])
  const q = query.trim()
  useEffect(() => {
    if (!enabled || q.length < 2) {
      setItems([])
      return
    }
    let alive = true
    const timer = window.setTimeout(() => {
      fetch(`api/trello/search?${new URLSearchParams({ q })}`, { cache: 'no-store' })
        .then(async (res) => {
          const out = (await res.json().catch(() => null)) as { items?: TrFound[]; error?: string } | null
          if (!res.ok) throw new Error(out?.error ?? `HTTP ${res.status}`)
          if (alive) setItems(out?.items ?? [])
        })
        .catch((e) => {
          if (!alive) return
          setItems([])
          shown('Recherche Trello', e)
        })
    }, SEARCH_PAUSE)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [q, enabled])
  return { items }
}

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

export const trStatus = () => call<TrStatus>('api/trello/auth')
export const trSetKey = (api_key: string) => call<TrStatus>('api/trello/app', json('PUT', { api_key }))
export const trForget = () => call<TrStatus>('api/trello/app', { method: 'DELETE' })
export const trAuthorize = () => call<{ url: string }>('api/trello/authorize', { method: 'POST' })
export const trConnect = (token: string) => call<TrStatus>('api/trello/token', json('POST', { token }))
export const trDisconnect = () => call<TrStatus>('api/trello/token', { method: 'DELETE' })

/** Jour local `YYYY-MM-DD` d'une échéance Trello, ou null si elle est accomplie. */
export function dueDay(c: Pick<TrCard, 'due' | 'due_complete'>): string | null {
  if (!c.due || c.due_complete) return null
  const d = new Date(c.due)
  if (Number.isNaN(d.getTime())) return null
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function cardDue(c: Pick<TrCard, 'due' | 'due_complete'>) {
  return dueOf(dueDay(c))
}

const DAY = 86_400_000

/** Écart en jours (négatif = retard) par rapport à aujourd'hui, heure locale. */
export function dayDiff(c: Pick<TrCard, 'due' | 'due_complete'>): number | null {
  const due = dueDay(c)
  if (!due) return null
  const [y, m, d] = due.split('-').map(Number)
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  return Math.round((new Date(y, m - 1, d).getTime() - start) / DAY)
}

export function isSoon(c: Pick<TrCard, 'due' | 'due_complete'>, days = 7): boolean {
  const d = dayDiff(c)
  return d !== null && d <= days
}

export function lateCount(data: TrData | null, hidden: string[]): number {
  if (!data?.enabled) return 0
  const off = new Set(hidden)
  return data.cards.filter((c) => c.mine !== false && !off.has(c.board_id) && dayDiff(c) !== null && (dayDiff(c) as number) < 0).length
}
