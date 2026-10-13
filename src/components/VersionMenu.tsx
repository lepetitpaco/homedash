import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Changelog, ChangelogEntry } from '../lib/changelog'

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
  const [copied, setCopied] = useState(false)

  // Échap ferme la modale (le clic sur le fond aussi, plus bas).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!data) return null

  const copy = () => {
    try {
      void navigator.clipboard?.writeText(data.command).then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1400)
      })
    } catch {
      /* presse-papier absent hors localhost/HTTPS */
    }
  }

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
                <button className="cl-cmd" onClick={copy} title="Copier la commande">
                  <code>{data.command}</code>
                  <span>{copied ? '✓ copié' : 'copier'}</span>
                </button>
                <p className="cl-safe">Tes données sont sauvegardées automatiquement avant la mise à jour.</p>
                {data.incoming.map((e) => (
                  <Entry key={e.version} entry={e} fresh />
                ))}
              </div>
              {data.entries.map((e, i) => (
                <Entry key={e.version} entry={e} current={i === 0} />
              ))}
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
          <li key={i}>{renderBold(item)}</li>
        ))}
      </ul>
    </article>
  )
}

/** `**gras**` et `` `code` `` du Markdown, seuls formatages utilisés dans CHANGELOG.md. */
function renderBold(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : part.startsWith('`') && part.endsWith('`') && part.length > 1 ? (
      <code key={i}>{part.slice(1, -1)}</code>
    ) : (
      part
    ),
  )
}
