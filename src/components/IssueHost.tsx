import { useEffect, useRef, useState } from 'react'
import type { BcIssue } from '../lib/basecamp'
import {
  bcKey,
  commentsMarkdown,
  RECENT_COMMENTS,
  claudeCommand,
  claudePrompt,
  createIssue,
  issueBody,
  newIssueUrl,
  rememberRepo,
  rememberedRepo,
  taskText,
  type BcComment,
  type IssueRepo,
  type IssueTask,
} from '../lib/bcIssues'
import { shown } from '../lib/errors'
import Pick from './Pick'

/**
 * Fenêtre « nouvelle issue » d'une tâche Basecamp : repo, titre et besoin, puis
 * création directe (jeton GitHub de homedash, pas besoin d'être connecté à
 * github.com) ou formulaire GitHub pré-rempli.
 *
 *   askIssue({ repos, task, existing, cloneOf, onOpen, onMade })
 *
 * Un seul `<IssueHost />`, monté dans App, affiche les demandes.
 */
export type IssueRequest = {
  /** Repos suivis où créer l'issue ; celui retenu pour le projet de la tâche est proposé. */
  repos: IssueRepo[]
  task: IssueTask
  /** Issues déjà liées à cette tâche : signalées, pour ne pas en créer une deuxième. */
  existing: BcIssue[]
  /** Issue sur un échange précis (id du commentaire) : il devient le besoin, la tâche le contexte. */
  comment?: number
  /** Clone local d'un repo (`~/dev/api`), pour lancer Claude Code dedans ; null s'il n'y en a pas. */
  cloneOf: (repo: string) => string | null
  /** Ouvre une adresse comme un lien de la page (formulaire, issue créée) : dans l'appli de bureau, un onglet. */
  onOpen: (url: string) => void
  /** Appli de bureau : l'ouvrir plutôt dans le navigateur (connecté à GitHub, lui). */
  onOpenOutside?: (url: string) => void
  /** Issue créée : relire l'onglet Basecamp pour l'afficher sur la tâche. */
  onMade?: () => void
}

let show: ((r: IssueRequest) => void) | null = null

export function askIssue(r: IssueRequest) {
  show?.(r)
}

type Made = { number: number; url: string; repo: string }

export default function IssueHost() {
  const [req, setReq] = useState<IssueRequest | null>(null)
  const [repo, setRepo] = useState<IssueRepo | null>(null)
  const [title, setTitle] = useState('')
  const [need, setNeed] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [made, setMade] = useState<Made | null>(null)
  const [copied, setCopied] = useState('')
  /** Lecture de la tâche dans Basecamp en cours (pour pré-remplir le besoin). */
  const [reading, setReading] = useState(false)
  /** Échanges de la tâche, et ceux retenus pour l'issue (ids). */
  const [comments, setComments] = useState<BcComment[]>([])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const input = useRef<HTMLInputElement>(null)
  const asked = useRef(0)

  useEffect(() => {
    show = (r) => {
      setReq(r)
      setRepo(rememberedRepo(r.repos, r.task.project) ?? null)
      setTitle(r.task.title)
      setNeed('')
      setBusy(false)
      setError('')
      setMade(null)
      setCopied('')
      setComments([])
      setPicked(new Set())
      // Besoin pré-rempli avec le contenu de la tâche ; ce qui a déjà été tapé est gardé.
      const n = ++asked.current
      if (!bcKey(r.task.url)) return setReading(false)
      setReading(true)
      taskText(r.task.url)
        .then(({ text, comments: all }) => {
          if (n !== asked.current) return
          setComments(all)
          const from = r.comment ? all.find((c) => c.id === r.comment) : undefined
          if (from) {
            // l'échange est la demande ; la tâche reste en contexte, les autres échanges à cocher
            const ask = `**Demande de ${from.who} (${from.date}) sur Basecamp** :\n\n${from.text}`
            setNeed((cur) => cur || [ask, text ? `### Contexte : la tâche\n\n${text}` : ''].filter(Boolean).join('\n\n'))
            setPicked(new Set())
          } else {
            setNeed((cur) => cur || text)
            setPicked(new Set(all.slice(-RECENT_COMMENTS).map((c) => c.id)))
          }
        })
        .catch((e) => n === asked.current && shown('Lecture de la tâche Basecamp', e))
        .finally(() => n === asked.current && setReading(false))
    }
    return () => {
      show = null
    }
  }, [])

  useEffect(() => {
    if (req) setTimeout(() => input.current?.select(), 0)
  }, [req])

  if (!req || !repo) return null
  const close = () => setReq(null)
  const retained = comments.filter((c) => picked.has(c.id))
  const body = () => issueBody(req.task, [need.trim(), commentsMarkdown(retained)].filter(Boolean).join('\n\n'))
  const toggle = (id: number) =>
    setPicked((cur) => {
      const next = new Set(cur)
      if (!next.delete(id)) next.add(id)
      return next
    })
  // Pour Claude Code : le prompt, et la commande qui le lance dans le clone local s'il y en a un.
  const prompt = made ? claudePrompt(made.repo, made.number) : ''
  const clone = made ? req.cloneOf(made.repo) : null
  const command = clone ? claudeCommand(clone, prompt) : ''
  const copy = (what: 'command' | 'prompt', text: string) =>
    navigator.clipboard?.writeText(text).then(
      () => setCopied(what),
      () => undefined,
    )

  const create = async () => {
    if (!title.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const got = await createIssue(repo.account, repo.repo, title.trim(), body())
      rememberRepo(repo, req.task.project)
      setMade({ ...got, repo: repo.repo })
      req.onMade?.()
      // déjà dans le presse-papiers : il n'y a plus qu'à coller dans un terminal (ou Claude Code)
      const p = claudePrompt(repo.repo, got.number)
      const dir = req.cloneOf(repo.repo)
      void (dir ? copy('command', claudeCommand(dir, p)) : copy('prompt', p))
    } catch (e) {
      setError(shown('Création d’issue', e))
    } finally {
      setBusy(false)
    }
  }
  const openForm = (outside: boolean) => {
    rememberRepo(repo, req.task.project)
    const url = newIssueUrl(repo.repo, title.trim(), body())
    if (outside && req.onOpenOutside) req.onOpenOutside(url)
    else req.onOpen(url)
    close()
  }
  /** « Dans le navigateur », à côté d'un bouton qui ouvre dans l'appli (appli de bureau seulement). */
  const outside = (go: () => void) =>
    req.onOpenOutside ? (
      <button className="btn" onClick={go} title="Ouvrir dans le navigateur (où tu es connecté à GitHub)">
        ↗ navigateur
      </button>
    ) : null
  // ⌘/Ctrl + Entrée : créer, depuis n'importe quel champ
  const submitKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void create()
    }
  }
  const open = req.existing.filter((i) => i.state === 'open')

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div
        className="modal modal-confirm issue-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="issue-title"
        onKeyDown={(e) => e.key === 'Escape' && close()}
      >
        <div className="modal-head" id="issue-title">
          {made ? `Issue #${made.number} créée` : req.comment ? 'Nouvelle issue GitHub, sur un échange' : 'Nouvelle issue GitHub'}
        </div>
        {made ? (
          <div className="modal-body issue-body">
            <p>
              Elle garde le lien vers la tâche : son rapport apparaîtra dans l'onglet Basecamp (et dans la cloche).{' '}
              {copied === 'command'
                ? 'Cette commande est copiée : colle-la dans un terminal, Claude Code démarre dans le repo avec l’issue.'
                : copied === 'prompt'
                  ? 'Ce prompt est copié : colle-le dans Claude Code.'
                  : 'Pour la confier à Claude Code :'}
            </p>
            <pre className="issue-prompt">{command || prompt}</pre>
          </div>
        ) : (
          <div className="modal-body issue-body" onKeyDown={submitKey}>
            {open.length ? (
              <p className="issue-existing">
                Déjà liée à {open.length > 1 ? 'des issues ouvertes' : 'une issue ouverte'} :{' '}
                {open.map((i, n) => (
                  <span key={`${i.repo}#${i.number}`}>
                    {n ? ', ' : ''}
                    <a href={i.url} target="_blank" rel="noreferrer" title={i.title}>
                      {i.repo} #{i.number}
                    </a>
                  </span>
                ))}
                . En créer une autre ?
              </p>
            ) : null}
            {req.repos.length > 1 ? (
              <div className="issue-label">
                Repo
                <Pick
                  value={`${repo.account} ${repo.repo}`}
                  options={req.repos.map((r) => ({ value: `${r.account} ${r.repo}`, label: r.repo }))}
                  onChange={(v) => setRepo(req.repos.find((r) => `${r.account} ${r.repo}` === v) ?? repo)}
                  title="Repo où créer l'issue (retenu pour ce projet Basecamp)"
                />
              </div>
            ) : (
              <p className="set-hint">Dans {repo.repo}</p>
            )}
            <label className="issue-label">
              Titre
              <input
                ref={input}
                className="nc-name"
                value={title}
                maxLength={256}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void create()}
                autoComplete="off"
                data-1p-ignore
              />
            </label>
            <label className="issue-label">
              Besoin
              <textarea
                className="issue-need"
                value={need}
                rows={12}
                placeholder={reading ? 'Lecture de la tâche dans Basecamp…' : "Ce qu'il faut faire, pour qui, ce qui compte…"}
                onChange={(e) => setNeed(e.target.value)}
              />
            </label>
            {comments.length ? (
              <div className="issue-label">
                <span className="issue-comments-head">
                  Échanges à reprendre · {retained.length} sur {comments.length}
                  <span className="set-spacer" />
                  <button className="bell-link" onClick={() => setPicked(new Set(comments.map((c) => c.id)))}>
                    tout
                  </button>
                  <button className="bell-link" onClick={() => setPicked(new Set())}>
                    aucun
                  </button>
                </span>
                <div className="issue-comments">
                  {/* le plus récent en haut : c'est lui qui compte le plus souvent */}
                  {[...comments].reverse().map((c) => (
                    <label key={c.id} className={`issue-comment${picked.has(c.id) ? ' is-on' : ''}`}>
                      <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                      <span>
                        <strong>{c.who}</strong> · {new Date(c.date).toLocaleDateString('fr-FR')}
                        <span className="issue-comment-text">{c.text}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            <p className="set-hint">
              Repris de la tâche (description, étapes) : à compléter ou raccourcir. Coche les échanges utiles, les
              {` ${RECENT_COMMENTS}`} plus récents le sont déjà. Le lien vers la tâche et la consigne de rapport sont
              ajoutés en bas. ⌘ Entrée pour créer.
            </p>
            {error ? <p className="issue-error">{error}</p> : null}
          </div>
        )}
        <div className="modal-foot">
          {made ? (
            <>
              <button className="btn" onClick={() => req.onOpen(made.url)}>
                Voir sur GitHub
              </button>
              {outside(() => req.onOpenOutside?.(made.url))}
              {navigator.clipboard && command ? (
                <button className="btn" onClick={() => void copy('command', command)}>
                  {copied === 'command' ? '✓ Commande copiée' : 'Copier la commande'}
                </button>
              ) : null}
              {navigator.clipboard ? (
                <button className="btn" onClick={() => void copy('prompt', prompt)}>
                  {copied === 'prompt' ? '✓ Prompt copié' : 'Copier le prompt'}
                </button>
              ) : null}
              <button className="btn btn-primary" onClick={close}>
                Fermer
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={close}>
                Annuler
              </button>
              <button
                className="btn"
                onClick={() => openForm(false)}
                title="Formulaire GitHub pré-rempli (il faut y être connecté)"
              >
                Ouvrir le formulaire
              </button>
              {outside(() => openForm(true))}
              <button className="btn btn-primary" onClick={() => void create()} disabled={!title.trim() || busy}>
                {busy ? 'Création…' : 'Créer sur GitHub'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
