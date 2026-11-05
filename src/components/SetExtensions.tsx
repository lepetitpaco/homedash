import { useEffect, useState } from 'react'
import { desktop, type ExtensionInfo } from '../lib/desktop'
import { confirmDialog } from './ConfirmHost'

/** L'appli sait-elle charger des extensions (≥ 2.6) ? Sinon, ce bloc n'existe pas. */
export const extensionsAvailable = () => !!desktop?.extensions && !!desktop.features?.includes('extensions')

/**
 * Réglages → Mes sites → Extensions (issue #132) : des extensions de navigateur non empaquetées
 * (un dossier avec manifest.json) chargées dans les sites. Appliqué tout de suite, propre à cette
 * machine (desktop.json de l'appli), rien par défaut.
 */
export default function SetExtensions() {
  const [list, setList] = useState<ExtensionInfo[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (action: 'list' | 'add' | 'remove' | 'reload', path?: string) => {
    if (!desktop?.extensions) return
    setBusy(true)
    try {
      const r = await desktop.extensions({ action, path })
      if (r) {
        setList(r.list)
        setError(r.error ?? '')
      }
    } catch {
      setError("L'appli n'a pas répondu : réessaie.")
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    void run('list')
  }, [])

  if (!extensionsAvailable()) return null
  return (
    <div className="set-ext">
      <p className="set-hint">
        Une extension de navigateur <strong>non empaquetée</strong> (le dossier qui contient <code>manifest.json</code>)
        tourne dans tes sites, tous comptes compris : elle voit tout ce qu'ils affichent. N'ajoute que les tiennes ou
        celles que tu connais. Ce qui marche : ce qu'elle fait dans la page. Ce qui ne marche pas : son icône et sa
        fenêtre (popup), son clic droit, et <code>storage.sync</code> (l'extension doit se rabattre sur{' '}
        <code>storage.local</code>).
      </p>
      {list?.length ? (
        <ul className="set-ext-list">
          {list.map((x) => (
            <li key={x.path} className={x.error ? 'is-bad' : ''}>
              <span className="set-ext-name">
                {x.name}
                {x.version ? <em> {x.version}</em> : null}
              </span>
              <span className="set-ext-path" title={x.path}>
                {x.path}
              </span>
              <span className="set-ext-state">{x.error ? `✗ ${x.error}` : x.loaded ? '✓ chargée' : '… au prochain site ouvert'}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void confirmDialog({
                    title: `Retirer ${x.name} ?`,
                    body: 'Elle ne tournera plus dans tes sites (déjà ouverts : au prochain chargement). Son dossier et ses données restent sur le disque.',
                    confirmLabel: 'Retirer',
                  }).then((ok) => {
                    if (ok) void run('remove', x.path)
                  })
                }
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      ) : list ? (
        <p className="set-state">Aucune extension.</p>
      ) : null}
      {error ? <p className="set-ext-error">{error}</p> : null}
      <div className="set-add">
        <button type="button" disabled={busy} onClick={() => void run('add')}>
          ＋ Ajouter un dossier
        </button>
        {list?.length ? (
          <button type="button" disabled={busy} onClick={() => void run('reload')} title="Une extension ne s'applique qu'au prochain chargement de la page">
            ↻ Recharger les sites ouverts
          </button>
        ) : null}
      </div>
    </div>
  )
}
