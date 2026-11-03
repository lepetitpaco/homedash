import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GhEmpty } from './GhCard'
import Pick from './Pick'
import { shown } from '../lib/errors'
import {
  cellsOf,
  daysFor,
  inPeriod,
  lastMonths,
  monthBounds,
  monthLabel,
  monthsBetween,
  projectRowsOf,
  projectsOf,
  rate,
  rowsOf,
  sortRows,
  type SortKey,
  type StatItem,
  type StatRow,
  type StatsData,
} from '../lib/bcStats'

// ── Période ──────────────────────────────────────────────────────────────────
type Preset = '7d' | '30d' | 'month' | 'prev' | '3m' | '12m' | 'custom'
const PRESETS: { id: Preset; label: string }[] = [
  { id: '7d', label: '7 jours' },
  { id: '30d', label: '30 jours' },
  { id: 'month', label: 'Ce mois-ci' },
  { id: 'prev', label: 'Mois dernier' },
  { id: '3m', label: '3 mois' },
  { id: '12m', label: '12 mois' },
  { id: 'custom', label: 'Personnalisé' },
]
/** Mois choisissables : le mois en cours et les 11 précédents (ce que couvre la réserve). */
const MONTHS_BACK = 12
const SERVER_DAYS = [7, 30, 90, 365, 400]

type Period = { preset: Preset; from: string; to: string }
type View = 'people' | 'projects'
type Sort = { key: SortKey; desc: boolean }

const PREF_KEY = 'homedash:bc-stats'

function readPrefs(): { period: Period; view: View; byMonth: boolean } {
  const months = lastMonths(MONTHS_BACK)
  const dflt = { period: { preset: '30d' as Preset, from: months[2], to: months[0] }, view: 'people' as View, byMonth: false }
  try {
    const v = JSON.parse(localStorage.getItem(PREF_KEY) || '{}')
    const preset = PRESETS.some((p) => p.id === v.period?.preset) ? v.period.preset : dflt.period.preset
    const from = months.includes(v.period?.from) ? v.period.from : dflt.period.from
    const to = months.includes(v.period?.to) ? v.period.to : dflt.period.to
    return { period: { preset, from, to }, view: v.view === 'projects' ? 'projects' : 'people', byMonth: v.byMonth === true }
  } catch {
    return dflt
  }
}

function savePrefs(p: { period: Period; view: View; byMonth: boolean }) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p))
  } catch {
    /* stockage indisponible : choix non retenus */
  }
}

/** [début, fin[ de la période, en heure locale. */
function boundsOf(p: Period, now = new Date()): [Date, Date] {
  const end = new Date(now.getTime() + 60_000)
  const months = lastMonths(MONTHS_BACK, now)
  const day = 86400_000
  switch (p.preset) {
    case '7d':
      return [new Date(now.getTime() - 7 * day), end]
    case '30d':
      return [new Date(now.getTime() - 30 * day), end]
    case 'month':
      return [monthBounds(months[0])[0], end]
    case 'prev':
      return monthBounds(months[1])
    case '3m':
      return [monthBounds(months[2])[0], end]
    case '12m':
      return [monthBounds(months[MONTHS_BACK - 1])[0], end]
    case 'custom': {
      const [a, b] = p.from <= p.to ? [p.from, p.to] : [p.to, p.from]
      return [monthBounds(a)[0], monthBounds(b)[1]]
    }
  }
}

async function fetchStats(days: number, fresh: boolean): Promise<StatsData> {
  const q = new URLSearchParams({ days: String(days), ...(fresh ? { fresh: '1' } : {}) })
  const res = await fetch(`api/basecamp/stats?${q}`, { cache: 'no-store' })
  const out = (await res.json().catch(() => null)) as (StatsData & { error?: string }) | null
  if (!res.ok || !out) throw new Error(out?.error ?? `HTTP ${res.status}`)
  return out
}

/** « le 2 nov. à 17:05 », ou « aujourd'hui à 17:05 ». */
function when(ts: number): string {
  const d = new Date(ts * 1000)
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === new Date().toDateString()) return `aujourd’hui à ${time}`
  return `le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à ${time}`
}

/**
 * Tâches créées sur une période et combien sont faites, par personne qui les a
 * créées ou par projet, éventuellement mois par mois. Le serveur garde une
 * réserve d'un an : changer de période ne relit Basecamp que si elle ne la
 * couvre pas. ⤢ : plein écran.
 */
export default function BcStats() {
  const prefs = useMemo(readPrefs, [])
  const [period, setPeriod] = useState<Period>(prefs.period)
  const [view, setView] = useState<View>(prefs.view)
  const [byMonth, setByMonth] = useState(prefs.byMonth)
  const [project, setProject] = useState<number | null>(null)
  const [sort, setSort] = useState<Sort>({ key: 'created', desc: true })
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [full, setFull] = useState(false)
  const asked = useRef(0)

  const [from, to] = boundsOf(period)
  const days = daysFor(from, new Date(), SERVER_DAYS)

  const load = (fresh: boolean) => {
    const n = ++asked.current
    setLoading(true)
    setError('')
    fetchStats(days, fresh)
      .then((d) => n === asked.current && setData(d))
      .catch((e) => n === asked.current && setError(shown('Stats Basecamp', e)))
      .finally(() => n === asked.current && setLoading(false))
  }
  // À l'ouverture, et pour une période plus longue que ce qu'on a (le serveur ne relit que s'il le faut).
  useEffect(() => {
    if (!data || data.days < days) load(false)
  }, [days])
  useEffect(() => savePrefs({ period, view, byMonth }), [period, view, byMonth])
  // Remplissage en arrière-plan : on relit la réserve du serveur (sans appel à Basecamp) jusqu'à ce qu'il finisse.
  const filling = data?.filling ?? null
  useEffect(() => {
    if (!filling) return
    const t = window.setInterval(() => load(false), 30_000)
    return () => window.clearInterval(t)
  }, [filling, days])
  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [full])

  const fromMs = from.getTime()
  const toMs = to.getTime()
  const items = useMemo(() => (data ? inPeriod(data.items, new Date(fromMs), new Date(toMs)) : []), [data, fromMs, toMs])
  const projects = useMemo(() => projectsOf(items), [items])
  const pid = project !== null && projects.some((p) => p.id === project) ? project : null
  const byProject = view === 'projects'
  const months = useMemo(() => monthsBetween(new Date(fromMs), new Date(toMs)), [fromMs, toMs])
  // tri sur un mois qui n'est plus affiché : retour aux créées
  const sortKey: SortKey = sort.key.startsWith('m:') && (!byMonth || !months.includes(sort.key.slice(2))) ? 'created' : sort.key
  const rows = useMemo(
    () => sortRows(byProject ? projectRowsOf(items) : rowsOf(items, pid), sortKey, sort.desc),
    [items, pid, byProject, sortKey, sort.desc],
  )
  const created = rows.reduce((n, r) => n + r.created, 0)
  const done = rows.reduce((n, r) => n + r.done, 0)
  const allCells = useMemo(() => cellsOf(rows.flatMap((r) => r.items)), [rows])

  const pickView = (v: View) => {
    setView(v)
    setOpen(null)
  }
  /** Même colonne : on inverse ; autre colonne : nom en A→Z, chiffres du plus grand au plus petit. */
  const sortBy = (key: SortKey) => setSort((cur) => (cur.key === key ? { key, desc: !cur.desc } : { key, desc: key !== 'name' }))
  const Th = ({ k, label, num, title }: { k: SortKey; label: string; num?: boolean; title?: string }) => {
    const on = sortKey === k
    return (
      <th className={num ? 'num' : undefined} aria-sort={on ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
        <button className={`bc-stats-sort${on ? ' is-on' : ''}`} onClick={() => sortBy(k)} title={title ?? 'Trier sur cette colonne'}>
          {label}
          <span aria-hidden="true">{on ? (sort.desc ? ' ▼' : ' ▲') : ''}</span>
        </button>
      </th>
    )
  }
  const cols = byMonth ? months.length + 2 : 4
  const monthOptions = lastMonths(MONTHS_BACK).map((m) => ({ value: m, label: monthLabel(m) }))

  const panel = (
    <div className={`bc-stats${full ? ' is-full' : ''}`}>
      <div className="bc-stats-bar">
        {full ? <strong className="bc-stats-title">📊 Stats Basecamp</strong> : null}
        <span className="bc-stats-state">
          {loading ? (
            <>
              <span className="gh-spin" /> lecture de Basecamp…
            </>
          ) : data ? (
            <>
              Mis à jour {when(data.ts)}
              {data.auto ? ' · automatique' : ''}
            </>
          ) : null}
        </span>
        <button className={`gh-bar-btn${loading ? ' is-busy' : ''}`} title="Mettre à jour maintenant" onClick={() => load(true)} disabled={loading}>
          ↻
        </button>
        <button className="gh-bar-btn" title={full ? 'Quitter le plein écran (Échap)' : 'Plein écran'} onClick={() => setFull(!full)}>
          {full ? '✕' : '⤢'}
        </button>
      </div>

      <div className="bc-filter" role="group" aria-label="Période">
        <span className="bc-filter-label">Créées</span>
        {PRESETS.map((p) => (
          <button key={p.id} className={`ev-chip${period.preset === p.id ? ' is-on' : ''}`} onClick={() => setPeriod({ ...period, preset: p.id })}>
            {p.label}
          </button>
        ))}
        {period.preset === 'custom' ? (
          <span className="bc-stats-range">
            du <Pick value={period.from} options={monthOptions} onChange={(v) => setPeriod({ ...period, from: v })} title="Premier mois" />
            au <Pick value={period.to} options={monthOptions} onChange={(v) => setPeriod({ ...period, to: v })} title="Dernier mois" />
          </span>
        ) : null}
      </div>

      <div className="bc-filter" role="group" aria-label="Affichage">
        <span className="bc-filter-label">Par</span>
        <button className={`ev-chip${!byProject ? ' is-on' : ''}`} onClick={() => pickView('people')}>
          👤 personne
        </button>
        <button className={`ev-chip${byProject ? ' is-on' : ''}`} onClick={() => pickView('projects')}>
          📁 projet
        </button>
        <button className={`ev-chip${byMonth ? ' is-on' : ''}`} onClick={() => setByMonth(!byMonth)} title="Une colonne par mois : tâches créées (et faites)">
          📅 détail par mois
        </button>
      </div>

      {projects.length && !byProject ? (
        <div className="bc-filter" role="group" aria-label="Projet">
          <span className="bc-filter-label">Projet</span>
          <button className={`ev-chip${pid === null ? ' is-on' : ''}`} onClick={() => setProject(null)}>
            Tous (cumul) <span className="bc-chip-count">{items.length}</span>
          </button>
          {projects.map((p) => (
            <button key={p.id} className={`ev-chip${pid === p.id ? ' is-on' : ''}`} onClick={() => setProject(p.id)}>
              {p.name} <span className="bc-chip-count">{p.created}</span>
            </button>
          ))}
        </div>
      ) : null}

      <p className="bc-stats-note">
        Tâches et cartes <strong>créées</strong> sur la période, comptées pour la personne qui les a créées ; « faites » =
        cochées, ou cartes dans la colonne Done. Calculé sur {projects.length ? `les ${projects.length} projets` : 'les projets'} dont tu es
        membre : Basecamp ne montre pas les autres.
        {data?.partial ? <strong> Période trop chargée : seules les plus récentes ont été lues.</strong> : null}
      </p>
      {filling && Date.parse(filling) > fromMs ? (
        <p className="bc-stats-filling">
          <span className="gh-spin" /> Préparation en arrière-plan, petit à petit pour ménager Basecamp : données disponibles depuis le{' '}
          {new Date(filling).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}. Le reste arrive toutes les minutes.
        </p>
      ) : null}

      {error ? <GhEmpty>⚠ {error}</GhEmpty> : null}
      {!error && data && !loading && !rows.length ? <GhEmpty>Aucune tâche créée sur cette période.</GhEmpty> : null}

      {rows.length ? (
        <div className="bc-stats-scroll">
          <table className={`bc-stats-table${byMonth ? ' is-months' : ''}`}>
            <thead>
              <tr>
                <Th k="name" label={byProject ? 'Projet' : 'Créée par'} />
                {byMonth ? (
                  months.map((m) => <Th key={m} k={`m:${m}`} label={monthLabel(m, true)} num title={`Trier sur les créées de ${monthLabel(m)}`} />)
                ) : (
                  <>
                    <Th k="created" label="Créées" num />
                    <Th k="done" label="Faites" num />
                  </>
                )}
                {byMonth ? <Th k="created" label="Total" num title="Trier sur le total des créées" /> : <Th k="rate" label="% faites" num />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isOpen = open === r.key
                return (
                  <Fragment key={r.key}>
                    <Line
                      r={r}
                      months={byMonth ? months : null}
                      open={isOpen}
                      onClick={() => setOpen(isOpen ? null : r.key)}
                      hint={byProject ? 'Voir qui a créé ses tâches' : 'Voir ses tâches'}
                    />
                    {isOpen ? (
                      <tr className="bc-stats-detail">
                        <td colSpan={cols}>
                          {byProject ? (
                            <People items={r.items} sort={{ key: sortKey, desc: sort.desc }} months={byMonth ? months : null} />
                          ) : (
                            <Tasks items={r.items} />
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                {byMonth ? (
                  months.map((m) => <Cell key={m} done={allCells.get(m)?.done ?? 0} created={allCells.get(m)?.created ?? 0} />)
                ) : (
                  <>
                    <td className="num">
                      <strong>{created}</strong>
                    </td>
                    <td className="num">{done}</td>
                  </>
                )}
                {byMonth ? <Cell done={done} created={created} /> : <td className="num">{rate(done, created)} %</td>}
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </div>
  )

  // Plein écran : au-dessus de tout, hors de la barre (dont le backdrop-filter piégerait le position: fixed).
  return full ? createPortal(<div className="bc-stats-overlay">{panel}</div>, document.body) : panel
}

/** Case d'un mois : tâches créées, et combien sont faites en petit. */
function Cell({ done, created }: { done: number; created: number }) {
  if (!created) return <td className="num bc-stats-cell is-empty">·</td>
  return (
    <td className="num bc-stats-cell" title={`${created} créée(s), dont ${done} faite(s) (${rate(done, created)} %)`}>
      <strong>{created}</strong>
      <span className="bc-stats-of"> ✓{done}</span>
    </td>
  )
}

/** Une ligne : nom, puis créées / faites / part faite, ou une case par mois et le total. */
function Line({ r, months, open, onClick, hint }: { r: StatRow; months: string[] | null; open?: boolean; onClick?: () => void; hint?: string }) {
  const cells = months ? cellsOf(r.items) : null
  return (
    <tr className={`bc-stats-row${open ? ' is-open' : ''}`} onClick={onClick} title={hint}>
      <td className="bc-stats-name">
        {onClick ? <span className="bc-stats-caret" aria-hidden="true">{open ? '▾' : '▸'}</span> : null} {r.who}
      </td>
      {months && cells ? (
        <>
          {months.map((m) => (
            <Cell key={m} done={cells.get(m)?.done ?? 0} created={cells.get(m)?.created ?? 0} />
          ))}
          <Cell done={r.done} created={r.created} />
        </>
      ) : (
        <>
          <td className="num">
            <strong>{r.created}</strong>
          </td>
          <td className="num">{r.done}</td>
          <td className="num">
            <span className="bc-stats-rate" style={{ ['--rate' as string]: `${rate(r.done, r.created)}%` }}>
              {rate(r.done, r.created)} %
            </span>
          </td>
        </>
      )}
    </tr>
  )
}

/** Dans un projet : une ligne par personne, triée comme le tableau ; un clic liste ses tâches. */
function People({ items, sort, months }: { items: StatItem[]; sort: Sort; months: string[] | null }) {
  const [open, setOpen] = useState<string | null>(null)
  const rows = sortRows(rowsOf(items), sort.key, sort.desc)
  const cols = months ? months.length + 2 : 4
  return (
    <table className={`bc-stats-table is-nested${months ? ' is-months' : ''}`}>
      <tbody>
        {rows.map((r) => (
          <Fragment key={r.key}>
            <Line r={r} months={months} open={open === r.key} onClick={() => setOpen(open === r.key ? null : r.key)} hint="Voir ses tâches" />
            {open === r.key ? (
              <tr className="bc-stats-detail">
                <td colSpan={cols}>
                  <Tasks items={r.items} />
                </td>
              </tr>
            ) : null}
          </Fragment>
        ))}
      </tbody>
    </table>
  )
}

/** Les tâches, faites d'abord, avec leur lien vers Basecamp. */
function Tasks({ items }: { items: StatItem[] }) {
  const list = [...items].sort((a, b) => Number(b.done) - Number(a.done) || b.created_at.localeCompare(a.created_at))
  return (
    <ul>
      {list.map((it) => (
        <li key={`${it.kind}${it.id}`} className={it.done ? 'is-done' : ''}>
          <span aria-hidden="true">{it.done ? '✅' : '⬜'}</span>{' '}
          <a href={it.url} target="_blank" rel="noreferrer">
            {it.title}
          </a>
          <span className="bc-stats-meta">
            {it.kind === 'card' ? 'carte' : 'to-do'} · {it.who} · {it.project} · {it.created_at.slice(0, 10)}
          </span>
        </li>
      ))}
    </ul>
  )
}
