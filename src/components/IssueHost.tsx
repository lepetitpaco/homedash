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
import IssueComposer from './IssueComposer'

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
  const open = req.existing.filter((i) => i.state === 'open')

  return (
    <IssueComposer
      noun="la tâche"
      service="Basecamp"
      sourceTitle={req.task.title}
      repos={req.repos}
      repo={repo}
      onRepo={setRepo}
      title={title}
      onTitle={setTitle}
      need={need}
      onNeed={setNeed}
      reading={reading}
      comments={comments}
      isPicked={(id) => picked.has(id as number)}
      onToggle={(id) => toggle(id as number)}
      onPick={(ids) => setPicked(new Set(ids as number[]))}
      recent={RECENT_COMMENTS}
      from={req.comment}
      existing={open}
      body={body}
      busy={busy}
      error={error}
      made={made}
      copied={copied}
      prompt={prompt}
      command={command}
      onCopy={(what, text) => void copy(what, text)}
      onCreate={() => void create()}
      onForm={openForm}
      onSee={(outside) => (outside ? req.onOpenOutside?.(made!.url) : req.onOpen(made!.url))}
      hasOutside={!!req.onOpenOutside}
      onClose={close}
    />
  )
}
