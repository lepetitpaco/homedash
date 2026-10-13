import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchConfig, saveConfig } from '../lib/api'
import { normalizeConfig } from '../lib/config'
import type { Config } from '../types'

export type SaveState = { kind: 'idle' | 'saving' | 'saved' } | { kind: 'error'; message: string }

/**
 * config.json : chargement, version normalisée, et écriture avec son témoin
 * (toast « enregistrement… » / « ✓ enregistré » / erreur).
 */
export function useConfigState() {
  const [raw, setRaw] = useState<Config | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' })

  useEffect(() => {
    fetchConfig()
      .then(setRaw)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const cfg = useMemo(() => (raw ? normalizeConfig(raw) : null), [raw])

  // --- persistance ---------------------------------------------------------
  const persist = useCallback((next: Config) => {
    setRaw(next)
    setSaveState({ kind: 'saving' })
    saveConfig(next)
      .then(() => {
        setSaveState({ kind: 'saved' })
        window.setTimeout(() => setSaveState((s) => (s.kind === 'saved' ? { kind: 'idle' } : s)), 1600)
      })
      .catch((e: unknown) =>
        setSaveState({ kind: 'error', message: e instanceof Error ? e.message : String(e) }),
      )
  }, [])

  /** Relit config.json : après une écriture faite par le serveur (comptes, connexion). */
  const reload = useCallback(() => void fetchConfig().then(setRaw).catch(() => undefined), [])

  return { raw, cfg, error, saveState, setSaveState, persist, reload }
}
