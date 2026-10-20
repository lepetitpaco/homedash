import { useCallback, useRef, useState } from 'react'
import { useDismiss } from '../hooks/useDismiss'
import type { BcData } from '../lib/basecamp'
import { agoShort } from '../lib/local'

const SECTION_ICON: Record<string, string> = {
  inbox: '📥',
  chats: '💬',
  pings: '💬',
  mentions: '@',
  bubbles: '🫧',
}

/**
 * Notifications Basecamp non lues, dans la barre du haut à côté de la cloche.
 *
 * La pastille est le compteur de Basecamp lui-même : ouvrir le panneau ne
 * l'efface pas (on ne marque rien comme lu, lecture seule). C'est en ouvrant
 * une notification dans Basecamp qu'elle disparaît, à la lecture suivante.
 */
export default function BasecampBell({ data, onOpenTab }: { data: BcData; onOpenTab: () => void }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, wrap, close)

  const unread = data.unreads.length

  return (
    <div className="bell" ref={wrap}>
      <button
        className={`icon-btn bell-btn${open ? ' is-open' : ''}`}
        onClick={() => setOpen(!open)}
        title={unread ? `${unread} notification(s) Basecamp non lue(s)` : 'Basecamp : rien de non lu'}
        aria-label="Notifications Basecamp"
        aria-expanded={open}
      >
        🏕
        {unread ? <span className="bell-badge">{unread > 99 ? '99+' : unread}</span> : null}
      </button>

      {open ? (
        <div className="bell-panel" role="dialog" aria-label="Notifications Basecamp">
          <div className="bell-head">
            <strong>Basecamp</strong>
            <span className="bell-head-count">{unread} non lue(s)</span>
            <span className="set-spacer" />
            <button
              className="bell-link"
              onClick={() => {
                setOpen(false)
                onOpenTab()
              }}
            >
              Mes tâches →
            </button>
          </div>

          <div className="bell-list">
            {data.error ? <p className="gh-empty">⚠ {data.error}</p> : null}
            {data.loaded && unread === 0 ? <p className="gh-empty">Rien de non lu.</p> : null}
            {!data.loaded && !data.error ? <p className="gh-empty">première lecture…</p> : null}
            {data.unreads.map((n) => (
              <a
                key={n.id}
                className="ev-row is-info"
                href={n.url}
                target="_blank"
                rel="noreferrer"
                title={n.excerpt || n.title}
                onClick={() => setOpen(false)}
              >
                <time className="ev-time">{n.ts ? agoShort(n.ts).replace('il y a ', '') : ''}</time>
                <div className="ev-main">
                  <div className="ev-title">
                    <span aria-hidden="true">{SECTION_ICON[n.section] ?? '🔔'} </span>
                    {n.title}
                    {n.unread_count > 1 ? <span className="bc-notif-count"> · {n.unread_count}</span> : null}
                  </div>
                  <div className="ev-body">
                    {[n.project, n.creator && n.excerpt ? `${n.creator} — ${n.excerpt}` : n.creator || n.excerpt]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
              </a>
            ))}
          </div>

          <div className="bell-foot">
            <span>🔒 lecture seule : ouvrir une notif dans Basecamp la marque lue là-bas.</span>
            {data.app_href ? (
              <a className="bell-link" href={data.app_href} target="_blank" rel="noreferrer">
                Basecamp ↗
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
