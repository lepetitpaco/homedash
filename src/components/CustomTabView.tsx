import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TOPBAR_SITE_SLOT } from './TopBar'
import { isLocal, refusesEmbed, srcOf, tabKey } from '../lib/customTabs'
import {
  desktop,
  OPEN_IN_TAB,
  partitionOf,
  RELOAD_TAB,
  type OpenInTab,
  type WebviewEl,
} from '../lib/desktop'
import { MUTE_SITE_NOTIFICATIONS, RECOUNT_TABS, pageCounter, tabCounter } from '../lib/tabCount'
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
  merged = false,
}: {
  /** Site affiché en grand (ouvert depuis la barre de gauche) : son en-tête va dans la barre du haut. */
  merged?: boolean
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
  // Notifications coupées : réappliqué à chaque chargement (dom-ready) ; les
  // rétablir recharge le site, seul moyen de lui rendre les vraies.
  const silent = tab.notify === false
  const silentRef = useRef(silent)
  const wasSilent = useRef(silent)
  silentRef.current = silent
  useEffect(() => {
    const el = view.current
    if (!desktop || !el) return
    try {
      if (silent) void el.executeJavaScript(MUTE_SITE_NOTIFICATIONS).catch(() => {})
      else if (wasSilent.current) el.reload()
    } catch {
      /* webview pas encore attachée : dom-ready s'en charge */
    }
    wasSilent.current = silent
  }, [silent])
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
      if (isMainFrame && errorCode !== -3) {
        setFailed(errorDescription || `erreur ${errorCode}`)
        loadStart.current = 0 // échec : pas une durée de chargement
      }
    }
    // Durée d'un chargement (journal de performance) : de la navigation de la page
    // elle-même à `did-finish-load` (cadre principal seulement). Pas les cadres
    // internes : Chat en recharge des dizaines par heure, les chiffres n'avaient
    // plus de sens.
    const onLoad = () => {
      setFailed(null)
      if (loadStart.current) loadedRef.current?.(Math.round(performance.now() - loadStart.current))
      loadStart.current = 0
    }
    const onReady = () => {
      try {
        if (mutedRef.current) el.setAudioMuted(true)
        if (silentRef.current) void el.executeJavaScript(MUTE_SITE_NOTIFICATIONS).catch(() => {})
        guestRef.current?.(el.getWebContentsId())
      } catch {
        /* pas encore attachée */
      }
    }
    const onNav = (e: Event) => {
      const { url, isMainFrame } = e as Event & { url: string; isMainFrame?: boolean }
      // les cadres du site (widgets, iframes) naviguent aussi : seule la page compte
      if (!/^https?:/.test(url) || isMainFrame === false) return
      setAddress(url)
      navRef.current?.(url)
      visitRef.current?.(url)
    }
    // `did-start-loading` part aussi pour les cadres : seule la page elle-même compte.
    const onPageStart = (e: Event) => {
      const { isMainFrame, isInPlace } = e as Event & { isMainFrame: boolean; isInPlace: boolean }
      if (!isMainFrame || isInPlace) return
      counter.loading()
      loadStart.current = performance.now()
    }
    const onStart = () => setLoading(true)
    const onStop = () => setLoading(false)
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
    // « Tout actualiser » : relire titre et page, sans recharger le site.
    const recount = () => {
      readPage()
      try {
        counter.title(el.getTitle())
      } catch {
        /* webview pas encore attachée */
      }
    }
    window.addEventListener(RECOUNT_TABS, recount)
    return () => {
      window.removeEventListener(RECOUNT_TABS, recount)
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

  // Emplacement réservé dans la barre du haut (TopBar), présent quand un site est affiché.
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useEffect(() => setSlot(merged ? document.getElementById(TOPBAR_SITE_SLOT) : null), [merged])

  const bar = (
    <div className="xtab-bar">
      {/* Où l'on est d'abord (icône et nom), puis la navigation, comme un navigateur (issue #2). */}
      {/* L'adresse ne se modifie pas ici : au survol du nom, pas affichée (sauf éphémère). */}
      <span className="xtab-title" title={address}>
        <span className="xtab-icon" aria-hidden="true">
          {icon ?? (tab.icon || (local ? '📄' : '🌐'))}
        </span>
        <span className="xtab-label">{tab.label}</span>
      </span>
      {session ? (
        <span className="xtab-session" style={{ ['--session' as string]: session.color }}>
          {session.name}
        </span>
      ) : null}
      {desktop ? (
        <>
          <button
            className="xtab-btn xtab-icon-btn"
            onClick={() => view.current?.canGoBack() && view.current.goBack()}
            title="Page précédente"
            aria-label="Page précédente"
          >
            ←
          </button>
          <button
            className="xtab-btn xtab-icon-btn"
            onClick={() => view.current?.canGoForward() && view.current.goForward()}
            title="Page suivante"
            aria-label="Page suivante"
          >
            →
          </button>
        </>
      ) : null}
      <button className="xtab-btn xtab-icon-btn" onClick={reload} title="Recharger" aria-label="Recharger">
        ↻
      </button>
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
      ) : null}
      {desktop ? null : blocked ? (
        <span className="xtab-warn">
          Ce site refuse l'affichage dans une page : il s'affiche dans l'appli de bureau homedash, ou ↗ à part.
        </span>
      ) : (
        <span className="xtab-hint">Page blanche ? Le site refuse l'affichage intégré : ↗ pour l'ouvrir à part.</span>
      )}
      <span className="set-spacer" />
      {desktop ? (
        <button
          className="xtab-btn xtab-icon-btn"
          onClick={openOutside}
          title={`Ouvrir dans le navigateur : ${address}`}
          aria-label="Ouvrir dans le navigateur"
        >
          ↗
        </button>
      ) : (
        <a
          className="xtab-btn xtab-icon-btn"
          href={src}
          target="_blank"
          rel="noreferrer"
          data-outside
          title={`Ouvrir dans un onglet du navigateur : ${address}`}
          aria-label="Ouvrir dans un onglet du navigateur"
        >
          ↗
        </a>
      )}
      <button className="xtab-btn xtab-icon-btn" onClick={onSettings} title="Modifier cet onglet" aria-label="Modifier cet onglet">
        ⚙
      </button>
    </div>
  )

  return (
    // Dans l'appli, une webview masquée (display: none) cesse de suivre sa page :
    // on la gare hors de l'écran, pour que les pastilles continuent d'arriver.
    <section className={`xtab${desktop && hidden ? ' is-parked' : ''}`} hidden={!desktop && hidden} aria-hidden={hidden}>
      {/* Site ouvert depuis la barre de gauche : l'en-tête monte dans la barre du
          haut (une rangée de moins) ; sinon il reste ici. */}
      {merged && slot ? createPortal(bar, slot) : bar}
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
