import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDismiss } from '../hooks/useDismiss'
import type { RailLabels, RailSize } from './Rail'
import type { TabLook } from './Tabs'

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
  top,
  stripSize,
  autoHide,
  dashInRail,
  tabLook,
  onLabels,
  onSize,
  onTop,
  onStripSize,
  onAutoHide,
  onDashInRail,
  onTabLook,
  onClose,
}: {
  x: number
  y: number
  labels: RailLabels
  size: RailSize
  /** Barre de gauche cachée : les onglets en pastilles en haut de la page. */
  top: boolean
  /** Une disposition de la barre de gauche (la fait revenir si elle était cachée). */
  onLabels: (labels: RailLabels) => void
  onSize: (size: RailSize) => void
  /** « Onglets en haut » : cache la barre de gauche. */
  onTop: () => void
  /** Taille des pastilles du haut. */
  stripSize: RailSize
  onStripSize: (size: RailSize) => void
  /** La barre choisie (gauche ou haut) se cache, et revient quand la souris passe au bord. */
  autoHide: boolean
  onAutoHide: (on: boolean) => void
  /** Onglets de homedash dans la barre de gauche, sous ⚡ (un clic), plutôt qu'en haut de la page. */
  dashInRail: boolean
  onDashInRail: (on: boolean) => void
  /** Style des onglets du haut : pastilles ou soulignés. */
  tabLook: TabLook
  onTabLook: (look: TabLook) => void
  onClose: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  useDismiss(true, box, onClose)
  // Placé d'après sa vraie hauteur (elle change avec « Onglets en haut ») : jamais sous le bas de l'écran.
  const [posY, setPosY] = useState(Math.max(8, y))
  useLayoutEffect(() => {
    const h = box.current?.offsetHeight ?? 0
    setPosY(Math.max(8, Math.min(y, window.innerHeight - h - 8)))
  })
  const choice = (l: Layout) => (
    <button
      key={l.id}
      type="button"
      className={!top && labels === l.id ? 'is-on' : ''}
      aria-pressed={!top && labels === l.id}
      onClick={() => onLabels(l.id)}
    >
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
      style={{ left: Math.max(8, Math.min(x, window.innerWidth - 360)), top: posY }}
    >
      <h3>Disposition</h3>
      <div className="rail-picker-layouts">{LISTS.map(choice)}</div>
      <h4>Tuiles : le titre sous l'icône</h4>
      <div className="rail-picker-layouts">{TILES.map(choice)}</div>
      <h4>Sans barre de gauche : les onglets en haut</h4>
      <div className="rail-picker-layouts">
        <button type="button" className={top ? 'is-on' : ''} aria-pressed={top} onClick={onTop}>
          <span className="rail-thumb is-top" aria-hidden="true">
            {['ppp', 'pp'].map((row, r) => (
              <span key={r} className="rail-thumb-row">
                {[...row].map((part, p) => (
                  <i key={p} className={`rail-thumb-${part}`} />
                ))}
              </span>
            ))}
          </span>
          Onglets en haut
        </button>
      </div>
      {top ? null : (
        <>
          <h4>Raccourcis, GitHub, Local… (⚡)</h4>
          <div className="rail-picker-layouts is-two">
            {[
              { on: false, label: 'En haut de la page', rows: ['ppp', ''] },
              { on: true, label: 'Sous ⚡, dans la barre', rows: ['i', 'i', 'i'] },
            ].map((c) => (
              <button key={c.label} type="button" className={dashInRail === c.on ? 'is-on' : ''} aria-pressed={dashInRail === c.on} onClick={() => onDashInRail(c.on)}>
                <span className={`rail-thumb${c.on ? ' is-dash' : ' is-top'}`} aria-hidden="true">
                  {c.rows.map((row, r) => (
                    <span key={r} className="rail-thumb-row">
                      {[...row].map((part, p) => (
                        <i key={p} className={`rail-thumb-${part}`} />
                      ))}
                    </span>
                  ))}
                </span>
                {c.label}
              </button>
            ))}
          </div>
        </>
      )}
      <h4>Style des onglets du haut</h4>
      <div className="rail-picker-layouts is-two">
        {(
          [
            { id: 'pills', label: 'Pastilles' },
            { id: 'underline', label: 'Soulignés' },
          ] as const
        ).map((c) => (
          <button key={c.id} type="button" className={tabLook === c.id ? 'is-on' : ''} aria-pressed={tabLook === c.id} onClick={() => onTabLook(c.id)}>
            <span className={`rail-thumb is-look-${c.id}`} aria-hidden="true">
              <span className="rail-thumb-row">
                <i className="rail-thumb-t is-on" />
                <i className="rail-thumb-t" />
                <i className="rail-thumb-t" />
              </span>
            </span>
            {c.label}
          </button>
        ))}
      </div>
      <h3>{top ? (tabLook === 'pills' ? 'Taille des pastilles' : 'Taille des onglets') : 'Taille'}</h3>
      <div className="rail-picker-sizes">
        {SIZES.map((s) => {
          const on = (top ? stripSize : size) === s.id
          return (
            <button key={s.id} type="button" className={on ? 'is-on' : ''} aria-pressed={on} onClick={() => (top ? onStripSize : onSize)(s.id)}>
              {top ? <i className={`rail-picker-pill is-${s.id}`} aria-hidden="true" /> : <i className={`rail-picker-dot is-${s.id}`} aria-hidden="true" />}
              {s.label}
            </button>
          )
        })}
      </div>
      <label className="rail-picker-auto">
        <input type="checkbox" checked={autoHide} onChange={(e) => onAutoHide(e.target.checked)} />
        <span>
          Masquer automatiquement
          <small>{top ? 'La barre revient quand la souris passe en haut de la page.' : 'La barre revient quand la souris passe au bord gauche.'}</small>
        </span>
      </label>
    </div>,
    document.body,
  )
}
