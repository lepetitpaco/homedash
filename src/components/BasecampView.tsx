import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { GhEmpty } from './GhCard'
import { ago } from '../lib/ghboard'
import { dueOf, projectKey, type BcBoard, type BcData, type BcIssue, type BcPosted, type BcTask } from '../lib/basecamp'
import { bcKey, dismissIssue, issuesByTask, publishReport, reportPrompt } from '../lib/bcIssues'
import { confirmDialog } from './ConfirmHost'
import { shown as errorText } from '../lib/errors'
import { Markdown } from '../lib/markdown'

/** Couleurs de colonne Basecamp → pastille. Inconnue ou absente = neutre. */
const COLUMN_COLOR: Record<string, string> = {
  white: '#e5e7eb', red: '#ef4444', orange: '#f97316', yellow: '#eab308', green: '#22c55e',
  blue: '#3b82f6', aqua: '#06b6d4', purple: '#a855f7', pink: '#ec4899', brown: '#a16207',
  gray: '#9ca3af',
}

// ── Regroupement ─────────────────────────────────────────────────────────────
type Prio = BcTask & { prio: boolean }

type Column = { key: string; title: string; color: string | null; tasks: Prio[] }
type Board = { key: string; title: string; url: string; columns: Column[] }
type List = { key: string; title: string; url: string; tasks: Prio[] }
type Project = { key: string; name: string; url: string; lists: List[]; boards: Board[]; count: number; late: number }

/** Up Next d'abord, puis par échéance (sans échéance en dernier), puis l'ordre Basecamp. */
function byUrgency(a: Prio, b: Prio): number {
  if (a.prio !== b.prio) return a.prio ? -1 : 1
  if (a.due_on === b.due_on) return 0
  if (!a.due_on) return 1
  if (!b.due_on) return -1
  return a.due_on < b.due_on ? -1 : 1
}

function firstDue(tasks: Prio[]): string {
  return tasks.reduce((m, t) => (t.due_on && t.due_on < m ? t.due_on : m), '9999')
}

function group(data: BcData): Project[] {
  const all: Prio[] = [
    ...data.tasks.priorities.map((t) => ({ ...t, prio: true })),
    ...data.tasks.others.map((t) => ({ ...t, prio: false })),
  ]
  const projects = new Map<string, Project>()
  const lists = new Map<string, List>()
  const boards = new Map<string, Board>()

  for (const t of all) {
    const pk = projectKey(t)
    let p = projects.get(pk)
    if (!p) {
      p = { key: pk, name: t.project || 'Sans projet', url: t.project_url, lists: [], boards: [], count: 0, late: 0 }
      projects.set(pk, p)
    }
    p.count++
    if (dueOf(t.due_on)?.rank === 0) p.late++

    if (t.kind !== 'card') {
      const lk = `${pk}/${t.list_url || t.list}`
      let l = lists.get(lk)
      if (!l) {
        l = { key: lk, title: t.list || 'Sans liste', url: t.list_url, tasks: [] }
        lists.set(lk, l)
        p.lists.push(l)
      }
      l.tasks.push(t)
      continue
    }

    // Carte : son tableau si on a pu le lire, sinon un tableau « inconnu » par projet.
    const known: BcBoard | undefined = t.board_id ? data.boards[String(t.board_id)] : undefined
    const bk = known ? `b${t.board_id}` : `${pk}/?`
    let b = boards.get(bk)
    if (!b) {
      b = {
        key: bk,
        title: known?.title ?? 'Tableau',
        url: known?.url ?? '',
        columns: (known?.columns ?? []).map((c) => ({ key: String(c.id), title: c.title, color: c.color, tasks: [] })),
      }
      boards.set(bk, b)
      p.boards.push(b)
    }
    const ck = known && t.column_id ? String(t.column_id) : `?${t.list}`
    let c = b.columns.find((x) => x.key === ck)
    if (!c) {
      c = { key: ck, title: t.list || 'Colonne', color: null, tasks: [] }
      b.columns.push(c)
    }
    c.tasks.push(t)
  }

  const out = [...projects.values()]
  for (const p of out) {
    for (const l of p.lists) l.tasks.sort(byUrgency)
    p.lists.sort((a, b) => firstDue(a.tasks).localeCompare(firstDue(b.tasks)) || a.title.localeCompare(b.title, 'fr'))
    for (const b of p.boards) {
      // Seules les colonnes où j'ai des cartes, dans l'ordre du tableau.
      b.columns = b.columns.filter((c) => c.tasks.length)
      for (const c of b.columns) c.tasks.sort(byUrgency)
    }
  }
  // Ordre alphabétique : un projet ne change pas de place d'une lecture à l'autre.
  return out.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

// ── Rendu ────────────────────────────────────────────────────────────────────
function Due({ t }: { t: BcTask }) {
  const due = dueOf(t.due_on)
  return due ? (
    <span className={`gh-badge ${due.cls}`} title={`Échéance : ${t.due_on}`}>
      {due.label}
    </span>
  ) : null
}

function Extras({ t }: { t: BcTask }) {
  const done = t.steps.filter((s) => s.completed).length
  const bits = [t.steps.length ? `étapes ${done}/${t.steps.length}` : '', t.comments ? `💬 ${t.comments}` : '']
    .filter(Boolean)
    .join(' · ')
  return bits ? <span className="bc-extra">{bits}</span> : null
}

// ── Issues GitHub liées ──────────────────────────────────────────────────────
type Posted = Record<string, BcPosted>
type Issues = {
  byTask: Map<string, BcIssue[]>
  /** Issues traitées (serveur) : rapport publié (id du commentaire) ou issue écartée (`repo#n`). */
  posted: Posted
  /** Publication en cours (id du rapport). */
  busy: number | null
  onSend: (i: BcIssue) => void
  onDismiss: (i: BcIssue, undo?: boolean) => void
  onTaskMenu?: (e: React.MouseEvent, t: BcTask) => void
  /** 🐙 au survol d'une tâche : en faire une issue (absent : aucun repo où la créer). */
  onNewIssue?: (t: BcTask) => void
}
const IssuesCtx = createContext<Issues>({
  byTask: new Map(),
  posted: {},
  busy: null,
  onSend: () => undefined,
  onDismiss: () => undefined,
})

const issueKey = (i: BcIssue) => `${i.repo}#${i.number}`

/**
 * Pourquoi une issue n'est plus affichée : rapport publié, écartée à la main, ou
 * fermée sans rapport (abandonnée : rien à publier). `null` = en cours.
 */
function doneOf(i: BcIssue, posted: Posted): 'posted' | 'dismissed' | 'dropped' | null {
  if (i.report && posted[String(i.report.id)]) return 'posted'
  if (posted[issueKey(i)]) return 'dismissed'
  if (i.state === 'closed' && !i.report) return 'dropped'
  return null
}

/** ✕ : écarter une issue sans publier (rien n'est envoyé). */
function Dismiss({ i }: { i: BcIssue }) {
  const { onDismiss } = useContext(IssuesCtx)
  return (
    <button
      className="bc-dismiss"
      title="Ignorer : ne pas publier sur Basecamp, et ne plus l'afficher (réversible)"
      onClick={() => onDismiss(i)}
    >
      ✕
    </button>
  )
}

/** Rapport d'une issue : le publier en commentaire de la tâche, ou ce qu'il en est advenu. */
function SendReport({ i }: { i: BcIssue }) {
  const { posted, busy, onSend, onDismiss } = useContext(IssuesCtx)
  const done = doneOf(i, posted)
  if (done === 'posted' && i.report) {
    const at = posted[String(i.report.id)]
    return (
      <a className="bc-send is-done" href={at.url} target="_blank" rel="noreferrer" title="Voir le commentaire sur Basecamp">
        ✓ publié
      </a>
    )
  }
  if (done === 'dismissed')
    return (
      <button className="bc-send is-done" title="Remettre dans les issues en cours" onClick={() => onDismiss(i, true)}>
        ignorée · rétablir
      </button>
    )
  if (done === 'dropped') return <span className="bc-extra">fermée sans rapport</span>
  if (!i.report) return <Dismiss i={i} />
  return (
    <>
      <button
        className="bc-send"
        disabled={busy !== null}
        title="Publier le rapport de l'issue en commentaire de la tâche Basecamp"
        onClick={() => onSend(i)}
      >
        {busy === i.report.id ? 'publication…' : '📤 publier sur BC'}
      </button>
      <Dismiss i={i} />
    </>
  )
}

/**
 * Issues en cours d'une tâche : numéro (lien), état, et le rapport à publier s'il y
 * en a un ; puis 🐙, au survol, pour en créer une.
 */
function TaskIssues({ t }: { t: BcTask }) {
  const { byTask, posted, onNewIssue } = useContext(IssuesCtx)
  const key = bcKey(t.url)
  const issues = (key ? byTask.get(key) : undefined)?.filter((i) => !doneOf(i, posted)) ?? []
  if (!issues.length && !onNewIssue) return null
  return (
    <span className="bc-issues">
      {issues.map((i) => (
        <span key={issueKey(i)} className="bc-issue">
          <a
            className={`bc-issue-link${i.state === 'closed' ? ' is-closed' : ''}`}
            href={i.url}
            target="_blank"
            rel="noreferrer"
            title={`${i.repo} #${i.number} — ${i.title} (${i.state === 'closed' ? 'fermée' : 'ouverte'})`}
          >
            {i.state === 'closed' ? '✓' : '●'} #{i.number}
          </a>
          {i.report ? <SendReport i={i} /> : null}
        </span>
      ))}
      {onNewIssue ? (
        <button className="bc-new-issue" title="Créer une issue GitHub pour cette tâche" onClick={() => onNewIssue(t)}>
          🐙＋
        </button>
      ) : null}
    </span>
  )
}

/**
 * « 📝 rapport final » : précisions facultatives, puis le prompt qui demande à
 * Claude Code de tout vérifier et de poster le rapport final (copié).
 */
function AskReport({ i, onClose }: { i: BcIssue; onClose: () => void }) {
  const [notes, setNotes] = useState('')
  const [copied, setCopied] = useState(false)
  const prompt = reportPrompt(i.repo, i.number, notes)
  const copy = () =>
    void navigator.clipboard?.writeText(prompt).then(
      () => setCopied(true),
      () => undefined,
    )
  return (
    <div className="bc-ask-report">
      <textarea
        className="issue-need"
        rows={3}
        value={notes}
        autoFocus
        placeholder="Précisions pour le rapport (facultatif) : insiste sur…, ajoute…, ne parle pas de…"
        onChange={(e) => {
          setNotes(e.target.value)
          setCopied(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) copy()
          if (e.key === 'Escape') onClose()
        }}
      />
      {navigator.clipboard ? (
        <span className="bc-ask-foot">
          <span className="set-hint">À coller dans la session Claude Code qui a fait le travail.</span>
          <button className="btn" onClick={onClose}>
            Fermer
          </button>
          <button className="btn btn-primary" onClick={copy}>
            {copied ? '✓ Copié' : 'Copier le prompt'}
          </button>
        </span>
      ) : (
        <pre className="issue-prompt">{prompt}</pre>
      )}
    </div>
  )
}

/** Issues liées en cours (rapport à publier d'abord) ; les terminées, sur demande. */
function IssueList({ issues }: { issues: BcIssue[] }) {
  const { posted } = useContext(IssuesCtx)
  const [showDone, setShowDone] = useState(false)
  /** Issue dont on prépare le prompt « rapport final » (`issueKey`). */
  const [asking, setAsking] = useState<string | null>(null)
  if (!issues.length)
    return (
      <GhEmpty>
        Aucune issue liée. Clic droit sur une tâche → « Créer une issue dans… » : l'issue garde le lien vers la
        tâche, et son rapport s'affiche ici.
      </GhEmpty>
    )
  const open = issues.filter((i) => !doneOf(i, posted))
  const done = issues.filter((i) => doneOf(i, posted))
  // rapport à publier d'abord
  const rows = [...open.sort((a, b) => Number(!!b.report) - Number(!!a.report)), ...(showDone ? done : [])]
  return (
    <>
      {!open.length ? <GhEmpty>Rien en attente : tous les rapports sont publiés ou écartés. 🎉</GhEmpty> : null}
      {rows.map((i) => (
        <div key={issueKey(i)} className={`bc-list bc-issue-row${doneOf(i, posted) ? ' is-done' : ''}`}>
          <div className="bc-task">
            <div className="bc-task-main">
              <a className="gh-title" href={i.url} target="_blank" rel="noreferrer" title={i.title}>
                {i.state === 'closed' ? '✓' : '●'} {i.title}
              </a>
              <a className="bc-where" href={i.bc_url} target="_blank" rel="noreferrer" title="Ouvrir la tâche Basecamp">
                {i.repo} #{i.number} · {i.report ? 'rapport prêt' : 'en attente du rapport'} · tâche Basecamp ↗
              </a>
            </div>
            <span className="bc-issue-actions">
              {/* aussi sur une terminée : un rapport corrigé repart sur Basecamp */}
              <button
                className="bc-send is-done"
                title="Demander à Claude Code de tout vérifier et de poster le rapport final (avec tes précisions)"
                onClick={() => setAsking(asking === issueKey(i) ? null : issueKey(i))}
              >
                📝 rapport final
              </button>
              <SendReport i={i} />
            </span>
          </div>
          {asking === issueKey(i) ? <AskReport i={i} onClose={() => setAsking(null)} /> : null}
          {i.report && !doneOf(i, posted) ? (
            <div className="bc-report">
              <Markdown text={i.report.body} />
            </div>
          ) : null}
        </div>
      ))}
      {done.length ? (
        <button className="bell-link bc-done-toggle" onClick={() => setShowDone(!showDone)}>
          {showDone ? 'masquer les terminées' : `afficher les ${done.length} terminée${done.length > 1 ? 's' : ''}`}
        </button>
      ) : null}
    </>
  )
}

function Title({ t }: { t: Prio }) {
  const { onTaskMenu } = useContext(IssuesCtx)
  return (
    <a
      className="gh-title"
      href={t.url}
      target="_blank"
      rel="noreferrer"
      title={t.title}
      onContextMenu={onTaskMenu ? (e) => onTaskMenu(e, t) : undefined}
    >
      {t.prio ? (
        <span className="bc-prio" title="Up Next">
          ⭐{' '}
        </span>
      ) : null}
      {t.title}
    </a>
  )
}

function TaskLine({ t }: { t: Prio }) {
  return (
    <div className={`bc-task${dueOf(t.due_on)?.rank === 0 ? ' is-late' : ''}`}>
      <Title t={t} />
      <TaskIssues t={t} />
      <Extras t={t} />
      <Due t={t} />
    </div>
  )
}

function KanbanCard({ t }: { t: Prio }) {
  return (
    <div className={`bc-card${dueOf(t.due_on)?.rank === 0 ? ' is-late' : ''}`}>
      <Title t={t} />
      <div className="bc-card-foot">
        <TaskIssues t={t} />
        <Extras t={t} />
        <Due t={t} />
      </div>
    </div>
  )
}

// ── Navigation : projets, puis leurs tableaux ────────────────────────────────
const VIEW_KEY = 'homedash:bc-view'
const URGENT = 'urgent'
const ISSUES = 'issues'

/** Vue affichée si l'onglet est monté ; sinon retenue pour son ouverture. */
let goto: ((key: string) => void) | null = null

/** Ouvre la vue « Issues GitHub » (clic sur « rapport prêt » dans la cloche). */
export function showBcIssues() {
  saveView(ISSUES)
  goto?.(ISSUES)
}
/** « À traiter » : en retard, ou dû dans les 7 jours. */
const SOON_DAYS = 7

type Entry = { key: string; label: string; icon: string; count: number; late: number }

function lateIn(tasks: BcTask[]): number {
  return tasks.filter((t) => dueOf(t.due_on)?.rank === 0).length
}

/** Niveau 2 d'un projet : ses to-dos (toutes listes), puis un par tableau. */
function entriesOf(p: Project): Entry[] {
  const todos = p.lists.flatMap((l) => l.tasks)
  return [
    ...(todos.length
      ? [{ key: `${p.key}::todos`, label: 'To-dos', icon: '☑', count: todos.length, late: lateIn(todos) }]
      : []),
    ...p.boards.map((b) => {
      const cards = b.columns.flatMap((c) => c.tasks)
      return { key: `${p.key}::${b.key}`, label: b.title, icon: '▦', count: cards.length, late: lateIn(cards) }
    }),
  ]
}

/** Largeur du menu, réglée en glissant sa poignée. Préférence du navigateur. */
const NAV_KEY = 'homedash:bc-nav-w'
const NAV_W = { min: 180, def: 260, max: 560 }

function readNavW(): number {
  try {
    const v = Number(localStorage.getItem(NAV_KEY))
    return v ? Math.min(NAV_W.max, Math.max(NAV_W.min, v)) : NAV_W.def
  } catch {
    return NAV_W.def
  }
}

function saveNavW(w: number) {
  try {
    localStorage.setItem(NAV_KEY, String(w))
  } catch {
    /* stockage indisponible */
  }
}

/** Poignée entre le menu et le contenu : glisser élargit, double-clic remet la largeur par défaut. */
function NavResizer({ width, onWidth }: { width: number; onWidth: (w: number) => void }) {
  const [drag, setDrag] = useState<{ x: number; w: number } | null>(null)
  const clamp = (w: number) => Math.round(Math.min(NAV_W.max, Math.max(NAV_W.min, w)))
  return (
    <div
      className={`bc-resizer${drag ? ' is-dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={NAV_W.min}
      aria-valuemax={NAV_W.max}
      tabIndex={0}
      title="Glisser pour élargir le menu · double-clic : largeur par défaut"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setDrag({ x: e.clientX, w: width })
      }}
      onPointerMove={(e) => drag && onWidth(clamp(drag.w + e.clientX - drag.x))}
      onPointerUp={() => {
        setDrag(null)
        saveNavW(width)
      }}
      onDoubleClick={() => {
        onWidth(NAV_W.def)
        saveNavW(NAV_W.def)
      }}
      onKeyDown={(e) => {
        const step = e.key === 'ArrowRight' ? 20 : e.key === 'ArrowLeft' ? -20 : 0
        if (!step) return
        const w = clamp(width + step)
        onWidth(w)
        saveNavW(w)
      }}
    >
      <span className="bc-resizer-grip" aria-hidden="true" />
    </div>
  )
}

/** Vue choisie : préférence d'affichage, propre au navigateur. */
function readView(): string | null {
  try {
    return localStorage.getItem(VIEW_KEY)
  } catch {
    return null
  }
}

function saveView(key: string) {
  try {
    localStorage.setItem(VIEW_KEY, key)
  } catch {
    /* stockage indisponible */
  }
}

function daysUntil(due: string | null): number | null {
  if (!due) return null
  const [y, m, d] = due.split('-').map(Number)
  if (!y || !m || !d) return null
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  return Math.round((new Date(y, m - 1, d).getTime() - start) / 86_400_000)
}

type Located = { t: Prio; where: string; open: string }

/** Toutes les tâches des projets affichés, avec où elles vivent (projet › tableau ou liste). */
function locate(projects: Project[]): Located[] {
  const out: Located[] = []
  for (const p of projects) {
    for (const l of p.lists)
      for (const t of l.tasks) out.push({ t, where: `${p.name} › ${l.title}`, open: `${p.key}::todos` })
    for (const b of p.boards)
      for (const c of b.columns)
        for (const t of c.tasks) out.push({ t, where: `${p.name} › ${b.title} › ${c.title}`, open: `${p.key}::${b.key}` })
  }
  return out
}

function TodoLists({ lists }: { lists: List[] }) {
  return (
    <>
      {lists.map((l) => (
        <div key={l.key} className="bc-list">
          <div className="bc-sub">
            {l.url ? (
              <a href={l.url} target="_blank" rel="noreferrer">
                {l.title}
              </a>
            ) : (
              l.title
            )}
          </div>
          {l.tasks.map((t) => (
            <TaskLine key={t.id} t={t} />
          ))}
        </div>
      ))}
    </>
  )
}

function BoardColumns({ b }: { b: Board }) {
  return (
    // Au moins quatre cases par ligne : un tableau à une colonne en prend une,
    // pas toute la largeur ; au-delà, les colonnes se partagent la ligne.
    <div className="bc-columns" style={{ ['--bc-cols' as string]: Math.max(4, b.columns.length) }}>
      {b.columns.map((c) => (
        <div key={c.key} className="bc-column">
          <div className="bc-column-head">
            <span
              className="bc-dot"
              style={{ background: (c.color && COLUMN_COLOR[c.color]) || 'var(--text-faint)' }}
            />
            <span className="bc-column-title" title={c.title}>
              {c.title}
            </span>
            <span className="bc-column-count">{c.tasks.length}</span>
          </div>
          {c.tasks.map((t) => (
            <KanbanCard key={t.id} t={t} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** « À traiter » : ce qui est en retard ou arrive dans la semaine, tous projets confondus. */
function Urgent({ items, onOpen }: { items: Located[]; onOpen: (key: string) => void }) {
  const groups = [
    { title: 'En retard', test: (d: number) => d < 0 },
    { title: "Aujourd'hui", test: (d: number) => d === 0 },
    { title: `Dans les ${SOON_DAYS} jours`, test: (d: number) => d > 0 && d <= SOON_DAYS },
  ]
  const dated = items
    .map((it) => ({ ...it, d: daysUntil(it.t.due_on) }))
    .filter((it): it is Located & { d: number } => it.d !== null && it.d <= SOON_DAYS)
    .sort((a, b) => a.d - b.d)
  if (!dated.length) return <GhEmpty>Rien en retard ni d'échéance dans les {SOON_DAYS} jours. 🎉</GhEmpty>
  return (
    <>
      {groups.map((g) => {
        const rows = dated.filter((it) => g.test(it.d))
        if (!rows.length) return null
        return (
          <div key={g.title} className="bc-list">
            <div className="bc-sub">
              {g.title} <span className="bc-nav-count">{rows.length}</span>
            </div>
            {rows.map((it) => (
              <div key={it.t.id} className={`bc-task${it.d < 0 ? ' is-late' : ''}`}>
                <div className="bc-task-main">
                  <Title t={it.t} />
                  <button className="bc-where" title="Afficher dans son tableau" onClick={() => onOpen(it.open)}>
                    {it.where}
                  </button>
                </div>
                <TaskIssues t={it.t} />
                <Extras t={it.t} />
                <Due t={it.t} />
              </div>
            ))}
          </div>
        )
      })}
    </>
  )
}

/**
 * Onglet Basecamp : mes tâches, en lecture seule. Menu à gauche comme dans
 * Réglages, à deux niveaux (projets, puis leurs tableaux et to-dos) : la vue
 * d'ensemble en un coup d'œil, un clic pour afficher le contenu à droite.
 * Chaque ligne est un lien vers Basecamp ; rien n'est coché d'ici. Seule écriture :
 * publier le rapport d'une issue liée en commentaire de sa tâche (au clic, confirmé). Les
 * notifications non lues sont dans la cloche de la barre du haut (`EventBell`, filtre Basecamp).
 */
export default function BasecampView({
  data,
  error,
  hidden,
  onHidden,
  onRefresh,
  onSettings,
  onTaskMenu,
  onNewIssue,
}: {
  data: BcData | null
  error: string | null
  /** Projets masqués (config.json → `basecamp.hidden`). */
  hidden: string[]
  onHidden: (next: string[]) => void
  onRefresh: () => void
  onSettings: () => void
  /** Clic droit sur une tâche : ouvrir, créer une issue… */
  onTaskMenu?: (e: React.MouseEvent, t: BcTask) => void
  onNewIssue?: (t: BcTask) => void
}) {
  const projects = useMemo(() => (data ? group(data) : []), [data])
  const [picked, setPicked] = useState(readView)
  useEffect(() => {
    goto = setPicked
    return () => {
      goto = null
    }
  }, [])
  const [navW, setNavW] = useState(readNavW)
  const off = new Set(hidden)
  const shown = projects.filter((p) => !off.has(p.key))
  const toggle = (key: string) => onHidden(off.has(key) ? hidden.filter((h) => h !== key) : [...hidden, key])
  const located = useMemo(() => locate(shown), [shown])
  const urgentCount = located.filter((it) => {
    const d = daysUntil(it.t.due_on)
    return d !== null && d <= SOON_DAYS
  }).length

  const issues = useMemo(() => data?.github?.issues ?? [], [data])
  const byTask = useMemo(() => issuesByTask(issues), [issues])
  // publiés : ce que dit le serveur, plus ce qui vient de partir (avant sa relecture)
  // Ce que dit le serveur, et ce qui vient de changer ici (avant sa relecture) : null = retiré.
  const [patch, setPatch] = useState<Record<string, BcPosted | null>>({})
  const posted = useMemo(() => {
    const out: Posted = { ...(data?.posted ?? {}) }
    for (const [k, v] of Object.entries(patch)) {
      if (v) out[k] = v
      else delete out[k]
    }
    return out
  }, [data, patch])
  const [sending, setSending] = useState<number | null>(null)
  const [notice, setNotice] = useState('')
  const waiting = issues.filter((i) => i.report && !doneOf(i, posted)).length
  const active = issues.filter((i) => !doneOf(i, posted)).length
  const onDismiss = async (i: BcIssue, undo = false) => {
    try {
      const got = await dismissIssue(i, undo)
      setPatch((p) => ({ ...p, [issueKey(i)]: got.posted[issueKey(i)] ?? null }))
    } catch (e) {
      setNotice(errorText('Issue ignorée', e))
    }
  }
  const onSend = async (i: BcIssue) => {
    const rep = i.report
    if (!rep || sending !== null) return
    const preview = rep.body.length > 400 ? `${rep.body.slice(0, 400)}…` : rep.body
    const ok = await confirmDialog({
      title: `Publier le rapport de #${i.number} sur Basecamp ?`,
      body: [
        'Il part en commentaire de la tâche, à ton nom : les personnes qui la suivent sont notifiées.',
        preview,
      ],
      confirmLabel: 'Publier',
    })
    if (!ok) return
    setSending(rep.id)
    try {
      const done = await publishReport(i)
      setPatch((p) => ({ ...p, [String(rep.id)]: done }))
      setNotice(`Rapport de #${i.number} publié sur Basecamp.`)
      window.setTimeout(() => setNotice(''), 8000)
    } catch (e) {
      setNotice(errorText('Publication du rapport', e))
    } finally {
      setSending(null)
    }
  }

  const pick = (key: string) => {
    setPicked(key)
    saveView(key)
  }

  if (!data) {
    return <div className="gh-bar">{error ? `⚠ ${error}` : 'chargement…'}</div>
  }
  if (!data.enabled) {
    return (
      <div className="gh-bar">
        <span className="gh-bar-state">
          {data.configured ? 'Basecamp n’est pas encore connecté.' : 'Basecamp n’est pas configuré.'}{' '}
          <button className="loc-roots-edit" onClick={onSettings}>
            Réglages → Basecamp
          </button>
        </span>
      </div>
    )
  }

  const total = data.tasks.priorities.length + data.tasks.others.length
  const busy = data.building
  const all = shown.flatMap((p) => entriesOf(p).map((e) => ({ ...e, project: p })))
  // Vue mémorisée si elle existe encore ; sinon « À traiter ».
  const current = picked === URGENT || picked === ISSUES ? null : all.find((e) => e.key === picked) ?? null
  const view = current ? current.key : picked === ISSUES ? ISSUES : URGENT
  const project = current?.project
  const board = project?.boards.find((b) => current?.key === `${project.key}::${b.key}`)

  return (
    <IssuesCtx.Provider value={{
        byTask,
        posted,
        busy: sending,
        onSend: (i) => void onSend(i),
        onDismiss: (i, undo) => void onDismiss(i, undo),
        onTaskMenu,
        onNewIssue,
      }}>
      <div className="gh-bar">
        <span className="gh-bar-user">
          <span>Basecamp</span>
          {data.app_href ? (
            <a className="gh-link" href={data.app_href} target="_blank" rel="noreferrer">
              <strong>{data.account}</strong>
            </a>
          ) : (
            <strong>{data.account}</strong>
          )}
          {data.name ? <em>· {data.name}</em> : null}
        </span>
        <span className="gh-bar-sep" />
        <span className="gh-bar-state">
          {busy ? (
            <>
              <span className="gh-spin" />
              lecture en cours…
            </>
          ) : data.updated_at ? (
            `à jour ${ago(data.updated_at)}`
          ) : (
            'jamais lu'
          )}
        </span>
        <span
          className="gh-bar-stats"
          title="Cette page ne modifie rien dans Basecamp, sauf les rapports d'issues que tu choisis de publier en commentaire."
        >
          🔒 lecture seule
        </span>
        <div className="gh-bar-right">
          {notice ? <span className="bc-notice">{notice}</span> : null}
          {data.error || error ? <span className="gh-bar-err">⚠ {data.error ?? error}</span> : null}
          <button
            className={`gh-bar-btn${busy ? ' is-busy' : ''}`}
            title={`Relire maintenant (sinon toutes les ${data.every} s)`}
            onClick={onRefresh}
          >
            ↻
          </button>
        </div>
      </div>
      {busy ? <div className="gh-progress" /> : null}

      {projects.length > 1 ? (
        <div className="bc-filter" role="group" aria-label="Projets affichés">
          <span className="bc-filter-label">Projets</span>
          {projects.map((p) => (
            <button
              key={p.key}
              className={`ev-chip${off.has(p.key) ? '' : ' is-on'}`}
              title={off.has(p.key) ? 'Masqué — cliquer pour afficher' : 'Affiché — cliquer pour masquer'}
              onClick={() => toggle(p.key)}
            >
              {p.name} <span className="bc-chip-count">{p.count}</span>
              {p.late ? <span className="bc-chip-late">{p.late}</span> : null}
            </button>
          ))}
          {hidden.length ? (
            <button className="bell-link" onClick={() => onHidden([])}>
              tout afficher
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="bc-layout" style={{ ['--bc-nav-w' as string]: `${navW}px` }}>
        <nav className="bc-nav" aria-label="Projets Basecamp">
          <button
            className={`bc-nav-item is-top${view === URGENT ? ' is-active' : ''}`}
            onClick={() => pick(URGENT)}
            title={`En retard ou dû dans les ${SOON_DAYS} jours, tous projets affichés`}
          >
            <span aria-hidden="true">🔥</span>
            <span className="bc-nav-label">À traiter</span>
            {urgentCount ? <span className="bc-nav-late">{urgentCount}</span> : null}
          </button>
          <button
            className={`bc-nav-item is-top${view === ISSUES ? ' is-active' : ''}`}
            onClick={() => pick(ISSUES)}
            title="Issues GitHub créées depuis une tâche, et leurs rapports à reporter sur Basecamp"
          >
            <span aria-hidden="true">🐙</span>
            <span className="bc-nav-label">Issues GitHub</span>
            {waiting ? <span className="bc-nav-late">{waiting}</span> : null}
            {active ? <span className="bc-nav-count">{active}</span> : null}
          </button>
          {shown.map((p) => {
            const entries = entriesOf(p)
            return (
              <div key={p.key} className="bc-nav-group">
                <button
                  className="bc-nav-project"
                  title={`${p.name} — ${p.count} tâche(s)${p.late ? `, dont ${p.late} en retard` : ''}`}
                  onClick={() => entries[0] && pick(entries[0].key)}
                >
                  <span className="bc-nav-label">{p.name}</span>
                  {p.late ? <span className="bc-nav-late">{p.late}</span> : null}
                  <span className="bc-nav-count">{p.count}</span>
                </button>
                {entries.map((e) => (
                  <button
                    key={e.key}
                    className={`bc-nav-item${view === e.key ? ' is-active' : ''}`}
                    title={`${e.label} — ${e.count} tâche(s)${e.late ? `, dont ${e.late} en retard` : ''}`}
                    onClick={() => pick(e.key)}
                  >
                    <span aria-hidden="true">{e.icon}</span>
                    <span className="bc-nav-label">{e.label}</span>
                    {e.late ? <span className="bc-nav-late">{e.late}</span> : null}
                    <span className="bc-nav-count">{e.count}</span>
                  </button>
                ))}
              </div>
            )
          })}
        </nav>
        <NavResizer width={navW} onWidth={setNavW} />

        <section className="card gh-card bc-view" style={{ ['--accent' as string]: '#facc15' }}>
          <header className="group-head">
            <div className="group-toggle static">
              <span className="group-icon" aria-hidden="true">
                {current ? current.icon : view === ISSUES ? '🐙' : '🔥'}
              </span>
              <h2 className="group-title">
                {project ? (
                  <>
                    <span className="bc-crumb">{project.name} ›</span> {current?.label}
                  </>
                ) : view === ISSUES ? (
                  'Issues GitHub'
                ) : (
                  'À traiter'
                )}
              </h2>
              {project && board?.url ? (
                <a className="bc-open" href={board.url} target="_blank" rel="noreferrer" title="Ouvrir le tableau dans Basecamp">
                  ↗
                </a>
              ) : project?.url ? (
                <a className="bc-open" href={project.url} target="_blank" rel="noreferrer" title="Ouvrir le projet dans Basecamp">
                  ↗
                </a>
              ) : null}
              {project ? (
                <button
                  className="bc-hide"
                  title="Masquer ce projet (réversible avec les pastilles du haut)"
                  onClick={() => toggle(project.key)}
                >
                  masquer le projet
                </button>
              ) : null}
            </div>
          </header>
          <div className="bc-project">
            {!data.loaded ? <GhEmpty>première lecture…</GhEmpty> : null}
            {data.loaded && total === 0 && view !== ISSUES ? <GhEmpty>Aucune tâche assignée. 🎉</GhEmpty> : null}
            {total > 0 && shown.length === 0 && view !== ISSUES ? (
              <GhEmpty>Tous les projets sont masqués : clique sur leurs pastilles ci-dessus.</GhEmpty>
            ) : null}
            {view === ISSUES ? <IssueList issues={issues} /> : null}
            {data.loaded && shown.length > 0 && view === URGENT ? <Urgent items={located} onOpen={pick} /> : null}
            {current && !board && project ? <TodoLists lists={project.lists} /> : null}
            {board ? <BoardColumns b={board} /> : null}
          </div>
        </section>
      </div>
    </IssuesCtx.Provider>
  )
}
