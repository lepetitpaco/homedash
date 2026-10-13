import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ContextMenu, { type MenuItem, type MenuState } from './components/ContextMenu'
import EventBell from './components/EventBell'
import EventFeed from './components/EventFeed'
import GhBranches from './components/GhBranches'
import GhMerged from './components/GhMerged'
import GhPrs from './components/GhPrs'
import GhRenovate from './components/GhRenovate'
import GhToolbar, { AccountSwitch } from './components/GhToolbar'
import LocalRepos from './components/LocalRepos'
import EditDialog, { type Draft } from './components/EditDialog'
import GroupCard from './components/GroupCard'
import InfoPanel from './components/InfoPanel'
import Notes from './components/Notes'
import QuickTiles from './components/QuickTiles'
import RepoCard from './components/RepoCard'
import SearchResults, { type Hit } from './components/SearchResults'
import SettingsPage from './components/SettingsPage'
import Stats from './components/Stats'
import Tabs, { type Tab, type TabId } from './components/Tabs'
import TopBar from './components/TopBar'
import { fetchConfig, saveConfig } from './lib/api'
import { normalizeConfig } from './lib/config'
import { useHealth } from './lib/health'
import {
  addGroup,
  addLink,
  duplicateLink,
  moveGroup,
  moveLink,
  removeGroup,
  removeLink,
  toggleLinkFlag,
  updateGroup,
  updateLink,
  type LinkRef,
} from './lib/mutate'
import { loadNotes, type Note } from './lib/notes'
import { useEvents } from './lib/events'
import { useGithub } from './lib/ghboard'
import { useLocal } from './lib/local'
import { initTitleCounter, setUnread } from './lib/notifications'
import { rank } from './lib/search'
import { bump, clear as clearUsage, load as loadUsage, topIds, type Usage } from './lib/usage'
import type { Config, FlatLink, Link } from './types'
import ConfirmHost, { confirmDialog } from './components/ConfirmHost'

const COLLAPSE_KEY = 'homedash:collapsed'
const THEME_KEY = 'homedash:theme'
const TAB_KEY = 'homedash:tab'

type Theme = 'dark' | 'light'
type SaveState = { kind: 'idle' | 'saving' | 'saved' } | { kind: 'error'; message: string }

export default function App() {
  const [raw, setRaw] = useState<Config | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' })
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const [usage, setUsage] = useState<Usage>({})
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [theme, setTheme] = useState<Theme | null>(null)
  const [tab, setTab] = useState<TabId>('links')
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const cfg = useMemo(() => (raw ? normalizeConfig(raw) : null), [raw])
  const gh = useGithub()

  // Onglet d'où l'on vient, pour que « fermer » l'historique y ramène :
  // l'historique n'a plus d'onglet à lui dans la barre.
  const backTab = useRef<TabId>('links')
  const tabNow = useRef(tab)
  tabNow.current = tab
  const selectTab = useCallback((id: TabId) => {
    if (tabNow.current !== 'events') backTab.current = tabNow.current
    setTab(id)
    // L'historique ne se rouvre pas au rechargement : il n'a pas d'onglet.
    if (id === 'events') return
    try {
      localStorage.setItem(TAB_KEY, id)
    } catch {
      /* stockage indisponible */
    }
  }, [])

  const openLocal = useCallback(() => selectTab('local'), [selectTab])
  // Sonde en continu, onglet ouvert ou non : c'est ce qui alimente la pastille de
  // l'onglet et le rappel dans la barre GitHub. Le rappel de ménage lui-même est
  // devenu un événement du journal, écrit par le serveur.
  const local = useLocal(tab === 'local')
  const events = useEvents(openLocal)

  // --- chargement initial ---------------------------------------------------
  useEffect(() => {
    fetchConfig()
      .then(setRaw)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))

    // notes et compteurs vivent maintenant côté serveur (data/*.json)
    void loadNotes().then(setNotes)
    void loadUsage().then(setUsage)
    try {
      setCollapsed(JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '{}') as Record<string, boolean>)
      const saved = localStorage.getItem(THEME_KEY)
      if (saved === 'light' || saved === 'dark') setTheme(saved)
      const savedTab = localStorage.getItem(TAB_KEY)
      if (
        savedTab === 'links' ||
        savedTab === 'github' ||
        savedTab === 'local' ||
        savedTab === 'settings'
      )
        setTab(savedTab)
    } catch {
      /* stockage indisponible */
    }
  }, [])

  // Le thème du config.json ne s'applique que si l'utilisateur n'a rien choisi.
  const effectiveTheme: Theme = theme ?? cfg?.ui.theme ?? 'dark'

  useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme
  }, [effectiveTheme])

  // Le titre de l'onglet nomme la page ouverte : « GitHub · homedash » plutôt
  // qu'un « homedash » indifférencié dans la barre d'onglets et l'historique.
  useEffect(() => {
    if (!cfg?.title) return
    const label = {
      links: 'Raccourcis',
      github: 'GitHub',
      events: 'Activité',
      local: 'Local',
      settings: 'Réglages',
    }[tab]
    initTitleCounter(`${label} · ${cfg.title}`)
  }, [cfg?.title, tab])

  // Non-lus du journal dans le titre et l'icône de l'onglet du navigateur : même
  // compteur que la cloche, effacé quand on ouvre son panneau ou l'historique.
  const markEvents = events.markSeen
  useEffect(() => setUnread(events.unseen), [events.unseen])
  useEffect(() => {
    if (tab === 'events') markEvents()
  }, [tab, markEvents, events.unseen])

  // --- persistance ---------------------------------------------------------
  const persist = useCallback((next: Config) => {
    setRaw(next)
    setSaveState({ kind: 'saving' })
    saveConfig(next)
      .then(() => {
        setSaveState({ kind: 'saved' })
        window.setTimeout(() => setSaveState((s) => (s.kind === 'saved' ? { kind: 'idle' } : s)), 1600)
      })
      .catch((e: unknown) =>
        setSaveState({ kind: 'error', message: e instanceof Error ? e.message : String(e) }),
      )
  }, [])

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

  const infoItems = useMemo(() => {
    if (!cfg?.infos) return []
    return cfg.infos.groups.flatMap((group) =>
      group.items.map((item) => ({ group, item, key: `info:${group.title}/${item.label}` })),
    )
  }, [cfg])

  const { health, refresh } = useHealth(
    links,
    cfg?.ui.healthcheckInterval ?? 0,
    cfg?.ui.healthcheckTimeout ?? 4000,
  )

  const counts = useMemo(
    () => Object.fromEntries(Object.entries(usage).map(([id, u]) => [id, u.count])),
    [usage],
  )

  /** Rangée du haut : les liens explicitement épinglés, dans l'ordre du config. */
  const pinnedTiles = useMemo(
    () => (cfg?.ui.showTiles ? links.filter((l) => l.pinned) : []),
    [links, cfg],
  )

  /**
   * Rangée du bas : les liens les plus ouverts. Les épinglés en sont exclus,
   * ils ont déjà leur rangée au-dessus.
   */
  const usedTiles = useMemo(() => {
    if (!cfg?.ui.showTiles) return []
    return topIds(usage, cfg.ui.maxTiles + pinnedTiles.length)
      .map((id) => links.find((l) => l.id === id))
      .filter((l): l is FlatLink => !!l && !l.pinned)
      .slice(0, cfg.ui.maxTiles)
  }, [links, usage, cfg, pinnedTiles])

  // --- recherche unifiée ---------------------------------------------------
  const hits: Hit[] = useMemo(() => {
    const q = query.trim()
    if (!q) return []
    const linkHits: Hit[] = rank(
      links,
      (l) => [
        [l.name, 1],
        [l.note, 0.7],
        [l.group, 0.6],
        [l.tags, 0.5],
        [l.url, 0.35],
      ],
      q,
      25,
    ).map((link) => ({ kind: 'link', key: `link:${link.id}`, link }))

    const infoHits: Hit[] = rank(
      infoItems,
      ({ group, item }) => [
        [item.label, 1],
        [item.note, 0.7],
        [group.title, 0.8],
        [item.secret ? undefined : item.value, 0.5],
      ],
      q,
      10,
    ).map(({ group, item, key }) => ({ kind: 'info', key, group, item }))

    const noteHits: Hit[] = rank(notes, (n) => [[n.text, 1]], q, 8).map((note) => ({
      kind: 'note',
      key: `note:${note.id}`,
      note,
    }))

    return [...linkHits, ...infoHits, ...noteHits]
  }, [query, links, infoItems, notes])

  useEffect(() => setActiveIndex(0), [query])

  // --- actions -------------------------------------------------------------
  const track = useCallback((id: string) => {
    void bump(id).then((next) => {
      if (Object.keys(next).length > 0) setUsage(next)
    })
  }, [])

  const copy = useCallback(async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1400)
    } catch {
      /* presse-papier refusé (contexte non sécurisé) */
    }
  }, [])

  const activate = useCallback(
    (hit: Hit) => {
      if (hit.kind === 'link') {
        track(hit.link.id)
        return
      }
      if (hit.kind === 'info') {
        void copy(hit.key, hit.item.value)
        return
      }
      // une note se consulte : on l'ouvre dans l'éditeur et on quitte la recherche
      setOpenNoteId(hit.note.id)
      setQuery('')
    },
    [copy, track],
  )

  const resetUsage = useCallback(() => {
    void confirmDialog({
      title: "Remettre à zéro les compteurs d'ouverture ?",
      body: "La rangée « les plus utilisés » repartira de zéro. Les liens eux-mêmes ne bougent pas.",
      confirmLabel: 'Remettre à zéro',
      danger: true,
    }).then((ok) => {
      if (ok) void clearUsage().then(() => setUsage({}))
    })
  }, [])

  // Le pliage choisi dans le navigateur (localStorage) prime sur le `collapsed`
  // du config, qui ne sert que d'état initial.
  const toggleGroup = useCallback((name: string, current: boolean) => {
    setCollapsed((prev) => {
      const next = { ...prev, [name]: !current }
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const switchTheme = useCallback(() => {
    setTheme(() => {
      const next: Theme = effectiveTheme === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem(THEME_KEY, next)
      } catch {
        /* ignore */
      }
      return next
    })
  }, [effectiveTheme])

  // --- menus contextuels ---------------------------------------------------
  const linkMenu = useCallback(
    (e: React.MouseEvent, link: FlatLink) => {
      if (!raw) return
      e.preventDefault()
      // sans ça, l'événement remonte au conteneur de la catégorie dont le
      // handler écraserait ce menu par celui de la catégorie
      e.stopPropagation()
      const ref: LinkRef = { group: link.group, index: link.index }
      const groupSize = raw.groups.find((g) => g.name === link.group)?.links.length ?? 0
      const items: MenuItem[] = [
        {
          label: 'Modifier…',
          onSelect: () => setDraft({ kind: 'link', ref, group: link.group, values: { ...link } }),
        },
        {
          label: link.pinned ? 'Retirer des tuiles' : 'Épingler en tuile',
          onSelect: () => persist(toggleLinkFlag(raw, ref, 'pinned')),
        },
        {
          label: link.check ? 'Ne plus surveiller' : 'Surveiller (voyant)',
          onSelect: () => persist(toggleLinkFlag(raw, ref, 'check')),
        },
        { sep: true },
        { label: "Copier l'URL", onSelect: () => void copy(`ctx:${link.id}`, link.url) },
        { label: 'Dupliquer', onSelect: () => persist(duplicateLink(raw, ref)) },
        {
          label: 'Monter',
          disabled: link.index === 0,
          onSelect: () => persist(moveLink(raw, ref, -1)),
        },
        {
          label: 'Descendre',
          disabled: link.index >= groupSize - 1,
          onSelect: () => persist(moveLink(raw, ref, 1)),
        },
        { sep: true },
        {
          label: 'Supprimer',
          danger: true,
          onSelect: () => {
            void confirmDialog({
              title: `Supprimer « ${link.name} » ?`,
              body: [link.url, 'La version précédente reste dans config.prev.json et dans les sauvegardes.'],
              confirmLabel: 'Supprimer',
              danger: true,
            }).then((ok) => ok && persist(removeLink(raw, ref)))
          },
        },
      ]
      setMenu({ x: e.clientX, y: e.clientY, title: link.name, items })
    },
    [raw, persist, copy],
  )

  const groupMenu = useCallback(
    (e: React.MouseEvent, name: string) => {
      if (!raw) return
      e.preventDefault()
      const group = raw.groups.find((g) => g.name === name)
      if (!group) return
      const index = raw.groups.findIndex((g) => g.name === name)
      const items: MenuItem[] = [
        {
          label: 'Ajouter un lien…',
          onSelect: () =>
            setDraft({ kind: 'link', ref: null, group: name, values: { name: '', url: '' } }),
        },
        {
          label: 'Modifier la catégorie…',
          onSelect: () =>
            setDraft({
              kind: 'group',
              name,
              values: { name: group.name, icon: group.icon, color: group.color, hidden: group.hidden },
            }),
        },
        { sep: true },
        {
          label: 'Monter',
          disabled: index === 0,
          onSelect: () => persist(moveGroup(raw, name, -1)),
        },
        {
          label: 'Descendre',
          disabled: index >= raw.groups.length - 1,
          onSelect: () => persist(moveGroup(raw, name, 1)),
        },
        {
          label: 'Masquer',
          hint: 'gardée dans le JSON',
          onSelect: () => persist(updateGroup(raw, name, { hidden: true })),
        },
        { sep: true },
        {
          label: 'Nouvelle catégorie…',
          onSelect: () => setDraft({ kind: 'group', name: null, values: { name: '', icon: '📁' } }),
        },
        {
          label: 'Supprimer la catégorie',
          danger: true,
          onSelect: () => {
            void confirmDialog({
              title: `Supprimer la catégorie « ${name} » ?`,
              body: [
                `Ses ${group.links.length} lien(s) partent avec elle.`,
                'La version précédente reste dans config.prev.json et dans les sauvegardes.',
              ],
              confirmLabel: 'Supprimer la catégorie',
              danger: true,
            }).then((ok) => ok && persist(removeGroup(raw, name)))
          },
        },
      ]
      setMenu({ x: e.clientX, y: e.clientY, title: `${group.icon ?? ''} ${name}`.trim(), items })
    },
    [raw, persist],
  )

  const saveDraft = useCallback(
    (d: Draft) => {
      if (!raw) return
      if (d.kind === 'link') {
        persist(
          d.ref
            ? updateLink(raw, d.ref, cleanLink(d.values), d.group)
            : addLink(raw, d.group, cleanLink(d.values)),
        )
      } else {
        persist(
          d.name
            ? updateGroup(raw, d.name, d.values)
            : addGroup(raw, { ...d.values, links: [] }),
        )
      }
      setDraft(null)
    },
    [raw, persist],
  )

  // --- clavier -------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (draft) return
      const inField =
        e.target instanceof HTMLElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)

      if ((e.key === '/' && !inField) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }
      if (e.key === 'Escape') {
        setQuery('')
        searchRef.current?.blur()
        return
      }
      if (hits.length === 0) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => (i + 1) % hits.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => (i - 1 + hits.length) % hits.length)
      } else if (e.key === 'Enter') {
        const hit = hits[activeIndex]
        if (!hit) return
        e.preventDefault()
        if (hit.kind === 'link') {
          window.open(hit.link.url, '_blank', 'noopener')
          track(hit.link.id)
        } else {
          activate(hit)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hits, activeIndex, activate, track, draft])

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

  const renderSection = (section: (typeof cfg.sections)[number]) => {
    // Les cartes GitHub n'apparaissent que si le backend a un token et une config.
    const ghData = gh.data?.enabled ? gh.data : null
    const busy = (name: string) => gh.busyScope === 'all' || gh.busyScope === name
    if (section.kind === 'gh:branches') {
      return ghData ? (
        <GhBranches
          key={section.key}
          data={ghData}
          color="#34d399"
          onRefresh={() => gh.refresh('branches')}
          building={busy('branches')}
        />
      ) : null
    }
    if (section.kind === 'gh:prs') {
      return ghData ? (
        <GhPrs key={section.key} data={ghData} color="#60a5fa" onRefresh={() => gh.refresh('prs')}
          building={busy('prs')} />
      ) : null
    }
    if (section.kind === 'gh:renovate') {
      return ghData ? (
        <GhRenovate
          key={section.key}
          data={ghData}
          color="#a78bfa"
          onRefresh={() => gh.refresh('renovate')}
          building={busy('renovate')}
        />
      ) : null
    }
    if (section.kind === 'gh:merged') {
      return ghData ? (
        <GhMerged
          key={section.key}
          data={ghData}
          color={ui.defaultColor}
          onRefresh={() => gh.refresh('merged')}
          building={busy('merged')}
          removable={local.removable}
          onCleanup={openLocal}
        />
      ) : null
    }
    if (section.kind === 'infos') {
      return cfg.infos ? <InfoPanel key={section.key} infos={cfg.infos} /> : null
    }
    if (section.kind === 'repos') {
      return cfg.repos ? (
        <RepoCard key={section.key} repos={cfg.repos} onOpen={track} gh={gh.data} />
      ) : null
    }
    if (section.kind === 'notes') {
      return (
        <Notes
          key={section.key}
          config={cfg.notes}
          notes={notes}
          setNotes={setNotes}
          openId={openNoteId}
          setOpenId={setOpenNoteId}
        />
      )
    }
    if (section.kind === 'stats') {
      return (
        <Stats
          key={section.key}
          config={cfg.stats}
          links={links}
          usage={usage}
          onOpen={(l) => track(l.id)}
          onReset={resetUsage}
        />
      )
    }
    const { group } = section
    return (
      <GroupCard
        key={section.key}
        name={group.name}
        icon={group.icon}
        color={group.color ?? ui.defaultColor}
        links={links.filter((l) => l.group === group.name)}
        health={health}
        favicons={ui.favicons}
        faviconProvider={ui.faviconProvider}
        collapsed={collapsed[group.name] ?? group.collapsed ?? false}
        onToggle={() => toggleGroup(group.name, collapsed[group.name] ?? group.collapsed ?? false)}
        onOpen={(l) => track(l.id)}
        onContextGroup={groupMenu}
        onContextLink={linkMenu}
      />
    )
  }
  const searching = query.trim().length > 0
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
        query={query}
        onQuery={setQuery}
        placeholder={ui.searchPlaceholder}
        showClock={ui.showClock}
        theme={effectiveTheme}
        onTheme={switchTheme}
        searchRef={searchRef}
        resultCount={searching ? hits.length : null}
        hasChecks={hasChecks}
        onRefresh={refresh}
        onAddGroup={() => setDraft({ kind: 'group', name: null, values: { name: '', icon: '📁' } })}
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
              setQuery('')
              selectTab('events')
            }}
            onOpenLocal={openLocal}
          />
        }
      />

      <Tabs tabs={tabs} active={tab} onSelect={selectTab} />

      {view === 'search' ? (
        <SearchResults
          hits={hits}
          activeIndex={activeIndex}
          favicons={ui.favicons}
          faviconProvider={ui.faviconProvider}
          health={health}
          revealSecrets={false}
          copiedKey={copiedKey}
          infoColor={cfg.infos?.color ?? '#38bdf8'}
          noteColor={cfg.notes.color ?? '#facc15'}
          noteIcon={cfg.notes.icon ?? '📝'}
          emptyHint="Aucun résultat."
          onActivate={activate}
          onHover={setActiveIndex}
        />
      ) : view === 'events' ? (
        <EventFeed
          events={events.events}
          error={events.error}
          seen={events.seen}
          onClear={events.clear}
          onOpenLocal={openLocal}
          onClose={() => selectTab(backTab.current)}
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
        <SettingsPage
          config={raw}
          onSave={persist}
          onReload={() => void fetchConfig().then(setRaw).catch(() => undefined)}
          saving={saveState.kind === 'saving'}
        />
      ) : view === 'github' ? (
        <>
          {gh.data && !gh.data.enabled ? (
            // compte affiché pas (encore) connecté : on garde de quoi revenir aux autres
            <div className="gh-bar">
              <AccountSwitch accounts={gh.data.accounts ?? []} current={gh.data.account} onAccount={gh.setAccount} />
              <span className="gh-bar-state">
                {gh.data.error ?? 'Ce compte n’est pas connecté.'}{' '}
                <button className="loc-roots-edit" onClick={() => selectTab('settings')}>
                  Réglages
                </button>
              </span>
            </div>
          ) : null}
          {gh.data?.enabled ? (
            <GhToolbar
              data={gh.data}
              onUser={gh.setUser}
              onAccount={gh.setAccount}
              onRefresh={() => gh.refresh()}
              paused={gh.paused}
              onTogglePause={gh.togglePause}
              busy={!!gh.busyScope}
              cleanup={local.todo}
              onCleanup={openLocal}
            />
          ) : null}
          {gh.busyScope ? <div className="gh-progress" /> : null}
          <div className="gh-page">{cfg.githubSections.map(renderSection)}</div>
        </>
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
            onContext={linkMenu}
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
            onContext={linkMenu}
          />

          {cfg.sidebar.length > 0 ? (
            <div className="side-row" style={{ ['--side-w' as string]: `${ui.sidebarWidth}px` }}>
              {cfg.sidebar.map(renderSection)}
            </div>
          ) : null}

          <div className="board" style={{ ['--rail-w' as string]: `${ui.railWidth}px` }}>
            {cfg.sections.map(renderSection)}
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

      <ContextMenu state={menu} onClose={() => setMenu(null)} />
      <ConfirmHost />
      {draft ? (
        <EditDialog
          draft={draft}
          groups={cfg.groups}
          onSave={saveDraft}
          onClose={() => setDraft(null)}
        />
      ) : null}

      {saveState.kind === 'error' ? (
        <div className="toast toast-error">
          ⚠ {saveState.message}
          <button className="toast-close" onClick={() => setSaveState({ kind: 'idle' })}>
            ×
          </button>
        </div>
      ) : saveState.kind !== 'idle' ? (
        <div className={`toast toast-${saveState.kind}`}>
          {saveState.kind === 'saving' ? 'enregistrement…' : '✓ config.json enregistré'}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Ne garde que les champs qui ont leur place dans config.json (les propriétés
 * dérivées de FlatLink — id, index, group, icon, color — sont écartées) et
 * omet les booléens faux pour garder un JSON lisible.
 */
function cleanLink(values: Link): Link {
  const link: Link = { name: values.name.trim(), url: values.url.trim() }
  if (values.note?.trim()) link.note = values.note.trim()
  if (values.pinned) link.pinned = true
  if (values.check) link.check = true
  if (values.tags?.trim()) link.tags = values.tags.trim()
  return link
}
