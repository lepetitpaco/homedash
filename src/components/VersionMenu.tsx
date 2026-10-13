import { useEffect, useRef, useState } from 'react'
import type { Changelog, ChangelogEntry } from '../lib/changelog'

/**
 * Version installée, dans la barre du haut. Discrète quand tout est à jour,
 * mise en avant quand une version plus récente est publiée. Le panneau donne la
 * commande de mise à jour (à copier, rien n'est lancé d'ici) et le changelog.
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
  const wrap = useRef<HTMLDivElement>(null)

  // Fermeture au clic dehors et à Échap, comme la cloche.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
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
    <div className="bell" ref={wrap}>
      <button
        className={`version-btn${data.update ? ' is-update' : ''}${open ? ' is-open' : ''}`}
        onClick={() => setOpen(!open)}
        title={data.update ? `homedash ${data.latest} est disponible` : `homedash ${data.current} — nouveautés`}
        aria-expanded={open}
      >
        {data.update ? `⬆ ${data.latest}` : `v${data.current}`}
      </button>

      {open ? (
        <div className="bell-panel" role="dialog" aria-label="Version et nouveautés">
          <div className="bell-head">
            <strong>homedash {data.current}</strong>
            <span className="bell-head-count">
              {data.error ? `⚠ ${data.error}` : data.update ? '' : data.checked_at ? '✓ à jour' : ''}
            </span>
            <span className="set-spacer" />
            <button className="bell-link" onClick={onCheck} disabled={busy}>
              {busy ? 'vérification…' : 'vérifier'}
            </button>
          </div>

          <div className="bell-list cl-body">
            {data.update ? (
              <div className="cl-update">
                <strong>⬆️ La version {data.latest} est disponible</strong>
                <p>Dans le dossier du projet :</p>
                <button className="cl-cmd" onClick={copy} title="Copier la commande">
                  <code>{data.command}</code>
                  <span>{copied ? '✓ copié' : 'copier'}</span>
                </button>
                <p className="cl-safe">Tes données sont sauvegardées automatiquement avant la mise à jour.</p>
                {data.incoming.map((e) => (
                  <Entry key={e.version} entry={e} fresh />
                ))}
              </div>
            ) : null}
            {data.entries.map((e, i) => (
              <Entry key={e.version} entry={e} current={i === 0} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
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

/** `**gras**` du Markdown, seul formatage utilisé dans CHANGELOG.md. */
function renderBold(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
  )
}
