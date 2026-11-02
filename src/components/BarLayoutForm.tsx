import type { RailLabels, RailSize } from './Rail'
import type { StripSize, TabLook } from './Tabs'

/**
 * Les choix des barres, propres à cet écran (localStorage) et appliqués tout de suite. Une seule
 * source pour le menu flottant (clic droit sur une barre) et Réglages → Barres et onglets.
 */
export type Bars = {
  /** Barre de gauche cachée : tous les onglets en haut de la page. */
  top: boolean
  labels: RailLabels
  size: RailSize
  stripSize: StripSize
  tabLook: TabLook
  autoHide: boolean
  /** Onglets de homedash (Raccourcis, GitHub…) dans un dossier ⚡ de la barre de gauche. */
  dashInRail: boolean
  setTop: (top: boolean) => void
  setLabels: (labels: RailLabels) => void
  setSize: (size: RailSize) => void
  setStripSize: (size: StripSize) => void
  setTabLook: (look: TabLook) => void
  setAutoHide: (on: boolean) => void
  setDashInRail: (on: boolean) => void
}

/** Miniature d'une barre : `i` une icône, `n` un titre, `b` une tuile, `p` une pastille ; une ligne = une rangée. */
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

const Thumb = ({ rows, className = '' }: { rows: string[]; className?: string }) => (
  <span className={`rail-thumb ${className}`} aria-hidden="true">
    {rows.map((row, r) => (
      <span key={r} className="rail-thumb-row">
        {[...row].map((part, p) => (
          <i key={p} className={`rail-thumb-${part}`} />
        ))}
      </span>
    ))}
  </span>
)

/** Un choix parmi d'autres : miniature + libellé, entouré quand c'est l'actuel. */
const Choice = ({ on, label, onPick, children }: { on: boolean; label: string; onPick: () => void; children: React.ReactNode }) => (
  <button type="button" className={on ? 'is-on' : ''} aria-pressed={on} onClick={onPick}>
    {children}
    {label}
  </button>
)

/**
 * D'abord où sont les onglets (barre de gauche ou en haut), puis seulement les options de ce
 * mode (disposition et taille des icônes, ou style et taille des onglets) ; le masquage juste sous le mode. `withDash` : la place des onglets de
 * homedash (Réglages ; dans le menu flottant, elle est au clic droit sur ⚡).
 */
export default function BarLayoutForm({ bars, withDash = false }: { bars: Bars; withDash?: boolean }) {
  const { top } = bars
  return (
    <div className="bar-form">
      <h3>Les onglets</h3>
      <div className="rail-picker-layouts is-two">
        <Choice on={!top} label="Barre de gauche" onPick={() => bars.setTop(false)}>
          <Thumb rows={['i', 'i', 'i']} className="is-left" />
        </Choice>
        <Choice on={top} label="En haut" onPick={() => bars.setTop(true)}>
          <Thumb rows={['ppp', 'pp']} className="is-top" />
        </Choice>
      </div>
      {/* Juste sous le choix du mode : en bas, on passait à côté. */}
      <label className="rail-picker-auto">
        <input type="checkbox" checked={bars.autoHide} onChange={(e) => bars.setAutoHide(e.target.checked)} />
        <span>
          Masquer automatiquement
          <small>
            {top ? 'Les onglets du haut reviennent quand la souris passe en haut de la page.' : 'La barre de gauche revient quand la souris passe au bord gauche.'}
          </small>
        </span>
      </label>

      {/* Chaque mode ne montre que ses options. Le style choisi en haut vaut aussi pour la petite
          barre d'onglets qui reste au-dessus de la page avec la barre de gauche. */}
      {top ? (
        <>
          <h3>Style des onglets</h3>
          <div className="rail-picker-layouts is-two">
            {(
              [
                { id: 'pills', label: 'Pastilles' },
                { id: 'underline', label: 'Soulignés' },
              ] as const
            ).map((c) => (
              <Choice key={c.id} on={bars.tabLook === c.id} label={c.label} onPick={() => bars.setTabLook(c.id)}>
                <span className={`rail-thumb is-look-${c.id}`} aria-hidden="true">
                  <span className="rail-thumb-row">
                    <i className="rail-thumb-t is-on" />
                    <i className="rail-thumb-t" />
                    <i className="rail-thumb-t" />
                  </span>
                </span>
              </Choice>
            ))}
          </div>
          <h3>Taille des onglets</h3>
          <div className="rail-picker-sizes">
            {SIZES.map((s) => (
              <Choice key={s.id} on={bars.stripSize === s.id} label={s.label} onPick={() => bars.setStripSize(s.id)}>
                <i className={`rail-picker-pill is-${s.id}`} aria-hidden="true" />
              </Choice>
            ))}
          </div>
        </>
      ) : (
        <>
          <h3>Disposition de la barre</h3>
          <div className="rail-picker-layouts">
            {LISTS.map((l) => (
              <Choice key={l.id} on={bars.labels === l.id} label={l.label} onPick={() => bars.setLabels(l.id)}>
                <Thumb rows={l.rows} />
              </Choice>
            ))}
          </div>
          <h4>Tuiles : le titre sous l'icône</h4>
          <div className="rail-picker-layouts">
            {TILES.map((l) => (
              <Choice key={l.id} on={bars.labels === l.id} label={l.label} onPick={() => bars.setLabels(l.id)}>
                <Thumb rows={l.rows} />
              </Choice>
            ))}
          </div>
          <h3>Taille des icônes</h3>
          <div className="rail-picker-sizes">
            {SIZES.map((s) => (
              <Choice key={s.id} on={bars.size === s.id} label={s.label} onPick={() => bars.setSize(s.id)}>
                <i className={`rail-picker-dot is-${s.id}`} aria-hidden="true" />
              </Choice>
            ))}
          </div>
          {withDash ? (
            <>
              <h3>Raccourcis, GitHub, Local… (⚡)</h3>
              <div className="rail-picker-layouts is-two">
                <Choice on={!bars.dashInRail} label="En haut de la page" onPick={() => bars.setDashInRail(false)}>
                  <Thumb rows={['ppp', '']} className="is-top" />
                </Choice>
                <Choice on={bars.dashInRail} label="Sous ⚡, dans la barre" onPick={() => bars.setDashInRail(true)}>
                  <Thumb rows={['i', 'i', 'i']} className="is-dash" />
                </Choice>
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  )
}
