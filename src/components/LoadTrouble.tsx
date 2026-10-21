import { useState } from 'react'
import type { LoadError } from '../hooks/useConfigState'
import { repairConfig } from '../lib/api'
import { shown } from '../lib/errors'

const when = (ts: number) =>
  new Date(ts * 1000).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })

/**
 * Ce que voit l'utilisateur quand ses réglages ne chargent pas. Le plus souvent
 * homedash redémarre (mise à jour, réveil du Mac) : on patiente en réessayant
 * seul. Plus rarement, le fichier a été abîmé à la main : on propose la
 * dernière sauvegarde, l'abîmé étant gardé à côté.
 */
export default function LoadTrouble({ error, onRetry }: { error: LoadError; onRetry: () => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  if (error.kind === 'offline')
    return (
      <div className="app">
        <div className="card fatal is-waiting">
          <h1>
            <span className="update-spinner" aria-hidden="true" /> Connexion à homedash…
          </h1>
          {error.tries < 4 ? (
            <p className="muted">homedash démarre, ça ne prend que quelques secondes.</p>
          ) : (
            <>
              <p>homedash ne répond pas. La page réessaie toute seule toutes les 2 secondes.</p>
              <p className="muted">Docker Desktop est-il lancé ? S'il vient de démarrer, homedash suit dans la minute.</p>
            </>
          )}
        </div>
      </div>
    )

  if (error.kind === 'broken')
    return (
      <div className="app">
        <div className="card fatal">
          <h1>Tes réglages ne se lisent plus</h1>
          <p>
            Le fichier de réglages a une erreur d'écriture
            {error.line ? ` à la ligne ${error.line}` : ''} (une virgule ou un guillemet de trop, souvent après une
            modification à la main).
          </p>
          {error.backup ? (
            <>
              <p>
                Tu peux revenir à la dernière sauvegarde qui fonctionnait, du <strong>{when(error.backup.created)}</strong>.
                La version abîmée est gardée à côté, rien n'est effacé.
              </p>
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  setMsg(null)
                  repairConfig()
                    .then(onRetry)
                    .catch((e: unknown) => setMsg(shown('réparation', e)))
                    .finally(() => setBusy(false))
                }}
              >
                {busy ? 'restauration…' : 'Revenir à la dernière sauvegarde'}
              </button>
            </>
          ) : (
            <p className="muted">Aucune sauvegarde n'est disponible : corrige le fichier à la main, puis recharge.</p>
          )}
          {msg ? <p className="set-bad">✗ {msg}</p> : null}
        </div>
      </div>
    )

  return (
    <div className="app">
      <div className="card fatal">
        <h1>homedash n'a pas pu charger tes réglages</h1>
        <p>{error.message}</p>
        <button className="btn" onClick={onRetry}>
          Réessayer
        </button>
      </div>
    </div>
  )
}
