/**
 * homedash : toute l'API et les fichiers de la page, indépendants du transport.
 *
 * `handle(req) → res` reçoit une requête déjà lue et rend une réponse complète.
 * Deux transports s'en servent : `http.ts` (dev, et l'option « accès depuis le
 * navigateur ») et le protocole `homedash://` de l'appli de bureau. Les mêmes
 * contrôles valent pour les deux (`refused()`), chacun avec ses noms d'hôte.
 */

import fs from 'node:fs'
import path from 'node:path'

import * as accounts from './accounts.ts'
import * as backup from './backup.ts'
import * as basecamp from './basecamp.ts'
import * as errlog from './errlog.ts'
import * as events from './events.ts'
import * as favicons from './favicons.ts'
import * as fullexport from './fullexport.ts'
import { CannotWrite } from './github.ts'
import { escape } from './html.ts'
import * as localfile from './localfile.ts'
import * as localgit from './localgit.ts'
import * as perflog from './perflog.ts'
import * as perfreport from './perfreport.ts'
import * as store from './store.ts'
import * as updates from './updates.ts'

/** Un export complet emporte les cookies des sites : plus gros qu'une simple écriture de config. */
export const MAX_BODY = 16 * 1024 * 1024

let publicDir = path.resolve(process.env.PUBLIC_DIR || 'dist')

export function setPublicDir(dir: string): void {
  publicDir = path.resolve(dir)
}

export type Req = {
  method: string
  /** Chemin seul, sans la requête (`/api/config`). */
  path: string
  query: URLSearchParams
  /** En-têtes en minuscules. */
  headers: Record<string, string | undefined>
  body: Buffer
}

export type Res = {
  status: number
  headers: Record<string, string>
  body: Buffer | string
  /** Fichier à envoyer tel quel (gros fichiers de Mes sites) au lieu de `body`. */
  file?: string
}

/**
 * Noms sous lesquels la page est servie, par transport. Tout autre `Host`
 * vient d'un nom de domaine qu'un site tiers a fait pointer sur cette machine
 * (DNS rebinding) pour lire l'API comme s'il était chez lui.
 */
export type Transport = { hosts: Set<string> }

export function httpHosts(extra = process.env.HOMEDASH_HOSTS || ''): Set<string> {
  return new Set([
    'localhost',
    '127.0.0.1',
    '::1',
    'host.docker.internal',
    ...extra
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  ])
}

/** `localhost:7777` → `localhost`, `[::1]:7777` → `::1`, URL d'Origin comprise. */
export function hostname(value: string | undefined): string {
  if (!value) return ''
  try {
    const u = new URL(value.includes('://') ? value : `http://${value}`)
    return u.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  } catch {
    return ''
  }
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
}

// ── Config ──────────────────────────────────────────────────────────────────────
// Node n'a qu'un fil : une lecture-modification-écriture sans `await` au milieu
// ne peut pas être coupée par une autre requête. C'est ce qui remplace le verrou
// de config de la 1.x ; aucune fonction ci-dessous n'attend entre lire et écrire.

/** (Re)configure GitHub, Local, Basecamp et le journal de perf depuis config.json, à chaud. */
export function loadSections(): void {
  let cfg: Record<string, any>
  try {
    cfg = store.read<Record<string, any>>(store.CONFIG, {}) || {}
  } catch (e) {
    console.error(`⚠ ${(e as Error).message}`)
    return
  }
  const [migrated, changed] = accounts.migrate(cfg)
  cfg = migrated
  if (changed && !store.validateConfig(cfg)) {
    store.backupConfig()
    store.write(store.CONFIG, cfg)
    console.log('ℹ config convertie au format courant')
  }
  accounts.migrateSecrets(cfg.github_accounts[0].id)
  accounts.configure(cfg)
  // Fonctionnalité coupée : plus aucune lecture (GitHub, Basecamp, disque).
  const local = cfg.local || {}
  localgit.configure({ ...local, enabled: store.featureOn(cfg, 'local') && local.enabled !== false })
  basecamp.setEnabled(store.featureOn(cfg, 'basecamp'))
  // Journal de performance : désactivé par défaut (Réglages → Affichage).
  perflog.configure(cfg.ui?.perfLog === true)
  onConfig?.(cfg)
}

/**
 * Réglages → « Accès depuis le navigateur » : état tenu par l'appli de bureau
 * (server/host.ts), qui ouvre ou ferme le port. Absent hors de l'appli.
 */
export type BrowserAccess = { on: boolean; error: string | null; url?: string }
let browserAccess: BrowserAccess | null = null
export function setBrowserAccess(state: BrowserAccess): void {
  browserAccess = state
}

/** Appelé après chaque chargement de config (l'appli de bureau y lit ses réglages). */
let onConfig: ((cfg: Record<string, any>) => void) | null = null
export function setOnConfig(fn: typeof onConfig): void {
  onConfig = fn
}

/** Après toute écriture de config : recharge, vide les caches, réveille ce qui dormait. */
export function reloadAll(): void {
  const started = performance.now()
  loadSections()
  accounts.invalidateAll()
  localgit.invalidate()
  if (localgit.enabled()) {
    localgit.startWatch()
    localgit.kickoff('réglages')
  }
  accounts.kickoffAll()
  perflog.timed('config', (performance.now() - started) / 1000)
}

/** Premier branchement d'un compte : son login devient l'utilisateur observé. Ne remplace jamais une valeur saisie. */
function adoptLogin(accId: string, login: string): void {
  const cfg = accounts.normalized(store.read<Record<string, any>>(store.CONFIG, {}) || {})
  const acc = cfg.github_accounts.find((a: any) => a.id === accId)
  if (!acc) return
  let changed = false
  if (!acc.me) {
    acc.me = login
    changed = true
  }
  if (!acc.users || !acc.users.length) {
    acc.users = [acc.me]
    changed = true
  }
  if (!acc.label) {
    acc.label = login
    changed = true
  }
  if (changed && !store.validateConfig(cfg)) {
    store.backupConfig()
    store.write(store.CONFIG, accounts.normalized(cfg))
  }
}

/** Lit la config, applique `change(liste des comptes)`, réécrit, recharge. */
function editAccounts<T>(change: (accs: any[]) => T): T {
  const cfg = accounts.normalized(store.read<Record<string, any>>(store.CONFIG, {}) || {})
  const result = change(cfg.github_accounts)
  store.backupConfig()
  store.write(store.CONFIG, accounts.normalized(cfg))
  reloadAll()
  return result
}

/** Instance neuve : de quoi afficher la page, tout le reste se remplit depuis Réglages. */
export function ensureConfig(): void {
  fs.mkdirSync(store.DATA_DIR(), { recursive: true })
  if (!fs.existsSync(store.pathOf(store.CONFIG))) {
    store.write(store.CONFIG, {
      title: 'homedash',
      groups: [{ name: 'Liens', icon: '⭐', links: [{ name: 'GitHub', url: 'https://github.com/', pinned: true }] }],
    })
    console.log('ℹ config.json créé — tout se règle dans l\'onglet Réglages')
  }
}

// ── Réponses ────────────────────────────────────────────────────────────────────
function send(status: number, body: Buffer | string, contentType: string, cache = 'no-store', extra: Record<string, string> = {}): Res {
  return { status, body, headers: { 'Content-Type': contentType, 'Cache-Control': cache, ...extra } }
}

function json(payload: unknown, status = 200, headers: Record<string, string> = {}): Res {
  return send(status, JSON.stringify(payload), 'application/json; charset=utf-8', 'no-store', headers)
}

function download(body: Buffer | string, filename: string): Res {
  return send(200, body, 'application/json; charset=utf-8', 'no-store', { 'Content-Disposition': `attachment; filename="${filename}"` })
}

function err(req: Req, status: number, message: string): Res {
  // Pannes du serveur et refus de sécurité : au journal d'erreurs (Réglages → Aide).
  if (status >= 500 || status === 403) errlog.record('serveur', message, undefined, `${req.method} ${req.path}`)
  return json({ error: message }, status)
}

/**
 * Raison de refuser la requête, ou null. Trois verrous, chacun suffisant contre un cas :
 *  · `Host` connu : contre le DNS rebinding ;
 *  · `Origin` / `Sec-Fetch-Site` : une écriture venue d'un autre site ;
 *  · corps en `application/json` : un formulaire ne peut pas le poser sans pré-vol.
 */
export function refused(req: Req, t: Transport, write: boolean): string | null {
  if (!t.hosts.has(hostname(req.headers.host))) return 'hôte non autorisé (HOMEDASH_HOSTS)'
  if (!write) return null
  const origin = req.headers.origin
  if (origin && origin !== 'null' && !t.hosts.has(hostname(origin))) return 'origine non autorisée'
  if (origin === 'null' || req.headers['sec-fetch-site'] === 'cross-site') return 'requête intersite refusée'
  if (req.body.length > 0) {
    const ctype = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
    if (ctype !== 'application/json') return 'Content-Type application/json attendu'
  }
  return null
}

class BadJson extends Error {}

function body(req: Req): any {
  if (req.body.length > MAX_BODY) throw new BadJson('payload trop volumineux')
  if (!req.body.length) return null
  try {
    return JSON.parse(req.body.toString('utf-8'))
  } catch (e) {
    throw new BadJson((e as Error).message)
  }
}

const q = (req: Req, k: string) => req.query.get(k)
const acc = (req: Req, id?: string | null) => accounts.get(id || q(req, 'account'))

// ── Routage ─────────────────────────────────────────────────────────────────────
export async function handle(req: Req, t: Transport): Promise<Res> {
  const method = req.method.toUpperCase()
  const write = !['GET', 'HEAD'].includes(method)
  const why = refused(req, t, write)
  if (why) return err(req, 403, why)
  try {
    if (!write) {
      if (req.path.startsWith('/api/')) {
        perflog.hit('GET', req.path)
        return await apiGet(req)
      }
      return staticFile(req)
    }
    if (method === 'DELETE') return await apiDelete(req)
    if (method === 'POST' && req.path !== '/api/perf') perflog.hit(method, req.path)
    if (method === 'PUT') perflog.hit(method, req.path)
    return await apiWrite(req, method)
  } catch (e) {
    if (e instanceof BadJson) return err(req, 400, `JSON invalide : ${e.message}`)
    return err(req, 500, String((e as Error).message || e))
  }
}

async function apiDelete(req: Req): Promise<Res> {
  const p = req.path
  if (p === '/api/usage') {
    store.write(store.USAGE, {})
    return json({})
  }
  if (p === '/api/events') {
    events.clear()
    return json({ ok: true })
  }
  if (p === '/api/errors') {
    errlog.clear()
    return json({ ok: true })
  }
  if (p === '/api/perf') {
    perflog.clear()
    return json(perflog.usage())
  }
  if (p === '/api/github/token') {
    const mod = acc(req)
    if (!mod) return err(req, 404, 'compte inconnu')
    accounts.setToken(mod.ACCOUNT.id, null)
    reloadAll()
    return json({ source: mod.tokenSource(), ...(await mod.whoami()) })
  }
  if (p === '/api/basecamp/token') {
    basecamp.disconnect()
    return json(basecamp.status())
  }
  if (p === '/api/basecamp/app') {
    basecamp.forget()
    return json(basecamp.status())
  }
  if (p.startsWith('/api/github/accounts/')) {
    const accId = decodeURIComponent(p.slice('/api/github/accounts/'.length))
    const problem = editAccounts((accs) => {
      if (!accs.some((a) => a.id === accId)) return 'compte inconnu'
      if (accs.length === 1) return 'dernier compte : déconnecte-le plutôt que de le supprimer'
      accs.splice(0, accs.length, ...accs.filter((a) => a.id !== accId))
      return null
    })
    if (problem) return err(req, 422, problem)
    accounts.forget(accId)
    return json({ ok: true })
  }
  if (p.startsWith('/api/backups/')) {
    if (!backup.remove(p.slice('/api/backups/'.length))) return err(req, 404, 'sauvegarde introuvable')
    return json({ ok: true })
  }
  return err(req, 404, 'route inconnue')
}

async function apiGet(req: Req): Promise<Res> {
  const p = req.path
  if (p === '/api/changelog') return json(updates.payload())
  if (p === '/api/guide') return json({ text: updates.guide() })
  if (p === '/api/config') {
    try {
      const cfg = store.read(store.CONFIG, {})
      return json(cfg, 200, { 'X-Config-Version': store.version(store.CONFIG) })
    } catch (e) {
      if (!(e instanceof store.Broken)) throw e
      // Fichier abîmé (édité à la main) : la page propose de restaurer la dernière sauvegarde valide.
      errlog.record('serveur', 'réglages illisibles', e.message, 'GET /api/config')
      return json({ error: 'réglages illisibles', broken: true, line: e.line, column: e.column, detail: e.message, backup: backup.latestGood() }, 500)
    }
  }
  if (p === '/api/errors') return json({ errors: errlog.listing(), keep_days: errlog.KEEP_DAYS })
  if (p === '/api/notes') return json(store.read(store.NOTES, []))
  if (p === '/api/usage') return json(store.read(store.USAGE, {}))
  if (p === '/api/github/accounts') return json({ accounts: await accounts.listing() })
  if (p === '/api/basecamp') return json({ ...basecamp.payload(), github: accounts.bcIssues(!!q(req, 'fresh')) })
  if (p === '/api/basecamp/search') {
    try {
      return json({ items: await basecamp.search(q(req, 'q')) })
    } catch (e) {
      return err(req, 502, (e as Error).message)
    }
  }
  if (p === '/api/basecamp/file') {
    try {
      const [ctype, data] = await basecamp.attachment(q(req, 'url'))
      return send(200, data, ctype, 'private, max-age=3600')
    } catch (e) {
      return err(req, e instanceof RangeError ? 422 : 502, (e as Error).message)
    }
  }
  if (p === '/api/basecamp/task') {
    try {
      return json(await basecamp.taskText(q(req, 'url')))
    } catch (e) {
      return err(req, e instanceof RangeError ? 422 : 502, (e as Error).message)
    }
  }
  if (p === '/api/basecamp/auth') return json(basecamp.status())
  if (p === '/api/basecamp/callback') return basecampCallback(req)
  if (p === '/api/file') return fileOf(req, q(req, 'path'))
  if (p === '/api/favicon') return favicon(req, q(req, 'host'))
  if (p.startsWith('/api/github')) {
    const mod = acc(req)
    if (!mod) return json({ enabled: false, accounts: [] })
    if (p === '/api/github') return json({ ...mod.payload(mod.token()), account: mod.ACCOUNT.id, accounts: await accounts.listing() })
    if (p === '/api/github/auth') return json({ source: mod.tokenSource(), account: mod.ACCOUNT.id, ...(await mod.whoami(null, !!q(req, 'fresh'))) })
    if (p === '/api/github/owners') return json({ owners: await mod.ownersList() })
    if (p.startsWith('/api/github/repos/')) return json(await mod.reposOf(decodeURIComponent(p.slice('/api/github/repos/'.length))))
    if (p.startsWith('/api/github/members/')) return json(await mod.membersOf(decodeURIComponent(p.slice('/api/github/members/'.length))))
    if (p.startsWith('/api/github/users/')) {
      const found = await mod.lookupUser(decodeURIComponent(p.slice('/api/github/users/'.length)))
      return found ? json(found) : err(req, 404, 'utilisateur GitHub introuvable')
    }
  }
  if (p === '/api/local/browse') return json(localgit.browse(q(req, 'path') || '~', !!q(req, 'files')))
  if (p === '/api/local/roots') return json({ roots: localgit.rootStatus(), home: localgit.homeDisplay() })
  if (p === '/api/backups') return json({ backups: backup.listing() })
  if (p === '/api/backup') {
    // export à la volée de l'état courant, en téléchargement
    return download(JSON.stringify(backup.bundle('export'), null, 1), `homedash-${store.stamp()}.json`)
  }
  if (p.startsWith('/api/backups/')) {
    const file = backup.pathOf(p.slice('/api/backups/'.length))
    if (!file) return err(req, 404, 'sauvegarde introuvable')
    return download(fs.readFileSync(file), 'homedash-' + path.basename(file))
  }
  if (p === '/api/local') return json(localgit.payload())
  if (p === '/api/events') {
    // `since` = dernier seq connu du client.
    const since = q(req, 'since') || ''
    const limit = q(req, 'limit') || ''
    return json(events.payload(/^\d+$/.test(since) ? Number(since) : null, /^\d+$/.test(limit) ? Number(limit) : events.MAX))
  }
  if (p === '/api/perf') return json(perflog.usage())
  if (p === '/api/perf/report') {
    const days = perfreport.report(perflog.perfDir(), Math.max(1, Math.min(30, Math.trunc(Number(q(req, 'days') || 7)) || 7)))
    return json({ days, text: perfreport.text(days) })
  }
  if (p === '/api/health')
    return json({ ok: true, github: accounts.enabled(), basecamp: basecamp.connected(), local: localgit.enabled(), accounts: accounts.allMods().length, version: updates.current(), browser_access: browserAccess })
  return err(req, 404, 'route inconnue')
}

async function apiWrite(req: Req, method: string): Promise<Res> {
  const p = req.path
  if (p === '/api/config') {
    if (method !== 'PUT') return err(req, 405, 'PUT attendu')
    let cfg = body(req)
    if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) cfg = accounts.normalized(cfg)
    const problem = store.validateConfig(cfg)
    if (problem) return err(req, 422, problem)
    // `X-Config-Version` = version sur laquelle la page a travaillé : si le
    // fichier a changé depuis, on refuse plutôt que d'écraser l'autre en silence.
    const base = req.headers['x-config-version']
    if (base !== undefined && base !== store.version(store.CONFIG))
      return json({ error: 'config modifiée ailleurs depuis le chargement de la page', conflict: true }, 409)
    store.backupConfig()
    store.write(store.CONFIG, cfg)
    reloadAll()
    // relu après reloadAll : une migration a pu réécrire le fichier
    const ver = store.version(store.CONFIG)
    return json({ ok: true, savedAt: Date.now() / 1000, version: ver }, 200, { 'X-Config-Version': ver })
  }
  if (p === '/api/github/token') {
    const b = body(req) || {}
    const mod = acc(req, b.account)
    const value = String(b.token || '').trim()
    if (!mod) return err(req, 404, 'compte inconnu')
    if (!value) return err(req, 422, 'jeton vide')
    const info = await mod.whoami(value, true)
    if (!info.ok) return err(req, 422, info.error || 'jeton refusé')
    const accId = mod.ACCOUNT.id
    accounts.setToken(accId, value)
    adoptLogin(accId, info.login)
    reloadAll()
    return json({ source: mod.tokenSource(), account: accId, ...info })
  }
  if (p === '/api/github/accounts') {
    const label = String((body(req) || {}).label || '')
      .trim()
      .slice(0, 40)
    const id = editAccounts((accs) => {
      const accId = accounts.slug(label, new Set(accs.map((a) => a.id)))
      accs.push({ id: accId, label: label || accId, users: [], repos: [], branch_repos: [] })
      return accId
    })
    return json({ id })
  }
  if (p === '/api/backups') return json({ name: backup.snapshot('manuelle') })
  // Export complet (#61) : chiffré par mot de passe, jetons et connexions des sites compris.
  if (p === '/api/export/full') {
    const b = body(req) || {}
    let file: string
    try {
      file = fullexport.seal(fullexport.collect(b.cookies, updates.current()), b.password)
    } catch (e) {
      return err(req, 422, (e as Error).message)
    }
    return send(200, file, 'application/octet-stream', 'no-store', { 'Content-Disposition': `attachment; filename="homedash-${store.stamp()}.homedash"` })
  }
  if (p === '/api/import/preview' || p === '/api/import/apply') {
    const b = body(req) || {}
    let payload: fullexport.Payload
    try {
      payload = fullexport.open(b.file, b.password)
    } catch (e) {
      return err(req, 422, (e as Error).message)
    }
    if (p.endsWith('/preview')) return json(fullexport.summary(payload))
    const include = b.include && typeof b.include === 'object' ? b.include : {}
    let done
    try {
      done = fullexport.apply(payload, { settings: include.settings !== false, secrets: include.secrets !== false, cookies: include.cookies !== false })
    } catch (e) {
      return err(req, 422, (e as Error).message)
    }
    basecamp.resetAll()
    reloadAll()
    return json({ ok: true, ...done })
  }
  if (p === '/api/config/repair') {
    // Réglages illisibles : mis de côté, dernière sauvegarde valide restaurée.
    let done
    try {
      done = backup.repair()
    } catch (e) {
      return err(req, 409, (e as Error).message)
    }
    reloadAll()
    return json({ ok: true, ...done })
  }
  if (p === '/api/errors') {
    // Erreur vue dans la page (et son détail technique) : au journal.
    const b = body(req) || {}
    if (b && typeof b === 'object' && !Array.isArray(b)) errlog.record('page', b.shown, b.detail, b.where)
    return json({ ok: true })
  }
  if (p === '/api/basecamp/app') {
    const b = body(req) || {}
    try {
      basecamp.setApp(b.client_id, b.client_secret, b.redirect_uri)
    } catch (e) {
      return err(req, 422, (e as Error).message)
    }
    return json(basecamp.status())
  }
  if (p === '/api/basecamp/authorize') {
    try {
      return json({ url: basecamp.authorizeUrl() })
    } catch (e) {
      return err(req, 422, (e as Error).message)
    }
  }
  if (p === '/api/basecamp/code') {
    // On colle le code (ou l'adresse entière), ou l'appli l'a intercepté elle-même.
    const [code, st] = basecamp.parseCode((body(req) || {}).code)
    if (st !== null && !basecamp.checkState(st)) return err(req, 422, "lien d'autorisation expiré : relance « Se connecter »")
    try {
      await basecamp.exchange(code)
    } catch (e) {
      return err(req, 422, (e as Error).message)
    }
    basecamp.kickoff()
    return json(basecamp.status())
  }
  if (p === '/api/basecamp/report' || p === '/api/basecamp/dismiss') {
    // La page ne donne que l'issue : texte et tâche viennent de ce que le serveur a lu.
    const b = body(req) || {}
    const mod = accounts.get(b.account)
    const found = (mod ? mod.bcIssues().issues : []).find((i) => i.repo === b.repo && i.number === b.number)
    if (p.endsWith('/dismiss')) {
      if (!found) return err(req, 404, 'Issue introuvable : relis GitHub puis réessaie.')
      return json({ posted: basecamp.dismiss(found, !!b.undo) })
    }
    if (!found || !found.report) return err(req, 404, 'Pas de rapport pour cette issue : relis GitHub puis réessaie.')
    try {
      return json(await basecamp.publishReport(found))
    } catch (e) {
      errlog.record('serveur', 'rapport non publié sur Basecamp', (e as Error).message, 'POST /api/basecamp/report')
      return json({ error: (e as Error).message }, 502)
    }
  }
  if (p === '/api/basecamp/refresh') return json({ ok: true, started: basecamp.kickoff() })
  if (p === '/api/perf') {
    // Mesures de l'appli de bureau et actions de la page.
    const b = body(req)
    if (!b || typeof b !== 'object' || Array.isArray(b)) return err(req, 422, 'objet attendu')
    const { source, ...rest } = b
    try {
      perflog.append(source, rest)
    } catch (e) {
      return err(req, 422, (e as Error).message)
    }
    return json({ ok: true })
  }
  if (p === '/api/backup/restore' || (p.startsWith('/api/backups/') && p.endsWith('/restore'))) {
    let data: unknown
    if (p === '/api/backup/restore') data = body(req)
    else {
      data = backup.load(p.slice('/api/backups/'.length, -'/restore'.length))
      if (data === null) return err(req, 404, 'sauvegarde introuvable')
    }
    const problem = backup.check(data)
    if (problem) return err(req, 422, problem)
    const before = backup.restore(data)
    reloadAll()
    return json({ ok: true, before })
  }
  if (p === '/api/notes') {
    if (method !== 'PUT') return err(req, 405, 'PUT attendu')
    const notes = body(req)
    const problem = store.validateNotes(notes)
    if (problem) return err(req, 422, problem)
    store.write(store.NOTES, notes)
    return json({ ok: true })
  }
  if (p === '/api/usage') {
    if (method === 'PUT') {
      // remplacement complet (migration)
      const usage = body(req)
      if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return err(req, 422, 'les compteurs doivent être un objet')
      store.write(store.USAGE, usage)
      return json(usage)
    }
    const linkId = (body(req) || {}).id
    if (typeof linkId !== 'string' || !linkId) return err(req, 422, 'id manquant')
    return json(store.bumpUsage(linkId, Date.now()))
  }
  if (p === '/api/github/issue') {
    // Issue créée depuis une tâche Basecamp (seule écriture vers GitHub)
    const b = body(req) || {}
    const mod = acc(req, b.account)
    const title = String(b.title || '')
      .trim()
      .slice(0, 256)
    if (!mod) return err(req, 404, 'compte inconnu')
    if (!title) return err(req, 422, 'Il faut un titre.')
    let made
    try {
      made = await mod.createIssue(b.repo, title, String(b.body || '').slice(0, 60000))
    } catch (e) {
      if (e instanceof RangeError) return err(req, 422, "Ce repo n'est pas suivi par ce compte GitHub.")
      if (e instanceof CannotWrite) {
        errlog.record('serveur', "création d'issue refusée", e.message, 'POST /api/github/issue')
        return json({ error: 'GitHub refuse : la connexion de ce compte est en lecture seule pour les issues. Ouvre plutôt le formulaire.' }, 422)
      }
      throw e
    }
    mod.kickoff(mod.token(), ['issues']) // l'issue apparaît dans l'onglet Basecamp
    return json(made)
  }
  if (p === '/api/github/refresh') {
    const b = req.body.length ? body(req) || {} : {}
    const section = b.section
    const mod = acc(req, b.account)
    if (!mod) return err(req, 404, 'compte inconnu')
    let started: boolean
    if (section) started = mod.kickoff(mod.token(), [section])
    else {
      mod.invalidate()
      started = mod.kickoff(mod.token())
    }
    // started=false : un fetch tourne déjà, la demande est ignorée
    return json({ ok: true, section: section || 'all', started })
  }
  if (p === '/api/changelog/check') {
    await updates.check()
    return json(updates.payload())
  }
  if (p === '/api/local/refresh') {
    // Lecture seule de bout en bout : ne fait que relancer un parcours des .git.
    localgit.invalidate()
    return json({ ok: true, started: localgit.kickoff() })
  }
  if (p.startsWith('/api/github/user/')) {
    const login = decodeURIComponent(p.slice('/api/github/user/'.length))
    const mod = acc(req)
    if (!mod || !mod.setUser(login)) return err(req, 422, `utilisateur inconnu : ${login}`)
    return json({ ok: true, user: login })
  }
  return err(req, 404, 'route inconnue')
}

// ── Retour d'autorisation Basecamp ──────────────────────────────────────────────
/** Launchpad renvoie ici le navigateur après « Autoriser », si l'adresse de retour est cette page. */
async function basecampCallback(req: Req): Promise<Res> {
  const code = q(req, 'code')
  const st = q(req, 'state')
  const error = q(req, 'error')
  if (error) return page(`Basecamp a refusé l'accès (${error}).`, false)
  if (!code || !basecamp.checkState(st)) return page('Lien d\'autorisation expiré ou inconnu : relance « Se connecter » depuis Réglages → Basecamp.', false)
  try {
    await basecamp.exchange(code)
  } catch (e) {
    return page((e as Error).message, false)
  }
  basecamp.kickoff()
  return { status: 303, headers: { Location: '/', 'Cache-Control': 'no-store' }, body: '' }
}

function page(message: string, ok: boolean): Res {
  const html =
    "<!doctype html><meta charset=utf-8><title>homedash · Basecamp</title><body style='font:15px system-ui;background:#0b0d12;color:#e5e7eb;padding:3rem'>" +
    `<p>${ok ? '✓' : '✗'} ${escape(message, false)}</p><p><a style='color:#60a5fa' href='/'>Revenir à homedash</a></p>`
  return send(ok ? 200 : 400, html, 'text/html; charset=utf-8')
}

// ── Icône d'un onglet perso, relayée pour que la page puisse la recadrer ────────
async function favicon(req: Req, host: string | null): Promise<Res> {
  let cfg: Record<string, any>
  try {
    cfg = store.read<Record<string, any>>(store.CONFIG, {}) || {}
  } catch {
    cfg = {}
  }
  const own = new Set<string>()
  for (const t of cfg.tabs || []) {
    if (t && typeof t === 'object') {
      try {
        own.add(new URL(t.url || '').hostname.toLowerCase())
      } catch {
        /* adresse invalide */
      }
    }
  }
  let got: [Buffer | null, string]
  try {
    got = await favicons.get(host || '', cfg.ui?.faviconProvider, own)
  } catch (e) {
    return err(req, 422, (e as Error).message)
  }
  if (!got[0]) return err(req, 404, 'icône introuvable')
  return send(200, got[0], got[1], 'public, max-age=86400')
}

// ── Fichier local d'un onglet perso (lecture seule) ─────────────────────────────
function fileOf(req: Req, shown: string | null): Res {
  let target: string
  try {
    target = localfile.locate(shown)
  } catch (e) {
    return err(req, 404, (e as Error).message)
  }
  if (fs.statSync(target).isDirectory()) return send(200, localfile.listing(target), 'text/html; charset=utf-8', 'no-store', { 'Content-Security-Policy': 'sandbox' })
  return { status: 200, headers: { ...localfile.headers(target), 'Cache-Control': 'no-cache' }, body: '', file: target }
}

// ── Statique ────────────────────────────────────────────────────────────────────
function staticFile(req: Req): Res {
  let pathname: string
  try {
    pathname = decodeURIComponent(req.path)
  } catch {
    return err(req, 404, 'introuvable')
  }
  if (pathname.endsWith('/')) pathname += 'index.html'
  const target = path.resolve(publicDir, '.' + pathname)
  if (target !== publicDir && !target.startsWith(publicDir + path.sep)) return err(req, 403, 'interdit') // traversée de répertoire
  let st: fs.Stats | null = null
  try {
    st = fs.statSync(target)
  } catch {
    st = null
  }
  if (st?.isFile()) {
    // les assets Vite portent un hash dans leur nom → immuables
    const cache = pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'
    return send(200, fs.readFileSync(target), MIME[path.extname(target)] || 'application/octet-stream', cache)
  }
  if (path.extname(target)) return err(req, 404, 'introuvable')
  const index = path.join(publicDir, 'index.html')
  if (!fs.existsSync(index)) return err(req, 404, 'build absent — lancer `npm run build`')
  return send(200, fs.readFileSync(index), MIME['.html'], 'no-cache')
}

// ── Démarrage des tâches de fond ────────────────────────────────────────────────
export function start(): void {
  ensureConfig()
  // Avant loadSections() : si la version a changé, les données sont sauvegardées telles quelles.
  updates.onStart()
  loadSections()
  backup.startAuto()
  updates.start()
  basecamp.start()
  const connected = accounts.allMods().filter((m) => m.token())
  console.log(connected.length ? `ℹ GitHub : ${connected.length} compte(s) connecté(s)` : 'ℹ GitHub non connecté — Réglages → Compte')
  accounts.kickoffAll() // premier fetch au démarrage : la page n'attend pas
  accounts.startLoop() // puis toutes les 3 min sans page (journal, cloche)
  perflog.start(accounts.githubStats)
  if (localgit.enabled()) {
    localgit.kickoff('démarrage')
    // surveille les .git : un `git fetch` tapé dans un terminal rafraîchit la page
    localgit.startWatch()
  } else console.log('ℹ onglet Local : aucun dossier lisible — Réglages → Dépôts locaux')
}
