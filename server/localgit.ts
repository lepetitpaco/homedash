/**
 * Dépôts locaux : quelles branches traînent, lesquelles sont supprimables.
 *
 * Le pendant local de `github.ts` : là où GitHub dit ce qui existe sur le
 * distant, ce module dit ce qu'il y a sur le disque et confronte les deux.
 *
 * Rien n'est jamais exécuté ni écrit : `gitread` ne sait que lire, et les
 * commandes proposées sont du texte à copier.
 */

import fs from 'node:fs'

import * as github from './accounts.ts' // vue regroupée de tous les comptes
import * as events from './events.ts'
import * as gitread from './gitread.ts'
import * as paths from './paths.ts'
import * as perflog from './perflog.ts'

export const CFG: Record<string, any> = {
  enabled: true,
  // {"path": "~/dev/projects"} : chemin affiché, résolu par `paths.resolve()`.
  // `as` (facultatif) est ce qui apparaît dans les commandes à copier-coller.
  roots: [],
  max_depth: 3,
  ignore: ['node_modules', 'vendor', 'archived', 'dist', 'build', 'cache', 'var', 'storage', 'Pdf', 'tmp'],
  protected: ['master', 'main', 'develop', 'preprod', 'staging', 'prod'],
  check_dirty: true,
  refresh: 120,
  walk_limit: 4000,
  pr_lookups: 30,
  // Surveillance : période en secondes du contrôle d'empreinte (0 = désactivée).
  watch: 2,
  // On arrête de surveiller quand plus personne ne regarde depuis ce délai.
  watch_idle: 300,
}
const DEFAULTS = structuredClone(CFG)

/**
 * La PR d'une branche disparue du distant ne changera plus. C'est le seul appel
 * réseau du scan : clé sur le sha local, si la branche bouge on redemande.
 */
const prCache = new Map<string, unknown>()

async function lookupPr(repo: string, branch: string, sha: string, owner: string | null): Promise<any> {
  const key = JSON.stringify([repo, branch, sha])
  if (prCache.has(key)) return prCache.get(key)
  const found = await github.prForBranch(repo, branch, owner)
  if (prCache.size > 500) prCache.clear()
  prCache.set(key, found)
  return found
}

export function configure(localCfg: Record<string, unknown> | null | undefined): void {
  for (const [k, v] of Object.entries(localCfg || {})) if (!k.startsWith('_')) CFG[k] = v
}

/** Tests : revient aux valeurs par défaut. */
export function resetConfig(): void {
  for (const k of Object.keys(CFG)) delete CFG[k]
  Object.assign(CFG, structuredClone(DEFAULTS))
}

/** Dossiers du dossier personnel qui ne contiennent jamais de clones. */
const BROWSE_SKIP = new Set(['Library', 'Applications', 'Movies', 'Music', 'Pictures', 'Public', 'OrbStack', 'go', 'snap'])
/** Même chose à la racine du disque (Windows : système, corbeille…). */
const DISK_SKIP = new Set(['Windows', 'Program Files', 'Program Files (x86)', 'ProgramData', 'Recovery', 'PerfLogs', 'System Volume Information', 'Config.Msi'])

export const homeBase = paths.homeBase
export const homeDisplay = paths.homeDisplay
export const resolve = paths.resolve
export const display = paths.display

/** Points de départ du choix d'un dossier de clones : le dossier personnel, et le disque. */
export function browseStarts(): { label: string; path: string }[] {
  const out = [{ label: 'Dossier personnel', path: '~' }]
  const shown = paths.diskDisplay()
  if (paths.diskBase() && shown) out.push({ label: shown + (shown.endsWith(':') ? '/' : ''), path: shown })
  return out
}

type Root = { path: string; as: string }

function roots(): Root[] {
  const out: Root[] = []
  const seen = new Set<string>()
  for (let entry of CFG.roots || []) {
    if (typeof entry === 'string') entry = { path: entry }
    if (!entry || typeof entry !== 'object') continue
    const shown: string = entry.as || entry.path
    // `path` d'abord (anciennes configs), puis le chemin affiché résolu.
    for (const cand of [entry.path, paths.resolve(entry.path), paths.resolve(shown)]) {
      if (cand && paths.isDir(cand)) {
        const r = paths.real(cand)
        if (!seen.has(r)) {
          seen.add(r)
          out.push({ path: paths.norm(cand), as: paths.norm(shown || cand) })
        }
        break
      }
    }
  }
  return out
}

/** Chaque racine configurée et si elle est lisible, pour Réglages. */
export function rootStatus(): { as: string; ok: boolean }[] {
  const live = new Set(roots().map((r) => r.as))
  return (CFG.roots || []).map((entry: any) => {
    if (typeof entry === 'string') entry = { path: entry }
    const shown = paths.norm((entry?.as || entry?.path || '') as string)
    return { as: shown, ok: live.has(shown) }
  })
}

function dirents(dir: string): fs.Dirent[] {
  return fs.readdirSync(dir, { withFileTypes: true })
}

/**
 * Sous-dossiers de `path` (lecture seule) pour choisir un dossier de clones.
 * Limité au dossier personnel et au disque après `realpath`. `files` : ses
 * fichiers aussi (choix d'un fichier pour Mes sites), dossier personnel seulement.
 */
export function browse(p = '~', files = false): Record<string, unknown> {
  const fold = process.platform === 'win32'
  const bases = [paths.real(paths.homeBase())]
  const disk = paths.diskBase()
  if (!files && disk) bases.push(paths.real(disk))
  const target = paths.real(paths.resolve(p || '~'))
  const base = bases.find((b) => paths.under(target, b, fold))
  if (base === undefined) return { error: files ? 'hors du dossier personnel' : 'hors des dossiers lisibles' }
  if (!paths.isDir(target)) return { error: `${p} introuvable` }
  const ignore = new Set<string>(CFG.ignore || [])
  const dirs: { name: string; path: string; git: boolean }[] = []
  const found: { name: string; path: string }[] = []
  let entries: fs.Dirent[]
  try {
    entries = dirents(target).sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0))
  } catch (e) {
    return { error: String((e as Error).message) }
  }
  for (const e of entries) {
    if (e.name.startsWith('.') || ignore.has(e.name)) continue
    if (!files && target === base && (base !== bases[0] ? DISK_SKIP : BROWSE_SKIP).has(e.name)) continue
    if (e.name.startsWith('$')) continue // $Recycle.Bin, $WinREAgent…
    const full = paths.join(target, e.name)
    if (!e.isDirectory()) {
      if (files && e.isFile()) found.push({ name: e.name, path: paths.display(full) })
      continue
    }
    dirs.push({ name: e.name, path: paths.display(full), git: paths.exists(paths.join(full, '.git')) })
  }
  const shown = paths.display(target)
  const parent = target === base ? null : paths.display(paths.dirname(target))
  if (files) return { path: shown, parent, dirs, files: found, repos: { count: 0, partial: false } }
  return { path: shown, parent, dirs, starts: browseStarts(), repos: countRepos(target, ignore, Number(CFG.max_depth ?? 3)) }
}

/** Dépôts que l'onglet trouverait sous `root`, plafonné. */
function countRepos(root: string, ignore: Set<string>, maxDepth: number, budget = 3000): { count: number; partial: boolean } {
  let found = 0
  let seen = 0
  const stack: [string, number][] = [[root, 0]]
  const home = paths.homeBase()
  const disk = paths.diskBase()
  while (stack.length) {
    const [p, depth] = stack.pop() as [string, number]
    seen += 1
    if (seen > budget) return { count: found, partial: true }
    let entries: fs.Dirent[]
    try {
      entries = dirents(p)
    } catch {
      continue
    }
    for (const e of entries) {
      if (e.name === '.git') found += 1
      else if (
        depth < maxDepth &&
        !e.name.startsWith('.') &&
        !ignore.has(e.name) &&
        !(depth === 0 && p === home && BROWSE_SKIP.has(e.name)) &&
        !(depth === 0 && p === disk && (DISK_SKIP.has(e.name) || e.name.startsWith('$')))
      ) {
        if (e.isDirectory()) stack.push([paths.join(p, e.name), depth + 1])
      }
    }
  }
  return { count: found, partial: false }
}

export function enabled(): boolean {
  return !!((CFG.enabled ?? true) && roots().length)
}

/** `git@github.com:Org/repo.git` ou `https://github.com/Org/repo` → [org, repo]. */
export function parseRemote(url: string | undefined | null): [string | null, string | null] {
  if (!url) return [null, null]
  let clean = url.replace(/\/+$/, '')
  if (clean.endsWith('.git')) clean = clean.slice(0, -4)
  if (!clean.includes('github.com')) return [null, null]
  const tail = clean.split('github.com').slice(1).join('github.com').replace(/^[:/]+/, '')
  const parts = tail.split('/')
  return parts.length >= 2 ? [parts[0], parts[1]] : [null, null]
}

function displayIn(p: string, rs: Root[]): string {
  for (const r of rs) if (p === r.path || p.startsWith(r.path + '/')) return r.as + p.slice(r.path.length)
  return p
}

// ── Verdict d'une branche ───────────────────────────────────────────────────────
/** Ordre = priorité d'affichage : ce qui appelle une action passe devant. */
const ORDER: Record<string, number> = {
  gone: 0,
  'closed-pr': 1,
  squashed: 2,
  'gone-merged': 3,
  merged: 4,
  'local-only': 5,
  diverged: 6,
  unpushed: 7,
  behind: 8,
  ok: 9,
  protected: 10,
}

export type Branch = Record<string, any>

/**
 * Un état, une explication, et le drapeau de suppression qui va avec. Le
 * distant fait foi quand on le connaît (`on_github`) ; le `refs/remotes/origin/*`
 * local sert de repli.
 */
export function verdict(b: Branch, def: string): [string, string, string | null] {
  const known = b.on_github !== null && b.on_github !== undefined
  const onGh = known ? b.on_github : b.remote_ref
  const merged = b.ahead_default === 0
  const pr = b.pr || {}
  const ahead = b.ahead_default
  const hasPr = Object.keys(pr).length > 0
  // Trois traces d'un `git push` passé, de la plus fiable à la moins fiable.
  const pushedOnce = b.remote_ref || !!b.upstream || hasPr

  if (b.protected) {
    if (b.behind_default) return ['behind', `${b.behind_default} commit(s) de retard sur ${def} (GitHub)`, null]
    return ['protected', 'branche de référence', null]
  }
  let state: string
  let advice: string
  let flag: string | null
  if (merged && !onGh) {
    ;[state, advice, flag] = ['gone-merged', `intégrée à ${def} puis supprimée sur GitHub : plus rien à garder ici`, '-d']
  } else if (merged) {
    ;[state, advice, flag] = ['merged', `déjà entièrement intégrée à ${def} (elle existe encore sur GitHub)`, '-d']
  } else if (!onGh && pr.merged) {
    ;[state, advice, flag] = ['squashed', `PR #${pr.number} mergée puis branche supprimée : son contenu est dans ${def}, sous une autre forme`, '-D']
  } else if (!onGh && hasPr) {
    ;[state, advice, flag] = [
      'closed-pr',
      `PR #${pr.number} fermée sans être mergée, branche supprimée sur GitHub : ${ahead} commit(s) n'existent plus que sur ce disque`,
      null,
    ]
  } else if (!onGh && pushedOnce) {
    // `remote_ref` disparaît au premier `fetch --prune`, `branch.<x>.merge` reste.
    ;[state, advice, flag] = [
      'gone',
      `envoyée sur GitHub puis supprimée là-bas, et ${ahead} commit(s) ne sont pas dans ${def} : vérifier avant de jeter`,
      '-D',
    ]
  } else if (!onGh) {
    ;[state, advice, flag] = ['local-only', `jamais envoyée sur GitHub : ${ahead} commit(s) de travail en cours, sur ce disque seulement`, null]
  } else if (b.push_ahead === null || b.push_ahead === undefined) {
    // GitHub la connaît, mais aucun origin/<b> sur ce disque : rien pour comparer.
    ;[state, advice, flag] = ['unknown', "existe sur GitHub, mais ce disque n'en a pas la copie : une synchro (git fetch) permettra de comparer", null]
  } else if (b.push_ahead && b.push_behind) {
    ;[state, advice, flag] = ['diverged', `différente de GitHub : ${b.push_ahead} commit(s) ici seulement, ${b.push_behind} sur GitHub seulement`, null]
  } else if (b.push_ahead) {
    ;[state, advice, flag] = ['unpushed', `${b.push_ahead} commit(s) pas encore envoyé(s) sur GitHub`, null]
  } else if (b.push_behind) {
    ;[state, advice, flag] = ['behind', `${b.push_behind} commit(s) à récupérer de GitHub`, null]
  } else {
    ;[state, advice, flag] = ['ok', 'à jour avec GitHub', null]
  }
  if (b.current && flag) {
    // On ne supprime pas la branche sur laquelle on est, et git non plus.
    advice += ` · branche courante : \`git switch ${def}\` d'abord`
    flag = null
  }
  return [state, advice, flag]
}

/** « Est-ce que je perds quelque chose en supprimant ? » : axe distinct de l'état. */
export function safety(b: Branch, def: string): { level: string; label: string; detail: string } {
  const ahead = b.ahead_default
  const pr = b.pr || {}
  const onGh = b.on_github !== null && b.on_github !== undefined ? b.on_github : b.remote_ref
  if (ahead === 0) return { level: 'merged', label: '✓ sauvegardée', detail: `chacun de ses commits est déjà dans ${def} sur GitHub` }
  if (pr.merged)
    return {
      level: 'squash',
      label: '✓ PR mergée',
      detail: `PR #${pr.number} mergée : son contenu est dans ${def} sur GitHub, sous une autre forme (commits regroupés au merge), ou ce disque n'est pas encore synchronisé`,
    }
  if (onGh && b.push_ahead === 0)
    return { level: 'pushed', label: '↑ sur GitHub', detail: `pas encore mergée, mais GitHub a les mêmes ${ahead} commit(s) : rien n'existe uniquement ici` }
  if (onGh && (b.push_ahead === null || b.push_ahead === undefined))
    return {
      level: 'partial',
      label: '? non comparée',
      detail: "la branche existe sur GitHub mais ce disque n'en a pas la copie : impossible de comparer avant une synchro (git fetch)",
    }
  if (onGh) {
    const n = b.push_ahead || 0
    return { level: 'partial', label: `⚠ ${n} pas sur GitHub`, detail: `la branche est sur GitHub, mais ${n} commit(s) d'ici n'y sont pas encore` }
  }
  if (b.remote_ref || b.upstream || Object.keys(pr).length)
    return { level: 'local', label: '⚠ effacée de GitHub', detail: `poussée par le passé puis supprimée sur GitHub : les ${ahead} commit(s) n'ont plus de copie en ligne` }
  return { level: 'local', label: '⚠ jamais envoyée', detail: `travail en cours : ${ahead} commit(s) qui n'ont jamais quitté ce disque, aucune copie nulle part` }
}

export const SAFE_LEVELS = ['merged', 'squash', 'pushed']

/**
 * La conclusion, en un mot : garder ou jeter. Invariant : « à supprimer » exige
 * que le contenu existe ailleurs ; un drapeau `-D` seul ne suffit pas.
 */
export function action(b: Branch, s: { level: string; detail: string }): { kind: string; label: string; detail: string } {
  const safe = SAFE_LEVELS.includes(s.level)
  if (b.delete && safe) return { kind: 'delete', label: '🗑 à supprimer', detail: `${s.detail} — \`git branch ${b.delete} ${b.name}\`` }
  if (b.delete)
    return {
      kind: 'check',
      label: '🔍 à vérifier',
      detail: `${s.detail}. \`git branch -D\` l'effacerait quand même : relire ces commits avant de lancer quoi que ce soit`,
    }
  if (b.protected) {
    const here = b.current ? ' · et tu es dessus' : ''
    return { kind: 'ref', label: '🏠 référence', detail: `branche de référence du dépôt, jamais proposée à la suppression${here}` }
  }
  if (b.current) return { kind: 'current', label: '📍 tu es dessus', detail: 'branche courante : git refuse de la supprimer, et nous aussi' }
  if (!safe) return { kind: 'keep', label: '⚠ à garder', detail: s.detail }
  return { kind: 'work', label: '🔧 en cours', detail: s.detail }
}

// ── Lecture d'un dépôt ──────────────────────────────────────────────────────────
type Budget = { left: number }

async function readRepo(worktree: string, rs: Root[], facts: Map<string, any>, budget: Budget): Promise<Record<string, any>> {
  const p = paths.norm(worktree)
  const entry: Record<string, any> = {
    path: p,
    display: displayIn(p, rs),
    name: p.split('/').pop(),
    org: null,
    repo: null,
    url: null,
    error: null,
    default_branch: null,
    head: null,
    detached: false,
    branches: [],
    stashes: 0,
    fetched_at: null,
    dirty: null,
    linked: false,
    commands: [],
    counts: {},
  }
  let repo: gitread.Repo | null = null
  try {
    repo = new gitread.Repo(worktree)
    const [org, name] = parseRemote(repo.remoteUrl())
    entry.org = org
    entry.repo = name
    entry.url = org && name ? `https://github.com/${org}/${name}` : null
    const [headBranch, headSha] = repo.head()
    entry.head = headBranch || (headSha ? headSha.slice(0, 8) : null)
    entry.detached = headBranch === null && !!headSha
    const snapshot = name ? github.remoteSnapshot(name) : null
    entry.linked = snapshot !== null && snapshot !== undefined
    const def: string = snapshot?.default || repo.defaultBranch() || 'master'
    entry.default_branch = def
    entry.fetched_at = repo.fetchedAt()
    entry.stashes = repo.stashCount()
    if (CFG.check_dirty ?? true) entry.dirty = repo.modified()

    const refs = repo.refs
    const heads: Record<string, string> = {}
    const remotes: Record<string, string> = {}
    for (const [k, v] of Object.entries(refs)) {
      if (k.startsWith('refs/heads/')) heads[k.slice('refs/heads/'.length)] = v
      if (k.startsWith('refs/remotes/origin/')) remotes[k.slice('refs/remotes/origin/'.length)] = v
    }
    const baseSha = remotes[def] || heads[def]
    const prot = new Set<string>([...(CFG.protected || []), def])
    const limit = CFG.walk_limit ?? 4000

    for (const branch of Object.keys(heads).sort()) {
      const sha = heads[branch]
      const tip = repo.commit(sha) || ({} as Partial<gitread.Commit>)
      const [aheadD, behindD, capped] = repo.aheadBehind(sha, baseSha, limit)
      const remoteSha = remotes[branch]
      let pushA: number | null = null
      let pushB: number | null = null
      if (remoteSha) [pushA, pushB] = repo.aheadBehind(sha, remoteSha, limit)
      const fact = name ? facts.get(`${name}\u0000${branch}`) : null
      let onGithub: boolean | null = null
      if (snapshot !== null && snapshot !== undefined) onGithub = Object.hasOwn(snapshot.branches, branch)
      const b: Branch = {
        name: branch,
        sha,
        short: sha.slice(0, 8),
        current: branch === headBranch,
        protected: prot.has(branch),
        upstream: repo.upstreamOf(branch),
        remote_ref: branch in remotes,
        remote_sha: remoteSha ?? null,
        ahead_default: aheadD || 0,
        behind_default: behindD || 0,
        capped,
        push_ahead: pushA,
        push_behind: pushB,
        on_github: onGithub,
        date: tip.time || 0,
        author: tip.author || '',
        subject: tip.subject || '',
        pr: fact?.pr ?? null,
      }
      let [state, advice, flag] = verdict(b, def)
      // `gone` et `local-only` : les seuls cas où l'on ne sait pas si le travail est perdu.
      if ((state === 'gone' || state === 'local-only') && name && snapshot && budget.left > 0) {
        budget.left -= 1
        const found = await lookupPr(name, branch, sha, entry.org)
        if (found) {
          b.pr = found
          ;[state, advice, flag] = verdict(b, def)
        }
      }
      b.state = state
      b.advice = advice
      b.delete = flag
      b.safety = safety(b, def)
      b.action = action(b, b.safety)
      entry.branches.push(b)
    }
    entry.branches.sort(
      (x: Branch, y: Branch) =>
        Number(!x.current) - Number(!y.current) || (ORDER[x.state] ?? 99) - (ORDER[y.state] ?? 99) || y.date - x.date,
    )
    const bs: Branch[] = entry.branches
    entry.counts = {
      branches: bs.length,
      deletable: bs.filter((b) => b.delete === '-d').length,
      squashed: bs.filter((b) => b.state === 'squashed' && b.delete === '-D').length,
      risky: bs.filter((b) => b.delete === '-D' && b.state !== 'squashed').length,
      unpushed: bs.filter((b) => b.state === 'unpushed').length,
      safe: bs.filter((b) => SAFE_LEVELS.includes(b.safety.level)).length,
      at_risk: bs.filter((b) => !SAFE_LEVELS.includes(b.safety.level)).length,
    }
    entry.commands = commands(entry)
  } catch (e) {
    const err = e as Error
    entry.error = `${err.name || 'Error'}: ${err.message}`
  } finally {
    repo?.close()
  }
  return entry
}

// ── Commandes proposées (jamais exécutées) ──────────────────────────────────────
const SAFE_CH = /^[\p{L}\p{N}\-_./~@+]*$/u

/** Un nom de branche peut contenir des caractères que le shell interprète. */
export function quote(name: string): string {
  return SAFE_CH.test(name) ? name : `'${name}'`
}

/** Nu si le shell n'y touchera pas : entre guillemets, `~/dev/…` resterait littéral. */
export function shellPath(p: string): string {
  return SAFE_CH.test(p) ? p : `"${p}"`
}

export function commands(entry: Record<string, any>): Record<string, unknown>[] {
  const cd = `cd ${shellPath(entry.display)}`
  const def = entry.default_branch
  const bs: Branch[] = entry.branches
  const out: Record<string, unknown>[] = [
    {
      id: 'fetch',
      label: 'Rafraîchir le distant',
      cmd: `${cd} && git fetch --prune`,
      hint: "met à jour les refs distantes et supprime celles dont la branche n'existe plus sur GitHub — c'est ce qui rend cette page fiable",
    },
  ]
  const safe = bs.filter((b) => b.delete === '-d').map((b) => b.name)
  if (safe.length)
    out.push({
      id: 'delete',
      label: `Supprimer ${safe.length} branche(s) mergée(s)`,
      cmd: `${cd} && git branch -d ${safe.map(quote).join(' ')}`,
      hint: `\`-d\` refuse de supprimer une branche non mergée dans origin/${def} : si git râle, c'est que la page se trompe, pas l'inverse`,
    })
  const squashed = bs.filter((b) => b.state === 'squashed' && b.delete === '-D').map((b) => b.name)
  if (squashed.length)
    out.push({
      id: 'squashed',
      label: `Supprimer ${squashed.length} branche(s) squashée(s)`,
      cmd: `${cd} && git branch -D ${squashed.map(quote).join(' ')}`,
      hint: 'leur PR est mergée : le contenu est dans le distant sous un autre sha, ce qui force `-D` là où `-d` refuserait à tort',
    })
  const risky = bs.filter((b) => b.delete === '-D' && b.state !== 'squashed').map((b) => b.name)
  if (risky.length)
    out.push({
      id: 'force',
      label: `Forcer ${risky.length} branche(s) sans distant`,
      cmd: `${cd} && git branch -D ${risky.map(quote).join(' ')}`,
      danger: true,
      hint: 'aucune PR mergée retrouvée pour ces branches : `-D` ne vérifie rien et leurs commits n\'existent nulle part ailleurs. À relire une par une',
    })
  const head = bs.find((b) => b.current)
  if (head && head.push_behind && !head.push_ahead) {
    // Seulement en retard : le pull avance la branche sans commit de merge.
    const pull = head.upstream ? 'git pull' : `git pull origin ${quote(head.name)}`
    out.push({
      id: 'pull',
      label: `Tirer origin/${head.name}`,
      cmd: `${cd} && ${pull}`,
      hint: `${head.push_behind} commit(s) poussé(s) sur origin/${head.name} qui ne sont pas encore ici`,
    })
  }
  if (head && head.name !== def && head.behind_default) {
    // Merge et non rebase : rien n'est réécrit.
    out.push({
      id: 'merge',
      label: `Rattraper origin/${def}`,
      cmd: `${cd} && git fetch origin && git merge origin/${def}`,
      hint: `${head.name} a ${head.behind_default} commit(s) de retard sur origin/${def}`,
    })
  }
  return out
}

// ── Journal : une branche locale devenue supprimable ────────────────────────────
// On note l'APPARITION, jamais l'état : sinon chaque scan re-signalerait tout.
let prevRemovable = new Set<string>()
let prevRepos = new Set<string>()
const seed = { done: false, start: Date.now() / 1000 }
/** Une PR mergée il y a plus longtemps n'est pas une nouvelle. */
export const RECENT_MERGE = 2 * 86400

export function oldMerge(pr: any, now?: number): boolean {
  const raw = pr?.merged_at
  if (!raw) return false
  const ts = Date.parse(String(raw).replace(/Z$/, '') + 'Z')
  if (Number.isNaN(ts)) return false
  return (now ?? Date.now() / 1000) - ts / 1000 > RECENT_MERGE
}

function removable(repos: Record<string, any>[]): Map<string, [Record<string, any>, Branch]> {
  const out = new Map<string, [Record<string, any>, Branch]>()
  for (const r of repos) {
    if (r.error) continue
    for (const b of r.branches) if (b.action.kind === 'delete') out.set(`${r.name}\u0000${b.name}`, [r, b])
  }
  return out
}

/** Tests : remet l'amorçage du journal à zéro. */
export function resetJournal(done = false): void {
  prevRemovable = new Set()
  prevRepos = new Set()
  seed.done = done
  seed.start = Date.now() / 1000
}

export function recordCleanup(repos: Record<string, any>[]): void {
  const current = removable(repos)
  const seenRepos = prevRepos
  prevRepos = new Set(repos.filter((r) => !r.error).map((r) => r.name))
  // Amorçage : tant que GitHub n'a pas répondu, les verdicts reposent sur les
  // seuls refs locaux ; sortie de secours au bout de deux minutes.
  if (!seed.done) {
    const lit = !github.enabled() || github.remoteVersion() > 0
    if (lit || Date.now() / 1000 - seed.start > 120) seed.done = true
    prevRemovable = new Set(current.keys())
    return
  }
  const fresh = [...current].filter(([k]) => !prevRemovable.has(k)).map(([, v]) => v)
  prevRemovable = new Set(current.keys())
  const told = events.tagsSince(Date.now() / 1000 - RECENT_MERGE)
  // Une même branche dans plusieurs dépôts : une ligne.
  const groups = new Map<string, { name: string; merged: boolean; items: [Record<string, any>, any, string][] }>()
  for (const [repo, b] of fresh) {
    const pr = b.pr || {}
    const key = `local:${repo.name}/${b.name}`
    if (!seenRepos.has(repo.name) || oldMerge(pr) || told.has(key)) continue
    const gk = JSON.stringify([b.name, !!pr.merged_at])
    if (!groups.has(gk)) groups.set(gk, { name: b.name, merged: !!pr.merged_at, items: [] })
    groups.get(gk)?.items.push([repo, pr, key])
  }
  const out: events.Event[] = []
  for (const { name, merged, items } of groups.values()) {
    const names = items.map(([r]) => r.name)
    const what = merged ? 'est mergée' : "n'existe plus sur GitHub"
    const where = names.length === 1 ? names[0] : `${names.length} dépôts`
    const body =
      (names.length === 1 ? 'Ta copie locale peut être supprimée' : `Copies locales à supprimer : ${names.join(', ')}`) +
      " (commande dans l'onglet Local)."
    const keys = items.map(([, , k]) => k)
    const [repo, pr] = items[0]
    out.push(
      events.event('local-cleanup', 'warn', 'local', `🧹 ${name} ${what} · ${where}`, {
        body,
        repo: repo.name,
        url: pr.url || repo.url || '',
        tag: keys.length === 1 ? keys[0] : `local:${name}`,
        keys,
      }),
    )
  }
  events.record(out)
}

// ── État partagé ────────────────────────────────────────────────────────────────
const data: { repos: Record<string, any>[] } = { repos: [] }
const state = {
  ts: 0,
  building: false,
  error: null as string | null,
  took: 0,
  gh: -1,
  // dernière requête du front : sans spectateur, la surveillance dort
  seen: 0,
  trigger: null as string | null,
  watching: false,
  indexScan: 0,
}
const sigs = new Map<string, gitread.Signature>()

export function invalidate(): void {
  state.ts = 0
}

export async function rebuild(trigger: string | null = null): Promise<void> {
  const started = performance.now()
  const ghVersion = github.remoteVersion()
  try {
    const rs = roots()
    const ignore = new Set<string>(CFG.ignore || [])
    const depth = Number(CFG.max_depth ?? 3)
    const facts = github.branchFactsIndex()
    const seen = new Set<string>()
    const worktrees: string[] = []
    for (const r of rs) {
      for (const p of gitread.discover(r.path, ignore, depth)) {
        if (!seen.has(p)) {
          seen.add(p)
          worktrees.push(p)
        }
      }
    }
    // Plafond d'appels GitHub pour tout le cycle.
    const budget: Budget = { left: Number(CFG.pr_lookups ?? 30) }
    const repos: Record<string, any>[] = []
    for (const w of worktrees.sort()) {
      repos.push(await readRepo(w, rs, facts, budget))
      await new Promise((r) => setImmediate(r)) // laisse passer les requêtes de la page
    }
    data.repos = repos
    try {
      recordCleanup(repos)
    } catch (e) {
      // Le journal est un confort ; l'onglet Local est la garantie.
      console.error(`✗ Journal (local) : ${e}`)
    }
    sigs.clear()
    for (const r of repos) sigs.set(r.path, gitread.signature(r.path))
    state.ts = Date.now() / 1000
    state.error = null
    state.took = (performance.now() - started) / 1000
    state.gh = ghVersion
    state.trigger = trigger
    console.log(`✅ Local : ${repos.length} dépôts lus en ${state.took.toFixed(2)}s`)
    perflog.scanned('local')
    perflog.timed('local', state.took, { repos: repos.length })
  } catch (e) {
    state.error = String((e as Error).message || e)
    console.error(`✗ Local : ${e}`)
  } finally {
    state.building = false
  }
}

/** Lance un scan en arrière-plan ; false si un scan tourne déjà. */
export function kickoff(trigger: string | null = null): boolean {
  if (state.building) return false
  state.building = true
  void rebuild(trigger)
  return true
}

/** Tests : attend la fin du scan en cours. */
export async function settled(): Promise<void> {
  while (state.building) await new Promise((r) => setTimeout(r, 5))
}

// ── Surveillance : réagir à une commande tapée dans un terminal ─────────────────
/** Un index touché ne vaut pas un fetch : temporisé ; un changement de refs déclenche tout de suite. */
const INDEX_DEBOUNCE = 30

function priority(cause: string): number {
  const order = Object.values(gitread.CAUSE)
  const i = order.indexOf(cause)
  return i < 0 ? order.length : i
}

let tick = 0

function watchOnce(): void {
  if (!CFG.watch || !enabled()) return
  const idle = Date.now() / 1000 - state.seen > Number(CFG.watch_idle ?? 300)
  if (idle || state.building) return
  tick += 1
  try {
    // On regarde TOUS les dépôts avant de conclure.
    const causes: string[] = []
    for (const [p, before] of sigs) {
      const after = gitread.signature(p)
      if (JSON.stringify(after) !== JSON.stringify(before)) causes.push(gitread.whatChanged(before, after) || 'dépôt modifié')
    }
    let cause: string | null = causes.length ? causes.reduce((a, b) => (priority(b) < priority(a) ? b : a)) : null
    // Un éditeur avec intégration git réécrit `.git/index` en boucle : seul ce cas est temporisé.
    if (cause === gitread.CAUSE.index) {
      if (Date.now() / 1000 - state.indexScan < INDEX_DEBOUNCE) return
      state.indexScan = Date.now() / 1000
    }
    // Un dépôt fraîchement cloné n'a pas d'empreinte : on relit la liste de temps en temps.
    if (cause === null && tick % 5 === 0) {
      const found = new Set<string>()
      for (const r of roots()) for (const p of gitread.discover(r.path, new Set(CFG.ignore || []), Number(CFG.max_depth ?? 3))) found.add(p)
      const known = new Set(sigs.keys())
      if (found.size !== known.size || [...found].some((p) => !known.has(p))) cause = 'dépôt ajouté ou retiré'
    }
    if (cause) {
      console.log(`👀 Local : ${cause} → relecture`)
      kickoff(cause)
    }
  } catch (e) {
    console.error(`✗ Local (surveillance) : ${e}`)
  }
}

export function startWatch(): void {
  if (state.watching) return
  state.watching = true
  const loop = () => {
    watchOnce()
    setTimeout(loop, Math.max(1, Math.trunc(Number(CFG.watch || 2))) * 1000).unref()
  }
  setTimeout(loop, Math.max(1, Math.trunc(Number(CFG.watch || 2))) * 1000).unref()
}

export function payload(): Record<string, unknown> {
  if (!enabled())
    return {
      enabled: false,
      error: CFG.enabled ?? true ? null : 'onglet Local désactivé — Réglages → Fonctionnalités',
      hint: 'aucun dossier de dépôts — Réglages → Dépôts locaux',
    }
  state.seen = Date.now() / 1000 // quelqu'un regarde : la surveillance vit
  const refresh = Math.max(15, Math.trunc(Number(CFG.refresh ?? 120)))
  // GitHub a répondu depuis le dernier scan : les verdicts se basaient sur les refs locaux.
  const stale = Date.now() / 1000 - state.ts >= refresh || state.gh !== github.remoteVersion()
  if (stale) kickoff()
  const repos = data.repos
  // Le `fetch --prune` global : c'est lui qui rend cette page exacte.
  const ok = repos.filter((r) => !r.error).map((r) => shellPath(r.display))
  const globalCommands: Record<string, unknown>[] = []
  if (ok.length)
    globalCommands.push({
      id: 'fetch-all',
      label: `Rafraîchir les ${ok.length} dépôts`,
      cmd: 'for d in ' + ok.join(' ') + '; do printf "\\n== %s\\n" "$d"; git -C "$d" fetch --prune; done',
      hint: "supprime les refs distantes dont la branche n'existe plus sur GitHub — après ça, « distant supprimé » veut vraiment dire supprimé, et les compteurs de retard sont à jour",
    })
  const sum = (k: string) => repos.reduce((a, r) => a + (r.counts?.[k] || 0), 0)
  const totals = {
    repos: repos.length,
    branches: sum('branches'),
    deletable: sum('deletable'),
    squashed: sum('squashed'),
    risky: sum('risky'),
    unpushed: sum('unpushed'),
    dirty: repos.filter((r) => r.dirty?.count).length,
    safe: sum('safe'),
    at_risk: sum('at_risk'),
  }
  return {
    enabled: true,
    updated_at: state.ts,
    building: state.building,
    error: state.error,
    took: state.took,
    refresh,
    // `watch` sert aussi de cadence au front.
    watch: Math.trunc(Number(CFG.watch || 0)),
    watching: state.watching,
    trigger: state.trigger,
    github_linked: github.enabled(),
    roots: roots().map((r) => r.as),
    repos,
    totals,
    global_commands: globalCommands,
  }
}
