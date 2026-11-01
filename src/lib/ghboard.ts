/** Données GitHub servies par le backend Python (`GET /api/github`). */
import { sameOr, usePageVisible } from './visible'
import { useCallback, useEffect, useRef, useState } from 'react'
import { shown } from './errors'

export type CiState = 'pass' | 'fail' | 'pending' | 'unknown'

export type Ci = {
  state: CiState
  label: string
  total: number
  checks: { name: string; state: CiState; icon: string; url: string }[]
}

export type Branch = {
  repo: string
  name: string
  url: string
  base: string
  date: string
  ahead: number
  merged: boolean
  role: 'creator' | 'contributor'
  creator: string | null
  creator_src: 'pr' | 'commit' | 'tip'
  last_author: string | null
  authors: string[]
  pr: { number: number; url: string; author: string | null; merged: boolean } | null
}

export type Pr = {
  repo: string
  number: number
  title: string
  url: string
  branch?: string
  created_at?: string
  merged_at?: string
  version?: string | null
  upstream?: boolean
  ci: Ci
}

export type Run = { repo: string; id: number; workflow: string; title: string; branch: string; url: string; ci: Ci }

export type Gate = { cls: 'ready' | 'running' | 'blocked' | 'open'; icon: string; title: string; detail: string }

export type VersionGroup = { version: string; items: Pr[]; gate?: Gate | null }

export type GithubData = {
  enabled: boolean
  error?: string | null
  user: string
  users: string[]
  updated_at: number
  building: boolean
  auto_refresh: number
  branches: { active: Branch[]; stale: Branch[] }
  prs: Pr[]
  merged: Pr[]
  /** Workflows en cours sur les repos suivis : vide la plupart du temps. */
  running: Run[]
  renovate: {
    upstream_open: Pr[]
    upstream_merged: Pr[]
    open_groups: VersionGroup[]
    merged_groups: VersionGroup[]
    gate: (Gate & { version: string | null }) | null
    open_count: number
  }
  stats: { calls: number; hits: number; errors: number }
  /** Retraits de dépôts disparus par le serveur : la page relit alors la config. */
  repos_removed?: number
  /** Compte affiché, et tous les comptes configurés (sélecteur). */
  account?: string
  accounts?: GhAccount[]
}

export type GhAccount = {
  id: string
  label: string
  login: string | null
  avatar: string | null
  ok: boolean
  enabled: boolean
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

/**
 * Interroge le backend à intervalle régulier. On NE suspend PAS le polling quand
 * l'onglet est caché : le navigateur throttle lui-même les timers en
 * arrière-plan, et côté serveur le cache ETag rend ces cycles gratuits en quota
 * GitHub. Les notifications, elles, ne dépendent plus de cette boucle — elles
 * sortent du journal (`lib/events.ts`), alimenté par le serveur.
 */
const PAUSE_KEY = 'homedash:gh-paused'
/** Compte affiché : une préférence d'affichage, par navigateur. */
const ACCOUNT_KEY = 'homedash:gh-account'

/**
 * `foreground` : on regarde des données GitHub (onglet GitHub, ou Raccourcis et
 * sa carte Repos) → cadence `auto_refresh` ; sinon une fois par minute (le
 * serveur relit de toute façon GitHub pour le journal et la cloche).
 */
export function useGithub(foreground = true): {
  data: GithubData | null
  error: string | null
  refresh: (section?: string) => void
  setUser: (login: string) => void
  /** Change le compte affiché. Les autres continuent d'être suivis côté serveur. */
  setAccount: (id: string) => void
  paused: boolean
  togglePause: () => void
  /** 'all' | nom de section | null — ce qui est en train d'être rafraîchi. */
  busyScope: string | null
} {
  const [data, setData] = useState<GithubData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number | null>(null)
  // Demande locale en cours : sans ça, un clic sur ↻ n'affiche rien jusqu'au
  // prochain sondage, soit jusqu'à 15 s de silence après le clic.
  const [pending, setPending] = useState<string | null>(null)
  const [account, setAccountState] = useState<string>(() => {
    try {
      return localStorage.getItem(ACCOUNT_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const visible = usePageVisible()
  const lastText = useRef('')
  const q = account ? `account=${encodeURIComponent(account)}` : ''
  const [paused, setPaused] = useState(() => {
    try {
      return localStorage.getItem(PAUSE_KEY) === 'on'
    } catch {
      return false
    }
  })

  const load = useCallback(async () => {
    try {
      const next = await get<GithubData>(`api/github${q ? `?${q}` : ''}`)
      setError(null)
      setData((prev) => sameOr(prev, next, lastText))
      if (!next.building) setPending(null)
      return next
    } catch (e) {
      setError(shown('GitHub', e))
      return null
    }
  }, [q])

  useEffect(() => {
    // Page cachée : on ne sonde plus (le serveur relit GitHub de lui-même, plus
    // lentement, pour le journal) ; au retour, un tick tout de suite.
    if (!visible) return
    let alive = true
    const tick = async () => {
      const next = await load()
      if (!alive) return
      if (paused) return // en pause : plus de tick programmé, le serveur reste au repos
      // pendant un fetch serveur, on repasse vite pour afficher le résultat
      const auto = Math.max(5, next?.auto_refresh ?? 15)
      const every = next?.building ? 3000 : (foreground ? auto : Math.max(auto, 60)) * 1000
      timer.current = window.setTimeout(tick, every)
    }
    void tick()
    return () => {
      alive = false
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [load, paused, visible, foreground])

  const togglePause = useCallback(() => {
    setPaused((p) => {
      const next = !p
      try {
        localStorage.setItem(PAUSE_KEY, next ? 'on' : 'off')
      } catch {
        /* stockage indisponible */
      }
      return next
    })
  }, [])

  /** Sans argument : tout. Avec : une seule section, comme le ↻ d'une carte. */
  const refresh = useCallback(
    (section?: string) => {
      setPending(section ?? 'all')      // retour visuel immédiat
      void fetch('api/github/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(section ? { section } : {}), ...(account ? { account } : {}) }),
      })
        .then(() => load())
        .catch(() => setPending(null))
    },
    [load, account],
  )

  const setUser = useCallback(
    (login: string) => {
      setPending('all')
      void fetch(`api/github/user/${encodeURIComponent(login)}${q ? `?${q}` : ''}`, { method: 'POST' })
        .then(() => load())
        .catch(() => setPending(null))
    },
    [load, q],
  )

  const setAccount = useCallback((id: string) => {
    setAccountState(id)
    setData((d) => (d ? { ...d, building: true } : d)) // les cartes de l'autre compte s'estompent
    setPending('all')
    try {
      localStorage.setItem(ACCOUNT_KEY, id)
    } catch {
      /* stockage indisponible */
    }
  }, [])

  const busyScope = pending ?? (data?.building ? 'all' : null)

  return { data, error, refresh, setUser, setAccount, paused, togglePause, busyScope }
}

export function ago(ts: number): string {
  if (!ts) return 'jamais'
  const s = Math.round(Date.now() / 1000 - ts)
  if (s < 60) return `il y a ${s}s`
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`
  return `il y a ${Math.round(s / 3600)} h`
}
