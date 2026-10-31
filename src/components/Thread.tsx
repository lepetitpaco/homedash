import type { ReactNode } from 'react'
import { Markdown } from '../lib/markdown'

export type ThreadMessage = { id: string | number; who: string; date: string; text: string }

const initials = (who: string) =>
  who
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?'

/** La même personne garde la même couleur dans une conversation. */
const hue = (who: string) => [...who].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)

const parsed = (date: string) => {
  const d = new Date(date)
  return Number.isNaN(d.getTime()) ? null : d
}
const dayOf = (date: string) => {
  const d = parsed(date)
  if (!d) return date
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000)
  if (days === 0) return "Aujourd'hui"
  if (days === 1) return 'Hier'
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
/** L'heure, si la source la donne : Basecamp ne donne parfois que le jour. */
const timeOf = (date: string) =>
  /T\d/.test(date) ? (parsed(date)?.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) ?? '') : ''

type Props = {
  messages: ThreadMessage[]
  /** Le message d'où l'on vient : mis en avant. */
  focus?: ThreadMessage['id']
  /** Texte tel qu'il s'affiche (images de la source remplacées, par exemple). */
  render?: (text: string) => string
  /** Choisir des messages : un clic sur le message le retient ou le retire. */
  picked?: (id: ThreadMessage['id']) => boolean
  onToggle?: (id: ThreadMessage['id']) => void
  /** Une action au survol d'un message. */
  action?: (m: ThreadMessage) => ReactNode
}

/**
 * Une conversation, comme dans une messagerie : du plus ancien au plus récent,
 * regroupée par jour et par personne, sans boîte autour de chaque message.
 */
export default function Thread({ messages, focus, render, picked, onToggle, action }: Props) {
  return (
    <div className={`th${onToggle ? ' is-picking' : ''}`}>
      {messages.map((m, i) => {
        const before = messages[i - 1]
        const newDay = !before || dayOf(before.date) !== dayOf(m.date)
        const same = !newDay && before.who === m.who
        const on = picked?.(m.id)
        return (
          <div key={m.id} data-comment={m.id}>
            {newDay ? <div className="th-day"><span>{dayOf(m.date)}</span></div> : null}
            <div
              className={`th-msg${same ? ' is-same' : ''}${on ? ' is-on' : ''}${focus === m.id ? ' is-focus' : ''}`}
              onClick={onToggle ? (e) => !(e.target as HTMLElement).closest('a') && onToggle(m.id) : undefined}
              role={onToggle ? 'checkbox' : undefined}
              aria-checked={onToggle ? !!on : undefined}
              tabIndex={onToggle ? 0 : undefined}
              onKeyDown={onToggle ? (e) => e.key === ' ' && (e.preventDefault(), onToggle(m.id)) : undefined}
            >
              {same ? (
                <span className="th-side" />
              ) : (
                <span className="th-avatar" style={{ background: `hsl(${hue(m.who)} 45% 42%)` }} aria-hidden="true">
                  {initials(m.who)}
                </span>
              )}
              <div className="th-main">
                {same ? null : (
                  <div className="th-top">
                    <strong>{m.who}</strong>
                    <time>{timeOf(m.date)}</time>
                  </div>
                )}
                <div className="th-text"><Markdown text={render ? render(m.text) : m.text} /></div>
              </div>
              {onToggle ? <span className="th-tick" aria-hidden="true">{on ? '✓' : ''}</span> : null}
              {action ? <span className="th-action">{action(m)}</span> : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
