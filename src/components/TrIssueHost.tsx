import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
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
import Pick from './Pick'

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
  const body = () => {
    const exchanges = needFromCard('', [], comments, picked)
    const prose = need.trim() || needFromCard(desc, lists, [], new Set())
    return issueBody(req.card, [prose, exchanges].filter(Boolean).join('\n\n'))
  }
  const copyCommand = async (repoName: string, number: number) => {
    const prompt = claudePrompt(repoName, number)
    const dir = req.cloneOf(repoName)
    const text = dir ? claudeCommand(dir, prompt) : prompt
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
  }
  const create = async () => {
    if (!repo || !title.trim()) return
    setBusy(true)
    setError('')
    try {
      rememberRepo(repo, req.card.board)
      const madeIssue = await createIssue(repo.account, repo.repo, title.trim(), body())
      setMade({ ...madeIssue, repo: repo.repo })
      await copyCommand(repo.repo, madeIssue.number)
      req.onMade?.()
    } catch (e) {
      setError(shown('GitHub', e))
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="tr-sheet" role="dialog" aria-label="Nouvelle issue" onClick={() => setReq(null)}>
      <div className="tr-sheet-card" onClick={(e) => e.stopPropagation()}>
        <header className="tr-card-top">
          <strong>Issue GitHub pour {req.card.title}</strong>
          <button className="btn" onClick={() => setReq(null)}>Fermer</button>
        </header>
        {req.existing.filter((i) => i.state === 'open').length ? (
          <p className="set-hint">Cette carte a déjà une issue ouverte.</p>
        ) : null}
        <label className="set-field">
          <span>Repo</span>
          <Pick
            value={repo ? `${repo.account} ${repo.repo}` : ''}
            options={req.repos.map((r) => ({ value: `${r.account} ${r.repo}`, label: r.repo }))}
            onChange={(id) => setRepo(req.repos.find((r) => `${r.account} ${r.repo}` === id) ?? null)}
          />
        </label>
        <label className="set-field">
          <span>Titre</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="set-field">
          <span>Besoin</span>
          <textarea rows={8} value={need} onChange={(e) => setNeed(e.target.value)} />
        </label>
        {comments.length ? (
          <div>
            <div className="set-add">
              <span>Échanges</span>
              <button onClick={() => setPicked(new Set(comments.map((c) => c.id)))}>tout</button>
              <button onClick={() => setPicked(new Set())}>aucun</button>
            </div>
            {comments.map((c) => (
              <label key={c.id} className="tr-check">
                <input
                  type="checkbox"
                  checked={picked.has(c.id)}
                  onChange={() => {
                    const next = new Set(picked)
                    if (next.has(c.id)) next.delete(c.id)
                    else next.add(c.id)
                    setPicked(next)
                  }}
                />
                <span>{c.who} — {c.text.slice(0, 160)}</span>
              </label>
            ))}
          </div>
        ) : null}
        {error ? <p className="set-hint set-bad">{error}</p> : null}
        {made ? (
          <p className="set-ok">Issue #{made.number} créée. La commande est dans le presse-papiers si le navigateur l'autorise.</p>
        ) : (
          <div className="set-add">
            <button className="btn btn-primary" disabled={busy || !repo || !title.trim()} onClick={() => void create()}>
              Créer sur GitHub
            </button>
            <button
              disabled={!repo}
              onClick={() => repo && req.onOpen(newIssueUrl(repo.repo, title.trim(), body()))}
            >
              Ouvrir le formulaire
            </button>
            {req.onOpenOutside && repo ? (
              <button onClick={() => req.onOpenOutside?.(newIssueUrl(repo.repo, title.trim(), body()))}>
                ↗ navigateur
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
