import { useCallback, useEffect, useRef, useState } from 'react'
import type { FlatLink, Health } from '../types'
import { usePageVisible } from './visible'

/**
 * Ping en `no-cors` : la réponse est opaque, on ne peut pas lire le statut HTTP.
 * Une promesse résolue = le serveur a répondu quelque chose -> up.
 * Un throw (DNS, connexion refusée, timeout) -> down.
 */
async function ping(url: string, timeoutMs: number): Promise<boolean> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal, redirect: 'follow' })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export function useHealth(links: FlatLink[], intervalSec: number, timeoutMs: number) {
  const [health, setHealth] = useState<Record<string, Health>>({})
  const targets = links.filter((l) => l.check)
  // Signature stable : évite de relancer la boucle à chaque render.
  const signature = targets.map((l) => l.id).join('|')
  const targetsRef = useRef(targets)
  targetsRef.current = targets
  const timeoutRef = useRef(timeoutMs)
  timeoutRef.current = timeoutMs

  const runAll = useCallback(async () => {
    const current = targetsRef.current
    if (current.length === 0) return
    setHealth((prev) => {
      if (current.every((l) => prev[l.id])) return prev
      const next = { ...prev }
      for (const l of current) if (!next[l.id]) next[l.id] = 'checking'
      return next
    })
    // Tous les liens d'abord, puis un seul rendu, et seulement si un voyant change.
    const results = await Promise.all(current.map((l) => ping(l.url, timeoutRef.current)))
    setHealth((prev) => {
      let changed = false
      const next = { ...prev }
      current.forEach((l, i) => {
        const h: Health = results[i] ? 'up' : 'down'
        if (next[l.id] !== h) {
          next[l.id] = h
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [])

  const visible = usePageVisible()
  useEffect(() => {
    // page cachée : pas de ping (personne ne regarde les voyants)
    if (!signature || intervalSec <= 0 || !visible) return
    void runAll()
    const id = setInterval(() => void runAll(), intervalSec * 1000)
    return () => clearInterval(id)
  }, [signature, intervalSec, runAll, visible])

  return { health, refresh: runAll }
}
