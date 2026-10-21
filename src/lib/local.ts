/** Dépôts git locaux servis par le backend Python (`GET /api/local`). */
import { sameOr, usePageVisible } from './visible'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { shown } from './errors'

/** Ordre = urgence. `protected` et `ok` ne demandent rien. */
export type BranchState =
  | 'gone'
  | 'closed-pr'
  | 'squashed'
  | 'gone-merged'
  | 'merged'
  | 'local-only'
  | 'diverged'
  | 'unpushed'
  | 'behind'
  | 'unknown'
  | 'ok'
  | 'protected'

/** `merged`/`squash`/`pushed` = rien à perdre en supprimant. */
export type SafetyLevel = 'merged' | 'squash' | 'pushed' | 'partial' | 'local'

export type ActionKind = 'delete' | 'check' | 'keep' | 'current' | 'ref' | 'work'

export const SAFE: SafetyLevel[] = ['merged', 'squash', 'pushed']

export type LocalPr = {
  number: number
  url: string
  author: string | null
  merged: boolean
  state?: string
}

export type LocalBranch = {
  name: string
  sha: string
  short: string
  current: boolean
  protected: boolean
  upstream: string | null
  /** `refs/remotes/origin/<name>` présent sur le disque — périmé sans `--prune`. */
  remote_ref: boolean
  remote_sha: string | null
  ahead_default: number
  behind_default: number
  /** Parcours arrêté au plafond : les compteurs sont des minorants. */
  capped: boolean
  push_ahead: number | null
  push_behind: number | null
  /** `null` = repo jamais interrogé sur GitHub, on retombe sur `remote_ref`. */
  on_github: boolean | null
  date: number
  author: string
  subject: string
  pr: LocalPr | null
  state: BranchState
  advice: string
  /** Le contenu de la branche existe-t-il ailleurs ? Axe distinct de `state`. */
  safety: { level: SafetyLevel; label: string; detail: string }
  /** La conclusion, celle qu'on lit en diagonale. */
  action: { kind: ActionKind; label: string; detail: string }
  /** Drapeau `git branch` applicable, ou `null` si rien à supprimer. */
  delete: '-d' | '-D' | null
}

export type LocalCommand = {
  id: string
  label: string
  cmd: string
  hint: string
  danger?: boolean
}

export type LocalRepo = {
  path: string
  display: string
  name: string
  org: string | null
  repo: string | null
  url: string | null
  error: string | null
  default_branch: string | null
  head: string | null
  detached: boolean
  /** Le dépôt a pu être recoupé avec l'API GitHub. */
  linked: boolean
  branches: LocalBranch[]
  stashes: number
  fetched_at: number | null
  dirty: { known: boolean; count: number; capped: boolean } | null
  commands: LocalCommand[]
  counts: {
    branches: number
    deletable: number
    squashed: number
    risky: number
    unpushed: number
    /** Branches dont le contenu existe ailleurs : rien à perdre. */
    safe: number
    at_risk: number
  }
}

export type LocalData = {
  enabled: boolean
  error?: string | null
  hint?: string
  updated_at: number
  building: boolean
  took: number
  refresh: number
  /** Période de surveillance des `.git`, en secondes. 0 = surveillance coupée. */
  watch: number
  watching: boolean
  /** Ce qui a déclenché le dernier scan : « git fetch », « démarrage »… */
  trigger: string | null
  github_linked: boolean
  /** Dossiers parcourus, tels qu'affichés (`~/dev/projects`). */
  roots?: string[]
  /** Absent quand `enabled` est faux (aucun dossier configuré). */
  repos?: LocalRepo[]
  /** Commandes qui valent pour l'ensemble des dépôts. */
  global_commands: LocalCommand[]
  totals: {
    repos: number
    branches: number
    deletable: number
    squashed: number
    risky: number
    unpushed: number
    dirty: number
    safe: number
    at_risk: number
  }
}

/** Ce qui appelle une décision, par opposition aux branches sereines. */
export const CALM: BranchState[] = ['ok', 'protected']

export function isCalm(b: LocalBranch): boolean {
  return CALM.includes(b.state)
}

/**
 * Sonde le backend. Le scan est purement local (~0,2 s pour dix dépôts), donc
 * inutile de rafraîchir aussi souvent que GitHub : le serveur impose son propre
 * intervalle et le renvoie dans `refresh`.
 */
export function useLocal(foreground: boolean, onCleanup?: (d: LocalData, prev: LocalData) => void): {
  data: LocalData | null
  error: string | null
  refresh: () => void
  busy: boolean
  /** Branches supprimables, tous dépôts confondus — l'indicateur de l'interface. */
  todo: number
  /** `repo/branche` supprimables : sert à marquer les PRs mergées côté GitHub. */
  removable: Set<string>
} {
  const [data, setData] = useState<LocalData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [pulse, setPulse] = useState(0)
  const timer = useRef<number | null>(null)
  const previous = useRef<LocalData | null>(null)
  /** Garde-fou : un `building` qui ne retomberait pas ne doit pas figer le bouton. */
  const visible = usePageVisible()
  const lastText = useRef('')
  const since = useRef(0)

  const load = useCallback(async () => {
    try {
      const res = await fetch('api/local', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const next = (await res.json()) as LocalData
      setError(null)
      // Le rappel se déclenche sur la transition, jamais sur l'état : sans le
      // `previous`, ouvrir la page suffirait à faire sonner tout ce qui traîne.
      if (previous.current && onCleanup) onCleanup(next, previous.current)
      previous.current = next
      setData((prev) => sameOr(prev, next, lastText))
      if (!next.building) {
        setPending(false)
        since.current = 0
      } else {
        if (!since.current) since.current = Date.now()
        // Un scan dépasse rarement deux secondes ; au-delà de trente on rend la
        // main plutôt que de laisser un bouton tourner indéfiniment.
        if (Date.now() - since.current > 30_000) setPending(false)
      }
      return next
    } catch (e) {
      setError(shown('onglet Local', e))
      return null
    }
  }, [onCleanup])

  useEffect(() => {
    // On sonde même onglet fermé (la pastille de l'onglet Local), mais pas page
    // cachée : personne ne la voit, et le rappel de ménage passe par le journal.
    if (!visible) return
    let alive = true
    const tick = async () => {
      const next = await load()
      if (!alive) return
      // Onglet ouvert : on suit la cadence de surveillance du serveur, pour que
      // `git fetch` tapé dans un terminal se voie en quelques secondes. La
      // réponse sort du cache serveur (~1,5 ms), sonder souvent ne coûte rien.
      const veille = Math.min(60, Math.max(20, next?.refresh ?? 120))
      const vif = Math.max(2, next?.watch || 5)
      const every = next?.building ? 1200 : (foreground ? vif : veille) * 1000
      timer.current = window.setTimeout(tick, every)
    }
    void tick()
    return () => {
      alive = false
      if (timer.current) window.clearTimeout(timer.current)
    }
    // `pulse` relance la boucle : sans lui, un clic sur ↻ n'était suivi d'aucun
    // sondage avant le tick déjà programmé, soit jusqu'à deux minutes de bouton
    // qui tourne alors que le scan est fini depuis longtemps.
  }, [load, foreground, pulse, visible])

  const refresh = useCallback(() => {
    setPending(true)
    void fetch('api/local/refresh', { method: 'POST' })
      .catch(() => undefined)
      .finally(() => setPulse((p) => p + 1))
  }, [])

  const removable = useMemo(() => {
    const out = new Set<string>()
    for (const r of data?.repos ?? [])
      for (const b of r.branches) if (b.action.kind === 'delete') out.add(`${r.repo ?? r.name}/${b.name}`)
    return out
  }, [data])

  return {
    data, error, refresh, removable,
    busy: pending || !!data?.building,
    todo: (data?.totals?.deletable ?? 0) + (data?.totals?.squashed ?? 0),
  }
}

export function agoShort(ts: number | null): string {
  if (!ts) return 'jamais'
  const s = Math.round(Date.now() / 1000 - ts)
  if (s < 90) return "à l'instant"
  if (s < 5400) return `il y a ${Math.round(s / 60)} min`
  if (s < 172800) return `il y a ${Math.round(s / 3600)} h`
  return `il y a ${Math.round(s / 86400)} j`
}
