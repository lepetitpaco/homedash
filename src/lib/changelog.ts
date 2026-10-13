/** Version installée, changelog et mise à jour disponible (`GET /api/changelog`). */
import { useCallback, useEffect, useState } from 'react'

export type ChangelogEntry = { version: string; date: string; items: string[] }

export type Changelog = {
  current: string
  entries: ChangelogEntry[]
  latest: string | null
  /** Versions publiées sur GitHub plus récentes que celle installée. */
  incoming: ChangelogEntry[]
  update: boolean
  command: string
  repo: string
  checked_at: number | null
  error: string | null
}

const POLL = 10 * 60_000

/** Le serveur vérifie GitHub toutes les 6 h ; la page relit son verdict toutes les 10 min. */
export function useChangelog() {
  const [data, setData] = useState<Changelog | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('api/changelog', { cache: 'no-store' })
      if (res.ok) setData((await res.json()) as Changelog)
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
