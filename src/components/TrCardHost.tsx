import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { shown } from '../lib/errors'
import { Markdown } from '../lib/markdown'
import { cardText, type TrComment } from '../lib/trIssues'
import type { TrIssue } from '../lib/trello'

export type TrCardRequest = {
  url: string
  title: string
  where?: string
  comment?: string
  issues: TrIssue[]
  onOpen: (url: string) => void
  onIssue?: (comment?: string) => void
}

let show: ((r: TrCardRequest) => void) | null = null

export function showTrCard(r: TrCardRequest) {
  show?.(r)
}

export default function TrCardHost() {
  const [req, setReq] = useState<TrCardRequest | null>(null)
  const [text, setText] = useState('')
  const [lists, setLists] = useState<{ name: string; items: { title: string; completed: boolean }[] }[]>([])
  const [comments, setComments] = useState<TrComment[]>([])
  const [images, setImages] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  useEffect(() => {
    show = (r) => {
      setReq(r)
      setText('')
      setLists([])
      setComments([])
      setImages({})
      setError('')
      cardText(r.url)
        .then((got) => {
          setText(got.text)
          setLists(got.checklists)
          setComments([...got.comments].reverse())
          setImages(got.images)
        })
        .catch((e: unknown) => setError(shown('Trello', e)))
    }
    return () => {
      show = null
    }
  }, [])

  useEffect(() => {
    if (!req) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setReq(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [req])

  if (!req) return null
  const body = text.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (all, name: string, url: string) => {
    const hit = Object.entries(images).find(([, link]) => link === url)
    return hit ? `![${name}](api/trello/file?${new URLSearchParams({ url: hit[1] })})` : all
  })
  return createPortal(
    <div className="tr-sheet" role="dialog" aria-label={req.title} onClick={() => setReq(null)}>
      <div className="tr-sheet-card" onClick={(e) => e.stopPropagation()}>
        <header className="tr-card-top">
          <div>
            <strong>{req.title}</strong>
            {req.where ? <div className="set-hint">{req.where}</div> : null}
          </div>
          <div className="tr-dialog-actions">
            <button className="btn" onClick={() => req.onOpen(req.url)}>Ouvrir sur Trello</button>
            {req.onIssue ? <button className="btn" onClick={() => req.onIssue?.()}>🐙 Créer une issue</button> : null}
            <button className="btn" onClick={() => setReq(null)}>Fermer</button>
          </div>
        </header>
        {error ? <p className="set-hint set-bad">{error}</p> : null}
        {body ? <Markdown text={body} /> : <p className="set-hint">Pas de description.</p>}
        {Object.entries(images).map(([name, url]) => (
          <img key={url} alt={name} src={`api/trello/file?${new URLSearchParams({ url })}`} />
        ))}
        {lists.map((cl) => (
          <section key={cl.name}>
            <h3>{cl.name}</h3>
            {cl.items.map((it) => (
              <label key={it.title} className="tr-check">
                <input type="checkbox" checked={it.completed} disabled />
                <span>{it.title}</span>
              </label>
            ))}
          </section>
        ))}
        <section>
          <h3>Échanges</h3>
          {comments.length ? comments.map((c) => (
            <article key={c.id} className={`tr-comment${req.comment === c.id ? ' is-focus' : ''}`}>
              <strong>{c.who}</strong> <span className="set-hint">{c.date}</span>
              <Markdown text={c.text} />
              {req.onIssue ? (
                <button className="btn" onClick={() => req.onIssue?.(c.id)}>🐙 issue sur cet échange</button>
              ) : null}
            </article>
          )) : <p className="set-hint">Aucun échange.</p>}
        </section>
        {req.issues.length ? (
          <p className="set-hint">{req.issues.length} issue(s) GitHub liée(s).</p>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
