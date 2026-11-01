import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ConfirmHost from './components/ConfirmHost'
import ContextMenu, { type MenuItem } from './components/ContextMenu'
import EditDialog from './components/EditDialog'
import BasecampView, { showBcIssues, showBcTask } from './components/BasecampView'
import TrelloView, { showTrIssues, showTrTask } from './components/TrelloView'
import TrIssueHost, { askTrIssue } from './components/TrIssueHost'
import CustomTabView from './components/CustomTabView'
import SiteIcon, { isImageIcon, setIconProvider } from './components/SiteIcon'
import NameColorHost, { askNameColor } from './components/NameColorHost'
import { confirmDialog } from './components/ConfirmHost'
import AddTabDialog from './components/AddTabDialog'
import LoadTrouble from './components/LoadTrouble'
import UpdateProgress from './components/UpdateProgress'
import DockHint from './components/DockHint'
import Rail, { type RailMode } from './components/Rail'
import EventBell from './components/EventBell'
import EventFeed from './components/EventFeed'
import VersionMenu from './components/VersionMenu'
import Footer from './components/Footer'
import GithubView from './components/GithubView'
import LocalRepos from './components/LocalRepos'
import QuickTiles from './components/QuickTiles'
import SearchResults from './components/SearchResults'
import Section, { type SectionCtx } from './components/Section'
import SettingsPage from './components/SettingsPage'
import Tabs, { type Tab, type TabId } from './components/Tabs'
import TopBar from './components/TopBar'
import { useConfigState, type SaveState } from './hooks/useConfigState'
import { useContextMenus } from './hooks/useContextMenus'
import { useCopy } from './hooks/useCopy'
import { usePrefs } from './hooks/usePrefs'
import { keepFolderPlaces } from './lib/railOrder'
import { SEARCH_SCOPES, useSearch } from './hooks/useSearch'
import { useTabs } from './hooks/useTabs'
import { useUsage } from './hooks/useUsage'
import { useEvents, type HdEvent } from './lib/events'
import { lateCount, useBasecamp, type BcFound, type BcTask } from './lib/basecamp'
import { bcKey, issuesByTask, whereOf, type IssueTask } from './lib/bcIssues'
import { lateCount as trLateCount, useTrello, type TrCard } from './lib/trello'
import { issuesByCard, trKey, whereOf as trWhere, type IssueCard } from './lib/trIssues'
import IssueHost, { askIssue } from './components/IssueHost'
import {
  capturesLink,
  folderOf,
  hostOf,
  isLocal,
  linkTarget,
  samePage,
  preloads,
  moveTab,
  newFolderId,
  newSessionId,
  newTabId,
  sessionOf,
  srcOf,
  tabKey,
} from './lib/customTabs'
import { perfEvent, setPerfLog } from './lib/perf'
import { desktop, hasSessions, navKey, OPEN_IN_TAB, partitionOf, REFRESH_DATA, RELOAD_TAB, reloadSwap, SLEEP_TAB, UNLOAD_TAB, type GuestMenu, type OpenInTab, type WebviewEl } from './lib/desktop'
import { useGithub } from './lib/ghboard'
import { useHealth } from './lib/health'
import { useLocal } from './lib/local'
import { loadNotes, type Note } from './lib/notes'
import { useChangelog } from './lib/changelog'
import { setUnread } from './lib/notifications'
import { NEW_TAB_EVENT, presetEditTab, presetNewTab, presetSettingsSection, showSettingsSection } from './lib/settingsNav'
import { featureOn, type CustomTab, type FlatLink, type UiConfig } from './types'
import type { Command } from './components/SearchResults'
import { clearVisits, recordVisit } from './lib/visits'
import { keys } from './lib/keys'
import { RECOUNT_TABS } from './lib/tabCount'
import SetupCard, { type SetupStep } from './components/SetupCard'
import { updateGroup } from './lib/mutate'

const RAIL_KEY = 'homedash:rail'
/** Onglet temporaire fermé tout seul après ce temps sans y aller. */
const TEMP_IDLE_MS = 3 * 3600_000
const RAIL_WIDTH: Record<RailMode, string> = { wide: '200px', icons: '68px', mini: '50px', hidden: '0px' }
/** Dernières pastilles des onglets perso, par `tabKey`. */
const TAB_COUNTS_KEY = 'homedash:tab-counts'
/** Écart entre deux sites chargés au démarrage. */
const WARM_STEP_MS = 1500
const WARM_GIVE_UP_MS = 20_000

/** Éphémère, simple ou gardé : rangé en bas, son adresse suit la navigation. */
const isTemp = (t: CustomTab) => !!t.kept || t.id.startsWith('tmp-')

/** Le dash (⚡ et ses onglets natifs), comme espace d'origine d'un onglet ouvert par un lien. */
const DASH = 'links'
/** Barre d'onglets du haut (mesurée : voir `--strip-h`). */
const STRIP_ID = 'app-tabs'

/** `https://x.com/elonmusk/status/1…` → `x.com/elonmusk/status/1…` (titre du clic droit). */
function shortLink(url: string): string {
  try {
    const u = new URL(url)
    const path = (u.pathname + u.search).replace(/\/$/, '')
    const full = u.hostname.replace(/^www\./, '') + path
    return full.length > 46 ? full.slice(0, 45) + '…' : full
  } catch {
    return url
  }
}

export default function App() {
  const { raw, cfg, error, saveState, setSaveState, persist, reload, retry: retryLoad } = useConfigState()
  // Fonctionnalités coupées dans Réglages : ni onglet, ni commande, ni résultat de recherche.
  const on = {
    github: featureOn(raw, 'github'),
    basecamp: featureOn(raw, 'basecamp'),
    local: featureOn(raw, 'local'),
    trello: featureOn(raw, 'trello'),
  }
  const [notes, setNotes] = useState<Note[]>([])
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Cadence GitHub : vive sur GitHub et Raccourcis (carte Repos), lente ailleurs.
  const [ghFront, setGhFront] = useState(true)
  const gh = useGithub(ghFront)
  const customTabs = useMemo(() => raw?.tabs ?? [], [raw])
  // Onglets éphémères (lien ouvert au clic droit) : dans la barre jusqu'à leur
  // fermeture ou au rechargement ; jamais dans la config, sauf « Garder ».
  const [temps, setTemps] = useState<CustomTab[]>([])
  // Onglets perso « officiels », et éphémères gardés (dans la config, rangés avec les éphémères).
  const regularTabs = useMemo(() => customTabs.filter((t) => !t.kept), [customTabs])
  const keptTabs = useMemo(() => customTabs.filter((t) => t.kept), [customTabs])
  const allTemps = useMemo(() => [...keptTabs, ...temps], [keptTabs, temps])
  const allTabs = useMemo(() => [...regularTabs, ...allTemps], [regularTabs, allTemps])
  // Onglets ouverts par un lien, rangés dans l'espace d'où il vient : le dash ou un
  // onglet perso, en onglets en haut de celui-ci. Espace disparu = éphémère seul.
  const parentOf = useCallback(
    (t: CustomTab): string | null =>
      t.parent === DASH || (t.parent && regularTabs.some((r) => tabKey(r) === t.parent)) ? (t.parent ?? null) : null,
    [regularTabs],
  )
  /** Espace d'un onglet : le dash, un onglet perso (lui ou un de ses onglets), ou aucun (éphémère seul, Réglages). */
  const spaceOf = (key: string): string | null => {
    if (!key.startsWith('x:')) return key === 'settings' ? null : DASH
    const t = allTabs.find((x) => tabKey(x) === key)
    if (!t) return null
    return isTemp(t) ? parentOf(t) : key
  }
  const childrenOf = (space: string) => allTemps.filter((t) => parentOf(t) === space)
  // Titre de la page de chaque onglet d'espace : son nom dans la barre (en mémoire seulement).
  const [childTitles, setChildTitles] = useState<Record<string, string>>({})
  // Adresse où est chaque onglet éphémère (gardé ou non), suivie pendant la navigation.
  const tempUrl = useRef(new Map<string, string>())
  // Page affichée dans chaque onglet (perso ou éphémère) : « Copier le lien » (issue #33).
  const pageUrl = useRef(new Map<string, string>())
  // Message bref en bas de l'écran (un lien a changé la page d'un site…).
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<number | null>(null)
  const flashNotice = (text: string) => {
    setNotice(text)
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 5000)
  }
  // Lien à ouvrir dans un onglet perso, pas encore pris par lui (voir openInTab).
  const pendingLinks = useRef(new Map<string, string>())
  const takeLink = useCallback((key: string) => {
    const url = pendingLinks.current.get(key)
    pendingLinks.current.delete(key)
    return url
  }, [])

  // ── son ─────────────────────────────────────────────────────────────────
  // Onglets qui émettent du son (main.js le signale), et ceux qu'on a coupés.
  const [audible, setAudible] = useState<Record<string, boolean>>({})
  const [muted, setMuted] = useState<Record<string, boolean>>({})
  useEffect(
    () =>
      desktop?.onAudio?.(({ id, audible: on }) => {
        const tid = guestTab.current.get(id)
        if (!tid) return
        const key = `x:${tid}`
        setAudible((a) => (!!a[key] === on ? a : { ...a, [key]: on }))
      }),
    [],
  )

  // ── mise en veille ──────────────────────────────────────────────────────
  // Onglets déchargés (webview démontée, mémoire rendue) ; rechargés au clic.
  const [asleep, setAsleep] = useState<string[]>([])
  const asleepRef = useRef(asleep)
  asleepRef.current = asleep
  const lastSeen = useRef(new Map<string, number>())
  const startedAt = useRef(Date.now())
  // Webview → onglet : de quel onglet vient un lien ou un clic droit (appli de bureau).
  const guestTab = useRef(new Map<number, string>())
  // main.js appelle ces deux fonctions (executeJavaScript) : liens et clic droit dans les sites.
  const routeRef = useRef<(url: string, fromId: number, flip?: boolean) => boolean>(() => false)
  const menuRef = useRef<(m: GuestMenu) => boolean>(() => false)
  useEffect(() => {
    if (!desktop) return
    const w = window as unknown as Record<string, unknown>
    w.__homedashRoute = (url: string, fromId: number, flip?: boolean) => routeRef.current(url, fromId, flip)
    w.__homedashMenu = (m: GuestMenu) => menuRef.current(m)
    // Journal de performance (main.js) : nom et compte de l'onglet de chaque webview.
    w.__homedashTabs = () => {
      const out: Record<number, { id: string; label: string; account: string | null }> = {}
      for (const [id, tid] of guestTab.current) {
        const t = allTabsRef.current.find((x) => x.id === tid)
        if (t) out[id] = { id: t.id, label: t.label, account: sessionsRef.current.find((s) => s.id === t.session)?.name ?? null }
      }
      return out
    }
    return () => {
      delete w.__homedashRoute
      delete w.__homedashMenu
      delete w.__homedashTabs
    }
  }, [])
  const tabFolders = useMemo(() => raw?.tabFolders ?? [], [raw])
  const tabSessions = useMemo(() => raw?.tabSessions ?? [], [raw])
  const sessionsRef = useRef(tabSessions)
  sessionsRef.current = tabSessions
  const { tab, selectTab, goBack, stepTab } = useTabs(cfg?.title, allTabs)
  // Onglets temporaires pas regardés depuis 3 h : fermés tout seuls (issue #60).
  // Chacun garde un site chargé (100 à 400 Mo) ; avant, ils s'accumulaient jusqu'au
  // redémarrage. Les gardés (ancien réglage) ne bougent pas.
  const tempSeen = useRef(new Map<string, number>())
  useEffect(() => {
    tempSeen.current.set(tab, Date.now())
  }, [tab])
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now()
      setTemps((ts) => {
        const keep = ts.filter((t) => {
          const key = `x:${t.id}`
          if (!tempSeen.current.has(key)) tempSeen.current.set(key, now)
          return key === tabNowRef.current || now - (tempSeen.current.get(key) ?? now) < TEMP_IDLE_MS
        })
        return keep.length === ts.length ? ts : keep
      })
    }, 10 * 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const tabNowRef = useRef(tab)
  tabNowRef.current = tab
  // Onglet d'une fonctionnalité coupée (mémorisé, ou `?tab=`) : retour à l'accueil.
  useEffect(() => {
    if ((tab === 'github' || tab === 'basecamp' || tab === 'local' || tab === 'trello') && raw && !featureOn(raw, tab)) selectTab('links')
  }, [tab, raw, selectTab])
  // ⇧⌘R (appli de bureau) : le site ouvert, ou homedash sur un onglet natif.
  useEffect(() => setGhFront(tab === 'github' || tab === 'links'), [tab])
  const tabRef = useRef(tab)
  tabRef.current = tab
  // Précédent / suivant (boutons de la souris, ⌘[ ⌘], balayage) : dans le site
  // ouvert s'il a de l'historique, sinon d'onglet en onglet. `tabsOnly` : main.js
  // a déjà essayé dans le site.
  const navRef = useRef<(dir: 'back' | 'forward', tabsOnly?: boolean) => boolean>(() => false)
  navRef.current = (dir, tabsOnly) => {
    if (!tabsOnly && desktop && tabRef.current.startsWith('x:')) {
      try {
        const v = document.querySelector('.xtab:not(.is-parked) webview') as WebviewEl | null
        if (v && (dir === 'back' ? v.canGoBack() : v.canGoForward())) {
          if (dir === 'back') v.goBack()
          else v.goForward()
          return true
        }
      } catch {
        /* webview pas encore attachée */
      }
    }
    return stepTab(dir)
  }
  // Liens de homedash dans l'appli (Réglages → `ui.openLinks`) : l'onglet perso du
  // site, sinon un éphémère. Renvoie `false` → le navigateur. `flip` (⌘clic) :
  // l'inverse du réglage (issue #32). `searched` : venu de la recherche, pas du
  // site affiché (voir plus bas). Défini plus bas.
  const inAppRef = useRef<(url: string, flip?: boolean, searched?: boolean) => boolean>(() => false)
  const openLink = useCallback((url: string) => {
    if (!inAppRef.current(url)) window.open(url, '_blank', 'noopener')
  }, [])
  const openSearched = useCallback((url: string) => {
    if (!inAppRef.current(url, false, true)) window.open(url, '_blank', 'noopener')
  }, [])
  useEffect(() => {
    if (!desktop) return
    // Après React (phase de bulle) : un lien dont le clic a déjà été pris en charge est laissé.
    // `data-outside` : lien fait pour le navigateur (onglet « ouvrir à part », connexion…).
    // ⌘clic / Ctrl+clic (ou ⇧clic) : l'inverse du réglage ; laissé passer = le navigateur.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target !== '_blank' || a.hasAttribute('data-outside') || !/^https?:/i.test(a.href)) return
      const searched = !!a.closest('.search-layout')
      if (inAppRef.current(a.href, e.metaKey || e.ctrlKey || e.shiftKey, searched)) e.preventDefault()
    }
    window.addEventListener('click', onClick)
    return () => window.removeEventListener('click', onClick)
  }, [])
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    w.__homedashNav = (dir: 'back' | 'forward', tabsOnly?: boolean) => navRef.current(dir, tabsOnly)
    const onUp = (e: MouseEvent) => {
      if (e.button !== 3 && e.button !== 4) return
      e.preventDefault()
      navRef.current(e.button === 3 ? 'back' : 'forward')
    }
    // Raccourcis clavier : dans l'appli seulement (le navigateur a les siens).
    const onKey = (e: KeyboardEvent) => {
      if (!desktop) return
      const dir = navKey(e)
      if (!dir) return
      e.preventDefault()
      navRef.current(dir)
    }
    window.addEventListener('mouseup', onUp, true)
    window.addEventListener('keydown', onKey)
    return () => {
      delete w.__homedashNav
      window.removeEventListener('mouseup', onUp, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [])
  useEffect(
    () =>
      desktop?.onReloadTab?.(() => {
        const t = tabRef.current
        if (t.startsWith('x:')) window.dispatchEvent(new CustomEvent(RELOAD_TAB, { detail: t }))
        // Onglet natif : ses données seulement, sans remonter les sites (issue #63).
        // Une appli d'avant la 2.0 n'envoie ceci que sur ⇧⌘R : là, on recharge tout comme avant.
        else if (reloadSwap) window.dispatchEvent(new CustomEvent(REFRESH_DATA))
        else window.location.reload()
      }),
    [],
  )
  // Retour visible d'un ⌘R : la page revient en un éclair, on ne le verrait pas.
  const [reloaded, setReloaded] = useState(false)
  useEffect(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    if (nav?.type !== 'reload') return
    setReloaded(true)
    // après le chargement de la config, qui dit si le journal est actif
    const p = window.setTimeout(() => perfEvent('reload'), 3000)
    const t = window.setTimeout(() => setReloaded(false), 1800)
    return () => {
      window.clearTimeout(t)
      window.clearTimeout(p)
    }
  }, [])
  // Clic ou Échap dans un site (appli de bureau) : la page ne les voit pas, on
  // les rejoue pour que menus et panneaux ouverts se ferment comme ailleurs.
  useEffect(
    () =>
      desktop?.onGuestDown?.((kind) => {
        if (kind === 'escape') {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          return
        }
        document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      }),
    [],
  )
  // Dernier onglet natif : ⚡ de la barre de gauche y ramène.
  const lastNative = useRef<TabId>('links')
  // (Réglages n'en est pas un : il a son ⚙ dans la barre, et ⚡ doit en faire sortir.)
  if (!tab.startsWith('x:') && tab !== 'events' && tab !== 'settings') lastNative.current = tab
  // Dernière vue du dash, ses onglets ouverts par un lien compris : ⚡ y ramène.
  const lastDash = useRef<TabId>('links')
  if (spaceOf(tab) === DASH && tab !== 'events') lastDash.current = tab
  const [railMode, setRailMode] = useState<RailMode>(() => {
    try {
      const v = localStorage.getItem(RAIL_KEY)
      return v === 'wide' || v === 'icons' || v === 'mini' || v === 'hidden' ? v : 'icons'
    } catch {
      return 'icons'
    }
  })
  const changeRail = useCallback((m: RailMode) => {
    setRailMode(m)
    try {
      localStorage.setItem(RAIL_KEY, m)
    } catch {
      /* stockage indisponible */
    }
  }, [])
  // Toujours là (sauf cachée exprès), même sans site : ⚡, ＋ et ⚙ disent par où
  // commencer (issue #45). Vide, elle invitait à rien et se cachait.
  const railOn = railMode !== 'hidden'
  useEffect(() => {
    const w = !railOn ? '0px' : RAIL_WIDTH[railMode]
    document.documentElement.style.setProperty('--rail-w', w)
  }, [railOn, railMode])
  // Onglets perso affichés dans la page : montés à la première visite puis
  // seulement masqués, pour ne pas recharger le site à chaque aller-retour.
  const [visited, setVisited] = useState<string[]>([])
  // Sites à non-lus : chargés un par un au démarrage. Tous d'un coup, ils se
  // disputent le processeur et le réseau (X : 13 s au lieu de 2).
  const [warmed, setWarmed] = useState(0)
  const warmable = desktop ? allTabs.filter((t) => t.embed && preloads(t)).map(tabKey) : []
  const warmingDone = warmed >= warmable.length
  useEffect(() => {
    if (warmingDone) return
    const id = window.setTimeout(() => setWarmed((n) => n + 1), warmed ? WARM_STEP_MS : 0)
    return () => window.clearTimeout(id)
  }, [warmed, warmingDone])
  // Anneau sur les icônes : en attente ou en cours de chargement. Un site qui
  // n'aboutit jamais ne le garde pas : tout s'arrête 20 s après le dernier lancé.
  const [warmLoaded, setWarmLoaded] = useState<string[]>([])
  const [warmOver, setWarmOver] = useState(false)
  useEffect(() => {
    if (!warmingDone || !warmed) return
    const id = window.setTimeout(() => setWarmOver(true), WARM_GIVE_UP_MS)
    return () => window.clearTimeout(id)
  }, [warmingDone, warmed])
  const warming = warmOver ? [] : warmable.filter((k) => !warmLoaded.includes(k) && !asleep.includes(k))
  // Fenêtre « Nouvel onglet » (＋ de la barre de gauche).
  const [adding, setAdding] = useState(false)
  // « Tout actualiser » en cours (⟳ de la barre du haut).
  const [syncing, setSyncing] = useState(false)
  // Non-lus de chaque onglet perso (appli de bureau seulement). Gardés dans le
  // localStorage : la pastille survit au redémarrage et à la veille, jusqu'à ce
  // que le site, rechargé, en donne une nouvelle.
  const [tabCounts, setTabCounts] = useState<Record<string, number>>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(TAB_COUNTS_KEY) ?? '{}')
      return v && typeof v === 'object' ? v : {}
    } catch {
      return {}
    }
  })
  // Onglet supprimé, éphémère fermé : sa pastille gardée s'en va (config chargée
  // seulement, sinon tout partirait au démarrage).
  useEffect(() => {
    if (!cfg) return
    const keys = new Set<string>(allTabs.map(tabKey))
    setTabCounts((c) => (Object.keys(c).every((k) => keys.has(k)) ? c : Object.fromEntries(Object.entries(c).filter(([k]) => keys.has(k)))))
  }, [cfg, allTabs])
  useEffect(() => {
    try {
      localStorage.setItem(TAB_COUNTS_KEY, JSON.stringify(tabCounts))
    } catch {
      /* stockage indisponible : pastilles en mémoire seulement */
    }
  }, [tabCounts])
  const setCount = useCallback(
    (key: string, n: number) => setTabCounts((c) => (c[key] === n ? c : { ...c, [key]: n })),
    [],
  )
  useEffect(() => {
    if (tab.startsWith('x:')) setVisited((v) => (v.includes(tab) ? v : [...v, tab]))
  }, [tab])
  const openLocal = useCallback(() => selectTab('local'), [selectTab])
  // Sonde en continu, onglet ouvert ou non : c'est ce qui alimente la pastille de
  // l'onglet et le rappel dans la barre GitHub. Le rappel de ménage lui-même est
  // devenu un événement du journal, écrit par le serveur.
  const local = useLocal(tab === 'local')
  const bc = useBasecamp(tab === 'basecamp')
  const tr = useTrello(tab === 'trello')
  const changelog = useChangelog()
  // « rapport prêt » : la vue Issues de l'onglet Basecamp, d'où on le publie
  const openBcIssues = useCallback(() => {
    showBcIssues()
    selectTab('basecamp')
  }, [selectTab])
  const openTrIssues = useCallback(() => {
    showTrIssues()
    selectTab('trello')
  }, [selectTab])
  const openTrTask = useCallback(
    (url: string) => {
      if (url) showTrTask(url)
      selectTab('trello')
    },
    [selectTab],
  )
  const inApp = useCallback(
    (e: HdEvent) =>
      e.source === 'local'
        ? openLocal
        : e.kind === 'bc-report'
          ? openBcIssues
          : e.kind === 'tr-report'
            ? openTrIssues
            : e.kind === 'tr-task'
              ? () => openTrTask(e.url)
              : undefined,
    [openLocal, openBcIssues, openTrIssues, openTrTask],
  )
  // Fonctionnalité coupée : ses événements quittent la cloche, l'historique et les notifications.
  const eventsOff = useMemo(() => {
    const off: ('github' | 'basecamp' | 'local' | 'trello')[] = []
    if (!featureOn(raw, 'github')) off.push('github')
    if (!featureOn(raw, 'basecamp')) off.push('basecamp')
    if (!featureOn(raw, 'local')) off.push('local')
    if (!featureOn(raw, 'trello')) off.push('trello')
    return off
  }, [raw])
  const events = useEvents(inApp, eventsOff)
  // ⌘R sur un onglet natif (appli 2.0) : relire GitHub, le disque et Basecamp,
  // sans recharger la page ni remonter les sites (issue #63).
  const ghRefresh = gh.refresh
  const localRefresh = local.refresh
  const bcRefresh = bc.refresh
  useEffect(() => {
    const again = () => {
      ghRefresh()
      localRefresh()
      bcRefresh()
    }
    window.addEventListener(REFRESH_DATA, again)
    return () => window.removeEventListener(REFRESH_DATA, again)
  }, [ghRefresh, localRefresh, bcRefresh])
  const { collapsed, toggleGroup, effectiveTheme, switchTheme } = usePrefs(cfg?.ui.theme)
  const { copiedKey, copy } = useCopy()

  // notes côté serveur (data/notes.json), communes à tous les navigateurs
  useEffect(() => {
    void loadNotes().then(setNotes)
  }, [])

  // Non-lus du journal dans le titre et l'icône de l'onglet du navigateur : même
  // compteur que la cloche, effacé quand on ouvre son panneau ou l'historique.
  const markEvents = events.markSeen
  useEffect(() => setUnread(events.unseen), [events.unseen])
  useEffect(() => setPerfLog(cfg?.ui.perfLog === true), [cfg?.ui.perfLog])
  useEffect(() => setIconProvider(cfg?.ui.faviconProvider), [cfg?.ui.faviconProvider])
  // Menu de l'appli (Réglages…, Aide → Nouveautés / Guide) : la bonne page de Réglages.
  useEffect(
    () =>
      desktop?.onMenu?.((target) => {
        search.setQuery('')
        if (target !== 'settings') showSettingsSection(target)
        selectTab('settings')
      }),
    [selectTab],
  )
  // Mise en veille : l'onglet quitté et l'onglet ouvert sont « vus maintenant » ;
  // ouvrir un onglet en veille le réveille (sa webview est remontée, il recharge).
  const prevTab = useRef(tab)
  useEffect(() => {
    const now = Date.now()
    lastSeen.current.set(prevTab.current, now)
    lastSeen.current.set(tab, now)
    prevTab.current = tab
    const t = allTabsRef.current.find((x) => tabKey(x) === tab)
    if (t) perfEvent('open', { tab: t.label, host: hostOf(t.url), temp: isTemp(t) })
    setAsleep((a) => {
      if (!a.includes(tab)) return a
      if (t) perfEvent('wake', { tab: t.label, host: hostOf(t.url) })
      return a.filter((k) => k !== tab)
    })
  }, [tab])
  // Toutes les 30 s : les onglets « en veille si inutilisé » restés de côté
  // plus de `tabSleepMinutes` sont déchargés. Leur pastille reste, figée jusqu'au réveil.
  const allTabsRef = useRef(allTabs)
  allTabsRef.current = allTabs
  const sleepMinutes = cfg?.ui.tabSleepMinutes ?? 5
  // Réglages → Mes sites : libérer un site maintenant (fermé proprement, comme la veille).
  useEffect(() => {
    const on = (e: Event) => {
      const key = (e as CustomEvent<string>).detail
      window.dispatchEvent(new CustomEvent<string[]>(UNLOAD_TAB, { detail: [key] }))
      window.setTimeout(() => {
        perfEvent('sleep', { tabs: allTabsRef.current.filter((t) => tabKey(t) === key).map((t) => t.label) })
        setAsleep((a) => (a.includes(key) || key === tabRef.current ? a : [...a, key]))
      }, 1500)
    }
    window.addEventListener(SLEEP_TAB, on)
    return () => window.removeEventListener(SLEEP_TAB, on)
  }, [])
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now()
      const due = allTabsRef.current
        .filter((t) => t.sleep && t.embed && tabKey(t) !== tabRef.current)
        .map((t) => tabKey(t))
        .filter((k) => now - (lastSeen.current.get(k) ?? startedAt.current) > sleepMinutes * 60_000)
      const fresh = due.filter((k) => !asleepRef.current.includes(k))
      if (!fresh.length) return
      // Fermés proprement d'abord (Discord n'enregistre sa connexion qu'à la
      // fermeture de sa page), puis déchargés.
      window.dispatchEvent(new CustomEvent<string[]>(UNLOAD_TAB, { detail: fresh }))
      window.setTimeout(
        () =>
          setAsleep((a) => {
            const add = fresh.filter((k) => !a.includes(k) && k !== tabRef.current)
            if (add.length)
              perfEvent('sleep', {
                tabs: allTabsRef.current.filter((t) => add.includes(tabKey(t))).map((t) => t.label),
              })
            return add.length ? [...a, ...add] : a
          }),
        1500,
      )
    }, 30_000)
    return () => window.clearInterval(id)
  }, [sleepMinutes])

  // Icône du Dock (appli de bureau) : non-lus des onglets perso + ceux de la cloche.
  // (sauf les onglets aux notifications coupées)
  const tabUnread = allTabs.reduce(
    (sum, t) => sum + (t.embed && t.notify !== false ? (tabCounts[tabKey(t)] ?? 0) : 0),
    0,
  )
  // Ce qu'elle compte se règle dans Réglages → Notifications (issue #4).
  const dockCount = (cfg?.ui.badgeTabs !== false ? tabUnread : 0) + (cfg?.ui.badgeBell !== false ? events.unseen : 0)
  useEffect(() => desktop?.setBadge(dockCount), [dockCount])
  useEffect(() => {
    if (tab === 'events') markEvents()
  }, [tab, markEvents, events.unseen])

  // --- index à plat ---------------------------------------------------------
  const links: FlatLink[] = useMemo(() => {
    if (!cfg) return []
    return cfg.groups.flatMap((g) =>
      g.links.map((l, index) => ({
        ...l,
        id: `${g.name}/${l.name}`,
        index,
        group: g.name,
        icon: g.icon,
        color: g.color ?? cfg.ui.defaultColor,
      })),
    )
  }, [cfg])

  const { health, refresh } = useHealth(
    links,
    cfg?.ui.healthcheckInterval ?? 0,
    cfg?.ui.healthcheckTimeout ?? 4000,
  )
  const { usage, counts, pinnedTiles, usedTiles, track, resetUsage } = useUsage(
    links,
    !!cfg?.ui.showTiles,
    cfg?.ui.maxTiles ?? 0,
    raw?.pinnedOrder,
  )
  // Clic droit sur un lien : comment l'ouvrir (défini plus bas, avec les onglets).
  const openItemsRef = useRef<(url: string) => MenuItem[]>(() => [])
  const openItems = useCallback((url: string) => openItemsRef.current(url), [])
  const menus = useContextMenus(raw, persist, copy, openItems)
  const newGroup = menus.newGroup
  const linkMenuRef = useRef<(x: number, y: number, url: string) => void>(() => undefined)
  useEffect(() => {
    if (!desktop) return
    // Clic droit sur tout autre lien de la page (GitHub, Basecamp…) : le même
    // choix. Après React : un lien qui a son propre menu (raccourcis) est laissé.
    const onMenu = (e: MouseEvent) => {
      if (e.defaultPrevented) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.hasAttribute('data-outside') || !/^https?:/i.test(a.href)) return
      e.preventDefault()
      linkMenuRef.current(e.clientX, e.clientY, a.href)
    }
    window.addEventListener('contextmenu', onMenu)
    return () => window.removeEventListener('contextmenu', onMenu)
  }, [])
  // Recherche façon barre d'adresse : les onglets (icônes calculées plus bas) et
  // les actions de homedash. `openTempRef` : défini plus bas, avec les éphémères.
  const iconRef = useRef<Record<string, React.ReactNode>>({})
  const openTempRef = useRef<(url: string) => void>(() => undefined)
  const siteActionsRef = useRef<Record<'mute' | 'notify' | 'clear', (t: CustomTab) => void>>({
    mute: () => undefined,
    notify: () => undefined,
    clear: () => undefined,
  })
  const refreshAllRef = useRef<() => void>(() => undefined)
  const searchTabs = useMemo(
    () => allTabs.map((t) => ({ tab: t, icon: () => iconRef.current[t.id] ?? '🌐' })),
    [allTabs],
  )
  const commands = useMemo<Command[]>(
    () => [
      { id: 'links', icon: '⚡', label: 'Raccourcis', keywords: 'accueil liens dashboard', run: () => selectTab('links') },
      ...(on.github
        ? [{ id: 'github', icon: '🐙', label: 'GitHub', keywords: 'prs branches', run: () => selectTab('github') }]
        : []),
      ...(on.local
        ? [{ id: 'local', icon: '💻', label: 'Local', keywords: 'dépôts disque branches', run: () => selectTab('local') }]
        : []),
      ...(bc.data?.configured
        ? [{ id: 'basecamp', icon: '🏕', label: 'Basecamp', keywords: 'tâches', run: () => selectTab('basecamp') }]
        : []),
      ...(on.trello && tr.data?.configured
        ? [{ id: 'trello', icon: '📋', label: 'Trello', keywords: 'cartes tableaux', run: () => selectTab('trello') }]
        : []),
      { id: 'refresh', icon: '⟳', label: 'Tout actualiser', keywords: 'recharger rafraîchir données', run: () => refreshAllRef.current() },
      {
        id: 'settings-sites',
        icon: '🗂',
        label: 'Réglages de Mes sites',
        keywords: 'onglets mémoire veille',
        run: () => {
          showSettingsSection('set-tabs')
          selectTab('settings')
        },
      },
      { id: 'events', icon: '🔔', label: 'Activité', keywords: 'journal cloche notifications', run: () => selectTab('events') },
      { id: 'settings', icon: '⚙', label: 'Réglages', keywords: 'options préférences config', run: () => selectTab('settings') },
      ...(desktop
        ? [
            {
              id: 'temp',
              icon: '⧉',
              label: 'Nouvel onglet temporaire',
              keywords: 'nouvel onglet',
              run: () => openTempRef.current('https://www.google.com/'),
            },
          ]
        : []),
      // Le ＋ de la barre du haut est parti (issue #6) : ici, et au clic droit d'une catégorie.
      { id: 'group', icon: '📁', label: 'Nouvelle catégorie', keywords: 'ajouter groupe liens raccourcis', run: newGroup },
      {
        id: 'theme',
        icon: effectiveTheme === 'dark' ? '☀️' : '🌙',
        label: effectiveTheme === 'dark' ? 'Thème clair' : 'Thème sombre',
        keywords: 'apparence couleurs mode',
        run: switchTheme,
      },
      {
        id: 'visits',
        icon: '🧹',
        label: 'Effacer l’historique des pages',
        keywords: 'historique vider oublier',
        hint: 'pages vues dans les onglets, mémorisées dans ce navigateur',
        run: clearVisits,
      },
    ],
    [selectTab, switchTheme, effectiveTheme, bc.data?.configured, tr.data?.configured, newGroup, on.github, on.local, on.trello],
  )
  // Basecamp dans la recherche : mes tâches (déjà là) ; tout Basecamp, useSearch le cherche
  const bcTasks = useMemo(
    () => (bc.data?.enabled ? [...(bc.data.tasks?.priorities ?? []), ...(bc.data.tasks?.others ?? [])] : []),
    [bc.data],
  )
  // Portées de la recherche : celles des fonctionnalités coupées (ou Basecamp non connecté) n'y sont pas.
  const trCards = useMemo(() => (tr.data?.enabled ? tr.data.cards ?? [] : []), [tr.data])
  const searchScopes = SEARCH_SCOPES.filter((x) =>
    x.id === 'code'
      ? on.github || on.local
      : x.id === 'basecamp'
        ? on.basecamp && !!bc.data?.enabled
        : x.id === 'trello'
          ? on.trello && !!tr.data?.enabled
          : true,
  )
  // Actions sur chaque site, dans la recherche. Les fonctions sont définies plus bas (comme `openTempRef`).
  const siteCommands: Command[] = allTabs
    .filter((t) => t.embed && !isLocal(t.url))
    .flatMap((t) => {
      const key = tabKey(t)
      const name = t.label
      const mounted = !asleep.includes(key) && (visited.includes(key) || warmable.slice(0, warmed).includes(key))
      return [
        ...(mounted
          ? [{
              id: `reload:${t.id}`,
              icon: '↻',
              label: `Recharger ${name}`,
              keywords: 'actualiser rafraîchir',
              run: () => window.dispatchEvent(new CustomEvent(RELOAD_TAB, { detail: key })),
            }]
          : []),
        ...(mounted && key !== tab
          ? [{
              id: `free:${t.id}`,
              icon: '💤',
              label: `Libérer ${name}`,
              keywords: 'décharger veille mémoire',
              hint: 'décharge le site jusqu’au prochain clic',
              run: () => window.dispatchEvent(new CustomEvent(SLEEP_TAB, { detail: key })),
            }]
          : []),
        ...(desktop
          ? [
              {
                id: `mute:${t.id}`,
                icon: muted[key] ? '🔊' : '🔇',
                label: `${muted[key] ? 'Rétablir' : 'Couper'} le son de ${name}`,
                keywords: 'audio silence',
                run: () => siteActionsRef.current.mute(t),
              },
              {
                id: `notify:${t.id}`,
                icon: t.notify === false ? '🔔' : '🔕',
                label: `${t.notify === false ? 'Rétablir' : 'Couper'} les notifications de ${name}`,
                keywords: 'pastille notifs',
                run: () => siteActionsRef.current.notify(t),
              },
              {
                id: `clear:${t.id}`,
                icon: '🧹',
                label: `Effacer les données de ${name}`,
                keywords: 'cookies cache déconnecter',
                hint: 'demande confirmation',
                run: () => siteActionsRef.current.clear(t),
              },
            ]
          : []),
      ]
    })
  const search = useSearch({
    cfg,
    links,
    notes,
    gh: gh.data?.enabled ? gh.data : null,
    local: on.local ? local.data : null,
    bcTasks,
    bcSearch: !!bc.data?.enabled && !!bc.data.loaded,
    trCards,
    trSearch: !!tr.data?.enabled && !!tr.data.loaded,
    searchRef,
    paused: !!menus.draft,
    track,
    copy,
    openNote: setOpenNoteId,
    openLocal,
    open: openSearched,
    tabs: searchTabs,
    onTab: (t) => {
      search.setQuery('')
      selectTab(tabKey(t))
    },
    commands: [...commands, ...siteCommands],
  })
  const currentScope = searchScopes.find((x) => x.id === search.scope) ?? SEARCH_SCOPES[0]
  // Portée devenue indisponible (fonctionnalité coupée) : on cherche partout.
  useEffect(() => {
    if (!searchScopes.some((x) => x.id === search.scope)) search.setScope('all')
  })

  // --- rendu ---------------------------------------------------------------
  // Réglages pas chargés : serveur qui redémarre (réessai seul), fichier abîmé
  // (proposer la dernière sauvegarde), ou autre — jamais de jargon (LoadTrouble).
  // Hauteur de la barre d'onglets du haut : un site affiché en dessous prend le reste.
  useLayoutEffect(() => {
    const el = document.getElementById(STRIP_ID)
    const h = el ? el.offsetHeight + parseFloat(getComputedStyle(el).marginBottom || '0') : 0
    document.documentElement.style.setProperty('--strip-h', `${h}px`)
  })

  // « Pour commencer » (accueil) : ce qui est branché, relu à chaque retour sur
  // l'accueil et après chaque enregistrement.
  const setupWanted = tab === 'links' && !!raw && raw.ui?.setupHidden !== true
  const [setupState, setSetupState] = useState<{ github: boolean; basecamp: boolean; local: boolean; trello?: boolean } | null>(null)
  useEffect(() => {
    if (!setupWanted) return
    fetch('api/health', { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ github: boolean; basecamp: boolean; local: boolean; trello?: boolean }>)
      .then(setSetupState)
      .catch(() => undefined)
  }, [setupWanted, raw])

  if (error && !cfg) return <LoadTrouble error={error} onRetry={retryLoad} />

  if (!cfg) {
    return (
      <div className="app">
        <div className="loading">chargement…</div>
      </div>
    )
  }

  const { ui } = cfg
  const ctx: SectionCtx = {
    cfg,
    gh,
    local,
    links,
    health,
    usage,
    notes,
    setNotes,
    openNoteId,
    setOpenNoteId,
    collapsed,
    toggleGroup,
    track,
    resetUsage,
    openLocal,
    linkMenu: menus.linkMenu,
    groupMenu: menus.groupMenu,
    infoMenu: menus.infoMenu,
    infoGroupMenu: menus.infoGroupMenu,
    infoPanelMenu: menus.infoPanelMenu,
  }
  const searching = search.query.trim().length > 0
  const hasChecks = links.some((l) => l.check) && ui.healthcheckInterval > 0
  /**
   * ⟳ de la barre du haut : tout ce qui peut avoir du nouveau, d'un coup. Le
   * serveur relit GitHub, Basecamp, Trello et le disque ; les sites relisent leurs
   * non-lus, et ceux en veille sont réveillés (ils se rendorment ensuite comme
   * d'habitude) ; la cloche est relue à mesure que les réponses arrivent.
   */
  const refreshAll = () => {
    if (syncing) return
    setSyncing(true)
    perfEvent('refresh-all', {})
    if (hasChecks) refresh()
    gh.refresh()
    local.refresh()
    if (bc.data?.configured) bc.refresh()
    if (tr.data?.configured) tr.refresh()
    void changelog.check()
    const now = Date.now()
    setAsleep((a) => {
      for (const k of a) lastSeen.current.set(k, now)
      return a.length ? [] : a
    })
    window.dispatchEvent(new Event(RECOUNT_TABS))
    for (const ms of [2500, 6000, 12000]) window.setTimeout(() => void events.refresh(), ms)
    // les sites réveillés ont le temps de charger avant une dernière relecture
    window.setTimeout(() => window.dispatchEvent(new Event(RECOUNT_TABS)), 8000)
    window.setTimeout(() => setSyncing(false), 6000)
  }
  const bcHidden = raw?.basecamp?.hidden ?? []
  const bcLate = lateCount(bc.data, bcHidden)
  const trHidden = raw?.trello?.hidden ?? []
  const trLate = trLateCount(tr.data, trHidden)
  // GitHub et Local : le même code, en ligne et sur le disque. Côte à côte dans
  // un seul bloc (« duo »), chacun garde son clic.
  const code = { id: 'code', title: 'Ton code : en ligne (GitHub) et sur ton disque (Local)' }
  // Image ou emoji choisi, sinon l'icône du site, recadrée pour que toutes aient la même échelle.
  const iconOf: Record<string, React.ReactNode> = Object.fromEntries(
    allTabs.map((t) => [
      t.id,
      isImageIcon(t.icon) ? (
        <SiteIcon url={t.url} name={t.label} image={t.icon} />
      ) : t.icon ? (
        t.icon
      ) : isLocal(t.url) ? (
        '📄'
      ) : (
        <SiteIcon url={t.url} name={t.label} enabled={ui.favicons} />
      ),
    ]),
  )
  iconRef.current = iconOf
  /** Onglets, dossiers et comptes de la barre de gauche : une écriture de config. */
  const saveTabs = (next: typeof customTabs, folders = tabFolders, sessions = tabSessions) =>
    raw && persist({ ...raw, tabs: next, tabFolders: folders, tabSessions: sessions })
  /** Nouveau dossier (nom + couleur demandés) contenant ces onglets, dans cet ordre. */
  const newFolder = async (ids: string[]) => {
    const r = await askNameColor({ title: 'Nouveau dossier', name: `Dossier ${tabFolders.length + 1}` })
    if (!r) return
    const id = newFolderId(tabFolders.map((f) => f.id))
    const next = ids.reduce((acc, tid) => moveTab(acc, tid, null, id), customTabs)
    saveTabs(next, [...tabFolders, { id, name: r.name, color: r.color }])
  }
  /** Nouveau compte de connexion, donné à cet onglet. */
  const newSession = async (tid: string) => {
    const r = await askNameColor({
      title: 'Nouveau compte',
      name: '',
      hint: 'Ses onglets partagent leur propre connexion, à part des autres : un compte « pro » et un « perso » pour le même site.',
    })
    if (!r) return
    const id = newSessionId(tabSessions.map((x) => x.id))
    saveTabs(
      customTabs.map((t) => (t.id === tid ? { ...t, session: id } : t)),
      tabFolders,
      [...tabSessions, { id, name: r.name, color: r.color }],
    )
  }
  /** Ouvrir un onglet dans le navigateur par défaut (appli) ou un nouvel onglet (navigateur). */
  const openOutside = (url: string) =>
    desktop
      ? desktop.openExternal(new URL(srcOf(url), window.location.href).href)
      : window.open(srcOf(url), '_blank', 'noopener')
  /** Adresse de la page affichée dans l'onglet ; pas encore chargé (veille, jamais ouvert) : la sienne. */
  const copyTabLink = (t: CustomTab) =>
    void copy(`tab:${t.id}`, pageUrl.current.get(t.id) ?? new URL(srcOf(t.url), window.location.href).href)
  const copyItem = (t: CustomTab): MenuItem => ({ icon: '⧉', label: 'Copier le lien', onSelect: () => copyTabLink(t) })
  const removeTab = (t: CustomTab) =>
    void confirmDialog({
      title: `Supprimer l'onglet « ${t.label} » ?`,
      body: [
        t.url,
        "L'onglet disparaît de la barre. La connexion au site est conservée : rajouté plus tard, il sera encore connecté.",
        'Tu peux revenir en arrière depuis Réglages → Sauvegardes.',
      ],
      confirmLabel: 'Supprimer',
      danger: true,
    }).then((ok) => {
      if (!ok) return
      saveTabs(customTabs.filter((x) => x.id !== t.id))
      if (tab === tabKey(t)) selectTab(lastNative.current)
    })
  /**
   * Clic droit sur un onglet perso (icône ou onglet du haut), rangé comme celui
   * des liens : actions, puis Ranger (dossiers en pastilles), Compte (comptes en
   * pastilles, le choisi en évidence), Onglet (son, veille, modifier).
   */
  const tabMenu = (e: React.MouseEvent, t: (typeof customTabs)[number]) => {
    const here = folderOf(t, tabFolders)
    const mine = sessionOf(t, tabSessions)
    const setSession = (session?: string) =>
      saveTabs(customTabs.map((x) => (x.id === t.id ? { ...x, session } : x)))
    const web = t.embed && !isLocal(t.url)
    menus.openMenu({
      x: e.clientX,
      y: e.clientY,
      title: t.label,
      items: [
        { icon: '↗', label: 'Ouvrir dans le navigateur', onSelect: () => openOutside(t.url) },
        copyItem(t),
        ...(t.embed
          ? [
              {
                icon: '↻',
                label: 'Recharger',
                // ⇧⌘R recharge l'onglet affiché : le rappeler sur un autre tromperait.
                hint: desktop && view === tabKey(t) ? keys('R', !reloadSwap) : undefined,
                onSelect: () => window.dispatchEvent(new CustomEvent(RELOAD_TAB, { detail: tabKey(t) })),
              },
            ]
          : []),
        { heading: 'Ranger' },
        tabFolders.length
          ? {
              icon: '📁',
              label: 'Dossier',
              chips: [
                { label: 'aucun', on: !here, onSelect: () => here && saveTabs(moveTab(customTabs, t.id, null)) },
                ...tabFolders.map((f) => ({
                  label: f.name,
                  color: f.color ?? '#60a5fa',
                  on: f.id === here,
                  onSelect: () => f.id !== here && saveTabs(moveTab(customTabs, t.id, null, f.id)),
                })),
              ],
            }
          : { icon: '📁', label: 'Aucun dossier pour l’instant', disabled: true, onSelect: () => undefined },
        { icon: '＋', label: 'Nouveau dossier avec cet onglet…', onSelect: () => void newFolder([t.id]) },
        // Comptes : seulement là où ils ont un effet (appli de bureau récente).
        ...(hasSessions && web
          ? [
              { heading: 'Compte' },
              {
                icon: '◉',
                label: 'Connexion',
                chips: [
                  { label: 'principal', on: !mine, onSelect: () => mine && setSession(undefined) },
                  ...tabSessions.map((x) => ({
                    label: x.name,
                    color: x.color,
                    on: mine?.id === x.id,
                    onSelect: () => mine?.id !== x.id && setSession(x.id),
                  })),
                ],
              },
              { icon: '＋', label: 'Nouveau compte…', hint: 'connexion à part', onSelect: () => void newSession(t.id) },
            ]
          : []),
        { heading: 'Onglet' },
        ...(t.embed ? [notifyItem(t), muteItem(t), sleepItem(t), ...clearItem(t)] : []),
        { icon: '✎', label: 'Modifier…', hint: 'nom, adresse', onSelect: () => openTabSettings(t.id) },
        { icon: '✕', label: "Supprimer l'onglet…", danger: true, onSelect: () => removeTab(t) },
      ],
    })
  }
  const folderMenu = (e: React.MouseEvent, f: (typeof tabFolders)[number]) => {
    const inside = customTabs.filter((t) => t.folder === f.id)
    // Compte du dossier (issue #60) : appliqué à chacun de ses sites (même stockage
    // qu'un compte choisi site par site) ; ceux ajoutés ensuite le prennent aussi.
    const setFolderSession = (session?: string) =>
      saveTabs(
        customTabs.map((t) => (t.folder === f.id ? { ...t, session } : t)),
        tabFolders.map((x) => (x.id === f.id ? { ...x, session } : x)),
      )
    const shared = inside.length && inside.every((t) => (t.session ?? '') === (inside[0].session ?? ''))
      ? inside[0].session
      : null
    menus.openMenu({
      x: e.clientX,
      y: e.clientY,
      title: `${f.icon ?? '📁'} ${f.name}`,
      items: [
        {
          icon: '✎',
          label: 'Nom et couleur…',
          onSelect: async () => {
            const r = await askNameColor({ title: 'Dossier', name: f.name, color: f.color, okLabel: 'Enregistrer' })
            if (r) saveTabs(customTabs, tabFolders.map((x) => (x.id === f.id ? { ...x, name: r.name, color: r.color } : x)))
          },
        },
        ...(desktop && hasSessions && tabSessions.length
          ? [
              {
                icon: '◉',
                label: 'Compte de tout le dossier',
                chips: [
                  { label: 'principal', on: shared === undefined, onSelect: () => setFolderSession(undefined) },
                  ...tabSessions.map((x) => ({
                    label: x.name,
                    color: x.color,
                    on: shared === x.id,
                    onSelect: () => setFolderSession(x.id),
                  })),
                ],
              } as MenuItem,
            ]
          : []),
        { sep: true },
        {
          icon: '✕',
          label: 'Supprimer le dossier',
          hint: 'ses sites restent',
          danger: true,
          onSelect: () =>
            void confirmDialog({
              title: `Supprimer le dossier « ${f.name} » ?`,
              body: `Ses ${inside.length} site${inside.length > 1 ? 's' : ''} restent dans la barre de gauche, hors dossier.`,
              confirmLabel: 'Supprimer le dossier',
            }).then(
              (ok) =>
                ok &&
                saveTabs(
                  customTabs.map((t) => (t.folder === f.id ? { ...t, folder: undefined } : t)),
                  tabFolders.filter((x) => x.id !== f.id),
                ),
            ),
        },
      ],
    })
  }
  // ── liens et clic droit dans les sites (appli de bureau) ─────────────────
  const fromGuest = (id: number) => allTabs.find((t) => t.id === guestTab.current.get(id))
  /**
   * Ouvre `url` dans l'onglet perso `t` (et l'affiche). Le lien reste en attente
   * jusqu'à ce que l'onglet le prenne : pas encore monté (jamais ouvert, en veille),
   * il le charge au montage au lieu de son adresse (issue #18).
   */
  const openInTab = (t: CustomTab, url: string) => {
    search.setQuery('')
    pendingLinks.current.set(tabKey(t), url)
    selectTab(tabKey(t))
    window.dispatchEvent(new CustomEvent<OpenInTab>(OPEN_IN_TAB, { detail: { key: tabKey(t), url } }))
  }
  /**
   * Onglet temporaire sur `url`, avec ce compte (absent = connexion commune) :
   * toujours en haut, dans l'espace où l'on est (le dash depuis Réglages). Avant,
   * certains allaient en bas de la barre de gauche : deux places pour la même
   * chose (issue #60).
   */
  const openTemp = (url: string, session?: string) => openChild(spaceOf(tab) ?? DASH, url, session)
  /**
   * Compte d'un onglet ouvert par un lien dans `space` : celui de l'onglet perso du
   * site s'il en a un (on y est connecté), sinon celui de l'onglet d'origine.
   */
  const sessionFor = (space: string, url: string, from?: CustomTab) =>
    linkTarget(url, regularTabs, from)?.session ??
    (from ?? (space === DASH ? undefined : allTabs.find((x) => tabKey(x) === space)))?.session
  /**
   * Lien ouvert « ici » : un onglet temporaire en haut de l'espace `space` (le dash
   * ou un onglet perso). Pour le garder : clic droit → Garder dans Mes sites. Le
   * réglage « onglets gardés d'office » n'existe plus (issue #60) : deux niveaux,
   * temporaire ou Mes sites, au lieu de trois.
   */
  const openChild = (space: string, url: string, session?: string) => {
    const label = hostOf(url).replace(/^www\./, '') || 'Onglet'
    perfEvent('temp-open', { host: hostOf(url), space: space === DASH ? 'dash' : 'onglet' })
    search.setQuery('')
    const id = `tmp-${newTabId(allTabs.map((t) => t.id)).slice(2)}`
    setTemps((ts) => [...ts, { id, label, url, embed: true, session, parent: space }])
    selectTab(`x:${id}`)
  }
  /**
   * Où ouvrir un lien dans homedash (issue #52) : un site = un seul endroit.
   * Une page déjà ouverte en onglet est réaffichée ; un lien vers un site de la
   * barre de gauche ouvre ce site (le compte de l'onglet d'origine d'abord) ;
   * sinon un onglet temporaire là où l'on est. Avant, chaque clic rechargeait
   * le site en double (trois Gmail pour un lien cliqué deux fois).
   */
  const openHere = (space: string, url: string, from?: CustomTab) => {
    const open = allTabs.find((t) => (t.id.startsWith('tmp-') || t.parent) && samePage(t.url, url))
    if (open) {
      search.setQuery('')
      selectTab(tabKey(open))
      return
    }
    const target = linkTarget(url, regularTabs, from)
    // Le site lui-même (Telegram « ouvrir dans un nouvel onglet ») : un onglet à part.
    if (target && target.id !== from?.id) {
      // Le site avait une page ouverte : elle est remplacée, on dit comment la
      // retrouver (issue #60) plutôt que de la perdre en silence.
      const was = pageUrl.current.get(target.id)
      if (was && !samePage(was, url)) flashNotice(`Ouvert dans ${target.label} · ${keys('[')} pour revenir à la page d’avant`)
      return openInTab(target, url)
    }
    openChild(space, url, sessionFor(space, url, from))
  }
  inAppRef.current = (url, flip = false, searched = false) => {
    if (!desktop || (ui.openLinks === 'browser') !== flip) return false
    // homedash lui-même (une autre page servie par le container) : le navigateur.
    if (new URL(url, window.location.href).host === window.location.host) return false
    const space = spaceOf(tab) ?? DASH
    // Cherché depuis un site : une nouvelle navigation, pas un lien de ce site :
    // le site visé s'il est dans la barre de gauche, sinon un onglet temporaire.
    if (searched && space !== DASH) {
      const target = linkTarget(url, regularTabs)
      if (target) openInTab(target, url)
      else openTemp(url)
      return true
    }
    openHere(space, url)
    return true
  }
  openTempRef.current = (url) => openTemp(url)
  /** ⧉ de la barre : un onglet éphémère vierge (Google), avec le compte choisi s'il y en a. */
  const newTemp = (e: { clientX: number; clientY: number }) => {
    const start = 'https://www.google.com/'
    if (!hasSessions || !tabSessions.length) return openTemp(start)
    menus.openMenu({
      x: e.clientX,
      y: e.clientY,
      title: 'Onglet temporaire',
      items: [
        { label: 'Compte principal', onSelect: () => openTemp(start) },
        ...tabSessions.map((s) => ({ label: `Compte ${s.name}`, onSelect: () => openTemp(start, s.id) })),
      ],
    })
  }
  // ＋ de la barre : une fenêtre ; « Plus de réglages » = Réglages → Onglets perso.
  const addTab = () => setAdding(true)
  const addTabInSettings = () => {
    setAdding(false)
    search.setQuery('')
    presetNewTab()
    // Réglages déjà ouvert : il bascule lui-même, sans perdre un brouillon.
    if (tab === 'settings') window.dispatchEvent(new Event(NEW_TAB_EVENT))
    else selectTab('settings')
  }
  /** Clic droit sur la barre de gauche (hors icône) : ce qui n'a plus de bouton. */
  const railMenu = (e: React.MouseEvent) => {
    const at = { clientX: e.clientX, clientY: e.clientY }
    const width = (mode: RailMode, label: string): MenuItem => ({
      icon: railMode === mode ? '✓' : '',
      label,
      onSelect: () => changeRail(mode),
    })
    menus.openMenu({
      x: e.clientX,
      y: e.clientY,
      title: 'Barre de gauche',
      items: [
        { icon: '＋', label: 'Ajouter un site', onSelect: addTab },
        { icon: '⧉', label: 'Nouvel onglet temporaire', onSelect: () => newTemp(at) },
        ...(temps.length
          ? [{ icon: '✕', label: 'Fermer tous les onglets temporaires', hint: `${temps.length}`, onSelect: closeAllTemps }]
          : []),
        { sep: true },
        { heading: 'Largeur' },
        width('wide', 'Étendue (icônes et noms)'),
        width('icons', 'Réduite (icônes)'),
        width('mini', 'Super réduite (petites icônes)'),
        { sep: true },
        { icon: '✕', label: 'Cacher la barre', hint: 'onglets en haut', onSelect: () => changeRail('hidden') },
      ],
    })
  }
  /** Tous les onglets temporaires (pas les gardés), et retour à l'espace d'où l'on était. */
  const closeAllTemps = () => {
    const shownTemp = temps.find((t) => tabKey(t) === tab)
    perfEvent('temp-close', { count: temps.length, all: true })
    setTemps([])
    if (shownTemp) selectTab(shownTemp.parent && shownTemp.parent !== DASH ? (shownTemp.parent as TabId) : lastNative.current)
  }
  const closeTemp = (t: CustomTab) => {
    perfEvent('temp-close', { host: hostOf(t.url), kept: !!t.kept })
    if (t.kept) saveTabs(customTabs.filter((x) => x.id !== t.id))
    else setTemps((ts) => ts.filter((x) => x.id !== t.id))
    if (tab !== tabKey(t)) return
    // onglet d'un espace : son voisin, sinon l'espace lui-même (comme un navigateur)
    const space = parentOf(t)
    const sibs = space ? childrenOf(space) : []
    const i = sibs.findIndex((x) => x.id === t.id)
    const next = sibs[i + 1] ?? sibs[i - 1]
    selectTab(next ? tabKey(next) : space && space !== DASH ? (space as TabId) : lastNative.current)
  }
  /** Éphémère → un autre statut, sur la page où il est : gardé, ou onglet perso. */
  const promoteTemp = (t: CustomTab, kept: boolean) => {
    const url = tempUrl.current.get(t.id) ?? t.url
    const label = t.kept ? t.label : hostOf(url).replace(/^www\./, '') || t.label
    if (t.kept) {
      // déjà dans la config : on change juste son statut (et sa page)
      saveTabs(customTabs.map((x) => (x.id === t.id ? { ...x, url, kept: kept || undefined } : x)))
      return
    }
    const id = newTabId(allTabs.map((x) => x.id))
    // gardé : reste dans son espace ; ajouté à mes onglets : un onglet perso à part entière
    saveTabs([...customTabs, { ...t, id, url, label, parent: kept ? t.parent : undefined, ...(kept ? { kept: true } : {}) }])
    setTemps((ts) => ts.filter((x) => x.id !== t.id))
    if (tab === tabKey(t)) selectTab(`x:${id}`)
  }
  /** Gardé → éphémère simple (il disparaîtra au redémarrage). */
  const unkeep = (t: CustomTab) => {
    const id = `tmp-${newTabId(allTabs.map((x) => x.id)).slice(2)}`
    setTemps((ts) => [...ts, { ...t, id, kept: undefined, url: tempUrl.current.get(t.id) ?? t.url }])
    saveTabs(customTabs.filter((x) => x.id !== t.id))
    if (tab === tabKey(t)) selectTab(`x:${id}`)
  }
  const toggleSleep = (t: CustomTab) => {
    const sleep = t.sleep ? undefined : true
    if (t.id.startsWith('tmp-')) setTemps((ts) => ts.map((x) => (x.id === t.id ? { ...x, sleep } : x)))
    else saveTabs(customTabs.map((x) => (x.id === t.id ? { ...x, sleep } : x)))
  }
  /** Notifications de l'onglet : pastille et notifications du site (`notify`). */
  const toggleNotify = (t: CustomTab) => {
    const notify = t.notify === false ? undefined : false
    if (t.id.startsWith('tmp-')) setTemps((ts) => ts.map((x) => (x.id === t.id ? { ...x, notify } : x)))
    else saveTabs(customTabs.map((x) => (x.id === t.id ? { ...x, notify } : x)))
  }
  const notifyItem = (t: CustomTab): MenuItem => ({
    icon: t.notify === false ? '🔔' : '🔕',
    label: t.notify === false ? 'Rétablir les notifications' : 'Couper les notifications',
    hint: t.notify === false ? 'pastille et notifs' : 'ni pastille ni notifs',
    onSelect: () => toggleNotify(t),
  })
  const toggleMute = (t: CustomTab) => {
    const key = tabKey(t)
    setMuted((m) => ({ ...m, [key]: !m[key] }))
  }
  const muteItem = (t: CustomTab): MenuItem => ({
    icon: muted[tabKey(t)] ? '🔊' : '🔇',
    label: muted[tabKey(t)] ? 'Rétablir le son' : 'Couper le son',
    onSelect: () => toggleMute(t),
  })
  /** Clic droit → Effacer les données de ce site : cookies, stockage, cache, dans le compte de l'onglet. */
  const clearItem = (t: CustomTab): MenuItem[] => {
    const host = hostOf(tempUrl.current.get(t.id) ?? t.url)
    if (!desktop?.clearData || !host) return []
    const account = sessionOf(t, tabSessions)
    const base = host.replace(/^www\./, '')
    return [
      {
        icon: '🧹',
        label: 'Effacer les données de ce site',
        hint: account ? `compte ${account.name}` : 'compte principal',
        onSelect: () =>
          void confirmDialog({
            title: `Effacer les données de ${base} ?`,
            body: [
              `Cookies, données enregistrées et cache de ${base}${account ? ` dans le compte ${account.name}` : ''} sont effacés : tu en seras déconnecté.`,
              'Utile quand un site boude (captcha refusé, page qui tourne en boucle). Les autres sites et comptes ne bougent pas.',
            ],
            confirmLabel: 'Effacer',
            danger: true,
          }).then((ok) => {
            if (!ok) return
            void desktop
              ?.clearData?.(partitionOf(account?.id), host)
              .then(() => window.dispatchEvent(new CustomEvent(RELOAD_TAB, { detail: tabKey(t) })))
          }),
      },
    ]
  }
  siteActionsRef.current = {
    mute: toggleMute,
    notify: toggleNotify,
    clear: (t) => {
      const item = clearItem(t)[0]
      if (item && 'onSelect' in item) item.onSelect?.()
    },
  }
  refreshAllRef.current = refreshAll
  const sleepItem = (t: CustomTab): MenuItem => ({
    icon: '💤',
    label: t.sleep ? 'Ne plus mettre en veille' : 'Mettre en veille si inutilisé',
    hint: `${ui.tabSleepMinutes} min`,
    onSelect: () => toggleSleep(t),
  })
  const tempMenu = (e: React.MouseEvent, t: CustomTab) =>
    menus.openMenu({
      x: e.clientX,
      y: e.clientY,
      title: `${t.label} · onglet temporaire${t.kept ? ', gardé' : ''}`,
      items: [
        { icon: '↗', label: 'Ouvrir dans le navigateur', onSelect: () => openOutside(tempUrl.current.get(t.id) ?? t.url) },
        copyItem(t),
        { sep: true },
        { icon: '📌', label: 'Garder dans Mes sites', hint: 'dans la barre de gauche', onSelect: () => promoteTemp(t, false) },
        // Gardé avec l'ancien réglage : on peut encore le rendre temporaire.
        ...(t.kept ? [{ icon: '◌', label: 'Ne plus garder', hint: 'fermé au redémarrage', onSelect: () => unkeep(t) }] : []),
        { heading: 'Onglet' },
        notifyItem(t),
        muteItem(t),
        sleepItem(t),
        ...clearItem(t),
        { sep: true },
        { icon: '✕', label: 'Fermer', danger: !!t.kept, onSelect: () => closeTemp(t) },
        ...(allTemps.filter((x) => !x.kept).length > 1
          ? [{ icon: '✕', label: 'Fermer tous les onglets temporaires', hint: `${allTemps.filter((x) => !x.kept).length}`, onSelect: closeAllTemps }]
          : []),
      ],
    })
  /** Lien « nouvel onglet » d'un site (main.js) : un onglet perso de ce site, sinon false → navigateur. */
  const route = (url: string, fromId: number, flip = false): boolean => {
    // Réglage des liens (et ⌘clic, l'inverse) : comme ceux de la page (issue #32).
    if ((ui.openLinks === 'browser') !== flip) return false
    const from = fromGuest(fromId)
    // Depuis un site : son site s'il est dans la barre de gauche, sinon un onglet
    // temporaire dans l'espace d'origine (openHere).
    const space = from ? spaceOf(tabKey(from)) : null
    if (space) {
      openHere(space, url, from ?? undefined)
      return true
    }
    // Éphémère seul (barre de gauche) : comme avant.
    const target = linkTarget(url, regularTabs, from)
    if (!target) return false
    // Un site qui demande un nouvel onglet vers lui-même (Telegram « Open in new
    // tab », un lien target=_blank du même site) : un éphémère du même compte,
    // pas l'onglet d'origine rechargé sur cette adresse (issue #1).
    if (from && target.id === from.id) openTemp(url, from.session)
    else openInTab(target, url)
    return true
  }
  /** Comment ouvrir `url` : les onglets de ce site (avec leur compte), un éphémère (par compte), le navigateur. */
  /**
   * `clicks` : lien de homedash (pas d'un site), dont le clic suit `ui.openLinks` :
   * le choix du clic en tête, chacun avec sa touche (issue #32).
   */
  const openChoices = (url: string, clicks = false): MenuItem[] => {
    const here = spaceOf(tab) ?? DASH
    const outside = clicks && ui.openLinks === 'browser'
    const hint = (mine: boolean) => (clicks ? (mine ? 'clic' : keys('clic')) : undefined)
    const browser: MenuItem = {
      icon: '↗',
      label: 'Dans le navigateur',
      hint: hint(outside),
      onSelect: () => desktop?.openExternal(url),
    }
    // Ce que fait le clic (openHere) en tête : le site qui a cette adresse, sinon
    // un onglet temporaire. Les autres sites du même domaine (un autre compte) suivent.
    const sites = regularTabs.filter((x) => capturesLink(x, url))
    const first = linkTarget(url, regularTabs)
    const items: MenuItem[] = outside ? [browser] : []
    items.push(...[...sites].sort((a, b) => Number(b.id === first?.id) - Number(a.id === first?.id)).map((t) => {
      const s = sessionOf(t, tabSessions)
      return {
        icon: iconOf[t.id],
        label: `Dans ${t.label}`,
        ...(s ? { dot: s.color } : {}),
        hint: t.id === first?.id ? hint(!outside) : s?.name,
        onSelect: () => openInTab(t, url),
      }
    }))
    const temp = (session?: string) => openChild(here, url, session)
    items.push(
      hasSessions && tabSessions.length
        ? {
            icon: '◌',
            label: 'Nouvel onglet temporaire',
            chips: [
              { label: 'compte principal', onSelect: () => temp() },
              ...tabSessions.map((s) => ({ label: s.name, color: s.color, onSelect: () => temp(s.id) })),
            ],
          }
        : {
            icon: '◌',
            label: 'Nouvel onglet temporaire',
            hint: first ? undefined : hint(!outside),
            onSelect: () => temp(),
          },
    )
    if (!outside) items.push(browser)
    return items
  }
  openItemsRef.current = (url) => (desktop ? openChoices(url, true) : [])
  linkMenuRef.current = (x, y, url) =>
    menus.openMenu({
      x,
      y,
      title: shortLink(url),
      items: [
        { heading: 'Ouvrir' },
        ...openChoices(url, true),
        { sep: true },
        { icon: '⧉', label: 'Copier le lien', onSelect: () => void copy(`ctx:${url}`, url) },
      ],
    })
  /** Fenêtre « nouvelle issue » d'une tâche (repo, titre, besoin) ; faux si aucun repo suivi. */
  /** Clone local d'un repo (`~/dev/api`) d'après l'onglet Local : Claude Code s'y lance. */
  const cloneOf = (repo: string): string | null => {
    const [own, name] = repo.toLowerCase().split('/')
    const r = local.data?.repos?.find((x) => x.org?.toLowerCase() === own && x.repo?.toLowerCase() === name)
    return r?.display ?? null
  }
  const openTask = (task: IssueTask, start: 'read' | 'issue', comment?: number) => {
    const key = bcKey(task.url)
    askIssue({
      repos: bc.data?.github?.repos ?? [],
      task,
      start,
      onOpenSource: () => openLink(task.url),
      comment,
      existing: (key && issuesByTask(bc.data?.github?.issues ?? []).get(key)) || [],
      cloneOf,
      onOpen: openLink,
      onOpenOutside: desktop ? openOutside : undefined,
      onMade: bc.reload,
    })
  }
  const newIssue = (task: IssueTask, comment?: number): boolean => {
    if (!bc.data?.github?.repos?.length) return false
    openTask(task, 'issue', comment)
    return true
  }
  const openCard = (card: IssueCard, start: 'read' | 'issue', comment?: string) => {
    const key = trKey(card.url)
    askTrIssue({
      repos: tr.data?.github?.repos ?? [],
      card,
      start,
      onOpenSource: () => openLink(card.url),
      comment,
      existing: (key && issuesByCard(tr.data?.github?.issues ?? []).get(key)) || [],
      cloneOf,
      onOpen: openLink,
      onOpenOutside: desktop ? openOutside : undefined,
      onMade: tr.reload,
    })
  }
  const newTrIssue = (card: IssueCard, comment?: string): boolean => {
    if (!tr.data?.github?.repos?.length) return false
    openCard(card, 'issue', comment)
    return true
  }
  const trCardOf = (c: TrCard): IssueCard => ({ url: c.url, title: c.title, where: trWhere(c), board: c.board_id })
  const viewTrCard = (card: IssueCard, comment?: string) => openCard(card, 'read', comment)
  const bcTaskOf = (t: BcTask): IssueTask => ({ url: t.url, title: t.title, where: whereOf(t), project: t.project })
  /** Fiche d'une tâche (description, échanges), ouverte sur un échange s'il est donné. */
  const viewTask = (task: IssueTask, comment?: number) => openTask(task, 'read', comment)
  /** Résultat de recherche Basecamp → sa tâche (un commentaire mène à la sienne) et l'échange visé. */
  const foundTask = (item: BcFound): [IssueTask, number | undefined] => {
    const comment = /#__recording_(\d+)/.exec(item.url)
    return [
      {
        url: item.url.split('#')[0],
        title: item.type === 'Comment' ? item.title.replace(/^Re:\s*/, '') : item.title,
        where: [item.project, item.parent].filter(Boolean).join(' › '),
        project: item.project,
      },
      comment ? Number(comment[1]) : undefined,
    ]
  }
  /** « Créer une issue GitHub… » dans un menu, s'il y a un repo où la créer. */
  const issueItems = (task: IssueTask): MenuItem[] =>
    bc.data?.github?.repos?.length
      ? [{ icon: '🐙', label: 'Créer une issue GitHub…', onSelect: () => void newIssue(task) }]
      : []
  /** Clic droit sur une tâche de l'onglet Basecamp. */
  const bcTaskMenu = (e: React.MouseEvent, t: BcTask) => {
    e.preventDefault()
    const issue = issueItems(bcTaskOf(t))
    const items: MenuItem[] = desktop ? [{ heading: 'Ouvrir' }, ...openChoices(t.url), { sep: true }] : []
    items.push({ icon: '💬', label: 'Voir la tâche et ses échanges', onSelect: () => viewTask(bcTaskOf(t)) })
    items.push({ icon: '⧉', label: 'Copier le lien', onSelect: () => void copy(`ctx:${t.url}`, t.url) })
    if (issue.length) items.push({ sep: true }, ...issue)
    menus.openMenu({ x: e.clientX, y: e.clientY, title: t.title, items })
  }
  /** Clic droit dans un site (main.js) : le menu de homedash, selon ce qui est sous la souris. */
  const guestMenu = (m: GuestMenu): boolean => {
    const act = desktop?.guestAction
    if (!act) return false
    const items: MenuItem[] = []
    const section = (heading: string) => {
      if (items.length) items.push({ sep: true })
      items.push({ heading })
    }
    if (m.link) {
      section('Ouvrir')
      items.push(...openChoices(m.link))
      items.push({ sep: true })
      items.push({ icon: '⧉', label: 'Copier le lien', onSelect: () => act(m.id, 'copyText', { text: m.link }) })
      // Lien vers une tâche Basecamp (dans le site Basecamp) : en faire une issue.
      const key = bcKey(m.link)
      if (key) {
        const url = m.link.split(/[?#]/)[0]
        const t = [...(bc.data?.tasks.priorities ?? []), ...(bc.data?.tasks.others ?? [])].find((x) => bcKey(x.url) === key)
        const issue = issueItems(t ? { ...bcTaskOf(t), url } : { url, title: m.text.trim().slice(0, 200) })
        if (issue.length) items.push({ sep: true }, ...issue)
      }
      const trk = trKey(m.link)
      if (trk) {
        const url = m.link.split(/[?#]/)[0]
        const c = (tr.data?.cards ?? []).find((x) => x.short_link === trk)
        const card: IssueCard = c ? { ...trCardOf(c), url } : { url, title: m.text.trim().slice(0, 200) }
        if (tr.data?.github?.repos?.length) {
          items.push({ sep: true }, { icon: '🐙', label: 'Créer une issue GitHub…', onSelect: () => void newTrIssue(card) })
        }
      }
    }
    if (m.image) {
      section('Image')
      items.push({ icon: '⧉', label: "Copier l'image", onSelect: () => act(m.id, 'copyImage', { x: m.x, y: m.y }) })
      items.push({ icon: '↗', label: 'Ouvrir dans le navigateur', onSelect: () => desktop?.openExternal(m.image) })
    }
    if (m.editable) {
      section('Édition')
      items.push({ icon: '✂', label: 'Couper', hint: keys('X'), disabled: !m.text, onSelect: () => act(m.id, 'cut') })
      items.push({ icon: '⧉', label: 'Copier', hint: keys('C'), disabled: !m.text, onSelect: () => act(m.id, 'copy') })
      items.push({ icon: '📋', label: 'Coller', hint: keys('V'), onSelect: () => act(m.id, 'paste') })
      items.push({ icon: '▭', label: 'Tout sélectionner', hint: keys('A'), onSelect: () => act(m.id, 'selectAll') })
    } else if (m.text) {
      const q = m.text.trim().slice(0, 200)
      section('Texte')
      items.push({ icon: '⧉', label: 'Copier', hint: keys('C'), onSelect: () => act(m.id, 'copy') })
      items.push({
        icon: '⌕',
        label: `Rechercher « ${q.length > 24 ? q.slice(0, 24) + '…' : q} »`,
        onSelect: () => {
          // en onglet dans l'espace du site (éphémère seul : comme avant)
          const url = `https://www.google.com/search?q=${encodeURIComponent(q)}`
          const from = fromGuest(m.id)
          const here = from ? spaceOf(tabKey(from)) : null
          if (here) openChild(here, url, sessionFor(here, url, from))
          else openTemp(url)
        },
      })
    }
    if (!items.length) {
      items.push({ icon: '←', label: 'Précédent', disabled: !m.canBack, onSelect: () => act(m.id, 'back') })
      items.push({ icon: '→', label: 'Suivant', disabled: !m.canForward, onSelect: () => act(m.id, 'forward') })
      items.push({ icon: '↻', label: 'Recharger', hint: keys('R', !reloadSwap), onSelect: () => act(m.id, 'reload') })
    }
    const from = fromGuest(m.id)
    // x / y d'Electron : déjà dans la fenêtre (pas dans la webview).
    menus.openMenu({
      x: m.x,
      y: m.y,
      // Le lien visé (site + début du chemin), sinon l'onglet.
      title: m.link ? shortLink(m.link) : from?.label,
      items,
    })
    return true
  }
  routeRef.current = route
  menuRef.current = guestMenu

  const tabs: Tab[] = [
    { id: 'links', icon: '⚡', label: 'Raccourcis' },
    // L'onglet existe dès qu'un compte est branché, même si le compte affiché ne l'est pas.
    ...(on.github && (gh.data?.enabled || gh.data?.accounts?.some((a) => a.enabled))
      ? [{ id: 'github' as TabId, icon: '🐙', label: 'GitHub', group: code }]
      : []),
    // Toujours présent : le hook ne sonde que l'onglet ouvert, donc `local.data`
    // est nul tant qu'on n'a pas cliqué. La page explique elle-même son absence
    // de configuration, ce qu'un onglet manquant ne saurait pas faire.
    ...(on.local
      ? [
          {
            id: 'local' as TabId,
            icon: '💻',
            label: 'Local',
            badge: local.todo,
            badgeTitle: `${local.todo} branche(s) locale(s) mergée(s) qui traînent encore sur le disque`,
            group: code,
          },
        ]
      : []),
    // Dès que l'appli Basecamp est renseignée : connecté ou pas, l'onglet dit quoi faire.
    ...(on.basecamp && bc.data?.configured
      ? [
          {
            id: 'basecamp' as TabId,
            icon: '🏕',
            label: 'Basecamp',
            badge: bcLate,
            badgeTitle: `${bcLate} tâche(s) Basecamp en retard`,
          },
        ]
      : []),
    ...(on.trello && tr.data?.configured
      ? [
          {
            id: 'trello' as TabId,
            icon: '📋',
            label: 'Trello',
            badge: trLate,
            badgeTitle: `${trLate} carte(s) Trello en retard`,
          },
        ]
      : []),
  ]
  /** Un onglet perso (ou éphémère) dans une barre d'onglets. */
  const entry = (t: CustomTab): Tab => ({
    id: tabKey(t),
    icon: iconOf[t.id],
    // onglet d'un espace : le titre de sa page, comme un navigateur
    label: parentOf(t) && childTitles[t.id] ? childTitles[t.id] : t.label,
    title: t.url,
    ...(t.embed ? {} : { href: srcOf(t.url) }),
    badge: t.embed && t.notify !== false ? tabCounts[tabKey(t)] : 0,
    badgeTitle: `${tabCounts[tabKey(t)] ?? 0} non lu(s) d'après la page`,
    badgeAlert: true,
    session: t.embed ? sessionOf(t, tabSessions) : undefined,
    // Comme son icône dans la barre de gauche : clic droit, ✕ des éphémères, glisser.
    ...(isTemp(t)
      ? { onContext: (e: React.MouseEvent) => tempMenu(e, t), onClose: () => closeTemp(t) }
      : { onContext: (e: React.MouseEvent) => tabMenu(e, t), movable: true }),
    asleep: asleep.includes(tabKey(t)),
    // 🔊 qui joue / 🔇 coupé, cliquable comme dans un navigateur
    ...(audible[tabKey(t)] || muted[tabKey(t)]
      ? { audio: muted[tabKey(t)] ? ('muted' as const) : ('on' as const), onToggleMute: () => toggleMute(t) }
      : {}),
  })
  const childEntries = (space: string) => childrenOf(space).map(entry)
  // Onglet perso supprimé (ou mémorisé d'une autre config) : retour aux raccourcis.
  const openCustom = allTabs.find((t) => tabKey(t) === tab && t.embed)
  const shown: TabId = tab.startsWith('x:') && !openCustom ? 'links' : tab
  /**
   * Barre d'onglets du haut. Avec la barre de gauche : le dash et ses onglets ouverts
   * par un lien, ou l'onglet perso affiché et les siens (rien s'il n'en a pas : une
   * rangée de moins). Sans elle : tout, chaque onglet ouvert par un lien après son espace.
   */
  const space = spaceOf(shown)
  const parentTab = space && space !== DASH ? regularTabs.find((t) => tabKey(t) === space) : undefined
  const strip: Tab[] | null = !railOn
    ? [
        ...tabs,
        ...childEntries(DASH),
        ...regularTabs.flatMap((t) => [entry(t), ...childEntries(tabKey(t))]),
        ...allTemps.filter((t) => !parentOf(t)).map(entry),
        { id: 'settings' as TabId, icon: '⚙', label: 'Réglages' },
      ]
    : space === DASH
      ? [...tabs, ...childEntries(DASH)]
      : parentTab && childrenOf(space!).length
        ? [entry(parentTab), ...childEntries(space!)]
        : null
  // Barre de gauche : l'icône de l'espace affiché (⚡ pour le dash) est la sélection.
  const railActive = shown === 'settings' ? 'settings' : space === DASH ? null : (space ?? (shown.startsWith('x:') ? shown : null))
  // La recherche court-circuite les onglets : ses résultats valent partout.
  const view: TabId | 'search' = searching ? 'search' : shown
  const setupOn = view === 'links' && setupWanted
  const openSection = (id: string) => {
    search.setQuery('')
    presetSettingsSection(id)
    selectTab('settings')
  }
  const setupSteps: SetupStep[] = [
    {
      id: 'sites',
      icon: '🗂',
      title: 'Ajoute tes sites',
      hint: 'Gmail, Chat, Claude… dans la barre de gauche, avec leurs non-lus.',
      done: customTabs.length > 0,
      action: 'Ajouter un site',
      run: addTab,
    },
    ...(on.github
      ? [{
          id: 'github',
          icon: '🐙',
          title: 'Connecte GitHub',
          hint: 'Tes branches, PRs et CI. Il faut un jeton GitHub : la page explique comment le créer.',
          done: setupState?.github,
          action: 'Connecter',
          run: () => openSection('set-github'),
        }]
      : []),
    ...(on.local
      ? [{
          id: 'local',
          icon: '💻',
          title: 'Choisis tes dossiers de code',
          hint: 'Les dossiers où sont tes clones git : homedash dit quelles branches tu peux supprimer.',
          done: setupState?.local,
          action: 'Choisir',
          run: () => openSection('set-local'),
        }]
      : []),
    ...(on.basecamp
      ? [{
          id: 'basecamp',
          icon: '🏕',
          title: 'Connecte Basecamp',
          hint: 'Tes tâches et tes notifications, en lecture seule.',
          done: setupState?.basecamp,
          action: 'Connecter',
          run: () => openSection('set-basecamp'),
        }]
      : []),
    ...(on.trello
      ? [{
          id: 'trello',
          icon: '📋',
          title: 'Connecte Trello',
          hint: 'Tes cartes et tes notifications, en lecture seule.',
          done: setupState?.trello,
          action: 'Connecter',
          run: () => openSection('set-trello'),
        }]
      : []),
    // Défauts = écran 49" : sur un écran plus petit, le texte paraît minuscule.
    ...(window.innerWidth < 4000
      ? [{
          id: 'display',
          icon: '🖥',
          title: 'Adapte l’affichage à ton écran',
          hint: 'Texte trop petit ou trop grand ? Choisis ton écran (portable, 34", 49").',
          done: raw?.ui?.pageWidth !== undefined,
          action: 'Choisir',
          run: () => openSection('set-display'),
        }]
      : []),
  ]
  const hiddenGroups = (raw?.groups ?? []).filter((g) => g.hidden)
  const hideSetup = () => raw && persist({ ...raw, ui: { ...(raw.ui ?? {}), setupHidden: true } })

  /** Réglages → Onglets perso ; avec un id, l'éditeur de cet onglet déplié. */
  const openTabSettings = (id?: string) => {
    search.setQuery('')
    if (id) presetEditTab(id)
    else presetSettingsSection('set-tabs')
    selectTab('settings')
  }

  return (
    <div
      className={`app${railOn && shown.startsWith('x:') ? ' is-site' : ''}${railOn && strip ? ' has-strip' : ''}`}
      style={layoutVars(ui)}
    >
      <TopBar
        site={railOn && view.startsWith('x:')}
        query={search.query}
        onQuery={search.setQuery}
        placeholder={ui.searchPlaceholder}
        showClock={ui.showClock}
        theme={effectiveTheme}
        onTheme={switchTheme}
        searchRef={searchRef}
        resultCount={searching ? search.hits.length : null}
        scope={{
          icon: currentScope.icon,
          label: search.scope === 'all' ? null : currentScope.label,
          onPick: (e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            menus.openMenu({
              x: r.left,
              y: r.bottom + 6,
              title: 'Chercher dans',
              items: searchScopes.map((x) => ({
                icon: x.icon,
                label: x.label,
                hint: x.id === search.scope ? '✓' : undefined,
                onSelect: () => {
                  search.setScope(x.id)
                  searchRef.current?.focus()
                },
              })),
            })
          },
        }}
        onRefresh={refreshAll}
        refreshing={syncing}
        version={
          <VersionMenu data={changelog.data} busy={changelog.busy} onCheck={() => void changelog.check()} />
        }
        bell={
          // Le journal n'est plus un onglet : une cloche qu'on consulte sans
          // quitter ce qu'on fait. « Tout voir » ouvre l'historique complet.
          // Basecamp a la sienne : ses non-lus sont ceux de Basecamp, pas du journal.
          <>
            <EventBell
              events={events.events}
              unseen={events.unseen}
              seen={events.seen}
              error={events.error}
              onOpen={events.markSeen}
              onShowAll={() => {
                search.setQuery('')
                selectTab('events')
              }}
              onClear={events.clear}
              inApp={inApp}
              basecamp={bc.data}
              onOpenBasecamp={() => selectTab('basecamp')}
              trello={tr.data}
              onOpenTrello={() => selectTab('trello')}
            />
          </>
        }
      />

      {railOn ? (
        <Rail
          tabs={regularTabs}
          temps={allTemps.filter((t) => !parentOf(t))}
          kids={Object.fromEntries(
            [DASH, ...regularTabs.map(tabKey)].map((k) => [k === DASH ? 'links' : k, childrenOf(k).length]),
          )}
          asleep={asleep}
          warming={warming}
          audible={audible}
          muted={muted}
          onToggleMute={toggleMute}
          onTempMenu={tempMenu}
          onTempClose={closeTemp}
          folders={tabFolders}
          sessions={tabSessions}
          active={railActive}
          mode={railMode}
          icons={iconOf}
          counts={tabCounts}
          onHome={() => {
            search.setQuery('')
            // Déjà dans le dash : ⚡ ramène à Raccourcis, comme le logo d'une appli
            // (issue #54). Sinon la dernière vue du dash, s'il existe encore.
            if (spaceOf(tab) === DASH) return selectTab('links')
            const last = lastDash.current
            selectTab(!last.startsWith('x:') || allTabs.some((t) => tabKey(t) === last) ? last : lastNative.current)
          }}
          onSettings={() => {
            search.setQuery('')
            selectTab('settings')
          }}
          onSelect={(key) => {
            search.setQuery('')
            selectTab(key)
          }}
          onAdd={addTab}
          onMenu={railMenu}
          onTabs={(next) =>
            saveTabs(
              [...next, ...keptTabs],
              keepFolderPlaces(regularTabs.filter((t) => !folderOf(t, tabFolders)), next, tabFolders, (t) => !folderOf(t, tabFolders)),
            )
          }
          onFolders={(next) => saveTabs(customTabs, next)}
          onMerge={(dragged, target) => void newFolder([target.id, dragged.id])}
          onTabMenu={tabMenu}
          onFolderMenu={folderMenu}
        />
      ) : (
        <button
          className={`rail-reopen${tabUnread ? ' has-unread' : ''}`}
          onClick={() => changeRail('icons')}
          title={tabUnread ? `Afficher la barre de gauche · ${tabUnread} non lu(s)` : 'Afficher la barre de gauche'}
        >
          »{tabUnread ? <span className="rail-reopen-badge">{tabUnread > 99 ? '99+' : tabUnread}</span> : null}
        </button>
      )}

      {/* Barre de gauche affichée : un site ou Réglages a la page pour lui, comme un
          serveur Discord ; la barre d'onglets de homedash revient avec ⚡. */}
      {!strip ? null : (
        <Tabs
          id={STRIP_ID}
          tabs={strip}
          active={shown}
          onSelect={selectTab}
          onAdd={railOn ? undefined : addTab}
          onNewTemp={railOn || !desktop ? undefined : newTemp}
          onMove={(id, before) => {
            const d = customTabs.find((t) => tabKey(t) === id)
            const b = customTabs.find((t) => tabKey(t) === before)
            if (d && b) saveTabs(moveTab(customTabs, d.id, b.id, d.folder))
          }}
        />
      )}

      {allTabs
        // Dans l'appli, chargés un par un dès le départ : leurs pastilles arrivent sans les ouvrir.
        // En veille : démontés (mémoire rendue), remontés au clic.
        // Montés : ceux déjà ouverts, et dans l'appli ceux dont on suit les non-lus
        // (`preloads`) ; chaque site chargé coûte 100 à 400 Mo de mémoire.
        .filter(
          (t) =>
            t.embed &&
            (visited.includes(tabKey(t)) || warmable.slice(0, warmed).includes(tabKey(t))) &&
            !asleep.includes(tabKey(t)),
        )
        .map((t) => (
          <CustomTabView
            // une webview ne change pas de session : autre compte = nouvelle webview
            // (éphémère : son adresse suit la navigation, sans recréer la webview)
            key={`${t.id}:${isTemp(t) ? '' : t.url}:${sessionOf(t, tabSessions)?.id ?? ''}`}
            // compte supprimé = connexion commune
            tab={{ ...t, session: sessionOf(t, tabSessions)?.id }}
            session={sessionOf(t, tabSessions)}
            hidden={view !== tabKey(t)}
            onSettings={() => openTabSettings(t.id)}
            onCopyLink={() => copyTabLink(t)}
            copied={copiedKey === `tab:${t.id}`}
            onGuest={(id) => guestTab.current.set(id, t.id)}
            takeLink={() => takeLink(tabKey(t))}
            icon={iconOf[t.id]}
            onNavigate={
              isTemp(t)
                ? (url) => {
                    tempUrl.current.set(t.id, url)
                    // éphémère simple : son nom suit le site ; gardé : rien n'est écrit
                    // (une écriture de config relance la lecture de GitHub)
                    if (!t.kept)
                      setTemps((ts) =>
                        ts.map((x) => (x.id === t.id ? { ...x, url, label: hostOf(url).replace(/^www\./, '') || x.label } : x)),
                      )
                  }
                : undefined
            }
            onVisit={(url, title) => {
              pageUrl.current.set(t.id, url)
              recordVisit(url, t.label, title)
              // onglet d'un espace : son nom suit le titre de la page
              if (title && parentOf(t)) {
                const name = title.length > 32 ? `${title.slice(0, 31)}…` : title
                setChildTitles((m) => (m[t.id] === name ? m : { ...m, [t.id]: name }))
              }
            }}
            onCount={(n) => setCount(tabKey(t), n)}
            onLoaded={(ms) => {
              perfEvent('load', { tab: t.label, host: hostOf(t.url), ms })
              setWarmLoaded((l) => (l.includes(tabKey(t)) ? l : [...l, tabKey(t)]))
            }}
            muted={!!muted[tabKey(t)]}
            merged={railOn && view === tabKey(t)}
          />
        ))}

      {view === 'search' ? (
        <SearchResults
          hits={search.hits}
          activeIndex={search.activeIndex}
          favicons={ui.favicons}
          faviconProvider={ui.faviconProvider}
          health={health}
          revealSecrets={false}
          copiedKey={copiedKey}
          infoColor={cfg.infos?.color ?? '#38bdf8'}
          noteColor={cfg.notes.color ?? '#facc15'}
          noteIcon={cfg.notes.icon ?? '📝'}
          emptyHint="Aucun résultat."
          counts={counts}
          gh={gh.data?.enabled ? gh.data : null}
          repos={cfg.repos}
          local={local.data}
          onOpenLocal={() => {
            search.setQuery('')
            openLocal()
          }}
          copy={copy}
          onActivate={search.activate}
          onHover={search.setActiveIndex}
          onBcIssue={
            bc.data?.github?.repos?.length
              ? (item) => {
                  search.setQuery('')
                  void newIssue(...foundTask(item))
                }
              : undefined
          }
          onBcView={(item) => {
            search.setQuery('')
            viewTask(...foundTask(item))
          }}
          onBcShow={(item) => {
            search.setQuery('')
            showBcTask(item.url)
            selectTab('basecamp')
          }}
          onTrIssue={
            tr.data?.github?.repos?.length
              ? (item) => {
                  search.setQuery('')
                  void newTrIssue({
                    url: item.url.split(/[?#]/)[0],
                    title: item.title,
                    where: [item.board, item.parent].filter(Boolean).join(' › '),
                    board: (tr.data?.cards ?? []).find((c) => c.url.split(/[?#]/)[0] === item.url.split(/[?#]/)[0])?.board_id,
                  }, item.comment_id ?? undefined)
                }
              : undefined
          }
          onTrView={(item) => {
            search.setQuery('')
            viewTrCard(
              {
                url: item.url.split(/[?#]/)[0],
                title: item.title,
                where: [item.board, item.parent].filter(Boolean).join(' › '),
              },
              item.comment_id ?? undefined,
            )
          }}
          onTrShow={(item) => {
            search.setQuery('')
            showTrTask(item.url)
            selectTab('trello')
          }}
        />
      ) : view === 'events' ? (
        <EventFeed
          events={events.events}
          error={events.error}
          seen={events.seen}
          onClear={events.clear}
          inApp={inApp}
          onClose={goBack}
          off={eventsOff}
        />
      ) : view === 'basecamp' ? (
        <BasecampView
          data={bc.data}
          error={bc.error}
          hidden={bcHidden}
          onHidden={(hidden) => raw && persist({ ...raw, basecamp: { ...raw.basecamp, hidden } })}
          onRefresh={bc.refresh}
          onTaskMenu={bcTaskMenu}
          onNewIssue={bc.data?.github?.repos?.length ? (t) => void newIssue(bcTaskOf(t)) : undefined}
          onShowTask={(t) => viewTask(bcTaskOf(t))}
          cloneOf={cloneOf}
          onSettings={() => {
            presetSettingsSection('set-basecamp')
            selectTab('settings')
          }}
        />
      ) : view === 'trello' ? (
        <TrelloView
          data={tr.data}
          error={tr.error}
          hidden={trHidden}
          onHidden={(hidden) => raw && persist({ ...raw, trello: { ...raw.trello, hidden } })}
          onRefresh={tr.refresh}
          onTaskMenu={(e, c) => {
            e.preventDefault()
            const card = trCardOf(c)
            const items: MenuItem[] = desktop ? [{ heading: 'Ouvrir' }, ...openChoices(c.url), { sep: true }] : []
            items.push({ icon: '💬', label: 'Voir la carte et ses échanges', onSelect: () => viewTrCard(card) })
            items.push({ icon: '⧉', label: 'Copier le lien', onSelect: () => void copy(`ctx:${c.url}`, c.url) })
            if (tr.data?.github?.repos?.length) {
              items.push({ sep: true }, { icon: '🐙', label: 'Créer une issue GitHub…', onSelect: () => void newTrIssue(card) })
            }
            menus.openMenu({ x: e.clientX, y: e.clientY, title: c.title, items })
          }}
          onShowCard={(c) => viewTrCard(trCardOf(c))}
          cloneOf={cloneOf}
          onSettings={() => {
            presetSettingsSection('set-trello')
            selectTab('settings')
          }}
        />
      ) : view === 'local' ? (
        <LocalRepos
          data={local.data}
          error={local.error}
          busy={local.busy}
          onRefresh={local.refresh}
          columns={ui.cardColumns}
          cardWidth={ui.cardWidth}
          onSettings={() => {
            presetSettingsSection('set-local')
            selectTab('settings')
          }}
        />
      ) : view === 'settings' ? (
        <SettingsPage
          config={raw}
          onSave={persist}
          onReload={reload}
          saving={saveState.kind === 'saving'}
          changelog={changelog}
        />
      ) : view === 'github' ? (
        <GithubView
          ctx={ctx}
          onSettings={() => {
            presetSettingsSection('set-github')
            selectTab('settings')
          }}
        />
      ) : view.startsWith('x:') ? null : (
        <>
          {setupOn ? (
            <SetupCard steps={setupSteps} onHide={hideSetup} onFeatures={() => openSection('set-features')} />
          ) : null}
          <QuickTiles
            title={ui.pinnedTitle}
            variant="pinned"
            links={pinnedTiles}
            onReorder={(pinnedOrder) => raw && persist({ ...raw, pinnedOrder })}
            counts={counts}
            health={health}
            favicons={ui.favicons}
            faviconProvider={ui.faviconProvider}
            onOpen={(l) => track(l.id)}
            onContext={menus.linkMenu}
          />

          <QuickTiles
            title={ui.tilesTitle}
            variant="used"
            links={usedTiles}
            counts={counts}
            health={health}
            favicons={ui.favicons}
            faviconProvider={ui.faviconProvider}
            onOpen={(l) => track(l.id)}
            onContext={menus.linkMenu}
          />

          {cfg.sidebar.length > 0 ? (
            <div className="side-row" style={{ ['--side-w' as string]: `${ui.sidebarWidth}px` }}>
              {cfg.sidebar.map((s) => (
                <Section key={s.key} section={s} ctx={ctx} />
              ))}
            </div>
          ) : null}

          <div className="board" style={{ ['--rail-w' as string]: `${ui.railWidth}px` }}>
            {cfg.sections.map((s) => (
              <Section key={s.key} section={s} ctx={ctx} />
            ))}
            {cfg.sections.length ? null : (
              <button className="btn board-empty" onClick={newGroup}>
                ＋ Créer une catégorie de liens
              </button>
            )}
          </div>
          {/* Catégories masquées (clic droit → Masquer) : sans ce rappel, elles
              étaient perdues de vue pour de bon (issue #57). */}
          {hiddenGroups.length ? (
            <button
              className="board-hidden"
              onClick={(e) =>
                menus.openMenu({
                  x: e.clientX,
                  y: e.clientY,
                  title: 'Catégories masquées',
                  items: [
                    ...hiddenGroups.map((g) => ({
                      icon: g.icon || '👁',
                      label: `Afficher « ${g.name} »`,
                      hint: `${g.links.length} lien${g.links.length > 1 ? 's' : ''}`,
                      onSelect: () => raw && persist(updateGroup(raw, g.name, { hidden: undefined })),
                    })),
                    ...(hiddenGroups.length > 1
                      ? [{
                          icon: '👁',
                          label: 'Tout afficher',
                          onSelect: () =>
                            raw && persist(hiddenGroups.reduce((c, g) => updateGroup(c, g.name, { hidden: undefined }), raw)),
                        }]
                      : []),
                  ],
                })
              }
            >
              {hiddenGroups.length} catégorie{hiddenGroups.length > 1 ? 's' : ''} masquée{hiddenGroups.length > 1 ? 's' : ''} — afficher
            </button>
          ) : null}
        </>
      )}

      {/* Les raccourcis qu'il rappelle (recherche, clic droit sur un lien) ne valent
          que sur Raccourcis : sous un site ou dans Local, il trompait (issue #58). */}
      {ui.showFooter && view === 'links' ? <Footer count={links.length} /> : null}

      <ContextMenu state={menus.menu} onClose={menus.closeMenu} />
      <ConfirmHost />
      <NameColorHost />
      <IssueHost />
      <TrIssueHost />
      {adding ? (
        <AddTabDialog
          folders={tabFolders}
          sessions={desktop && hasSessions ? tabSessions : []}
          onClose={() => setAdding(false)}
          onMore={(t) => {
            if (!t) return addTabInSettings()
            const id = newTabId(allTabs.map((x) => x.id))
            saveTabs([...customTabs, { ...t, id }])
            setAdding(false)
            openTabSettings(id)
          }}
          onAdd={(t) => {
            const id = newTabId(allTabs.map((x) => x.id))
            const folderSession = tabFolders.find((f) => f.id === t.folder)?.session
            saveTabs([...customTabs, { ...t, id, ...(t.session || !folderSession ? {} : { session: folderSession }) }])
            setAdding(false)
            search.setQuery('')
            if (t.embed) selectTab(`x:${id}`)
          }}
        />
      ) : null}
      {reloaded ? <div className="toast toast-saved">↻ homedash rechargé</div> : null}
      {notice ? <div className="toast toast-saved">{notice}</div> : null}
      {copiedKey?.startsWith('tab:') ? <div className="toast toast-saved">⧉ Lien copié</div> : null}
      <UpdateProgress />
      {/* Sur l'accueil seulement : par-dessus un site, elle cachait la page (issue #44). */}
      {view === 'links' ? <DockHint /> : null}
      {menus.draft ? (
        <EditDialog
          draft={menus.draft}
          groups={cfg.groups}
          infoGroups={cfg.infos?.groups ?? []}
          onSave={menus.saveDraft} onClose={menus.closeDraft} />
      ) : null}

      <SaveToast state={saveState} onClose={() => setSaveState({ kind: 'idle' })} />
    </div>
  )
}

/** Témoin d'enregistrement des réglages, en bas à droite. */
function SaveToast({ state, onClose }: { state: SaveState; onClose: () => void }) {
  if (state.kind === 'error') {
    return (
      <div className="toast toast-error">
        ⚠ {state.message}
        <button className="toast-close" onClick={onClose}>
          ×
        </button>
      </div>
    )
  }
  if (state.kind === 'idle') return null
  return (
    <div className={`toast toast-${state.kind}`}>
      {state.kind === 'saving' ? 'enregistrement…' : '✓ Enregistré'}
    </div>
  )
}

/**
 * Réglages de mise en page (Réglages → Affichage) traduits en variables CSS.
 * Largeur en % de l'écran ; colonnes à 0 = automatiques.
 */
function layoutVars(ui: UiConfig): React.CSSProperties {
  const auto = `repeat(auto-fill, minmax(min(${ui.cardWidth}px, 100%), 1fr))`
  return {
    ['--link-w' as string]: `${ui.linkWidth}px`,
    ['--page-max' as string]: `${ui.pageWidth}%`,
    ['--cards-cols' as string]: ui.cardColumns > 0 ? `repeat(${ui.cardColumns}, minmax(0, 1fr))` : auto,
  }
}
