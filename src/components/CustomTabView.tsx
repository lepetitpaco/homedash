import { useEffect, useRef, useState } from 'react'
import { isLocal, refusesEmbed, srcOf, tabKey } from '../lib/customTabs'
import {
  desktop,
  OPEN_IN_TAB,
  partitionOf,
  RELOAD_TAB,
  type OpenInTab,
  type WebviewEl,
} from '../lib/desktop'
import { pageCounter, tabCounter } from '../lib/tabCount'
import type { CustomTab } from '../types'

/** Relecture des non-lus dans la page (`pageCounter`), sites concernés seulement. */
const PAGE_POLL_MS = 2_000

/**
 * Onglet perso affiché dans la page : le site ou le fichier dans un cadre.
 *
 * Monté une fois puis seulement masqué (`hidden`) : revenir sur l'onglet ne
 * recharge pas la page qu'il contient.
 *
 * Dans un navigateur, le cadre est une iframe, et beaucoup de sites la
 * refusent (page blanche) : le bandeau le dit et propose de l'ouvrir à part.
 * Dans l'appli de bureau (desktop/), c'est une <webview> : un affichage du
 * navigateur lui-même, que rien ne refuse. Elle remonte aussi les non-lus lus
 * dans le titre de la page, ou dans la page pour les sites qui ne les y mettent
 * pas (`pageCounter`) : `onCount`, d'après `tabCounter`.
 */
export default function CustomTabView({
  tab,
  hidden,
  onSettings,
  onCount,
  session,
  onGuest,
  icon,
  onNavigate,
  onVisit,
  onLoaded,
  muted = false,
}: {
  /** Son coupé (clic droit, ou 🔊 de l'onglet) : réappliqué à chaque chargement. */
  muted?: boolean
  /** Durée d'un chargement complet (ouverture, réveil, ↻) : journal de performance. */
  onLoaded?: (ms: number) => void
  tab: CustomTab
  /** Icône de l'onglet (celle de la barre), rappelée dans l'en-tête. */
  icon?: React.ReactNode
  /**
   * Onglet éphémère : une barre d'adresse dans l'en-tête, et l'adresse
   * atteinte remontée (son nom suit le site visité).
   */
  onNavigate?: (url: string) => void
  /** Page vue ou son titre (`title` absent = nouvelle page) : historique de la recherche. */
  onVisit?: (url: string, title?: string) => void
  /** Id de la webview (appli de bureau) : App sait ainsi de quel onglet vient un lien ou un clic droit. */
  onGuest?: (id: number) => void
  /** Compte de connexion de l'onglet, rappelé dans l'en-tête. */
  session?: { name: string; color: string }
  hidden: boolean
  onSettings: () => void
  onCount?: (n: number) => void
}) {
  // Changer `key` recrée l'iframe : c'est son ↻ (un site tiers ne se laisse pas recharger d'ici).
  const [gen, setGen] = useState(0)
  const [failed, setFailed] = useState<string | null>(null)
  // Trait de chargement : la page qui revient se voit, même quand elle est rapide.
  const [loading, setLoading] = useState(true)
  const view = useRef<WebviewEl | null>(null)
  const local = isLocal(tab.url)
  // Une webview ne résout pas une adresse relative : `api/file?…` devient absolue.
  const src = new URL(srcOf(tab.url), window.location.href).href
  // Adresse de départ seulement : celle d'un éphémère suit sa navigation, et la
  // repasser à la webview la rechargerait. Autre adresse voulue = autre `key`.
  const [startSrc] = useState(src)
  const blocked = !desktop && !local && refusesEmbed(tab.url)

  const countRef = useRef(onCount)
  countRef.current = onCount
  const hiddenRef = useRef(hidden)
  hiddenRef.current = hidden
  // Onglet qui s'affiche : son compte retenu (un 0 en attente) passe aussitôt.
  const reportRef = useRef<() => void>(() => {})
  useEffect(() => {
    if (!hidden) reportRef.current()
  }, [hidden])
  const guestRef = useRef(onGuest)
  guestRef.current = onGuest
  const navRef = useRef(onNavigate)
  navRef.current = onNavigate
  const visitRef = useRef(onVisit)
  visitRef.current = onVisit
  const loadedRef = useRef(onLoaded)
  loadedRef.current = onLoaded
  const loadStart = useRef(0)
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  useEffect(() => {
    try {
      view.current?.setAudioMuted(muted)
    } catch {
      /* webview pas encore attachée : dom-ready s'en charge */
    }
  }, [muted])
  // Barre d'adresse (onglets éphémères) : l'adresse affichée, et ce qu'on tape.
  const [address, setAddress] = useState(tab.url)
  const [typing, setTyping] = useState<string | null>(null)

  useEffect(() => {
    const el = view.current
    if (!desktop || !el) return
    const code = pageCounter(startSrc)
    const counter = tabCounter({
      emit: (n) => countRef.current?.(n),
      hidden: () => hiddenRef.current,
      byPage: !!code,
    })
    reportRef.current = counter.report
    const readPage = () => {
      if (!code) return
      el.executeJavaScript(code)
        .then(counter.page)
        .catch(() => {
          /* page en cours de chargement */
        })
    }
    const poll = code ? window.setInterval(readPage, PAGE_POLL_MS) : 0
    const onTitle = (e: Event) => {
      const title = (e as Event & { title: string }).title
      counter.title(title)
      try {
        visitRef.current?.(el.getURL(), title)
      } catch {
        /* pas encore attachée */
      }
    }
    const onFail = (e: Event) => {
      const { errorCode, errorDescription, isMainFrame } = e as Event & {
        errorCode: number
        errorDescription: string
        isMainFrame: boolean
      }
      // -3 = navigation annulée (une redirection qui en remplace une autre)
      if (isMainFrame && errorCode !== -3) setFailed(errorDescription || `erreur ${errorCode}`)
    }
    const onLoad = () => setFailed(null)
    const onReady = () => {
      try {
        if (mutedRef.current) el.setAudioMuted(true)
        guestRef.current?.(el.getWebContentsId())
      } catch {
        /* pas encore attachée */
      }
    }
    const onNav = (e: Event) => {
      const url = (e as Event & { url: string }).url
      if (!/^https?:/.test(url)) return
      setAddress(url)
      navRef.current?.(url)
      visitRef.current?.(url)
    }
    // `did-start-loading` part aussi pour les cadres : seule la page elle-même compte.
    const onPageStart = (e: Event) => {
      const { isMainFrame, isInPlace } = e as Event & { isMainFrame: boolean; isInPlace: boolean }
      if (isMainFrame && !isInPlace) counter.loading()
    }
    const onStart = () => {
      setLoading(true)
      if (!loadStart.current) loadStart.current = performance.now()
    }
    const onStop = () => {
      setLoading(false)
      if (loadStart.current) loadedRef.current?.(Math.round(performance.now() - loadStart.current))
      loadStart.current = 0
    }
    el.addEventListener('dom-ready', onReady)
    el.addEventListener('did-navigate', onNav)
    el.addEventListener('did-navigate-in-page', onNav)
    el.addEventListener('did-start-loading', onStart)
    el.addEventListener('did-stop-loading', onStop)
    el.addEventListener('page-title-updated', onTitle)
    el.addEventListener('did-fail-load', onFail)
    el.addEventListener('did-finish-load', onLoad)
    el.addEventListener('page-favicon-updated', readPage)
    el.addEventListener('did-start-navigation', onPageStart)
    return () => {
      el.removeEventListener('did-start-navigation', onPageStart)
      window.clearInterval(poll)
      counter.stop()
      el.removeEventListener('page-favicon-updated', readPage)
      el.removeEventListener('dom-ready', onReady)
      el.removeEventListener('did-navigate', onNav)
      el.removeEventListener('did-navigate-in-page', onNav)
      el.removeEventListener('did-start-loading', onStart)
      el.removeEventListener('did-stop-loading', onStop)
      el.removeEventListener('page-title-updated', onTitle)
      el.removeEventListener('did-fail-load', onFail)
      el.removeEventListener('did-finish-load', onLoad)
    }
  }, [])

  const reload = () => {
    setLoading(true)
    if (desktop) view.current?.reload()
    else setGen((g) => g + 1)
  }

  // ⇧⌘R dans l'appli : App dit quel onglet recharger.
  const reloadRef = useRef(reload)
  reloadRef.current = reload
  const key = tabKey(tab)
  useEffect(() => {
    const on = (e: Event) => (e as CustomEvent<string>).detail === key && reloadRef.current()
    window.addEventListener(RELOAD_TAB, on)
    // Un lien d'un autre onglet, à ouvrir ici (App a choisi cet onglet).
    const open = (e: Event) => {
      const d = (e as CustomEvent<OpenInTab>).detail
      if (d.key === key && view.current) void view.current.loadURL(d.url)
    }
    window.addEventListener(OPEN_IN_TAB, open)
    return () => {
      window.removeEventListener(RELOAD_TAB, on)
      window.removeEventListener(OPEN_IN_TAB, open)
    }
  }, [key])
  // Dans l'appli : l'adresse où l'on est arrivé, pas celle de départ.
  const openOutside = () => desktop?.openExternal(view.current?.getURL() || src)

  return (
    // Dans l'appli, une webview masquée (display: none) cesse de suivre sa page :
    // on la gare hors de l'écran, pour que les pastilles continuent d'arriver.
    <section className={`xtab${desktop && hidden ? ' is-parked' : ''}`} hidden={!desktop && hidden} aria-hidden={hidden}>
      <div className="xtab-bar">
        <span className="xtab-title">
          <span className="xtab-icon" aria-hidden="true">
            {icon ?? (tab.icon || (local ? '📄' : '🌐'))}
          </span>
          {tab.label}
        </span>
        {session ? (
          <span className="xtab-session" style={{ ['--session' as string]: session.color }}>
            compte {session.name}
          </span>
        ) : null}
        {onNavigate && desktop ? (
          <input
            className="xtab-address"
            value={typing ?? address}
            placeholder="Adresse ou recherche"
            onFocus={(e) => e.target.select()}
            onChange={(e) => setTyping(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setTyping(null)
                e.currentTarget.blur()
              }
              if (e.key !== 'Enter' || !typing?.trim()) return
              const q = typing.trim()
              // une adresse (avec ou sans https://), sinon une recherche Google
              const url = /^[a-z]+:\/\//i.test(q)
                ? q
                : /^[^\s]+\.[^\s]{2,}$/.test(q)
                  ? `https://${q}`
                  : `https://www.google.com/search?q=${encodeURIComponent(q)}`
              setTyping(null)
              e.currentTarget.blur()
              void view.current?.loadURL(url)
            }}
            autoComplete="off"
            spellCheck={false}
            data-1p-ignore
          />
        ) : (
          <code className="xtab-url" title={tab.url}>
            {tab.url}
          </code>
        )}
        <span className="set-spacer" />
        {desktop ? null : blocked ? (
          <span className="xtab-warn">
            Ce site refuse l'affichage dans une page : il s'affiche dans l'appli de bureau homedash, ou ↗ à part.
          </span>
        ) : (
          <span className="xtab-hint">Page blanche ? Le site refuse l'affichage intégré : ouvre-le à part.</span>
        )}
        {desktop ? (
          <button
            className="xtab-btn"
            onClick={() => view.current?.canGoBack() && view.current.goBack()}
            title="Page précédente dans cet onglet"
          >
            ←
          </button>
        ) : null}
        <button className="xtab-btn" onClick={reload} title="Recharger le contenu de l'onglet">
          ↻
        </button>
        {desktop ? (
          <button className="xtab-btn" onClick={openOutside} title="Ouvrir dans le navigateur par défaut">
            ↗ ouvrir à part
          </button>
        ) : (
          <a className="xtab-btn" href={src} target="_blank" rel="noreferrer" data-outside title="Ouvrir dans un onglet du navigateur">
            ↗ ouvrir à part
          </a>
        )}
        <button className="xtab-btn" onClick={onSettings} title="Modifier ou supprimer cet onglet">
          ⚙
        </button>
      </div>
      {failed ? (
        <p className="xtab-warn">
          ✗ {failed} — <button className="bell-link" onClick={reload}>réessayer</button>
        </p>
      ) : null}
      <div className="xtab-body">
      {loading ? <div className="xtab-loading" aria-hidden="true" /> : null}
      {desktop ? (
        // Session du compte de l'onglet (main.js n'accepte que les siennes) :
        // les onglets d'un même compte partagent leur connexion.
        <webview
          ref={(el) => {
            view.current = el as WebviewEl | null
          }}
          className="xtab-frame"
          src={startSrc}
          partition={partitionOf(tab.session)}
          // attribut à valeur texte : un booléen React ne serait pas écrit dans le DOM
          {...{ allowpopups: 'true' as unknown as boolean }}
        />
      ) : (
        <iframe
          key={gen}
          className="xtab-frame"
          src={src}
          title={tab.label}
          // Fichier local : pas d'attribut sandbox, Chrome n'affiche pas un PDF
          // sandboxé ; le serveur isole lui-même ce qui peut exécuter du code
          // (CSP sandbox sur HTML / SVG). Site tiers : tout sauf naviguer la page entière.
          {...(local
            ? {}
            : {
                sandbox:
                  'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals',
              })}
          referrerPolicy="no-referrer"
          allow="clipboard-read; clipboard-write; fullscreen"
          onLoad={() => setLoading(false)}
        />
      )}
      </div>
    </section>
  )
}
