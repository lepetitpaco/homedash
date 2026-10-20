import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ConfirmHost from './components/ConfirmHost'
import ContextMenu from './components/ContextMenu'
import EditDialog from './components/EditDialog'
import BasecampBell from './components/BasecampBell'
import BasecampView from './components/BasecampView'
import CustomTabView from './components/CustomTabView'
import Favicon from './components/Favicon'
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
import { isLocal, srcOf, tabKey } from './lib/customTabs'
import { desktop } from './lib/desktop'
import { useGithub } from './lib/ghboard'
import { useHealth } from './lib/health'
import { useLocal } from './lib/local'
import { loadNotes, type Note } from './lib/notes'
import { useChangelog } from './lib/changelog'
import { setUnread } from './lib/notifications'
import { presetSettingsSection } from './lib/settingsNav'
import type { FlatLink, UiConfig } from './types'

export default function App() {
  const { raw, cfg, error, saveState, setSaveState, persist, reload } = useConfigState()
  const [notes, setNotes] = useState<Note[]>([])
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const gh = useGithub()
  const customTabs = useMemo(() => raw?.tabs ?? [], [raw])
  const { tab, selectTab, goBack } = useTabs(cfg?.title, customTabs)
  // Onglets perso affichés dans la page : montés à la première visite puis
  // seulement masqués, pour ne pas recharger le site à chaque aller-retour.
  const [visited, setVisited] = useState<string[]>([])
  // Non-lus lus dans le titre de chaque onglet perso (appli de bureau seulement).
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({})
  // Icône affichée par chaque site, telle que la webview la voit (appli de bureau).
  const [tabIcons, setTabIcons] = useState<Record<string, string>>({})
  const setIcon = useCallback(
    (key: string, url: string) => setTabIcons((c) => (c[key] === url ? c : { ...c, [key]: url })),
    [],
  )
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
  const tabUnread = customTabs.reduce((sum, t) => sum + (t.embed ? (tabCounts[tabKey(t)] ?? 0) : 0), 0)
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
    // Onglets perso : un site ou un fichier du disque, affiché ici ou ouvert à part.
    ...customTabs.map(
      (t): Tab => ({
        id: tabKey(t),
        // Emoji choisi, sinon l'icône du site : celle qu'il affiche (appli de
        // bureau), ou celle du service de favicons (comme les liens).
        icon: t.icon ? (
          t.icon
        ) : isLocal(t.url) ? (
          '📄'
        ) : tabIcons[tabKey(t)] ? (
          <img className="favicon" src={tabIcons[tabKey(t)]} alt="" />
        ) : (
          <Favicon
            url={srcOf(t.url)}
            name={t.label}
            color={ui.defaultColor}
            enabled={ui.favicons}
            provider={ui.faviconProvider}
          />
        ),
        label: t.label,
        title: t.url,
        ...(t.embed ? {} : { href: srcOf(t.url) }),
        badge: t.embed ? tabCounts[tabKey(t)] : 0,
        badgeTitle: `${tabCounts[tabKey(t)] ?? 0} non lu(s) d'après la page`,
        badgeAlert: true,
      }),
    ),
    { id: 'settings', icon: '⚙', label: 'Réglages' },
  ]
  // Onglet perso supprimé (ou mémorisé d'une autre config) : retour aux raccourcis.
  const openCustom = customTabs.find((t) => tabKey(t) === tab && t.embed)
  const shown: TabId = tab.startsWith('x:') && !openCustom ? 'links' : tab
  // La recherche court-circuite les onglets : ses résultats valent partout.
  const view: TabId | 'search' = searching ? 'search' : shown
  const openTabSettings = () => {
    search.setQuery('')
    presetSettingsSection('set-tabs')
    selectTab('settings')
  }

  return (
    <div className="app" style={layoutVars(ui)}>
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

      <Tabs tabs={tabs} active={shown} onSelect={selectTab} onAdd={openTabSettings} />

      {customTabs
        // Dans l'appli, tous dès le départ : leurs pastilles arrivent sans les ouvrir.
        .filter((t) => t.embed && (desktop || visited.includes(tabKey(t))))
        .map((t) => (
          <CustomTabView
            key={`${t.id}:${t.url}`}
            tab={t}
            hidden={view !== tabKey(t)}
            onSettings={openTabSettings}
            onCount={(n) => setCount(tabKey(t), n)}
            onFavicon={(url) => setIcon(tabKey(t), url)}
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
