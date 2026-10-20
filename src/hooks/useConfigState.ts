import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { confirmDialog } from '../components/ConfirmHost'
import { ConfigConflict, fetchConfig, saveConfig } from '../lib/api'
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

  // Version de config.json sur laquelle la page travaille : renvoyée à chaque
  // écriture, le serveur refuse si le fichier a changé entre-temps (autre
  // onglet, écriture du serveur) au lieu d'écraser l'autre en silence.
  const version = useRef<string | null>(null)
  // Écritures en file : la suivante part avec la version rendue par la
  // précédente, sinon deux clics rapprochés se refuseraient l'un l'autre.
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  const load = useCallback(
    () =>
      fetchConfig().then(({ config, version: v }) => {
        version.current = v
        setRaw(config)
      }),
    [],
  )

  useEffect(() => {
    load().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [load])

  const cfg = useMemo(() => (raw ? normalizeConfig(raw) : null), [raw])

  // --- persistance ---------------------------------------------------------
  const persist = useCallback(
    (next: Config) => {
      setRaw(next)
      setSaveState({ kind: 'saving' })
      queue.current = queue.current
        .then(() => saveConfig(next, version.current))
        .then((v) => {
          version.current = v
          setSaveState({ kind: 'saved' })
          window.setTimeout(() => setSaveState((s) => (s.kind === 'saved' ? { kind: 'idle' } : s)), 1600)
        })
        .catch((e: unknown) => {
          if (!(e instanceof ConfigConflict)) {
            setSaveState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
            return
          }
          setSaveState({ kind: 'error', message: 'non enregistré : config modifiée ailleurs' })
          void confirmDialog({
            title: 'La config a changé ailleurs',
            body: [
              "Depuis le chargement de cette page, config.json a été modifié (autre onglet, autre navigateur, ou le serveur). Ta dernière modification n'a pas été enregistrée, pour ne pas écraser l'autre.",
              'Recharger affiche la version à jour ; refais ensuite ta modification. Rien d’autre n’est perdu.',
            ],
            confirmLabel: 'Recharger',
          }).then((ok) => {
            if (!ok) return
            setSaveState({ kind: 'idle' })
            void load().catch(() => undefined)
          })
        })
    },
    [load],
  )

  /** Relit config.json : après une écriture faite par le serveur (comptes, connexion). */
  const reload = useCallback(() => void load().catch(() => undefined), [load])

  return { raw, cfg, error, saveState, setSaveState, persist, reload }
}
