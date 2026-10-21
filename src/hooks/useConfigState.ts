import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { confirmDialog } from '../components/ConfirmHost'
import { BrokenConfig, ConfigConflict, fetchConfig, saveConfig } from '../lib/api'
import { Offline, report, shown } from '../lib/errors'
import { normalizeConfig } from '../lib/config'
import type { Config } from '../types'

export type SaveState = { kind: 'idle' | 'saving' | 'saved' } | { kind: 'error'; message: string }

/**
 * Pourquoi la config n'est pas là. `offline` : le serveur ne répond pas encore
 * (container qui redémarre) — passager, on réessaie seul. `broken` : le fichier
 * est abîmé. `other` : autre chose, message déjà lisible.
 */
export type LoadError =
  | { kind: 'offline'; tries: number }
  | { kind: 'broken'; line: number | null; backup: BrokenConfig['backup'] }
  | { kind: 'other'; message: string }

/** Entre deux essais quand le serveur ne répond pas. */
const RETRY_MS = 2000

/**
 * config.json : chargement, version normalisée, et écriture avec son témoin
 * (toast « enregistrement… » / « ✓ enregistré » / erreur).
 */
export function useConfigState() {
  const [raw, setRaw] = useState<Config | null>(null)
  const [error, setError] = useState<LoadError | null>(null)
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

  // Premier chargement : tant que le serveur ne répond pas, on réessaie seul
  // (avant, une page affichée pendant un redémarrage restait en erreur jusqu'au
  // rechargement à la main).
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let timer = 0
    load()
      .then(() => setError(null))
      .catch((e: unknown) => {
        if (e instanceof Offline) {
          setError({ kind: 'offline', tries: attempt + 1 })
          // noté une seule fois, s'il dure (un redémarrage normal prend quelques secondes)
          if (attempt === 5) report('chargement', e, 'homedash ne répond pas')
          timer = window.setTimeout(() => setAttempt((a) => a + 1), RETRY_MS)
        } else if (e instanceof BrokenConfig) {
          // déjà au journal côté serveur, avec son détail
          setError({ kind: 'broken', line: e.line, backup: e.backup })
        } else setError({ kind: 'other', message: shown('chargement', e) })
      })
    return () => window.clearTimeout(timer)
  }, [load, attempt])

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
            setSaveState({ kind: 'error', message: `Pas enregistré : ${shown('enregistrement', e)}` })
            return
          }
          setSaveState({ kind: 'error', message: 'Pas enregistré : modifié ailleurs entre-temps' })
          void confirmDialog({
            title: 'Tes réglages ont changé ailleurs',
            body: [
              "Depuis l'ouverture de cette page, tes réglages ont été modifiés ailleurs (autre fenêtre, autre navigateur, ou homedash lui-même). Ta dernière modification n'a pas été enregistrée, pour ne pas écraser l'autre.",
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

  /** Après une réparation (restauration de la dernière sauvegarde) : on recharge. */
  const retry = useCallback(() => setAttempt((a) => a + 1), [])

  return { raw, cfg, error, saveState, setSaveState, persist, reload, retry }
}
