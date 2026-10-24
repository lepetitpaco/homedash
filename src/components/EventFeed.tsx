import { useMemo, useRef, useState } from 'react'
import { dayOf, hhmm, type EventSource, type HdEvent, type InApp } from '../lib/events'
import { confirmDialog } from './ConfirmHost'

type Filter = 'all' | 'code' | 'basecamp' | 'bad'

// Les mêmes que la cloche (Tout / GitHub & Local / Basecamp), plus « Problèmes » :
// deux découpages pour la même liste déroutaient (issue #44).
const FILTERS: { id: Filter; label: string; title: string; sources?: EventSource[] }[] = [
  { id: 'all', label: 'Tout', title: 'Tous les événements' },
  { id: 'code', label: 'GitHub & Local', title: 'CI, PRs, Renovate, branches à supprimer', sources: ['github', 'local'] },
  { id: 'basecamp', label: 'Basecamp', title: 'Nouvelles notifications et tâches Basecamp', sources: ['basecamp'] },
  { id: 'bad', label: 'Problèmes', title: 'Uniquement ce qui a cassé' },
]

/**
 * Le journal complet, ouvert par « Tout voir » depuis la cloche.
 *
 * Une notification répond à « regarde maintenant » ; cette page répond à
 * « qu'est-ce qui s'est passé pendant que je ne regardais pas ». D'où le sens de
 * lecture — le plus récent en haut, séparé par jour — et l'absence totale
 * d'action : rien n'est à faire ici, tout est déjà arrivé.
 */
export default function EventFeed({
  events,
  error,
  seen,
  onClear,
  inApp,
  onClose,
  off = [],
}: {
  events: HdEvent[]
  error: string | null
  /** `seq` du dernier événement lu, pour marquer la ligne de flottaison. */
  seen: number
  onClear: () => void
  inApp: InApp
  /** Retour à l'onglet d'où l'on vient : l'historique n'a pas d'onglet à lui. */
  onClose: () => void
  /** Sources des fonctionnalités coupées : pas de filtre pour elles. */
  off?: EventSource[]
}) {
  // Le compte n'est affiché que s'il y en a plusieurs : sinon c'est du bruit.
  const multiAccount = new Set(events.map((ev) => ev.account).filter(Boolean)).size > 1
  const [filter, setFilter] = useState<Filter>('all')
  // Figé à l'ouverture : le repère « nouveau depuis la dernière visite » ne doit
  // pas s'effacer sous les yeux au moment même où la page marque tout comme lu.
  const mark = useRef(seen)

  const shown = useMemo(
    () =>
      events.filter((e) =>
        filter === 'all'
          ? true
          : filter === 'bad'
            ? e.level === 'bad'
            : !!FILTERS.find((f) => f.id === filter)?.sources?.includes(e.source),
      ),
    [events, filter],
  )

  const days = useMemo(() => {
    const out: { key: string; label: string; items: HdEvent[] }[] = []
    for (const e of shown) {
      const { key, label } = dayOf(e.ts)
      const last = out[out.length - 1]
      if (last && last.key === key) last.items.push(e)
      else out.push({ key, label, items: [e] })
    }
    return out
  }, [shown])

  const fresh = events.filter((e) => e.seq > mark.current).length

  return (
    <section className="card ev-card">
      <header className="group-head">
        <div className="group-toggle static">
          <span className="group-icon" aria-hidden="true">
            🔔
          </span>
          <h2 className="group-title">Activité</h2>
          <span className="group-count">{events.length}</span>
          {fresh > 0 ? <span className="ev-fresh-count">{fresh} nouveau{fresh > 1 ? 'x' : ''}</span> : null}
          <div className="ev-filters">
            {FILTERS.filter((f) => !f.sources || f.sources.some((x) => !off.includes(x))).map((f) => (
              <button
                key={f.id}
                className={`ev-chip${filter === f.id ? ' is-on' : ''}`}
                title={f.title}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            className="ev-clear"
            title="Vider le journal — les événements ne sont pas reconstituables"
            disabled={events.length === 0}
            onClick={() => {
              void confirmDialog({
                title: `Vider le journal (${events.length} événements) ?`,
                body: "Les événements passés ne sont pas reconstituables. Les prochains s'y inscriront normalement.",
                confirmLabel: 'Vider',
                danger: true,
              }).then((ok) => ok && onClear())
            }}
          >
            Vider
          </button>
          <button className="ev-clear" title="Revenir à l'onglet précédent" onClick={onClose}>
            Fermer ✕
          </button>
        </div>
      </header>

      <div className="gh-body">
        {error ? <p className="gh-empty">✗ journal illisible : {error}</p> : null}

        {events.length === 0 && !error ? (
          <p className="gh-empty">
            Rien pour l'instant. Les transitions atterrissent ici dès qu'elles arrivent : CI qui
            casse ou repasse au vert, PR mergée, Renovate publiée, branche locale devenue inutile.
            Le journal est tenu par le serveur — il se remplit même page fermée.
          </p>
        ) : null}

        {events.length > 0 && shown.length === 0 ? (
          <p className="gh-empty">Aucun événement dans ce filtre.</p>
        ) : null}

        {days.map((day) => (
          <div key={day.key} className="ev-day">
            <div className="ev-day-head">
              {day.label}
              <span className="ev-day-count">{day.items.length}</span>
            </div>
            {day.items.map((e) => (
              <EventRow
                key={e.seq}
                event={e}
                fresh={e.seq > mark.current}
                showAccount={multiAccount}
                inApp={inApp}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

export function EventRow({
  event: e,
  fresh,
  showAccount,
  showDay = false,
  inApp,
}: {
  event: HdEvent
  fresh: boolean
  showAccount: boolean
  /** Sans séparateurs de jour (panneau de la cloche), l'heure dit aussi le jour. */
  showDay?: boolean
  inApp: InApp
}) {
  const day = showDay ? dayOf(e.ts).label : null
  const cls = `ev-row is-${e.level}${fresh ? ' is-fresh' : ''}`
  const inner = (
    <>
      <time className="ev-time" dateTime={new Date(e.ts * 1000).toISOString()}>
        {day && day !== "aujourd'hui" ? <span className="ev-day-tag">{day}</span> : null}
        {hhmm(e.ts)}
      </time>
      <div className="ev-main">
        <div className="ev-title">
          {showAccount && e.account ? <span className="ev-account">{e.account}</span> : null}
          {e.title}
        </div>
        {e.body ? <div className="ev-body">{e.body}</div> : null}
      </div>
    </>
  )

  // Un événement local ne pointe vers rien d'utile sur GitHub : ce qu'on veut,
  // c'est l'onglet Local et sa commande à copier (ou la vue d'où publier un rapport).
  const here = inApp(e)
  if (here) {
    return (
      <button className={cls} onClick={here} title={e.source === 'local' ? "Ouvrir l'onglet Local" : 'Ouvrir dans homedash'}>
        {inner}
      </button>
    )
  }
  if (!e.url) return <div className={cls}>{inner}</div>
  return (
    <a className={cls} href={e.url} target="_blank" rel="noreferrer" title={e.url}>
      {inner}
    </a>
  )
}
