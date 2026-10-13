import { useEffect, useRef, useState } from 'react'
import type { HdEvent } from '../lib/events'
import { notifState, toggleNotifications, type NotifState } from '../lib/notifications'
import { EventRow } from './EventFeed'

const SHOWN = 20

const NOTIF_LABEL: Record<NotifState, string> = {
  unsupported: 'non supportées par ce navigateur',
  insecure: 'indisponibles hors HTTPS / localhost',
  denied: 'bloquées dans le navigateur',
  default: 'désactivées',
  muted: 'en sourdine',
  on: 'actives',
}

/**
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
  onOpenLocal,
}: {
  events: HdEvent[]
  unseen: number
  seen: number
  error: string | null
  /** Appelé à l'ouverture et à chaque nouvel événement panneau ouvert : marque comme lu. */
  onOpen: () => void
  onShowAll: () => void
  onOpenLocal: () => void
}) {
  const [open, setOpen] = useState(false)
  const [mark, setMark] = useState(seen)
  const [notif, setNotif] = useState<NotifState>('default')
  const wrap = useRef<HTMLDivElement>(null)

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

  // Fermeture au clic dehors et à Échap.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const multiAccount = new Set(events.map((ev) => ev.account).filter(Boolean)).size > 1
  const shown = events.slice(0, SHOWN)
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
        title={unseen ? `${unseen} événement(s) depuis ta dernière visite` : 'Activité'}
        aria-label="Activité"
        aria-expanded={open}
      >
        🔔
        {unseen ? <span className="bell-badge">{unseen > 99 ? '99+' : unseen}</span> : null}
      </button>

      {open ? (
        <div className="bell-panel" role="dialog" aria-label="Activité">
          <div className="bell-head">
            <strong>Activité</strong>
            <span className="bell-head-count">{events.length}</span>
            <span className="set-spacer" />
            <button className="bell-link" onClick={go(onShowAll)}>
              Tout voir →
            </button>
          </div>

          <div className="bell-list">
            {error ? <p className="gh-empty">✗ journal illisible : {error}</p> : null}
            {events.length === 0 && !error ? (
              <p className="gh-empty">
                Rien pour l'instant : CI qui casse ou repasse au vert, PR mergée, Renovate publiée,
                branche locale devenue inutile arriveront ici.
              </p>
            ) : null}
            {shown.map((e) => (
              <EventRow
                key={e.seq}
                event={e}
                fresh={e.seq > mark}
                showAccount={multiAccount}
                showDay
                onOpenLocal={go(onOpenLocal)}
              />
            ))}
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
