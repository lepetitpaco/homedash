import { useState } from 'react'
import type { FlatLink, Health } from '../types'
import Favicon from './Favicon'
import MoreButton from './MoreButton'

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
  /** Épinglés : nouvel ordre après un glisser-déposer (ids). Absent = pas de glisser. */
  onReorder?: (ids: string[]) => void
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
  onReorder,
}: Props) {
  const [dragged, setDragged] = useState<string | null>(null)
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null)
  if (links.length === 0) return null

  const sortable = !!onReorder && links.length > 1
  const reset = () => {
    setDragged(null)
    setOver(null)
  }
  const drop = () => {
    if (dragged && over && dragged !== over.id) {
      const ids = links.map((l) => l.id).filter((id) => id !== dragged)
      const at = ids.indexOf(over.id) + (over.after ? 1 : 0)
      ids.splice(at, 0, dragged)
      onReorder?.(ids)
    }
    reset()
  }

  return (
    <section className={`tiles-wrap is-${variant}`}>
      <div className="tiles-head">
        <span className="tiles-title">{title}</span>
        <span className="tiles-hint">
          {variant !== 'pinned'
            ? 'classés par ouvertures'
            : sortable
              ? 'glisser ⠿ pour changer l’ordre · clic droit → retirer'
              : 'clic droit → retirer des tuiles'}
        </span>
      </div>
      <div className="tiles">
        {links.map((link) => {
          const count = counts[link.id] ?? 0
          return (
            <a
              key={link.id}
              className={[
                'tile',
                sortable ? 'is-sortable' : '',
                dragged === link.id ? 'is-dragging' : '',
                over?.id === link.id && dragged !== link.id ? (over.after ? 'drop-after' : 'drop-before') : '',
              ]
                .filter(Boolean)
                .join(' ')}
              draggable={sortable}
              onDragStart={
                sortable
                  ? (e) => {
                      e.dataTransfer.effectAllowed = 'move'
                      setDragged(link.id)
                    }
                  : undefined
              }
              onDragOver={
                sortable
                  ? (e) => {
                      if (!dragged) return
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      // moitié gauche = avant, moitié droite = après
                      const r = e.currentTarget.getBoundingClientRect()
                      const after = e.clientX > r.left + r.width / 2
                      if (over?.id !== link.id || over.after !== after) setOver({ id: link.id, after })
                    }
                  : undefined
              }
              onDrop={
                sortable
                  ? (e) => {
                      e.preventDefault()
                      drop()
                    }
                  : undefined
              }
              onDragEnd={sortable ? reset : undefined}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              style={{ ['--accent' as string]: link.color }}
              title={count > 0 ? `${count} ouverture${count > 1 ? 's' : ''}` : link.group}
              onClick={() => onOpen(link)}
              onContextMenu={(e) => onContext?.(e, link)}
            >
              {sortable ? (
                <span className="tile-grip" aria-hidden="true" title="Glisser pour changer l’ordre">
                  ⠿
                </span>
              ) : null}
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
              {onContext ? <MoreButton onMenu={(e) => onContext(e, link)} /> : null}
            </a>
          )
        })}
      </div>
    </section>
  )
}
