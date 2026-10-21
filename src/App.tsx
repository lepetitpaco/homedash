import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ConfirmHost from './components/ConfirmHost'
import ContextMenu, { type MenuItem } from './components/ContextMenu'
import EditDialog from './components/EditDialog'
import BasecampView from './components/BasecampView'
import CustomTabView from './components/CustomTabView'
import SiteIcon, { isImageIcon, setIconProvider } from './components/SiteIcon'
import NameColorHost, { askNameColor } from './components/NameColorHost'
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
import { useSearch } from './hooks/useSearch'
import { useTabs } from './hooks/useTabs'
import { useUsage } from './hooks/useUsage'
import { useEvents } from './lib/events'
import { lateCount, useBasecamp } from './lib/basecamp'
import {
  capturesLink,
  folderOf,
  hostOf,
  isLocal,
  linkTarget,
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
import { desktop, hasSessions, navKey, OPEN_IN_TAB, RELOAD_TAB, type GuestMenu, type OpenInTab, type WebviewEl } from './lib/desktop'
import { useGithub } from './lib/ghboard'
import { useHealth } from './lib/health'
import { useLocal } from './lib/local'
import { loadNotes, type Note } from './lib/notes'
import { useChangelog } from './lib/changelog'
import { setUnread } from './lib/notifications'
import { NEW_TAB_EVENT, presetEditTab, presetNewTab, presetSettingsSection, showSettingsSection } from './lib/settingsNav'
import type { CustomTab, FlatLink, UiConfig } from './types'
import type { Command } from './components/SearchResults'
import { clearVisits, recordVisit } from './lib/visits'
import { keys } from './lib/keys'
import { RECOUNT_TABS } from './lib/tabCount'

const RAIL_KEY = 'homedash:rail'
const RAIL_WIDTH: Record<RailMode, string> = { wide: '200px', icons: '68px', mini: '50px', hidden: '0px' }
/** Dernières pastilles des onglets perso, par `tabKey`. */
const TAB_COUNTS_KEY = 'homedash:tab-counts'

/** Éphémère, simple ou gardé : rangé en bas, son adresse suit la navigation. */
const isTemp = (t: CustomTab) => !!t.kept || t.id.startsWith('tmp-')

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
  // Adresse où est chaque onglet éphémère (gardé ou non), suivie pendant la navigation.
  const tempUrl = useRef(new Map<string, string>())

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
  const lastSeen = useRef(new Map<string, number>())
  const startedAt = useRef(Date.now())
  // Webview → onglet : de quel onglet vient un lien ou un clic droit (appli de bureau).
  const guestTab = useRef(new Map<number, string>())
  // main.js appelle ces deux fonctions (executeJavaScript) : liens et clic droit dans les sites.
  const routeRef = useRef<(url: string, fromId: number) => boolean>(() => false)
  const menuRef = useRef<(m: GuestMenu) => boolean>(() => false)
  useEffect(() => {
    if (!desktop) return
    const w = window as unknown as Record<string, unknown>
    w.__homedashRoute = (url: string, fromId: number) => routeRef.current(url, fromId)
    w.__homedashMenu = (m: GuestMenu) => menuRef.current(m)
    // Journal de performance (main.js) : nom et compte de l'onglet de chaque webview.
    w.__homedashTabs = () => {
      const out: Record<number, { label: string; account: string | null }> = {}
      for (const [id, tid] of guestTab.current) {
        const t = allTabsRef.current.find((x) => x.id === tid)
        if (t) out[id] = { label: t.label, account: sessionsRef.current.find((s) => s.id === t.session)?.name ?? null }
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
  const { tab, selectTab, goBack, stepTab } = useTabs(cfg?.title, customTabs)
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
  // site, sinon un éphémère. Renvoie `false` → le navigateur. Défini plus bas.
  const inAppRef = useRef<(url: string) => boolean>(() => false)
  const openLink = useCallback((url: string) => {
    if (!inAppRef.current(url)) window.open(url, '_blank', 'noopener')
  }, [])
  useEffect(() => {
    if (!desktop) return
    // Après React (phase de bulle) : un lien dont le clic a déjà été pris en charge est laissé.
    // `data-outside` : lien fait pour le navigateur (onglet « ouvrir à part », connexion…).
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target !== '_blank' || a.hasAttribute('data-outside') || !/^https?:/i.test(a.href)) return
      if (inAppRef.current(a.href)) e.preventDefault()
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
  // La barre n'existe que s'il y a des onglets perso à y mettre.
  const railOn = customTabs.length > 0 && railMode !== 'hidden'
  useEffect(() => {
    const w = !railOn ? '0px' : RAIL_WIDTH[railMode]
    document.documentElement.style.setProperty('--rail-w', w)
  }, [railOn, railMode])
  // Onglets perso affichés dans la page : montés à la première visite puis
  // seulement masqués, pour ne pas recharger le site à chaque aller-retour.
  const [visited, setVisited] = useState<string[]>([])
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
  const changelog = useChangelog()
  const events = useEvents(openLocal)
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
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now()
      const due = allTabsRef.current
        .filter((t) => t.sleep && t.embed && tabKey(t) !== tabRef.current)
        .map((t) => tabKey(t))
        .filter((k) => now - (lastSeen.current.get(k) ?? startedAt.current) > sleepMinutes * 60_000)
      if (!due.length) return
      setAsleep((a) => {
        const add = due.filter((k) => !a.includes(k))
        if (add.length)
          perfEvent('sleep', {
            tabs: allTabsRef.current.filter((t) => add.includes(tabKey(t))).map((t) => t.label),
          })
        return add.length ? [...a, ...add] : a
      })
    }, 30_000)
    return () => window.clearInterval(id)
  }, [sleepMinutes])

  // Icône du Dock (appli de bureau) : non-lus des onglets perso + ceux de la cloche.
  // (sauf les onglets aux notifications coupées)
  const tabUnread = allTabs.reduce(
    (sum, t) => sum + (t.embed && t.notify !== false ? (tabCounts[tabKey(t)] ?? 0) : 0),
    0,
  )
  // Ce qu'elle compte se règle dans Réglages → Affichage (issue #4).
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
  const searchTabs = useMemo(
    () => allTabs.map((t) => ({ tab: t, icon: () => iconRef.current[t.id] ?? '🌐' })),
    [allTabs],
  )
  const commands = useMemo<Command[]>(
    () => [
      { id: 'links', icon: '⚡', label: 'Raccourcis', keywords: 'accueil liens dashboard', run: () => selectTab('links') },
      { id: 'github', icon: '🐙', label: 'GitHub', keywords: 'prs branches', run: () => selectTab('github') },
      { id: 'local', icon: '💻', label: 'Local', keywords: 'dépôts disque branches', run: () => selectTab('local') },
      ...(bc.data?.configured
        ? [{ id: 'basecamp', icon: '🏕', label: 'Basecamp', keywords: 'tâches', run: () => selectTab('basecamp') }]
        : []),
      { id: 'events', icon: '🔔', label: 'Activité', keywords: 'journal cloche notifications', run: () => selectTab('events') },
      { id: 'settings', icon: '⚙', label: 'Réglages', keywords: 'options préférences config', run: () => selectTab('settings') },
      ...(desktop
        ? [
            {
              id: 'temp',
              icon: '⧉',
              label: 'Nouvel onglet éphémère',
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
    [selectTab, switchTheme, effectiveTheme, bc.data?.configured, newGroup],
  )
  const search = useSearch({
    cfg,
    links,
    notes,
    gh: gh.data?.enabled ? gh.data : null,
    local: local.data,
    searchRef,
    paused: !!menus.draft,
    track,
    copy,
    openNote: setOpenNoteId,
    openLocal,
    open: openLink,
    tabs: searchTabs,
    onTab: (t) => {
      search.setQuery('')
      selectTab(tabKey(t))
    },
    commands,
  })

  // --- rendu ---------------------------------------------------------------
  // Réglages pas chargés : serveur qui redémarre (réessai seul), fichier abîmé
  // (proposer la dernière sauvegarde), ou autre — jamais de jargon (LoadTrouble).
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
   * serveur relit GitHub, Basecamp et le disque ; les sites relisent leurs
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
        ...(t.embed
          ? [
              {
                icon: '↻',
                label: 'Recharger',
                hint: desktop ? keys('R', true) : undefined,
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
                  { label: 'commune', on: !mine, onSelect: () => mine && setSession(undefined) },
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
        ...(t.embed ? [notifyItem(t), muteItem(t), sleepItem(t)] : []),
        { icon: '✎', label: 'Modifier…', hint: 'nom, adresse', onSelect: () => openTabSettings(t.id) },
      ],
    })
  }
  const folderMenu = (e: React.MouseEvent, f: (typeof tabFolders)[number]) =>
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
        {
          icon: '✕',
          label: 'Supprimer le dossier',
          hint: 'ses onglets restent',
          onSelect: () =>
            saveTabs(
              customTabs.map((t) => (t.folder === f.id ? { ...t, folder: undefined } : t)),
              tabFolders.filter((x) => x.id !== f.id),
            ),
        },
      ],
    })
  // ── liens et clic droit dans les sites (appli de bureau) ─────────────────
  const fromGuest = (id: number) => allTabs.find((t) => t.id === guestTab.current.get(id))
  /** Ouvre `url` dans l'onglet perso `t` (et l'affiche). */
  const openInTab = (t: CustomTab, url: string) => {
    search.setQuery('')
    selectTab(tabKey(t))
    window.dispatchEvent(new CustomEvent<OpenInTab>(OPEN_IN_TAB, { detail: { key: tabKey(t), url } }))
  }
  /** Onglet éphémère sur `url`, avec ce compte (absent = connexion commune). */
  const openTemp = (url: string, session?: string) => {
    const id = `tmp-${newTabId(allTabs.map((t) => t.id)).slice(2)}`
    const label = hostOf(url).replace(/^www\./, '') || 'Onglet'
    setTemps((ts) => [...ts, { id, label, url, embed: true, session }])
    perfEvent('temp-open', { host: hostOf(url) })
    search.setQuery('')
    selectTab(`x:${id}`)
  }
  inAppRef.current = (url) => {
    if (!desktop || ui.openLinks === 'browser') return false
    // homedash lui-même (une autre page servie par le container) : le navigateur.
    if (new URL(url, window.location.href).host === window.location.host) return false
    const target = linkTarget(url, regularTabs)
    if (target) openInTab(target, url)
    else openTemp(url)
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
      title: 'Onglet éphémère',
      items: [
        { label: 'Connexion commune', onSelect: () => openTemp(start) },
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
        { icon: '＋', label: 'Ajouter un onglet', onSelect: addTab },
        { icon: '⧉', label: 'Nouvel onglet éphémère', onSelect: () => newTemp(at) },
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
  const closeTemp = (t: CustomTab) => {
    perfEvent('temp-close', { host: hostOf(t.url), kept: !!t.kept })
    if (t.kept) saveTabs(customTabs.filter((x) => x.id !== t.id))
    else setTemps((ts) => ts.filter((x) => x.id !== t.id))
    if (tab === tabKey(t)) selectTab(lastNative.current)
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
    saveTabs([...customTabs, { ...t, id, url, label, ...(kept ? { kept: true } : {}) }])
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
      title: `${t.label} · ${t.kept ? 'éphémère gardé' : 'éphémère'}`,
      items: [
        { icon: '↗', label: 'Ouvrir dans le navigateur', onSelect: () => openOutside(tempUrl.current.get(t.id) ?? t.url) },
        { heading: 'Garder' },
        ...(t.kept
          ? [
              { icon: '📌', label: 'Garder cette page', hint: 'rouvrira ici', onSelect: () => promoteTemp(t, true) },
              { icon: '◌', label: 'Ne plus garder', hint: 'disparaît au redémarrage', onSelect: () => unkeep(t) },
            ]
          : [{ icon: '📌', label: 'Garder ouvert', hint: 'survit au redémarrage', onSelect: () => promoteTemp(t, true) }]),
        { icon: '＋', label: 'Ajouter à mes onglets', onSelect: () => promoteTemp(t, false) },
        { heading: 'Onglet' },
        notifyItem(t),
        muteItem(t),
        sleepItem(t),
        { sep: true },
        { icon: '✕', label: 'Fermer', danger: !!t.kept, onSelect: () => closeTemp(t) },
      ],
    })
  /** Lien « nouvel onglet » d'un site (main.js) : un onglet perso de ce site, sinon false → navigateur. */
  const route = (url: string, fromId: number): boolean => {
    const from = fromGuest(fromId)
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
  const openChoices = (url: string): MenuItem[] => {
    const items: MenuItem[] = regularTabs
      .filter((x) => capturesLink(x, url))
      .map((t) => {
        const s = sessionOf(t, tabSessions)
        return {
          icon: iconOf[t.id],
          label: `Dans ${t.label}`,
          ...(s ? { dot: s.color, hint: s.name } : {}),
          onSelect: () => openInTab(t, url),
        }
      })
    // Onglet éphémère : une pastille par compte, sur une ligne.
    items.push(
      hasSessions && tabSessions.length
        ? {
            icon: '◌',
            label: 'Onglet éphémère',
            chips: [
              { label: 'commun', onSelect: () => openTemp(url) },
              ...tabSessions.map((s) => ({ label: s.name, color: s.color, onSelect: () => openTemp(url, s.id) })),
            ],
          }
        : { icon: '◌', label: 'Onglet éphémère', onSelect: () => openTemp(url) },
    )
    items.push({ icon: '↗', label: 'Dans le navigateur', onSelect: () => desktop?.openExternal(url) })
    return items
  }
  openItemsRef.current = (url) => (desktop ? openChoices(url) : [])
  linkMenuRef.current = (x, y, url) =>
    menus.openMenu({
      x,
      y,
      title: shortLink(url),
      items: [
        { heading: 'Ouvrir' },
        ...openChoices(url),
        { sep: true },
        { icon: '⧉', label: 'Copier le lien', onSelect: () => void copy(`ctx:${url}`, url) },
      ],
    })
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
        onSelect: () => openTemp(`https://www.google.com/search?q=${encodeURIComponent(q)}`),
      })
    }
    if (!items.length) {
      items.push({ icon: '←', label: 'Précédent', disabled: !m.canBack, onSelect: () => act(m.id, 'back') })
      items.push({ icon: '→', label: 'Suivant', disabled: !m.canForward, onSelect: () => act(m.id, 'forward') })
      items.push({ icon: '↻', label: 'Recharger', hint: keys('R', true), onSelect: () => act(m.id, 'reload') })
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
    ...(gh.data?.enabled || gh.data?.accounts?.some((a) => a.enabled)
      ? [{ id: 'github' as TabId, icon: '🐙', label: 'GitHub', group: code }]
      : []),
    // Toujours présent : le hook ne sonde que l'onglet ouvert, donc `local.data`
    // est nul tant qu'on n'a pas cliqué. La page explique elle-même son absence
    // de configuration, ce qu'un onglet manquant ne saurait pas faire.
    {
      id: 'local',
      icon: '💻',
      label: 'Local',
      badge: local.todo,
      badgeTitle: `${local.todo} branche(s) locale(s) mergée(s) qui traînent encore sur le disque`,
      group: code,
    },
    // Dès que l'appli Basecamp est renseignée : connecté ou pas, l'onglet dit quoi faire.
    ...(bc.data?.configured
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
    // Onglets perso : dans la barre de gauche, ou ici quand elle est cachée.
    ...(railOn ? [] : allTabs).map(
      (t): Tab => ({
        id: tabKey(t),
        icon: iconOf[t.id],
        label: t.label,
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
      }),
    ),
    // Avec la barre de gauche, Réglages est en bas de celle-ci (comme Discord).
    ...(railOn ? [] : [{ id: 'settings' as TabId, icon: '⚙', label: 'Réglages' }]),
  ]
  // Onglet perso supprimé (ou mémorisé d'une autre config) : retour aux raccourcis.
  const openCustom = allTabs.find((t) => tabKey(t) === tab && t.embed)
  const shown: TabId = tab.startsWith('x:') && !openCustom ? 'links' : tab
  // La recherche court-circuite les onglets : ses résultats valent partout.
  const view: TabId | 'search' = searching ? 'search' : shown
  /** Réglages → Onglets perso ; avec un id, l'éditeur de cet onglet déplié. */
  const openTabSettings = (id?: string) => {
    search.setQuery('')
    if (id) presetEditTab(id)
    else presetSettingsSection('set-tabs')
    selectTab('settings')
  }

  return (
    <div className={`app${railOn && shown.startsWith('x:') ? ' is-site' : ''}`} style={layoutVars(ui)}>
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
              onOpenLocal={openLocal}
              basecamp={bc.data}
              onOpenBasecamp={() => selectTab('basecamp')}
            />
          </>
        }
      />

      {railOn ? (
        <Rail
          tabs={regularTabs}
          temps={allTemps}
          asleep={asleep}
          audible={audible}
          muted={muted}
          onToggleMute={toggleMute}
          onTempMenu={tempMenu}
          onTempClose={closeTemp}
          folders={tabFolders}
          sessions={tabSessions}
          active={shown.startsWith('x:') || shown === 'settings' ? shown : null}
          mode={railMode}
          icons={iconOf}
          counts={tabCounts}
          onHome={() => {
            search.setQuery('')
            selectTab(lastNative.current)
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
          onTabs={(next) => saveTabs([...next, ...keptTabs])}
          onMerge={(dragged, target) => void newFolder([target.id, dragged.id])}
          onTabMenu={tabMenu}
          onFolderMenu={folderMenu}
        />
      ) : customTabs.length ? (
        <button
          className={`rail-reopen${tabUnread ? ' has-unread' : ''}`}
          onClick={() => changeRail('icons')}
          title={tabUnread ? `Afficher la barre de gauche · ${tabUnread} non lu(s)` : 'Afficher la barre de gauche'}
        >
          »{tabUnread ? <span className="rail-reopen-badge">{tabUnread > 99 ? '99+' : tabUnread}</span> : null}
        </button>
      ) : null}

      {/* Barre de gauche affichée : un site ou Réglages a la page pour lui, comme un
          serveur Discord ; la barre d'onglets de homedash revient avec ⚡. */}
      {railOn && (shown.startsWith('x:') || shown === 'settings') ? null : (
        <Tabs
          tabs={tabs}
          active={shown}
          onSelect={selectTab}
          onAdd={railOn ? undefined : () => openTabSettings()}
          onNewTemp={railOn || !desktop ? undefined : newTemp}
          onMove={(id, before) => {
            const d = customTabs.find((t) => tabKey(t) === id)
            const b = customTabs.find((t) => tabKey(t) === before)
            if (d && b) saveTabs(moveTab(customTabs, d.id, b.id, d.folder))
          }}
        />
      )}

      {allTabs
        // Dans l'appli, tous dès le départ : leurs pastilles arrivent sans les ouvrir.
        // En veille : démontés (mémoire rendue), remontés au clic.
        // Montés : ceux déjà ouverts, et dans l'appli ceux dont on suit les non-lus
        // (`preloads`) ; chaque site chargé coûte 100 à 400 Mo de mémoire.
        .filter(
          (t) => t.embed && (visited.includes(tabKey(t)) || (desktop && preloads(t))) && !asleep.includes(tabKey(t)),
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
            onGuest={(id) => guestTab.current.set(id, t.id)}
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
            onVisit={(url, title) => recordVisit(url, t.label, title)}
            onCount={(n) => setCount(tabKey(t), n)}
            onLoaded={(ms) => perfEvent('load', { tab: t.label, host: hostOf(t.url), ms })}
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
        />
      ) : view === 'events' ? (
        <EventFeed
          events={events.events}
          error={events.error}
          seen={events.seen}
          onClear={events.clear}
          onOpenLocal={openLocal}
          onClose={goBack}
        />
      ) : view === 'basecamp' ? (
        <BasecampView
          data={bc.data}
          error={bc.error}
          hidden={bcHidden}
          onHidden={(hidden) => raw && persist({ ...raw, basecamp: { ...raw.basecamp, hidden } })}
          onRefresh={bc.refresh}
          onSettings={() => {
            presetSettingsSection('set-basecamp')
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
            presetSettingsSection('set-account')
            selectTab('settings')
          }}
        />
      ) : view.startsWith('x:') ? null : (
        <>
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
        </>
      )}

      {ui.showFooter ? <Footer count={links.length} /> : null}

      <ContextMenu state={menus.menu} onClose={menus.closeMenu} />
      <ConfirmHost />
      <NameColorHost />
      {adding ? (
        <AddTabDialog
          folders={tabFolders}
          sessions={desktop && hasSessions ? tabSessions : []}
          onClose={() => setAdding(false)}
          onMore={addTabInSettings}
          onAdd={(t) => {
            const id = newTabId(allTabs.map((x) => x.id))
            saveTabs([...customTabs, { ...t, id }])
            setAdding(false)
            search.setQuery('')
            if (t.embed) selectTab(`x:${id}`)
          }}
        />
      ) : null}
      {reloaded ? <div className="toast toast-saved">↻ homedash rechargé</div> : null}
      <UpdateProgress />
      <DockHint />
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
