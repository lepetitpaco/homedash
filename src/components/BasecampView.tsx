import { useMemo, useState } from 'react'
import { GhEmpty } from './GhCard'
import { ago } from '../lib/ghboard'
import { dueOf, projectKey, type BcBoard, type BcData, type BcTask } from '../lib/basecamp'

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

function Title({ t }: { t: Prio }) {
  return (
    <a className="gh-title" href={t.url} target="_blank" rel="noreferrer" title={t.title}>
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
        <Extras t={t} />
        <Due t={t} />
      </div>
    </div>
  )
}

// ── Navigation : projets, puis leurs tableaux ────────────────────────────────
const VIEW_KEY = 'homedash:bc-view'
const URGENT = 'urgent'
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
 * Chaque ligne est un lien vers Basecamp ; rien n'est coché d'ici. Les
 * notifications non lues ont leur bouton dans la barre du haut (`BasecampBell`).
 */
export default function BasecampView({
  data,
  error,
  hidden,
  onHidden,
  onRefresh,
  onSettings,
}: {
  data: BcData | null
  error: string | null
  /** Projets masqués (config.json → `basecamp.hidden`). */
  hidden: string[]
  onHidden: (next: string[]) => void
  onRefresh: () => void
  onSettings: () => void
}) {
  const projects = useMemo(() => (data ? group(data) : []), [data])
  const [picked, setPicked] = useState(readView)
  const off = new Set(hidden)
  const shown = projects.filter((p) => !off.has(p.key))
  const toggle = (key: string) => onHidden(off.has(key) ? hidden.filter((h) => h !== key) : [...hidden, key])
  const located = useMemo(() => locate(shown), [shown])
  const urgentCount = located.filter((it) => {
    const d = daysUntil(it.t.due_on)
    return d !== null && d <= SOON_DAYS
  }).length

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
  const current = picked === URGENT ? null : all.find((e) => e.key === picked) ?? null
  const view = current ? current.key : URGENT
  const project = current?.project
  const board = project?.boards.find((b) => current?.key === `${project.key}::${b.key}`)

  return (
    <>
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
          title="Cette page ne modifie rien dans Basecamp : elle lit, et chaque ligne ouvre Basecamp."
        >
          🔒 lecture seule
        </span>
        <div className="gh-bar-right">
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

      <div className="bc-layout">
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

        <section className="card gh-card bc-view" style={{ ['--accent' as string]: '#facc15' }}>
          <header className="group-head">
            <div className="group-toggle static">
              <span className="group-icon" aria-hidden="true">
                {current ? current.icon : '🔥'}
              </span>
              <h2 className="group-title">
                {project ? (
                  <>
                    <span className="bc-crumb">{project.name} ›</span> {current?.label}
                  </>
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
            {data.loaded && total === 0 ? <GhEmpty>Aucune tâche assignée. 🎉</GhEmpty> : null}
            {total > 0 && shown.length === 0 ? (
              <GhEmpty>Tous les projets sont masqués : clique sur leurs pastilles ci-dessus.</GhEmpty>
            ) : null}
            {data.loaded && shown.length > 0 && !current ? <Urgent items={located} onOpen={pick} /> : null}
            {current && !board && project ? <TodoLists lists={project.lists} /> : null}
            {board ? <BoardColumns b={board} /> : null}
          </div>
        </section>
      </div>
    </>
  )
}
