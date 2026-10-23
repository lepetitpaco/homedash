/**
 * Basecamp servi par le backend Python (`GET /api/basecamp`), en lecture seule :
 * la page n'affiche que des liens, rien n'est jamais modifié dans Basecamp.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { sameOr, usePageVisible } from './visible'
import { shown } from './errors'

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
  /** Issues GitHub liées aux tâches, et repos où en créer (tous comptes GitHub). */
  github?: { issues: BcIssue[]; repos: { account: string; repo: string }[] }
  /** Rapports déjà publiés sur Basecamp : id du commentaire GitHub → commentaire Basecamp. */
  posted?: Record<string, BcPosted>
}

/** Rapport publié (`url` du commentaire), ou issue écartée sans publication (`dismissed`). */
export type BcPosted = { url?: string; ts: number; dismissed?: boolean }

/** Rapport à reporter sur la tâche : commentaire `<!-- homedash:bc-report -->` de l'issue. */
export type BcReport = { id: number; url: string; body: string; html: string; author: string; ts: string }

/** Issue créée depuis une tâche : son corps porte `<!-- homedash:bc <adresse> -->`. */
export type BcIssue = {
  account: string
  /** `propriétaire/repo` */
  repo: string
  number: number
  title: string
  url: string
  state: 'open' | 'closed'
  bc_url: string
  updated_at: string
  report: BcReport | null
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
  const visible = usePageVisible()
  const lastText = useRef('')

  const load = useCallback(async (fresh: boolean) => {
    try {
      // `fresh` : onglet affiché, le serveur relit aussi les issues GitHub liées
      const res = await fetch(fresh ? 'api/basecamp?fresh=1' : 'api/basecamp', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const next = (await res.json()) as BcData
      setError(null)
      setData((prev) => sameOr(prev, next, lastText))
      return next
    } catch (e) {
      setError(shown('Basecamp', e))
      return null
    }
  }, [])

  useEffect(() => {
    let alive = true
    const tick = async () => {
      const next = await load(foreground && visible)
      if (!alive) return
      // page cachée : toutes les 5 min (la pastille du Dock passe par le journal)
      const every =
        next?.building || (next?.enabled && !next.loaded) ? 2000 : (!visible ? 300 : foreground ? 15 : 60) * 1000
      timer.current = window.setTimeout(tick, every)
    }
    void tick()
    return () => {
      alive = false
      if (timer.current) window.clearTimeout(timer.current)
    }
    // `pulse` relance la boucle après un ↻ (règle commune à tous les sondages).
  }, [load, foreground, pulse, visible])

  const refresh = useCallback(() => {
    setData((d) => (d ? { ...d, building: true } : d))
    void fetch('api/basecamp/refresh', { method: 'POST' })
      .catch(() => undefined)
      .finally(() => setPulse((p) => p + 1))
  }, [])

  /** Relit ce que le serveur sait déjà (issue tout juste créée), sans relire Basecamp. */
  const reload = useCallback(() => setPulse((p) => p + 1), [])

  return { data, error, refresh, reload }
}

// ── Recherche dans tout Basecamp ────────────────────────────────────────────
/** Résultat de la recherche Basecamp (`GET /api/basecamp/search`), ou une de mes tâches. */
export type BcFound = {
  id: number
  /** `Todo`, `Kanban::Card`, `Comment`, `Message`, `Document`… ; `mine` : une de mes tâches. */
  type: string
  title: string
  url: string
  project: string
  parent: string
  status: string
  completed: boolean
  due_on: string | null
  updated_at: string
  creator: string
  excerpt: string
  /** Tâche qui m'est assignée (déjà chargée par l'onglet Basecamp). */
  mine?: boolean
}

/** Attente après la dernière frappe avant d'interroger Basecamp (50 requêtes / 10 s au plus). */
const SEARCH_PAUSE = 350

/**
 * Recherche dans tout Basecamp au fil de la frappe : après une pause, à partir
 * de 2 caractères. Une réponse arrivée après une frappe plus récente est jetée.
 */
export function useBcSearch(query: string, enabled: boolean): { items: BcFound[]; busy: boolean } {
  const [items, setItems] = useState<BcFound[]>([])
  const [busy, setBusy] = useState(false)
  const q = query.trim()
  useEffect(() => {
    if (!enabled || q.length < 2) {
      setItems([])
      setBusy(false)
      return
    }
    let alive = true
    setBusy(true)
    const timer = window.setTimeout(() => {
      fetch(`api/basecamp/search?${new URLSearchParams({ q })}`, { cache: 'no-store' })
        .then(async (res) => {
          const out = (await res.json().catch(() => null)) as { items?: BcFound[]; error?: string } | null
          if (!res.ok) throw new Error(out?.error ?? `HTTP ${res.status}`)
          if (alive) setItems(out?.items ?? [])
        })
        .catch((e) => {
          if (!alive) return
          setItems([])
          shown('Recherche Basecamp', e) // au journal d'erreurs ; la recherche locale reste
        })
        .finally(() => alive && setBusy(false))
    }, SEARCH_PAUSE)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [q, enabled])
  return { items, busy }
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
