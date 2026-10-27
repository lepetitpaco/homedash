/**
 * Carte Trello → issue GitHub → rapport publié sur la carte. Deux écritures,
 * chacune au clic. Marqueurs distincts de Basecamp.
 */
import { claudeCommand, createIssue, newIssueUrl } from './bcIssues'
import type { TrCard, TrFound, TrIssue, TrPosted } from './trello'

export const REPORT_MARK = '<!-- homedash:tr-report -->'
export { claudeCommand, createIssue, newIssueUrl }

export function trKey(url: string): string | null {
  const m = /^https?:\/\/(?:www\.)?trello\.com\/c\/([A-Za-z0-9]+)/.exec((url || '').split(/[?#]/)[0])
  return m ? m[1] : null
}

export function issuesByCard(issues: TrIssue[]): Map<string, TrIssue[]> {
  const out = new Map<string, TrIssue[]>()
  for (const i of issues) {
    const k = trKey(i.tr_url)
    if (k) out.set(k, [...(out.get(k) ?? []), i])
  }
  return out
}

export type IssueCard = { url: string; title: string; where?: string; board?: string }
export type IssueRepo = { account: string; repo: string }
export type TrComment = { id: string; who: string; date: string; text: string }

const REPO_KEY = 'homedash:tr-issue-repo'
const repoId = (r: IssueRepo) => `${r.account} ${r.repo}`

export function rememberedRepo(repos: IssueRepo[], board = ''): IssueRepo | undefined {
  let saved: Record<string, string> = {}
  try {
    saved = JSON.parse(localStorage.getItem(REPO_KEY) || '{}') as Record<string, string>
  } catch {
    /* stockage indisponible */
  }
  const find = (id?: string) => repos.find((r) => repoId(r) === id)
  return (board ? find(saved[board]) : undefined) ?? find(saved['']) ?? repos[0]
}

export function rememberRepo(r: IssueRepo, board = '') {
  try {
    const saved = JSON.parse(localStorage.getItem(REPO_KEY) || '{}') as Record<string, string>
    saved[''] = repoId(r)
    if (board) saved[board] = repoId(r)
    localStorage.setItem(REPO_KEY, JSON.stringify(saved))
  } catch {
    /* stockage indisponible */
  }
}

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

function rules(close: string): string[] {
  return [
    "Lis le besoin et tous les échanges : sur Trello, une demande est souvent une conversation décousue. Dégage le vrai besoin et la meilleure solution au vu de l'ensemble, puis, si ce n'est pas déjà limpide, poste-les en commentaire de l'issue **reformulés en termes techniques**. Ne modifie pas le corps de l'issue : il porte le lien vers la carte. Les images restent sur Trello.",
    "Donne-lui la ou les étiquettes qui conviennent, choisies parmi celles du repo (`gh label list`) : n'en crée pas.",
    'Fais le travail en suivant les règles du repo (CLAUDE.md).',
    `Une fois livré, poste **un** commentaire de rapport sur l'issue, exactement au format ci-dessous (il commence par \`${REPORT_MARK}\`) : il est publié tel quel sur la carte Trello. Si on te redemande un rapport final, poste-en un nouveau : le dernier fait foi.`,
    `Puis ferme l'issue : ${close}.`,
    "Si le besoin n'est pas clair, demande avant de coder plutôt que d'inventer.",
  ]
}

export function issueBody(card: IssueCard, need = ''): string {
  return [
    `> 📋 **Carte Trello** : [${card.title || 'carte'}](${card.url})`,
    ...(card.where ? [`> ${card.where}`] : []),
    '',
    '## Besoin',
    '',
    need.trim() || '_À compléter._',
    '',
    '---',
    `<!-- homedash:tr ${card.url.split(/[?#]/)[0]} -->`,
    '<details><summary>Consigne pour Claude Code (issue liée à Trello par homedash)</summary>',
    '',
    ...rules('`gh issue close <numéro> --reason completed`').map((r, n) => `${n + 1}. ${r}`),
    '',
    '```markdown',
    REPORT_TEMPLATE,
    '```',
    '',
    '</details>',
  ].join('\n')
}

export function claudePrompt(repo: string, number: number): string {
  return (
    `Occupe-toi de l'issue ${repo}#${number} : lis-la avec \`gh issue view ${number} -R ${repo} --comments\`. ` +
    `Elle vient d'une carte Trello : commence par en tirer le vrai besoin et la meilleure solution, ` +
    `reformulés en termes techniques (en commentaire de l'issue si ce n'est pas limpide), sans toucher au corps de l'issue. ` +
    `Donne-lui ses étiquettes, parmi celles du repo (\`gh label list -R ${repo}\`) sans en créer. ` +
    `Puis suis la consigne en bas de l'issue (rapport au format indiqué, puis fermeture).`
  )
}

export function reportPrompt(repo: string, number: number, notes = ''): string {
  return [
    `Le travail sur l'issue ${repo}#${number} est terminé. Vérifie tout ce qui a été fait par rapport à la demande d'origine (section Besoin) et aux échanges (\`gh issue view ${number} -R ${repo} --comments\`).`,
    `Puis poste le rapport final en commentaire de l'issue (\`gh issue comment ${number} -R ${repo}\`), exactement au format ci-dessous : il est publié tel quel sur la carte Trello. S'il y a déjà un rapport, poste-en un nouveau : le dernier fait foi.`,
    `Enfin, ferme l'issue si elle est encore ouverte : \`gh issue close ${number} -R ${repo} --reason completed\`.`,
    ...(notes.trim() ? ['', `Précisions pour ce rapport : ${notes.trim()}`] : []),
    '',
    REPORT_TEMPLATE,
  ].join('\n')
}

export const RECENT_COMMENTS = 5

export async function cardText(url: string): Promise<{
  text: string
  checklists: { name: string; items: { title: string; completed: boolean }[] }[]
  comments: TrComment[]
  images: Record<string, string>
}> {
  const res = await fetch(`api/trello/card?${new URLSearchParams({ url })}`, { cache: 'no-store' })
  const out = (await res.json().catch(() => null)) as {
    text?: string
    checklists?: { name: string; items: { title: string; completed: boolean }[] }[]
    comments?: TrComment[]
    images?: Record<string, string>
    error?: string
  } | null
  if (!res.ok) throw new Error(out?.error ?? `HTTP ${res.status}`)
  return {
    text: out?.text ?? '',
    checklists: out?.checklists ?? [],
    comments: out?.comments ?? [],
    images: out?.images ?? {},
  }
}

export function needFromCard(
  text: string,
  checklists: { name: string; items: { title: string; completed: boolean }[] }[],
  comments: TrComment[],
  picked: Set<string>,
): string {
  const lines = [text.trim()]
  for (const cl of checklists) {
    if (!cl.items.length) continue
    lines.push('', `### ${cl.name}`, ...cl.items.map((it) => `- [${it.completed ? 'x' : ' '}] ${it.title}`))
  }
  const kept = comments.filter((c) => picked.has(c.id))
  if (kept.length) {
    lines.push('', '### Échanges retenus (Trello)', '')
    for (const c of kept) lines.push(`**${c.who}** (${c.date}) :`, c.text, '')
  }
  return lines.join('\n').trim()
}

export function whereOf(c: Pick<TrCard, 'board' | 'list'> | Pick<TrFound, 'board' | 'parent'>): string {
  if ('list' in c) return [c.board, c.list].filter(Boolean).join(' › ')
  return [c.board, c.parent].filter(Boolean).join(' › ')
}

export async function publishReport(i: TrIssue): Promise<TrPosted> {
  const res = await fetch('api/trello/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: i.account, repo: i.repo, number: i.number }),
  })
  const out = (await res.json().catch(() => null)) as (TrPosted & { error?: string }) | null
  if (!res.ok || !out) throw new Error(out?.error ?? `HTTP ${res.status}`)
  return out
}

export async function dismissIssue(i: TrIssue, undo = false): Promise<{ posted: Record<string, TrPosted> }> {
  const res = await fetch('api/trello/dismiss', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: i.account, repo: i.repo, number: i.number, undo }),
  })
  const out = (await res.json().catch(() => null)) as { posted: Record<string, TrPosted>; error?: string } | null
  if (!res.ok || !out) throw new Error(out?.error ?? `HTTP ${res.status}`)
  return out
}

export function issueKey(i: TrIssue): string {
  return `${i.repo}#${i.number}`
}
