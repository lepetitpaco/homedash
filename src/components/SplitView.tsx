import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Pick from './Pick'
import { desktop } from '../lib/desktop'
import { NAV_START, copyFrame, navFail, navOk, startUrl } from '../lib/splitViews'
import {
  ACTIONS_OFF_HINT,
  FLAG_HELP,
  LAYOUTS,
  MODE_LABELS,
  ZOOM_LABEL,
  dragRatios,
  nudgeRatios,
  separatorValue,
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
  /** Par case : une COPIE du site (nouvelle page, même connexion) plutôt que le vrai site ; décidé par le type (#179). */
  copies: boolean[]
  /** Dernière adresse notée de chaque copie (#180), lue à sa création seulement ; `null` = l'adresse de départ du site. */
  copyStart: (string | null)[]
  /** Une copie a navigué : l'adresse à noter (même site), ou `null` (autre site, page en erreur, accueil). */
  onCopyNav: (slot: number, url: string | null) => void
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
function CopyPane({
  site,
  rect,
  muted,
  start,
  onGuest,
  onNav,
}: {
  site: PaneSite
  rect: Rect | null
  muted: boolean
  start: string | null
  onGuest: (id: number | null) => void
  onNav: (url: string | null) => void
}) {
  // L'adresse de départ est fixée à la création : la changer ensuite rechargerait la copie (#180).
  const [src] = useState(() => (site.url ? startUrl(start, site.url) : site.url))
  const navRef = useRef(onNav)
  navRef.current = onNav
  const el = useRef<(HTMLElement & { setAudioMuted: (m: boolean) => void; getWebContentsId: () => number }) | null>(null)
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const guestRef = useRef(onGuest)
  guestRef.current = onGuest
  const frame = copyFrame(!!desktop, site.url ?? '')
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
    // #180 : chaque navigation (page ou reel changé sans recharger) est notée, nettoyée (navOk / navFail, splitViews.ts) :
    // une réponse HTTP en erreur n'est jamais notée, un échec de chargement rend la dernière bonne adresse.
    const home = site.url ?? ''
    let state = NAV_START
    const emit = (next: typeof state) => {
      if (next.current !== state.current) navRef.current(next.current)
      state = next
    }
    const nav = (e: Event) => {
      const ev = e as Event & { url?: string; isMainFrame?: boolean; httpResponseCode?: number }
      if (ev.type === 'did-navigate-in-page' && ev.isMainFrame === false) return
      emit(navOk(state, ev.url, home, ev.httpResponseCode))
    }
    const fail = (e: Event) => {
      const ev = e as Event & { errorCode?: number; isMainFrame?: boolean; validatedURL?: string }
      emit(navFail(state, ev.validatedURL, home, ev.errorCode ?? 0, ev.isMainFrame !== false))
    }
    w.addEventListener('did-navigate', nav)
    w.addEventListener('did-navigate-in-page', nav)
    w.addEventListener('did-fail-load', fail)
    return () => {
      w.removeEventListener('dom-ready', ready)
      w.removeEventListener('did-navigate', nav)
      w.removeEventListener('did-navigate-in-page', nav)
      w.removeEventListener('did-fail-load', fail)
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
      {frame === 'webview' ? (
        <webview
          ref={(n) => {
            el.current = n as typeof el.current
          }}
          src={src}
          partition={site.partition}
          {...{ allowpopups: 'true' as unknown as boolean }}
        />
      ) : frame === 'iframe' ? (
        // Hors de l'appli : un cadre, comme les sites dans un navigateur (même bac à sable que CustomTabView).
        <iframe
          className="split-copy-frame"
          src={src}
          title={site.label}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
          referrerPolicy="no-referrer"
          allow="clipboard-read; clipboard-write; fullscreen"
        />
      ) : (
        <p className="split-empty">Ce site refuse de s’afficher dans une autre page : ouvre la vue dans l’appli de bureau.</p>
      )}
    </div>
  )
}

/**
 * État du son d'un panneau : une icône SVG monochrome (`currentColor`), pas un emoji. Un emoji ignore la couleur (le vert
 * « a le son » ne se voyait jamais) et ses trois états diffèrent à peine à 14 px ; ici le contraste suit le thème (#186).
 */
function SoundIcon({ state }: { state: 'on' | 'off' | 'muted' }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 6v4h2.6L8.5 12.6V3.4L5.1 6z" fill="currentColor" stroke="none" />
      {state === 'on' ? <path d="M10.6 5.6a3.4 3.4 0 0 1 0 4.8M12.4 3.8a6 6 0 0 1 0 8.4" /> : null}
      {state === 'muted' ? <path d="M11 6l3.5 4M14.5 6L11 10" /> : null}
    </svg>
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
  // Séparateur aux flèches : l'aperçu suit chaque appui, l'écriture de la config est groupée (600 ms après le dernier appui,
  // ou à la sortie du séparateur) : une flèche tenue ne doit pas écrire la config à chaque répétition du clavier (#188).
  const kbLatest = useRef<Record<string, number[]> | null>(null)
  const kbTimer = useRef<number | undefined>(undefined)
  const kbCommit = () => {
    window.clearTimeout(kbTimer.current)
    const next = kbLatest.current
    kbLatest.current = null
    if (next) p.onRatios(next, true)
  }
  const [menu, setMenu] = useState<{ left: number; top: number } | null>(null)
  // L'aide (ⓘ) : une vraie bulle (`role="dialog"`), pas l'infobulle native de 688 caractères (#188).
  const [info, setInfo] = useState<{ left: number; top: number } | null>(null)
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

  // Menu des cases à cocher et bulle d'aide : se ferment au clic ailleurs, et à Échap (qui rend le focus au bouton).
  const popOpen = !!menu || !!info
  useEffect(() => {
    if (!popOpen) return
    const down = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.('.split-menu, .split-menu-btn, .split-info, .pick-menu')) {
        setMenu(null)
        setInfo(null)
      }
    }
    // Échap ferme cette couche, et elle seule : la vue reste ouverte (App ne prend pas l'Échap quand une couche est ouverte).
    // Tab reste dans la couche tant qu'elle est ouverte ; Échap rend le focus à son bouton.
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const back = menu ? '.split-menu-btn' : '.split-info'
        setMenu(null)
        setInfo(null)
        // Mode focus : le bouton gardé au focus clavier ferait rester les barres affichées (`:focus-visible`) ; on lâche le focus.
        if (document.querySelector('.app.is-focus')) (document.activeElement as HTMLElement | null)?.blur()
        else document.querySelector<HTMLElement>(`.split-bar ${back}`)?.focus()
        return
      }
      if (e.key !== 'Tab') return
      const layer = document.querySelector<HTMLElement>('.split-menu')
      if (!layer || !layer.contains(document.activeElement)) return
      const items = [...layer.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled)')]
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', key)
    }
  }, [popOpen, menu])
  // Ouvert, le menu prend le focus (sa première case) : sans cela il restait injoignable au clavier (portail en fin de <body>).
  useEffect(() => {
    if (!menu) return
    document.querySelector<HTMLElement>('.split-menu input:not(:disabled)')?.focus()
  }, [!!menu]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!info) return
    document.querySelector<HTMLElement>('.split-bubble')?.focus()
  }, [!!info]) // eslint-disable-line react-hooks/exhaustive-deps

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
        role="region"
        aria-label={`Panneau ${i + 1}${key ? ` : ${p.names[key] ?? site?.label ?? ''}` : ' (vide)'}`}
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
          {/* Copie ou vrai site : le type de la vue décide (#179), pas de bascule par panneau. */}
          {isCopy ? (
            <span className="split-copy-badge" title="Copie : une page à part, avec ta connexion">
              copie
            </span>
          ) : null}
          {key ? (
            <span
              className={`split-sound${plays && audioKey && p.audible[audioKey] ? ' is-on' : ''}`}
              role="img"
              aria-label={manual ? 'Son coupé à la main' : plays ? 'Ce panneau a le son' : 'Son coupé'}
              title={manual ? 'Son coupé à la main (clic droit sur le site)' : plays ? 'Ce panneau a le son' : 'Son coupé ici'}
            >
              <SoundIcon state={manual ? 'muted' : plays ? 'on' : 'off'} />
            </span>
          ) : null}
          {/* Flux : un panneau sans le son est en pause (les pages sont au-dessus de la grille : un voile ne se verrait pas). */}
          {key && desktop?.splitDo && p.prefs.mode === 'scroll' && !plays && !manual ? (
            <span className="split-paused" title="La vidéo de ce panneau est en pause : elle reprend quand il a le son">
              En pause
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
          {/* hors édition il n'y a pas de sélecteur : on dit où le trouver (#187) */}
          {key && !site ? <p className="split-empty">{p.editing ? 'Site retiré de Mes sites : choisis-en un autre.' : 'Site retiré de Mes sites. Clic droit sur la vue → Modifier la vue… pour en choisir un autre.'}</p> : null}
          {!key ? (
            <p className="split-empty">
              {p.editing
                ? p.gone[i]
                  ? 'Site retiré de Mes sites : choisis-en un autre.'
                  : 'Choisis un site pour ce panneau.'
                : p.gone[i]
                  ? 'Site retiré de Mes sites. Clic droit sur la vue → Modifier la vue… pour en choisir un autre.'
                  : 'Aucun site ici. Clic droit sur la vue → Modifier la vue… pour en choisir un.'}
            </p>
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
            tabIndex={0}
            aria-label="Redimensionner les panneaux (flèches)"
            aria-orientation={node.dir === 'row' ? 'vertical' : 'horizontal'}
            aria-valuemin={separatorValue(r, i).min}
            aria-valuemax={separatorValue(r, i).max}
            aria-valuenow={separatorValue(r, i).now}
            onBlur={kbCommit}
            onKeyDown={(e) => {
              // Flèches : le séparateur bouge de 2 % ; même règle que la souris (`dragRatios`).
              const back = node.dir === 'row' ? 'ArrowLeft' : 'ArrowUp'
              const fwd = node.dir === 'row' ? 'ArrowRight' : 'ArrowDown'
              if (e.key !== back && e.key !== fwd) return
              e.preventDefault()
              const cur = kbLatest.current?.[id] ?? r
              const next = { ...(kbLatest.current ?? ratios), [id]: nudgeRatios(cur, i, e.key === fwd ? 1 : -1) }
              kbLatest.current = next
              p.onRatios(next, false)
              window.clearTimeout(kbTimer.current)
              kbTimer.current = window.setTimeout(kbCommit, 600)
            }}
            onPointerDown={(e) => {
              // Un glissé souris prend la main sur une flèche en attente d'écriture : sinon le minuteur du clavier
              // écrasait le glissé 600 ms plus tard. L'aperçu des flèches est déjà dans `ratios`, donc dans le glissé.
              window.clearTimeout(kbTimer.current)
              kbLatest.current = null
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
    <div className={`split-root${dragging ? ' is-dragging' : ''}`} ref={root} role="region" aria-label="Vue scindée">
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
              setInfo(null)
              setMenu((v) => (v ? null : { left: Math.max(8, Math.min(r.left, window.innerWidth - 436)), top: r.bottom + 4 }))
            }}
            title="Valable le temps de la vue ; pour garder, Modifier la vue (clic droit sur la vue)"
          >
            Options ▾
          </button>
        </div>
        <div className="split-end">
          {legendEl}
          <button
            className="split-info"
            aria-expanded={!!info}
            aria-label="Aide : raccourcis et comportement de la vue"
            title="Aide de la vue scindée"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              setMenu(null)
              setInfo((v) => (v ? null : { left: Math.max(8, Math.min(r.right - 520, window.innerWidth - 536)), top: r.bottom + 6 }))
            }}
          >
            ⓘ
          </button>
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
        {info
          ? createPortal(
              <div
                className="split-menu split-bubble"
                role="dialog"
                aria-label="Aide de la vue scindée"
                tabIndex={-1}
                onBlur={(e) => {
                  // Le focus passe à ⓘ au clic de souris (mousedown, avant click) : sa propre bascule referme la bulle ;
                  // fermer ici la ferait rouvrir aussitôt (régression vue par le vérificateur).
                  const to = e.relatedTarget as HTMLElement | null
                  if (to?.closest?.('.split-info')) return
                  if (!e.currentTarget.contains(to)) setInfo(null)
                }}
                style={{ left: info.left, top: info.top, maxHeight: Math.max(160, window.innerHeight - info.top - 8), overflowY: 'auto' }}
              >
                {legend.long.split('. ').map((t, k, all) => (
                  <p key={k} className="split-bubble-line">
                    {k < all.length - 1 && !t.endsWith('.') ? `${t}.` : t}
                  </p>
                ))}
              </div>,
              document.body,
            )
          : null}
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
        return c && site && i < lay.n ? <CopyPane
            key={`${i}:${k}`}
            site={site}
            rect={copyRects[i] ?? null}
            muted={p.copyMuted[i] ?? true}
            start={p.copyStart[i] ?? null}
            onGuest={(id) => p.onCopyGuest(i, id)}
            onNav={(url) => p.onCopyNav(i, url)}
          /> : null
      })}
      {dragging ? createPortal(<div className="split-shield" />, document.body) : null}
    </div>
  )
}
