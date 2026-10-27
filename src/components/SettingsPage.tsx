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
import { DEFAULT_GH_LAYOUT, DEFAULT_UI, DISPLAY_PRESETS, SIZE_LIMITS } from '../lib/config'
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
import SetBackups from './SetBackups'
import SetBasecamp from './SetBasecamp'
import SetTrello from './SetTrello'
import SetConnect from './SetConnect'
import SetLocal from './SetLocal'
import SetRenovate from './SetRenovate'
import SetRepos, { type Use } from './SetRepos'
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
const MERGED: Record<string, string> = { 'set-account': 'set-github', 'set-repos': 'set-github', 'set-ghtab': 'set-github', 'set-links': 'set-tabs' }
const sectionOf = (id: string) => MERGED[id] ?? id

/**
 * Parties de la page, dans l'ordre, rangées par thème : le menu de gauche les
 * groupe sous un intertitre et affiche l'une ou l'autre.
 */
const SECTIONS = [
  { id: 'set-features', icon: '🧩', label: 'Fonctionnalités', group: 'Général' },
  { id: 'set-github', icon: '🐙', label: 'GitHub', group: 'GitHub' },
  { id: 'set-local', icon: '💻', label: 'Dépôts locaux', group: 'GitHub' },
  { id: 'set-basecamp', icon: '🏕', label: 'Basecamp', group: 'Connexions' },
  { id: 'set-trello', icon: '📋', label: 'Trello', group: 'Connexions' },
  { id: 'set-tabs', icon: '🗂', label: 'Mes sites', group: 'La page' },
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

/** Bornes d'un réglage de taille (vide = défaut), ou rien pour les autres. */
const limitOf = (key: string) => SIZE_LIMITS.find(([k]) => k === key)

/** Réglages numériques de « Affichage » : ce que chacun change, en une phrase. */
const DISPLAY_FIELDS: {
  title: string
  icon: string
  hint: string
  fields: {
    key: 'maxTiles' | 'linkWidth' | 'railWidth' | 'sidebarWidth' | 'healthcheckInterval' | 'pageWidth' | 'cardColumns' | 'cardWidth'
    label: string
    unit?: string
    hint: string
  }[]
}[] = [
  {
    title: 'Onglet Raccourcis',
    icon: '🔗',
    hint: 'Tailles et rythme de l’accueil. Vide = la valeur par défaut.',
    fields: [
      { key: 'maxTiles', label: 'Tuiles « les plus utilisés »', hint: 'nombre de liens dans la rangée des plus cliqués' },
      { key: 'linkWidth', label: 'Largeur d’un lien', unit: 'px', hint: 'plus petit = plus de liens par ligne' },
      { key: 'railWidth', label: 'Largeur des noms de catégorie', unit: 'px', hint: 'la colonne de gauche de chaque catégorie de liens, où s’affiche son nom' },
      { key: 'sidebarWidth', label: 'Blocs Notes / Stats', unit: 'px', hint: 'largeur mini de chaque bloc sous les tuiles' },
      { key: 'healthcheckInterval', label: 'Test des voyants', unit: 's', hint: 'fréquence de vérification des liens surveillés' },
    ],
  },
  {
    title: 'Mise en page',
    icon: '📐',
    hint: 'Largeur de la page et des cartes GitHub / Local.',
    fields: [
      { key: 'pageWidth', label: 'Largeur de la page', unit: '%', hint: 'part de l’écran occupée, centrée — 100 = tout l’écran ; jamais moins de 1 400 px' },
      { key: 'cardColumns', label: 'Colonnes GitHub / Local', hint: 'nombre de cartes côte à côte — 0 = selon la largeur de l’écran' },
      { key: 'cardWidth', label: 'Largeur d’une carte', unit: 'px', hint: 'onglets GitHub et Local, quand « Colonnes » est à 0 : largeur minimum d’une carte. Exemple sur un écran de 1 800 px : 560 → 3 cartes par ligne, 400 → 4' },
    ],
  },
]

/** Une partie d'une carte de réglages : icône, titre et une phrase qui dit à quoi elle sert. */
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
}

/** Pages de l'Aide qui ne viennent pas de GUIDE.md. */
const NEWS = { id: 'help-news', icon: '📜', label: 'Nouveautés', group: 'Aide' }
const ERRORS = { id: 'help-errors', icon: '🧾', label: "Journal d'erreurs", group: 'Aide' }
/** Le guide (GUIDE.md) : une seule entrée du menu, ses parties en pastilles dans la page. */
const GUIDE = { id: 'help-guide', icon: '📖', label: 'Guide', group: 'Aide' }
/** Seulement si le journal de performance a des mesures (Réglages → Affichage). */
const PERF = { id: 'help-perf', icon: '📈', label: 'Journal de performance', group: 'Aide' }
const GUIDE_PART_KEY = 'homedash:guide-part'

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

export default function SettingsPage({ config, onSave, onReload, saving, changelog }: Props) {
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
  const nav = [...SECTIONS.filter((sec) => shown(sec.id)), NEWS, GUIDE, ERRORS, ...(hasPerf ? [PERF] : [])]
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
  // Une seule partie à l'écran ; le menu de gauche passe de l'une à l'autre.
  // Mémorisée : on revient là où on réglait.
  const [active, setActive] = useState<string>(() => {
    try {
      const raw = localStorage.getItem(SECTION_KEY)
      const saved = raw && sectionOf(raw)
      // `help-…` : une page de l'Aide (le guide arrive après, son menu aussi).
      if (saved && (SECTIONS.some((sec) => sec.id === saved) || saved.startsWith('help-'))) return saved
    } catch {
      /* stockage indisponible */
    }
    return SECTIONS[0].id
  })
  // Ancienne page du guide mémorisée (`help-raccourcis`…) : le guide, sur cette partie.
  useEffect(() => {
    if (!guide || !active.startsWith('help-') || [NEWS.id, GUIDE.id, ERRORS.id, PERF.id].includes(active)) return
    if (guide.some((p) => p.id === active)) setGuidePart(active)
    setActive(GUIDE.id)
  }, [active, guide])
  useEffect(() => {
    const go = (e: Event) => setActive(sectionOf((e as CustomEvent<string>).detail))
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

  const jump = (id: string) => {
    setActive(id)
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
              ＋ compte
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
                créer
              </button>
              <button onClick={() => setNewLabel(null)}>annuler</button>
            </span>
          )}
          <span className="set-hint set-accounts-hint">
            Toute la page concerne le compte choisi ici. Chaque compte a son jeton et est suivi en
            parallèle ; l'onglet GitHub choisit lequel il affiche.
          </span>
        </div>
        ) : null}

        <div className="set-cards">
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
        </Card>
        ) : null}

        {active === 'set-github' ? (
        <Card id="set-github" icon="🐙" title={`GitHub · ${labelOf(gh)}`}>
          <Block icon="🔑" title="Connexion" hint="Le jeton qui permet à homedash de lire ce compte GitHub.">
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
          </Block>
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
        </Card>
        ) : null}
        {active === 'set-trello' ? (
        <Card id="set-trello" icon="📋" title="Trello">
          <SetTrello />
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
          <h3 className="set-sub set-sub-gap">🔗 Liens, onglets et veille</h3>
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
        </Card>
        ) : null}
        {active === 'set-local' ? (
        <Card id="set-local" icon="💻" title="Dépôts locaux">
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
                  {changelog.busy ? 'vérification…' : 'vérifier maintenant'}
                </button>
              </p>
              <ChangelogBody data={changelog.data} />
            </div>
          ) : (
            <p className="set-hint">chargement…</p>
          )}
        </Card>
        ) : null}

        {active === ERRORS.id ? (
        <Card id={ERRORS.id} icon={ERRORS.icon} title={ERRORS.label}>
          <ErrorLog repo={changelog.data?.repo} />
        </Card>
        ) : null}

        {active === PERF.id ? (
        <Card id={PERF.id} icon={PERF.icon} title={PERF.label}>
          <PerfLog />
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
          <Block icon="🖥" title="Taille de l'écran" hint="Un clic règle toutes les tailles ci-dessous d'un coup ; ajuste ensuite si besoin.">
            <div className="set-presets">
              {DISPLAY_PRESETS.map((p) => {
                const on = Object.entries(p.ui).every(
                  ([k, v]) => ((draft.ui?.[k as keyof typeof p.ui] as number | undefined) || DEFAULT_UI[k as keyof typeof p.ui]) === v,
                )
                return (
                  <button
                    key={p.id}
                    className={`set-preset${on ? ' is-on' : ''}`}
                    onClick={() => setDraft({ ...draft, ui: { ...(draft.ui ?? {}), ...p.ui } })}
                  >
                    <strong>{p.label}</strong>
                    <span>{p.hint}</span>
                  </button>
                )
              })}
            </div>
          </Block>
          {DISPLAY_FIELDS.map((section) => (
            <Block key={section.title} icon={section.icon} title={section.title} hint={section.hint}>
              <div className="set-grid">
                {section.fields.map(({ key, label, unit, hint }) => (
                  <label className="set-field" key={key}>
                    <span>
                      {label} {unit ? <b className="set-unit">{unit}</b> : null}
                      <em>{hint}</em>
                    </span>
                    <input
                      type="number"
                      min={limitOf(key)?.[1] ?? 0}
                      max={limitOf(key)?.[2]}
                      placeholder={`${DEFAULT_UI[key]} (défaut)`}
                      value={(draft.ui?.[key] as number | undefined) || (limitOf(key) ? '' : (draft.ui?.[key] ?? ''))}
                      onChange={(e) => {
                        const ui: Record<string, unknown> = { ...(draft.ui ?? {}) }
                        const v = num(e.target.value, 0)
                        // Taille vidée ou à 0 : on retire la clé, le défaut s'applique.
                        if (limitOf(key) && v <= 0) delete ui[key]
                        else ui[key] = v
                        setDraft({ ...draft, ui })
                      }}
                    />
                  </label>
                ))}
              </div>
            </Block>
          ))}
          <Block
            icon="⏱"
            title="Journal de performance"
            hint="Pour comprendre une lenteur : note ce qui prend du temps. Inutile au quotidien."
          >
            <SetPerf
              enabled={draft.ui?.perfLog === true}
              onEnabled={(perfLog) => setDraft({ ...draft, ui: { ...(draft.ui ?? {}), perfLog } })}
            />
          </Block>
        </Card>
        ) : null}
        {active === 'set-notifs' ? (
        <Card id="set-notifs" icon="🔔" title="Notifications">
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
            title="Pastille de l'icône de l'appli"
            hint="Le nombre sur l'icône de l'appli de bureau (Dock sur Mac, barre des tâches sur Windows). Les pastilles de la barre de gauche et de la cloche ne changent pas."
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
