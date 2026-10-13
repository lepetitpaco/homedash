import type { FlatLink, Health } from '../types'
import Favicon from './Favicon'

type Props = {
  title: string
  variant: 'pinned' | 'used'
  links: FlatLink[]
  counts: Record<string, number>
  health: Record<string, Health>
  favicons: boolean
  faviconProvider: string
  onOpen: (link: FlatLink) => void
  onContext?: (e: React.MouseEvent, link: FlatLink) => void
}

export default function QuickTiles({
  title,
  variant,
  links,
  counts,
  health,
  favicons,
  faviconProvider,
  onOpen,
  onContext,
}: Props) {
  if (links.length === 0) return null
  return (
    <section className={`tiles-wrap is-${variant}`}>
      <div className="tiles-head">
        <span className="tiles-title">{title}</span>
        <span className="tiles-hint">
          {variant === 'pinned' ? 'clic droit → retirer des tuiles' : 'classés par ouvertures'}
        </span>
      </div>
      <div className="tiles">
        {links.map((link) => {
          const count = counts[link.id] ?? 0
          return (
            <a
              key={link.id}
              className="tile"
              href={link.url}
              target="_blank"
              rel="noreferrer"
              style={{ ['--accent' as string]: link.color }}
              title={count > 0 ? `${count} ouverture${count > 1 ? 's' : ''}` : link.group}
              onClick={() => onOpen(link)}
              onContextMenu={(e) => onContext?.(e, link)}
            >
              <Favicon
                url={link.url}
                name={link.name}
                color={link.color}
                enabled={favicons}
                provider={faviconProvider}
              />
              <span className="tile-text">
                <span className="tile-name">{link.name}</span>
                <span className="tile-note">{link.note ?? link.group}</span>
              </span>
              {count > 0 ? <span className="tile-count">{count}</span> : null}
              {link.check && health[link.id] ? <span className={`dot dot-${health[link.id]}`} /> : null}
            </a>
          )
        })}
      </div>
    </section>
  )
}
