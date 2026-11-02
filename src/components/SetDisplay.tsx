import type { UiConfig } from '../types'
import { DEFAULT_UI } from '../lib/config'

/**
 * Réglages → Affichage : des pré-layouts à miniature plutôt que des chiffres. Chaque choix écrit
 * les mêmes clés de `ui` qu'avant (format inchangé) ; les défauts restent ceux de toujours.
 */
type Ui = Partial<UiConfig>
type Pick<T> = { label: string; hint?: string; ui: Partial<Record<keyof UiConfig, T>> }

/** Largeur de la page : centrée sur un grand écran pour rester lisible ; jamais moins de 1 400 px. */
const PAGE: (Pick<number> & { pct: number })[] = [
  { label: 'Toute la largeur', hint: 'portable', pct: 100, ui: { pageWidth: 100 } },
  { label: 'Large', pct: 80, ui: { pageWidth: 80 } },
  { label: 'Centrée', hint: 'écran large', pct: 60, ui: { pageWidth: 60 } },
  { label: 'Étroite', hint: 'très large', pct: 45, ui: { pageWidth: 45 } },
]
/** Densité de Raccourcis : largeur d'un lien, des noms de catégorie et des blocs Notes / Stats. */
const DENSITY: (Pick<number> & { n: number })[] = [
  { label: 'Compacte', n: 4, ui: { linkWidth: 220, railWidth: 180, sidebarWidth: 300 } },
  { label: 'Normale', n: 3, ui: { linkWidth: 260, railWidth: 220, sidebarWidth: 420 } },
  { label: 'Aérée', n: 2, ui: { linkWidth: 300, railWidth: 260, sidebarWidth: 480 } },
]
/** Cartes des onglets GitHub et Local côte à côte ; Auto = selon la largeur de l'écran. */
const COLUMNS: (Pick<number> & { n: number })[] = [
  { label: 'Auto', hint: 'selon l’écran', n: 0, ui: { cardColumns: 0 } },
  { label: '1 colonne', n: 1, ui: { cardColumns: 1 } },
  { label: '2 colonnes', n: 2, ui: { cardColumns: 2 } },
  { label: '3 colonnes', n: 3, ui: { cardColumns: 3 } },
]
const TILES: Pick<number>[] = [4, 8, 12, 16].map((n) => ({ label: String(n), ui: { maxTiles: n } }))
const CHECKS: Pick<number>[] = [
  { label: '30 s', ui: { healthcheckInterval: 30 } },
  { label: '1 min', ui: { healthcheckInterval: 60 } },
  { label: '5 min', ui: { healthcheckInterval: 300 } },
  { label: 'Jamais', ui: { healthcheckInterval: 0 } },
]

const value = (ui: Ui, key: keyof UiConfig) => (ui[key] ?? DEFAULT_UI[key]) as unknown
const isOn = (ui: Ui, p: Pick<number>) => Object.entries(p.ui).every(([k, v]) => value(ui, k as keyof UiConfig) === v)

function Row<T extends Pick<number>>({
  title,
  hint,
  picks,
  ui,
  onPick,
  thumb,
  small = false,
}: {
  title: string
  hint: string
  picks: T[]
  ui: Ui
  onPick: (p: T) => void
  thumb?: (p: T) => React.ReactNode
  small?: boolean
}) {
  const custom = !picks.some((p) => isOn(ui, p))
  return (
    <section className="set-looks">
      <h4>
        {title} <em>{hint}</em>
        {custom ? <span className="set-looks-custom">personnalisé : choisis une option pour revenir à un modèle</span> : null}
      </h4>
      <div className={`set-looks-row${small ? ' is-small' : ''}`}>
        {picks.map((p) => {
          const on = isOn(ui, p)
          return (
            <button key={p.label} type="button" className={on ? 'is-on' : ''} aria-pressed={on} onClick={() => onPick(p)}>
              {thumb ? thumb(p) : null}
              <strong>{p.label}</strong>
              {p.hint ? <span>{p.hint}</span> : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}

/** Miniature de page : l'écran, et le contenu centré à sa largeur. */
const PageThumb = ({ pct }: { pct: number }) => (
  <span className="set-thumb" aria-hidden="true">
    <i className="set-thumb-page" style={{ width: `${pct}%` }} />
  </span>
)
/** Miniature de grille : `n` blocs par rangée (0 = beaucoup, plus petits). */
const GridThumb = ({ n, auto = false }: { n: number; auto?: boolean }) => (
  <span className="set-thumb is-grid" aria-hidden="true" style={{ ['--n' as string]: auto ? 4 : n }}>
    {Array.from({ length: (auto ? 4 : n) * 2 }, (_, i) => (
      <i key={i} className={auto && i % 4 === 3 ? 'is-faint' : ''} />
    ))}
  </span>
)

export default function SetDisplay({ ui, onChange }: { ui: Ui; onChange: (patch: Ui) => void }) {
  const pick = (p: Pick<number>) => onChange(p.ui as Ui)
  return (
    <div className="set-looks-all">
      <Row title="Largeur de la page" hint="centrée, elle reste lisible sur un très grand écran" picks={PAGE} ui={ui} onPick={pick} thumb={(p) => <PageThumb pct={p.pct} />} />
      {/* Le reste a de bons défauts : replié, ouvert d'office si une valeur sort des modèles. */}
      <details className="set-more" open={[DENSITY, COLUMNS, TILES, CHECKS].some((picks) => !picks.some((p) => isOn(ui, p))) || undefined}>
        <summary>Plus de réglages : densité, colonnes, tuiles, voyants</summary>
        <div className="set-looks-all">
        <Row title="Raccourcis" hint="liens, noms de catégorie et blocs Notes / Stats" picks={DENSITY} ui={ui} onPick={pick} thumb={(p) => <GridThumb n={p.n} />} />
        <Row title="Cartes GitHub et Local" hint="côte à côte" picks={COLUMNS} ui={ui} onPick={pick} thumb={(p) => <GridThumb n={p.n} auto={p.n === 0} />} />
        <Row title="Tuiles « les plus utilisés »" hint="combien de liens dans la rangée" picks={TILES} ui={ui} onPick={pick} small />
        <Row title="Test des voyants" hint="liens surveillés : tous les combien" picks={CHECKS} ui={ui} onPick={pick} small />
        </div>
      </details>
    </div>
  )
}
