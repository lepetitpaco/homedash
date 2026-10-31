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
  type TrBoard,
  type TrCard,
  type TrData,
  type TrIssue,
  type TrPosted, type TrMember } from '../lib/trello'

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

type Board = {
  id: string
  name: string
  url: string
  background: string
  background_brightness: string
  lists: { id: string; title: string; pos: number; cards: TrCard[] }[]
}

function group(cards: TrCard[], catalog: TrBoard[], hidden: string[]): Board[] {
  const off = new Set(hidden)
  const boards = new Map<string, Board>()
  for (const src of catalog) {
    if (!src.id || off.has(src.id)) continue
    boards.set(src.id, {
      id: src.id,
      name: src.name,
      url: src.url,
      background: src.background || '',
      background_brightness: src.background_brightness || '',
      lists: [...src.lists]
        .sort((a, b) => a.pos - b.pos || a.name.localeCompare(b.name, 'fr'))
        .map((l) => ({ id: l.id, title: l.name, pos: l.pos, cards: [] as TrCard[] })),
    })
  }
  const known = boards.size > 0
  for (const c of cards) {
    if (off.has(c.board_id)) continue
    let b = boards.get(c.board_id)
    if (!b) {
      if (known) continue
      b = { id: c.board_id, name: c.board, url: c.board_url, background: '', background_brightness: '', lists: [] }
      boards.set(c.board_id, b)
    }
    let list = b.lists.find((l) => l.id === c.list_id)
    if (!list) {
      if (known) continue
      list = { id: c.list_id, title: c.list, pos: c.list_pos, cards: [] }
      b.lists.push(list)
    }
    list.cards.push(c)
  }
  const out = [...boards.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  for (const b of out) {
    b.lists.sort((a, c) => a.pos - c.pos || a.title.localeCompare(c.title, 'fr'))
    for (const l of b.lists) l.cards.sort((a, c) => a.pos - c.pos || a.title.localeCompare(c.title, 'fr'))
  }
  return out
}

const ICONS = {
  clock: 'M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19Zm0 2a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM13 7v4.6l3.5 2-1 1.7L11 12.7V7h2Z',
  desc: 'M4 6h16v2H4V6Zm0 5h16v2H4v-2Zm0 5h10v2H4v-2Z',
  comment: 'M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4V5a1 1 0 0 1 1-1Zm1 2v10.8L8.3 15H19V6H5Z',
  check: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 2v14h14V5H5Zm5.5 11L7 12.5 8.4 11l2.1 2.1 5.1-5.1L17 9.4 10.5 16Z',
  done: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1.5 14.5L6 12l1.5-1.5 3 3 6-6L18 9l-7.5 7.5Z',
}
const Icon = ({ d }: { d: keyof typeof ICONS }) => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
    <path fillRule="evenodd" d={ICONS[d]} />
  </svg>
)

/** Échéance comme sur Trello : rouge en retard, jaune sous 24 h, verte si terminée. */
function Due({ c }: { c: TrCard }) {
  if (!c.due) return null
  const when = new Date(c.due)
  if (Number.isNaN(when.getTime())) return null
  const hours = (when.getTime() - Date.now()) / 3_600_000
  const cls = c.due_complete ? ' is-done' : hours < 0 ? ' is-late' : hours < 24 ? ' is-soon' : ''
  return (
    <span className={`tr-due${cls}`} title={c.due_complete ? 'Terminée' : cardDue(c)?.label}>
      <Icon d="clock" />
      {when.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
    </span>
  )
}

function Members({ c, known }: { c: TrCard; known: Map<string, TrMember> }) {
  const list = (c.member_ids ?? []).flatMap((id) => known.get(id) ?? [])
  if (!list.length) return null
  return (
    <span className="tr-members">
      {list.map((m) => (
        <span key={m.id} className="tr-member" title={m.name}>
          {m.initials}
          {m.avatar ? <img src={m.avatar} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => e.currentTarget.remove()} /> : null}
        </span>
      ))}
    </span>
  )
}

export default function TrelloView({
  data,
  error,
  hidden,
  focus,
  onHidden,
  onRefresh,
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
  onShowCard?: (c: TrCard) => void
  onTaskMenu?: (e: React.MouseEvent, c: TrCard) => void
  cloneOf?: (repo: string) => string | null
  onSettings: () => void
}) {
  const boards = useMemo(() => group(data?.cards ?? [], data?.boards ?? [], hidden), [data, hidden])
  const [view, setView] = useState(URGENT)
  const [width, setWidth] = useState(260)
  const known = useMemo(() => new Map((data?.boards ?? []).flatMap((b) => b.members ?? []).map((m) => [m.id, m])), [data?.boards])
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
  const urgent = (data.cards ?? [])
    .filter((c) => c.mine !== false && !hidden.includes(c.board_id) && isSoon(c, SOON))
    .sort((a, c) => (dayDiff(a) ?? 999) - (dayDiff(c) ?? 999) || a.pos - c.pos)
  const board = boards.find((b) => b.id === view)
  const boardName = (id: string) =>
    (data.boards ?? []).find((b) => b.id === id)?.name
    || (data.cards ?? []).find((c) => c.board_id === id)?.board
    || 'ce tableau'
  const hiddenBoards = hidden.filter((id) =>
    (data.boards ?? []).some((b) => b.id === id) || (data.cards ?? []).some((c) => c.board_id === id))

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
          const late = b.lists.flatMap((l) => l.cards).filter((c) => c.mine !== false && (dayDiff(c) ?? 1) < 0).length
          const total = b.lists.reduce((n, l) => n + l.cards.length, 0)
          return (
            <button key={b.id} className={view === b.id ? 'is-on' : ''} onClick={() => choose(b.id)}>
              <span>{b.name}</span>
              {late ? <span className="tr-count is-late">{late}</span> : <span className="tr-count">{total}</span>}
            </button>
          )
        })}
        {hiddenBoards.map((id) => (
          <button key={id} onClick={() => onHidden(hidden.filter((h) => h !== id))}>
            réafficher {boardName(id)}
          </button>
        ))}
      </nav>
      <div className={`tr-main${board ? ' is-board' : ''}`}>
        <header className="tr-head">
          <h2>{view === URGENT ? 'À traiter' : view === ISSUES ? 'Issues GitHub' : board?.name ?? 'Trello'}</h2>
          <button className="btn" title="Actualiser" onClick={onRefresh} disabled={data.building}>{data.building ? '…' : '↻'}</button>
          {board ? (
            <button className="btn" onClick={() => onHidden([...hidden, board.id])}>Masquer ce tableau</button>
          ) : null}
        </header>
        {error || data.error || msg ? <p className="gh-empty">⚠ {error || data.error || msg}</p> : null}
        {!data.loaded ? <GhEmpty>Lecture des cartes…</GhEmpty> : null}
        {data.loaded && view === URGENT ? (
          urgent.length ? (
            <div className="tr-pile">
              {urgent.map((c) => (
                <Card key={c.id} c={c} known={known} flash={flash} issues={byCard.get(c.short_link) ?? []} posted={posted}  onShowCard={onShowCard} onTaskMenu={onTaskMenu} onSend={send} busy={busy} />
              ))}
            </div>
          ) : <GhEmpty>Rien en retard ni d'échéance dans les {SOON} jours.</GhEmpty>
        ) : null}
        {data.loaded && board ? (
          <div
            className={`tr-board${board.background_brightness === 'light' ? ' is-light' : ''}`}
            style={board.background ? { backgroundImage: `url("${board.background}")` } : undefined}
          >
            {board.lists.map((l) => (
              <section key={l.id} className="tr-list">
                <h3>
                  <span className="tr-list-title">{l.title}</span>
                  <span className="tr-list-count">{l.cards.length}</span>
                </h3>
                <div className="tr-list-cards">
                  {l.cards.map((c) => (
                    <Card key={c.id} c={c} known={known} flash={flash} showMine issues={byCard.get(c.short_link) ?? []} posted={posted}  onShowCard={onShowCard} onTaskMenu={onTaskMenu} onSend={send} busy={busy} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : null}
        {view === ISSUES ? (
          <div>
            {!active.length ? <GhEmpty>Rien en attente : tous les rapports sont publiés ou écartés. 🎉</GhEmpty> : null}
            {active.map((i) => (
              <IssueRow key={issueKey(i)} i={i} posted={posted} busy={busy} cloneOf={cloneOf} notes={notes[issueKey(i)] ?? ''}
                onNotes={(v) => setNotes((m) => ({ ...m, [issueKey(i)]: v }))} onSend={() => void send(i)} onCopy={copy}
                onDismiss={async (undo) => {
                  await dismissIssue(i, undo)
                  onRefresh()
                }} />
            ))}
            {finished.length ? (
              <button className="btn" onClick={() => setShowDone((v) => !v)}>
                {showDone ? 'masquer les terminées' : finished.length > 1 ? `afficher les ${finished.length} terminées` : 'afficher la terminée'}
              </button>
            ) : null}
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
  c, known, flash, showMine, issues, posted, onShowCard, onTaskMenu, onSend, busy,
}: {
  c: TrCard
  flash: string | null
  showMine?: boolean
  known: Map<string, TrMember>
  issues: TrIssue[]
  posted: Record<string, TrPosted>
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
      onClick={onShowCard ? (e) => !(e.target as HTMLElement).closest('button') && !e.defaultPrevented && onShowCard(c) : undefined}
    >
      {c.cover ? <span className={`tr-cover tr-color-${c.cover.split('_')[0]}`} /> : null}
      {c.labels?.length ? (
        <span className="tr-labels">
          {c.labels.map((l, i) => (
            <i key={i} className={`tr-label tr-color-${l.color.split('_')[0] || 'none'}`} title={l.name || undefined} />
          ))}
        </span>
      ) : null}
      <a
        className={`tr-card-title${c.due_complete ? ' is-done' : ''}`}
        href={c.url}
        target="_blank"
        rel="noreferrer"
        // Un clic ouvre la carte ici ; ⌘ clic, le site.
        onClick={(e) => {
          e.stopPropagation()
          if (!onShowCard || e.metaKey || e.ctrlKey || e.shiftKey) return
          e.preventDefault()
          onShowCard(c)
        }}
      >
        {c.due_complete ? <Icon d="done" /> : null}
        {c.title}
      </a>
      {showMine && c.mine || c.checks || c.comments || c.due || c.has_desc || c.member_ids?.length ? (
        <div className="tr-card-foot">
          <Due c={c} />
          {c.has_desc ? <span className="tr-badge" title="Cette carte a une description"><Icon d="desc" /></span> : null}
          {c.comments ? <span className="tr-badge" title="Commentaires"><Icon d="comment" />{c.comments}</span> : null}
          {c.checks ? (
            <span className={`tr-badge${c.checks_done === c.checks ? ' is-complete' : ''}`} title="Checklist">
              <Icon d="check" />{c.checks_done}/{c.checks}
            </span>
          ) : null}
          {c.member_ids?.length && known.size ? <Members c={c} known={known} /> : showMine && c.mine ? <span className="tr-mine">toi</span> : null}
        </div>
      ) : null}
      {ready ? (
        <button className="btn" disabled={busy === ready.number} onClick={() => onSend(ready)}>📤 publier sur Trello</button>
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
    <article className="tr-issue">
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
