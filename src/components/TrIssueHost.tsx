import { useEffect, useState } from 'react'
import { shown } from '../lib/errors'
import {
  cardText,
  claudeCommand,
  claudePrompt,
  createIssue,
  issueBody,
  needFromCard,
  newIssueUrl,
  RECENT_COMMENTS,
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
  const [picked, setPicked] = useState<Set<string>>(new Set())
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
      cardText(r.card.url)
        .then((got) => {
          const recent = got.comments.slice(-RECENT_COMMENTS).map((c) => c.id)
          const ids = new Set(r.comment ? [r.comment] : recent)
          setComments(got.comments)
          setDesc(got.text)
          setLists(got.checklists)
          setPicked(ids)
          setNeed(needFromCard(got.text, got.checklists, [], new Set()))
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
    const prose = need.trim() || needFromCard(desc, lists, [], new Set())
    return issueBody(req.card, [prose, exchanges].filter(Boolean).join('\n\n'))
  }
  const prompt = made ? claudePrompt(made.repo, made.number) : ''
  const clone = made ? req.cloneOf(made.repo) : null
  const command = clone ? claudeCommand(clone, prompt) : ''
  const copy = (what: 'command' | 'prompt', text: string) =>
    navigator.clipboard?.writeText(text).then(
      () => setCopied(what),
      () => undefined,
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
      noun="la carte"
      service="Trello"
      sourceTitle={req.card.title}
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
      recent={RECENT_COMMENTS}
      from={req.comment}
      existing={req.existing.filter((i) => i.state === 'open')}
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
      onClose={() => setReq(null)}
    />
  )
}
