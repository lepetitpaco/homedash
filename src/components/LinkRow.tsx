import type { FlatLink, Health } from '../types'
import Favicon from './Favicon'

type Props = {
  link: FlatLink
  health?: Health
  favicons: boolean
  faviconProvider: string
  showGroup?: boolean
  active?: boolean
  onOpen: (link: FlatLink) => void
  onContext?: (e: React.MouseEvent, link: FlatLink) => void
}

const HEALTH_LABEL: Record<Health, string> = {
  unknown: '',
  checking: 'test en cours…',
  up: 'en ligne',
  down: 'injoignable',
}

export default function LinkRow({
  link,
  health,
  favicons,
  faviconProvider,
  showGroup,
  active,
  onOpen,
  onContext,
}: Props) {
  return (
    <a
      className={`link-row${active ? ' is-active' : ''}`}
      href={link.url}
      target="_blank"
      rel="noreferrer"
      data-link-id={link.id}
      onClick={() => onOpen(link)}
      onAuxClick={(e) => {
        if (e.button === 1) onOpen(link)
      }}
      onContextMenu={(e) => onContext?.(e, link)}
    >
      <Favicon
        url={link.url}
        name={link.name}
        color={link.color}
        enabled={favicons}
        provider={faviconProvider}
      />
      <span className="link-text">
        <span className="link-name">{link.name}</span>
        {showGroup ? (
          <span className="link-meta">
            <span className="chip" style={{ borderColor: `${link.color}55`, color: link.color }}>
              {link.icon} {link.group}
            </span>
            {link.note ? <span className="link-note">{link.note}</span> : null}
          </span>
        ) : link.note ? (
          <span className="link-note">{link.note}</span>
        ) : null}
      </span>
      {link.check && health ? (
        <span className={`dot dot-${health}`} title={`${link.url} — ${HEALTH_LABEL[health]}`} />
      ) : null}
    </a>
  )
}
