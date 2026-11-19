import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Pick from './Pick'
import {
  FLAG_HELP,
  FOLLOW_OPTIONS,
  KEYBOARD_OPTIONS,
  LAYOUTS,
  MODE_LABELS,
  dragRatios,
  layoutOf,
  mixLabel,
  type Follow,
  type KeyboardChoice,
  type Preset,
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
  /** Nom de chaque site dans le sélecteur : « X · pro » quand il a un compte. */
  names: Record<string, string>
  /** Vue enregistrée ouverte (son nom) : « Garder cette vue » la met alors à jour. */
  savedName?: string
  onSave: () => void
  /** Cases dont le site a été retiré de Mes sites. */
  gone: boolean[]
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
  const rectsNow = useRef<(Rect | null)[]>([])
  const [ratios, setRatios] = useState<Record<string, number[]>>({})
  const [dragging, setDragging] = useState(false)
  const [menu, setMenu] = useState<{ left: number; top: number } | null>(null)
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
    rectsNow.current = out
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

  // Menu des cases à cocher : se ferme au clic ailleurs.
  useEffect(() => {
    if (!menu) return
    const down = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.('.split-menu, .split-menu-btn, .pick-menu')) setMenu(null)
    }
    window.addEventListener('mousedown', down)
    return () => window.removeEventListener('mousedown', down)
  }, [menu])

  // Un site n'est que dans une case : celui d'une autre case est grisé (« déjà dans cette vue »).
  const siteOptions = (i: number) => [
    { value: '', label: '— aucun —' },
    ...p.sites.map((s) => {
      const used = p.slots.some((k, j) => k === s.key && j !== i && j < lay.n)
      return { value: s.key, label: p.names[s.key] ?? s.label, disabled: used, hint: used ? 'déjà dans cette vue' : undefined }
    }),
  ]

  // La note d'un panneau (« action indisponible ») passe par <body> : les sites, posés en position fixe,
  // sont au-dessus de tout ce qui est dans la grille.
  const note = (i: number) => {
    const r = rectsNow.current[i]
    if (!r) return null
    return createPortal(
      <span className="split-note" role="status" style={{ left: r.x + 10, width: Math.max(0, r.w - 20), top: r.y + r.h - 46 }}>
        {p.notes[i]}
      </span>,
      document.body,
    )
  }

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
        onMouseDown={() => p.onPick(i)}
      >
        <div className="split-head" onDoubleClick={() => p.onZoom(zoomed ? null : i)}>
          <span className="split-num" aria-hidden="true">
            {i + 1}
          </span>
          <Pick
            value={key ?? ''}
            options={siteOptions(i)}
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
            title={zoomed ? 'Restaurer la grille (en mode Scroll : Z)' : 'Agrandir ce panneau (double-clic sur le titre ; en mode Scroll : Z)'}
            aria-label={zoomed ? 'Restaurer la grille' : 'Agrandir ce panneau'}
          >
            {zoomed ? '⤡' : '⤢'}
          </button>
        </div>
        <div className="split-body" ref={(el) => {
            bodies.current[i] = el
          }}>
          {!key ? <p className="split-empty">Choisis un site pour ce panneau.</p> : null}
          {key && !site ? <p className="split-empty">Site retiré de Mes sites.</p> : null}
          {!key && p.gone[i] ? <p className="split-empty">Site retiré de Mes sites : choisis-en un autre.</p> : null}
        </div>
        {p.notes[i] ? note(i) : null}
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

  const flag = (f: (typeof FLAG_HELP)[number]) => (
    <label className="set-toggle" key={f.key}>
      <input type="checkbox" checked={p.prefs[f.key]} onChange={(e) => p.onPrefs({ [f.key]: e.target.checked })} />
      <span>
        {f.label}
        <em>{f.hint}</em>
      </span>
    </label>
  )

  return (
    <div className={`split-root${dragging ? ' is-dragging' : ''}`} ref={root} aria-label="Vue scindée">
      <div className="split-bar" onMouseEnter={p.onLeave}>
        <div className="split-group" role="group" aria-label="Mode de la vue scindée">
          {MODE_LABELS.map((m) => (
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
            options={FOLLOW_OPTIONS}
            onChange={(v) => p.onPrefs({ follow: v as Follow })}
            title="Qui a le son"
          />
          <button
            className="split-chip split-menu-btn"
            aria-expanded={!!menu}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              setMenu((v) => (v ? null : { left: Math.max(8, Math.min(r.left, window.innerWidth - 436)), top: r.bottom + 4 }))
            }}
            title="Raccourcis clavier, actions, mixage…"
          >
            Options ▾
          </button>
        </div>
        {p.prefs.keys ? (
          <span className="split-legend" title="Raccourcis du mode actuel">
            {p.prefs.mixer
              ? `Mixage (remplace J K, N P, Z et les actions) : ${p.preset.mix.slice(0, lay.n).map((_, i) => `${i + 1} : ${mixLabel(p.preset, i)}`).join('  ·  ')}`
              : `Alt + ${p.preset.digits.slice(0, lay.n).join(' ')} : changer de panneau  ·  J K : défiler  ·  Z : agrandir`}
          </span>
        ) : (
          <span className="split-legend" title="Raccourcis du mode actuel">Aucune touche interceptée : tu tapes dans les sites comme d'habitude.</span>
        )}
        <button className="split-chip" onClick={p.onSave} title="Garder cette vue dans la barre de gauche, avec son compteur">
          {p.savedName ? `Mettre à jour « ${p.savedName} »` : 'Garder cette vue'}
        </button>
        <button className="split-chip" onClick={p.onClose} title="Fermer la vue scindée (en mode Scroll : Échap)">
          Fermer
        </button>
        {menu
          ? createPortal(
          <div className="split-menu" role="dialog" aria-label="Options de la vue scindée" style={{ left: menu.left, top: menu.top }}>
            <div className="set-toggles">
              {FLAG_HELP.map(flag)}
            </div>
            <div className="split-menu-row">
              <Pick
                value={p.prefs.keyboard}
                options={KEYBOARD_OPTIONS}
                onChange={(v) => p.onPrefs({ keyboard: v as KeyboardChoice })}
                title="Préréglage clavier"
              />
              <span className="split-menu-note">Préréglage utilisé : {p.preset.name}</span>
            </div>
          </div>,
          document.body,
          )
          : null}
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
      {dragging ? createPortal(<div className="split-shield" />, document.body) : null}
    </div>
  )
}
