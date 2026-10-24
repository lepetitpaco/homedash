import MoreButton from './MoreButton'
import type { FlatLink, Health } from '../types'
import LinkRow from './LinkRow'

type Props = {
  name: string
  icon?: string
  color: string
  links: FlatLink[]
  health: Record<string, Health>
  favicons: boolean
  faviconProvider: string
  collapsed: boolean
  onToggle: () => void
  onOpen: (link: FlatLink) => void
  onContextGroup?: (e: React.MouseEvent, name: string) => void
  onContextLink?: (e: React.MouseEvent, link: FlatLink) => void
}

export default function GroupCard({
  name,
  icon,
  color,
  links,
  health,
  favicons,
  faviconProvider,
  collapsed,
  onToggle,
  onOpen,
  onContextGroup,
  onContextLink,
}: Props) {
  const down = links.filter((l) => l.check && health[l.id] === 'down').length

  return (
    <section className={`card group-card${collapsed ? ' is-collapsed' : ''}`} style={{ ['--accent' as string]: color }}>
      <header className="group-head" onContextMenu={(e) => onContextGroup?.(e, name)}>
        <button className="group-toggle" onClick={onToggle} aria-expanded={!collapsed}>
          <span className="group-icon" aria-hidden="true">
            {icon}
          </span>
          <h2 className="group-title">{name}</h2>
          {down > 0 ? <span className="badge badge-down">{down} injoignable{down > 1 ? 's' : ''}</span> : null}
          <span className="group-count">{links.length}</span>
          <span className="caret" aria-hidden="true">
            {collapsed ? '▸' : '▾'}
          </span>
        </button>
        {onContextGroup ? <MoreButton label="Actions de la catégorie" onMenu={(e) => onContextGroup(e, name)} /> : null}
      </header>
      {collapsed ? null : (
        <div className="group-body" onContextMenu={(e) => onContextGroup?.(e, name)}>
          {links.length === 0 ? (
            <p className="group-empty">Aucun lien — ⋯ ou clic droit pour en ajouter.</p>
          ) : null}
          {links.map((link) => (
            <LinkRow
              key={link.id}
              link={link}
              health={health[link.id]}
              favicons={favicons}
              faviconProvider={faviconProvider}
              onOpen={onOpen}
              onContext={onContextLink}
            />
          ))}
        </div>
      )}
    </section>
  )
}
