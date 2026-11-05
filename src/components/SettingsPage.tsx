import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  addAccount,
  getAuth,
  getOwners,
  listAccounts,
  removeAccount,
  SHARED_OWNER,
  type AccountInfo,
  type Auth,
  type Owner,
} from '../lib/admin'
import {
  notifState,
  testNotification,
  toggleNotifications,
  type NotifState,
} from '../lib/notifications'
import { DEFAULT_GH_LAYOUT, DEFAULT_UI } from '../lib/config'
import {
  EDIT_TAB_EVENT,
  NEW_TAB_EVENT,
  SECTION_EVENT,
  SECTION_KEY,
  cacheDraft,
  cachedDraft,
  presetSettingsSection,
  setDraftSaver,
} from '../lib/settingsNav'
import { hostOf } from '../lib/customTabs'
import { featureOn, repoTabs, type Config, type CustomTab, type Feature, type RepoItem, type RepoTab } from '../types'
import { confirmDialog } from './ConfirmHost'
import SetDocker from './SetDocker'
import SetExtensions, { extensionsAvailable } from './SetExtensions'
import SetBackups from './SetBackups'
import SetBasecamp from './SetBasecamp'
import SetTrello from './SetTrello'
import SetToolRepos from './SetToolRepos'
import { WHATS_NEW_EVENT, whatsNewSince } from '../lib/whatsNew'
import SetBcStats from './SetBcStats'
import SetConnect from './SetConnect'
import SetLocal from './SetLocal'
import SetRenovate from './SetRenovate'
import SetBellKinds from './SetBellKinds'
import SetRepos, { type Use } from './SetRepos'
import BarLayoutForm, { type Bars } from './BarLayoutForm'
import SetDisplay from './SetDisplay'
import SetOverview from './SetOverview'
import SetPerf from './SetPerf'
import SetTabs from './SetTabs'
import ErrorLog from './ErrorLog'
import PerfLog from './PerfLog'
import { ChangelogBody } from './VersionMenu'
import { useGuide } from '../lib/guide'
import { Markdown } from '../lib/markdown'
import type { useChangelog } from '../lib/changelog'
import SetTeam from './SetTeam'
import { keys } from '../lib/keys'
import { desktop } from '../lib/desktop'

const NOTIF_LABEL: Record<NotifState, string> = {
  unsupported: 'Non supportées par ce navigateur',
  insecure: 'Indisponibles à cette adresse : ouvre homedash par localhost (ou en HTTPS)',
  denied: 'Bloquées dans les réglages du navigateur',
  default: 'Pas encore autorisées',
  muted: 'En sourdine (par défaut) — la cloche de la barre du haut suffit',
  on: 'Actives',
}

/** Parties qui règlent un compte GitHub : la barre de choix du compte s'affiche au-dessus. */
const ACCOUNT_SECTIONS: string[] = ['set-github']
/** Anciennes parties (avant 1.31) réunies dans « GitHub » : un lien ou une partie mémorisée y mène. */
// « Liens & onglets » est une partie de Mes sites depuis l'issue #59 : même composant, deux entrées de menu.
// Rangement des Réglages : Docker est un bloc de Mes sites ; erreurs et performance forment Diagnostic.
const MERGED: Record<string, string> = {
  'set-account': 'set-github:account',
  'set-repos': 'set-github:repos',
  'set-ghtab': 'set-github:tab',
  'set-links': 'set-tabs',
  'set-docker': 'set-tabs',
  'help-errors': 'help-diag',
  'help-perf': 'help-diag',
}
/** `set-github:repos` → la partie et son sous-onglet ; un ancien id → sa nouvelle place. */
const parse = (raw: string): [string, string | null] => {
  const [id, part] = (MERGED[raw] ?? raw).split(':')
  return [MERGED[id]?.split(':')[0] ?? id, part ?? null]
}
const sectionOf = (raw: string) => parse(raw)[0]

/**
 * Parties de la page, dans l'ordre, rangées par thème : le menu de gauche les
 * groupe sous un intertitre et affiche l'une ou l'autre.
 */
const SECTIONS = [
  { id: 'set-home', icon: '🏠', label: "Vue d'ensemble", group: 'Général' },
  { id: 'set-features', icon: '🧩', label: 'Fonctionnalités', group: 'Général' },
  { id: 'set-github', icon: '🐙', label: 'GitHub', group: 'Services' },
  { id: 'set-local', icon: '💻', label: 'Local', group: 'Services' },
  { id: 'set-basecamp', icon: '🏕', label: 'Basecamp', group: 'Services' },
  { id: 'set-trello', icon: '📋', label: 'Trello', group: 'Services' },
  { id: 'set-tabs', icon: '🗂', label: 'Mes sites', group: 'La page' },
  { id: 'set-bars', icon: '🧭', label: 'Barres et onglets', group: 'La page' },
  { id: 'set-display', icon: '🎛', label: 'Affichage', group: 'La page' },
  { id: 'set-notifs', icon: '🔔', label: 'Notifications', group: 'La page' },
  { id: 'set-backups', icon: '💾', label: 'Sauvegardes', group: 'Données' },
] as const

/** Parties qui ne servent qu'à une fonctionnalité : coupée, elles quittent le menu. */
const SECTION_FEATURE: Record<string, Feature> = {
  'set-github': 'github',
  'set-local': 'local',
  'set-basecamp': 'basecamp',
  'set-trello': 'trello',
}

/** Réglages → Fonctionnalités : ce que chacune ajoute à la page. */
const FEATURE_LIST: { id: Feature; icon: string; label: string; hint: string }[] = [
  { id: 'github', icon: '🐙', label: 'GitHub', hint: 'onglet GitHub (branches, PRs, CI, Renovate), carte Repos de l’accueil, recherche dans les repos' },
  { id: 'local', icon: '💻', label: 'Local', hint: 'onglet Local : les dépôts de ton disque et leurs branches à nettoyer' },
  { id: 'basecamp', icon: '🏕', label: 'Basecamp', hint: 'onglet Basecamp (tes tâches), ses non-lus dans la cloche, recherche dans Basecamp' },
  { id: 'trello', icon: '📋', label: 'Trello', hint: 'onglet Trello (tes cartes), ses non-lus dans la cloche, recherche dans Trello' },
]

/** Une partie d'une carte de réglages : icône, titre et une phrase qui dit à quoi elle sert. */
/** État réel de l'accès depuis le navigateur (le port a pu être refusé : ancien Docker encore lancé). */
function BrowserAccessState() {
  const [st, setSt] = useState<{ on: boolean; error: string | null; url?: string } | null>(null)
  useEffect(() => {
    let alive = true
    const read = () =>
      fetch('api/health', { cache: 'no-store' })
        .then((r) => r.json())
        .then((h: { browser_access?: typeof st }) => alive && setSt(h.browser_access ?? null))
        .catch(() => undefined)
    void read()
    const t = window.setInterval(read, 3000)
    return () => {
      alive = false
      window.clearInterval(t)
    }
  }, [])
  if (!st) return null
  if (st.error) return <p className="set-hint set-bad">✗ {st.error}</p>
  return st.on ? <p className="set-hint set-ok">✓ ouvert : <code>{st.url}</code> (après enregistrement des réglages)</p> : null
}

function Block({ icon, title, hint, children }: { icon: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="set-block">
      <header>
        <span className="set-block-icon" aria-hidden="true">
          {icon}
        </span>
        <div>
          <h3>{title}</h3>
          {hint ? <p>{hint}</p> : null}
        </div>
      </header>
      {children}
    </section>
  )
}

function Card({ id, icon, title, children }: { id: string; icon: string; title: string; children: ReactNode }) {
  return (
    <section className="card set-card" id={id}>
      <header className="group-head">
        <div className="group-toggle static">
          <span className="group-icon" aria-hidden="true">
            {icon}
          </span>
          <h2 className="group-title">{title}</h2>
        </div>
      </header>
      <div className="set-body">{children}</div>
    </section>
  )
}

type Props = {
  config: Config | null
  onSave: (next: Config) => void
  /** Relit config.json : après une connexion, le backend a pu y écrire. */
  onReload: () => void
  saving: boolean
  /** Version et changelog (Aide → Nouveautés), le même état que la barre du haut. */
  changelog: ReturnType<typeof useChangelog>
  /** Les choix des barres (propres à cet écran, appliqués tout de suite) : Barres et onglets. */
  bars?: Bars
}

/** Pages de l'Aide qui ne viennent pas de GUIDE.md. Nouveautés n'est pas au menu (bouton de version, menu de l'appli). */
const NEWS = { id: 'help-news', icon: '📜', label: 'Nouveautés', group: 'Aide' }
/** Diagnostic : journal d'erreurs et journal de performance, sur une page. */
const DIAG = { id: 'help-diag', icon: '🩺', label: 'Diagnostic', group: 'Aide' }
/** Le guide (GUIDE.md) : une seule entrée du menu, ses parties en pastilles dans la page. */
const GUIDE = { id: 'help-guide', icon: '📖', label: 'Guide', group: 'Aide' }
const GUIDE_PART_KEY = 'homedash:guide-part'
/** Sous-onglets de GitHub, mémorisés. */
type GhPart = 'account' | 'repos' | 'team' | 'tab'
const GH_PARTS: { id: GhPart; label: string }[] = [
  { id: 'account', label: 'Compte' },
  { id: 'repos', label: 'Repos suivis' },
  { id: 'team', label: 'Équipe' },
  { id: 'tab', label: "Ce que montre l'onglet" },
]
const GH_PART_KEY = 'homedash:gh-part'

type GhCfg = {
  id?: string
  label?: string
  me?: string
  repos?: string[]
  branch_repos?: string[]
  base_site_repos?: string[]
  upstream_repo?: string
  renovate_author?: string
  users?: string[]
  merged_count?: number
  cache_ttl?: number
  auto_refresh?: number
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [])

export default function SettingsPage({ config, onSave, onReload, saving, changelog, bars }: Props) {
  // Brouillon local : rien n'est écrit avant « Enregistrer ».
  const [draft, setDraft] = useState<Config | null>(() => (config && cachedDraft(config)) ?? config)
  const [auth, setAuth] = useState<Auth | null>(null)
  const [owners, setOwners] = useState<Owner[]>([])
  const [bell, setBell] = useState<NotifState>('default')
  const [notifLog, setNotifLog] = useState<string | null>(null)
  // Compte GitHub en cours d'édition, et ce que le serveur sait de chacun.
  const [sel, setSel] = useState('')
  const [infos, setInfos] = useState<AccountInfo[]>([])
  const [newLabel, setNewLabel] = useState<string | null>(null)

  useEffect(() => setBell(notifState()), [])

  useEffect(() => setDraft((config && cachedDraft(config)) ?? config), [config])

  // Toujours au moins un compte : le serveur convertit les anciennes configs.
  const accList: GhCfg[] = useMemo(
    () =>
      (draft?.github_accounts as GhCfg[] | undefined)?.length
        ? (draft!.github_accounts as GhCfg[])
        : [{ id: 'main', label: '' }],
    [draft],
  )
  const gh: GhCfg = accList.find((a) => a.id === sel) ?? accList[0]
  const selId = gh?.id ?? 'main'

  const refreshInfos = () =>
    listAccounts()
      .then(setInfos)
      .catch(() => setInfos([]))
  useEffect(() => {
    void refreshInfos()
  }, [])

  useEffect(() => {
    setAuth(null)
    setOwners([])
    getAuth(selId)
      .then(setAuth)
      .catch(() => setAuth({ ok: false, source: null, error: 'backend injoignable' }))
  }, [selId])

  const connected = !!auth?.ok
  useEffect(() => {
    if (!connected) return
    getOwners(selId)
      .then(setOwners)
      .catch(() => setOwners([]))
  }, [connected, auth?.login, selId])

  /** Chaque repo porte son propriétaire : `mon-org/api`. */
  const cardKey = (i: { name: string; owner?: string }) => (i.owner ? `${i.owner}/${i.name}` : i.name)
  const githubRepos = useMemo(
    () => (draft?.repos?.items ?? []).filter((i) => repoTabs(i).includes('github')).map(cardKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft],
  )
  const homeRepos = useMemo(
    () => (draft?.repos?.items ?? []).filter((i) => repoTabs(i).includes('links')).map(cardKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft],
  )

  // Comptes à parcourir : celui du jeton (owners[0]) et ses orgs. Les autres
  // « User » sont des collaborateurs croisés sur un repo, pas des comptes à lister.
  // Collaborateur sur le repo d'un autre compte perso : un onglet « Partagés avec
  // toi » les regroupe tous (un onglet par compte croisé serait du bruit).
  const accounts = useMemo(() => {
    const mine = owners.filter((o, i) => i === 0 || o.type === 'Organization')
    const shared = owners.some((o, i) => i > 0 && o.type === 'User')
    return shared ? [...mine, { login: SHARED_OWNER, type: 'Shared', label: 'Partagés avec toi' }] : mine
  }, [owners])

  // Aide : trois entrées (Nouveautés, Guide, Journal d'erreurs) ; les parties du
  // guide se choisissent dans sa page, sinon l'Aide dépassait les réglages.
  const guide = useGuide()
  const [hasPerf, setHasPerf] = useState(false)
  useEffect(() => {
    fetch('api/perf', { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ files?: number }>)
      .then((u) => setHasPerf((u.files ?? 0) > 0))
      .catch(() => undefined)
  }, [])
  // Une fonctionnalité décochée quitte le menu tout de suite (brouillon compris).
  const shown = (id: string) => !SECTION_FEATURE[id] || featureOn(draft, SECTION_FEATURE[id])
  const nav = [...SECTIONS.filter((sec) => shown(sec.id)), GUIDE, DIAG]
  const [guidePart, setGuidePart] = useState<string | null>(() => {
    try {
      return localStorage.getItem(GUIDE_PART_KEY)
    } catch {
      return null
    }
  })
  const pickPart = (id: string) => {
    setGuidePart(id)
    window.scrollTo({ top: 0 })
    try {
      localStorage.setItem(GUIDE_PART_KEY, id)
    } catch {
      /* stockage indisponible */
    }
  }

  const cleanedRef = useRef<(c: Config) => Config>((c) => c)
  // Sous-onglet demandé avec la partie (`set-github:repos`, recherche ou ancien lien).
  const initialPart = useRef<string | null>(null)
  // Une seule partie à l'écran ; le menu de gauche passe de l'une à l'autre.
  // Mémorisée : on revient là où on réglait.
  const [active, setActive] = useState<string>(() => {
    try {
      const raw = localStorage.getItem(SECTION_KEY)
      const saved = raw && sectionOf(raw)
      if (raw) initialPart.current = parse(raw)[1]
      // `help-…` : une page de l'Aide (le guide arrive après, son menu aussi).
      if (saved && (SECTIONS.some((sec) => sec.id === saved) || saved.startsWith('help-'))) return saved
    } catch {
      /* stockage indisponible */
    }
    return SECTIONS[0].id
  })
  // GitHub en sous-onglets : une chose à la fois au lieu de deux écrans empilés.
  const [ghPart, setGhPartState] = useState<GhPart>(() => {
    const asked = initialPart.current
    if (asked && GH_PARTS.some((g) => g.id === asked)) return asked as GhPart
    try {
      const v = localStorage.getItem(GH_PART_KEY)
      if (v && GH_PARTS.some((g) => g.id === v)) return v as GhPart
    } catch {
      /* stockage indisponible */
    }
    return 'account'
  })
  const setGhPart = (part: GhPart) => {
    setGhPartState(part)
    try {
      localStorage.setItem(GH_PART_KEY, part)
    } catch {
      /* stockage indisponible */
    }
  }
  // Repli à ouvrir en arrivant (`set-tabs:more`, `set-tabs:docker` : une recherche vise un réglage replié).
  const [fold, setFold] = useState<string | null>(() => initialPart.current)
  // Docker : proposé seulement s'il tourne sur cette machine, ou déjà activé.
  const [dockerHere, setDockerHere] = useState(false)
  useEffect(() => {
    fetch('api/docker?probe=1', { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ available?: boolean }>)
      .then((d) => setDockerHere(!!d.available))
      .catch(() => undefined)
  }, [])
  // Ancienne page du guide mémorisée (`help-raccourcis`…) : le guide, sur cette partie.
  useEffect(() => {
    if (!guide || !active.startsWith('help-') || [NEWS.id, GUIDE.id, DIAG.id].includes(active)) return
    if (guide.some((p) => p.id === active)) setGuidePart(active)
    setActive(GUIDE.id)
  }, [active, guide])
  useEffect(() => {
    const go = (e: Event) => {
      const [id, part] = parse((e as CustomEvent<string>).detail)
      setActive(id)
      setFold(part)
      if (part && GH_PARTS.some((g) => g.id === part)) setGhPart(part as GhPart)
    }
    window.addEventListener(SECTION_EVENT, go)
    return () => window.removeEventListener(SECTION_EVENT, go)
  }, [])
  // Partie mémorisée d'une fonctionnalité coupée : on revient aux Fonctionnalités.
  useEffect(() => {
    if (!shown(active)) setActive('set-features')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, draft])
  const help = guide?.find((p) => p.id === guidePart) ?? guide?.[0]
  // ＋ de la barre de gauche ou « Modifier… », Réglages déjà ouvert : Mes sites
  // (SetTabs crée l'onglet, ou ouvre son éditeur).
  useEffect(() => {
    const go = () => setActive('set-tabs')
    window.addEventListener(NEW_TAB_EVENT, go)
    window.addEventListener(EDIT_TAB_EVENT, go)
    return () => {
      window.removeEventListener(NEW_TAB_EVENT, go)
      window.removeEventListener(EDIT_TAB_EVENT, go)
    }
  }, [])

  const jump = (raw: string) => {
    const [id, part] = parse(raw)
    setActive(id)
    setFold(part)
    if (part && GH_PARTS.some((g) => g.id === part)) setGhPart(part as GhPart)
    window.scrollTo({ top: 0 })
    presetSettingsSection(id)
  }

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(config), [draft, config])

  // Quitter la page garde le brouillon (retrouvé au retour) et permet de
  // l'enregistrer depuis la question posée au départ (useTabs).
  useEffect(() => {
    if (!config) return
    cacheDraft(config, dirty ? draft : null)
    setDraftSaver(dirty && draft ? () => onSave(cleanedRef.current(draft)) : null)
  }, [config, draft, dirty, onSave])
  useEffect(() => () => setDraftSaver(null), [])

  // ⌘S / Ctrl+S : enregistrer sans aller chercher le bouton.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (dirty && draft && !saving) onSave(cleanedRef.current(draft))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dirty, draft, saving, onSave])

  if (!draft) return <div className="loading">chargement…</div>

  /** Brouillon avec le compte sélectionné modifié (liste des comptes matérialisée). */
  const withAcc = (patch: Partial<GhCfg>): Config => ({
    ...draft,
    github_accounts: accList.map((a) => (a.id === selId ? { ...a, ...patch } : a)) as Record<string, unknown>[],
  })
  const patchGh = (patch: Partial<GhCfg>) => setDraft(withAcc(patch))

  const items: RepoItem[] = draft.repos?.items ?? []
  const fullList = asList
  // Clé absente = mêmes repos que les PRs, comme le backend.
  const branchList = Array.isArray(gh.branch_repos) ? fullList(gh.branch_repos) : fullList(gh.repos)
  const uses: Record<Use, string[]> = {
    prs: fullList(gh.repos),
    branches: branchList,
    github: githubRepos,
    home: homeRepos,
  }
  const tracked = [...new Set([...uses.prs, ...uses.branches, ...uses.github, ...uses.home])].sort()
  const nameOf = (k: string) => k.split('/').pop() ?? k
  // Repos où créer une issue depuis Basecamp ou Trello : ceux des PRs, tous comptes confondus (comme le serveur).
  const followed = [...new Set(accList.flatMap((a) => asList(a.repos)).filter((r) => r.includes('/')))].sort()
  const setToolRepos = (tool: 'basecamp' | 'trello', list: string[]) => {
    const { repos: _old, ...rest } = (draft[tool] ?? {}) as { repos?: string[] }
    setDraft({ ...draft, [tool]: list.length ? { ...rest, repos: list } : rest })
  }

  const itemOf = (key: string): RepoItem => {
    const [owner, name] = key.split('/', 2)
    return name ? { name, owner } : { name: owner }
  }

  /**
   * Un seul brouillon pour les trois endroits qu'alimente un repo : les deux
   * listes de la section `github`, et la carte Repos (`repos.items`). Tout est
   * réécrit en `propriétaire/repo`, y compris les entrées de la carte.
   */
  const writeUses = (next: Record<Use, string[]>, extra: Partial<GhCfg> = {}) => {
    // Une entrée de carte par repo coché GitHub et / ou Accueil ; `in` absent = GitHub seul.
    const card = [...new Set([...next.github, ...next.home])]
    const placed = (i: RepoItem): RepoItem => {
      const key = cardKey(i)
      const tabs: RepoTab[] = [
        ...(next.github.includes(key) ? (['github'] as const) : []),
        ...(next.home.includes(key) ? (['links'] as const) : []),
      ]
      const { in: _old, ...rest } = i
      return tabs.length === 1 && tabs[0] === 'github' ? rest : { ...rest, in: tabs }
    }
    const keep = items
      .filter((i) => card.includes(cardKey(i)))
      .map((i) => placed(i.owner ? i : { ...i, ...itemOf(cardKey(i)) }))
    const added = card.filter((k) => !keep.some((i) => cardKey(i) === k)).map((k) => placed(itemOf(k)))
    setDraft({
      ...withAcc({
        repos: next.prs,
        branch_repos: next.branches,
        base_site_repos: fullList(gh.base_site_repos),
        ...extra,
      }),
      repos: { ...(draft.repos ?? { items: [] }), items: [...keep, ...added] },
    })
  }

  /**
   * Le backend et l'onglet Local reconnaissent un repo à son nom court (c'est
   * ce qu'ils lisent dans l'URL d'un remote) : deux propriétaires pour un même
   * nom seraient confondus. On refuse plutôt que de mélanger leurs branches.
   */
  const track = (key: string): string | null => {
    const clash = tracked.find((k) => k !== key && nameOf(k).toLowerCase() === nameOf(key).toLowerCase())
    if (clash) return `${clash} est déjà suivi : deux repos du même nom ne peuvent pas être suivis ensemble.`
    const add = (l: string[]) => (l.includes(key) ? l : [...l, key].sort())
    // Accueil n'est pas coché d'office : la page d'accueil reste aux raccourcis.
    writeUses({ ...uses, prs: add(uses.prs), branches: add(uses.branches), github: add(uses.github) })
    return null
  }

  const toggleUse = (use: Use, key: string) => {
    const cur = uses[use]
    writeUses({ ...uses, [use]: cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key].sort() })
  }

  const untrack = (key: string) => {
    const drop = (l: string[]) => l.filter((x) => x !== key)
    writeUses(
      { prs: drop(uses.prs), branches: drop(uses.branches), github: drop(uses.github), home: drop(uses.home) },
      { base_site_repos: drop(fullList(gh.base_site_repos)) },
    )
  }

  const layout = draft.githubLayout?.length ? draft.githubLayout : [...DEFAULT_GH_LAYOUT]
  const setRenovateShown = (on: boolean) =>
    setDraft({
      ...draft,
      githubLayout: on
        ? layout.includes('gh:renovate')
          ? layout
          : [...layout, 'gh:renovate']
        : layout.filter((t) => t !== 'gh:renovate'),
    })

  const onAuth = (a: Auth) => {
    setAuth(a)
    // le backend a pu renseigner login/libellé au premier branchement
    onReload()
    void refreshInfos()
  }

  /**
   * Ajouter / supprimer un compte écrit la config tout de suite (le serveur doit
   * connaître le compte pour y ranger un jeton). Un brouillon en cours serait
   * écrasé par le rechargement : on demande d'enregistrer d'abord.
   */
  const needsSave = () => {
    if (!dirty) return false
    void confirmDialog({
      title: 'Enregistre d’abord tes modifications',
      body: 'Ajouter ou supprimer un compte recharge les réglages : les modifications non enregistrées seraient perdues.',
      confirmLabel: 'Compris',
      cancelLabel: 'Fermer',
    })
    return true
  }

  const createAccount = () => {
    const label = (newLabel ?? '').trim()
    if (!label || needsSave()) return
    void addAccount(label).then(({ id }) => {
      setNewLabel(null)
      setSel(id)
      onReload()
      void refreshInfos()
    })
  }

  const deleteAccount = () => {
    if (needsSave()) return
    const label = gh.label || infoOf(selId)?.login || selId
    void confirmDialog({
      title: `Supprimer le compte « ${label} » ?`,
      body: [
        'Son jeton est effacé de homedash, et ses réglages (repos suivis, équipe, Renovate) disparaissent.',
        'Les autres comptes ne bougent pas. Une sauvegarde automatique est faite chaque jour.',
      ],
      confirmLabel: 'Supprimer le compte',
      danger: true,
    }).then((ok) => {
      if (!ok) return
      void removeAccount(selId).then(() => {
        setSel('')
        onReload()
        void refreshInfos()
      })
    })
  }

  const infoOf = (id: string) => infos.find((i) => i.id === id)
  const labelOf = (a: GhCfg) => a.label || infoOf(a.id ?? '')?.login || a.id || 'compte'


  const local = (draft.local ?? {}) as { roots?: { path?: string; as?: string }[]; max_depth?: number }
  const patchLocal = (patch: Record<string, unknown>) =>
    setDraft({ ...draft, local: { ...(draft.local ?? {}), ...patch } })

  /**
   * Un champ texte laissé vide ne doit PAS être écrit comme "" : le backend a des
   * défauts (upstream_repo = base-site, renovate_author = renovate[bot]) et une
   * chaîne vide les écraserait — ce qui désactive silencieusement la section
   * Upstream. On retire la clé pour que le défaut s'applique.
   */
  const cleaned = (config: Config): Config => {
    const clean = (o: Record<string, unknown> = {}) => {
      const out = { ...o }
      for (const key of ['me', 'upstream_repo', 'renovate_author']) {
        if (typeof out[key] === 'string' && !(out[key] as string).trim()) delete out[key]
      }
      return out
    }
    // Onglet perso sans adresse : ligne ajoutée puis laissée vide, on l'oublie.
    // Sans nom : celui du site, ou du fichier.
    const tab = (t: CustomTab): CustomTab => {
      const url = t.url.trim()
      const label = t.label.trim() || hostOf(url).replace(/^www\./, '') || url.split('/').pop() || url
      return { ...t, url, label, icon: t.icon?.trim() || undefined }
    }
    return {
      ...config,
      ...(config.github_accounts ? { github_accounts: config.github_accounts.map(clean) } : {}),
      ...(config.tabs ? { tabs: config.tabs.filter((t) => t.url.trim()).map(tab) } : {}),
      ...(config.tabSessions
        ? { tabSessions: config.tabSessions.map((x) => ({ ...x, name: x.name.trim() || 'Compte' })) }
        : {}),
      ...(config.tabFolders
        ? {
            tabFolders: config.tabFolders.map((f) => ({
              ...f,
              name: f.name.trim() || 'Dossier',
              icon: f.icon?.trim() || undefined,
            })),
          }
        : {}),
    }
  }

  cleanedRef.current = cleaned

  const num = (value: string, fallback: number) => {
    const n = Number.parseInt(value, 10)
    return Number.isNaN(n) ? fallback : n
  }

  return (
    <div className="settings-layout">
      <nav className="set-nav" aria-label="Parties des réglages">
        {nav.map((sec, i) => (
          <Fragment key={sec.id}>
            {sec.group !== nav[i - 1]?.group ? <span className="set-nav-group">{sec.group}</span> : null}
            <button
              className={`set-nav-item${active === sec.id ? ' is-active' : ''}`}
              onClick={() => jump(sec.id)}
            >
              <span aria-hidden="true">{sec.icon}</span>
              {sec.label}
            </button>
          </Fragment>
        ))}
      </nav>

      <div className="settings-page">
        {ACCOUNT_SECTIONS.includes(active) ? (
        <div className="set-accounts">
          <span className="set-accounts-title">Compte GitHub</span>
          {accList.map((a) => {
            const info = infoOf(a.id ?? '')
            return (
              <button
                key={a.id}
                className={`gh-account${a.id === selId ? ' is-active' : ''}${info?.ok ? '' : ' is-off'}`}
                onClick={() => setSel(a.id ?? '')}
                title={info?.ok ? `connecté en tant que ${info.login}` : 'non connecté'}
              >
                {info?.avatar ? <img src={info.avatar} alt="" /> : <span className="gh-account-dot" />}
                {labelOf(a)}
              </button>
            )
          })}
          {newLabel === null ? (
            <button className="gh-account set-account-add" onClick={() => !needsSave() && setNewLabel('')}>
              ＋ Compte
            </button>
          ) : (
            <span className="set-account-new">
              <input
                autoFocus
                value={newLabel}
                placeholder="nom : Perso, Client X…"
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createAccount()
                  if (e.key === 'Escape') setNewLabel(null)
                }}
                autoComplete="off"
                data-1p-ignore
              />
              <button onClick={createAccount} disabled={!newLabel.trim()}>
                Créer
              </button>
              <button onClick={() => setNewLabel(null)}>Annuler</button>
            </span>
          )}
          <span className="set-hint set-accounts-hint">
            Toute la page concerne le compte choisi ici. Chaque compte a son jeton et est suivi en
            parallèle ; l'onglet GitHub choisit lequel il affiche.
          </span>
        </div>
        ) : null}

        <div className="set-cards">
        {active === 'set-home' ? (
        <Card id="set-home" icon="🏠" title="Vue d'ensemble">
          <SetOverview config={draft} bars={bars} onJump={jump} />
        </Card>
        ) : null}

        {active === 'set-features' ? (
        <Card id="set-features" icon="🧩" title="Fonctionnalités">
          <p className="set-hint">
            Décoche ce dont tu ne te sers pas : l'onglet disparaît, et homedash cesse de lire le service. Les
            réglages et connexions sont gardés : recoche pour tout retrouver.
          </p>
          <div className="set-toggles">
            {FEATURE_LIST.map(({ id, icon, label, hint }) => (
              <label className="set-toggle" key={id} title={hint}>
                <input
                  type="checkbox"
                  checked={featureOn(draft, id)}
                  onChange={(e) => {
                    const features = { ...(draft.features ?? {}) }
                    // Cochée = clé retirée : le défaut (active) s'applique.
                    if (e.target.checked) delete features[id]
                    else features[id] = false
                    const { features: _old, ...rest } = draft
                    setDraft(Object.keys(features).length ? { ...rest, features } : rest)
                  }}
                />
                {icon} {label} <em>{hint}</em>
              </label>
            ))}
          </div>
          {desktop?.features?.includes('app-server') ? (
            <Block
              icon="🌐"
              title="Accès depuis le navigateur"
              hint="L'appli n'ouvre aucun port : homedash n'existe qu'en elle. Coché, il s'ouvre aussi dans un navigateur, sur cette machine seulement."
            >
              <div className="set-toggles">
                <label className="set-toggle">
                  <input
                    type="checkbox"
                    checked={draft.ui?.browserAccess === true}
                    onChange={(e) => setDraft({ ...draft, ui: { ...(draft.ui ?? {}), browserAccess: e.target.checked } })}
                  />
                  <span>
                    Ouvrir homedash sur <code>http://localhost:7777</code>
                    <em>tant que l'appli tourne ; jamais visible des autres machines du réseau</em>
                  </span>
                </label>
              </div>
              <BrowserAccessState />
            </Block>
          ) : null}
        </Card>
        ) : null}

        {active === 'set-github' ? (
        <Card id="set-github" icon="🐙" title={`GitHub · ${labelOf(gh)}`}>
          <nav className="set-subtabs" aria-label="Parties de GitHub">
            {GH_PARTS.map((g) => (
              <button key={g.id} type="button" className={ghPart === g.id ? 'is-on' : ''} aria-pressed={ghPart === g.id} onClick={() => setGhPart(g.id)}>
                {g.label}
              </button>
            ))}
          </nav>
          {ghPart === 'account' ? (
          <Block icon="🔑" title="Compte" hint="Le jeton qui permet à homedash de lire ce compte GitHub.">
            <div className="set-grid">
              <label className="set-field">
                <span>
                  Nom du compte <em>affiché dans le sélecteur</em>
                </span>
                <input
                  value={gh.label ?? ''}
                  placeholder={infoOf(selId)?.login ?? 'Boulot, Perso…'}
                  onChange={(e) => patchGh({ label: e.target.value })}
                  autoComplete="off"
                  data-1p-ignore
                />
              </label>
            </div>
            <SetConnect account={selId} auth={auth} onChange={onAuth} />
          </Block>
          ) : null}
          {ghPart === 'repos' ? (
          <Block
            icon="📦"
            title="Repos suivis"
            hint="Les repos que homedash suit, et où chacun apparaît (onglet GitHub, Accueil, Local)."
          >
            <SetRepos
              account={selId}
              owners={accounts}
              uses={uses}
              connected={connected}
              onTrack={track}
              onToggle={toggleUse}
              onRemove={untrack}
            />
          </Block>
          ) : null}
          {ghPart === 'team' ? (
          <Block icon="👥" title="Équipe" hint="Qui tu es, et les personnes dont l'onglet GitHub montre le travail.">
            <SetTeam
              account={selId}
              orgs={accounts.filter((o) => o.type === 'Organization').map((o) => o.login)}
              users={asList(gh.users)}
              me={gh.me ?? ''}
              connected={connected}
              login={auth?.login}
              onUsers={(users) => patchGh({ users })}
              onMe={(me) => patchGh({ me })}
            />
          </Block>
          ) : null}
          {ghPart === 'tab' ? (
          <Block icon="🐙" title="Ce que montre l'onglet" hint="PRs mergées, rythme de lecture de GitHub, Renovate.">
            <div className="set-grid">
              <label className="set-field">
                <span>
                  PRs mergées affichées <em>carte « PRs mergées »</em>
                </span>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={gh.merged_count ?? 10}
                  onChange={(e) => patchGh({ merged_count: num(e.target.value, 10) })}
                />
              </label>
              <label className="set-field">
                <span>
                  Rafraîchissement <em>secondes entre deux lectures de GitHub, 0 = manuel</em>
                </span>
                <input
                  type="number"
                  min={0}
                  max={3600}
                  value={gh.auto_refresh ?? 15}
                  onChange={(e) => patchGh({ auto_refresh: num(e.target.value, 15) })}
                />
              </label>
            </div>
            {/* Propre à l'équipe (dépôt amont, bot) : replié tant qu'on ne le cherche pas. */}
            <details className="set-more">
              <summary>Avancé : Renovate</summary>
            <SetRenovate
              shown={layout.includes('gh:renovate')}
              upstream={gh.upstream_repo ?? 'base-site'}
              author={gh.renovate_author ?? 'renovate[bot]'}
              tracked={tracked}
              watched={fullList(gh.base_site_repos)}
              onShown={setRenovateShown}
              onUpstream={(upstream_repo) => patchGh({ upstream_repo })}
              onAuthor={(renovate_author) => patchGh({ renovate_author })}
              onWatched={(base_site_repos) => patchGh({ base_site_repos })}
            />
            </details>
          </Block>
          ) : null}
          {accList.length > 1 ? (
            <div className="set-add">
              <button className="set-danger-link" onClick={deleteAccount}>
                Supprimer le compte « {labelOf(gh)} »
              </button>
            </div>
          ) : null}
        </Card>
        ) : null}

        {active === 'set-basecamp' ? (
        <Card id="set-basecamp" icon="🏕" title="Basecamp">
          <SetBasecamp />
          <SetToolRepos tool="Basecamp" followed={followed} chosen={asList(draft.basecamp?.repos)} onChange={(l) => setToolRepos('basecamp', l)} />
          <SetBcStats
            on={draft.basecamp?.statsBackground === true}
            onChange={(v) => {
              const { statsBackground: _old, ...rest } = draft.basecamp ?? {}
              setDraft({ ...draft, basecamp: v ? { ...rest, statsBackground: true } : rest })
            }}
          />
        </Card>
        ) : null}
        {active === 'set-trello' ? (
        <Card id="set-trello" icon="📋" title="Trello">
          <SetTrello />
          <SetToolRepos tool="Trello" followed={followed} chosen={asList(draft.trello?.repos)} onChange={(l) => setToolRepos('trello', l)} />
        </Card>
        ) : null}
        {active === 'set-tabs' ? (
        <Card id="set-tabs" icon="🗂" title="Mes sites">
          <SetTabs
            tabs={draft.tabs ?? []}
            folders={draft.tabFolders ?? []}
            sessions={draft.tabSessions ?? []}
            onChange={(tabs, tabFolders = draft.tabFolders, tabSessions = draft.tabSessions) =>
              setDraft({ ...draft, tabs, tabFolders, tabSessions })
            }
            sleepMinutes={(draft.ui?.tabSleepMinutes as number | undefined) ?? DEFAULT_UI.tabSleepMinutes}
            onSleepMinutes={(n) => setDraft({ ...draft, ui: { ...(draft.ui ?? {}), tabSleepMinutes: n } })}
            openLinks={draft.ui?.openLinks === 'browser' ? 'browser' : 'app'}
            onOpenLinks={(openLinks) => setDraft({ ...draft, ui: { ...(draft.ui ?? {}), openLinks } })}
          />
          {/* Bons défauts (liens dans l'appli, veille à 15 min) : replié tant qu'on ne le cherche pas. */}
          <details className="set-more" open={fold === 'more' || undefined}>
            <summary>Plus de réglages : liens qui ouvrent un onglet, veille, onglets temporaires</summary>
          <SetTabs
            part="links"
            tabs={draft.tabs ?? []}
            folders={draft.tabFolders ?? []}
            sessions={draft.tabSessions ?? []}
            onChange={(tabs, tabFolders = draft.tabFolders, tabSessions = draft.tabSessions) =>
              setDraft({ ...draft, tabs, tabFolders, tabSessions })
            }
            sleepMinutes={(draft.ui?.tabSleepMinutes as number | undefined) ?? DEFAULT_UI.tabSleepMinutes}
            onSleepMinutes={(n) => setDraft({ ...draft, ui: { ...(draft.ui ?? {}), tabSleepMinutes: n } })}
            openLinks={draft.ui?.openLinks === 'browser' ? 'browser' : 'app'}
            onOpenLinks={(openLinks) => setDraft({ ...draft, ui: { ...(draft.ui ?? {}), openLinks } })}
          />
          </details>
          {dockerHere || draft.docker?.enabled ? (
            <details className="set-more" open={draft.docker?.enabled || fold === 'docker' || undefined}>
              <summary>🐳 Docker : tes containers dans la barre (développeurs)</summary>
              <SetDocker
                enabled={draft.docker?.enabled === true}
                hidden={asList(draft.docker?.hidden)}
                onChange={(enabled, hidden) => setDraft({ ...draft, docker: { enabled, hidden } })}
              />
            </details>
          ) : null}
          {extensionsAvailable() ? (
            <details className="set-more" open={fold === 'extensions' || undefined}>
              <summary>🧩 Extensions de navigateur dans tes sites</summary>
              <SetExtensions />
            </details>
          ) : null}
        </Card>
        ) : null}
        {active === 'set-local' ? (
        <Card id="set-local" icon="💻" title="Local">
          <SetLocal
            roots={local.roots ?? []}
            maxDepth={local.max_depth ?? 3}
            onRoots={(roots) => patchLocal({ roots, enabled: true })}
            onMaxDepth={(max_depth) => patchLocal({ max_depth })}
          />
        </Card>
        ) : null}

        {active === NEWS.id ? (
        <Card id={NEWS.id} icon={NEWS.icon} title={`Nouveautés · homedash ${changelog.data?.current ?? ''}`}>
          {changelog.data ? (
            <div className="cl-body help-news">
              <p className="set-hint">
                {changelog.data.error
                  ? `⚠ ${changelog.data.error}`
                  : changelog.data.update
                    ? `homedash ${changelog.data.latest} est disponible.`
                    : changelog.data.checked_at
                      ? '✓ À jour (homedash vérifie toutes les 10 min).'
                      : ''}{' '}
                <button className="set-inline-btn" onClick={() => void changelog.check()} disabled={changelog.busy}>
                  {changelog.busy ? 'vérification…' : 'Vérifier maintenant'}
                </button>{' '}
                {whatsNewSince(null, changelog.data.current).length ? (
                  <button className="set-inline-btn" onClick={() => window.dispatchEvent(new Event(WHATS_NEW_EVENT))}>
                    ✨ Quoi de neuf
                  </button>
                ) : null}
              </p>
              <ChangelogBody data={changelog.data} />
            </div>
          ) : (
            <p className="set-hint">chargement…</p>
          )}
        </Card>
        ) : null}

        {active === DIAG.id ? (
        <Card id={DIAG.id} icon={DIAG.icon} title="Diagnostic">
          <p className="set-hint">Pour comprendre un souci : ce qui a échoué, et ce qui prend du temps. Inutile au quotidien.</p>
          <Block icon="🧾" title="Journal d'erreurs" hint="Les erreurs de la page et du serveur, à copier dans une issue.">
            <ErrorLog repo={changelog.data?.repo} />
          </Block>
          <Block icon="⏱" title="Journal de performance" hint="Mémoire et CPU, jour par jour. Désactivé par défaut.">
            <SetPerf
              enabled={draft.ui?.perfLog === true}
              onEnabled={(perfLog) => setDraft({ ...draft, ui: { ...(draft.ui ?? {}), perfLog } })}
            />
            {hasPerf || config?.ui?.perfLog === true ? (
              <details className="set-more">
                <summary>Voir les mesures</summary>
                <PerfLog />
              </details>
            ) : null}
          </Block>
        </Card>
        ) : null}

        {active === GUIDE.id ? (
        <Card id={GUIDE.id} icon={GUIDE.icon} title="Guide">
          {guide?.length ? (
            <>
              <nav className="guide-parts" aria-label="Parties du guide">
                {guide.map((p) => (
                  <button
                    key={p.id}
                    className={`xs-btn${p.id === help?.id ? ' is-on' : ''}`}
                    onClick={() => pickPart(p.id)}
                  >
                    {p.icon} {p.title}
                  </button>
                ))}
              </nav>
              {help ? (
                <>
                  <h2 className="guide-title">
                    {help.icon} {help.title}
                  </h2>
                  <Markdown text={help.body} />
                </>
              ) : null}
            </>
          ) : (
            <p className="set-hint">{guide ? 'Le guide est introuvable.' : 'chargement…'}</p>
          )}
        </Card>
        ) : null}

        {active === 'set-backups' ? (
        <Card id="set-backups" icon="💾" title="Sauvegardes">
          <SetBackups />
        </Card>
        ) : null}

        {active === 'set-bars' ? (
        <Card id="set-bars" icon="🧭" title="Barres et onglets">
          <p className="set-hint">
            Appliqué tout de suite, propre à cet écran. Aussi au clic droit sur une barre.
          </p>
          {bars ? (
            <BarLayoutForm bars={bars} withDash />
          ) : (
            <p className="set-hint">Indisponible ici.</p>
          )}
        </Card>
        ) : null}

        {active === 'set-display' ? (
        <Card id="set-display" icon="🎛" title="Affichage">
          <Block icon="🧭" title="Ce qui s'affiche" hint="Ce que tu vois dans la page, à cocher ou décocher.">
            <div className="set-toggles">
              {(
                [
                  ['showClock', 'Horloge', 'heure et date dans la barre du haut'],
                  ['showTiles', 'Tuiles', 'rangées « épinglés » et « les plus utilisés » en haut de Raccourcis (décochées : la carte « Les plus ouverts » les remplace)'],
                  ['showFooter', 'Pied de page', 'raccourcis clavier rappelés en bas de Raccourcis'],
                  ['favicons', 'Icônes des sites', 'le petit logo du site devant chaque lien'],
                ] as const
              ).map(([key, label, hint]) => (
                <label className="set-toggle" key={key}>
                  <input
                    type="checkbox"
                    checked={(draft.ui?.[key] as boolean | undefined) ?? true}
                    onChange={(e) => setDraft({ ...draft, ui: { ...(draft.ui ?? {}), [key]: e.target.checked } })}
                  />
                  <span>
                    {label}
                    <em>{hint}</em>
                  </span>
                </label>
              ))}
              <label className="set-toggle">
                <input
                  type="checkbox"
                  checked={draft.ui?.setupHidden !== true}
                  onChange={(e) => setDraft({ ...draft, ui: { ...(draft.ui ?? {}), setupHidden: !e.target.checked } })}
                />
                <span>
                  Pour commencer
                  <em>étapes de prise en main en haut de Raccourcis, tant qu'il en reste à faire</em>
                </span>
              </label>
            </div>
          </Block>
          <Block icon="📐" title="Mise en page" hint="Des modèles plutôt que des chiffres. Appliqué à « Enregistrer ».">
            <SetDisplay ui={draft.ui ?? {}} onChange={(patch) => setDraft({ ...draft, ui: { ...(draft.ui ?? {}), ...patch } })} />
          </Block>
        </Card>
        ) : null}
        {active === 'set-notifs' ? (
        <Card id="set-notifs" icon="🔔" title="Notifications">
          <Block
            icon="🔕"
            title="Ce qui compte dans la cloche"
            hint="Compter : dans le compteur et en notification. Discret : dans la liste seulement. Masqué : nulle part. Une version Renovate sur plusieurs repos ne fait déjà qu'une ligne."
          >
            <SetBellKinds
              prefs={draft.ui?.bellKinds ?? {}}
              onChange={(bellKinds) => setDraft({ ...draft, ui: { ...(draft.ui ?? {}), bellKinds } })}
            />
          </Block>
          <Block
            icon="💬"
            title="Notifications du bureau"
            hint="Une alerte du système quand un événement arrive (CI cassée, PR mergée…), en plus de la cloche."
          >
            <p className="set-state">
              État : <strong>{NOTIF_LABEL[bell]}</strong>
            </p>
            <div className="set-add">
              <button
                onClick={() => void toggleNotifications().then(setBell)}
                disabled={bell === 'unsupported' || bell === 'insecure' || bell === 'denied'}
              >
                {bell === 'default'
                  ? 'Autoriser'
                  : bell === 'muted'
                    ? 'Activer'
                    : 'Mettre en sourdine'}
              </button>
              <button
                onClick={() => {
                  setNotifLog('…')
                  testNotification(setNotifLog)
                }}
                disabled={bell !== 'on'}
              >
                🔔 Tester
              </button>
            </div>

            {notifLog ? <p className="set-notif-log">{notifLog}</p> : null}
            <p className="set-hint">
              Rien à l'écran alors que le test dit « affichée » ? C'est macOS : Réglages Système → Notifications → ton
              navigateur, style <strong>Alertes</strong> (les bannières s'effacent en 5 s), et surtout{' '}
              <strong>mode Concentration désactivé</strong> : il les avale sans rien dire.
            </p>
          </Block>
          <Block
            icon="🔴"
            title="Compteur sur l'icône de l'appli"
            hint="Le nombre sur l'icône de l'appli de bureau (Dock sur Mac, barre des tâches sur Windows). Les compteurs de la barre de gauche et de la cloche ne changent pas."
          >
            <div className="set-toggles">
              {(
                [
                  ['badgeTabs', 'Non-lus des sites', 'messages de Gmail, Chat, WhatsApp… (sauf les sites aux notifications coupées)'],
                  ['badgeBell', 'Notifications de la cloche', 'CI, PRs mergées, branches à nettoyer, Renovate…'],
                ] as const
              ).map(([key, label, hint]) => (
                <label className="set-toggle" key={key}>
                  <input
                    type="checkbox"
                    checked={(draft.ui?.[key] as boolean | undefined) ?? true}
                    onChange={(e) => setDraft({ ...draft, ui: { ...(draft.ui ?? {}), [key]: e.target.checked } })}
                  />
                  <span>
                    {label}
                    <em>{hint}</em>
                  </span>
                </label>
              ))}
            </div>
            {desktop?.openNotificationSettings ? (
              <p className="set-hint">
                Rien sur l'icône ? Le système doit l'autoriser
                {desktop.platform === 'darwin' ? " (« Pastilles de l'app » pour homedash)" : ''} :{' '}
                <button className="set-inline-btn" onClick={() => desktop?.openNotificationSettings?.()}>
                  ouvrir les réglages de notifications {desktop.platform === 'darwin' ? 'du Mac' : 'de Windows'}
                </button>
              </p>
            ) : null}
          </Block>
        </Card>
        ) : null}
        </div>

        {/* Pages de l'Aide : rien à enregistrer, sauf un brouillon laissé ailleurs. */}
        {active.startsWith('help-') && !dirty ? null : (
        <div className={`set-actions${dirty ? ' is-dirty' : ''}`}>
          <span className="set-actions-note">
            {dirty
              ? '● Modifications non enregistrées'
              : '✓ Tout est enregistré. Les connexions (GitHub, Basecamp, Trello) et les sauvegardes s’appliquent dès le clic ; le reste attend « Enregistrer ».'}
          </span>
          <button className="set-cancel" onClick={() => setDraft(config)} disabled={saving || !dirty}>
            Annuler
          </button>
          <button className="set-save" onClick={() => onSave(cleaned(draft))} disabled={saving || !dirty}>
            {saving ? 'enregistrement…' : dirty ? `Enregistrer  ${keys('S')}` : 'Enregistré ✓'}
          </button>
        </div>
        )}
      </div>
    </div>
  )
}
