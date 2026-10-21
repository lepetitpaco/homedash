/** Version installée, changelog et mise à jour disponible (`GET /api/changelog`). */
import { useCallback, useEffect, useRef, useState } from 'react'
import { sameOr } from './visible'

export type ChangelogEntry = {
  version: string
  date: string
  items: string[]
  /** Version de l'appli de bureau que demande cette version (ligne `Appli de bureau : X.Y.Z`). */
  desktop?: string
}

/** `1.10.0` > `1.9.3`. */
export function newerThan(a: string, b: string): boolean {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0)
  return false
}

export type Changelog = {
  current: string
  entries: ChangelogEntry[]
  latest: string | null
  /** Versions publiées sur GitHub plus récentes que celle installée. */
  incoming: ChangelogEntry[]
  update: boolean
  command: string
  /** Variante PowerShell (Windows) ; absente d'un serveur plus ancien. */
  command_windows?: string
  repo: string
  /** Commande pour construire l'appli de bureau sur la machine (Mac ; Windows à part). */
  desktop_command?: string
  desktop_command_windows?: string
  checked_at: number | null
  error: string | null
}

const POLL = 60_000

/**
 * Le serveur vérifie GitHub toutes les 10 min ; la page relit son verdict chaque
 * minute (une requête locale), sans se redessiner si rien n'a changé.
 */
export function useChangelog() {
  const [data, setData] = useState<Changelog | null>(null)
  const [busy, setBusy] = useState(false)
  const last = useRef('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('api/changelog', { cache: 'no-store' })
      if (res.ok) {
        const next = (await res.json()) as Changelog
        setData((prev) => sameOr(prev, next, last))
      }
    } catch {
      /* serveur injoignable : on garde l'état précédent */
    }
  }, [])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), POLL)
    return () => window.clearInterval(id)
  }, [load])

  const check = useCallback(async () => {
    setBusy(true)
    try {
      const res = await fetch('api/changelog/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (res.ok) setData((await res.json()) as Changelog)
    } finally {
      setBusy(false)
    }
  }, [])

  return { data, busy, check }
}
