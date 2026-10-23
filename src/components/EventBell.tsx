import { useCallback, useEffect, useRef, useState } from 'react'
import { useDismiss } from '../hooks/useDismiss'
import type { BcData } from '../lib/basecamp'
import type { HdEvent, InApp } from '../lib/events'
import { agoShort } from '../lib/local'
import { notifState, toggleNotifications, type NotifState } from '../lib/notifications'
import { confirmDialog } from './ConfirmHost'
import { EventRow } from './EventFeed'

const SHOWN = 20

/** Notifs Basecamp : une icône par rubrique. */
const BC_ICON: Record<string, string> = {
  inbox: '📥',
  chats: '💬',
  pings: '💬',
  mentions: '@',
  bubbles: '🫧',
}

type Filter = 'all' | 'code' | 'basecamp'

const NOTIF_LABEL: Record<NotifState, string> = {
  unsupported: 'non supportées par ce navigateur',
  insecure: 'indisponibles à cette adresse : ouvre homedash par localhost',
  denied: 'bloquées dans le navigateur',
  default: 'désactivées',
  muted: 'en sourdine',
  on: 'actives',
}

/**
 * Une seule cloche pour tout, une seule liste : en tête les notifications
 * Basecamp non lues (en direct), puis le journal de homedash (CI, PRs, Local…
 * et les notifs Basecamp passées, qui restent une fois lues : issue #41). Filtres
 * Tout · GitHub & Local · Basecamp quand Basecamp est connecté. La pastille
 * additionne les deux. Ouvrir efface les nouveautés du journal ; une notif
 * Basecamp, elle, reste comptée tant qu'elle n'est pas lue dans Basecamp
 * (lecture seule : on ne la marque jamais).
 *
 * Cloche de la barre du haut : le journal n'est pas un endroit où l'on travaille,
 * c'est un fil qu'on consulte quand la pastille s'allume, puis on revient à ce
 * qu'on faisait. D'où un panneau qui s'ouvre par-dessus l'onglet courant au lieu
 * d'un onglet à part. L'historique complet reste accessible par « Tout voir ».
 *
 * Ouvrir le panneau vaut lecture : la pastille s'efface. Le repère « nouveau »
 * est figé à l'ouverture, comme dans la page complète, pour ne pas s'effacer
 * sous les yeux.
 */
export default function EventBell({
  events,
  unseen,
  seen,
  error,
  onOpen,
  onShowAll,
  onClear,
  inApp,
  basecamp,
  onOpenBasecamp,
}: {
  /** Basecamp connecté : ses notifs non lues dans la même cloche. */
  basecamp?: BcData | null
  /** « Mes tâches → » : l'onglet Basecamp. */
  onOpenBasecamp?: () => void
  events: HdEvent[]
  unseen: number
  seen: number
  error: string | null
  /** Appelé à l'ouverture et à chaque nouvel événement panneau ouvert : marque comme lu. */
  onOpen: () => void
  onShowAll: () => void
  onClear: () => void
  inApp: InApp
}) {
  const [open, setOpen] = useState(false)
  const [mark, setMark] = useState(seen)
  const [notif, setNotif] = useState<NotifState>('default')
  const [filter, setFilter] = useState<Filter>('all')
  const bc = basecamp?.enabled ? basecamp : null
  const bcUnread = bc?.unreads.length ?? 0
  const total = unseen + bcUnread
  const wrap = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])

  const toggle = () => {
    if (!open) {
      setMark(seen)
      setNotif(notifState()) // la permission a pu changer dans un autre onglet
    }
    setOpen(!open)
  }

  // Panneau ouvert = lu, y compris ce qui arrive pendant qu'on le regarde.
  useEffect(() => {
    if (open) onOpen()
  }, [open, unseen, onOpen])

  useDismiss(open, wrap, close)

  const multiAccount = new Set(events.map((ev) => ev.account).filter(Boolean)).size > 1
  // Une notif encore non lue est en tête : sa ligne du journal ne la répète pas.
  const unreadTags = new Set((bc?.unreads ?? []).map((n) => `bc:notif:${n.id}`))
  const journal = events.filter(
    (e) =>
      !unreadTags.has(e.tag) &&
      (filter === 'all' || (filter === 'basecamp') === (e.source === 'basecamp')),
  )
  const shown = journal.slice(0, SHOWN)
  const unreads = bc && filter !== 'code' ? bc.unreads : []
  const codeFresh = events.filter((e) => e.seq > mark && e.source !== 'basecamp').length
  const blocked = notif === 'unsupported' || notif === 'insecure' || notif === 'denied'
  const go = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }

  return (
    <div className="bell" ref={wrap}>
      <button
        className={`icon-btn bell-btn${open ? ' is-open' : ''}`}
        onClick={toggle}
        title={
          [unseen ? `${unseen} événement(s) depuis ta dernière visite` : '', bcUnread ? `${bcUnread} notif(s) Basecamp non lue(s)` : '']
            .filter(Boolean)
            .join(' · ') || 'Notifications'
        }
        aria-label="Notifications"
        aria-expanded={open}
      >
        🔔
        {total ? <span className="bell-badge">{total > 99 ? '99+' : total}</span> : null}
      </button>

      {open ? (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <strong>Notifications</strong>
            {bc ? (
              <span className="bell-filters" role="radiogroup">
                {(
                  [
                    ['all', 'Tout'],
                    ['code', `GitHub & Local${codeFresh ? ` · ${codeFresh}` : ''}`],
                    ['basecamp', `🏕 Basecamp${bcUnread ? ` · ${bcUnread}` : ''}`],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    role="radio"
                    aria-checked={filter === id}
                    className={`bell-filter${filter === id ? ' is-on' : ''}`}
                    onClick={() => setFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </span>
            ) : (
              <span className="bell-head-count">{events.length}</span>
            )}
            <span className="set-spacer" />
            {events.length > 0 ? (
              <button
                className="bell-link"
                title="Vider le journal — les événements ne sont pas reconstituables"
                onClick={go(() => {
                  void confirmDialog({
                    title: `Vider le journal (${events.length} événements) ?`,
                    body: "Les événements passés ne sont pas reconstituables. Les prochains s'y inscriront normalement.",
                    confirmLabel: 'Vider',
                    danger: true,
                  }).then((ok) => ok && onClear())
                })}
              >
                vider
              </button>
            ) : null}
            <button className="bell-link" onClick={go(onShowAll)}>
              Tout voir →
            </button>
          </div>

          <div className="bell-list">
            {filter === 'basecamp' && onOpenBasecamp ? (
              <div className="bell-section">
                🏕 Basecamp
                <span className="set-spacer" />
                <button className="bell-link" onClick={go(onOpenBasecamp)}>
                  Mes tâches →
                </button>
              </div>
            ) : null}
            {bc?.error && filter !== 'code' ? <p className="gh-empty">⚠ {bc.error}</p> : null}
            {unreads.map((n) => (
              <a
                key={n.id}
                className="ev-row is-info is-unread"
                href={n.url}
                target="_blank"
                rel="noreferrer"
                title={n.excerpt || n.title}
                onClick={() => setOpen(false)}
              >
                <time className="ev-time">{n.ts ? agoShort(n.ts).replace('il y a ', '') : ''}</time>
                <div className="ev-main">
                  <div className="ev-title">
                    <span aria-hidden="true">{BC_ICON[n.section] ?? '🏕'} </span>
                    {n.title}
                    {n.unread_count > 1 ? <span className="bc-notif-count"> · {n.unread_count}</span> : null}
                    <span className="ev-unread">non lue</span>
                  </div>
                  <div className="ev-body">
                    {[n.project, n.creator && n.excerpt ? `${n.creator} — ${n.excerpt}` : n.creator || n.excerpt]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
              </a>
            ))}
            {unreads.length && shown.length ? <div className="bell-section">Déjà vues</div> : null}
            {error ? <p className="gh-empty">✗ journal illisible : {error}</p> : null}
            {!unreads.length && !shown.length && !error ? (
              <p className="gh-empty">
                {filter === 'basecamp'
                  ? 'Rien pour l’instant : les notifications Basecamp arriveront ici, et y resteront une fois lues.'
                  : 'Rien pour l’instant : CI qui casse ou repasse au vert, PR mergée, Renovate publiée, branche locale devenue inutile arriveront ici.'}
              </p>
            ) : null}
            {shown.map((e) => (
              <EventRow
                key={e.seq}
                event={e}
                fresh={e.seq > mark}
                showAccount={multiAccount}
                showDay
                inApp={(ev) => {
                  const here = inApp(ev)
                  return here && go(here)
                }}
              />
            ))}
            {journal.length > SHOWN ? (
              <button className="bell-link bell-more" onClick={go(onShowAll)}>
                {journal.length - SHOWN} de plus : tout voir →
              </button>
            ) : null}
          </div>

          <div className="bell-foot">
            <span>
              Notifications système : <strong>{NOTIF_LABEL[notif]}</strong>
            </span>
            {!blocked ? (
              <button className="bell-link" onClick={() => void toggleNotifications().then(setNotif)}>
                {notif === 'on' ? 'mettre en sourdine' : 'activer'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
