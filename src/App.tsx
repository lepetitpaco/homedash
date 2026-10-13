import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ConfirmHost from './components/ConfirmHost'
import ContextMenu from './components/ContextMenu'
import EditDialog from './components/EditDialog'
import EventBell from './components/EventBell'
import EventFeed from './components/EventFeed'
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
import { useGithub } from './lib/ghboard'
import { useHealth } from './lib/health'
import { useLocal } from './lib/local'
import { loadNotes, type Note } from './lib/notes'
import { setUnread } from './lib/notifications'
import type { FlatLink } from './types'

export default function App() {
  const { raw, cfg, error, saveState, setSaveState, persist, reload } = useConfigState()
  const [notes, setNotes] = useState<Note[]>([])
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const gh = useGithub()
  const { tab, selectTab, goBack } = useTabs(cfg?.title)
  const openLocal = useCallback(() => selectTab('local'), [selectTab])
  // Sonde en continu, onglet ouvert ou non : c'est ce qui alimente la pastille de
  // l'onglet et le rappel dans la barre GitHub. Le rappel de ménage lui-même est
  // devenu un événement du journal, écrit par le serveur.
  const local = useLocal(tab === 'local')
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
  )
  const menus = useContextMenus(raw, persist, copy)
  const search = useSearch({
    cfg,
    links,
    notes,
    searchRef,
    paused: !!menus.draft,
    track,
    copy,
    openNote: setOpenNoteId,
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
  }
  const searching = search.query.trim().length > 0
  const hasChecks = links.some((l) => l.check) && ui.healthcheckInterval > 0
  const tabs: Tab[] = [
    { id: 'links', icon: '⚡', label: 'Raccourcis' },
    // L'onglet existe dès qu'un compte est branché, même si le compte affiché ne l'est pas.
    ...(gh.data?.enabled || gh.data?.accounts?.some((a) => a.enabled)
      ? [{ id: 'github' as TabId, icon: '🐙', label: 'GitHub' }]
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
    },
    { id: 'settings', icon: '⚙', label: 'Réglages' },
  ]
  // La recherche court-circuite les onglets : ses résultats valent partout.
  const view: TabId | 'search' = searching ? 'search' : tab

  return (
    <div className="app" style={{ ['--link-w' as string]: `${ui.linkWidth}px` }}>
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
        bell={
          // Le journal n'est plus un onglet : une cloche qu'on consulte sans
          // quitter ce qu'on fait. « Tout voir » ouvre l'historique complet.
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
            onOpenLocal={openLocal}
          />
        }
      />

      <Tabs tabs={tabs} active={tab} onSelect={selectTab} />

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
      ) : view === 'local' ? (
        <LocalRepos
          data={local.data}
          error={local.error}
          busy={local.busy}
          onRefresh={local.refresh}
          onSettings={() => selectTab('settings')}
        />
      ) : view === 'settings' ? (
        <SettingsPage config={raw} onSave={persist} onReload={reload} saving={saveState.kind === 'saving'} />
      ) : view === 'github' ? (
        <GithubView ctx={ctx} onSettings={() => selectTab('settings')} />
      ) : (
        <>
          <QuickTiles
            title={ui.pinnedTitle}
            variant="pinned"
            links={pinnedTiles}
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

      {ui.showFooter ? (
        <footer className="footer">
          <span>
            <kbd>/</kbd> ou <kbd>⌘K</kbd> rechercher
          </span>
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> naviguer
          </span>
          <span>
            <kbd>↵</kbd> ouvrir / copier
          </span>
          <span>clic droit : modifier</span>
          <span className="footer-right">{links.length} liens</span>
        </footer>
      ) : null}

      <ContextMenu state={menus.menu} onClose={menus.closeMenu} />
      <ConfirmHost />
      {menus.draft ? (
        <EditDialog draft={menus.draft} groups={cfg.groups} onSave={menus.saveDraft} onClose={menus.closeDraft} />
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
