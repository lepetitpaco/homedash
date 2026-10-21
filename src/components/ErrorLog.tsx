import { useEffect, useState } from 'react'
import { confirmDialog } from './ConfirmHost'
import { shown } from '../lib/errors'

type Entry = { ts: number; source: string; where: string | null; shown: string | null; detail: string | null }

const when = (ts: number) =>
  new Date(ts * 1000).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' })

/**
 * Réglages → Aide → Journal d'erreurs : ce qui a raté (serveur et page), le
 * message vu et son détail technique. « Copier » prépare un texte à coller
 * dans une issue.
 */
export default function ErrorLog({ repo }: { repo?: string }) {
  const [items, setItems] = useState<Entry[] | null>(null)
  const [days, setDays] = useState(30)
  const [copied, setCopied] = useState(false)

  const load = () =>
    fetch('api/errors', { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ errors: Entry[]; keep_days: number }>)
      .then((d) => {
        setItems(d.errors)
        setDays(d.keep_days)
      })
      .catch(() => setItems([]))
  useEffect(() => {
    void load()
  }, [])

  const copy = () => {
    const text = (items ?? [])
      .slice(0, 20)
      .map((e) => `- ${when(e.ts)} · ${e.source}${e.where ? ` · ${e.where}` : ''}\n  vu : ${e.shown ?? '—'}\n  détail : ${e.detail ?? '—'}`)
      .join('\n')
    try {
      void navigator.clipboard?.writeText(`Journal d'erreurs homedash (20 dernières)\n\n${text}`).then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      })
    } catch {
      /* presse-papier absent hors localhost/HTTPS */
    }
  }

  const clear = () =>
    void confirmDialog({
      title: "Vider le journal d'erreurs ?",
      body: "Les erreurs notées sont effacées. Le reste (réglages, sauvegardes, notes) n'est pas touché.",
      confirmLabel: 'Vider',
      danger: true,
    }).then((ok) => {
      if (!ok) return
      fetch('api/errors', { method: 'DELETE' })
        .then(load)
        .catch((e: unknown) => shown("journal d'erreurs", e))
    })

  return (
    <>
      <p className="set-hint">
        Ce qui n'a pas marché, côté serveur comme dans la page : le message affiché et son détail technique. Gardé{' '}
        {days} jours. Pour signaler un problème, copie le journal et colle-le dans{' '}
        <a href={`https://github.com/${repo || 'davidgennaoui/homedash'}/issues/new`} target="_blank" rel="noreferrer" data-outside>
          une issue
        </a>
        .
      </p>
      <div className="set-bk-bar">
        <button className="set-inline-btn" onClick={() => void load()}>
          actualiser
        </button>
        <span className="set-spacer" />
        {items?.length ? (
          <>
            <button className="btn" onClick={copy}>
              {copied ? '✓ copié' : 'Copier pour une issue'}
            </button>
            <button className="set-del-many" onClick={clear}>
              Vider
            </button>
          </>
        ) : null}
      </div>
      {items === null ? (
        <p className="set-hint">chargement…</p>
      ) : !items.length ? (
        <p className="set-hint">✓ Aucune erreur notée.</p>
      ) : (
        <ul className="errlog">
          {items.map((e, i) => (
            <li key={i} className="errlog-item">
              <span className="errlog-head">
                <time>{when(e.ts)}</time>
                <span className="cl-tag">{e.source}</span>
                {e.where ? <span className="errlog-where">{e.where}</span> : null}
              </span>
              <span className="errlog-shown">{e.shown ?? '—'}</span>
              {e.detail ? (
                <details>
                  <summary>détail technique</summary>
                  <code>{e.detail}</code>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
