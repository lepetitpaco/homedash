import { useState } from 'react'
import { desktop } from '../lib/desktop'

const KEY = 'homedash:dock-hint'

/**
 * Une fois, dans l'appli de bureau : le nombre sur l'icône (Dock, barre des
 * tâches) dépend d'une autorisation du système, que homedash ne peut pas
 * vérifier. On propose d'ouvrir le bon réglage, comme le font d'autres applis.
 */
export default function DockHint() {
  const [shown, setShown] = useState(() => {
    if (!desktop?.openNotificationSettings) return false
    try {
      return localStorage.getItem(KEY) !== 'done'
    } catch {
      return false
    }
  })
  if (!shown) return null
  const done = () => {
    try {
      localStorage.setItem(KEY, 'done')
    } catch {
      /* stockage indisponible : la carte reviendra */
    }
    setShown(false)
  }
  const mac = desktop?.platform === 'darwin'
  return (
    <div className="toast dock-hint" role="dialog" aria-label="Pastille de l'icône">
      <span className="dock-hint-text">
        <strong>🔔 Les non-lus sur l'icône {mac ? 'du Dock' : 'de la barre des tâches'}</strong>
        <small>
          {mac
            ? "macOS ne les affiche que si « Pastilles de l'app » est activé pour homedash dans ses réglages de notifications."
            : 'Windows ne les affiche que si les notifications de homedash sont autorisées.'}
        </small>
      </span>
      <span className="dock-hint-actions">
        <button
          className="btn btn-primary"
          onClick={() => {
            desktop?.openNotificationSettings?.()
            done()
          }}
        >
          Ouvrir les réglages
        </button>
        <button className="btn" onClick={() => setShown(false)} title="Redemander au prochain lancement">
          Plus tard
        </button>
        <button className="btn" onClick={done}>
          C'est déjà fait
        </button>
      </span>
    </div>
  )
}
