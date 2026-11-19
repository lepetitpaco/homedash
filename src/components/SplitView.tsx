import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Pick from './Pick'
import {
  LAYOUTS,
  dragRatios,
  layoutOf,
  mixLabel,
  type Follow,
  type KeyboardChoice,
  type Preset,
  type SplitMode,
  type SplitNode,
  type SplitPrefs,
} from '../lib/splitView'

export type Rect = { x: number; y: number; w: number; h: number }
export type PaneSite = { key: string; label: string; icon: React.ReactNode }

type Props = {
  layout: string
  onLayout: (id: string) => void
  /** Site de chaque case (clé d'onglet), `null` = vide. */
  slots: (string | null)[]
  sites: PaneSite[]
  onSite: (slot: number, key: string | null) => void
  prefs: SplitPrefs
  preset: Preset
  onProfile: (id: 'classic' | 'scroll') => void
  onPrefs: (patch: Partial<Omit<SplitPrefs, 'mode'>>) => void
  active: number
  /** Case dont le site a le son (`null` = aucune) ; `all` : tous l'ont. */
  sound: number | null
  muted: Record<string, boolean>
  audible: Record<string, boolean>
  zoom: number | null
  onZoom: (slot: number | null) => void
  onHover: (slot: number) => void
  onLeave: () => void
  onPick: (slot: number) => void
  onClose: () => void
  onRects: (rects: (Rect | null)[]) => void
  /** Message discret d'un panneau (« action indisponible »). */
  notes: (string | null)[]
}

const MODES: { id: SplitMode; label: string; hint: string }[] = [
  { id: 'classic', label: 'Classic', hint: 'Double écran : tous les sons, aucune touche interceptée' },
  { id: 'scroll', label: 'Scroll', hint: 'Défiler des flux : le son suit la souris, raccourcis et actions par site' },
  { id: 'custom', label: 'Personnalisé', hint: 'Tes cases à cocher ne correspondent à aucun mode' },
]

const FOLLOWS: { value: Follow; label: string }[] = [
  { value: 'all', label: 'Tous les sons' },
  { value: 'hover', label: 'Le son suit la souris' },
  { value: 'keyboard', label: 'Le son suit le clavier' },
]

const KEYBOARDS: { value: KeyboardChoice; label: string }[] = [
  { value: 'auto', label: 'Clavier : automatique' },
  { value: 'azerty', label: 'Clavier : AZERTY' },
  { value: 'qwerty', label: 'Clavier : QWERTY' },
]

/** Une disposition en miniature, dessinée avec le même arbre que la grille. */
function Mini({ node }: { node: SplitNode }) {
  if (node === 'pane') return <i />
  return (
    <span className={`split-mini is-${node.dir}`}>
      {node.children.map((c, i) => (
        <span key={i} style={{ flex: `${node.ratios[i]} 1 0` }}>
          <Mini node={c} />
        </span>
      ))}
    </span>
  )
}

export default function SplitView(p: Props) {
  const root = useRef<HTMLDivElement>(null)
  const bodies = useRef<(HTMLDivElement | null)[]>([])
  const lastRects = useRef('')
  const [ratios, setRatios] = useState<Record<string, number[]>>({})
  const [dragging, setDragging] = useState(false)
  const [menu, setMenu] = useState(false)
  const lay = layoutOf(p.layout)
  const zoomed = p.zoom !== null && p.zoom < lay.n

  // Les emplacements des cases, en pixels de la fenêtre : App y pose les sites (CSS, sans les déplacer).
  const measure = useCallback(() => {
    const out: (Rect | null)[] = []
    for (let i = 0; i < 4; i++) {
      const el = bodies.current[i]
      if (!el || !el.isConnected || i >= lay.n || (zoomed && i !== p.zoom)) {
        out.push(null)
        continue
      }
      const r = el.getBoundingClientRect()
      out.push({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) })
    }
    const sig = JSON.stringify(out)
    if (sig === lastRects.current) return
    lastRects.current = sig
    p.onRects(out)
  }, [p.onRects, p.zoom, zoomed, lay.n]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(measure)
  useEffect(() => {
    const el = root.current
    if (!el) return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure])
  // Fermée, la grille libère les sites : plus aucun emplacement.
  useEffect(() => () => p.onRects([null, null, null, null]), []) // eslint-disable-line react-hooks/exhaustive-deps

  // Menu des cases à cocher : se ferme au clic ailleurs.
  useEffect(() => {
    if (!menu) return
    const down = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.('.split-menu, .split-menu-btn')) setMenu(false)
    }
    window.addEventListener('mousedown', down)
    return () => window.removeEventListener('mousedown', down)
  }, [menu])

  const siteOptions = useMemo(
    () => [{ value: '', label: '— aucun —' }, ...p.sites.map((s) => ({ value: s.key, label: s.label }))],
    [p.sites],
  )

  let slot = 0
  const renderPane = (i: number) => {
    const key = p.slots[i]
    const site = p.sites.find((s) => s.key === key)
    const isActive = p.active === i
    const manual = key ? !!p.muted[key] : false
    const plays = !!key && !manual && (p.prefs.follow === 'all' || p.sound === i)
    return (
      <div
        key={i}
        className={`split-pane${isActive ? ' is-active' : ''}`}
        onMouseEnter={() => p.onHover(i)}
        onMouseLeave={p.onLeave}
        onMouseDown={() => p.onPick(i)}
      >
        <div className="split-head" onDoubleClick={() => p.onZoom(zoomed ? null : i)}>
          <span className="split-num" aria-hidden="true">
            {i + 1}
          </span>
          <Pick
            value={key ?? ''}
            options={siteOptions}
            onChange={(v) => p.onSite(i, v || null)}
            title="Site de ce panneau"
          />
          {key ? (
            <span
              className={`split-sound${plays && p.audible[key] ? ' is-on' : ''}`}
              title={manual ? 'Son coupé à la main (clic droit sur le site)' : plays ? 'Ce panneau a le son' : 'Son coupé ici'}
            >
              {manual ? '🔇' : plays ? '🔊' : '🔈'}
            </span>
          ) : null}
          <span className="set-spacer" />
          <button
            className="split-btn"
            onClick={() => p.onZoom(zoomed ? null : i)}
            title={zoomed ? 'Restaurer la grille (Z)' : 'Agrandir ce panneau (double-clic sur le titre, ou Z)'}
            aria-label={zoomed ? 'Restaurer la grille' : 'Agrandir ce panneau'}
          >
            {zoomed ? '⤡' : '⤢'}
          </button>
        </div>
        <div className="split-body" ref={(el) => {
            bodies.current[i] = el
          }}>
          {!key ? <p className="split-empty">Choisis un site pour ce panneau.</p> : null}
          {key && !site ? <p className="split-empty">Ce site n'existe plus.</p> : null}
          {p.notes[i] ? (
            <span className="split-note" role="status">
              {p.notes[i]}
            </span>
          ) : null}
        </div>
      </div>
    )
  }

  const renderNode = (node: SplitNode, path: string): React.ReactNode => {
    if (node === 'pane') return renderPane(slot++)
    const id = `${lay.id}:${path}`
    const r = ratios[id] ?? node.ratios
    const parts: React.ReactNode[] = []
    node.children.forEach((c, i) => {
      parts.push(
        <div className="split-cell" style={{ flex: `${r[i]} 1 0` }} key={`c${i}`}>
          {renderNode(c, `${path}${i}`)}
        </div>,
      )
      if (i < node.children.length - 1) {
        parts.push(
          <div
            key={`s${i}`}
            className="split-sep"
            role="separator"
            aria-orientation={node.dir === 'row' ? 'vertical' : 'horizontal'}
            onPointerDown={(e) => {
              const el = e.currentTarget
              const box = el.parentElement!.getBoundingClientRect()
              const size = node.dir === 'row' ? box.width : box.height
              const start = node.dir === 'row' ? e.clientX : e.clientY
              const base = r
              el.setPointerCapture(e.pointerId)
              setDragging(true)
              const move = (ev: PointerEvent) => {
                const d = ((node.dir === 'row' ? ev.clientX : ev.clientY) - start) / size
                setRatios((all) => ({ ...all, [id]: dragRatios(base, i, d) }))
              }
              const up = () => {
                setDragging(false)
                el.removeEventListener('pointermove', move)
                el.removeEventListener('pointerup', up)
                el.removeEventListener('pointercancel', up)
              }
              el.addEventListener('pointermove', move)
              el.addEventListener('pointerup', up)
              el.addEventListener('pointercancel', up)
            }}
          />,
        )
      }
    })
    return <div className={`split-node is-${node.dir}`}>{parts}</div>
  }

  const flag = (key: 'keys' | 'actions' | 'mixer' | 'sync' | 'keep', label: string, hint: string) => (
    <label className="set-toggle" key={key}>
      <input type="checkbox" checked={p.prefs[key]} onChange={(e) => p.onPrefs({ [key]: e.target.checked })} />
      <span>
        {label}
        <em>{hint}</em>
      </span>
    </label>
  )

  return (
    <div className={`split-root${dragging ? ' is-dragging' : ''}`} ref={root} aria-label="Vue scindée">
      <div className="split-bar">
        <div className="split-group" role="group" aria-label="Mode de la vue scindée">
          {MODES.map((m) => (
            <button
              key={m.id}
              className="split-chip"
              aria-pressed={p.prefs.mode === m.id}
              disabled={m.id === 'custom'}
              title={m.hint}
              onClick={() => m.id !== 'custom' && p.onProfile(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="split-group" role="group" aria-label="Disposition">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              className="split-chip split-lay"
              aria-pressed={p.layout === l.id && !zoomed}
              title={l.label}
              aria-label={l.label}
              onClick={() => p.onLayout(l.id)}
            >
              <Mini node={l.tree} />
            </button>
          ))}
        </div>
        <div className="split-group">
          <Pick
            value={p.prefs.follow}
            options={FOLLOWS}
            onChange={(v) => p.onPrefs({ follow: v as Follow })}
            title="Qui a le son"
          />
          <button
            className="split-chip split-menu-btn"
            aria-expanded={menu}
            onClick={() => setMenu((v) => !v)}
            title="Raccourcis clavier, actions, mixage…"
          >
            Options ▾
          </button>
        </div>
        <span className="set-spacer" />
        {p.prefs.keys ? (
          <span className="split-legend">
            {p.prefs.mixer
              ? p.preset.mix.slice(0, lay.n).map((_, i) => `${i + 1} : ${mixLabel(p.preset, i)}`).join('  ·  ')
              : `Alt + ${p.preset.digits.slice(0, lay.n).join(' ')} : changer de panneau  ·  J K : défiler  ·  Z : agrandir`}
          </span>
        ) : (
          <span className="split-legend">Aucune touche interceptée : tu tapes dans les sites comme d'habitude.</span>
        )}
        <button className="split-chip" onClick={p.onClose} title="Fermer la vue scindée (Échap)">
          Fermer
        </button>
        {menu ? (
          <div className="split-menu" role="dialog" aria-label="Options de la vue scindée">
            <div className="set-toggles">
              {flag('keys', 'Raccourcis clavier', 'Alt + chiffre, J K, N P, Z, Échap')}
              {flag('actions', 'Actions par site', "L j'aime, B enregistrer, T repartager, C commenter, F suivre")}
              {flag('mixer', 'Table de mixage', 'une paire de touches par panneau pour défiler')}
              {flag('sync', 'Scroll synchronisé', 'une molette pour tous les panneaux')}
              {flag('keep', 'Garder le son à la sortie', 'le dernier panneau garde le son quand la souris sort')}
            </div>
            <div className="split-menu-row">
              <Pick
                value={p.prefs.keyboard}
                options={KEYBOARDS}
                onChange={(v) => p.onPrefs({ keyboard: v as KeyboardChoice })}
                title="Préréglage clavier"
              />
              <span className="split-menu-note">Préréglage utilisé : {p.preset.name}</span>
            </div>
          </div>
        ) : null}
      </div>
      <div className="split-grid">
        {zoomed ? (
          <div className="split-node is-row">
            <div className="split-cell" style={{ flex: '1 1 0' }}>
              {renderPane(p.zoom as number)}
            </div>
          </div>
        ) : (
          renderNode(lay.tree, '')
        )}
      </div>
      {dragging ? <div className="split-shield" /> : null}
    </div>
  )
}
