import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Changelog, ChangelogEntry } from '../lib/changelog'
import { inline } from '../lib/markdown'

/**
 * Version installée, dans la barre du haut. Discrète quand tout est à jour,
 * mise en avant quand une version plus récente est publiée. Un clic ouvre une
 * modale : commande de mise à jour (à copier, rien n'est lancé d'ici) et changelog.
 * Pas un onglet : c'est une information sur l'application, pas un outil.
 */
export default function VersionMenu({
  data,
  busy,
  onCheck,
}: {
  data: Changelog | null
  busy: boolean
  onCheck: () => void
}) {
  const [open, setOpen] = useState(false)

  // Échap ferme la modale (le clic sur le fond aussi, plus bas).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!data) return null

  return (
    <>
      <button
        className={`version-btn${data.update ? ' is-update' : ''}${open ? ' is-open' : ''}`}
        onClick={() => setOpen(!open)}
        title={data.update ? `homedash ${data.latest} est disponible` : `homedash ${data.current} — nouveautés`}
        aria-expanded={open}
      >
        {data.update ? `⬆ ${data.latest}` : `v${data.current}`}
      </button>

      {/* Rendue dans <body> : la barre du haut a un `backdrop-filter`, qui ferait
          de la barre (et non de l'écran) le repère de cette modale fixe. */}
      {open ? createPortal(
        <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal cl-modal" role="dialog" aria-modal="true" aria-label="Version et nouveautés">
            <div className="modal-head cl-head">
              <span>homedash {data.current}</span>
              <span className="cl-status">
                {data.error ? `⚠ ${data.error}` : data.update ? '' : data.checked_at ? '✓ à jour' : ''}
              </span>
            </div>

            <div className="modal-body cl-body">
              <ChangelogBody data={data} />
            </div>

            <div className="modal-foot">
              <span className="modal-hint">Échap pour fermer</span>
              <button className="btn" onClick={onCheck} disabled={busy}>
                {busy ? 'vérification…' : 'Vérifier les mises à jour'}
              </button>
              <button className="btn btn-primary" onClick={() => setOpen(false)}>
                Fermer
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  )
}

/**
 * Commande de mise à jour, appli de bureau et changelog : la fenêtre de la
 * version, et Réglages → Aide → Nouveautés.
 */
export function ChangelogBody({ data }: { data: Changelog }) {
  const [copied, setCopied] = useState<false | 'update' | 'desktop'>(false)

  // `which` : la commande copiée (mise à jour, ou construction de l'appli).
  const copy = (text = data.command, which: 'update' | 'desktop' = 'update') => {
    try {
      void navigator.clipboard?.writeText(text).then(() => {
        setCopied(which)
        window.setTimeout(() => setCopied(false), 1400)
      })
    } catch {
      /* presse-papier absent hors localhost/HTTPS */
    }
  }

  return (
    <>
    {/* Toujours là : la commande à coller dans un terminal pour mettre à jour. */}
    <div className={`cl-update${data.update ? '' : ' is-idle'}`}>
      <strong>
        {data.update ? `⬆️ La version ${data.latest} est disponible` : 'Mettre à jour homedash'}
      </strong>
      <p>
        {data.update
          ? 'Colle cette commande dans un terminal :'
          : 'Tu es à jour. Quand une version sortira, colle cette commande dans un terminal :'}
      </p>
      <button className="cl-cmd" onClick={() => copy()} title="Copier la commande">
        <code>{data.command}</code>
        <span>{copied === 'update' ? '✓ copié' : 'copier'}</span>
      </button>
      <p className="cl-safe">Tes données sont sauvegardées automatiquement avant la mise à jour.</p>
      {data.desktop_url ? (
        <div className="cl-desktop">
          <strong>💻 Appli de bureau (Mac)</strong>
          <p>
            <a href={data.desktop_url} target="_blank" rel="noreferrer">
              ⬇ Télécharger la dernière version
            </a>{' '}
            (<code>-arm64</code> : Mac M1/M2/M3…, <code>-x64</code> : Intel), ou la construire sur ce Mac, sans
            GitHub ni blocage au premier lancement :
          </p>
          {data.desktop_command ? (
            <button
              className="cl-cmd"
              onClick={() => copy(data.desktop_command, 'desktop')}
              title="Copier la commande"
            >
              <code>{data.desktop_command}</code>
              <span>{copied === 'desktop' ? '✓ copié' : 'copier'}</span>
            </button>
          ) : null}
        </div>
      ) : null}
      {data.incoming.map((e) => (
        <Entry key={e.version} entry={e} fresh />
      ))}
    </div>
    {data.entries.map((e, i) => (
      <Entry key={e.version} entry={e} current={i === 0} />
    ))}
    </>
  )
}

function Entry({ entry, current, fresh }: { entry: ChangelogEntry; current?: boolean; fresh?: boolean }) {
  return (
    <article className={`cl-entry${fresh ? ' is-fresh' : ''}`}>
      <div className="cl-entry-head">
        <span className="cl-version">{entry.version}</span>
        {entry.date ? <time>{entry.date}</time> : null}
        {current ? <span className="cl-tag">installée</span> : null}
        {fresh ? <span className="cl-tag is-new">nouvelle</span> : null}
      </div>
      <ul>
        {entry.items.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </ul>
    </article>
  )
}
