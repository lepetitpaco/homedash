export type Link = {
  name: string
  url: string
  note?: string
  pinned?: boolean
  check?: boolean
  tags?: string
}

export type Group = {
  name: string
  icon?: string
  color?: string
  hidden?: boolean
  /** État replié initial. Le choix fait dans le navigateur prend ensuite le dessus. */
  collapsed?: boolean
  links: Link[]
}

export type RepoItem = {
  name: string
  owner?: string
  note?: string
  /** Onglets où le repo a sa carte : absent = l'onglet GitHub seulement. */
  in?: RepoTab[]
}

/** `github` = une ligne dans la carte Repos de l'onglet GitHub ; `links` = une carte dans Raccourcis. */
export type RepoTab = 'github' | 'links'

export const repoTabs = (item: RepoItem): RepoTab[] => item.in ?? ['github']

export type RepoAction = {
  label: string
  path: string
  highlight?: boolean
}

export type ReposConfig = {
  title?: string
  icon?: string
  color?: string
  /** Propriétaire d'une entrée qui n'en a pas. */
  defaultOwner?: string
  /** Absent = l'utilisateur observé du premier compte GitHub. */
  me?: string
  /** Onglets proposés sur chaque repo. `{owner}` / `{repo}` sont interpolés dans `path`. */
  actions?: RepoAction[]
  /** `null` / absent = bouton masqué. `{owner}` et `{repo}` sont interpolés. */
  cloneTemplate?: string | null
  cloneLabel?: string
  items: RepoItem[]
}

export type InfoItem = {
  label: string
  value: string
  note?: string
  secret?: boolean
}

export type InfoGroup = {
  title: string
  icon?: string
  color?: string
  items: InfoItem[]
}

export type InfosConfig = {
  title?: string
  icon?: string
  color?: string
  revealLabel?: string
  hideLabel?: string
  groups: InfoGroup[]
}

export type NotesConfig = {
  enabled?: boolean
  title?: string
  icon?: string
  color?: string
  placeholder?: string
  emptyLabel?: string
}

export type StatsConfig = {
  enabled?: boolean
  title?: string
  icon?: string
  color?: string
  count?: number
}

export type UiConfig = {
  theme: 'dark' | 'light'
  /** Titre de la rangée des épinglés (rangée du haut). */
  pinnedTitle: string
  /** Titre de la rangée classée par nombre d'ouvertures (rangée du bas). */
  tilesTitle: string
  sidebarWidth: number
  favicons: boolean
  faviconProvider: string
  maxTiles: number
  /** Largeur du rail de titre, à gauche de chaque bande. */
  railWidth: number
  /** Largeur mini d'un lien dans une bande : plus elle est basse, plus il y a de liens par rangée. */
  linkWidth: number
  /** Largeur de la page en % de l'écran (100 = tout l'écran), centrée. */
  pageWidth: number
  /** Colonnes de cartes des onglets GitHub et Local ; 0 = autant que l'écran en contient. */
  cardColumns: number
  /** Largeur mini d'une carte GitHub / Local quand les colonnes sont automatiques. */
  cardWidth: number
  healthcheckInterval: number
  healthcheckTimeout: number
  defaultColor: string
  showClock: boolean
  showTiles: boolean
  showFooter: boolean
  /** Pastille de l'icône de l'appli (Dock, barre des tâches) : non-lus des onglets perso. */
  badgeTabs: boolean
  /** …et nouveautés de la cloche (CI, PRs, branches à nettoyer…). */
  badgeBell: boolean
  searchPlaceholder: string
  /** Minutes sans y aller avant qu'un onglet perso en veille soit déchargé. */
  tabSleepMinutes: number
  /**
   * Liens de homedash (raccourcis, GitHub, recherche…) dans l'appli de bureau :
   * `app` = l'onglet perso du site, sinon un onglet éphémère ; `browser` = le
   * navigateur. Sans effet dans un navigateur.
   */
  openLinks: 'app' | 'browser'
  /**
   * Appli de bureau : un onglet ouvert par un lien (en haut du dash ou d'un onglet
   * perso) est gardé à la relance (`true`) ou éphémère (défaut).
   */
  linkTabsKept: boolean
  /** Journal de performance dans data/perf/ (Réglages → Affichage). Désactivé par défaut. */
  perfLog: boolean
  /** Accueil : carte « Pour commencer » masquée (Réglages → Affichage la remet). */
  setupHidden: boolean
}

/**
 * Onglet ajouté par l'utilisateur : un site ou un fichier / dossier du disque.
 * `url` : `https://…`, ou un chemin (`~/…`, `/Users/…`, `file://…`) servi en
 * lecture seule par `/api/file`.
 */
export type CustomTab = {
  /** `x-…`, stable : sert de clé d'onglet (mémorisé dans le navigateur). */
  id: string
  icon?: string
  label: string
  url: string
  /** Affiché dans la page (iframe). Absent / faux = ouvert dans un onglet du navigateur. */
  embed?: boolean
  /**
   * Appli de bureau : compte de connexion (`tabSessions[].id`). Les onglets
   * d'un même compte partagent leurs cookies ; absent / inconnu = commun.
   */
  session?: string
  /** Dossier de la barre de gauche (`tabFolders[].id`) ; absent / inconnu = hors dossier. */
  folder?: string
  /**
   * Appli de bureau : un lien vers ce site, cliqué dans un autre onglet perso,
   * s'ouvre ici plutôt que dans le navigateur. Absent = oui.
   */
  capture?: boolean
  /** Autres domaines dont les liens s'ouvrent ici (`twitter.com` pour X). */
  domains?: string[]
  /**
   * Onglet ouvert par un lien (éphémère, ou gardé) : l'espace d'où il vient, en
   * haut duquel il s'affiche : `links` (le dash) ou `x:<id>` (un onglet perso).
   * Absent, ou espace disparu = éphémère seul, dans la barre de gauche.
   */
  parent?: string
  /**
   * Mise en veille : déchargé (mémoire libérée) après `ui.tabSleepMinutes` sans
   * y être allé, rechargé au clic. Absent = jamais (on garde notifs et non-lus).
   */
  sleep?: boolean
  /**
   * Appli de bureau : chargé dès le démarrage (ses non-lus sont suivis sans
   * l'ouvrir) plutôt qu'au premier clic. Absent = selon le site (mails,
   * messageries et réseaux sociaux oui, le reste non), pour ménager la mémoire.
   */
  preload?: boolean
  /**
   * Faux = l'onglet ne remonte rien : ni pastille de non-lus (barre, Dock), ni
   * notifications du site. Absent = oui.
   */
  notify?: boolean
  /**
   * Onglet éphémère gardé : survit au rechargement et à la fermeture de l'appli,
   * rangé avec les éphémères (en bas de la barre) plutôt qu'avec les onglets
   * perso, et ne capte pas les liens des autres onglets.
   */
  kept?: boolean
}

/** Dossier de la barre de gauche : regroupe des onglets perso, se replie. */
export type TabFolder = {
  id: string
  name: string
  icon?: string
  /** Couleur du dossier dans la barre (#rrggbb). */
  color?: string
  /** Compte de tout le dossier (id de `tabSessions`) : repris par les sites qu'on y ajoute. */
  session?: string
}

/**
 * Compte de connexion, comme un conteneur Firefox : ses onglets partagent des
 * cookies à part. La session suit l'`id` : renommer ne déconnecte pas.
 */
export type TabSession = {
  id: string
  name: string
  color: string
}

/** Ordre des blocs. Jetons réservés : "infos" | "repos" | "notes" | "groups". */
export type LayoutEntry = string

/** Ce qu'on peut couper : l'onglet disparaît, et le serveur ne lit plus le service. */
export type Feature = 'github' | 'basecamp' | 'local'

export const featureOn = (cfg: Pick<Config, 'features'> | null | undefined, f: Feature): boolean =>
  cfg?.features?.[f] !== false

export type Config = {
  title?: string
  subtitle?: string
  ui?: Partial<UiConfig>
  /** Blocs de la rangée du haut, sous les tuiles. Mêmes jetons que `layout`. */
  sidebar?: LayoutEntry[]
  layout?: LayoutEntry[]
  /** Ordre des cartes de l'onglet GitHub. Jetons `gh:*` uniquement. */
  githubLayout?: LayoutEntry[]
  repos?: ReposConfig
  infos?: InfosConfig | InfoGroup[]
  notes?: NotesConfig
  stats?: StatsConfig
  groups: Group[]
  /** Comptes GitHub : `{id, label, …réglages}`. Le serveur convertit les anciens formats au chargement. */
  github_accounts?: Record<string, unknown>[]
  /** Onglet Local — `roots`, `max_depth`, `ignore`… lus par le backend. */
  local?: Record<string, unknown>
  /** Ordre des tuiles épinglées (ids `groupe/nom`). Absent ou incomplet : ordre des catégories. */
  pinnedOrder?: string[]
  /** Onglets ajoutés par l'utilisateur, entre Basecamp et Réglages. Absent = aucun. */
  tabs?: CustomTab[]
  /** Dossiers de la barre de gauche, dans l'ordre. Absent = aucun. */
  tabFolders?: TabFolder[]
  /** Comptes de connexion des onglets perso (appli de bureau). Absent = aucun. */
  tabSessions?: TabSession[]
  /** Fonctionnalités coupées (Réglages → Fonctionnalités) : `false` = coupée, absent = active. */
  features?: Partial<Record<Feature, boolean>>
  /** Onglet Basecamp. Tout est facultatif : absent = défaut. */
  basecamp?: {
    /** Projets masqués (ids). Absent = tout afficher, y compris les nouveaux. */
    hidden?: string[]
  }

  /** @deprecated — remplacé par ui.favicons, conservé pour compatibilité. */
  favicons?: boolean
  /** @deprecated — remplacé par ui.healthcheckInterval. */
  healthcheckInterval?: number
}

/** Un lien à plat, enrichi de son groupe d'origine. */
export type FlatLink = Link & {
  id: string
  /** Position dans son groupe — sert de référence pour l'édition. */
  index: number
  group: string
  icon?: string
  color: string
}

export type Health = 'unknown' | 'checking' | 'up' | 'down'
