import { useEffect, useMemo, useState } from 'react'
import { GhEmpty } from './GhCard'
import { confirmDialog } from './ConfirmHost'
import { shown } from '../lib/errors'
import {
  claudeCommand,
  claudePrompt,
  dismissIssue,
  issueKey,
  issuesByCard,
  publishReport,
  reportPrompt,
  trKey,
} from '../lib/trIssues'
import {
  cardDue,
  dayDiff,
  isSoon,
  type TrCard,
  type TrData,
  type TrIssue,
  type TrPosted,
} from '../lib/trello'

const SOON = 7
const URGENT = 'urgent'
const ISSUES = 'issues'
const NAV_KEY = 'homedash:tr-nav-w'

let goto: ((key: string) => void) | null = null
let pending: string | null = null
let wake: (() => void) | null = null

export function showTrIssues() {
  try {
    localStorage.setItem('homedash:tr-view', ISSUES)
  } catch {
    /* stockage indisponible */
  }
  goto?.(ISSUES)
}

export function showTrTask(url: string) {
  pending = trKey(url)
  wake?.()
}

type Board = { id: string; name: string; url: string; lists: { id: string; title: string; pos: number; cards: TrCard[] }[] }

function group(cards: TrCard[], hidden: string[]): Board[] {
  const off = new Set(hidden)
  const boards = new Map<string, Board>()
  for (const c of cards) {
    if (off.has(c.board_id)) continue
    let b = boards.get(c.board_id)
    if (!b) {
      b = { id: c.board_id, name: c.board, url: c.board_url, lists: [] }
      boards.set(c.board_id, b)
    }
    let list = b.lists.find((l) => l.id === c.list_id)
    if (!list) {
      list = { id: c.list_id, title: c.list, pos: c.list_pos, cards: [] }
      b.lists.push(list)
    }
    list.cards.push(c)
  }
  const out = [...boards.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  for (const b of out) {
    b.lists.sort((a, c) => a.pos - c.pos || a.title.localeCompare(c.title, 'fr'))
    for (const l of b.lists) l.cards.sort((a, c) => (dayDiff(a) ?? 999) - (dayDiff(c) ?? 999) || a.pos - c.pos)
  }
  return out
}

function Due({ c }: { c: TrCard }) {
  const due = cardDue(c)
  return due ? <span className={`gh-badge ${due.cls}`}>{due.label}</span> : null
}

export default function TrelloView({
  data,
  error,
  hidden,
  focus,
  onHidden,
  onRefresh,
  onNewIssue,
  onShowCard,
  onTaskMenu,
  cloneOf,
  onSettings,
}: {
  data: TrData | null
  error: string | null
  hidden: string[]
  focus?: string | null
  onHidden: (hidden: string[]) => void
  onRefresh: () => void
  onNewIssue?: (c: TrCard, comment?: string) => void
  onShowCard?: (c: TrCard) => void
  onTaskMenu?: (e: React.MouseEvent, c: TrCard) => void
  cloneOf?: (repo: string) => string | null
  onSettings: () => void
}) {
  const boards = useMemo(() => group(data?.cards ?? [], hidden), [data, hidden])
  const [view, setView] = useState(URGENT)
  const [width, setWidth] = useState(260)
  const [showDone, setShowDone] = useState(false)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<number | null>(null)
  const [flash, setFlash] = useState<string | null>(focus ?? null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(NAV_KEY))
      if (v) setWidth(Math.min(560, Math.max(180, v)))
      const saved = localStorage.getItem('homedash:tr-view')
      if (saved) setView(saved)
    } catch {
      /* stockage indisponible */
    }
  }, [])
  useEffect(() => {
    goto = setView
    wake = () => {
      if (!pending || !data) return
      const card = data.cards.find((c) => c.short_link === pending)
      if (!card) return
      setView(card.board_id || URGENT)
      setFlash(pending)
      pending = null
      window.setTimeout(() => setFlash(null), 4000)
    }
    wake()
    return () => {
      goto = null
      wake = null
    }
  }, [data])
  useEffect(() => {
    if (focus) setFlash(focus)
  }, [focus])

  const choose = (key: string) => {
    setView(key)
    try {
      localStorage.setItem('homedash:tr-view', key)
    } catch {
      /* stockage indisponible */
    }
  }

  if (!data?.configured) {
    return (
      <GhEmpty>
        Trello n'est pas relié. <button onClick={onSettings}>Régler la connexion</button>
      </GhEmpty>
    )
  }
  if (!data.enabled) {
    return (
      <GhEmpty>
        La clé est enregistrée, le jeton manque. <button onClick={onSettings}>Se connecter</button>
      </GhEmpty>
    )
  }

  const posted = data.posted ?? {}
  const issues = data.github?.issues ?? []
  const byCard = issuesByCard(issues)
  const active = issues.filter((i) => !doneOf(i, posted))
  const finished = issues.filter((i) => doneOf(i, posted))
  const urgent = (data.cards ?? []).filter((c) => !hidden.includes(c.board_id) && isSoon(c, SOON))
  const board = boards.find((b) => b.id === view)
  const hiddenBoards = [...new Set((data.cards ?? []).filter((c) => hidden.includes(c.board_id)).map((c) => c.board_id))]

  const copy = async (text: string) => {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
  }
  const send = async (i: TrIssue) => {
    const ok = await confirmDialog({
      title: 'Publier le rapport sur Trello ?',
      body: [
        `Le commentaire part sur la carte, au nom du compte connecté (${data.account || 'Trello'}).`,
        'Les personnes qui suivent la carte sont notifiées. Rien d’autre n’est modifié.',
      ],
      confirmLabel: 'Publier',
    })
    if (!ok) return
    setBusy(i.number)
    try {
      await publishReport(i)
      onRefresh()
    } catch (e) {
      setMsg(shown('Trello', e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="tr-layout">
      <nav className="tr-nav" style={{ width }}>
        <button className={view === URGENT ? 'is-on' : ''} onClick={() => choose(URGENT)}>
          🔥 À traiter <span className="tr-count">{urgent.length}</span>
        </button>
        <button className={view === ISSUES ? 'is-on' : ''} onClick={() => choose(ISSUES)}>
          🐙 Issues GitHub <span className="tr-count">{active.length}</span>
        </button>
        {boards.map((b) => {
          const late = b.lists.flatMap((l) => l.cards).filter((c) => (dayDiff(c) ?? 1) < 0).length
          return (
            <button key={b.id} className={view === b.id ? 'is-on' : ''} onClick={() => choose(b.id)}>
              <span>{b.name}</span>
              {late ? <span className="tr-count is-late">{late}</span> : <span className="tr-count">{b.lists.reduce((n, l) => n + l.cards.length, 0)}</span>}
            </button>
          )
        })}
        {hiddenBoards.map((id) => (
          <button key={id} onClick={() => onHidden(hidden.filter((h) => h !== id))}>
            réafficher {id}
          </button>
        ))}
      </nav>
      <div className="tr-main">
        <header className="group-head">
          <h2>{view === URGENT ? 'À traiter' : view === ISSUES ? 'Issues GitHub' : board?.name ?? 'Trello'}</h2>
          <button onClick={onRefresh} disabled={data.building}>{data.building ? '…' : '↻'}</button>
          {board ? (
            <button onClick={() => onHidden([...hidden, board.id])}>Masquer ce tableau</button>
          ) : null}
        </header>
        {error || data.error || msg ? <p className="gh-empty">⚠ {error || data.error || msg}</p> : null}
        {!data.loaded ? <GhEmpty>Lecture des cartes…</GhEmpty> : null}
        {data.loaded && view === URGENT ? (
          urgent.length ? (
            <div className="tr-lists">
              <section className="tr-list">
                {urgent.map((c) => (
                  <Card key={c.id} c={c} flash={flash} issues={byCard.get(c.short_link) ?? []} posted={posted}
                    onNewIssue={onNewIssue} onShowCard={onShowCard} onTaskMenu={onTaskMenu} onSend={send} busy={busy} />
                ))}
              </section>
            </div>
          ) : <GhEmpty>Rien en retard ni d'échéance dans les {SOON} jours.</GhEmpty>
        ) : null}
        {data.loaded && board ? (
          <div className="tr-lists">
            {board.lists.map((l) => (
              <section key={l.id} className="tr-list">
                <h3>{l.title}</h3>
                {l.cards.map((c) => (
                  <Card key={c.id} c={c} flash={flash} issues={byCard.get(c.short_link) ?? []} posted={posted}
                    onNewIssue={onNewIssue} onShowCard={onShowCard} onTaskMenu={onTaskMenu} onSend={send} busy={busy} />
                ))}
              </section>
            ))}
          </div>
        ) : null}
        {view === ISSUES ? (
          <div>
            {active.map((i) => (
              <IssueRow key={issueKey(i)} i={i} posted={posted} busy={busy} cloneOf={cloneOf} notes={notes[issueKey(i)] ?? ''}
                onNotes={(v) => setNotes((m) => ({ ...m, [issueKey(i)]: v }))} onSend={() => void send(i)} onCopy={copy}
                onDismiss={async (undo) => {
                  await dismissIssue(i, undo)
                  onRefresh()
                }} />
            ))}
            <button onClick={() => setShowDone((v) => !v)}>{showDone ? 'masquer les terminées' : 'afficher les terminées'}</button>
            {showDone ? finished.map((i) => (
              <IssueRow key={issueKey(i)} i={i} posted={posted} busy={busy} cloneOf={cloneOf} notes={notes[issueKey(i)] ?? ''}
                onNotes={(v) => setNotes((m) => ({ ...m, [issueKey(i)]: v }))} onSend={() => void send(i)} onCopy={copy}
                onDismiss={async (undo) => {
                  await dismissIssue(i, undo)
                  onRefresh()
                }} />
            )) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function doneOf(i: TrIssue, posted: Record<string, TrPosted>): 'posted' | 'dismissed' | 'dropped' | null {
  if (i.report && posted[String(i.report.id)]?.url) return 'posted'
  if (posted[issueKey(i)]?.dismissed) return 'dismissed'
  if (i.state === 'closed' && !i.report) return 'dropped'
  return null
}

function Card({
  c, flash, issues, posted, onNewIssue, onShowCard, onTaskMenu, onSend, busy,
}: {
  c: TrCard
  flash: string | null
  issues: TrIssue[]
  posted: Record<string, TrPosted>
  onNewIssue?: (c: TrCard) => void
  onShowCard?: (c: TrCard) => void
  onTaskMenu?: (e: React.MouseEvent, c: TrCard) => void
  onSend: (i: TrIssue) => void
  busy: number | null
}) {
  const open = issues.filter((i) => !doneOf(i, posted))
  const ready = open.find((i) => i.report && !posted[String(i.report.id)]?.url)
  return (
    <article
      className={`tr-card${(dayDiff(c) ?? 1) < 0 ? ' is-late' : ''}${flash === c.short_link ? ' is-focus' : ''}`}
      onContextMenu={(e) => onTaskMenu?.(e, c)}
    >
      <div className="tr-card-top">
        <a href={c.url} target="_blank" rel="noreferrer">{c.title}</a>
        <span className="tr-card-actions">
          {onShowCard ? <button title="Voir la carte et ses échanges" onClick={() => onShowCard(c)}>💬</button> : null}
          {onNewIssue ? <button title="Créer une issue GitHub" onClick={() => onNewIssue(c)}>🐙＋</button> : null}
        </span>
      </div>
      <div>
        {c.checks ? <span>{c.checks_done}/{c.checks} cases</span> : null}
        {c.comments ? <span> · 💬 {c.comments}</span> : null}
        {' '}<Due c={c} />
      </div>
      {ready ? (
        <button disabled={busy === ready.number} onClick={() => onSend(ready)}>📤 publier sur Trello</button>
      ) : null}
    </article>
  )
}

function IssueRow({
  i, posted, busy, cloneOf, notes, onNotes, onSend, onCopy, onDismiss,
}: {
  i: TrIssue
  posted: Record<string, TrPosted>
  busy: number | null
  cloneOf?: (repo: string) => string | null
  notes: string
  onNotes: (v: string) => void
  onSend: () => void
  onCopy: (text: string) => Promise<void>
  onDismiss: (undo?: boolean) => Promise<void>
}) {
  const done = doneOf(i, posted)
  const link = i.report ? posted[String(i.report.id)]?.url : ''
  return (
    <article className="tr-card">
      <a href={i.url} target="_blank" rel="noreferrer">{i.state === 'closed' ? '✓' : '●'} {i.repo} #{i.number} {i.title}</a>
      <div className="set-add">
        <button onClick={() => void onCopy(cloneOf?.(i.repo) ? claudeCommand(cloneOf(i.repo) as string, claudePrompt(i.repo, i.number)) : claudePrompt(i.repo, i.number))}>
          ▶ prompt de départ
        </button>
        {i.report && !link ? (
          <button disabled={busy === i.number} onClick={onSend}>📤 publier sur Trello</button>
        ) : null}
        {link ? <a href={link} target="_blank" rel="noreferrer">✓ publié</a> : null}
        {done === 'dismissed' || done === 'dropped' ? (
          <button onClick={() => void onDismiss(true)}>rétablir</button>
        ) : (
          <button onClick={() => void onDismiss(false)}>✕</button>
        )}
      </div>
      <label className="set-field">
        <span>📝 rapport final</span>
        <input value={notes} onChange={(e) => onNotes(e.target.value)} placeholder="précisions facultatives" />
        <button onClick={() => void onCopy(reportPrompt(i.repo, i.number, notes))}>Copier le prompt</button>
      </label>
    </article>
  )
}
