import { useEffect, useState } from 'react'
import { desktop } from '../lib/desktop'

/** Étape lisible d'après la commande lancée par l'appli (desktop/updater.js). */
function stepOf(cmd: string): string {
  if (cmd.includes('git pull')) return 'récupération de la nouvelle version'
  if (cmd.includes('docker compose')) return 'reconstruction du serveur'
  if (cmd.includes('build-local') || cmd.includes('build-windows')) return "reconstruction de l'appli"
  return cmd.replace(/^\$ /, '')
}

/**
 * Mise à jour lancée depuis l'appli de bureau : son avancement en bas de
 * l'écran, où qu'on soit (la fenêtre de version peut être fermée). Disparaît
 * peu après la fin ; un échec reste affiché jusqu'au clic.
 */
export default function UpdateProgress() {
  const [step, setStep] = useState('')
  const [last, setLast] = useState('')
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'failed'>('idle')

  useEffect(
    () =>
      desktop?.onUpdateLog?.(({ line, kind }) => {
        if (kind === 'cmd') {
          setState('running')
          setStep(stepOf(line))
          setLast('')
        } else if (kind === 'error') {
          setState('failed')
          setLast(line)
        } else if (kind === 'done') {
          setState('done')
          setLast(line)
        } else {
          setState((s) => (s === 'idle' ? 'running' : s))
          setLast(line)
        }
      }),
    [],
  )
  // Fini : on le laisse lire, puis il s'efface (la page se recharge souvent avant).
  useEffect(() => {
    if (state !== 'done') return
    const t = window.setTimeout(() => setState('idle'), 8000)
    return () => window.clearTimeout(t)
  }, [state, last])

  if (state === 'idle') return null
  return (
    <div
      className={`toast update-progress is-${state}`}
      role="status"
      onClick={() => state !== 'running' && setState('idle')}
      title={state === 'failed' ? 'Clic pour fermer' : undefined}
    >
      <span className="update-progress-icon" aria-hidden="true">
        {state === 'running' ? <span className="update-spinner" /> : state === 'done' ? '✓' : '✗'}
      </span>
      <span className="update-progress-text">
        <strong>{state === 'failed' ? 'Mise à jour interrompue' : `Mise à jour · ${step || 'en cours'}`}</strong>
        {last ? <small>{last}</small> : null}
      </span>
    </div>
  )
}
