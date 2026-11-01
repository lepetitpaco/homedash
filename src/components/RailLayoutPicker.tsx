import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { useDismiss } from '../hooks/useDismiss'
import type { RailLabels, RailSize } from './Rail'

/** Miniature d'une barre : `i` une icône, `n` un titre, chaque ligne une rangée. */
type Layout = { id: RailLabels; label: string; rows: string[] }
const LISTS: Layout[] = [
  { id: 'none', label: 'Icônes', rows: ['i', 'i', 'i'] },
  { id: 'right', label: 'Icônes et titres', rows: ['in', 'in', 'in'] },
  { id: 'text', label: 'Titres', rows: ['n', 'n', 'n'] },
]
const TILES: Layout[] = [
  { id: 'grid1', label: '1 colonne', rows: ['b', 'b'] },
  { id: 'grid2', label: '2 colonnes', rows: ['bb', 'bb'] },
  { id: 'grid3', label: '3 colonnes', rows: ['bbb', 'bbb'] },
]
const SIZES: { id: RailSize; label: string }[] = [
  { id: 'mini', label: 'Petit' },
  { id: 'icons', label: 'Normal' },
  { id: 'large', label: 'Grand' },
]

/** Le choix de la disposition et de la taille de la barre, appliqué en direct. */
export default function RailLayoutPicker({
  x,
  y,
  labels,
  size,
  onLabels,
  onSize,
  onClose,
}: {
  x: number
  y: number
  labels: RailLabels
  size: RailSize
  onLabels: (labels: RailLabels) => void
  onSize: (size: RailSize) => void
  onClose: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  useDismiss(true, box, onClose)
  const choice = (l: Layout) => (
    <button key={l.id} type="button" className={labels === l.id ? 'is-on' : ''} aria-pressed={labels === l.id} onClick={() => onLabels(l.id)}>
      <span className="rail-thumb" aria-hidden="true">
        {l.rows.map((row, r) => (
          <span key={r} className="rail-thumb-row">
            {[...row].map((part, p) => (
              <i key={p} className={`rail-thumb-${part}`} />
            ))}
          </span>
        ))}
      </span>
      {l.label}
    </button>
  )
  return createPortal(
    <div
      ref={box}
      className="rail-picker"
      role="dialog"
      aria-label="Disposition de la barre"
      style={{ left: x, top: Math.max(8, Math.min(y, window.innerHeight - 430)) }}
    >
      <h3>Disposition</h3>
      <div className="rail-picker-layouts">{LISTS.map(choice)}</div>
      <h4>Tuiles : le titre sous l'icône</h4>
      <div className="rail-picker-layouts">{TILES.map(choice)}</div>
      <h3>Taille</h3>
      <div className="rail-picker-sizes">
        {SIZES.map((s) => (
          <button key={s.id} type="button" className={size === s.id ? 'is-on' : ''} aria-pressed={size === s.id} onClick={() => onSize(s.id)}>
            <i className={`rail-picker-dot is-${s.id}`} aria-hidden="true" />
            {s.label}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  )
}
