/**
 * Tâche Basecamp → issue GitHub → rapport publié sur la tâche. Deux écritures,
 * chacune au clic : l'issue (`github.create_issue`) et le commentaire-rapport
 * (`basecamp.publish_report`).
 *
 * Le lien tient dans deux marqueurs, invisibles une fois rendus par GitHub :
 * `<!-- homedash:bc <adresse> -->` dans l'issue, `<!-- homedash:bc-report -->`
 * en tête du commentaire-rapport (lus par `github.fetch_bc_issues`).
 */
import type { BcIssue, BcPosted, BcTask } from './basecamp'

export const REPORT_MARK = '<!-- homedash:bc-report -->'

/** Tâche visée par une adresse Basecamp (to-do ou carte), quel que soit l'hôte ; null sinon. */
export function bcKey(url: string): string | null {
  const m = /^https?:\/\/[^/]*basecamp(?:api)?\.com\/.*?\/(todos|card_tables\/cards)\/(\d+)/.exec(url)
  return m ? `${m[1] === 'todos' ? 'todo' : 'card'}:${m[2]}` : null
}

/** Issues par tâche (`bcKey`). */
export function issuesByTask(issues: BcIssue[]): Map<string, BcIssue[]> {
  const out = new Map<string, BcIssue[]>()
  for (const i of issues) {
    const k = bcKey(i.bc_url)
    if (k) out.set(k, [...(out.get(k) ?? []), i])
  }
  return out
}

export type IssueTask = {
  url: string
  title: string
  where?: string
  /** Projet Basecamp : le repo choisi pour lui est proposé la fois suivante. */
  project?: string
}

/** Repo où créer une issue : compte GitHub de homedash et `propriétaire/repo`. */
export type IssueRepo = { account: string; repo: string }

const REPO_KEY = 'homedash:bc-issue-repo'
const repoId = (r: IssueRepo) => `${r.account} ${r.repo}`

/** Repo proposé pour une tâche : celui de son projet, sinon le dernier utilisé, sinon le premier. */
export function rememberedRepo(repos: IssueRepo[], project = ''): IssueRepo | undefined {
  let saved: Record<string, string> = {}
  try {
    saved = JSON.parse(localStorage.getItem(REPO_KEY) || '{}') as Record<string, string>
  } catch {
    /* stockage indisponible ou illisible : premier repo */
  }
  const find = (id?: string) => repos.find((r) => repoId(r) === id)
  return (project ? find(saved[project]) : undefined) ?? find(saved['']) ?? repos[0]
}

/** Retient le repo choisi pour ce projet (et comme dernier utilisé). */
export function rememberRepo(r: IssueRepo, project = '') {
  try {
    const saved = JSON.parse(localStorage.getItem(REPO_KEY) || '{}') as Record<string, string>
    saved[''] = repoId(r)
    if (project) saved[project] = repoId(r)
    localStorage.setItem(REPO_KEY, JSON.stringify(saved))
  } catch {
    /* stockage indisponible : rien de retenu */
  }
}

/**
 * Modèle du rapport : publié tel quel en commentaire de la tâche Basecamp, lu par
 * des non-développeurs. Gras et listes seulement : les intertitres `##`
 * deviennent des titres énormes dans Basecamp.
 */
export const REPORT_TEMPLATE = [
  REPORT_MARK,
  '**✅ Fait** : une phrase sur ce qui change pour les utilisateurs.',
  '',
  '**Ce qui change**',
  '- un point concret par ligne, sans jargon (ni nom de fichier, ni code, ni terme technique)',
  '',
  '**Pour le voir**',
  '- où aller et quoi faire pour le constater (lien si possible)',
  '',
  '**Version** : X.Y.Z (si le projet a des versions ; sinon retirer la ligne)',
].join('\n')

/**
 * Règles du travail confié à Claude Code, communes à l'issue et au prompt. Une
 * tâche Basecamp est souvent une conversation décousue : avant de coder, en
 * dégager le vrai besoin et la solution retenue, en termes techniques.
 */
export function claudeRules(close: string): string[] {
  return [
    "Lis le besoin et tous les échanges : sur Basecamp, une demande est souvent une conversation décousue. Dégage le vrai besoin et la meilleure solution au vu de l'ensemble, puis, si ce n'est pas déjà limpide, poste-les en commentaire de l'issue **reformulés en termes techniques** (problème, cause probable, solution retenue, ce qui sera touché). Ne modifie pas le corps de l'issue : il porte le lien vers la tâche, et sa section Besoin est la demande d'origine (reprise telle quelle de Basecamp) : en cas de doute, c'est elle qui fait foi, pas ta reformulation. Les captures (🖼) restent sur Basecamp, hors de ta portée : si l'une est indispensable, demande ce qu'elle montre.",
    "Donne-lui la ou les étiquettes qui conviennent (bug, amélioration…), choisies parmi celles du repo (`gh label list`) : n'en crée pas.",
    'Fais le travail en suivant les règles du repo (CLAUDE.md).',
    `Une fois livré, poste **un** commentaire de rapport sur l'issue, exactement au format ci-dessous (il commence par \`${REPORT_MARK}\`) : il est publié tel quel sur la tâche Basecamp. Si on te redemande un rapport final, poste-en un nouveau : le dernier fait foi.`,
    `Puis ferme l'issue : ${close}.`,
    "Si le besoin n'est pas clair, demande avant de coder plutôt que d'inventer.",
  ]
}

/** Corps d'une issue liée à une tâche : le besoin, puis le lien et la consigne pour Claude Code. */
export function issueBody(task: IssueTask, need = ''): string {
  return [
    `> 🏕 **Tâche Basecamp** : [${task.title || 'tâche'}](${task.url})`,
    ...(task.where ? [`> ${task.where}`] : []),
    '',
    '## Besoin',
    '',
    need.trim() || '_À compléter._',
    '',
    '---',
    `<!-- homedash:bc ${task.url} -->`,
    '<details><summary>Consigne pour Claude Code (issue liée à Basecamp par homedash)</summary>',
    '',
    ...claudeRules('`gh issue close <numéro> --reason completed`').map((r, n) => `${n + 1}. ${r}`),
    '',
    '```markdown',
    REPORT_TEMPLATE,
    '```',
    '',
    '</details>',
  ].join('\n')
}

/** Formulaire « nouvelle issue » de GitHub, pré-rempli (il faut y être connecté). */
export function newIssueUrl(repo: string, title: string, body: string): string {
  return `https://github.com/${repo}/issues/new?${new URLSearchParams({ title, body })}`
}

/**
 * Prompt pour confier l'issue à Claude Code. Court : la consigne (rapport, format,
 * fermeture) est dans l'issue. Sans apostrophe droite (’) : il tient entre
 * guillemets simples dans `claudeCommand`, sous zsh, bash comme PowerShell.
 */
export function claudePrompt(repo: string, number: number): string {
  return (
    `Occupe-toi de l’issue ${repo}#${number} : lis-la avec \`gh issue view ${number} -R ${repo} --comments\`. ` +
    `Elle vient d’une tâche Basecamp, souvent une conversation décousue : commence par en tirer le vrai besoin et ` +
    `la meilleure solution, reformulés en termes techniques (en commentaire de l’issue si ce n’est pas limpide), ` +
    `sans toucher au corps de l’issue ; en cas de doute, reviens à la demande d’origine (section Besoin). ` +
    `Donne-lui ses étiquettes, parmi celles du repo (\`gh label list -R ${repo}\`) sans en créer. ` +
    `Puis suis la consigne en bas de l’issue (rapport au format indiqué, puis fermeture).`
  )
}

/**
 * Prompt « c'est fini, fais le rapport final » : à coller dans la session Claude
 * Code qui a fait le travail. Le dernier rapport posté fait foi : en reposter un
 * remplace l'ancien (et le rend publiable même si l'ancien l'a été).
 */
export function reportPrompt(repo: string, number: number, notes = ''): string {
  return [
    `Le travail sur l’issue ${repo}#${number} est terminé. Vérifie tout ce qui a été fait (commits, diff, tests, ce qui est livré) par rapport à la demande d’origine (section Besoin de l’issue) et aux échanges (\`gh issue view ${number} -R ${repo} --comments\`).`,
    `Puis poste le rapport final en commentaire de l’issue (\`gh issue comment ${number} -R ${repo}\`), exactement au format ci-dessous : il est publié tel quel sur la tâche Basecamp et lu par des non-développeurs, donc clair, concret et sans jargon. S’il y a déjà un rapport, poste-en un nouveau : le dernier fait foi.`,
    `Si l’issue n’a pas encore d’étiquette, donne-lui celle qui convient parmi celles du repo (\`gh label list -R ${repo}\`, sans en créer).`,
    `Enfin, ferme l’issue si elle est encore ouverte : \`gh issue close ${number} -R ${repo} --reason completed\`.`,
    ...(notes.trim() ? ['', `Précisions pour ce rapport : ${notes.trim()}`] : []),
    '',
    REPORT_TEMPLATE,
  ].join('\n')
}

/** Commande qui lance Claude Code dans le clone local du repo, l'issue confiée. */
export function claudeCommand(dir: string, prompt: string): string {
  // `~` ne s'étend pas entre guillemets : seul le reste du chemin y va
  const at = !/\s/.test(dir) ? dir : dir.startsWith('~/') ? `~/"${dir.slice(2)}"` : `"${dir}"`
  return `cd ${at} && claude '${prompt.replace(/'/g, '’')}'`
}

/** Un échange (commentaire) de la tâche, en Markdown ; `date` complète (ISO). */
export type BcComment = { id: number; who: string; date: string; text: string }

/** Qui a créé la tâche, et quand (ISO) ; vides si Basecamp ne le dit pas. */
export type BcAuthor = { who: string; date: string }

/** Échanges retenus par défaut : les plus récents (un projet au long cours en a déjà réglé beaucoup). */
export const RECENT_COMMENTS = 5

/**
 * Contenu de la tâche, lu dans Basecamp à la demande : description et étapes
 * (`text`), et ses échanges à part (`comments`, du plus ancien au plus récent),
 * pour n'en retenir que ceux qui servent.
 */
export async function taskText(
  url: string,
): Promise<{ text: string; creator: BcAuthor; comments: BcComment[]; images: Record<string, string> }> {
  const res = await fetch(`api/basecamp/task?${new URLSearchParams({ url })}`, { cache: 'no-store' })
  const out = (await res.json().catch(() => null)) as
    | { text?: string; creator?: BcAuthor; comments?: BcComment[]; images?: Record<string, string>; error?: string }
    | null
  if (!res.ok) throw new Error(out?.error ?? `HTTP ${res.status}`)
  return { text: out?.text ?? '', creator: out?.creator ?? { who: '', date: '' }, comments: out?.comments ?? [], images: out?.images ?? {} }
}

/** Échanges retenus, en fin de Besoin (ordre chronologique). */
export function commentsMarkdown(list: BcComment[]): string {
  if (!list.length) return ''
  return ['### Échanges retenus (Basecamp)', '', ...list.map((c) => `**${c.who}** (${c.date.slice(0, 10)}) :\n${c.text}\n`)]
    .join('\n')
    .trim()
}

/** Création directe, avec le jeton du compte GitHub de homedash. */
export async function createIssue(
  account: string,
  repo: string,
  title: string,
  body: string,
): Promise<{ number: number; url: string }> {
  const res = await fetch('api/github/issue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, repo, title, body }),
  })
  const out = (await res.json().catch(() => null)) as { number: number; url: string; error?: string } | null
  if (!res.ok || !out) throw new Error(out?.error ?? `HTTP ${res.status}`)
  return out
}

/** Où vit une tâche, pour le corps de l'issue. */
export function whereOf(t: BcTask): string {
  return [t.project, t.list].filter(Boolean).join(' › ')
}

/** Publie le rapport de l'issue en commentaire de sa tâche (le serveur le lit lui-même). */
export async function publishReport(i: BcIssue): Promise<BcPosted> {
  const res = await fetch('api/basecamp/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: i.account, repo: i.repo, number: i.number }),
  })
  const out = (await res.json().catch(() => null)) as (BcPosted & { error?: string }) | null
  if (!res.ok || !out) throw new Error(out?.error ?? `HTTP ${res.status}`)
  return out
}

/** Écarte une issue sans publier son rapport (`undo` : la rétablit). Rien n'est envoyé à Basecamp. */
export async function dismissIssue(i: BcIssue, undo = false): Promise<{ posted: Record<string, BcPosted> }> {
  const res = await fetch('api/basecamp/dismiss', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: i.account, repo: i.repo, number: i.number, undo }),
  })
  const out = (await res.json().catch(() => null)) as { posted: Record<string, BcPosted>; error?: string } | null
  if (!res.ok || !out) throw new Error(out?.error ?? `HTTP ${res.status}`)
  return out
}
