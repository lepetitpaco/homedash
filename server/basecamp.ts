/**
 * Basecamp : mes tâches et mes notifications, en lecture seule.
 *
 * Toute lecture passe par `apiGet()`, qui ne sait faire que des GET ; les POST
 * partent vers Launchpad (`TOKEN_URL`) pour obtenir ou renouveler le jeton, et
 * UNE exception : `publishReport()` poste un commentaire sur une tâche, au clic
 * sur « publier » le rapport d'une issue liée. Rien ici ne coche une tâche ni
 * ne marque une notification lue.
 *
 * Connexion par OAuth 2 : une appli déclarée sur launchpad.37signals.com,
 * client id / secret collés dans Réglages, puis autorisation. Tout vit dans
 * `data/secrets.json` (clé `basecamp`), jamais dans config.json ni dans une
 * réponse d'API.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'

import * as events from './events.ts'
import { escape, parse } from './html.ts'
import * as perflog from './perflog.ts'
import * as store from './store.ts'

export const AUTHORIZE_URL = 'https://launchpad.37signals.com/authorization/new'
export const TOKEN_URL = 'https://launchpad.37signals.com/authorization/token'
export const IDENTITY_URL = 'https://launchpad.37signals.com/authorization.json'
/** Exigé par Basecamp (400 sans) : nom de l'appli et un lien pour joindre l'auteur. */
const USER_AGENT = 'homedash (https://github.com/lepetitpaco/homedash)'
export const SECRET_KEY = 'basecamp'
export const EVERY = 60 // s entre deux lectures ; 2 appels, presque toujours des 304
const REFRESH_AHEAD = 24 * 3600 // renouvelle le jeton un jour avant son expiration
const STATE_TTL = 15 * 60 // durée de validité d'un lien d'autorisation

export const ASSIGNMENTS = '/my/assignments.json'
export const READINGS = '/my/readings.json'
const COLUMN = (id: number) => `/card_tables/columns/${id}.json`
const BOARD = (id: number) => `/card_tables/${id}.json`

const COLUMN_ID = /\/card_tables\/(?:columns|lists)\/(\d+)/
const API_HOST = /^https:\/\/(\d+)\.basecampapi\.com\//
const BOARD_ID = /\/card_tables\/(\d+)(?:\.json)?$/

type Obj = Record<string, any>
type Tasks = { priorities: Obj[]; others: Obj[] }

const etags = new Map<string, [string, unknown]>()
const data: { tasks: Tasks | null; unreads: Obj[] | null; boards: Obj } = { tasks: null, unreads: null, boards: {} }
const state = { ts: 0, building: false, error: null as string | null, retryAt: 0 }
/** Sections déjà vues une fois : pas d'événement au premier passage. */
const seeded = new Set<string>()
/** state OAuth → heure d'émission. */
const states = new Map<string, number>()
/** colonne → tableau : une colonne ne change pas de tableau. */
const colBoard = new Map<number, number | null>()
let on = true

// ── Secrets ─────────────────────────────────────────────────────────────────────
function secret(): Obj {
  const v = store.readSecret<Obj>(SECRET_KEY)
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
}

function saveSecret(value: Obj | null): void {
  store.writeSecret(SECRET_KEY, value && Object.keys(value).length ? value : null)
}

export function configured(): boolean {
  const s = secret()
  return !!(s.client_id && s.client_secret)
}

export function connected(): boolean {
  const s = secret()
  return !!(s.access_token && s.href)
}

/** Basecamp coupé : plus de lecture ni de recherche. La connexion est gardée. */
export function setEnabled(value: boolean): void {
  on = !!value
  if (!on) seeded.clear() // rallumé plus tard : ce qui a bougé n'est pas une nouveauté
}

export function active(): boolean {
  return on && connected()
}

/** Jeton ou appli changés : caches et amorçage du journal valaient pour l'ancien. */
function reset(): void {
  etags.clear()
  colBoard.clear()
  data.tasks = null
  data.unreads = null
  data.boards = {}
  Object.assign(state, { ts: 0, error: null, retryAt: 0 })
  seeded.clear()
  searches.clear()
  files.clear()
  // réserve des stats : propre à ce compte, effacée avec la connexion
  stock = null
  gapMs = STATS_GAP_MS
  fs.rmSync(store.pathOf('bc_stats.json'), { force: true })
}

/** Tests : remet tout à zéro, y compris l'interrupteur. */
export function resetAll(): void {
  reset()
  states.clear()
  state.building = false
  on = true
}

// ── HTTP ────────────────────────────────────────────────────────────────────────
/** Point de passage unique vers le réseau (remplacé dans les tests). */
let open: (url: string, init: RequestInit) => Promise<Response> = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15000) })

export function setOpen(fn: typeof open): void {
  open = fn
}

/** POST vers Launchpad pour obtenir un jeton : ne touche pas Basecamp lui-même. */
async function postToken(params: Record<string, string>): Promise<any> {
  let res: Response
  try {
    res = await open(TOKEN_URL, {
      method: 'POST',
      body: new URLSearchParams(params).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': USER_AGENT },
    })
  } catch (e) {
    throw new Error(`Launchpad injoignable : ${(e as Error).message}`)
  }
  if (!res.ok)
    throw new Error(`Launchpad a refusé (${res.status}) : code expiré, ou client id / secret / adresse de retour différents de ceux de l'appli`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

type Got = [number, any, Headers | null]

/** Secondes à attendre d'après `Retry-After` (nombre ou date HTTP) ; 30 s si absent ou illisible. */
export function retryAfter(h: Headers | null | undefined): number {
  const v = (h?.get('Retry-After') || '').trim()
  if (/^\d+$/.test(v)) return Math.max(1, Number(v))
  const at = Date.parse(v)
  return Number.isNaN(at) ? 30 : Math.max(1, Math.ceil((at - Date.now()) / 1000))
}

/** GET authentifié, avec cache ETag (exigé par Basecamp). Un 304 rend le contenu en cache. */
async function get(url: string, token: string, cache = true): Promise<Got> {
  const cached = cache ? etags.get(url) : undefined
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': USER_AGENT }
  if (cached) headers['If-None-Match'] = cached[0]
  let res: Response
  try {
    res = await open(url, { method: 'GET', headers })
  } catch (e) {
    return [0, { message: String((e as Error).message || e) }, null]
  }
  if (res.status === 304 && cached) return [200, cached[1], res.headers]
  // Limite par IP, pour tout le compte : un refus, d'où qu'il vienne, fait attendre toutes les lectures.
  if (res.status === 429) state.retryAt = Math.max(state.retryAt, Date.now() / 1000 + retryAfter(res.headers))
  if (!res.ok) return [res.status, null, res.headers]
  const text = await res.text()
  const payload = text ? JSON.parse(text) : null
  const etag = res.headers.get('ETag')
  if (cache && etag) etags.set(url, [etag, payload])
  return [200, payload, res.headers]
}

/** Lecture dans le compte : que des GET, et seulement vers l'adresse du compte. */
function apiGet(path: string, token: string, href: string, cache = true): Promise<Got> {
  return get(href.replace(/\/+$/, '') + path, token, cache)
}

// ── OAuth ───────────────────────────────────────────────────────────────────────
/** Enregistre l'appli Launchpad. Un secret vide garde le précédent. */
export function setApp(clientId: unknown, clientSecret: unknown, redirectUri: unknown): void {
  const s = secret()
  const id = String(clientId ?? '').trim()
  const sec = String(clientSecret ?? '').trim() || s.client_secret || ''
  const uri = String(redirectUri ?? '').trim()
  if (!id || !sec) throw new RangeError('client id et client secret requis')
  if (!/^https?:\/\//.test(uri)) throw new RangeError('adresse de retour invalide (http://… ou https://…)')
  // L'adresse de retour ne sert qu'à la prochaine connexion : la changer ne déconnecte pas.
  const same = s.client_id === id && s.client_secret === sec
  let next: Obj = { client_id: id, client_secret: sec, redirect_uri: uri }
  if (same) next = { ...s, ...next }
  else reset() // autre appli : l'ancien jeton ne vaut plus rien
  saveSecret(next)
}

export function authorizeUrl(): string {
  const s = secret()
  if (!configured()) throw new RangeError('appli Basecamp non renseignée')
  const st = crypto.randomBytes(24).toString('base64url')
  const now = Date.now() / 1000
  for (const [k, t] of states) if (now - t > STATE_TTL) states.delete(k)
  states.set(st, now)
  return AUTHORIZE_URL + '?' + new URLSearchParams({ response_type: 'code', client_id: s.client_id, redirect_uri: s.redirect_uri, state: st }).toString()
}

/** Un retour d'autorisation doit porter un `state` émis ici. */
export function checkState(st: string | null | undefined): boolean {
  const t = states.get(st || '')
  states.delete(st || '')
  return t !== undefined && Date.now() / 1000 - t <= STATE_TTL
}

/** Le code seul, ou l'adresse de retour entière → [code, state ou null]. */
export function parseCode(text: unknown): [string, string | null] {
  const t = String(text ?? '').trim()
  if (t.includes('code=')) {
    let q: URLSearchParams
    try {
      q = new URL(t).searchParams
    } catch {
      q = new URLSearchParams(t.includes('?') ? t.split('?').slice(1).join('?') : t)
    }
    return [q.get('code') || '', q.get('state')]
  }
  return [t, null]
}

/** Code d'autorisation → jeton, puis compte Basecamp visé. */
export async function exchange(code: string): Promise<{ name: string; account: string }> {
  const s = secret()
  if (!configured()) throw new RangeError('appli Basecamp non renseignée')
  if (!code) throw new RangeError('code vide')
  const tok = await postToken({ grant_type: 'authorization_code', client_id: s.client_id, client_secret: s.client_secret, redirect_uri: s.redirect_uri, code })
  storeToken(s, tok)
  const who = await identify()
  reset()
  return who
}

function storeToken(s: Obj, tok: any): Obj {
  if (!tok || typeof tok !== 'object' || !tok.access_token) throw new Error("Launchpad n'a pas renvoyé de jeton")
  const next = {
    ...s,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token || s.refresh_token,
    expires_at: Date.now() / 1000 + Math.trunc(Number(tok.expires_in || 1209600)),
  }
  saveSecret(next)
  return next
}

/** Qui est connecté, et sur quel compte Basecamp (le premier `bc3`). */
async function identify(): Promise<{ name: string; account: string }> {
  const s = secret()
  const [status, body] = await get(IDENTITY_URL, s.access_token, false)
  if (status !== 200 || !body || typeof body !== 'object') throw new Error(`Launchpad répond ${status} à la lecture du compte`)
  const accs = (body.accounts || []).filter((a: Obj) => a.product === 'bc3')
  if (!accs.length) throw new Error("ce compte 37signals n'a accès à aucun Basecamp")
  const acc = accs[0]
  const ident = body.identity || {}
  const name = [ident.first_name, ident.last_name].filter(Boolean).join(' ')
  saveSecret({ ...s, href: acc.href, app_href: acc.app_href, account_name: acc.name, name, accounts: accs.length })
  return { name, account: acc.name }
}

async function refreshToken(s: Obj): Promise<Obj> {
  if (!s.refresh_token) throw new Error('connexion Basecamp expirée : reconnecte-toi dans Réglages → Basecamp')
  return storeToken(
    s,
    await postToken({ grant_type: 'refresh_token', refresh_token: s.refresh_token, client_id: s.client_id, client_secret: s.client_secret }),
  )
}

/** Oublie le jeton, garde l'appli : se reconnecter = un clic. */
export function disconnect(): void {
  const s = secret()
  const keep: Obj = {}
  for (const k of ['client_id', 'client_secret', 'redirect_uri']) if (k in s) keep[k] = s[k]
  saveSecret(keep)
  reset()
}

/** Oublie tout, appli comprise. */
export function forget(): void {
  saveSecret(null)
  reset()
}

/** État pour Réglages. Jamais de jeton ni de secret : seulement leur présence. */
export function status(): Obj {
  const s = secret()
  return {
    configured: configured(),
    connected: connected(),
    client_id: s.client_id || '',
    has_secret: !!s.client_secret,
    redirect_uri: s.redirect_uri || '',
    name: s.name || '',
    account: s.account_name || '',
    accounts: s.accounts || 0,
    app_href: s.app_href || '',
    expires_at: s.expires_at ?? null,
    error: state.error,
  }
}

// ── Lecture ─────────────────────────────────────────────────────────────────────
export const SITE = 'https://app.basecamp.com'

function site(): string {
  try {
    const u = new URL(secret().app_href || SITE)
    return `${u.protocol}//${u.host}`
  } catch {
    return SITE
  }
}

/** Lien à ouvrir dans le navigateur : une adresse de l'API est ramenée sur le site du compte. */
export function webUrl(url: string | null | undefined, s: string = SITE): string {
  let u = url || ''
  if (!API_HOST.test(u)) return u
  u = u.replace(API_HOST, s.replace(/\/+$/, '') + '/')
  return u.endsWith('.json') ? u.slice(0, -5) : u
}

function task(a: Obj, s = SITE): Obj {
  const parent = a.parent || {}
  const bucket = a.bucket || {}
  const url: string = a.app_url || ''
  const column = COLUMN_ID.exec(parent.app_url || '')
  const card = url.includes('/card_tables/cards/') || (a.type || '').toLowerCase().includes('card')
  return {
    kind: card ? 'card' : 'todo',
    column_id: card && column ? Number(column[1]) : null,
    id: a.id ?? null,
    title: (a.content || a.title || '').trim() || '(sans titre)',
    url: webUrl(a.app_url, s),
    type: a.type || '',
    project: bucket.name || '',
    project_id: bucket.id ?? null,
    project_url: bucket.app_url || '',
    list: parent.title || '',
    list_url: parent.app_url || '',
    due_on: a.due_on ?? null,
    starts_on: a.starts_on ?? null,
    comments: a.comments_count || 0,
    steps: (a.children || []).map((c: Obj) => ({
      title: (c.content || c.title || '').trim(),
      url: c.app_url || '',
      due_on: c.due_on ?? null,
      completed: !!c.completed,
    })),
  }
}

function ts(iso: string | null | undefined): number {
  const t = Date.parse(iso || '')
  return Number.isNaN(t) ? 0 : t / 1000
}

function notif(n: Obj, s = SITE): Obj {
  const creator = n.creator || {}
  return {
    id: n.id ?? null,
    title: (n.title || '').trim() || '(sans titre)',
    url: webUrl(n.app_url, s),
    project: n.bucket_name || '',
    section: n.section || '',
    type: n.type || '',
    creator: creator.name || '',
    excerpt: (n.content_excerpt || '').trim().slice(0, 280),
    unread_count: n.unread_count || 0,
    ts: ts(n.updated_at || n.created_at),
  }
}

export function normalizeTasks(body: any, s = SITE): Tasks {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  return { priorities: (b.priorities || []).map((a: Obj) => task(a, s)), others: (b.non_priorities || []).map((a: Obj) => task(a, s)) }
}

export function normalizeUnreads(body: any, s = SITE): Obj[] {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const out = (b.unreads || []).map((n: Obj) => notif(n, s))
  out.sort((x: Obj, y: Obj) => y.ts - x.ts)
  return out
}

/** Tableau d'une colonne, lu une fois puis gardé. */
async function boardOf(columnId: number, token: string, href: string): Promise<number | null> {
  if (colBoard.has(columnId)) return colBoard.get(columnId) as number | null
  const [st, body] = await apiGet(COLUMN(columnId), token, href)
  if (st !== 200 || !body || typeof body !== 'object') return null
  const parent = body.parent || {}
  const m = BOARD_ID.exec(parent.url || parent.app_url || '')
  colBoard.set(columnId, m ? Number(m[1]) : null)
  return colBoard.get(columnId) as number | null
}

/** Tableaux kanban des cartes assignées : nom, lien, colonnes dans l'ordre. Facultatif. */
export async function readBoards(tasks: Tasks, token: string, href: string): Promise<Obj> {
  const boards: Obj = {}
  const ids = new Set<number>()
  for (const t of [...tasks.priorities, ...tasks.others]) {
    if (t.column_id) {
      const b = await boardOf(t.column_id, token, href)
      if (b) {
        t.board_id = b
        ids.add(b)
      }
    }
  }
  for (const b of ids) {
    const [st, body] = await apiGet(BOARD(b), token, href)
    if (st !== 200 || !body || typeof body !== 'object') continue
    boards[String(b)] = {
      title: body.title || 'Tableau',
      url: body.app_url || '',
      columns: (body.lists || []).map((c: Obj) => ({ id: c.id ?? null, title: c.title || '', type: (c.type || '').split('::').pop(), color: c.color ?? null })),
    }
  }
  return boards
}

/** Événements du cycle. Une section jamais vue ne produit rien. */
export function diff(before: Obj, after: Obj, todo: string[]): events.Event[] {
  const out: events.Event[] = []
  if (todo.includes('unreads')) {
    const old = new Set((before.unreads || []).map((n: Obj) => `${n.id}\u0000${n.ts}`))
    for (const n of after.unreads || []) {
      if (old.has(`${n.id}\u0000${n.ts}`)) continue
      const who = n.creator ? `${n.creator} — ` : ''
      out.push(
        events.event('bc-notif', 'info', 'basecamp', `🏕 ${who}${n.title}`, {
          body: [n.project, n.excerpt.slice(0, 140)].filter(Boolean).join(' · '),
          repo: n.project,
          url: n.url,
          tag: `bc:notif:${n.id}`,
        }),
      )
    }
  }
  if (todo.includes('tasks')) {
    const ids = (t: Tasks | null | undefined) => new Set([...(t?.priorities || []), ...(t?.others || [])].map((x) => x.id))
    const old = ids(before.tasks)
    const now = after.tasks || {}
    for (const t of [...(now.priorities || []), ...(now.others || [])]) {
      if (old.has(t.id)) continue
      out.push(
        events.event('bc-task', 'info', 'basecamp', `📌 Nouvelle tâche — ${t.title}`, {
          body: [t.project, t.list].filter(Boolean).join(' · '),
          repo: t.project,
          url: t.url,
          tag: `bc:task:${t.id}`,
        }),
      )
    }
  }
  return out
}

/** Relit tâches et notifications. Un seul à la fois (`kickoff`). */
export async function rebuild(): Promise<void> {
  const started = performance.now()
  try {
    let s = secret()
    if (!(s.access_token && s.href)) return
    if ((s.expires_at || 0) - Date.now() / 1000 < REFRESH_AHEAD) s = await refreshToken(s)
    const results: Obj = {}
    for (const [name, p] of [
      ['tasks', ASSIGNMENTS],
      ['unreads', READINGS],
    ] as const) {
      let [st, body, headers] = await apiGet(p, s.access_token, s.href)
      if (st === 401) {
        // Jeton révoqué ou expiré plus tôt que prévu : un renouvellement, une fois.
        s = await refreshToken(s)
        ;[st, body, headers] = await apiGet(p, s.access_token, s.href)
      }
      if (st === 429) {
        const wait = retryAfter(headers)
        state.retryAt = Math.max(state.retryAt, Date.now() / 1000 + wait)
        throw new Error(`Basecamp limite les appels : nouvel essai dans ${wait} s`)
      }
      if (st !== 200) {
        const why = st === 0 ? body?.message : `HTTP ${st}`
        throw new Error(`lecture de ${p} impossible : ${why}`)
      }
      results[name] = name === 'tasks' ? normalizeTasks(body, site()) : normalizeUnreads(body, site())
    }
    let boards: Obj
    try {
      boards = await readBoards(results.tasks, s.access_token, s.href)
    } catch (e) {
      console.error(`✗ Basecamp, tableaux : ${e}`)
      boards = {}
    }
    const before = { ...data }
    data.tasks = results.tasks
    data.unreads = results.unreads
    data.boards = boards
    const known = Object.keys(results).filter((k) => seeded.has(k))
    for (const k of Object.keys(results)) seeded.add(k)
    state.ts = Date.now() / 1000
    state.error = null
    if (known.length) events.record(diff(before, data, known))
    perflog.timed('basecamp', (performance.now() - started) / 1000)
  } catch (e) {
    state.error = String((e as Error).message || e)
    console.error(`✗ Basecamp : ${(e as Error).message || e}`)
  } finally {
    state.building = false
  }
}

export function kickoff(): boolean {
  if (state.building || !active()) return false
  state.building = true
  void rebuild()
  return true
}

/** Tests : attend la fin de la lecture en cours. */
export async function settled(): Promise<void> {
  while (state.building) await new Promise((r) => setTimeout(r, 5))
}

export function payload(): Obj {
  const s = secret()
  let { tasks, unreads, boards } = data
  if (!on) [tasks, unreads, boards] = [null, null, {}]
  return {
    configured: on && configured(),
    enabled: active(),
    account: s.account_name || '',
    app_href: s.app_href || '',
    name: s.name || '',
    updated_at: state.ts,
    building: state.building,
    error: state.error,
    every: EVERY,
    tasks: tasks || { priorities: [], others: [] },
    unreads: unreads || [],
    boards: boards || {},
    loaded: tasks !== null,
    posted: posted(),
  }
}

// ── Recherche dans tout Basecamp ────────────────────────────────────────────────
const SEARCH_MAX = 20
const SEARCH_TTL = 60
const searches = new Map<string, [number, Obj[]]>()

function found(x: Obj): Obj {
  const bucket = x.bucket || {}
  const parent = x.parent || {}
  const text = (x.plain_text_content || x.plain_text_description || '').replace(/\s+/g, ' ').trim()
  const title = x.title || ''
  return {
    id: x.id ?? null,
    type: x.type || '',
    title,
    url: x.app_url || '',
    project: bucket.name || '',
    parent: parent.title || '',
    status: x.status || '',
    completed: !!x.completed,
    due_on: x.due_on ?? null,
    updated_at: x.updated_at || '',
    creator: x.creator?.name || '',
    // extrait, sauf s'il ne fait que répéter le titre
    excerpt: text === title ? '' : text.slice(0, 300),
  }
}

/** Tout Basecamp pour `q`, dans l'ordre de pertinence de Basecamp. [] si non connecté. */
export async function search(q: unknown): Promise<Obj[]> {
  const query = String(q ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
  const s = secret()
  if (query.length < 2 || !on || !(s.access_token && s.href)) return []
  const key = query.toLowerCase()
  const now = Date.now() / 1000
  const hit = searches.get(key)
  if (hit && now - hit[0] < SEARCH_TTL) return hit[1]
  const [st, body] = await apiGet('/search.json?' + new URLSearchParams({ q: query }).toString(), s.access_token, s.href, false)
  if (st !== 200 || !Array.isArray(body)) throw new Error(`recherche Basecamp impossible (HTTP ${st})`)
  // archivé ou à la corbeille : écarté ; terminé : après le reste
  let items = body.filter((x) => x && typeof x === 'object' && x.app_url && (x.status || 'active') === 'active').map(found)
  items = items.map((it, i) => [it, i] as const).sort((a, b) => Number(a[0].completed) - Number(b[0].completed) || a[1] - b[1]).map(([it]) => it)
  items = items.slice(0, SEARCH_MAX)
  for (const [k, [t]] of searches) if (now - t >= SEARCH_TTL) searches.delete(k)
  searches.set(key, [now, items])
  return items
}

// ── Contenu d'une tâche, à la demande ───────────────────────────────────────────
const TASK_URL = /\/buckets\/(\d+)\/(todos|card_tables\/cards)\/(\d+)/
const TASK_COMMENTS = 200
const TASK_PAGES = 10

const TEXT_BLOCK = new Set(['p', 'div', 'h1', 'h2', 'h3', 'blockquote', 'pre', 'ul', 'ol'])
const MENTION = 'application/vnd.basecamp.mention'

/**
 * Nom d'une mention d'après son `content` (HTML de `<bc-mention>`) : le titre de
 * l'avatar (« Julian Boissy, Coordinateur… »), sinon le prénom affiché. Une
 * description n'a que lui ; un commentaire a aussi une figure (alt = nom complet).
 */
function mentionName(html: string): string {
  let title = ''
  let text = ''
  parse(html, {
    start(tag, a) {
      if (tag === 'img' && !title) title = (a.title || a.alt || '').split(',')[0].trim()
    },
    end() {},
    data(t) {
      text += t
    },
  })
  return title || text.trim()
}

/** HTML de Basecamp (éditeur Trix) → [texte Markdown, pièces jointes [(sgid, lien, type)]]. */
export function htmlParts(raw: string | null | undefined): [string, [string, string, string][]] {
  const out: string[] = []
  const list: string[] = []
  const filesFound: [string, string, string][] = []
  let href: string | null = null
  // Mention (@quelqu'un) : son nom complet (alt de l'avatar), à la place de l'avatar et du prénom
  let mention: string | null = null
  parse(raw || '', {
    start(tag, a) {
      if (mention !== null) {
        if (tag === 'img' && !mention) mention = (a.alt || '').trim()
        return
      }
      if (tag === 'bc-attachment' && a['content-type'] === MENTION) {
        mention = mentionName(a.content || '')
        return
      }
      if (tag === 'br' || TEXT_BLOCK.has(tag)) out.push('\n')
      if (tag === 'ul' || tag === 'ol') list.push(tag)
      else if (tag === 'li') out.push('\n' + '  '.repeat(Math.max(0, list.length - 1)) + (list[list.length - 1] === 'ol' ? '1. ' : '- '))
      else if (tag === 'strong' || tag === 'b') out.push('**')
      else if (tag === 'em' || tag === 'i') out.push('*')
      else if (tag === 'a') {
        href = a.href ?? null
        out.push('[')
      } else if (tag === 'bc-attachment') {
        // Pièce jointe : lien vers Basecamp, ouvrable seulement connecté à Basecamp.
        const name = a.filename || a.caption || 'pièce jointe'
        const icon = (a['content-type'] || '').startsWith('image/') ? '🖼' : '📎'
        const link = a.href || a.url
        if (link && a.sgid) filesFound.push([a.sgid, link, a['content-type'] || ''])
        const label = `${icon} ${name.replace(/\[/g, '(').replace(/\]/g, ')')}`
        out.push(link ? `\n[${label}](<${link}>) (sur Basecamp)\n` : `\n${label} (sur Basecamp)\n`)
      }
    },
    end(tag) {
      if (mention !== null) {
        if (tag !== 'bc-attachment') return
        out.push(`**@${mention || 'quelqu’un'}**`)
        mention = null
        return
      }
      if ((tag === 'ul' || tag === 'ol') && list.length) list.pop()
      if (TEXT_BLOCK.has(tag)) out.push('\n')
      else if (tag === 'strong' || tag === 'b') out.push('**')
      else if (tag === 'em' || tag === 'i') out.push('*')
      else if (tag === 'a') {
        out.push(href ? `](${href})` : ']')
        href = null
      }
    },
    data(t) {
      if (mention !== null) {
        // pas d'avatar (alt vide) : le prénom affiché par Basecamp
        if (!mention && t.trim()) mention = t.trim()
        return
      }
      out.push(t)
    },
  })
  const text = out
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return [text, filesFound]
}

export function htmlText(raw: string | null | undefined): string {
  return htmlParts(raw)[0]
}

/**
 * Contenu d'une tâche pour en faire une issue : `text` = description et étapes
 * en Markdown ; `comments` = ses échanges, du plus ancien au plus récent.
 */
export async function taskText(url: unknown): Promise<Obj> {
  const m = TASK_URL.exec(String(url || ''))
  if (!m) throw new RangeError('adresse de tâche Basecamp attendue')
  const s = secret()
  if (!(s.access_token && s.href)) throw new Error('Basecamp non connecté')
  const [, bucket, kind, rid] = m
  const [st, body] = await apiGet(`/buckets/${bucket}/${kind}/${rid}.json`, s.access_token, s.href)
  if (st !== 200 || !body || typeof body !== 'object') throw new Error(`lecture de la tâche impossible (HTTP ${st})`)
  // to-do : `description` ; carte : `content`
  const [desc, filesFound] = htmlParts(kind === 'todos' ? body.description : body.content)
  const downloads = new Map<string, string>()
  for (const x of body.description_attachments || []) downloads.set(x.sgid, x.download_url)
  const parts = desc ? [desc] : []
  const steps = (body.steps || []).filter((x: Obj) => x.title)
  if (steps.length) parts.push('### Étapes\n\n' + steps.map((x: Obj) => `- [${x.completed ? 'x' : ' '}] ${x.title.trim()}`).join('\n'))
  const comments: Obj[] = []
  if (body.comments_count) {
    for (const c of await allComments(bucket, rid, s)) {
      const [text, more] = htmlParts(c.content)
      filesFound.push(...more)
      for (const x of c.content_attachments || []) downloads.set(x.sgid, x.download_url)
      // date complète : la page affiche l'heure de chaque message
      if (text) comments.push({ id: c.id ?? null, who: c.creator?.name || '?', date: c.created_at || '', text })
    }
  }
  // Images, pour la fiche : lien du texte → adresse à passer à `attachment()`
  const images: Record<string, string> = {}
  for (const [sgid, link, ctype] of filesFound) if (ctype.startsWith('image/') && downloads.get(sgid)) images[link] = downloads.get(sgid) as string
  // qui a créé la tâche, et quand
  const creator = { who: body.creator?.name || '', date: body.created_at || '' }
  return { text: parts.join('\n\n'), creator, comments: comments.slice(-TASK_COMMENTS), images }
}

// ── Image jointe, relayée pour la fiche d'une tâche ─────────────────────────────
const ATTACH_MAX = 15 * 1024 * 1024
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp'])
const files = new Map<string, [string, Buffer]>()

/** [type, octets] d'une image jointe, par son adresse de téléchargement (API). */
export async function attachment(url: unknown): Promise<[string, Buffer]> {
  const s = secret()
  if (!(s.access_token && s.href)) throw new Error('Basecamp non connecté')
  const u = String(url || '')
  if (!u.startsWith(s.href.replace(/\/+$/, '') + '/blobs/')) throw new RangeError('pièce jointe Basecamp attendue')
  const hit = files.get(u)
  if (hit) {
    files.delete(u)
    files.set(u, hit)
    return hit
  }
  // Basecamp redirige vers un lien de stockage signé : le jeton ne doit pas l'y suivre.
  let res: Response
  try {
    res = await open(u, { method: 'GET', redirect: 'manual', headers: { Accept: 'image/*', 'User-Agent': USER_AGENT, Authorization: `Bearer ${s.access_token}` } })
    for (let hops = 0; res.status >= 300 && res.status < 400 && res.headers.get('Location') && hops < 5; hops++) {
      res = await open(new URL(res.headers.get('Location') as string, u).toString(), { method: 'GET', redirect: 'manual', headers: { Accept: 'image/*', 'User-Agent': USER_AGENT } })
    }
  } catch (e) {
    throw new Error(`Basecamp injoignable : ${(e as Error).message}`)
  }
  if (!res.ok) throw new Error(`pièce jointe illisible (HTTP ${res.status})`)
  const ctype = (res.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase()
  const body = Buffer.from(await res.arrayBuffer())
  if (!IMAGE_TYPES.has(ctype) || body.length > ATTACH_MAX) throw new RangeError('pas une image affichable')
  files.set(u, [ctype, body])
  while (files.size > 40) files.delete(files.keys().next().value as string)
  return [ctype, body]
}

/** Tous les commentaires d'un enregistrement, page après page, sans suivre une adresse hors du compte. */
async function allComments(bucket: string, rid: string, s: Obj): Promise<Obj[]> {
  let [st, page, headers] = await apiGet(`/buckets/${bucket}/recordings/${rid}/comments.json`, s.access_token, s.href)
  const out: Obj[] = []
  for (let i = 0; i < TASK_PAGES; i++) {
    if (st !== 200 || !Array.isArray(page)) break
    out.push(...page)
    const nxt = /<([^>]+)>;\s*rel="next"/.exec(headers?.get('Link') || '')
    if (!nxt || !nxt[1].startsWith(s.href.replace(/\/+$/, '') + '/')) break
    ;[st, page, headers] = await get(nxt[1], s.access_token)
  }
  return out
}

// ── Rapport d'une issue → commentaire sur la tâche ──────────────────────────────
const COMMENTS = (bucket: string, rid: string) => `/buckets/${bucket}/recordings/${rid}/comments.json`

const RICH_KEEP = new Set(['strong', 'em', 'ul', 'ol', 'li', 'blockquote', 'pre', 'div', 'h1'])
const RICH_BLOCK = new Set(['ul', 'ol', 'blockquote', 'pre', 'div', 'h1'])
/** Ligne vide entre deux blocs, comme l'écrit l'éditeur de Basecamp. */
export const GAP = '<div><br></div>'
const RICH_MAP: Record<string, string | null> = { p: 'div', b: 'strong', i: 'em', h2: 'h1', h3: 'h1', h4: 'strong', h5: 'strong', h6: 'strong', code: null, tt: null }

/** HTML rendu par GitHub → ce que l'éditeur de Basecamp accepte ; le reste est réduit à son texte. */
export function richHtml(raw: string | null | undefined): string {
  const out: string[] = []
  const stack: (string | null)[] = []
  let seen = false
  parse(raw || '', {
    start(tag, attrs) {
      if (tag === 'br') {
        out.push('<br>')
        return
      }
      if (tag === 'a') {
        const href = attrs.href || ''
        const ok = href.startsWith('https://') || href.startsWith('http://')
        stack.push(ok ? 'a' : null)
        if (ok) out.push(`<a href="${escape(href)}">`)
        return
      }
      if (tag === 'script' || tag === 'style' || tag === 'template') {
        stack.push('-') // contenu jeté avec la balise
        return
      }
      const t = tag in RICH_MAP ? RICH_MAP[tag] : RICH_KEEP.has(tag) ? tag : null
      const top = !stack.some((x) => x && x !== '-')
      stack.push(t)
      if (t) {
        if (top && RICH_BLOCK.has(t) && seen) out.push(GAP)
        if (top && RICH_BLOCK.has(t)) seen = true
        out.push(`<${t}>`)
      }
    },
    end(tag) {
      if (tag === 'br' || !stack.length) return
      const t = stack.pop()
      if (t && t !== '-') out.push(`</${t}>`)
    },
    data(text) {
      if (stack.includes('-')) return
      if (stack.some(Boolean) || text.trim()) out.push(escape(text, false))
    },
  })
  return out.join('').trim()
}

// ── Statistiques : tâches créées et faites, par créateur ────────────────────────
/**
 * Une seule source : `GET /projects/recordings.json`, qui ne rend que les projets
 * dont le compte est membre (les autres sont invisibles, donc hors des stats).
 * Lu à l'ouverture du panneau, ou en arrière-plan si Réglages → Basecamp le demande
 * (`basecamp.statsBackground`, désactivé par défaut) ; jamais par le sondage des tâches.
 *
 * Règles de l'API (bc3-api, README) suivies ici :
 * - pages suivies par l'en-tête `Link`, jamais construites (15, 30, 50 puis 100 par page) ;
 * - 50 requêtes / 10 s par IP, et d'autres limites qui bougent : rythme plafonné
 *   (`STATS_GAP_MS`), et sur 429 on attend `Retry-After` ;
 * - 500/502/503/504 : nouvel essai, délai doublé à chaque fois ;
 * - ETag sur la première page d'une mise à jour : rien de neuf = 304.
 *
 * Coût : une réserve commune à toutes les périodes (`data/bc_stats.json`, simple
 * cache) ; pour l'étendre, lecture par date de création arrêtée à la fin de la
 * période ; ensuite seulement ce qui a changé (date de modification, que change le
 * fait de cocher une tâche ou de la passer en Done). Une seule lecture à la fois.
 */
const STATS_TYPES = ['Todo', 'Kanban::Card'] as const
/** Écart minimal entre deux requêtes des stats : 3 / s au plus, la moitié de la limite. */
const STATS_GAP_MS = 334
/** Plafond par type et par lecture, pour ne jamais tourner sans fin (100 tâches par page au-delà de la 3e). */
const STATS_PAGES = 400
/** Au-delà, une demande relit ce qui a changé. */
const STATS_TTL = 5 * 60
/** Mise à jour plus longue que ça : la réserve est relue de zéro. */
const STATS_DELTA_PAGES = 20
/** Marge sur la dernière lecture (horloges, écritures en cours). */
const STATS_OVERLAP = 120
/** « Trop d'appels » ou panne passagère : essais. Au-delà de `STATS_WAIT_MAX` s d'attente demandée, on abandonne. */
const STATS_RETRIES = 3
const STATS_WAIT_MAX = 60
/** Écart maximal entre deux requêtes des stats après des refus (ms). */
const STATS_GAP_MAX = 5000
/** Périodes demandables, en jours ; 400 = douze mois entiers (le premier peut commencer il y a plus de 365 jours). */
export const STATS_DAYS = [7, 30, 90, 365, 400] as const
/** Arrière-plan (Réglages → Basecamp) : une mise à jour toutes les 15 min, deux requêtes, souvent un 304. */
const STATS_EVERY_MIN = 15
/** Arrière-plan : la réserve se remplit par tranches de `FILL_PAGES` pages par type, une toutes les `FILL_EVERY` s. */
const FILL_PAGES = 4
const FILL_EVERY = 60
/** Tour complet de vérification (par tranches aussi) : rattrape une tâche manquée, retire les supprimées. */
const REFILL_DAYS = 7
/** Simple cache (pas dans les sauvegardes) ; effacé par `reset()`. */
const STATS_FILE = 'bc_stats.json'

/**
 * Remplissage en cours (arrière-plan) : jusqu'où aller (`target`), et par type la
 * page suivante à lire ('' = la première, null = terminé) et la plus vieille
 * création déjà lue. Gardé dans le fichier : reprend après un redémarrage.
 */
type Fill = { target: string; started: string; next: Record<string, string | null>; reached: Record<string, string>; seen?: string[] }
/** `filled` : fin du dernier tour complet (ms). */
type Stock = { account: string; since: string; synced: string; ts: number; partial: boolean; items: Record<string, Obj>; fill?: Fill; filled?: number }
let stock: Stock | null = null
let syncing: Promise<void> | null = null
let nextSlot = 0
let background_ = false
let statsTimer: ReturnType<typeof setInterval> | null = null
/** Dernière mise à jour faite en arrière-plan (ms). */
let deltaAt = 0
let statsError: string | null = null

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms))

/** Écart courant entre deux requêtes des stats : doublé à chaque 429, redescend à chaque succès. */
let gapMs = STATS_GAP_MS

/**
 * Attend son tour : l'attente commune demandée par Basecamp (429, toutes lectures
 * confondues), puis l'écart courant. Attente trop longue : on abandonne, la
 * lecture reprendra plus tard (tour suivant ou nouvelle demande).
 */
async function pace(): Promise<void> {
  const blocked = state.retryAt * 1000 - Date.now()
  if (blocked > STATS_WAIT_MAX * 1000) throw new Error(`Basecamp demande d’attendre ${Math.ceil(blocked / 1000)} s : réessaie plus tard`)
  if (blocked > 0) await sleep(blocked)
  const now = Date.now()
  const at = Math.max(now, nextSlot)
  nextSlot = at + gapMs
  if (at > now) await sleep(at - now)
}

/** Limites ajustées en continu par Basecamp : on ralentit au refus, on réaccélère doucement. */
function adapt(refused: boolean): void {
  gapMs = refused ? Math.min(STATS_GAP_MAX, gapMs * 2) : Math.max(STATS_GAP_MS, Math.round(gapMs * 0.9))
}

/** Une tâche pour les stats : qui l'a créée, où, quand, et si elle est faite. */
export function statItem(r: Obj, s = SITE): Obj | null {
  if (!r || typeof r !== 'object' || !r.created_at) return null
  const card = r.type === 'Kanban::Card'
  // carte : cochée, ou dans une colonne « Done » ; to-do : cochée
  const done = !!r.completed || (card && /Done/.test(r.parent?.type || ''))
  return {
    id: r.id ?? null,
    kind: card ? 'card' : 'todo',
    title: (r.title || r.content || '').trim() || '(sans titre)',
    url: webUrl(r.app_url, s),
    who: r.creator?.name || '?',
    who_id: r.creator?.id ?? null,
    project: r.bucket?.name || '',
    project_id: r.bucket?.id ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at || r.created_at,
    done,
  }
}

const keyOf = (it: Obj) => `${it.kind}:${it.id}`

function loadStock(account: string): Stock | null {
  if (stock?.account === account) return stock
  const v = store.read<Stock | null>(STATS_FILE, null)
  stock = v && v.account === account && v.items && typeof v.items === 'object' ? v : null
  return stock
}

/**
 * Lit un type page après page, en suivant `Link`, jusqu'à ce que `stop(r)` dise
 * qu'on est allé assez loin. `etag` : première page avec le cache ETag (mise à
 * jour). `start` : reprendre à cette page (adresse donnée par Basecamp). Rend
 * [enregistrements, plafond atteint, page suivante si plafond].
 */
async function readType(
  s: Obj,
  type: string,
  sort: 'created_at' | 'updated_at',
  stop: (r: Obj) => boolean,
  max: number,
  etag = false,
  start = '',
): Promise<[Obj[], boolean, string | null]> {
  const base = s.href.replace(/\/+$/, '') + '/'
  /** Une page, au rythme permis ; 429 : attend `Retry-After` ; 5xx : délai doublé. */
  const fetchPage = async (url: string, cache: boolean): Promise<Got> => {
    for (let i = 0; ; i++) {
      await pace()
      const got = await get(url, s.access_token, cache)
      const st = got[0]
      adapt(st === 429)
      const retry = st === 429 || st === 500 || st === 502 || st === 503 || st === 504
      if (!retry || i >= STATS_RETRIES) {
        if (st === 429) throw new Error('Basecamp limite les appels : réessaie dans un moment')
        if (st !== 200) throw new Error(`lecture des tâches impossible (HTTP ${st})`)
        return got
      }
      // 429 : l'attente demandée est déjà notée pour tous (get), `pace()` la respecte en entier
      if (st !== 429) await sleep(2 ** i * 1000)
    }
  }
  const out: Obj[] = []
  let url: string | undefined = start && start.startsWith(base) ? start : `${base}projects/recordings.json?${new URLSearchParams({ type, sort, direction: 'desc' })}`
  for (let n = 1; url; n++) {
    if (n > max) return [out, true, url]
    const [, page, headers]: Got = await fetchPage(url, etag && n === 1)
    if (!Array.isArray(page) || !page.length) break
    for (const r of page) {
      if (stop(r)) return [out, false, null]
      out.push(r)
    }
    url = /<([^>]+)>;\s*rel="next"/.exec(headers?.get('Link') || '')?.[1]
    // jamais d'adresse hors du compte
    if (url && !url.startsWith(base)) break
  }
  return [out, false, null]
}

/** Relit de zéro jusqu'à `since` (création), les deux types en même temps. */
async function fullRead(s: Obj, account: string, since: string): Promise<Stock> {
  const started = new Date().toISOString()
  const got = await Promise.all(STATS_TYPES.map((t) => readType(s, t, 'created_at', (r) => (r?.created_at || '') < since, STATS_PAGES)))
  const items: Record<string, Obj> = {}
  for (const [list] of got) for (const r of list) {
    const it = statItem(r, SITE)
    if (it) items[keyOf(it)] = it
  }
  return { account, since, synced: started, ts: Date.now() / 1000, partial: got.some(([, cut]) => cut), items }
}

/** Ce qui a changé depuis la dernière lecture ; null si trop pour une mise à jour. */
async function delta(s: Obj, cur: Stock): Promise<Stock | null> {
  const started = new Date().toISOString()
  const after = new Date(Date.parse(cur.synced) - STATS_OVERLAP * 1000).toISOString()
  const got = await Promise.all(STATS_TYPES.map((t) => readType(s, t, 'updated_at', (r) => (r?.updated_at || '') < after, STATS_DELTA_PAGES, true)))
  if (got.some(([, cut]) => cut)) return null
  const items = { ...cur.items }
  for (const [list] of got) for (const r of list) {
    const it = statItem(r, SITE)
    // créée avant la réserve (ou avant sa cible, pendant un remplissage) : hors des stats
    if (it && it.created_at >= (cur.fill?.target ?? cur.since)) items[keyOf(it)] = it
  }
  return { ...cur, synced: started, ts: Date.now() / 1000, items }
}

function save(next: Stock): void {
  stock = next
  try {
    store.write(STATS_FILE, next)
  } catch {
    /* simple cache : gardé en mémoire */
  }
}

/** Commence un remplissage (arrière-plan) jusqu'à `target`, en gardant ce qui est déjà lu. */
function startFill(account: string, cur: Stock | null, target: string): Stock {
  const now = new Date().toISOString()
  const fill: Fill = { target, started: now, next: Object.fromEntries(STATS_TYPES.map((t) => [t, ''])), reached: {}, seen: [] }
  return cur ? { ...cur, fill } : { account, since: now, synced: now, ts: Date.now() / 1000, partial: false, items: {}, fill }
}

/** Une tranche du remplissage : quelques pages par type, à partir de là où on s'était arrêté. */
async function fillStep(s: Obj, cur: Stock): Promise<Stock> {
  const fill = cur.fill as Fill
  const next = { ...fill.next }
  const reached = { ...fill.reached }
  let items = { ...cur.items }
  const seen = new Set(fill.seen ?? [])
  await Promise.all(
    STATS_TYPES.map(async (t) => {
      if (next[t] === null) return
      const [list, cut, after] = await readType(s, t, 'created_at', (r) => (r?.created_at || '') < fill.target, FILL_PAGES, false, next[t] || '')
      for (const r of list) {
        const it = statItem(r, SITE)
        if (!it) continue
        items[keyOf(it)] = it
        seen.add(keyOf(it))
      }
      const oldest = list.length ? list[list.length - 1].created_at : ''
      if (cut && after) {
        next[t] = after
        if (oldest) reached[t] = oldest
      } else {
        next[t] = null
        reached[t] = fill.target
      }
    }),
  )
  const done = STATS_TYPES.every((t) => next[t] === null)
  // couvert jusqu'où le type le plus en retard est allé
  const since = done ? fill.target : STATS_TYPES.map((t) => reached[t] || new Date().toISOString()).sort().pop() as string
  if (done) {
    // tour terminé : ce qui n'a pas été revu (supprimé, archivé) quitte la réserve ; sauf les créées pendant le tour
    const started = fill.started || cur.synced
    items = Object.fromEntries(Object.entries(items).filter(([k, it]) => seen.has(k) || it.created_at >= started))
  }
  const out: Stock = { ...cur, since: since < cur.since || !Object.keys(cur.items).length ? since : cur.since, ts: Date.now() / 1000, items }
  if (done) {
    delete out.fill
    out.filled = Date.now()
  } else out.fill = { ...fill, next, reached, seen: [...seen] }
  return out
}

/**
 * À la demande (panneau). Sans arrière-plan : lecture complète si la réserve ne
 * couvre pas la période. Avec : jamais de grosse lecture ici, le remplissage par
 * tranches s'en charge ; on n'ajoute que ce qui a changé.
 */
async function sync(s: Obj, since: string, fresh: boolean): Promise<void> {
  const account = String(s.href)
  let cur = loadStock(account)
  if (background_) {
    if (!cur || (cur.since > since && !cur.fill)) {
      // première tranche tout de suite : les jours récents sont là d'emblée
      cur = startFill(account, cur, sinceOf(Math.max(...STATS_DAYS)))
      save(await fillStep(s, cur))
      return
    }
    if (fresh || Date.now() / 1000 - cur.ts >= STATS_TTL) {
      const next = await delta(s, cur)
      if (next) save(next)
    }
    return
  }
  let next: Stock | null = null
  if (!cur || cur.since > since) next = await fullRead(s, account, cur && cur.since < since ? cur.since : since)
  else if (fresh || Date.now() / 1000 - cur.ts >= STATS_TTL) next = (await delta(s, cur)) ?? (await fullRead(s, account, cur.since))
  if (next) save(next)
}

/** Arrière-plan, une fois par `FILL_EVERY` : une tranche du remplissage, sinon la mise à jour à son rythme. */
async function background(s: Obj): Promise<void> {
  const account = String(s.href)
  let cur = loadStock(account)
  const target = sinceOf(Math.max(...STATS_DAYS))
  // réserve absente, ou trop courte (plus d'un jour de retard sur un an) : on remplit
  const stale = !cur?.filled || Date.now() - cur.filled > REFILL_DAYS * 86400_000
  if (!cur || (!cur.fill && (stale || Date.parse(cur.since) - Date.parse(target) > 86400_000))) cur = startFill(account, cur, target)
  if (cur.fill) return save(await fillStep(s, cur))
  if (Date.now() - deltaAt < STATS_EVERY_MIN * 60_000) return
  deltaAt = Date.now()
  const next = (await delta(s, cur)) ?? startFill(account, cur, target)
  save(next)
}

/** Une lecture à la fois : la suivante part de ce que la précédente a laissé. */
async function exclusive(job: () => Promise<void>): Promise<void> {
  while (syncing) await syncing
  syncing = job()
    .then(() => {
      statsError = null
    })
    .catch((e) => {
      statsError = (e as Error).message
      throw e
    })
    .finally(() => {
      syncing = null
    })
  await syncing
}

const sinceOf = (days: number) => new Date(Date.now() - days * 86400_000).toISOString()

/** Tâches créées dans les `days` derniers jours, sur tous les projets visibles. `fresh` : relit ce qui a changé. */
export async function stats(days: unknown, fresh = false): Promise<Obj> {
  const d = Number(days)
  if (!(STATS_DAYS as readonly number[]).includes(d)) throw new RangeError(`période attendue : ${STATS_DAYS.join(', ')} jours`)
  const s = secret()
  if (!(s.access_token && s.href)) throw new Error('Basecamp non connecté')
  const since = sinceOf(d)
  await exclusive(() => sync(s, since, fresh))
  const cur = stock as Stock
  const items = Object.values(cur.items)
    .filter((it) => it.created_at >= since)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  // remplissage en cours : la réserve ne remonte que jusqu'à `filling`
  return { days: d, since, ts: cur.ts, partial: cur.partial, auto: background_, filling: cur.fill ? cur.since : null, items }
}

/** Arrière-plan : une tranche ou une mise à jour. Erreur : gardée, sans bruit ; on réessaie au tour suivant. */
export async function prepareStats(): Promise<void> {
  const s = secret()
  if (!on || !background_ || !(s.access_token && s.href) || Date.now() / 1000 < state.retryAt) return
  try {
    await exclusive(() => background(s))
  } catch (e) {
    console.error(`✗ Stats Basecamp : ${(e as Error).message}`)
  }
}

/** Réglages → Basecamp : stats préparées en arrière-plan, ou non (le défaut). */
export function setStatsBackground(value: unknown): void {
  const v = value === true
  if (v === background_) return
  background_ = v
  deltaAt = 0
  if (statsTimer) clearInterval(statsTimer)
  statsTimer = null
  if (!v) return
  // un peu après le démarrage : la lecture des tâches passe d'abord ; puis un tour par minute
  setTimeout(() => void prepareStats(), 30_000).unref()
  statsTimer = setInterval(() => void prepareStats(), FILL_EVERY * 1000)
  statsTimer.unref()
}

/** Dernière erreur de la préparation, pour le panneau. */
export function statsState(): Obj {
  return { auto: background_, ts: stock?.ts ?? null, filling: stock?.fill ? stock.since : null, error: statsError }
}

/** Issues traitées : id du rapport publié → {url, ts} ; issue écartée → {ts, dismissed}. */
export function posted(): Obj {
  let v: unknown
  try {
    v = store.read(store.BC_POSTED, {})
  } catch {
    v = {}
  }
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {}
}

async function postComment(taskUrl: unknown, content: string): Promise<string> {
  const m = TASK_URL.exec(String(taskUrl || ''))
  if (!m) throw new RangeError('adresse de tâche Basecamp attendue')
  let s = secret()
  if (!(s.access_token && s.href)) throw new Error("Basecamp n'est pas connecté.")
  if ((s.expires_at || 0) - Date.now() / 1000 < REFRESH_AHEAD) s = await refreshToken(s)
  const [, bucket, , rid] = m
  for (const attempt of [1, 2]) {
    let res: Response
    try {
      res = await open(s.href.replace(/\/+$/, '') + COMMENTS(bucket, rid), {
        method: 'POST',
        body: JSON.stringify({ content }),
        headers: { Authorization: `Bearer ${s.access_token}`, 'User-Agent': USER_AGENT, 'Content-Type': 'application/json', Accept: 'application/json' },
      })
    } catch (e) {
      throw new Error(`Basecamp injoignable : ${(e as Error).message}`)
    }
    if (res.ok) {
      const text = await res.text()
      const body = text ? JSON.parse(text) : null
      return body?.app_url || String(taskUrl)
    }
    if (res.status === 401 && attempt === 1) {
      s = await refreshToken(s)
      continue
    }
    if (res.status === 403 || res.status === 404) throw new Error("Basecamp refuse le commentaire : la tâche n'est plus accessible avec ce compte.")
    throw new Error(`Basecamp n'a pas pris le commentaire (HTTP ${res.status}).`)
  }
  throw new Error("Basecamp n'a pas pris le commentaire.")
}

/** Écarte une issue liée sans publier son rapport (ou la rétablit). Rien n'est envoyé. */
export function dismiss(issue: Obj, undo = false): Obj {
  const key = `${issue.repo}#${issue.number}`
  const done = posted()
  if (undo) delete done[key]
  else done[key] = { ts: Date.now() / 1000, dismissed: true }
  store.write(store.BC_POSTED, done)
  return done
}

let posting: Promise<unknown> = Promise.resolve()

/** Publie le rapport d'une issue liée en commentaire de sa tâche, une seule fois par rapport. */
export function publishReport(issue: Obj): Promise<Obj> {
  // Une publication à la fois : deux clics rapprochés ne postent pas deux fois.
  const run = posting.then(async () => {
    const rep = issue.report || {}
    if (!rep.id) throw new RangeError('pas de rapport pour cette issue')
    const key = String(rep.id)
    const done = posted()
    if (key in done) return done[key]
    const link = `<a href="${escape(issue.url || '')}">${escape(issue.repo || '', false)} #${issue.number}</a>`
    const content = (richHtml(rep.html) || `<div>${escape(rep.body || '', false)}</div>`) + GAP + `<div><em>🤖 Rapport de l'issue GitHub ${link}</em></div>`
    const url = await postComment(issue.bc_url, content)
    const again = posted()
    again[key] = { url, ts: Date.now() / 1000 }
    store.write(store.BC_POSTED, again)
    return again[key]
  })
  posting = run.catch(() => undefined)
  return run
}

/** Le serveur lit Basecamp en continu, page ouverte ou non : c'est ce qui nourrit la cloche. */
export function start(): void {
  const tick = () => {
    try {
      if (Date.now() / 1000 >= state.retryAt) kickoff()
    } catch (e) {
      console.error(`✗ Basecamp : ${e}`)
    }
  }
  tick()
  setInterval(tick, EVERY * 1000).unref()
}
