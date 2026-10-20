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
import { repoTabs, type RepoTab } from '../types'

export const DEFAULT_UI: UiConfig = {
  theme: 'dark',
  pinnedTitle: '📌 Épinglés',
  tilesTitle: 'Les plus utilisés',
  sidebarWidth: 420,
  favicons: true,
  faviconProvider: 'https://www.google.com/s2/favicons?domain={host}&sz=64',
  maxTiles: 12,
  railWidth: 220,
  linkWidth: 260,
  pageWidth: 60,
  cardColumns: 2,
  cardWidth: 560,
  healthcheckInterval: 60,
  healthcheckTimeout: 4000,
  defaultColor: '#7c8698',
  showClock: true,
  showTiles: true,
  showFooter: true,
  searchPlaceholder: 'Rechercher…   /  ou  ⌘K',
  tabSleepMinutes: 5,
  perfLog: false,
}

/**
 * Presets d'affichage (Réglages → Affichage). Les valeurs par défaut sont
 * celles du 49" : l'écran de la plupart des utilisateurs. La largeur de page ne
 * descend jamais sous 1 400 px (base.css), donc 60 % reste sain sur un portable.
 */
export const DISPLAY_PRESETS: { id: string; label: string; hint: string; ui: Partial<UiConfig> }[] = [
  {
    id: 'uw49',
    label: 'Ultra-wide 49"',
    hint: '5120 px : page centrée à 60 %, GitHub sur 2 colonnes',
    ui: { pageWidth: 60, cardColumns: 2, linkWidth: 260, railWidth: 220, sidebarWidth: 420, maxTiles: 12 },
  },
  {
    id: 'uw34',
    label: 'Ultra-wide 34"',
    hint: '3440 px : page à 75 %, GitHub sur 2 colonnes',
    ui: { pageWidth: 75, cardColumns: 2, linkWidth: 240, railWidth: 220, sidebarWidth: 380, maxTiles: 10 },
  },
  {
    id: 'mbp',
    label: 'MacBook Pro',
    hint: '14" / 16" (1512–1728 px) : toute la largeur, GitHub sur 2 colonnes',
    ui: { pageWidth: 100, cardColumns: 2, linkWidth: 220, railWidth: 180, sidebarWidth: 300, maxTiles: 8 },
  },
]

/** Réglages de taille : [clé, minimum, maximum]. 0 ou vide = valeur par défaut. */
export const SIZE_LIMITS: [keyof UiConfig & ('railWidth' | 'linkWidth' | 'sidebarWidth' | 'cardWidth' | 'pageWidth'), number, number][] = [
  ['railWidth', 120, 480],
  ['linkWidth', 120, 800],
  ['sidebarWidth', 200, 1200],
  ['cardWidth', 280, 1600],
  ['pageWidth', 30, 100],
]

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
export const DEFAULT_GH_LAYOUT: string[] = ['repos', ...GH_TOKENS]

/**
 * Une liste d'onglet contient toujours `repos` : ce sont les pastilles
 * GitHub / Accueil de chaque repo qui décident de ce qui s'affiche où. Une
 * liste écrite à la main sans `repos` le reçoit à `at`.
 */
function withRepos(list: string[], at: number): string[] {
  if (list.includes('repos')) return list
  const out = [...list]
  out.splice(Math.max(0, at), 0, 'repos')
  return out
}

// Une variante par jeton : TypeScript ne discrimine un membre que si son `kind`
// est un littéral, pas une union.
export type ResolvedSection =
  | { kind: 'gh:branches'; key: string }
  | { kind: 'gh:prs'; key: string }
  | { kind: 'gh:renovate'; key: string }
  | { kind: 'gh:merged'; key: string }
  | { kind: 'infos'; key: string }
  /** `tab` : chaque onglet ne montre que les repos cochés pour lui (Réglages → Repos suivis). */
  | { kind: 'repos'; key: string; tab?: RepoTab }
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
  // Les groupes vides restent : un groupe tout juste créé depuis la page doit
  // apparaître pour qu'on puisse y ajouter sa première info. Les index sont
  // ceux du JSON, c'est ce que les menus d'édition désignent.
  const groups = (infos.groups ?? []).map((g: InfoGroup) => ({ ...g, items: g.items ?? [] }))
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
  const me = typeof github?.me === 'string' ? github.me : undefined
  const items = raw?.items ?? []
  if (items.length === 0) return undefined

  return {
    ...raw,
    items,
    defaultOwner: raw?.defaultOwner ?? '',
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
  // Tailles de mise en page : 0, vide ou absurde = défaut ; sinon bornées. Une
  // colonne de titres ou un lien à 0 px cassait toute la grille.
  {
    // Mise en veille des onglets : entre 1 min et 1 jour, sinon le défaut.
    const v = Number(ui.tabSleepMinutes)
    ui.tabSleepMinutes = Number.isFinite(v) && v >= 1 ? Math.min(1440, Math.round(v)) : DEFAULT_UI.tabSleepMinutes
  }
  for (const [key, min, max] of SIZE_LIMITS) {
    const v = Number(ui[key])
    ui[key] = !Number.isFinite(v) || v <= 0 ? DEFAULT_UI[key] : Math.min(max, Math.max(min, v))
  }

  // On garde les catégories vides : sinon une catégorie tout juste créée, ou dont
  // on vient de supprimer le dernier lien, disparaîtrait de la page.
  const groups = (raw.groups ?? []).filter((g) => g?.name && Array.isArray(g.links))
  const infos = normalizeInfos(raw.infos)
  const repos = normalizeRepos(raw.repos, raw.github_accounts?.[0])
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
  const sections = resolveList(withRepos(layout, layout.indexOf('infos') + 1), groups, has, used, namedAnywhere)
  // `used` séparé : l'onglet GitHub est une page à part, ses cartes ne sont pas
  // en concurrence avec celles du tableau principal.
  const githubSections = resolveList(
    withRepos(raw.githubLayout?.length ? raw.githubLayout : DEFAULT_GH_LAYOUT, 0),
    groups,
    has,
    new Set<string>(),
    namedAnywhere,
  )
  // La carte Repos d'un onglet ne montre que les repos cochés pour lui ; sans
  // aucun, elle n'apparaît pas dans cet onglet.
  const tagRepos = (list: ResolvedSection[], tab: RepoTab) =>
    list
      .filter((s) => s.kind !== 'repos' || (repos?.items ?? []).some((i) => repoTabs(i).includes(tab)))
      .map((s) => (s.kind === 'repos' ? { ...s, tab } : s))
  sections.splice(0, sections.length, ...tagRepos(sections, 'links'))
  githubSections.splice(0, githubSections.length, ...tagRepos(githubSections, 'github'))

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
