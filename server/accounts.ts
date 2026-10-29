/**
 * Plusieurs comptes GitHub dans une même instance.
 *
 * Chaque compte a son jeton et ses réglages ; une instance `GitHubAccount` par
 * compte, donc chacun ses caches, sans rien partager. L'onglet GitHub ne fait
 * que choisir lequel il affiche.
 *
 * Config : `github_accounts` = [{"id", "label", …}], seule forme lue. Les
 * anciennes sont converties une fois par `migrate()`, appelé à chaque
 * chargement de config (une vieille sauvegarde restaurée passe par le même chemin).
 *
 * Jetons : `secrets.json` → `github_tokens` = {id: jeton}.
 *
 * `localgit` importe ce module comme vue regroupée de tous les comptes.
 */

import { GitHubAccount } from './github.ts'
import * as store from './store.ts'

const mods = new Map<string, GitHubAccount>()
let order: string[] = []

type Cfg = Record<string, any>

// ── Config ──────────────────────────────────────────────────────────────────────
export function fromConfig(cfg: Cfg): Cfg[] {
  const accs = cfg.github_accounts
  return Array.isArray(accs) ? accs.filter((a) => a && typeof a === 'object' && a.id) : []
}

/** Réglages d'un compte pour `configure()`. `on` faux : GitHub coupé dans Réglages → Fonctionnalités. */
export function settingsOf(acc: Cfg, on = true): Cfg {
  const out: Cfg = {}
  for (const [k, v] of Object.entries(acc)) if (!['id', 'label', 'disabled'].includes(k)) out[k] = v
  if (!on) out.disabled = true
  return out
}

/** Config au format courant. Appelé avant toute écriture qui touche aux comptes. */
export function normalized(cfg: Cfg): Cfg {
  return migrate(cfg)[0]
}

function full(name: unknown, org: string): string {
  const n = String(name).trim()
  return org && n && !n.includes('/') ? `${org}/${n}` : n
}

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i
const OTHER = /^(mailto|tel|file|data|javascript):/i
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/

/** `notion.so` → `https://notion.so`, `localhost:3000` → `http://…` (même règle que src/lib/url.ts). */
export function fullUrl(url: unknown): unknown {
  const u = typeof url === 'string' ? url.trim() : url
  if (typeof u !== 'string' || !u || SCHEME.test(u) || OTHER.test(u) || '/~.'.includes(u[0])) return u
  const host = u
    .split(/[/?#]/)[0]
    .replace(/:\d+$/, '')
    .toLowerCase()
  const local = host === 'localhost' || host.endsWith('.localhost') || IPV4.test(host)
  return (local ? 'http://' : 'https://') + u
}

/** JSON à clés triées, pour comparer avant/après comme `json.dumps(sort_keys=True)`. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']'
  if (v && typeof v === 'object')
    return (
      '{' +
      Object.keys(v as object)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + stable((v as Cfg)[k]))
        .join(',') +
      '}'
    )
  return JSON.stringify(v) ?? 'null'
}

/**
 * Ancien format → format courant. Renvoie [config, a_changé]. Idempotent.
 *  · section `github` seule → `github_accounts` = [{"id": "main", …}] ;
 *  · clé `org` + noms courts → `propriétaire/repo` ;
 *  · entrées de la carte Repos sans `owner` → l'org du premier compte ;
 *  · liens tapés sans schéma (`notion.so`) → `https://notion.so`.
 */
export function migrate(cfg: Cfg): [Cfg, boolean] {
  const before = stable(cfg)
  let accs = cfg.github_accounts
  if (!Array.isArray(accs) || !accs.length) {
    const gh = cfg.github && typeof cfg.github === 'object' && !Array.isArray(cfg.github) ? cfg.github : {}
    const rest: Cfg = {}
    for (const [k, v] of Object.entries(gh)) if (k !== 'id' && k !== 'label') rest[k] = v
    accs = [{ id: 'main', label: gh.label || '', ...rest }]
  }
  let firstOrg = ''
  const out: Cfg[] = []
  for (const a of accs) {
    if (!a || typeof a !== 'object' || !a.id) continue
    const acc: Cfg = { ...a }
    const org = String(acc.org || '').trim()
    delete acc.org
    firstOrg = firstOrg || org
    for (const key of ['repos', 'branch_repos', 'base_site_repos']) {
      if (Array.isArray(acc[key])) acc[key] = acc[key].filter((r: unknown) => String(r).trim()).map((r: unknown) => full(r, org))
    }
    if (acc.upstream_repo) acc.upstream_repo = full(acc.upstream_repo, org)
    out.push(acc)
  }
  cfg.github_accounts = out.length ? out : [{ id: 'main', label: '' }]
  delete cfg.github
  const repos = cfg.repos
  if (firstOrg && repos && typeof repos === 'object' && Array.isArray(repos.items)) {
    repos.items = repos.items.map((i: any) => (i && typeof i === 'object' && !Array.isArray(i) && !i.owner ? { ...i, owner: firstOrg } : i))
    if (repos.defaultOwner === undefined || repos.defaultOwner === null) repos.defaultOwner = firstOrg
  }
  for (const group of cfg.groups || []) {
    if (group && typeof group === 'object' && Array.isArray(group.links)) {
      for (const link of group.links) if (link && typeof link === 'object' && typeof link.url === 'string') link.url = fullUrl(link.url)
    }
  }
  return [cfg, stable(cfg) !== before]
}

/** L'ancien jeton unique (`github_token`) rejoint `github_tokens` sous le premier compte. */
export function migrateSecrets(firstId: string): void {
  const legacy = store.readSecret<string>('github_token')
  if (!legacy) return
  const saved = tokens()
  if (!(firstId in saved)) saved[firstId] = legacy
  store.writeSecret('github_tokens', saved)
  store.writeSecret('github_token', null)
}

export function slug(label: string, taken: Set<string>): string {
  const base =
    (label || 'compte')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'compte'
  let out = base
  let n = 2
  while (taken.has(out)) {
    out = `${base}-${n}`
    n += 1
  }
  return out
}

// ── Jetons ──────────────────────────────────────────────────────────────────────
function tokens(): Record<string, string> {
  const saved = store.readSecret<Record<string, string>>('github_tokens')
  return saved && typeof saved === 'object' && !Array.isArray(saved) ? { ...saved } : {}
}

function tokenFor(accId: string): [string | null, string | null] {
  const tok = tokens()[accId]
  return tok ? [tok, 'ui'] : [null, null]
}

/** Enregistre (ou retire, avec null) le jeton d'un compte. */
export function setToken(accId: string, value: string | null): void {
  const saved = tokens()
  if (value) saved[accId] = value
  else delete saved[accId]
  store.writeSecret('github_tokens', saved)
  mods.get(accId)?.applyToken(...tokenFor(accId))
}

/** Compte supprimé : son jeton part avec lui. */
export function forget(accId: string): void {
  const saved = tokens()
  if (accId in saved) {
    delete saved[accId]
    store.writeSecret('github_tokens', saved)
  }
}

// ── Chargement ──────────────────────────────────────────────────────────────────
/** (Re)charge les comptes. À chaud : un compte qui reste garde son instance, donc ses caches. */
export function configure(cfg: Cfg): void {
  const accs = fromConfig(cfg)
  const on = store.featureOn(cfg, 'github')
  const ids = accs.map((a) => a.id as string)
  for (const gone of [...mods.keys()].filter((i) => !ids.includes(i))) mods.delete(gone)
  order = ids
  for (const acc of accs) {
    const mod = mods.get(acc.id) || new GitHubAccount()
    mods.set(acc.id, mod)
    mod.ACCOUNT = { id: acc.id, label: acc.label || '' }
    mod.configure(settingsOf(acc, on))
    mod.applyToken(...tokenFor(acc.id))
  }
}

/** Instance du compte demandé, ou du premier s'il n'existe pas. */
export function get(accId?: string | null): GitHubAccount | null {
  if (accId && mods.has(accId)) return mods.get(accId) as GitHubAccount
  return order.length ? (mods.get(order[0]) ?? null) : null
}

export function allMods(): GitHubAccount[] {
  return order.filter((i) => mods.has(i)).map((i) => mods.get(i) as GitHubAccount)
}

/** Comptes pour le sélecteur : libellé, login du jeton, état. */
export async function listing(): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  for (const mod of allMods()) {
    const me = mod.token() ? await mod.whoami() : { ok: false }
    out.push({
      id: mod.ACCOUNT.id,
      label: mod.ACCOUNT.label || (me as Cfg).login || mod.ACCOUNT.id,
      login: (me as Cfg).login ?? null,
      avatar: (me as Cfg).avatar ?? null,
      ok: !!(me as Cfg).ok,
      source: mod.tokenSource(),
      enabled: !!(mod.token() && mod.enabled()),
    })
  }
  return out
}

export function kickoffAll(): void {
  for (const mod of allMods()) if (mod.token() && mod.enabled()) mod.kickoff(mod.token())
}

/** Page fermée ou cachée : le serveur relit quand même GitHub à ce rythme lent (journal, cloche). */
export const SLOW_EVERY = 180

export function startLoop(): void {
  setInterval(() => {
    for (const mod of allMods()) {
      try {
        if (mod.token() && mod.enabled() && mod.age() >= SLOW_EVERY) mod.kickoff(mod.token())
      } catch (e) {
        console.error(`✗ GitHub (${mod.ACCOUNT.id}) : ${e}`)
      }
    }
  }, 60_000).unref()
}

/** Issues liées à Basecamp de tous les comptes, et les repos où en créer. */
export function bcIssues(fresh = false): { issues: Cfg[]; repos: Cfg[] } {
  const issues: Cfg[] = []
  const repos: Cfg[] = []
  for (const mod of allMods()) {
    if (!(mod.token() && mod.enabled())) continue
    if (fresh && mod.age() >= (mod.CFG.auto_refresh || 15)) mod.kickoff(mod.token())
    const acc = mod.ACCOUNT.id
    const got = mod.bcIssues()
    issues.push(...got.issues.map((i) => ({ ...i, account: acc })))
    repos.push(...got.repos.map((r) => ({ account: acc, repo: r })))
  }
  return { issues, repos }
}

export function invalidateAll(): void {
  for (const mod of allMods()) mod.invalidate()
}

// ── Vue regroupée, pour l'onglet Local ─────────────────────────────────────────
export function enabled(): boolean {
  return allMods().some((m) => m.token() && m.enabled())
}

/** Appels à GitHub et réponses 304 depuis le démarrage, tous comptes (journal de perf). */
export function githubStats(): { calls: number; hits: number } {
  const out = { calls: 0, hits: 0 }
  for (const m of allMods()) {
    out.calls += m.STATS.calls
    out.hits += m.STATS.hits
  }
  return out
}

export function remoteVersion(): number {
  return allMods().reduce((a, m) => a + m.remoteVersion(), 0)
}

export function remoteSnapshot(repo: string) {
  for (const m of allMods()) {
    const snap = m.remoteSnapshot(repo)
    if (snap) return snap
  }
  return null
}

export function branchFactsIndex(): Map<string, any> {
  const out = new Map<string, any>()
  for (const m of [...allMods()].reverse()) for (const [k, v] of m.branchFactsIndex()) out.set(k, v) // le premier compte l'emporte
  return out
}

export async function prForBranch(repo: string, branch: string, hint?: string | null): Promise<any> {
  const ms = allMods().filter((m) => m.token())
  // d'abord le compte qui suit ce repo, à défaut le premier connecté
  for (const m of ms) {
    if ((m.CFG.repos || []).includes(repo) || (m.CFG.branch_repos || []).includes(repo)) return m.prForBranch(repo, branch, hint)
  }
  return ms.length ? ms[0].prForBranch(repo, branch, hint) : null
}

/** Tests : oublie tous les comptes. */
export function reset(): void {
  mods.clear()
  order = []
}
