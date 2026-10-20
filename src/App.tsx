import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ConfirmHost from './components/ConfirmHost'
import ContextMenu, { type MenuItem } from './components/ContextMenu'
import EditDialog from './components/EditDialog'
import BasecampBell from './components/BasecampBell'
import BasecampView from './components/BasecampView'
import CustomTabView from './components/CustomTabView'
import SiteIcon from './components/SiteIcon'
import NameColorHost, { askNameColor } from './components/NameColorHost'
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
  moveTab,
  newFolderId,
  newSessionId,
  newTabId,
  sessionOf,
  srcOf,
  tabKey,
} from './lib/customTabs'
import { desktop, hasSessions, OPEN_IN_TAB, RELOAD_TAB, type GuestMenu, type OpenInTab } from './lib/desktop'
import { useGithub } from './lib/ghboard'
import { useHealth } from './lib/health'
import { useLocal } from './lib/local'
import { loadNotes, type Note } from './lib/notes'
import { useChangelog } from './lib/changelog'
import { setUnread } from './lib/notifications'
import { NEW_TAB_EVENT, presetNewTab, presetSettingsSection } from './lib/settingsNav'
import type { CustomTab, FlatLink, UiConfig } from './types'

const RAIL_KEY = 'homedash:rail'

export default function App() {
  const { raw, cfg, error, saveState, setSaveState, persist, reload } = useConfigState()
  const [notes, setNotes] = useState<Note[]>([])
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const gh = useGithub()
  const customTabs = useMemo(() => raw?.tabs ?? [], [raw])
  // Onglets éphémères (lien ouvert au clic droit) : dans la barre jusqu'à leur
  // fermeture ou au rechargement ; jamais dans la config, sauf « Garder ».
  const [temps, setTemps] = useState<CustomTab[]>([])
  const allTabs = useMemo(() => [...customTabs, ...temps], [customTabs, temps])
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
    return () => {
      delete w.__homedashRoute
      delete w.__homedashMenu
    }
  }, [])
  const tabFolders = useMemo(() => raw?.tabFolders ?? [], [raw])
  const tabSessions = useMemo(() => raw?.tabSessions ?? [], [raw])
  const { tab, selectTab, goBack } = useTabs(cfg?.title, customTabs)
  // ⇧⌘R (appli de bureau) : le site ouvert, ou homedash sur un onglet natif.
  const tabRef = useRef(tab)
  tabRef.current = tab
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
    const t = window.setTimeout(() => setReloaded(false), 1800)
    return () => window.clearTimeout(t)
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
      return v === 'wide' || v === 'icons' || v === 'hidden' ? v : 'icons'
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
    const w = !railOn ? '0px' : railMode === 'wide' ? '200px' : '68px'
    document.documentElement.style.setProperty('--rail-w', w)
  }, [railOn, railMode])
  // Onglets perso affichés dans la page : montés à la première visite puis
  // seulement masqués, pour ne pas recharger le site à chaque aller-retour.
  const [visited, setVisited] = useState<string[]>([])
  // Non-lus lus dans le titre de chaque onglet perso (appli de bureau seulement).
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({})
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
  // Icône du Dock (appli de bureau) : non-lus des onglets perso + ceux de la cloche.
  const tabUnread = allTabs.reduce((sum, t) => sum + (t.embed ? (tabCounts[tabKey(t)] ?? 0) : 0), 0)
  useEffect(() => desktop?.setBadge(tabUnread + events.unseen), [tabUnread, events.unseen])
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
  const menus = useContextMenus(raw, persist, copy)
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
  })

  // --- rendu ---------------------------------------------------------------
  if (error) {
    return (
      <div className="app">
        <div className="card fatal">
          <h1>config.json illisible</h1>
          <p>{error}</p>
          <p className="muted">
            Vérifie la validité du JSON (virgule en trop, guillemet manquant) et le montage du volume
            dans <code>docker-compose.yml</code>.
          </p>
        </div>
      </div>
    )
  }

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
  const bcHidden = raw?.basecamp?.hidden ?? []
  const bcLate = lateCount(bc.data, bcHidden)
  // GitHub et Local : le même code, en ligne et sur le disque. Côte à côte dans
  // un seul bloc (« duo »), chacun garde son clic.
  const code = { id: 'code', title: 'Ton code : en ligne (GitHub) et sur ton disque (Local)' }
  // Emoji choisi, sinon l'icône du site, recadrée pour que toutes aient la même échelle.
  const iconOf: Record<string, React.ReactNode> = Object.fromEntries(
    allTabs.map((t) => [
      t.id,
      t.icon ? (
        t.icon
      ) : isLocal(t.url) ? (
        '📄'
      ) : (
        <SiteIcon url={t.url} name={t.label} enabled={ui.favicons} />
      ),
    ]),
  )
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
  const tabMenu = (e: React.MouseEvent, t: (typeof customTabs)[number]) => {
    const here = folderOf(t, tabFolders)
    const mine = sessionOf(t, tabSessions)
    const setSession = (session?: string) =>
      saveTabs(customTabs.map((x) => (x.id === t.id ? { ...x, session } : x)))
    menus.openMenu({
      x: e.clientX,
      y: e.clientY,
      title: t.label,
      items: [
        {
          label: 'Ouvrir dans le navigateur ↗',
          onSelect: () =>
            desktop
              ? desktop.openExternal(new URL(srcOf(t.url), window.location.href).href)
              : window.open(srcOf(t.url), '_blank', 'noopener'),
        },
        { label: 'Recharger', hint: desktop ? '⇧⌘R' : undefined, onSelect: () => window.dispatchEvent(new CustomEvent(RELOAD_TAB, { detail: tabKey(t) })) },
        { sep: true },
        ...tabFolders
          .filter((f) => f.id !== here)
          .map((f) => ({ label: `Mettre dans ${f.icon ?? '📁'} ${f.name}`, onSelect: () => saveTabs(moveTab(customTabs, t.id, null, f.id)) })),
        ...(here ? [{ label: 'Sortir du dossier', onSelect: () => saveTabs(moveTab(customTabs, t.id, null)) }] : []),
        { label: 'Nouveau dossier avec cet onglet…', onSelect: () => void newFolder([t.id]) },
        // Comptes : seulement là où ils ont un effet (appli de bureau récente).
        ...(hasSessions && t.embed && !isLocal(t.url)
          ? [
              { sep: true as const },
              { label: `${mine ? '' : '✓ '}Compte commun`, onSelect: () => setSession(undefined) },
              ...tabSessions.map((x) => ({
                label: `${mine?.id === x.id ? '✓ ' : ''}Compte ${x.name}`,
                onSelect: () => setSession(x.id),
              })),
              { label: 'Nouveau compte…', hint: 'connexion à part', onSelect: () => void newSession(t.id) },
            ]
          : []),
        { sep: true },
        { label: 'Modifier…', hint: 'nom, adresse', onSelect: openTabSettings },
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
          label: 'Nom et couleur…',
          onSelect: async () => {
            const r = await askNameColor({ title: 'Dossier', name: f.name, color: f.color, okLabel: 'Enregistrer' })
            if (r) saveTabs(customTabs, tabFolders.map((x) => (x.id === f.id ? { ...x, name: r.name, color: r.color } : x)))
          },
        },
        {
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
    search.setQuery('')
    selectTab(`x:${id}`)
  }
  /** ⧉ de la barre : un onglet éphémère vierge (Google), avec le compte choisi s'il y en a. */
  const newTemp = (e: React.MouseEvent) => {
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
  const closeTemp = (t: CustomTab) => {
    setTemps((ts) => ts.filter((x) => x.id !== t.id))
    if (tab === tabKey(t)) selectTab(lastNative.current)
  }
  const tempMenu = (e: React.MouseEvent, t: CustomTab) =>
    menus.openMenu({
      x: e.clientX,
      y: e.clientY,
      title: `${t.label} · éphémère`,
      items: [
        {
          label: 'Garder dans mes onglets',
          hint: 'ajouté à la barre',
          onSelect: () => {
            const id = newTabId(allTabs.map((x) => x.id))
            saveTabs([...customTabs, { ...t, id }])
            setTemps((ts) => ts.filter((x) => x.id !== t.id))
            selectTab(`x:${id}`)
          },
        },
        { label: 'Ouvrir dans le navigateur ↗', onSelect: () => desktop?.openExternal(t.url) },
        { sep: true },
        { label: 'Fermer', onSelect: () => closeTemp(t) },
      ],
    })
  /** Lien « nouvel onglet » d'un site (main.js) : un onglet perso de ce site, sinon false → navigateur. */
  const route = (url: string, fromId: number): boolean => {
    const target = linkTarget(url, customTabs, fromGuest(fromId))
    if (!target) return false
    openInTab(target, url)
    return true
  }
  /** Clic droit dans un site (main.js) : le menu de homedash, selon ce qui est sous la souris. */
  const guestMenu = (m: GuestMenu): boolean => {
    const act = desktop?.guestAction
    if (!act) return false
    const items: MenuItem[] = []
    const sep = () => items.length && items.push({ sep: true })
    if (m.link) {
      for (const t of customTabs.filter((x) => capturesLink(x, m.link))) {
        const s = sessionOf(t, tabSessions)
        items.push({ label: `Ouvrir dans ${t.label}${s ? ` (${s.name})` : ''}`, onSelect: () => openInTab(t, m.link) })
      }
      items.push({ label: 'Ouvrir dans un onglet éphémère', onSelect: () => openTemp(m.link) })
      if (hasSessions)
        for (const s of tabSessions)
          items.push({ label: `Onglet éphémère · compte ${s.name}`, onSelect: () => openTemp(m.link, s.id) })
      items.push({ label: 'Ouvrir dans le navigateur ↗', onSelect: () => desktop?.openExternal(m.link) })
      items.push({ label: 'Copier le lien', onSelect: () => act(m.id, 'copyText', { text: m.link }) })
    }
    if (m.image) {
      sep()
      items.push({ label: "Copier l'image", onSelect: () => act(m.id, 'copyImage', { x: m.x, y: m.y }) })
      items.push({ label: "Ouvrir l'image dans le navigateur ↗", onSelect: () => desktop?.openExternal(m.image) })
    }
    if (m.editable) {
      sep()
      items.push({ label: 'Couper', hint: '⌘X', disabled: !m.text, onSelect: () => act(m.id, 'cut') })
      items.push({ label: 'Copier', hint: '⌘C', disabled: !m.text, onSelect: () => act(m.id, 'copy') })
      items.push({ label: 'Coller', hint: '⌘V', onSelect: () => act(m.id, 'paste') })
      items.push({ label: 'Tout sélectionner', hint: '⌘A', onSelect: () => act(m.id, 'selectAll') })
    } else if (m.text) {
      sep()
      items.push({ label: 'Copier', hint: '⌘C', onSelect: () => act(m.id, 'copy') })
      const q = m.text.trim().slice(0, 200)
      items.push({
        label: `Rechercher « ${q.length > 30 ? q.slice(0, 30) + '…' : q} »`,
        hint: 'onglet éphémère',
        onSelect: () => openTemp(`https://www.google.com/search?q=${encodeURIComponent(q)}`),
      })
    }
    if (!items.length) {
      items.push({ label: 'Précédent', disabled: !m.canBack, onSelect: () => act(m.id, 'back') })
      items.push({ label: 'Suivant', disabled: !m.canForward, onSelect: () => act(m.id, 'forward') })
      items.push({ label: 'Recharger', hint: '⇧⌘R', onSelect: () => act(m.id, 'reload') })
    }
    const from = fromGuest(m.id)
    // x / y d'Electron : déjà dans la fenêtre (pas dans la webview).
    menus.openMenu({
      x: m.x,
      y: m.y,
      title: m.link ? hostOf(m.link) : from?.label,
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
        badge: t.embed ? tabCounts[tabKey(t)] : 0,
        badgeTitle: `${tabCounts[tabKey(t)] ?? 0} non lu(s) d'après la page`,
        badgeAlert: true,
        session: t.embed ? sessionOf(t, tabSessions) : undefined,
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
  const openTabSettings = () => {
    search.setQuery('')
    presetSettingsSection('set-tabs')
    selectTab('settings')
  }

  return (
    <div className={`app${railOn && shown.startsWith('x:') ? ' is-site' : ''}`} style={layoutVars(ui)}>
      <TopBar
        title={cfg.title}
        subtitle={cfg.subtitle}
        query={search.query}
        onQuery={search.setQuery}
        placeholder={ui.searchPlaceholder}
        showClock={ui.showClock}
        theme={effectiveTheme}
        onTheme={switchTheme}
        searchRef={searchRef}
        resultCount={searching ? search.hits.length : null}
        hasChecks={hasChecks}
        onRefresh={refresh}
        onAddGroup={menus.newGroup}
        version={
          <VersionMenu data={changelog.data} busy={changelog.busy} onCheck={() => void changelog.check()} />
        }
        bell={
          // Le journal n'est plus un onglet : une cloche qu'on consulte sans
          // quitter ce qu'on fait. « Tout voir » ouvre l'historique complet.
          // Basecamp a la sienne : ses non-lus sont ceux de Basecamp, pas du journal.
          <>
            {bc.data?.enabled ? <BasecampBell data={bc.data} onOpenTab={() => selectTab('basecamp')} /> : null}
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
            />
          </>
        }
      />

      {railOn ? (
        <Rail
          tabs={customTabs}
          temps={temps}
          onTempMenu={tempMenu}
          onTempClose={closeTemp}
          onNewTemp={newTemp}
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
          onMode={changeRail}
          onAdd={() => {
            search.setQuery('')
            presetNewTab()
            // Réglages déjà ouvert : il bascule lui-même, sans perdre un brouillon.
            if (tab === 'settings') window.dispatchEvent(new Event(NEW_TAB_EVENT))
            else selectTab('settings')
          }}
          onTabs={(next) => saveTabs(next)}
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
        <Tabs tabs={tabs} active={shown} onSelect={selectTab} onAdd={railOn ? undefined : openTabSettings} />
      )}

      {allTabs
        // Dans l'appli, tous dès le départ : leurs pastilles arrivent sans les ouvrir.
        .filter((t) => t.embed && (desktop || visited.includes(tabKey(t))))
        .map((t) => (
          <CustomTabView
            // une webview ne change pas de session : autre compte = nouvelle webview
            // (éphémère : son adresse suit la navigation, sans recréer la webview)
            key={`${t.id}:${t.id.startsWith('tmp-') ? '' : t.url}:${sessionOf(t, tabSessions)?.id ?? ''}`}
            // compte supprimé = connexion commune
            tab={{ ...t, session: sessionOf(t, tabSessions)?.id }}
            session={sessionOf(t, tabSessions)}
            hidden={view !== tabKey(t)}
            onSettings={openTabSettings}
            onGuest={(id) => guestTab.current.set(id, t.id)}
            icon={iconOf[t.id]}
            onNavigate={
              t.id.startsWith('tmp-')
                ? (url) =>
                    setTemps((ts) =>
                      ts.map((x) => (x.id === t.id ? { ...x, url, label: hostOf(url).replace(/^www\./, '') || x.label } : x)),
                    )
                : undefined
            }
            onCount={(n) => setCount(tabKey(t), n)}
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
          </div>
        </>
      )}

      {ui.showFooter ? <Footer count={links.length} /> : null}

      <ContextMenu state={menus.menu} onClose={menus.closeMenu} />
      <ConfirmHost />
      <NameColorHost />
      {reloaded ? <div className="toast toast-saved">↻ homedash rechargé</div> : null}
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

/** Témoin d'écriture de config.json, en bas à droite. */
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
      {state.kind === 'saving' ? 'enregistrement…' : '✓ config.json enregistré'}
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
