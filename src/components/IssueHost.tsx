import { useEffect, useRef, useState } from 'react'
import type { BcIssue } from '../lib/basecamp'
import {
  commentsMarkdown,
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
 * La fenêtre d'une tâche Basecamp : on la lit, puis on en fait une issue (voir
 * IssueComposer). Création directe (jeton GitHub de homedash) ou formulaire
 * GitHub pré-rempli.
 *
 *   askIssue({ repos, task, start, existing, cloneOf, onOpen, onMade })
 *
 * Un seul `<IssueHost />`, monté dans App, affiche les demandes.
 */
export type IssueRequest = {
  /** Repos suivis où créer l'issue ; celui retenu pour le projet de la tâche est proposé. Vide : lecture seule. */
  repos: IssueRepo[]
  task: IssueTask
  /** Lire la tâche, ou préparer directement l'issue. */
  start: 'read' | 'issue'
  /** Ouvrir la tâche dans Basecamp. */
  onOpenSource: () => void
  /** Issues déjà liées à cette tâche : signalées, pour ne pas en créer une deuxième. */
  existing: BcIssue[]
  /** Ouverte sur un échange précis (id du commentaire) ; en préparation d'issue, lui seul est retenu. */
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

export default function IssueHost() {
  const [req, setReq] = useState<IssueRequest | null>(null)
  const [repo, setRepo] = useState<IssueRepo | null>(null)
  const [title, setTitle] = useState('')
  const [need, setNeed] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [made, setMade] = useState<Made | null>(null)
  const [copied, setCopied] = useState('')
  /** Lecture de la tâche dans Basecamp en cours. */
  const [reading, setReading] = useState(false)
  const [text, setText] = useState('')
  const [images, setImages] = useState<Record<string, string>>({})
  const [comments, setComments] = useState<BcComment[]>([])
  /** Ce qui part dans l'issue : la description, et les échanges cochés (ids). */
  const [descPicked, setDescPicked] = useState(true)
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
      setText('')
      setImages({})
      setComments([])
      setPicked(new Set())
      setDescPicked(!(r.start === 'issue' && r.comment))
      const n = ++asked.current
      setReading(true)
      taskText(r.task.url)
        .then((got) => {
          if (n !== asked.current) return
          setText(got.text)
          setImages(got.images)
          setComments(got.comments)
          // Tout est retenu par défaut, sauf une issue sur un échange précis : lui seul.
          setPicked(new Set(r.comment && r.start === 'issue' ? [r.comment] : got.comments.map((c) => c.id)))
        })
        .catch((e) => n === asked.current && setError(shown('Lecture de la tâche Basecamp', e)))
        .finally(() => n === asked.current && setReading(false))
    }
    return () => {
      show = null
    }
  }, [])

  if (!req) return null
  const close = () => setReq(null)
  const retained = comments.filter((c) => picked.has(c.id))
  const body = () => issueBody(req.task, [need.trim(), descPicked ? text : '', commentsMarkdown(retained)].filter(Boolean).join('\n\n'))
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
    if (!repo || !title.trim() || busy) return
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
    if (!repo) return
    rememberRepo(repo, req.task.project)
    const url = newIssueUrl(repo.repo, title.trim(), body())
    if (outside && req.onOpenOutside) req.onOpenOutside(url)
    else req.onOpen(url)
    close()
  }

  return (
    <IssueComposer
      key={asked.current}
      noun="la tâche"
      service="Basecamp"
      sourceTitle={req.task.title}
      where={req.task.where}
      start={req.start}
      description={text ? render(text, images) : ''}
      descPicked={descPicked}
      onDescPicked={setDescPicked}
      renderText={(t) => render(t, images)}
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
      from={req.comment}
      issues={req.existing}
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
      onOpenSource={req.onOpenSource}
      onClose={close}
    />
  )
}
