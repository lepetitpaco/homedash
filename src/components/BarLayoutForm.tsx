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
  { id: 'right', label: 'Icônes + titres', rows: ['in', 'in', 'in'] },
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
 * Choix à deux ou trois options : un sélecteur segmenté (une pilule, l'actuel en relief) plutôt que de
 * grandes vignettes. `glyph` : un petit signe devant le libellé.
 */
function Segmented<T extends string>({
  label,
  value,
  options,
  onPick,
}: {
  label: string
  value: T
  options: { id: T; label: string; glyph?: React.ReactNode }[]
  onPick: (id: T) => void
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          className={value === o.id ? 'is-on' : ''}
          onClick={() => onPick(o.id)}
        >
          {o.glyph ? <span className="seg-glyph" aria-hidden="true">{o.glyph}</span> : null}
          {o.label}
        </button>
      ))}
    </div>
  )
}

const SIZE_OPTS = (kind: 'dot' | 'pill') =>
  SIZES.map((s) => ({ id: s.id, label: s.label, glyph: <i className={`seg-${kind} is-${s.id}`} /> }))

/** Une ligne de réglage : le nom et sa phrase à gauche, le contrôle à droite (dessous dans le menu flottant). */
const Row = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <div className="bar-row">
    <div className="bar-row-label">
      <h3>{title}</h3>
      {hint ? <p>{hint}</p> : null}
    </div>
    <div className="bar-row-control">{children}</div>
  </div>
)

/**
 * Une ligne par réglage, dans un ordre fixe : où sont les onglets, le masquage, puis seulement les
 * réglages de ce mode. Basculer ajoute ou retire des lignes sous les deux premières, rien ne saute.
 * `withDash` : la place des onglets de homedash (Réglages ; dans le menu flottant, elle est au clic
 * droit sur ⚡).
 */
export default function BarLayoutForm({ bars, withDash = false }: { bars: Bars; withDash?: boolean }) {
  const { top } = bars
  return (
    <div className="bar-form">
      <Row title="Les onglets" hint={top ? 'Tous en haut de la page, sur plusieurs rangées si besoin.' : 'Tes sites dans une barre à gauche.'}>
        <Segmented
          label="Les onglets"
          value={top ? 'top' : 'left'}
          options={[
            { id: 'left', label: 'Barre de gauche', glyph: <i className="seg-left" /> },
            { id: 'top', label: 'En haut', glyph: <i className="seg-top" /> },
          ]}
          onPick={(v) => bars.setTop(v === 'top')}
        />
      </Row>
      <Row
        title="Masquer automatiquement"
        hint={top ? 'Les onglets reviennent quand la souris passe en haut de la page.' : 'La barre revient quand la souris passe au bord gauche.'}
      >
        <label className="switch">
          <input type="checkbox" checked={bars.autoHide} onChange={(e) => bars.setAutoHide(e.target.checked)} />
          <span className="switch-track" aria-hidden="true" />
          <span className="sr-only">Masquer automatiquement</span>
        </label>
      </Row>
      {top ? (
        <>
          <Row title="Style des onglets">
            <Segmented
              label="Style des onglets"
              value={bars.tabLook}
              options={[
                { id: 'pills', label: 'Pastilles', glyph: <i className="seg-look-pills" /> },
                { id: 'underline', label: 'Soulignés', glyph: <i className="seg-look-underline" /> },
              ]}
              onPick={bars.setTabLook}
            />
          </Row>
          <Row title="Taille des onglets">
            <Segmented label="Taille des onglets" value={bars.stripSize} options={SIZE_OPTS('pill')} onPick={bars.setStripSize} />
          </Row>
        </>
      ) : (
        <>
          <Row title="Disposition de la barre" hint="Titres à droite, ou sous l'icône sur 1 à 3 colonnes.">
            <div className="bar-layouts">
              {[...LISTS, ...TILES].map((l) => (
                <Choice key={l.id} on={bars.labels === l.id} label={l.label} onPick={() => bars.setLabels(l.id)}>
                  <Thumb rows={l.rows} />
                </Choice>
              ))}
            </div>
          </Row>
          <Row title="Taille des icônes">
            <Segmented label="Taille des icônes" value={bars.size} options={SIZE_OPTS('dot')} onPick={bars.setSize} />
          </Row>
          {withDash ? (
            <Row title="Raccourcis, GitHub, Local…" hint="Dans un dossier ⚡ de la barre (un clic), ou en haut de la page.">
              <Segmented
                label="Raccourcis, GitHub, Local…"
                value={bars.dashInRail ? 'rail' : 'top'}
                options={[
                  { id: 'rail', label: 'Sous ⚡' },
                  { id: 'top', label: 'En haut de la page' },
                ]}
                onPick={(v) => bars.setDashInRail(v === 'rail')}
              />
            </Row>
          ) : null}
        </>
      )}
    </div>
  )
}
