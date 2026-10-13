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
  searchPlaceholder: string
}

/** Ordre des blocs. Jetons réservés : "infos" | "repos" | "notes" | "groups". */
export type LayoutEntry = string

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
