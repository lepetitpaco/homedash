import { useEffect, useRef, useState } from 'react'
import { shown } from '../lib/errors'
import {
  cardText,
  claudeCommand,
  claudePrompt,
  createIssue,
  issueBody,
  needFromCard,
  newIssueUrl,
  rememberRepo,
  rememberedRepo,
  type IssueCard,
  type IssueRepo,
  type TrComment,
} from '../lib/trIssues'
import type { TrIssue } from '../lib/trello'
import IssueComposer from './IssueComposer'

export type TrIssueRequest = {
  repos: IssueRepo[]
  card: IssueCard
  existing: TrIssue[]
  comment?: string
  /** Lire la carte, ou préparer directement l'issue. */
  start: 'read' | 'issue'
  /** Ouvrir la carte sur Trello. */
  onOpenSource: () => void
  cloneOf: (repo: string) => string | null
  onOpen: (url: string) => void
  onOpenOutside?: (url: string) => void
  onMade?: () => void
}

let show: ((r: TrIssueRequest) => void) | null = null

export function askTrIssue(r: TrIssueRequest) {
  show?.(r)
}

export default function TrIssueHost() {
  const [req, setReq] = useState<TrIssueRequest | null>(null)
  const [repo, setRepo] = useState<IssueRepo | null>(null)
  const [title, setTitle] = useState('')
  const [need, setNeed] = useState('')
  const [lists, setLists] = useState<{ name: string; items: { title: string; completed: boolean }[] }[]>([])
  const [desc, setDesc] = useState('')
  const [comments, setComments] = useState<TrComment[]>([])
  const [images, setImages] = useState<Record<string, string>>({})
  const [descPicked, setDescPicked] = useState(true)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const asked = useRef(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [made, setMade] = useState<{ number: number; url: string; repo: string } | null>(null)
  const [copied, setCopied] = useState('')
  const [reading, setReading] = useState(false)

  useEffect(() => {
    show = (r) => {
      setReq(r)
      setRepo(rememberedRepo(r.repos, r.card.board) ?? null)
      setTitle(r.card.title)
      setNeed('')
      setDesc('')
      setLists([])
      setComments([])
      setPicked(new Set())
      setBusy(false)
      setError('')
      setMade(null)
      setCopied('')
      setReading(true)
      setImages({})
      setDescPicked(!(r.start === 'issue' && r.comment))
      const n = ++asked.current
      cardText(r.card.url)
        .then((got) => {
          if (n !== asked.current) return
          // Trello donne le plus récent d'abord ; une conversation se lit dans l'autre sens.
          setComments([...got.comments].reverse())
          setDesc(got.text)
          setLists(got.checklists)
          setImages(got.images)
          // Tout est retenu par défaut, sauf une issue sur un échange précis : lui seul.
          setPicked(new Set(r.comment && r.start === 'issue' ? [r.comment] : got.comments.map((c) => c.id)))
        })
        .catch((e: unknown) => setError(shown('Trello', e)))
        .finally(() => setReading(false))
    }
    return () => {
      show = null
    }
  }, [])

  if (!req) return null
  const body = () => {
    const exchanges = needFromCard('', [], comments, picked)
    const described = descPicked ? needFromCard(desc, lists, [], new Set()) : ''
    return issueBody(req.card, [need.trim(), described, exchanges].filter(Boolean).join('\n\n'))
  }
  const prompt = made ? claudePrompt(made.repo, made.number) : ''
  const clone = made ? req.cloneOf(made.repo) : null
  const command = clone ? claudeCommand(clone, prompt) : ''
  const copy = (what: 'command' | 'prompt', text: string) =>
    navigator.clipboard?.writeText(text).then(
      () => setCopied(what),
      () => setCopied('failed'),
    )
  const create = async () => {
    if (!repo || !title.trim()) return
    setBusy(true)
    setError('')
    try {
      rememberRepo(repo, req.card.board)
      const madeIssue = await createIssue(repo.account, repo.repo, title.trim(), body())
      setMade({ ...madeIssue, repo: repo.repo })
      // déjà dans le presse-papiers : il n'y a plus qu'à coller dans un terminal (ou Claude Code)
      const p = claudePrompt(repo.repo, madeIssue.number)
      const dir = req.cloneOf(repo.repo)
      void (dir ? copy('command', claudeCommand(dir, p)) : copy('prompt', p))
      req.onMade?.()
    } catch (e) {
      setError(shown('GitHub', e))
    } finally {
      setBusy(false)
    }
  }

  const shownDesc = desc.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (all, name: string, url: string) => {
    const hit = Object.entries(images).find(([, link]) => link === url)
    return hit ? `![${name}](api/trello/file?${new URLSearchParams({ url: hit[1] })})` : all
  })
  const extra =
    lists.length || Object.keys(images).length ? (
      <>
        {Object.entries(images).map(([name, url]) => (
          <img key={url} className="ic-image" alt={name} src={`api/trello/file?${new URLSearchParams({ url })}`} />
        ))}
        {lists.map((cl) => (
          <div key={cl.name} className="ic-steps">
            <strong>{cl.name}</strong>
            {cl.items.map((it) => (
              <span key={it.title} className={it.completed ? 'is-done' : ''}>{it.completed ? '☑' : '☐'} {it.title}</span>
            ))}
          </div>
        ))}
      </>
    ) : null

  const openForm = (outside: boolean) => {
    if (!repo) return
    const url = newIssueUrl(repo.repo, title.trim(), body())
    if (outside) req.onOpenOutside?.(url)
    else req.onOpen(url)
    setReq(null)
  }
  const toggle = (id: string) => {
    const next = new Set(picked)
    if (!next.delete(id)) next.add(id)
    setPicked(next)
  }

  return (
    <IssueComposer
      key={asked.current}
      noun="la carte"
      service="Trello"
      sourceTitle={req.card.title}
      where={req.card.where}
      start={req.start}
      description={shownDesc}
      extra={extra}
      descPicked={descPicked}
      onDescPicked={setDescPicked}
      repos={req.repos}
      repo={repo}
      onRepo={setRepo}
      title={title}
      onTitle={setTitle}
      need={need}
      onNeed={setNeed}
      reading={reading}
      comments={comments}
      isPicked={(id) => picked.has(id as string)}
      onToggle={(id) => toggle(id as string)}
      onPick={(ids) => setPicked(new Set(ids as string[]))}
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
      onClose={() => setReq(null)}
    />
  )
}
