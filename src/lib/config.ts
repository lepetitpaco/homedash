import type {
  Config,
  Group,
  InfoGroup,
  InfosConfig,
  NotesConfig,
  RepoAction,
  StatsConfig,
  ReposConfig,
  UiConfig,
} from '../types'

export const DEFAULT_UI: UiConfig = {
  theme: 'dark',
  pinnedTitle: '📌 Épinglés',
  tilesTitle: 'Les plus utilisés',
  sidebarWidth: 320,
  favicons: true,
  faviconProvider: 'https://www.google.com/s2/favicons?domain={host}&sz=64',
  maxTiles: 10,
  railWidth: 232,
  linkWidth: 280,
  healthcheckInterval: 60,
  healthcheckTimeout: 4000,
  defaultColor: '#7c8698',
  showClock: true,
  showTiles: true,
  showFooter: true,
  searchPlaceholder: 'Rechercher…   /  ou  ⌘K',
}

const DEFAULT_REPO_ACTIONS: RepoAction[] = [
  { label: 'PRs', path: '/pulls' },
  { label: 'Branches', path: '/branches' },
  { label: 'Actions', path: '/actions' },
  { label: 'Issues', path: '/issues' },
  { label: 'Commits', path: '/commits' },
]

const DEFAULT_LAYOUT = ['infos', 'repos', 'groups']
const DEFAULT_SIDEBAR = ['notes', 'stats']

export type GhKind = 'gh:branches' | 'gh:prs' | 'gh:renovate' | 'gh:merged'

export const GH_TOKENS: GhKind[] = ['gh:branches', 'gh:prs', 'gh:renovate', 'gh:merged']

// Une variante par jeton : TypeScript ne discrimine un membre que si son `kind`
// est un littéral, pas une union.
export type ResolvedSection =
  | { kind: 'gh:branches'; key: string }
  | { kind: 'gh:prs'; key: string }
  | { kind: 'gh:renovate'; key: string }
  | { kind: 'gh:merged'; key: string }
  | { kind: 'infos'; key: string }
  | { kind: 'repos'; key: string }
  | { kind: 'notes'; key: string }
  | { kind: 'stats'; key: string }
  | { kind: 'group'; key: string; group: Group }

export type Normalized = {
  title: string
  subtitle?: string
  ui: UiConfig
  groups: Group[]
  repos?: ReposConfig
  infos?: InfosConfig
  notes: NotesConfig
  stats: StatsConfig
  /** Rangée du haut, sous les tuiles. */
  sidebar: ResolvedSection[]
  /** Tableau principal. */
  sections: ResolvedSection[]
  /** Cartes de l'onglet GitHub — liste indépendante du tableau principal. */
  githubSections: ResolvedSection[]
}

/** `infos` accepte l'ancienne forme (tableau de groupes) ou la nouvelle (objet). */
function normalizeInfos(raw: Config['infos']): InfosConfig | undefined {
  if (!raw) return undefined
  const infos: InfosConfig = Array.isArray(raw) ? { groups: raw } : raw
  const groups = (infos.groups ?? []).filter((g: InfoGroup) => g.items?.length > 0)
  if (groups.length === 0) return undefined
  return {
    title: infos.title ?? 'Infos & accès',
    icon: infos.icon ?? '🔑',
    color: infos.color ?? '#38bdf8',
    revealLabel: infos.revealLabel ?? '👁 afficher',
    hideLabel: infos.hideLabel ?? '🙈 masquer',
    groups,
  }
}

/**
 * La carte Repos montre `repos.items`, et rien d'autre : c'est la pastille
 * « Carte » de Réglages → Repos suivis qui y ajoute ou retire un repo. Elle
 * reprenait autrefois aussi les repos de la section `github` ; depuis que ceux-ci
 * s'écrivent `propriétaire/repo`, ils ne retrouvaient plus leur entrée (rangée
 * sous le nom court) et chaque repo s'affichait deux fois.
 */
function normalizeRepos(
  raw: ReposConfig | undefined,
  github: Record<string, unknown> | undefined,
): ReposConfig | undefined {
  const org = typeof github?.org === 'string' ? github.org : undefined
  const me = typeof github?.me === 'string' ? github.me : undefined
  const items = raw?.items ?? []
  if (items.length === 0) return undefined

  return {
    ...raw,
    items,
    defaultOwner: raw?.defaultOwner ?? org ?? '',
    me: raw?.me ?? me,
    title: raw?.title ?? 'Repos',
    icon: raw?.icon ?? '🐙',
    color: raw?.color ?? '#a78bfa',
    actions: raw?.actions ?? DEFAULT_REPO_ACTIONS,
    cloneTemplate:
      raw?.cloneTemplate === undefined
        ? 'git clone git@github.com:{owner}/{repo}.git'
        : raw.cloneTemplate,
    cloneLabel: raw?.cloneLabel ?? 'clone',
  }
}

function normalizeNotes(raw: NotesConfig | undefined): NotesConfig {
  return {
    enabled: raw?.enabled ?? true,
    title: raw?.title ?? 'Notes',
    icon: raw?.icon ?? '📝',
    color: raw?.color ?? '#facc15',
    placeholder: raw?.placeholder ?? 'Écris ici… la première ligne sert de titre.',
    emptyLabel: raw?.emptyLabel ?? 'Aucune note — « + nouvelle » pour commencer.',
  }
}

function normalizeStats(raw: StatsConfig | undefined): StatsConfig {
  return {
    enabled: raw?.enabled ?? true,
    title: raw?.title ?? 'Les plus ouverts',
    icon: raw?.icon ?? '📊',
    color: raw?.color ?? '#60a5fa',
    count: raw?.count ?? 6,
  }
}

/**
 * Résout une liste de jetons en blocs affichables.
 * Jetons réservés : infos / repos / notes / groups (= toutes les catégories restantes).
 * `used` est partagé entre la rangée du haut et le tableau : un bloc placé en
 * haut n'est pas dupliqué en dessous.
 */
function resolveList(
  entries: string[],
  groups: Group[],
  has: { infos: boolean; repos: boolean; notes: boolean; stats: boolean },
  used: Set<string>,
  namedAnywhere: Set<string>,
): ResolvedSection[] {
  const byName = new Map(groups.map((g) => [g.name.toLowerCase(), g]))
  const sections: ResolvedSection[] = []

  const pushGroup = (group: Group) => {
    const key = `group:${group.name}`
    if (used.has(key) || group.hidden) return
    used.add(key)
    sections.push({ kind: 'group', key, group })
  }

  for (const entry of entries) {
    const token = entry.toLowerCase()
    if ((GH_TOKENS as string[]).includes(token)) {
      if (used.has(token)) continue
      used.add(token)
      sections.push({ kind: token as GhKind, key: token })
    } else if (token === 'infos' || token === 'repos' || token === 'notes' || token === 'stats') {
      if (used.has(token)) continue
      if (token === 'infos' && !has.infos) continue
      if (token === 'repos' && !has.repos) continue
      if (token === 'notes' && !has.notes) continue
      if (token === 'stats' && !has.stats) continue
      used.add(token)
      sections.push({ kind: token, key: token })
    } else if (token === 'groups') {
      for (const g of groups) if (!namedAnywhere.has(g.name.toLowerCase())) pushGroup(g)
    } else {
      const group = byName.get(token)
      if (group) pushGroup(group)
    }
  }
  return sections
}

export function normalizeConfig(raw: Config): Normalized {
  const ui: UiConfig = {
    ...DEFAULT_UI,
    // compat avec les clés de premier niveau de la v1
    ...(raw.favicons !== undefined ? { favicons: raw.favicons } : {}),
    ...(raw.healthcheckInterval !== undefined
      ? { healthcheckInterval: raw.healthcheckInterval }
      : {}),
    ...(raw.ui ?? {}),
  }
  if (ui.theme !== 'light' && ui.theme !== 'dark') ui.theme = DEFAULT_UI.theme

  // On garde les catégories vides : sinon une catégorie tout juste créée, ou dont
  // on vient de supprimer le dernier lien, disparaîtrait de la page.
  const groups = (raw.groups ?? []).filter((g) => g?.name && Array.isArray(g.links))
  const infos = normalizeInfos(raw.infos)
  const repos = normalizeRepos(raw.repos, raw.github)
  const notes = normalizeNotes(raw.notes)
  const stats = normalizeStats(raw.stats)
  const layout = raw.layout?.length ? raw.layout : DEFAULT_LAYOUT
  const sidebarList = raw.sidebar?.length ? raw.sidebar : DEFAULT_SIDEBAR

  const has = {
    infos: !!infos,
    repos: !!repos,
    notes: notes.enabled !== false,
    stats: stats.enabled !== false,
  }
  const used = new Set<string>()
  const groupNames = new Set(groups.map((g) => g.name.toLowerCase()))
  // une catégorie nommée explicitement dans la sidebar ou le layout ne fait pas
  // partie du lot « groups »
  const namedAnywhere = new Set(
    [...sidebarList, ...layout].map((e) => e.toLowerCase()).filter((e) => groupNames.has(e)),
  )

  const sidebar = resolveList(sidebarList, groups, has, used, namedAnywhere)
  const sections = resolveList(layout, groups, has, used, namedAnywhere)
  // `used` séparé : l'onglet GitHub est une page à part, ses cartes ne sont pas
  // en concurrence avec celles du tableau principal.
  const githubSections = resolveList(
    raw.githubLayout?.length ? raw.githubLayout : GH_TOKENS,
    groups,
    has,
    new Set<string>(),
    namedAnywhere,
  )
  // filet de sécurité : aucune catégorie ne disparaît par oubli dans `layout`
  for (const g of groups) {
    const key = `group:${g.name}`
    if (!used.has(key) && !g.hidden) {
      used.add(key)
      sections.push({ kind: 'group', key, group: g })
    }
  }

  return {
    title: raw.title ?? 'homedash',
    subtitle: raw.subtitle,
    ui,
    groups,
    repos,
    infos,
    notes,
    stats,
    sidebar,
    sections,
    githubSections,
  }
}

/** Remplace `{owner}` / `{repo}` / `{host}` dans un gabarit de config. */
export function template(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`)
}
