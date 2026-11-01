import { useEffect, useRef, useState } from 'react'
import type { DockerLink } from './dockerTabs'
import { usePageVisible } from './visible'

export type DockerState = { available: boolean; links: DockerLink[] }

const EMPTY: DockerState = { available: false, links: [] }
const POLL_MS = 30_000
const RETRY_MS = 2_000

/** Lit `/api/docker` tant que `enabled` ; `probe` : lecture demandée depuis Réglages, avant enregistrement. */
export function useDocker(enabled: boolean, probe = false): DockerState & { loaded: boolean } {
  const [state, setState] = useState<DockerState>(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const cache = useRef('')
  const visible = usePageVisible()
  useEffect(() => {
    if (!enabled) {
      setState(EMPTY)
      setLoaded(false)
      cache.current = ''
      return
    }
    if (!visible) return
    let gone = false
    let again = 0
    const load = async (first = false) => {
      try {
        const res = await fetch(`/api/docker${probe ? '?probe=1' : ''}`)
        const next = (res.ok ? await res.json() : EMPTY) as DockerState
        // Pas de setState si rien n'a changé : le sondage ne redessine pas la page.
        const text = JSON.stringify(next)
        if (!gone && text !== cache.current) {
          cache.current = text
          setState(next)
        }
        // Option à peine cochée : la page peut demander avant la fin de l'écriture de la config.
        if (first && !next.available && !gone) again = window.setTimeout(() => void load(), RETRY_MS)
      } catch {
        if (!gone) {
          cache.current = ''
          setState(EMPTY)
        }
      }
      if (!gone) setLoaded(true)
    }
    void load(true)
    const timer = window.setInterval(() => void load(), POLL_MS)
    return () => {
      gone = true
      window.clearInterval(timer)
      window.clearTimeout(again)
    }
  }, [enabled, probe, visible])
  return { ...state, loaded }
}
