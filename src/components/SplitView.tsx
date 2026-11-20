import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Pick from './Pick'
import {
  ACTIONS_OFF_HINT,
  FLAG_HELP,
  LAYOUTS,
  MODE_LABELS,
  ZOOM_LABEL,
  dragRatios,
  layoutOf,
  splitLegend,
  type Preset,
  type SplitNode,
  type SplitPrefs,
} from '../lib/splitView'

export type Rect = { x: number; y: number; w: number; h: number }
/** `color` : celle du compte du site (pastille dans le sélecteur). */
export type PaneSite = { key: string; label: string; icon: React.ReactNode; color?: string; /** Adresse d'accueil et connexion du site : une copie s'ouvre dessus. */ url?: string; partition?: string }

type Props = {
  layout: string
  onLayout: (id: string) => void
  /** Site de chaque case (clé d'onglet), `null` = vide. */
  slots: (string | null)[]
  sites: PaneSite[]
  onSite: (slot: number, key: string | null) => void
  /** Nom de chaque site dans le sélecteur : « X · pro » quand il a un compte. */
  names: Record<string, string>
  /** Mode édition d'une vue enregistrée : sélecteurs de site et dispositions visibles ; sinon la composition est fixe. */
  editing: boolean
  onSaveEdit: () => void
  onCancelEdit: () => void
  /** Avertissement d'édition (« deux sites au moins »), dans la barre : pas un panneau, pas un champ. */
  editWarning?: string
  /** Proportions des séparateurs, par chemin de nœud (`''`, `'0'`, `'1'`…) ; `commit` : le séparateur est lâché. */
  ratios: Record<string, number[]>
  onRatios: (next: Record<string, number[]>, commit: boolean) => void
  /** Cases dont le site a été retiré de Mes sites. */
  gone: boolean[]
  /** Par case : une COPIE du site (nouvelle page, même connexion) plutôt que le vrai site. */
  copies: boolean[]
  onCopy: (slot: number, copy: boolean) => void
  /** La webview d'une copie est prête (id) ; `null` quand elle disparaît. */
  onCopyGuest: (slot: number, id: number | null) => void
  /** Son coupé d'office pour une copie (le panneau n'a pas le son). */
  copyMuted: boolean[]
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
export function Mini({ node }: { node: SplitNode }) {
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

/**
 * Une copie : une webview de plus sur la MÊME connexion que le site (mêmes cookies, mêmes comptes) mais une page à part,
 * son historique et sa position. Posée en position fixe sur l'emplacement de son panneau (comme les sites réels) pour
 * ne pas être recréée quand on agrandit un panneau. Fermée avec la vue.
 */
function CopyPane({ site, rect, muted, onGuest }: { site: PaneSite; rect: Rect | null; muted: boolean; onGuest: (id: number | null) => void }) {
  const el = useRef<(HTMLElement & { setAudioMuted: (m: boolean) => void; getWebContentsId: () => number }) | null>(null)
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const guestRef = useRef(onGuest)
  guestRef.current = onGuest
  useEffect(() => {
    const w = el.current
    if (!w) return
    const ready = () => {
      try {
        w.setAudioMuted(mutedRef.current)
        guestRef.current(w.getWebContentsId())
      } catch {
        /* webview pas encore prête */
      }
    }
    w.addEventListener('dom-ready', ready)
    return () => {
      w.removeEventListener('dom-ready', ready)
      guestRef.current(null)
    }
  }, [])
  useEffect(() => {
    try {
      el.current?.setAudioMuted(muted)
    } catch {
      /* pas encore prête : dom-ready s'en charge */
    }
  }, [muted])
  return (
    <div
      className={`split-copy${rect ? '' : ' is-parked'}`}
      style={rect ? { left: rect.x, top: rect.y, width: rect.w, height: rect.h } : undefined}
      aria-hidden={!rect}
    >
      <webview
        ref={(n) => {
          el.current = n as typeof el.current
        }}
        src={site.url}
        partition={site.partition}
        {...{ allowpopups: 'true' as unknown as boolean }}
      />
    </div>
  )
}

export default function SplitView(p: Props) {
  const root = useRef<HTMLDivElement>(null)
  const bodies = useRef<(HTMLDivElement | null)[]>([])
  const lastRects = useRef('')
  const rectsNow = useRef<(Rect | null)[]>([])
  const [copyRects, setCopyRects] = useState<(Rect | null)[]>([])
  const ratios = p.ratios
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
    setCopyRects(out)
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
    // Échap ferme ce menu, et lui seul : la vue reste ouverte (App ne prend pas l'Échap quand une couche est ouverte).
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null)
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', esc)
    }
  }, [menu])

  // Un site n'est que dans une case : celui d'une autre case est grisé (« déjà dans cette vue »).
  const siteOptions = (i: number) => [
    { value: '', label: '— aucun —' },
    ...p.sites.map((s) => {
      const used = p.slots.some((k, j) => k === s.key && j !== i && j < lay.n)
      return { value: s.key, label: p.names[s.key] ?? s.label, icon: s.icon, color: s.color, disabled: used, hint: used ? 'déjà dans cette vue' : undefined }
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
    const isCopy = !!key && !!site && !!p.copies[i]
    const audioKey = isCopy ? `copy:${i}` : key
    const manual = key && !isCopy ? !!p.muted[key] : false
    const plays = !!key && !manual && (p.prefs.mode !== 'scroll' || p.sound === i)
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
          {p.editing ? (
            <Pick value={key ?? ''} options={siteOptions(i)} onChange={(v) => p.onSite(i, v || null)} title="Site de ce panneau" />
          ) : (
            // Vue enregistrée : la composition est fixe, le site s'affiche sans pouvoir être changé d'ici.
            <span className="split-site" title={key ? (p.names[key] ?? site?.label) : undefined}>
              {site?.color ? <span className="pick-dot" style={{ background: site.color }} /> : null}
              {site?.icon ? <span className="pick-icon" aria-hidden="true">{site.icon}</span> : null}
              <span className="split-site-name">{key ? (p.names[key] ?? site?.label ?? '') : '—'}</span>
            </span>
          )}
          {p.editing && key && site ? (
            <button
              className={`split-copy-toggle${isCopy ? ' is-on' : ''}`}
              aria-pressed={isCopy}
              title={isCopy ? 'Copie : une page à part, avec ta connexion (clic : revenir au vrai site)' : 'Vrai site : ses notifications et ses compteurs (clic : en faire une copie à part)'}
              onClick={() => p.onCopy(i, !isCopy)}
            >
              {isCopy ? 'Copie' : 'Site réel'}
            </button>
          ) : isCopy ? (
            <span className="split-copy-badge" title="Copie : une page à part, avec ta connexion">
              copie
            </span>
          ) : null}
          {key ? (
            <span
              className={`split-sound${plays && audioKey && p.audible[audioKey] ? ' is-on' : ''}`}
              title={manual ? 'Son coupé à la main (clic droit sur le site)' : plays ? 'Ce panneau a le son' : 'Son coupé ici'}
            >
              {manual ? '🔇' : plays ? '🔊' : '🔈'}
            </span>
          ) : null}
          <span className="set-spacer" />
          <button
            className="split-btn"
            onClick={() => p.onZoom(zoomed ? null : i)}
            title={zoomed ? `Restaurer la grille (en mode Flux : ${ZOOM_LABEL})` : `Agrandir ce panneau (double-clic sur le titre ; en mode Flux : ${ZOOM_LABEL})`}
            aria-label={zoomed ? 'Restaurer la grille' : 'Agrandir ce panneau'}
          >
            {zoomed ? '⤡' : '⤢'}
          </button>
        </div>
        <div className="split-body" ref={(el) => {
            bodies.current[i] = el
          }}>
          {/* une seule phrase : le site a disparu, ou la case est vide */}
          {key && !site ? <p className="split-empty">Site retiré de Mes sites.</p> : null}
          {!key ? (
            <p className="split-empty">{p.gone[i] ? 'Site retiré de Mes sites : choisis-en un autre.' : 'Choisis un site pour ce panneau.'}</p>
          ) : null}
        </div>
        {p.notes[i] ? note(i) : null}
      </div>
    )
  }

  const renderNode = (node: SplitNode, path: string): React.ReactNode => {
    if (node === 'pane') return renderPane(slot++)
    const id = path
    const r = ratios[id] && ratios[id].length === node.children.length ? ratios[id] : node.ratios
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
              let latest = ratios
              const move = (ev: PointerEvent) => {
                const d = ((node.dir === 'row' ? ev.clientX : ev.clientY) - start) / size
                latest = { ...ratios, [id]: dragRatios(base, i, d) }
                p.onRatios(latest, false)
              }
              const up = () => {
                setDragging(false)
                p.onRatios(latest, true)
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

  // « Actions par site » est sans effet en Messagerie : grisée, avec la raison.
  const flag = (f: (typeof FLAG_HELP)[number]) => {
    const off = f.key === 'actions' && p.prefs.mode !== 'scroll'
    return (
      <label className="set-toggle" key={f.key} aria-disabled={off || undefined}>
        <input type="checkbox" checked={p.prefs[f.key]} disabled={off} onChange={(e) => p.onPrefs({ [f.key]: e.target.checked })} />
        <span>
          {f.label}
          <em>{off ? ACTIONS_OFF_HINT : f.hint}</em>
        </span>
      </label>
    )
  }

  // Les raccourcis du mode : en toutes lettres quand il y a la place ; l'aide complète dans la bulle de ⓘ.
  const legend = splitLegend(p.prefs.mode, p.preset, lay.n)
  const legendEl = <span className="split-legend">{legend.short}</span>

  return (
    <div className={`split-root${dragging ? ' is-dragging' : ''}`} ref={root} aria-label="Vue scindée">
      <div className="split-bar" onMouseEnter={p.onLeave}>
        <div className="split-group" role="group" aria-label="Mode de la vue scindée">
          {MODE_LABELS.map((m) => (
            <button
              key={m.id}
              className="split-chip"
              aria-pressed={p.prefs.mode === m.id}
              title={m.hint}
              onClick={() => p.onProfile(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        {p.editing ? (
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
        ) : null}
        <div className="split-group">
          <button
            className="split-chip split-menu-btn"
            aria-expanded={!!menu}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              setMenu((v) => (v ? null : { left: Math.max(8, Math.min(r.left, window.innerWidth - 436)), top: r.bottom + 4 }))
            }}
            title="Valable le temps de la vue ; pour garder, Modifier la vue (clic droit sur la vue)"
          >
            Options ▾
          </button>
        </div>
        <div className="split-end">
          {legendEl}
          <span className="split-info" role="img" aria-label={legend.long} title={legend.long}>
            ⓘ
          </span>
          {p.editing ? (
            <>
              {p.editWarning ? (
                <span className="split-warn" role="alert">
                  {p.editWarning}
                </span>
              ) : null}
              <button className="split-chip" onClick={p.onSaveEdit} title="Enregistrer la composition de cette vue">
                Enregistrer
              </button>
              <button className="split-chip" onClick={p.onCancelEdit} title="Annuler les changements de cette vue">
                Annuler
              </button>
            </>
          ) : (
            <button className="split-chip" onClick={p.onClose} title="Fermer la vue scindée (en mode Flux : Échap)">
              Fermer
            </button>
          )}
        </div>
        {menu
          ? createPortal(
          <div className="split-menu" role="dialog" aria-label="Options de la vue scindée" style={{ left: menu.left, top: menu.top, maxHeight: Math.max(160, window.innerHeight - menu.top - 8), overflowY: 'auto' }}>
            <div className="set-toggles">
              {FLAG_HELP.map(flag)}
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
      {p.copies.map((c, i) => {
        const k = p.slots[i]
        const site = k ? p.sites.find((x) => x.key === k) : undefined
        return c && site && i < lay.n ? <CopyPane key={`${i}:${k}`} site={site} rect={copyRects[i] ?? null} muted={p.copyMuted[i] ?? true} onGuest={(id) => p.onCopyGuest(i, id)} /> : null
      })}
      {dragging ? createPortal(<div className="split-shield" />, document.body) : null}
    </div>
  )
}
