/**
 * Couche données GitHub, une instance par compte : aucun HTML, que des objets sérialisables.
 *
 * Ce qui compte et pourquoi :
 *   · cache ETag : GitHub ne décompte pas les 304, sans ça un cycle coûte ~70 appels ;
 *   · attribution des branches par PR + auteurs de commits (jamais par préfixe de nom) ;
 *   · cache de faits par (repo, branche, sha) : changer d'utilisateur ne coûte aucun appel ;
 *   · portes Renovate : quand une version base-site peut être propagée aux autres repos.
 *
 * Chaque compte a sa propre instance (jeton, cache ETag, données, amorçage du
 * journal) : rien ici ne sait qu'il existe d'autres comptes.
 */

import * as events from './events.ts'
import * as perflog from './perflog.ts'

const MAX_WORKERS = 10
const ETAG_MAX = 1000
const API = 'https://api.github.com'

export const DEFAULTS: Record<string, unknown> = {
  me: '',
  repos: [],
  branch_repos: [],
  base_site_repos: [],
  upstream_repo: 'base-site',
  renovate_author: 'renovate[bot]',
  users: [],
  merged_count: 10,
  cache_ttl: 120,
  auto_refresh: 15,
}

/** Point de passage unique vers le réseau (remplacé dans les tests). */
let fetcher: typeof fetch = (input, init) => fetch(input, init)
export function setFetch(fn: typeof fetch): void {
  fetcher = fn
}

/** `items` traités par lots de `limit` en parallèle, dans l'ordre. */
export async function pmap<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

function query(params?: Record<string, unknown>): string {
  if (!params) return ''
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) q.append(k, String(v))
  const s = q.toString()
  return s ? '?' + s : ''
}

const DISPLAY_TZ = process.env.TZ || 'Europe/Paris'
let dtf: Intl.DateTimeFormat | null = null

/** ISO → `AAAA-MM-JJ HH:MM:SS` à l'heure d'affichage. */
export function fmtDt(iso: string | null | undefined): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso.slice(0, 19).replace('T', ' ')
  try {
    dtf ??= new Intl.DateTimeFormat('sv-SE', {
      timeZone: DISPLAY_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    return dtf.format(new Date(t)).replace('T', ' ')
  } catch {
    return iso.slice(0, 19).replace('T', ' ')
  }
}

const VERSION_RE = /\bv?(\d+\.\d+(?:\.\d+)?(?:[-.]\w+)*)\b/

/** Codes émoji de GitHub (`:sparkles:`) : convertis sur github.com, pas dans l'API (issue #58). */
const EMOJI: Record<string, string> = {
  art: '🎨', zap: '⚡️', fire: '🔥', bug: '🐛', ambulance: '🚑️', sparkles: '✨',
  memo: '📝', rocket: '🚀', lipstick: '💄', tada: '🎉', white_check_mark: '✅', lock: '🔒️',
  closed_lock_with_key: '🔐', bookmark: '🔖', rotating_light: '🚨', construction: '🚧', green_heart: '💚', arrow_down: '⬇️',
  arrow_up: '⬆️', pushpin: '📌', construction_worker: '👷', chart_with_upwards_trend: '📈', recycle: '♻️', heavy_plus_sign: '➕',
  heavy_minus_sign: '➖', wrench: '🔧', hammer: '🔨', globe_with_meridians: '🌐', pencil2: '✏️', poop: '💩',
  rewind: '⏪️', twisted_rightwards_arrows: '🔀', package: '📦️', alien: '👽️', truck: '🚚', page_facing_up: '📄',
  boom: '💥', bento: '🍱', wheelchair: '♿️', bulb: '💡', beers: '🍻', speech_balloon: '💬',
  card_file_box: '🗃️', loud_sound: '🔊', mute: '🔇', busts_in_silhouette: '👥', children_crossing: '🚸', building_construction: '🏗️',
  iphone: '📱', clown_face: '🤡', egg: '🥚', see_no_evil: '🙈', camera_flash: '📸', alembic: '⚗️',
  mag: '🔍️', label: '🏷️', seedling: '🌱', triangular_flag_on_post: '🚩', goal_net: '🥅', dizzy: '💫',
  wastebasket: '🗑️', passport_control: '🛂', adhesive_bandage: '🩹', monocle_face: '🧐', coffin: '⚰️', test_tube: '🧪',
  necktie: '👔', stethoscope: '🩺', bricks: '🧱', technologist: '🧑‍💻', money_with_wings: '💸', thread: '🧵',
  safety_vest: '🦺', airplane: '✈️', heavy_check_mark: '✔️', x: '❌', warning: '⚠️', star: '⭐',
  gift: '🎁', robot: '🤖', calendar: '📆', email: '📧', key: '🔑', link: '🔗',
  gear: '⚙️',
}

export function emojify(text: string | null | undefined): string {
  return (text || '').replace(/:([a-z0-9_+-]+):/g, (m, code) => EMOJI[code] ?? m)
}

export function parseVersion(title: string | null | undefined): string | null {
  const m = VERSION_RE.exec(title || '')
  return m ? m[1] : null
}

function checkState(r: any): [string, string] {
  const conc = r.conclusion
  const stat = r.status
  if (['failure', 'error', 'timed_out'].includes(conc)) return ['fail', '✗']
  if (['success', 'neutral'].includes(conc)) return ['pass', '✓']
  if (['in_progress', 'queued', 'waiting', 'pending'].includes(stat)) return ['pending', '⟳']
  if (['cancelled', 'skipped'].includes(conc)) return ['unknown', '⊘']
  return ['unknown', '?']
}

/** Agrège des check_runs : {state, label, total, checks[]}. */
export function ciSummary(runs: any[] | null | undefined): Record<string, any> {
  if (!runs || !runs.length) return { state: 'unknown', label: 'No CI', total: 0, checks: [] }
  const checks = runs.map((r) => {
    const [state, icon] = checkState(r)
    return { name: r.name ?? '?', state, icon, url: r.html_url || r.details_url || '' }
  })
  const n = checks.length
  const fail = checks.filter((c) => c.state === 'fail').length
  const pend = checks.filter((c) => c.state === 'pending').length
  const ok = checks.filter((c) => c.state === 'pass').length
  let state: string
  let label: string
  if (fail) [state, label] = ['fail', `✗ ${fail}/${n}`]
  else if (pend) [state, label] = ['pending', `⟳ ${pend}/${n}`]
  else if (ok) [state, label] = ['pass', `✓ ${ok}`]
  else [state, label] = ['unknown', `⊘ ${n}`]
  return { state, label, total: n, checks }
}

/** Un workflow en cours et ses jobs, pour la carte « En cours ». Un job se lit comme un check. */
export function runningRun(repo: string, run: any, jobs: any[]): Record<string, any> {
  return {
    repo,
    id: run.id,
    workflow: run.name ?? '?',
    title: emojify(run.display_title ?? ''),
    branch: run.head_branch ?? '',
    url: run.html_url ?? '',
    ci: ciSummary(jobs),
  }
}

/** Un commit dont l'email n'est lié à aucun compte reste non attribué. */
function commitAuthor(c: any): string | null {
  return c?.author?.login || c?.committer?.login || null
}

export function branchRole(fact: any, user: string): string | null {
  if (fact.creator === user) return 'creator'
  if ((fact.authors || []).includes(user)) return 'contributor'
  return null
}

/** Le premier projet mergé sert de test : tant que sa CI tourne, on ne propage pas. */
export function versionGate(version: string, mergedPrs: any[]): Record<string, string> | null {
  const same = mergedPrs.filter((p) => (p.version || '—') === version)
  if (!same.length) return null
  const names = (items: any[]) => [...new Set(items.map((p) => p.repo))].sort().join(', ')
  const st = (p: any) => p.ci?.state
  const failed = same.filter((p) => st(p) === 'fail')
  const running = same.filter((p) => st(p) === 'pending')
  const passed = same.filter((p) => st(p) === 'pass')
  if (failed.length)
    return { cls: 'blocked', icon: '⛔', title: `base-site ${version} — CI en échec sur ${names(failed)}`, detail: 'Ne pas merger cette version sur les autres projets.' }
  if (running.length)
    return {
      cls: 'running',
      icon: '⏳',
      title: `base-site ${version} — build & tests en cours sur ${names(running)}`,
      detail: 'Attendre la CI verte avant de propager aux autres projets.',
    }
  if (passed.length)
    return { cls: 'ready', icon: '✅', title: `base-site ${version} — validée sur ${names(passed)}`, detail: 'Feu vert : les PRs restantes peuvent être mergées.' }
  return null
}

/** État de la PR amont (dans le repo base-site lui-même). */
export function upstreamGate(upOpen: any[], upMerged: any[]): Record<string, unknown> | null {
  const merged = [...upMerged].sort((a, b) => ((b.merged_at_raw || '') > (a.merged_at_raw || '') ? 1 : (b.merged_at_raw || '') < (a.merged_at_raw || '') ? -1 : 0))
  const st = (p: any) => p.ci?.state
  if (merged.length) {
    const p = merged[0]
    const v = p.version || '?'
    if (st(p) === 'pending')
      return { cls: 'running', icon: '⏳', version: p.version ?? null, title: `base-site ${v} — mergée, build & tests en cours`, detail: 'Attendre la CI verte avant de merger les PRs des autres projets.' }
    if (st(p) === 'fail')
      return { cls: 'blocked', icon: '⛔', version: p.version ?? null, title: `base-site ${v} — CI en échec après merge`, detail: "Ne pas merger les PRs downstream tant que ce n'est pas corrigé." }
    if (st(p) === 'pass')
      return { cls: 'ready', icon: '✅', version: null, title: `base-site ${v} — publiée, CI verte`, detail: 'Feu vert : les PRs Renovate downstream peuvent être mergées.' }
    return { cls: 'running', icon: '⏳', version: p.version ?? null, title: `base-site ${v} — mergée, CI inconnue`, detail: 'Aucun check sur le commit de merge — vérifier avant de propager.' }
  }
  if (upOpen.length) {
    const p = [...upOpen].sort((a, b) => ((b.created_at || '') > (a.created_at || '') ? 1 : (b.created_at || '') < (a.created_at || '') ? -1 : 0))[0]
    const v = p.version || '?'
    if (st(p) === 'fail')
      return { cls: 'blocked', icon: '⛔', version: p.version ?? null, title: `base-site ${v} — PR ouverte, CI en échec`, detail: "La version amont n'est pas mergeable : rien à propager." }
    if (st(p) === 'pending')
      return { cls: 'running', icon: '⏳', version: p.version ?? null, title: `base-site ${v} — PR ouverte, tests en cours`, detail: 'Pas encore mergée : les autres projets attendent cette version.' }
    if (st(p) === 'pass')
      return { cls: 'open', icon: '🟢', version: p.version ?? null, title: `base-site ${v} — PR ouverte, CI verte, à merger`, detail: 'Merger cette PR pour débloquer les autres projets.' }
    return { cls: 'open', icon: '🔵', version: p.version ?? null, title: `base-site ${v} — PR ouverte`, detail: 'Pas encore mergée : les autres projets attendent cette version.' }
  }
  return null
}

export function groupByVersion(items: any[]): { version: string; items: any[]; gate?: unknown }[] {
  const groups = new Map<string, any[]>()
  for (const p of items) {
    const v = p.version || '—'
    groups.set(v, [...(groups.get(v) || []), p])
  }
  const vkey = (v: string): [number, number[]] => (v === '—' ? [1, []] : [0, (v.match(/\d+/g) || []).map(Number)])
  const cmp = (a: [number, number[]], b: [number, number[]]) => {
    if (a[0] !== b[0]) return a[0] - b[0]
    for (let i = 0; i < Math.max(a[1].length, b[1].length); i++) {
      if (a[1][i] === undefined) return -1
      if (b[1][i] === undefined) return 1
      if (a[1][i] !== b[1][i]) return a[1][i] - b[1][i]
    }
    return 0
  }
  return [...groups].sort((x, y) => -cmp(vkey(x[0]), vkey(y[0]))).map(([version, its]) => ({ version, items: its }))
}

/** Une issue créée depuis l'onglet Basecamp porte `<!-- homedash:bc <adresse> -->`. */
export const BC_LINK = /<!--\s*homedash:bc\s+(https?:\/\/\S+?)\s*-->/
/** Le rapport à reporter sur la tâche commence par `<!-- homedash:bc-report -->`. */
const BC_REPORT = /^\s*<!--\s*homedash:bc-report\s*-->\s*/
/** Même chose pour une carte Trello. Listes et événements séparés : une issue Basecamp ne change pas de sens. */
export const TR_LINK = /<!--\s*homedash:tr\s+(https?:\/\/\S+?)\s*-->/
const TR_REPORT = /^\s*<!--\s*homedash:tr-report\s*-->\s*/
/** Issues relues par repo, les plus récemment modifiées. */
const BC_ISSUES_SCAN = 100

/** Dernier commentaire-rapport d'une issue, marqueur retiré ; null s'il n'y en a pas. */
export function bcReport(comments: any[] | null | undefined): Record<string, unknown> | null {
  for (const c of [...(comments || [])].reverse()) {
    const body: string = c.body || ''
    if (BC_REPORT.test(body)) {
      return {
        id: c.id ?? null,
        url: c.html_url || '',
        body: body.replace(BC_REPORT, '').trim(),
        // HTML rendu par GitHub : ce qui part sur Basecamp, jamais affiché ici
        html: (c.body_html || '').replace(/<!--[\s\S]*?-->/g, '').trim(),
        author: c.user?.login || '',
        ts: c.updated_at || c.created_at || '',
      }
    }
  }
  return null
}

/** Dernier commentaire-rapport Trello, marqueur retiré ; null s'il n'y en a pas. */
export function trReport(comments: any[] | null | undefined): Record<string, unknown> | null {
  for (const c of [...(comments || [])].reverse()) {
    const body: string = c.body || ''
    if (TR_REPORT.test(body)) {
      return {
        id: c.id ?? null,
        url: c.html_url || '',
        body: body.replace(TR_REPORT, '').trim(),
        author: c.user?.login || '',
        ts: c.updated_at || c.created_at || '',
      }
    }
  }
  return null
}

/** GitHub refuse la création : jeton en lecture seule, ou repo sans issues. */
export class CannotWrite extends Error {}

const prKey = (p: any) => `${p.repo}#${p.number}`
const byKey = (items: any[] | undefined) => new Map((items || []).map((p) => [prKey(p), p]))
const ciState = (p: any) => p?.ci?.state

type Sources = { basecamp: boolean; trello: boolean }
/** Outils actifs (Basecamp, Trello), relus à chaque passe : sans eux, la section `issues` ne lit rien. */
let issueSources: () => Sources = () => ({ basecamp: true, trello: true })

export function setIssueSources(fn: () => Sources): void {
  issueSources = fn
}

/** Dépôts confirmés disparus : app.ts les retire de la config. */
let repoGone: (account: string, repos: string[]) => void = () => undefined
let reposRemoved = 0
export function setRepoGone(fn: (account: string, repos: string[]) => void): void {
  repoGone = fn
}

/** Adresses qui répondent 404 si le dépôt n'est plus là. Pas `contents/…` ni `commits/…` : ceux-là manquent normalement. */
const REPO_PATH = /^\/repos\/([\w.-]+\/[\w.-]+)(?:\/(?:pulls|branches|issues))?$/
/** Passes de suite où GitHub dit 404 avant de retirer : un incident ne doit rien effacer. */
const GONE_AFTER = 2

export const SECTIONS = ['branches', 'prs', 'renovate', 'merged', 'issues', 'running'] as const

type Data = { branches: any[]; prs: any[]; renovate: any[]; renovate_merged: any[]; merged: any[]; issues: any[]; tr_issues: any[]; running: any[] }

export class GitHubAccount {
  ACCOUNT = { id: 'main', label: '' }
  CFG: Record<string, any> = { ...DEFAULTS }
  STATS = { calls: 0, hits: 0, errors: 0 }
  private owners = new Map<string, string>()
  private tok: string | null = null
  private source: string | null = null
  private authCache = new Map<string, [number, Record<string, any>]>()
  private etags = new Map<string, [string, unknown]>()
  private branchFacts = new Map<string, any>()
  private remoteState = new Map<string, { default: string; branches: Record<string, string>; ts: number }>()
  private remoteVer = 0
  /** Dépôts qui ont répondu 404 pendant cette passe, et passes de suite où c'est confirmé. */
  private suspects = new Set<string>()
  private strikes = new Map<string, number>()
  /** Sections déjà vues, et pour quel utilisateur : la première passe ne notifie rien. */
  private seeded = { user: null as string | null, sections: new Set<string>() }
  data: Data = { branches: [], prs: [], renovate: [], renovate_merged: [], merged: [], issues: [], tr_issues: [], running: [] }
  private state = { ts: 0, building: false, user: null as string | null, error: null as string | null }

  /** Applique les réglages du compte. Rechargeable à chaud. */
  configure(cfg: Record<string, any> | null | undefined): void {
    const given = cfg || {}
    // Repartir des défauts : une clé retirée de la config ne doit pas survivre.
    this.CFG = { ...structuredClone(DEFAULTS) }
    for (const [k, v] of Object.entries(given)) if (!k.startsWith('_')) this.CFG[k] = v
    // Clé absente = mêmes repos que les PRs. Liste vide = vide.
    if (!('branch_repos' in given)) this.CFG.branch_repos = [...(this.CFG.repos || [])]
    if (!this.CFG.users || (Array.isArray(this.CFG.users) && !this.CFG.users.length) || (typeof this.CFG.users === 'object' && !Object.keys(this.CFG.users).length))
      this.CFG.users = this.CFG.me ? [this.CFG.me] : []
    if (this.CFG.disabled) this.seeded.sections.clear() // rallumé plus tard : ce qui a bougé n'est pas une nouveauté
    // `users` accepte l'ancien format {login: prefix} comme le nouveau [login]
    this.CFG.users = Array.isArray(this.CFG.users) ? [...this.CFG.users] : Object.keys(this.CFG.users)
    // Chaque repo s'écrit `propriétaire/repo` ; partout ailleurs il est désigné par son seul nom.
    this.owners.clear()
    for (const key of ['repos', 'branch_repos', 'base_site_repos']) {
      const names: string[] = []
      for (const entry of this.CFG[key] || []) {
        const s = String(entry)
        const i = s.lastIndexOf('/')
        const own = i >= 0 ? s.slice(0, i) : ''
        const name = i >= 0 ? s.slice(i + 1) : s
        if (own) this.owners.set(name, own)
        names.push(name)
      }
      this.CFG[key] = names
    }
    const up: string = this.CFG.upstream_repo || ''
    if (up.includes('/')) {
      const i = up.lastIndexOf('/')
      this.owners.set(up.slice(i + 1), up.slice(0, i))
      this.CFG.upstream_repo = up.slice(i + 1)
    }
    // Socle laissé au défaut : il vit chez le propriétaire de ses repos dérivés.
    const name = this.CFG.upstream_repo
    if (name && !this.owners.has(name) && (this.CFG.base_site_repos || []).length)
      this.owners.set(name, this.owners.get(this.CFG.base_site_repos[0]) || '')
  }

  /** Propriétaire d'un repo : celui de la config, sinon celui du remote local (`hint`). */
  owner(repo: string, hint?: string | null): string {
    return this.owners.get(repo) || hint || ''
  }

  enabled(): boolean {
    return !!this.CFG.me && !this.CFG.disabled
  }

  /** Nouveau jeton (ou null) : on repart de zéro (cache ETag, amorçage du journal). */
  applyToken(value: string | null, source: string | null): void {
    const changed = (value || null) !== this.tok
    this.tok = value || null
    this.source = value ? source : null
    if (changed) {
      this.etags.clear()
      this.authCache.clear()
      this.seeded.sections.clear()
      this.suspects.clear()
      this.strikes.clear()
      this.invalidate()
    }
  }

  token(): string | null {
    return this.tok
  }

  tokenSource(): string | null {
    return this.source
  }

  private headers(tok: string, accept = 'application/vnd.github+json'): Record<string, string> {
    return { Authorization: `Bearer ${tok}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'homedash/2.0' }
  }

  /** [statut, contenu, en-têtes] sans cache : pour Réglages, qui a besoin de savoir *pourquoi*. */
  async probe(p: string, tok: string | null, params?: Record<string, unknown>): Promise<[number, any, Headers | null]> {
    try {
      const res = await fetcher(API + p + query(params), { headers: this.headers(tok || ''), signal: AbortSignal.timeout(12000) })
      if (res.status === 404) this.noteMissing(p)
      const text = await res.text()
      let body: any = null
      try {
        body = text ? JSON.parse(text) : null
      } catch {
        body = null
      }
      return [res.status, body, res.headers]
    } catch (e) {
      return [0, { message: String((e as Error).message || e) }, null]
    }
  }

  /** Compte du jeton, mis en cache une minute. */
  async whoami(tok?: string | null, fresh = false): Promise<Record<string, any>> {
    const t = tok || this.tok
    if (!t) return { ok: false, error: null }
    const hit = this.authCache.get(t)
    if (hit && !fresh && Date.now() / 1000 - hit[0] < 60) return hit[1]
    const [status, body, headers] = await this.probe('/user', t)
    let info: Record<string, any>
    if (status === 200)
      info = {
        ok: true,
        login: body.login,
        name: body.name ?? null,
        avatar: body.avatar_url ?? null,
        // jeton classic : liste des scopes ; fine-grained : en-tête absent
        scopes: headers?.get('X-OAuth-Scopes') ?? null,
        rate_remaining: headers?.get('X-RateLimit-Remaining') ?? null,
      }
    else if (status === 401) info = { ok: false, error: 'jeton refusé par GitHub (expiré ou révoqué)' }
    else if (status === 0) info = { ok: false, error: `GitHub injoignable : ${body?.message}` }
    else info = { ok: false, error: `GitHub répond ${status}` }
    this.authCache.set(t, [Date.now() / 1000, info])
    return info
  }

  /** whoami déjà connu (sans appel réseau) : pour les listes. */
  cachedWhoami(): Record<string, any> | null {
    return this.tok ? (this.authCache.get(this.tok)?.[1] ?? null) : null
  }

  private async paged(p: string, tok: string | null, params: Record<string, unknown>, limit = 500): Promise<any[] | number> {
    const out: any[] = []
    let page = 1
    while (out.length < limit) {
      const [status, body] = await this.probe(p, tok, { ...params, per_page: 100, page })
      if (status !== 200) return out.length ? out : status
      out.push(...(body || []))
      if ((body || []).length < 100) break
      page += 1
    }
    return out
  }

  /** Comptes dont le jeton voit des repos : le sien, ses orgs (aussi déduites des repos). */
  async ownersList(): Promise<any[]> {
    const me = await this.whoami()
    if (!me.ok) return []
    const seen = new Map<string, any>([[me.login.toLowerCase(), { login: me.login, type: 'User', avatar: me.avatar }]])
    const orgs = await this.paged('/user/orgs', this.tok, {}, 200)
    for (const o of Array.isArray(orgs) ? orgs : []) {
      const k = o.login.toLowerCase()
      if (!seen.has(k)) seen.set(k, { login: o.login, type: 'Organization', avatar: o.avatar_url ?? null })
    }
    const repos = await this.paged('/user/repos', this.tok, { sort: 'pushed' }, 300)
    for (const r of Array.isArray(repos) ? repos : []) {
      const o = r.owner || {}
      const k = (o.login || '').toLowerCase()
      if (!seen.has(k)) seen.set(k, { login: o.login ?? null, type: o.type ?? null, avatar: o.avatar_url ?? null })
    }
    return [...seen.values()].filter((v) => v.login)
  }

  /** Pseudo-compte des Réglages : repos d'autres comptes perso où le jeton est collaborateur. */
  static SHARED = '@partages'

  /** Repos visibles de `account`, les plus actifs d'abord. */
  async reposOf(account: string): Promise<Record<string, unknown>> {
    const me = await this.whoami()
    let data: any[] | number
    if (account === GitHubAccount.SHARED) {
      data = await this.paged('/user/repos', this.tok, { affiliation: 'collaborator', sort: 'pushed' })
      if (Array.isArray(data)) data = data.filter((r) => r.owner?.type !== 'Organization')
    } else if (me.ok && account.toLowerCase() === me.login.toLowerCase()) {
      data = await this.paged('/user/repos', this.tok, { affiliation: 'owner', sort: 'pushed' })
    } else {
      data = await this.paged(`/orgs/${account}/repos`, this.tok, { type: 'all', sort: 'pushed' })
      if (data === 404) data = await this.paged(`/users/${account}/repos`, this.tok, { sort: 'pushed' })
    }
    if (!Array.isArray(data)) return { error: `GitHub répond ${data} pour ${account}` }
    data.sort((a, b) => ((b.pushed_at || '') > (a.pushed_at || '') ? 1 : (b.pushed_at || '') < (a.pushed_at || '') ? -1 : 0))
    return {
      repos: data.map((r) => ({
        name: r.name,
        full_name: r.full_name,
        owner: r.owner.login,
        private: r.private ?? null,
        archived: r.archived ?? null,
        pushed_at: r.pushed_at ?? null,
        description: r.description ?? null,
      })),
    }
  }

  async membersOf(org: string): Promise<Record<string, unknown>> {
    const data = await this.paged(`/orgs/${org}/members`, this.tok, {}, 300)
    if (!Array.isArray(data)) return { error: data === 403 || data === 404 ? 'liste des membres inaccessible avec ce jeton' : `GitHub répond ${data}` }
    return { members: data.map((m) => ({ login: m.login, avatar: m.avatar_url ?? null })) }
  }

  async lookupUser(login: string): Promise<Record<string, unknown> | null> {
    const [status, body] = await this.probe(`/users/${encodeURIComponent(login)}`, this.tok)
    if (status === 200) return { login: body.login, name: body.name ?? null, avatar: body.avatar_url ?? null }
    return null
  }

  private noteMissing(p: string): void {
    const full = REPO_PATH.exec(p)?.[1]
    if (full) this.suspects.add(full.toLowerCase())
  }

  /**
   * Fin de passe : un dépôt suivi qui répond 404 est revérifié directement. Il n'est retiré
   * qu'après GONE_AFTER passes, jeton valide, et jamais si tous les dépôts suivis manquent :
   * ce serait le jeton qui a perdu ses droits, pas les dépôts qui ont disparu.
   */
  private async settleMissing(tok: string): Promise<void> {
    const suspects = [...this.suspects]
    this.suspects.clear()
    for (const known of [...this.strikes.keys()]) if (!suspects.includes(known)) this.strikes.delete(known)
    if (!suspects.length) return
    const followed = new Set(
      ['repos', 'branch_repos', 'base_site_repos'].flatMap((k) => (this.CFG[k] || []) as string[]).map((r) => `${this.owner(r)}/${r}`.toLowerCase()),
    )
    const [me] = await this.probe('/user', tok)
    if (me !== 200) return
    const missing: string[] = []
    for (const full of suspects.filter((x) => followed.has(x))) {
      const [status] = await this.probe(`/repos/${full}`, tok)
      this.suspects.delete(full)
      if (status === 404) missing.push(full)
      else this.strikes.delete(full)
    }
    if (missing.length >= followed.size) return
    const gone = missing.filter((full) => {
      const n = (this.strikes.get(full) ?? 0) + 1
      this.strikes.set(full, n)
      return n >= GONE_AFTER
    })
    if (!gone.length) return
    for (const full of gone) this.strikes.delete(full)
    reposRemoved += 1
    repoGone(this.ACCOUNT.id, gone)
  }

  // ── Appels API, avec requêtes conditionnelles ────────────────────────────────
  async gh(p: string, tok: string | null, params?: Record<string, unknown>, cache = true, accept = 'application/vnd.github+json'): Promise<any> {
    const url = API + p + query(params)
    // même adresse, autre format = autre entrée du cache
    const key = accept === 'application/vnd.github+json' ? url : `${url} ${accept}`
    let cached: [string, unknown] | undefined
    if (cache) {
      cached = this.etags.get(key)
      if (cached) {
        this.etags.delete(key)
        this.etags.set(key, cached)
      }
    }
    const headers = this.headers(tok || '', accept)
    if (cached) headers['If-None-Match'] = cached[0]
    try {
      const res = await fetcher(url, { headers, signal: AbortSignal.timeout(12000) })
      if (res.status === 304 && cached) {
        this.STATS.hits += 1 // inchangé → hors quota
        return cached[1]
      }
      if (!res.ok) {
        this.STATS.errors += 1
        if (res.status === 404) this.noteMissing(p)
        console.error(`    ✗ ${p}: HTTP ${res.status}`)
        // GitHub indisponible un instant (5xx) : la dernière réponse connue plutôt qu'un vide.
        return cached && res.status >= 500 ? cached[1] : null
      }
      const payload = await res.json()
      const etag = res.headers.get('ETag')
      if (cache && etag) {
        this.etags.delete(key)
        this.etags.set(key, [etag, payload])
        while (this.etags.size > ETAG_MAX) this.etags.delete(this.etags.keys().next().value as string)
      }
      this.STATS.calls += 1
      return payload
    } catch (e) {
      this.STATS.errors += 1
      console.error(`    ✗ ${p}: ${(e as Error).message || e}`)
      return cached ? cached[1] : null
    }
  }

  private async checkRuns(sha: string, repo: string, tok: string): Promise<any[]> {
    const data = await this.gh(`/repos/${this.owner(repo)}/${repo}/commits/${sha}/check-runs`, tok, { per_page: 100 })
    return data?.check_runs || []
  }

  private async ciOf(sha: string, repo: string, tok: string) {
    return ciSummary(await this.checkRuns(sha, repo, tok))
  }

  // ── Attribution des branches ─────────────────────────────────────────────────
  /** PR du commit de tête, seulement si elle pointe bien sur CETTE branche. */
  private async branchPr(repo: string, sha: string, name: string, tok: string) {
    for (const pr of (await this.gh(`/repos/${this.owner(repo)}/${repo}/commits/${sha}/pulls`, tok, { per_page: 20 })) || []) {
      if (pr.head?.ref !== name) continue
      return { number: pr.number, url: pr.html_url, author: pr.user?.login ?? null, merged: !!pr.merged_at }
    }
    return null
  }

  private async branchFact(repo: string, base: string, b: any, tok: string): Promise<any> {
    const name: string = b.name
    const sha: string = b.commit.sha
    const key = JSON.stringify([repo, name, sha])
    const hit = this.branchFacts.get(key)
    if (hit) return hit
    const cmp = await this.gh(`/repos/${this.owner(repo)}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(name)}`, tok, { per_page: 100 })
    if (cmp === null || cmp === undefined) return null
    const commits: any[] = cmp.commits || []
    const ahead = cmp.ahead_by || 0
    let authors: string[] = []
    let pr: any = null
    let creator: string | null
    let creatorSrc: string
    let lastAuthor: string | null
    let dateRaw: string
    if (commits.length) {
      for (const c of commits) {
        const a = commitAuthor(c)
        if (a && !authors.includes(a)) authors.push(a)
      }
      creator = commitAuthor(commits[0])
      creatorSrc = 'commit'
      lastAuthor = commitAuthor(commits[commits.length - 1])
      dateRaw = commits[commits.length - 1].commit?.author?.date || ''
    } else {
      // Branche entièrement mergée : le merge base EST le commit de tête.
      const mb = cmp.merge_base_commit || {}
      dateRaw = mb.commit?.author?.date || ''
      const tip = commitAuthor(mb)
      lastAuthor = tip
      authors = tip ? [tip] : []
      creator = tip
      creatorSrc = 'tip'
      pr = await this.branchPr(repo, sha, name, tok)
      if (pr?.author) {
        creator = pr.author
        creatorSrc = 'pr'
        if (!authors.includes(pr.author)) authors.push(pr.author)
      }
    }
    const fact = {
      repo,
      name,
      sha,
      base,
      date: fmtDt(dateRaw),
      date_raw: dateRaw,
      ahead,
      merged: ahead === 0,
      creator,
      creator_src: creatorSrc,
      last_author: lastAuthor,
      authors,
      pr,
      url: `https://github.com/${this.owner(repo)}/${repo}/tree/${encodeURIComponent(name).replace(/%2F/g, '/')}`,
    }
    this.branchFacts.set(key, fact)
    return fact
  }

  private async repoBranchFacts(repo: string, tok: string): Promise<any[]> {
    const meta = (await this.gh(`/repos/${this.owner(repo)}/${repo}`, tok)) || {}
    const base: string = meta.default_branch || 'master'
    const branches: any[] = []
    const every: Record<string, string> = {}
    for (let page = 1; ; page++) {
      const data: any[] = (await this.gh(`/repos/${this.owner(repo)}/${repo}/branches`, tok, { per_page: 100, page })) || []
      branches.push(...data.filter((b) => b.name !== base))
      for (const b of data) every[b.name] = b.commit.sha
      if (data.length < 100) break
    }
    const before = this.remoteState.get(repo)
    // La version ne bouge que si le distant a changé : l'onglet Local relance un scan à chaque version.
    if (!before || before.default !== base || JSON.stringify(sortedObj(before.branches)) !== JSON.stringify(sortedObj(every))) this.remoteVer += 1
    this.remoteState.set(repo, { default: base, branches: every, ts: Date.now() / 1000 })
    const facts = (await pmap(branches, MAX_WORKERS, (b) => this.branchFact(repo, base, b, tok))).filter(Boolean)
    const live = new Set(branches.map((b) => JSON.stringify([repo, b.name, b.commit.sha])))
    for (const k of [...this.branchFacts.keys()]) if (JSON.parse(k)[0] === repo && !live.has(k)) this.branchFacts.delete(k)
    return facts
  }

  /** Compteur des instantanés distants : l'onglet Local relance son scan dès que GitHub a répondu. */
  remoteVersion(): number {
    return this.remoteVer
  }

  /** {default, branches: {nom: sha}, ts} vu au dernier fetch, ou null si jamais interrogé. */
  remoteSnapshot(repo: string): { default: string; branches: Record<string, string>; ts: number } | null {
    const s = this.remoteState.get(repo)
    return s ? { ...s } : null
  }

  /** {`repo\0branche`: fait} : PR et état mergé, pour l'onglet Local. */
  branchFactsIndex(): Map<string, any> {
    const out = new Map<string, any>()
    for (const [k, f] of this.branchFacts) {
      const [r, n] = JSON.parse(k)
      out.set(`${r}\u0000${n}`, f)
    }
    return out
  }

  /**
   * PR dont `head.ref` est `branch`, même fermée, même branche supprimée : par
   * nom de branche, seul moyen de retrouver une PR squashée puis supprimée.
   */
  async prForBranch(repo: string, branch: string, hint?: string | null): Promise<any> {
    const own = this.owner(repo, hint)
    if (!this.tok || !own) return null
    const data: any[] = (await this.gh(`/repos/${own}/${repo}/pulls`, this.tok, { state: 'all', head: `${own}:${branch}`, per_page: 10 })) || []
    let best: any = null
    for (const pr of data) {
      if (pr.head?.ref !== branch) continue
      const cand = {
        number: pr.number,
        url: pr.html_url,
        author: pr.user?.login ?? null,
        merged: !!pr.merged_at,
        merged_at: pr.merged_at ?? null,
        state: pr.state ?? null,
      }
      if (cand.merged) return cand // une PR mergée tranche
      best = best || cand
    }
    return best
  }

  private async fetchBranches(tok: string, user: string): Promise<any[]> {
    const repos: string[] = this.CFG.branch_repos || []
    const facts = (await pmap(repos, MAX_WORKERS, (r) => this.repoBranchFacts(r, tok))).flat()
    const mine = facts.map((f) => ({ f, role: branchRole(f, user) })).filter((x) => x.role).map(({ f, role }) => ({ ...f, role }))
    mine.sort((a, b) => Number(a.merged) - Number(b.merged) || (b.date_raw > a.date_raw ? 1 : b.date_raw < a.date_raw ? -1 : 0))
    return mine
  }

  private async fetchPrs(tok: string, user: string): Promise<any[]> {
    const tasks = (
      await pmap(this.CFG.repos || [], MAX_WORKERS, async (repo: string) => {
        const pulls: any[] = (await this.gh(`/repos/${this.owner(repo)}/${repo}/pulls`, tok, { state: 'open', per_page: 20 })) || []
        return pulls.filter((pr) => pr.user?.login === user).map((pr) => [repo, pr] as [string, any])
      })
    ).flat()
    return pmap(tasks, MAX_WORKERS, async ([repo, pr]) => ({
      repo,
      number: pr.number,
      title: emojify(pr.title),
      branch: pr.head.ref,
      url: pr.html_url,
      created_at: fmtDt(pr.created_at),
      ci: await this.ciOf(pr.head.sha, repo, tok),
    }))
  }

  /** Workflows en cours sur les repos suivis, toutes branches. Les jobs ne sont lus que pour eux. */
  private async fetchRunning(tok: string): Promise<any[]> {
    const tasks = (
      await pmap(this.CFG.repos || [], MAX_WORKERS, async (repo: string) => {
        const data = await this.gh(`/repos/${this.owner(repo)}/${repo}/actions/runs`, tok, { per_page: 20 })
        return (data?.workflow_runs || []).filter((run: any) => run.status !== 'completed').map((run: any) => [repo, run] as [string, any])
      })
    ).flat()
    return pmap(tasks, MAX_WORKERS, async ([repo, run]) => {
      const data = await this.gh(`/repos/${this.owner(repo)}/${repo}/actions/runs/${run.id}/jobs`, tok, { per_page: 100 })
      return runningRun(repo, run, data?.jobs || [])
    })
  }

  private async fetchMerged(tok: string, user: string): Promise<any[]> {
    const count = this.CFG.merged_count ?? 10
    if (!count) return []
    const tasks = (
      await pmap(this.CFG.repos || [], MAX_WORKERS, async (repo: string) => {
        const pulls: any[] =
          (await this.gh(`/repos/${this.owner(repo)}/${repo}/pulls`, tok, { state: 'closed', per_page: count, sort: 'updated', direction: 'desc' })) || []
        return pulls.filter((pr) => pr.user?.login === user && pr.merged_at).map((pr) => [repo, pr] as [string, any])
      })
    ).flat()
    const out = await pmap(tasks, MAX_WORKERS, async ([repo, pr]) => ({
      repo,
      number: pr.number,
      title: emojify(pr.title),
      // la branche sert à rapprocher la PR de sa copie locale, onglet Local
      branch: pr.head?.ref ?? null,
      merged_at: fmtDt(pr.merged_at),
      merged_at_raw: pr.merged_at,
      url: pr.html_url,
      ci: await this.ciOf(pr.merge_commit_sha || pr.head.sha, repo, tok),
    }))
    out.sort((a, b) => (b.merged_at_raw > a.merged_at_raw ? 1 : b.merged_at_raw < a.merged_at_raw ? -1 : 0))
    return out.slice(0, count)
  }

  /**
   * Issues liées à Basecamp (`homedash:bc`) et à Trello (`homedash:tr`) : une
   * seule liste par repo, triée ensuite. Rien n'est lu pour un outil inactif.
   */
  private async fetchLinkedIssues(tok: string): Promise<[any[], any[]]> {
    const sources = issueSources()
    if (!sources.basecamp && !sources.trello) return [[], []]
    const tasks = (
      await pmap(this.CFG.repos || [], MAX_WORKERS, async (repo: string) => {
        const items = await this.gh(`/repos/${this.owner(repo)}/${repo}/issues`, tok, {
          state: 'all',
          sort: 'updated',
          direction: 'desc',
          per_page: BC_ISSUES_SCAN,
        })
        const out: [string, any, string, string][] = []
        for (const it of Array.isArray(items) ? items : []) {
          if (it.pull_request) continue
          const bc = sources.basecamp ? BC_LINK.exec(it.body || '') : null
          const tr = sources.trello ? TR_LINK.exec(it.body || '') : null
          if (bc || tr) out.push([repo, it, bc?.[1] || '', tr?.[1] || ''])
        }
        return out
      })
    ).flat()
    const found = await pmap(tasks, MAX_WORKERS, async ([repo, it, bcUrl, trUrl]) => {
      let comments: any[] = []
      const n = it.comments || 0
      if (n) {
        // le rapport arrive en dernier : la dernière page suffit
        const got = await this.gh(
          `/repos/${this.owner(repo)}/${repo}/issues/${it.number}/comments`,
          tok,
          { per_page: 100, page: Math.floor((n - 1) / 100) + 1 },
          true,
          'application/vnd.github.full+json',
        )
        comments = Array.isArray(got) ? got : []
      }
      const base = {
        repo: `${this.owner(repo)}/${repo}`,
        number: it.number,
        title: it.title || '',
        url: it.html_url || '',
        state: it.state || 'open',
        updated_at: it.updated_at || '',
      }
      return {
        bc: bcUrl ? { ...base, bc_url: bcUrl, report: n ? bcReport(comments) : null } : null,
        tr: trUrl ? { ...base, tr_url: trUrl, report: n ? trReport(comments) : null } : null,
      }
    })
    const recent = (a: any, b: any) => (b.updated_at > a.updated_at ? 1 : b.updated_at < a.updated_at ? -1 : 0)
    const bc = found.map((f) => f.bc).filter(Boolean).sort(recent)
    const tr = found.map((f) => f.tr).filter(Boolean).sort(recent)
    return [bc, tr]
  }

  /**
   * Seule écriture de homedash vers GitHub : une issue, à la demande (onglet
   * Basecamp). `repo` = `propriétaire/repo`, forcément un repo suivi par ce compte.
   */
  async createIssue(repo: unknown, title: string, body: string): Promise<{ number: number; url: string }> {
    const full = String(repo || '')
    const i = full.lastIndexOf('/')
    const own = i >= 0 ? full.slice(0, i) : ''
    const name = i >= 0 ? full.slice(i + 1) : full
    if (!own || !(this.CFG.repos || []).includes(name) || this.owner(name) !== own) throw new RangeError('repo non suivi par ce compte')
    if (!this.tok) throw new CannotWrite('compte GitHub non connecté')
    const res = await fetcher(`${API}/repos/${own}/${name}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title, body }),
      headers: { ...this.headers(this.tok), 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
    })
    // 403 / 404 : pas le droit d'écrire ; 410 : issues coupées
    if ([403, 404, 410].includes(res.status)) throw new CannotWrite(`HTTP ${res.status}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const it: any = await res.json()
    const made = { repo: full, number: it.number, title: it.title || title, url: it.html_url || '', state: 'open', updated_at: it.updated_at || '', report: null }
    const others = (list: any[]) => list.filter((x) => !(x.repo === full && x.number === it.number))
    // visible tout de suite sur sa tâche (ou sa carte), sans attendre la prochaine relecture
    const m = BC_LINK.exec(body || '')
    if (m) this.data.issues = [{ ...made, bc_url: m[1] }, ...others(this.data.issues)]
    const tm = TR_LINK.exec(body || '')
    if (tm) this.data.tr_issues = [{ ...made, tr_url: tm[1] }, ...others(this.data.tr_issues)]
    return { number: it.number, url: it.html_url || '' }
  }

  /** Issues liées à Trello et repos où en créer. Liste distincte de `bcIssues`. */
  trIssues(): { issues: any[]; repos: string[] } {
    return {
      issues: this.data.tr_issues,
      repos: (this.CFG.repos || []).filter((r: string) => this.owner(r)).map((r: string) => `${this.owner(r)}/${r}`),
    }
  }

  /** Issues liées à Basecamp et repos où en créer, pour l'onglet Basecamp. */
  bcIssues(): { issues: any[]; repos: string[] } {
    return {
      issues: this.data.issues,
      repos: (this.CFG.repos || []).filter((r: string) => this.owner(r)).map((r: string) => `${this.owner(r)}/${r}`),
    }
  }

  private async fetchRenovate(tok: string): Promise<[any[], any[]]> {
    const author = this.CFG.renovate_author ?? 'renovate[bot]'
    const upstream: string = this.CFG.upstream_repo || ''
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
    // Sans repo dérivé, rien à suivre.
    if (!(this.CFG.base_site_repos || []).length) return [[], []]
    const targets: [string, boolean][] = (this.CFG.base_site_repos as string[]).filter((r) => this.owner(r)).map((r) => [r, false])
    if (upstream && this.owner(upstream)) targets.push([upstream, true])
    const results = await pmap(targets, MAX_WORKERS, async ([repo, isUp]) => {
      const opens: [string, any, boolean][] = []
      const merged: any[] = []
      for (const pr of (await this.gh(`/repos/${this.owner(repo)}/${repo}/pulls`, tok, { state: 'open', per_page: 20 })) || []) {
        if (pr.user?.login !== author) continue
        if (!isUp && !(pr.head?.ref || '').includes('base-site')) continue
        opens.push([repo, pr, isUp])
      }
      for (const pr of (await this.gh(`/repos/${this.owner(repo)}/${repo}/pulls`, tok, { state: 'closed', per_page: 10, sort: 'updated', direction: 'desc' })) || []) {
        if (pr.user?.login !== author) continue
        if (!isUp && !(pr.head?.ref || '').includes('base-site')) continue
        if (!(pr.merged_at && pr.merged_at >= since)) continue
        merged.push({
          repo,
          number: pr.number,
          title: emojify(pr.title),
          merged_at: fmtDt(pr.merged_at),
          merged_at_raw: pr.merged_at,
          url: pr.html_url,
          merge_commit_sha: pr.merge_commit_sha ?? null,
          upstream: isUp,
          version: parseVersion(pr.title),
        })
      }
      return [opens, merged] as const
    })
    let opens: any[] = results.flatMap(([o]) => o)
    let merged: any[] = results.flatMap(([, m]) => m)
    if (opens.length)
      opens = await pmap(opens, MAX_WORKERS, async ([repo, pr, isUp]) => ({
        repo,
        number: pr.number,
        title: emojify(pr.title),
        created_at: fmtDt(pr.created_at),
        url: pr.html_url,
        upstream: isUp,
        version: parseVersion(pr.title),
        ci: await this.ciOf(pr.head.sha, repo, tok),
      }))
    if (merged.length)
      merged = await pmap(merged, MAX_WORKERS, async (pr) => ({
        ...pr,
        ci: ciSummary(pr.merge_commit_sha ? await this.checkRuns(pr.merge_commit_sha, pr.repo, tok) : []),
      }))
    return [opens, merged]
  }

  // ── Journal : ce qui a changé d'un cycle à l'autre ───────────────────────────
  /**
   * Événements du cycle, pour les seules sections `todo` déjà amorcées. `since`
   * (ISO UTC) : début du cycle précédent moins une marge ; une PR mergée avant
   * n'est pas annoncée.
   */
  diff(before: Partial<Data>, after: Partial<Data>, todo: string[], since: string | null = null): events.Event[] {
    const out: events.Event[] = []
    const up = this.CFG.upstream_repo || 'upstream'
    const ev = events.event
    if (todo.includes('prs')) {
      const old = byKey(before.prs)
      for (const pr of after.prs || []) {
        const was = old.get(prKey(pr))
        if (ciState(pr) === 'fail' && ciState(was || {}) !== 'fail')
          out.push(ev('pr-fail', 'bad', 'github', `✗ CI fail — ${pr.repo} #${pr.number}`, { body: pr.title, repo: pr.repo, url: pr.url, tag: `pr:${prKey(pr)}`, sticky: true }))
        // `was` obligatoire : une PR découverte déjà verte n'est pas un passage au vert.
        else if (ciState(pr) === 'pass' && was && ciState(was) !== 'pass')
          out.push(ev('pr-pass', 'ok', 'github', `✓ CI pass — ${pr.repo} #${pr.number}`, { body: pr.title, repo: pr.repo, url: pr.url, tag: `pr:${prKey(pr)}` }))
      }
    }
    const justMerged = new Set<string>()
    if (todo.includes('merged')) {
      const old = byKey(before.merged)
      for (const pr of after.merged || []) {
        if (old.has(prKey(pr))) continue
        // Absente du cycle d'avant mais mergée bien avant : ce n'est pas une nouvelle.
        if (since && (pr.merged_at_raw || '') < since) continue
        justMerged.add(`${pr.repo}\u0000${pr.branch}`)
        out.push(ev('pr-merged', 'ok', 'github', `🎉 PR mergée — ${pr.repo} #${pr.number}`, { body: pr.title, repo: pr.repo, url: pr.url, tag: `merged:${prKey(pr)}`, sticky: true }))
      }
    }
    if (todo.includes('branches')) {
      const old = new Map((before.branches || []).map((b) => [`${b.repo}\u0000${b.name}`, b]))
      for (const b of after.branches || []) {
        const was = old.get(`${b.repo}\u0000${b.name}`)
        if (!was || was.merged || !b.merged) continue
        // Mergée par une PR à moi : `pr-merged` l'a déjà dit.
        if (justMerged.has(`${b.repo}\u0000${b.name}`)) continue
        out.push(
          ev('branch-merged', 'ok', 'github', `🌿 ${b.name} est mergée dans ${b.base}`, {
            body: `${b.repo} — plus rien de propre à cette branche.`,
            repo: b.repo,
            url: b.url,
            tag: `br:${b.repo}/${b.name}`,
          }),
        )
      }
    }
    if (todo.includes('renovate')) {
      let old = byKey(before.renovate)
      for (const pr of after.renovate || []) {
        const was = old.get(prKey(pr))
        if (!was) out.push(ev('ren-new', 'info', 'github', `🤖 Renovate disponible — ${pr.repo}`, { body: pr.title, repo: pr.repo, url: pr.url, tag: `ren:${prKey(pr)}` }))
        else if (ciState(pr) === 'fail' && ciState(was) !== 'fail')
          out.push(
            ev('ren-fail', 'bad', 'github', `🤖 Renovate CI fail — ${pr.repo} #${pr.number}`, { body: pr.title, repo: pr.repo, url: pr.url, tag: `renci:${prKey(pr)}`, sticky: true }),
          )
      }
      old = byKey(before.renovate_merged)
      for (const pr of after.renovate_merged || []) {
        const was = old.get(prKey(pr))
        const v = pr.version ? ` v${pr.version}` : ''
        if (!was) out.push(ev('rm-new', 'ok', 'github', `✅ Renovate mergée — ${pr.repo}${v}`, { body: pr.title, repo: pr.repo, url: pr.url, tag: `rm:${prKey(pr)}` }))
        else if (ciState(pr) !== ciState(was)) {
          // C'est CE signal qui débloque (ou bloque) les autres projets.
          if (ciState(pr) === 'pass')
            out.push(
              ev('rm-pass', 'ok', 'github', `🟢 ${up}${v} validée sur ${pr.repo}`, {
                body: 'CI verte : tu peux merger les autres projets.',
                repo: pr.repo,
                url: pr.url,
                tag: `rmci:${prKey(pr)}`,
                sticky: true,
              }),
            )
          else if (ciState(pr) === 'fail')
            out.push(
              ev('rm-fail', 'bad', 'github', `⛔ ${up}${v} KO sur ${pr.repo}`, {
                body: 'CI en échec après merge : ne pas propager.',
                repo: pr.repo,
                url: pr.url,
                tag: `rmci:${prKey(pr)}`,
                sticky: true,
              }),
            )
        }
      }
    }
    // Rapport posté sur une issue liée : il attend d'être publié sur Basecamp.
    if (todo.includes('issues')) {
      const old = new Map((before.issues || []).map((i) => [`${i.repo}#${i.number}`, i.report]))
      for (const i of after.issues || []) {
        const rep = i.report
        const was = old.get(`${i.repo}#${i.number}`)
        if (rep && (!was || was.id !== rep.id))
          out.push(
            ev('bc-report', 'ok', 'basecamp', `📤 Rapport prêt — ${i.repo} #${i.number}`, {
              body: `${i.title} · à publier sur la tâche Basecamp`,
              repo: i.repo,
              url: i.url,
              tag: `bcrep:${i.repo}#${i.number}`,
              sticky: true,
            }),
          )
      }
      const oldTr = new Map((before.tr_issues || []).map((i) => [`${i.repo}#${i.number}`, i.report]))
      for (const i of after.tr_issues || []) {
        const rep = i.report
        const was = oldTr.get(`${i.repo}#${i.number}`)
        if (rep && (!was || was.id !== rep.id))
          out.push(
            ev('tr-report', 'ok', 'trello', `📤 Rapport prêt — ${i.repo} #${i.number}`, {
              body: `${i.title} · à publier sur la carte Trello`,
              repo: i.repo,
              url: i.url,
              tag: `trrep:${i.repo}#${i.number}`,
              sticky: true,
            }),
          )
      }
    }
    return out
  }

  /** Tests : l'amorçage du journal. */
  seed(user: string | null, sections: string[]): void {
    this.seeded = { user, sections: new Set(sections) }
  }

  currentUser(): string {
    return this.state.user || this.CFG.me || ''
  }

  setUser(login: string): boolean {
    if (!(this.CFG.users || []).includes(login)) return false
    this.state.user = login
    this.state.ts = 0 // force un rafraîchissement
    return true
  }

  invalidate(): void {
    this.state.ts = 0
  }

  /** Rafraîchit tout, ou seulement les sections demandées (bouton ↻ d'une carte). */
  async rebuild(tok: string, sections?: string[] | null): Promise<void> {
    const started = performance.now()
    const user = this.currentUser()
    let todo = (sections || [...SECTIONS]).filter((s) => (SECTIONS as readonly string[]).includes(s))
    if (!todo.length) todo = [...SECTIONS]
    const label = todo.length === SECTIONS.length ? 'tout' : todo.join(', ')
    console.log(`⏳ GitHub : fetch ${label} pour ${user}… [${new Date().toTimeString().slice(0, 8)}]`)
    try {
      const jobs: Record<string, () => Promise<unknown>> = {
        branches: () => this.fetchBranches(tok, user),
        prs: () => this.fetchPrs(tok, user),
        renovate: () => this.fetchRenovate(tok),
        merged: () => this.fetchMerged(tok, user),
        issues: () => this.fetchLinkedIssues(tok),
        running: () => this.fetchRunning(tok),
      }
      const results = await Promise.all(todo.map((name) => jobs[name]()))
      // Instantané d'avant : les listes sont remplacées, jamais mutées.
      const before = { ...this.data }
      todo.forEach((name, i) => {
        if (name === 'renovate') {
          const [opens, merged] = results[i] as [any[], any[]]
          this.data.renovate = opens
          this.data.renovate_merged = merged
        } else if (name === 'issues') {
          const [bc, tr] = results[i] as [any[], any[]]
          this.data.issues = bc
          this.data.tr_issues = tr
        } else {
          ;(this.data as Record<string, unknown>)[name] = results[i]
        }
      })
      if (this.seeded.user !== user) {
        // Renovate est indépendant de l'observé : inutile de le ré-amorcer.
        this.seeded.user = user
        for (const s of ['branches', 'prs', 'merged']) this.seeded.sections.delete(s)
      }
      const known = todo.filter((s) => this.seeded.sections.has(s))
      for (const s of todo) this.seeded.sections.add(s)
      if (known.length) {
        // Marge : l'horloge de GitHub et la nôtre ne sont pas réglées à la seconde.
        const last = this.state.ts
        const since = last ? new Date((last - 600) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z') : null
        const found = this.diff(before, this.data, known, since)
        for (const e of found) {
          // plusieurs comptes : le journal dit lequel
          e.account = this.ACCOUNT.label || this.ACCOUNT.id
          e.tag = `${this.ACCOUNT.id}:${e.tag}`
        }
        events.record(found)
      }
      await this.settleMissing(tok)
      this.state.ts = Date.now() / 1000
      this.state.error = null
      console.log(`✅ GitHub à jour — ${this.STATS.calls} appels, ${this.STATS.hits} 304`)
      perflog.timed('github', (performance.now() - started) / 1000, { account: this.ACCOUNT.id })
    } catch (e) {
      this.state.error = String((e as Error).message || e)
      console.error(`✗ GitHub : ${e}`)
    } finally {
      this.state.building = false
    }
  }

  /** Lance un fetch si aucun n'est en cours : un seul point d'entrée. */
  kickoff(tok: string | null, sections?: string[] | null): boolean {
    if (this.state.building || !tok) return false
    this.state.building = true
    if (this.state.user === null) this.state.user = this.CFG.me
    void this.rebuild(tok, sections)
    return true
  }

  /** Tests : attend la fin du fetch en cours. */
  async settled(): Promise<void> {
    while (this.state.building) await new Promise((r) => setTimeout(r, 5))
  }

  /** Secondes depuis la dernière lecture complète. */
  age(): number {
    return Date.now() / 1000 - this.state.ts
  }

  /** Snapshot complet ; relance un fetch en tâche de fond si le cache est périmé. */
  payload(tok: string | null): Record<string, unknown> {
    if (!this.enabled()) return { enabled: false }
    if (!tok) return { enabled: false, error: 'GitHub non connecté — Réglages → Connexion GitHub' }
    if (this.state.user === null) this.state.user = this.CFG.me
    // Le front interroge toutes les `auto_refresh` secondes : on suit le front (le cache ETag rend ces cycles quasi gratuits).
    const every = this.CFG.auto_refresh || this.CFG.cache_ttl || 120
    if (Date.now() / 1000 - this.state.ts >= every) this.kickoff(tok)
    const d = this.data
    const upOpen = d.renovate.filter((p) => p.upstream)
    const upMerged = d.renovate_merged.filter((p) => p.upstream)
    const downOpen = d.renovate.filter((p) => !p.upstream)
    const downMerged = d.renovate_merged.filter((p) => !p.upstream)
    const openGroups = groupByVersion(downOpen)
    for (const g of openGroups) g.gate = versionGate(g.version, [...downMerged, ...upMerged])
    return {
      enabled: true,
      user: this.state.user,
      users: this.CFG.users || [],
      updated_at: this.state.ts,
      building: this.state.building,
      error: this.state.error,
      auto_refresh: this.CFG.auto_refresh ?? 15,
      repos_removed: reposRemoved,
      branches: { active: d.branches.filter((b) => !b.merged), stale: d.branches.filter((b) => b.merged) },
      prs: d.prs,
      merged: d.merged,
      running: d.running,
      renovate: {
        upstream_open: upOpen,
        upstream_merged: upMerged,
        open_groups: openGroups,
        merged_groups: groupByVersion(downMerged),
        gate: upstreamGate(upOpen, upMerged),
        open_count: downOpen.length + upOpen.length,
      },
      stats: { ...this.STATS },
    }
  }
}

function sortedObj(o: Record<string, string>): [string, string][] {
  return Object.entries(o).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
}
