import { useEffect, useRef, useState } from 'react'
import type { BcIssue } from '../lib/basecamp'
import { taskText, type BcComment, type IssueTask } from '../lib/bcIssues'
import { shown } from '../lib/errors'
import { Markdown } from '../lib/markdown'
import Thread from './Thread'

/**
 * Fiche d'une tâche Basecamp, lue dans homedash sans ouvrir Basecamp :
 * description, étapes, issues liées et tous les échanges, avec de quoi en faire
 * une issue (la tâche entière, ou un échange précis).
 *
 *   showTask({ task, comment, issues, onOpen, onIssue })
 *
 * Un seul `<TaskHost />`, monté dans App, affiche les demandes.
 */
export type TaskRequest = {
  task: IssueTask
  /** Échange à montrer (id du commentaire) : la fiche s'ouvre dessus, mis en évidence. */
  comment?: number
  /** Issues GitHub déjà liées à la tâche. */
  issues: BcIssue[]
  /** Ouvre une adresse comme un lien de la page (Basecamp, issue). */
  onOpen: (url: string) => void
  /** En faire une issue : la tâche, ou un de ses échanges. Absent : aucun repo où la créer. */
  onIssue?: (comment?: number) => void
}

let show: ((r: TaskRequest) => void) | null = null

export function showTask(r: TaskRequest) {
  show?.(r)
}

/**
 * Pièces jointes (cf. `basecamp.html_text`) : une image devient l'image elle-même,
 * relayée par le serveur (`/api/basecamp/file`) ; le reste, un lien que `Markdown` sait lire.
 */
const render = (text: string, images: Record<string, string>) =>
  text
    .replace(/\[🖼 ([^\]]*)\]\(<([^>\s]+)>\) \(sur Basecamp\)/g, (all, name: string, link: string) =>
      images[link] ? `![${name}](api/basecamp/file?${new URLSearchParams({ url: images[link] })})` : all,
    )
    .replace(/\]\(<([^>\s()]+)>\)/g, (_, url: string) => `](${url})`)

export default function TaskHost() {
  const [req, setReq] = useState<TaskRequest | null>(null)
  const [text, setText] = useState('')
  const [comments, setComments] = useState<BcComment[]>([])
  const [images, setImages] = useState<Record<string, string>>({})
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')
  const asked = useRef(0)
  const box = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    show = (r) => {
      setReq(r)
      setText('')
      setComments([])
      setImages({})
      setError('')
      setReading(true)
      const n = ++asked.current
      taskText(r.task.url)
        .then((got) => {
          if (n !== asked.current) return
          setText(got.text)
          setComments(got.comments)
          setImages(got.images)
        })
        .catch((e) => n === asked.current && setError(shown('Lecture de la tâche Basecamp', e)))
        .finally(() => n === asked.current && setReading(false))
    }
    return () => {
      show = null
    }
  }, [])

  // Échap ferme la fiche : le clavier lui revient à l'ouverture
  useEffect(() => {
    if (req) dialog.current?.focus()
  }, [req])

  // ouverte sur un échange : on le fait venir à l'écran une fois la tâche lue
  useEffect(() => {
    if (!req?.comment || reading) return
    box.current?.querySelector(`[data-comment="${req.comment}"]`)?.scrollIntoView({ block: 'center' })
  }, [req, reading])

  if (!req) return null
  const close = () => setReq(null)
  const { task } = req

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div
        className="modal modal-confirm task-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-title"
        onKeyDown={(e) => e.key === 'Escape' && close()}
        tabIndex={-1}
        ref={dialog}
      >
        <div className="modal-head task-head" id="task-title">
          <span className="task-name">{task.title}</span>
          {task.where ? <span className="task-where">{task.where}</span> : null}
        </div>
        <div className="modal-body task-body" ref={box}>
          {req.issues.length ? (
            <div className="task-issues">
              {req.issues.map((i) => (
                <a key={`${i.repo}#${i.number}`} href={i.url} target="_blank" rel="noreferrer" data-outside>
                  {i.state === 'closed' ? '✓' : '●'} {i.repo} #{i.number} — {i.title}
                  {i.report ? ' · rapport prêt' : ''}
                </a>
              ))}
            </div>
          ) : null}
          {error ? <p className="issue-error">{error}</p> : null}
          {reading ? <p className="set-hint">Lecture de la tâche dans Basecamp…</p> : null}
          {!reading && !error ? (
            <>
              <section className="task-desc">
                {text ? <Markdown text={render(text, images)} /> : <p className="set-hint">Pas de description.</p>}
              </section>
              <div className="task-sub">
                Échanges · {comments.length}
              </div>
              {comments.length ? (
                <Thread
                  messages={comments}
                  focus={req.comment}
                  render={(t) => render(t, images)}
                  action={
                    req.onIssue
                      ? (m) => (
                          <button className="th-issue" title="Créer une issue GitHub à partir de cet échange" onClick={() => req.onIssue?.(m.id as number)}>
                            🐙 issue
                          </button>
                        )
                      : undefined
                  }
                />
              ) : (
                <p className="set-hint">Aucun échange.</p>
              )}
            </>
          ) : null}
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={() => req.onOpen(task.url)}>
            Ouvrir dans Basecamp
          </button>
          <span className="set-spacer" />
          {req.onIssue ? (
            <button className="btn" onClick={() => req.onIssue?.()}>
              🐙 Créer une issue
            </button>
          ) : null}
          <button className="btn btn-primary" onClick={close}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
