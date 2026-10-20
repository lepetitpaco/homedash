import { useMemo, useRef, useState } from 'react'
import { dayOf, hhmm, type HdEvent } from '../lib/events'
import { confirmDialog } from './ConfirmHost'

type Filter = 'all' | 'github' | 'basecamp' | 'local' | 'bad'

const FILTERS: { id: Filter; label: string; title: string }[] = [
  { id: 'all', label: 'tout', title: 'Tous les événements' },
  { id: 'github', label: 'GitHub', title: 'CI, PRs, Renovate' },
  { id: 'basecamp', label: 'Basecamp', title: 'Nouvelles notifications et tâches Basecamp' },
  { id: 'local', label: 'Local', title: 'Branches devenues supprimables sur le disque' },
  { id: 'bad', label: 'problèmes', title: 'Uniquement ce qui a cassé' },
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
  onOpenLocal,
  onClose,
}: {
  events: HdEvent[]
  error: string | null
  /** `seq` du dernier événement lu, pour marquer la ligne de flottaison. */
  seen: number
  onClear: () => void
  onOpenLocal: () => void
  /** Retour à l'onglet d'où l'on vient : l'historique n'a pas d'onglet à lui. */
  onClose: () => void
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
        filter === 'all' ? true : filter === 'bad' ? e.level === 'bad' : e.source === filter,
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
            {FILTERS.map((f) => (
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
            vider
          </button>
          <button className="ev-clear" title="Revenir à l'onglet précédent" onClick={onClose}>
            fermer ✕
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
                onOpenLocal={onOpenLocal}
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
  onOpenLocal,
}: {
  event: HdEvent
  fresh: boolean
  showAccount: boolean
  /** Sans séparateurs de jour (panneau de la cloche), l'heure dit aussi le jour. */
  showDay?: boolean
  onOpenLocal: () => void
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
  // c'est l'onglet Local et sa commande à copier.
  if (e.source === 'local') {
    return (
      <button className={cls} onClick={onOpenLocal} title="Ouvrir l'onglet Local">
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
