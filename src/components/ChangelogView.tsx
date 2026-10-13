import { useState } from 'react'
import type { Changelog, ChangelogEntry } from '../lib/changelog'

/**
 * Onglet Changelog : ce qui a changé à chaque version, et la mise à jour
 * disponible s'il y en a une (avec la commande à copier — rien n'est lancé
 * depuis la page).
 */
export default function ChangelogView({
  data,
  busy,
  onCheck,
}: {
  data: Changelog | null
  busy: boolean
  onCheck: () => void
}) {
  const [copied, setCopied] = useState(false)
  if (!data) return <div className="loading">chargement…</div>

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
    <div className="cl-page">
      {data.update ? (
        <section className="card cl-update">
          <div className="cl-update-head">
            <strong>⬆️ homedash {data.latest} est disponible</strong>
            <span>tu as la {data.current}</span>
          </div>
          <p>Dans le dossier du projet, lance :</p>
          <button className="cl-cmd" onClick={copy} title="Copier la commande">
            <code>{data.command}</code>
            <span>{copied ? '✓ copié' : 'copier'}</span>
          </button>
          <p className="cl-safe">Tes données sont sauvegardées automatiquement avant la mise à jour.</p>
          {data.incoming.map((e) => (
            <Entry key={e.version} entry={e} fresh />
          ))}
        </section>
      ) : null}

      <section className="card cl-list">
        <header className="group-head">
          <div className="group-toggle static">
            <span className="group-icon" aria-hidden="true">
              📰
            </span>
            <h2 className="group-title">Changelog</h2>
            <span className="group-count">version {data.current}</span>
            <span className="cl-status">
              {data.error
                ? `⚠ ${data.error}`
                : data.update
                  ? ''
                  : data.checked_at
                    ? '✓ à jour'
                    : 'vérification en attente'}
            </span>
            <button className="ev-clear" onClick={onCheck} disabled={busy}>
              {busy ? 'vérification…' : 'vérifier les mises à jour'}
            </button>
          </div>
        </header>
        <div className="cl-body">
          {data.entries.map((e, i) => (
            <Entry key={e.version} entry={e} current={i === 0} />
          ))}
        </div>
      </section>
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
