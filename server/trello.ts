/**
 * Trello : cartes visibles des tableaux et notifications, en lecture seule.
 *
 * Les GET passent par `call()`. Les seules écritures : rien chez Trello à la
 * connexion (le jeton est collé, pas échangé), et `publishReport()`, qui poste
 * un commentaire sur une carte au clic. Rien ici ne coche une carte, ne
 * l'archive, ni ne marque une notification lue. Le scope demandé est
 * `read,write`, jamais `account` (celui qui permet de marquer lu).
 *
 * Clé d'API et jeton vivent dans `data/secrets.json` (clé `trello`), jamais dans
 * config.json ni dans une réponse d'API. Les appels portent l'en-tête
 * Authorization, jamais `?token=`.
 */

import * as events from './events.ts'
import * as perflog from './perflog.ts'
import * as store from './store.ts'

export const API = 'https://api.trello.com/1'
export const AUTHORIZE_URL = 'https://trello.com/1/authorize'
export const SECRET_KEY = 'trello'
export const EVERY = 60
const SCOPE = 'read,write'
const COMMENT_MAX = 16384
const SEARCH_TTL = 60
const SEARCH_MAX = 20
const SAFE_IMAGES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
const IMAGE_HOSTS = new Set(['trello.com', 'www.trello.com', 'api.trello.com'])
const ATTACH_MAX = 15 * 1024 * 1024

export const MEMBER = API + '/members/me?fields=fullName,username'
/** Cartes où le membre est inscrit : « À traiter » et la cloche. L'onglet montre toutes les cartes visibles. */
export const CARDS = API + '/members/me/cards?filter=open&fields=name,url,shortUrl,shortLink,due,dueComplete,closed,pos,idBoard,idList,badges'
export const BOARDS = API + '/members/me/boards?filter=open&fields=id,name,shortUrl,url'
export const NOTIFS = API + '/members/me/notifications?read_filter=unread&limit=50&memberCreator=true&display=true&memberCreator_fields=fullName'
const BOARD_ID = /^[A-Za-z0-9]{1,32}$/
const BG_HOST = 'trello-backgrounds.s3.amazonaws.com'
const BG_BAD = /[\s"'()\\]/
const CARD_URL = /^https:\/\/trello\.com\/c\/([A-Za-z0-9]+)(?:\/|$)/
const SHORT = /^[A-Za-z0-9]+$/

type Obj = Record<string, any>

const data: { cards: Obj[] | null; unreads: Obj[] | null; boards: Obj[] | null } = { cards: null, unreads: null, boards: null }
const state = { ts: 0, building: false, error: null as string | null, retryAt: 0 }
const seeded = new Set<string>()
const searches = new Map<string, [number, Obj[]]>()
/** Adresse d'image lue sur une carte → type MIME annoncé. */
const allowed = new Map<string, string>()
let on = true

function secret(): Obj {
  const v = store.readSecret<Obj>(SECRET_KEY)
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
}

function saveSecret(value: Obj | null): void {
  store.writeSecret(SECRET_KEY, value && Object.keys(value).length ? value : null)
}

export function configured(): boolean {
  return !!secret().api_key
}

export function connected(): boolean {
  const s = secret()
  return !!(s.api_key && s.token)
}

/** Trello coupé : plus de lecture ni de recherche. La connexion est gardée. */
export function setEnabled(value: boolean): void {
  on = !!value
  if (!on) seeded.clear()
}

export function active(): boolean {
  return on && connected()
}

function reset(): void {
  data.cards = null
  data.unreads = null
  data.boards = null
  Object.assign(state, { ts: 0, error: null, retryAt: 0 })
  seeded.clear()
  searches.clear()
  allowed.clear()
}

/** Tests : tout remis à zéro, interrupteur compris. */
export function resetAll(): void {
  reset()
  state.building = false
  on = true
}

/** Une adresse https sur un hôte Trello : le jeton ne la quitte jamais. */
export function trelloHttps(url: string | null | undefined): boolean {
  try {
    const u = new URL(url || '')
    return u.protocol === 'https:' && IMAGE_HOSTS.has(u.hostname.toLowerCase())
  } catch {
    return false
  }
}

/** Point de passage unique vers le réseau (remplacé dans les tests). */
let open: (url: string, init: RequestInit) => Promise<Response> = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15000) })

export function setOpen(fn: typeof open): void {
  open = fn
}

function oauth(key: string, token: string): string {
  const esc = (v: string) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `OAuth oauth_consumer_key="${esc(key)}", oauth_token="${esc(token)}"`
}

type Got = [number, any, Record<string, string>]

/** Appel Trello. Les adresses construites ici ne portent ni clé ni jeton ; une redirection ne quitte pas Trello. */
async function call(method: string, url: string, opts: { body?: string; key?: string; token?: string; raw?: boolean } = {}): Promise<Got> {
  const s = secret()
  const key = opts.key ?? s.api_key ?? ''
  const token = opts.token ?? s.token ?? ''
  if (!opts.raw && (url.includes('token=') || url.includes('key='))) throw new Error("jeton refusé dans l'adresse")
  const headers: Record<string, string> = { Accept: 'application/json', Authorization: oauth(key, token) }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/x-www-form-urlencoded'
  let res: Response
  try {
    res = await open(url, { method, headers, body: opts.body, redirect: 'manual' })
    for (let hops = 0; res.status >= 300 && res.status < 400 && res.headers.get('Location'); hops++) {
      const next = new URL(res.headers.get('Location') as string, url).toString()
      if (!trelloHttps(next) || hops >= 5) return [res.status, {}, {}] // redirection refusée
      res = await open(next, { method: 'GET', headers, redirect: 'manual' })
    }
  } catch (e) {
    return [0, { message: String((e as Error).message || e) }, {}]
  }
  const hdrs: Record<string, string> = {}
  res.headers.forEach((v, k) => (hdrs[k.toLowerCase()] = v))
  if (opts.raw) return [res.status, await capped(res), hdrs]
  const text = await res.text()
  let body: any = {}
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = {}
  }
  if (!res.ok && (body === null || typeof body !== 'object')) body = {}
  return [res.status, body, hdrs]
}

/** Corps d'une image, lu par morceaux : au-delà de `ATTACH_MAX`, null sans lire la suite. */
async function capped(res: Response): Promise<Buffer | null> {
  if (Number(res.headers.get('content-length') || 0) > ATTACH_MAX) {
    await res.body?.cancel().catch(() => undefined)
    return null
  }
  if (!res.body) return Buffer.alloc(0)
  const parts: Buffer[] = []
  let size = 0
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > ATTACH_MAX) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    parts.push(Buffer.from(value))
  }
  return Buffer.concat(parts)
}

/** État pour Réglages. Jamais de clé ni de jeton : seulement leur présence. */
export function status(): Obj {
  const s = secret()
  return { configured: configured(), connected: connected(), has_key: !!s.api_key, name: s.name || '', username: s.username || '', error: state.error }
}

/** Enregistre la clé. Vide = garder l'actuelle. Une clé différente oublie le jeton. */
export function setKey(apiKey: unknown): void {
  const s = secret()
  const key = String(apiKey ?? '').trim()
  if (!key) {
    if (s.api_key) return
    throw new RangeError("Colle la clé d'API.")
  }
  const same = key === s.api_key
  const next: Obj = { api_key: key }
  if (same && s.token) Object.assign(next, { token: s.token, name: s.name || '', username: s.username || '' })
  saveSecret(next)
  if (!same) reset()
}

export function authorizeUrl(): string {
  const s = secret()
  if (!s.api_key) throw new RangeError("Enregistre d'abord la clé d'API.")
  return `${AUTHORIZE_URL}?${new URLSearchParams({ expiration: 'never', scope: SCOPE, response_type: 'token', name: 'homedash', key: s.api_key })}`
}

/** Vérifie le jeton collé (`GET /members/me`) puis le garde. 401 : rien n'est écrit. */
export async function connect(token: unknown): Promise<void> {
  const tok = String(token ?? '').trim()
  if (!tok) throw new RangeError('Colle le jeton.')
  const s = secret()
  if (!s.api_key) throw new RangeError("Enregistre d'abord la clé d'API.")
  const [code, body] = await call('GET', MEMBER, { token: tok })
  if (code === 401) throw new RangeError('Trello refuse ce jeton. Autorise à nouveau.')
  if (code !== 200 || !body || typeof body !== 'object' || !body.username) throw new Error("Trello n'a pas répondu. Réessaie.")
  saveSecret({ api_key: s.api_key, token: tok, name: body.fullName || body.username || '', username: body.username || '' })
  reset()
}

export function disconnect(): void {
  const s = secret()
  saveSecret(s.api_key ? { api_key: s.api_key } : null)
  reset()
}

export function forget(): void {
  saveSecret(null)
  reset()
}

/** Un tableau : ses listes ouvertes et toutes les cartes qu'on y voit. */
function boardUrl(bid: string): string {
  return (
    `${API}/boards/${encodeURIComponent(bid)}?fields=name,shortUrl,url,prefs` +
    '&lists=open&list_fields=name,pos' +
    '&cards=visible&card_fields=name,url,shortUrl,shortLink,due,dueComplete,closed,pos,idBoard,idList,badges'
  )
}

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const num = (v: unknown) => (typeof v === 'number' ? v : 0)

/** id de tableau et de liste → objet Trello (nom, url, position). */
function catalog(boards: Obj[] | null | undefined): [Map<string, Obj>, Map<string, Obj>] {
  const byBoard = new Map<string, Obj>()
  const byList = new Map<string, Obj>()
  for (const b of boards || []) {
    if (!isObj(b) || !b.id) continue
    byBoard.set(String(b.id), b)
    for (const l of b.lists || []) if (isObj(l) && l.id) byList.set(String(l.id), l)
  }
  return [byBoard, byList]
}

/** Le nom collé sur la carte gagne ; sinon celui du catalogue des tableaux. */
function named(nested: unknown, looked: Obj | undefined): Obj {
  const base: Obj = { ...(looked || {}) }
  if (isObj(nested)) for (const [k, v] of Object.entries(nested)) if (v !== null && v !== undefined && v !== '') base[k] = v
  return base
}

function card(c: unknown, byBoard?: Map<string, Obj>, byList?: Map<string, Obj>, mineIds?: Set<string> | null): Obj | null {
  if (!isObj(c) || c.closed) return null
  const board = named(c.board, byBoard?.get(String(c.idBoard || '')))
  const lst = named(c.list, byList?.get(String(c.idList || '')))
  const badges = isObj(c.badges) ? c.badges : {}
  const short = c.shortLink || ''
  const url = c.shortUrl || (short ? `https://trello.com/c/${short}` : '')
  if (!url) return null
  const cid = String(c.id || short)
  // Sans ensemble d'ids, la carte vient d'une lecture « les miennes ».
  const mine = mineIds == null ? true : mineIds.has(cid) || mineIds.has(short)
  return {
    id: cid,
    short_link: short,
    title: (c.name || '').trim() || '(sans titre)',
    url,
    board_id: String(c.idBoard || board.id || ''),
    board: board.name || 'Sans tableau',
    board_url: board.shortUrl || board.url || '',
    list_id: String(c.idList || lst.id || ''),
    list: lst.name || 'Sans liste',
    list_pos: num(lst.pos),
    pos: num(c.pos),
    due: c.due || null,
    due_complete: !!c.dueComplete,
    comments: badges.comments || 0,
    checks: badges.checkItems || 0,
    checks_done: badges.checkItemsChecked || 0,
    mine,
  }
}

export function normalizeCards(body: unknown, boards?: Obj[] | null, mineIds?: Set<string> | null): Obj[] {
  if (!Array.isArray(body)) return []
  const [byBoard, byList] = catalog(boards)
  return body.map((x) => card(x, byBoard, byList, mineIds)).filter(Boolean) as Obj[]
}

function mineIdsOf(body: unknown[]): Set<string> {
  const ids = new Set<string>()
  for (const c of body || []) {
    if (!isObj(c)) continue
    if (c.id) ids.add(String(c.id))
    if (c.shortLink) ids.add(String(c.shortLink))
  }
  return ids
}

/** Image de fond du tableau, seulement sur l'hôte des fonds Trello. */
export function background(detail: Obj): [string, string] {
  const prefs = isObj(detail.prefs) ? detail.prefs : {}
  const bright = prefs.backgroundBrightness === 'dark' || prefs.backgroundBrightness === 'light' ? prefs.backgroundBrightness : ''
  const url = prefs.backgroundImage || ''
  if (typeof url !== 'string' || BG_BAD.test(url)) return ['', bright]
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return ['', bright]
  }
  if (u.protocol !== 'https:' || u.hostname.toLowerCase() !== BG_HOST || u.username || u.password) return ['', bright]
  return [url, bright]
}

/** Colonnes ouvertes, dans l'ordre Trello, et les cartes qu'on y voit. */
function boardView(detail: Obj, mineIds: Set<string>): [Obj, Obj[]] {
  const bid = String(detail.id || '')
  const byBoard = new Map<string, Obj>(bid ? [[bid, detail]] : [])
  const byList = new Map<string, Obj>()
  const lists: Obj[] = []
  for (const l of detail.lists || []) {
    if (!isObj(l) || !l.id || l.closed) continue
    byList.set(String(l.id), l)
    lists.push({ id: String(l.id), name: l.name || 'Sans liste', pos: num(l.pos) })
  }
  lists.sort((a, b) => a.pos - b.pos || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const cards: Obj[] = []
  for (let raw of detail.cards || []) {
    if (isObj(raw) && !raw.idBoard && bid) raw = { ...raw, idBoard: bid }
    const c = card(raw, byBoard, byList, mineIds)
    if (c) cards.push(c)
  }
  const [bg, brightness] = background(detail)
  return [{ id: bid, name: detail.name || 'Sans tableau', url: detail.shortUrl || detail.url || '', background: bg, background_brightness: brightness, lists }, cards]
}

function ts(iso: unknown): number {
  const t = Date.parse(String(iso || ''))
  return Number.isNaN(t) ? 0 : t / 1000
}

function notif(n: unknown): Obj | null {
  if (!isObj(n)) return null
  const d = isObj(n.data) ? n.data : {}
  const c = isObj(d.card) ? d.card : {}
  const board = isObj(d.board) ? d.board : {}
  const display = isObj(n.display) ? n.display : {}
  let trans: unknown = (display.translationKey && display.translation) || display.translation || ''
  if (isObj(trans)) trans = trans.text || ''
  const who = n.memberCreator?.fullName || ''
  const title =
    String(trans || '').trim() ||
    [n.type || '', c.name || '']
      .filter(Boolean)
      .join(' ')
      .trim() ||
    '(sans titre)'
  const short = c.shortLink || ''
  const url = c.shortUrl || c.url || (short ? `https://trello.com/c/${short}` : '')
  const text = d.text || ''
  return { id: n.id ?? null, title, url, board: board.name || '', excerpt: (typeof text === 'string' ? text : '').slice(0, 280), creator: who, ts: ts(n.date) }
}

export function normalizeUnreads(body: unknown): Obj[] {
  if (!Array.isArray(body)) return []
  const out = body.map(notif).filter((n): n is Obj => !!n && !!n.id)
  out.sort((a, b) => b.ts - a.ts)
  return out
}

/** Événements du cycle. Une section jamais vue ne produit rien. */
export function diff(before: Obj, after: Obj, known: string[]): events.Event[] {
  const out: events.Event[] = []
  if (known.includes('unreads')) {
    const old = new Set((before.unreads || []).map((n: Obj) => `${n.id}\u0000${n.ts}`))
    for (const n of after.unreads || []) {
      if (old.has(`${n.id}\u0000${n.ts}`)) continue
      const who = n.creator ? `${n.creator} — ` : ''
      out.push(
        events.event('tr-notif', 'info', 'trello', `📋 ${who}${n.title}`, {
          body: [n.board, (n.excerpt || '').slice(0, 140)].filter(Boolean).join(' · '),
          repo: n.board || '',
          url: n.url || '',
          tag: `tr:notif:${n.id}`,
        }),
      )
    }
  }
  if (known.includes('cards')) {
    const old = new Map((before.cards || []).map((c: Obj) => [c.id, c.mine !== false]))
    for (const c of after.cards || []) {
      // Une carte des autres ne sonne pas. Une carte qui t'est assignée, si.
      if (c.mine === false || old.get(c.id)) continue
      out.push(
        events.event('tr-task', 'info', 'trello', `📌 Nouvelle carte — ${c.title}`, {
          body: [c.board, c.list].filter(Boolean).join(' · '),
          repo: c.board || '',
          url: c.url || '',
          tag: `tr:task:${c.id}`,
        }),
      )
    }
  }
  return out
}

function limit(code: number, headers: Record<string, string>): number | null {
  if (code !== 429) return null
  const wait = Math.trunc(Number(headers['retry-after'] || 30)) || 30
  state.retryAt = Date.now() / 1000 + Math.max(1, wait)
  return wait
}

async function getJson(url: string, what: string): Promise<any> {
  const [code, body, headers] = await call('GET', url)
  const wait = limit(code, headers)
  if (wait !== null) throw new Error(`Trello limite les appels : nouvel essai dans ${wait} s`)
  if (code === 401) throw new Error('Le jeton Trello ne marche plus. Reconnecte-toi dans Réglages.')
  if (code !== 200 || !body || typeof body !== 'object') throw new Error(what)
  return body
}

/** Chaque tableau ouvert : ses colonnes ouvertes et toutes les cartes visibles. */
async function openBoards(mineIds: Set<string>): Promise<[Obj[], Obj[], Set<string>]> {
  const index = await getJson(BOARDS, 'Lecture des tableaux impossible.')
  if (!Array.isArray(index)) throw new Error('Lecture des tableaux impossible.')
  const cards: Obj[] = []
  const boards: Obj[] = []
  const seen = new Set<string>()
  for (const item of index) {
    if (!isObj(item)) continue
    const bid = String(item.id || '')
    if (!BOARD_ID.test(bid)) continue
    let detail = await getJson(boardUrl(bid), "Lecture d'un tableau impossible.")
    if (!isObj(detail)) throw new Error("Lecture d'un tableau impossible.")
    if (!detail.id || !detail.name) detail = { id: bid, name: item.name || '', shortUrl: item.shortUrl || item.url || '', ...detail }
    const [board, found] = boardView(detail, mineIds)
    boards.push(board)
    for (const c of found) {
      if (seen.has(c.id)) continue
      seen.add(c.id)
      cards.push(c)
    }
  }
  return [cards, boards, seen]
}

/** Relit les tableaux et les notifications. Un seul à la fois (`kickoff`). */
export async function rebuild(): Promise<void> {
  const started = performance.now()
  try {
    if (!connected()) return
    const member = await getJson(CARDS, 'Lecture des cartes impossible.')
    const mine = Array.isArray(member) ? member : []
    const mineIds = mineIdsOf(mine)
    const [cards, boards, seen] = await openBoards(mineIds)
    // Une carte assignée sur une liste archivée reste dans « À traiter », sans rouvrir cette liste.
    const catalogue = boards.map((b) => ({ id: b.id, name: b.name, shortUrl: b.url, lists: b.lists.map((l: Obj) => ({ id: l.id, name: l.name, pos: l.pos })) }))
    for (const c of normalizeCards(mine, catalogue, mineIds)) {
      if (seen.has(c.id)) continue
      c.mine = true
      seen.add(c.id)
      cards.push(c)
    }
    const unreads = normalizeUnreads(await getJson(NOTIFS, 'Lecture des notifications impossible.'))
    const before = { cards: [...(data.cards || [])], unreads: [...(data.unreads || [])] }
    data.cards = cards
    data.unreads = unreads
    data.boards = boards
    const known = ['cards', 'unreads'].filter((k) => seeded.has(k))
    seeded.add('cards')
    seeded.add('unreads')
    state.ts = Date.now() / 1000
    state.error = null
    if (known.length) events.record(diff(before, { cards, unreads }, known))
    perflog.timed('trello', (performance.now() - started) / 1000)
  } catch (e) {
    state.error = String((e as Error).message || e)
    console.error(`✗ Trello : ${state.error}`)
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
  let { cards, unreads, boards } = data
  if (!on) [cards, unreads, boards] = [null, null, null]
  return {
    configured: on && configured(),
    enabled: active(),
    account: s.name || s.username || '',
    username: s.username || '',
    updated_at: state.ts,
    building: state.building,
    error: state.error,
    every: EVERY,
    cards: cards || [],
    boards: boards || [],
    unreads: unreads || [],
    loaded: cards !== null,
    posted: posted(),
  }
}

/** Le serveur lit Trello en continu, page ouverte ou non : c'est ce qui nourrit la cloche. */
export function start(): void {
  const tick = () => {
    try {
      if (Date.now() / 1000 >= state.retryAt) kickoff()
    } catch (e) {
      console.error(`✗ Trello : ${e}`)
    }
  }
  tick()
  setInterval(tick, EVERY * 1000).unref()
}

// ── Recherche ───────────────────────────────────────────────────────────────────
function foundCard(c: Obj): Obj {
  const board = isObj(c.board) ? c.board : {}
  const lst = isObj(c.list) ? c.list : {}
  const desc = c.desc || ''
  return {
    id: c.id ?? null,
    type: 'card',
    title: c.name || '',
    url: c.shortUrl || c.url || '',
    board: board.name || '',
    parent: lst.name || '',
    due: c.due || null,
    creator: '',
    excerpt: desc === (c.name || '') ? '' : (desc || '').slice(0, 300),
    updated_at: c.dateLastActivity || '',
  }
}

function foundAction(a: Obj): Obj | null {
  const d = isObj(a.data) ? a.data : {}
  const c = isObj(d.card) ? d.card : {}
  const board = isObj(d.board) ? d.board : {}
  const url = c.shortUrl || c.url || ''
  if (!url) return null
  const kind = a.type === 'commentCard' ? 'comment' : a.type || 'action'
  const text = d.text || ''
  return {
    id: a.id ?? null,
    type: kind,
    title: c.name || (typeof text === 'string' ? text.slice(0, 80) : '') || kind,
    url,
    board: board.name || '',
    parent: '',
    due: null,
    creator: a.memberCreator?.fullName || '',
    excerpt: (typeof text === 'string' ? text : '').slice(0, 300),
    updated_at: a.date || '',
    comment_id: kind === 'comment' ? (a.id ?? null) : null,
  }
}

export function searchItems(body: unknown): Obj[] {
  const b = isObj(body) ? body : {}
  const out: Obj[] = (b.cards || []).filter(isObj).map(foundCard)
  for (const a of b.actions || []) {
    if (!isObj(a)) continue
    const item = foundAction(a)
    if (item) out.push(item)
  }
  for (const x of b.boards || []) {
    if (!isObj(x)) continue
    out.push({ id: x.id ?? null, type: 'board', title: x.name || '', url: x.shortUrl || x.url || '', board: x.name || '', parent: '', due: null, creator: '', excerpt: '', updated_at: '' })
  }
  return out.slice(0, 20)
}

/** Cartes, commentaires et tableaux pour `q`. [] si non connecté. Gardé 1 min. */
export async function search(q: unknown): Promise<Obj[]> {
  const query = String(q ?? '').trim()
  if (query.length < 2 || !active()) return []
  const key = query.toLowerCase()
  const hit = searches.get(key)
  if (hit && Date.now() / 1000 - hit[0] < SEARCH_TTL) return hit[1]
  const url = API + '/search?' + new URLSearchParams({ query, modelTypes: 'cards,boards,actions', cards_limit: '20', boards_limit: '5', actions_limit: '10', partial: 'true' })
  const [code, body, headers] = await call('GET', url)
  if (code === 429) {
    limit(code, headers)
    throw new Error('Trello limite la recherche : réessaie dans un instant.')
  }
  if (code !== 200) throw new Error('Recherche Trello impossible.')
  const items = searchItems(body)
  if (searches.size >= SEARCH_MAX) {
    const oldest = [...searches].sort((a, b) => a[1][0] - b[1][0])[0]?.[0]
    if (oldest !== undefined) searches.delete(oldest)
  }
  searches.set(key, [Date.now() / 1000, items])
  return items
}

// ── Contenu d'une carte, à la demande ──────────────────────────────────────────
export function shortOf(url: unknown): string | null {
  const m = CARD_URL.exec(String(url || '').split('?')[0].split('#')[0])
  return m ? m[1] : null
}

/** Description, checklists et commentaires d'une carte. Un seul GET. */
export async function cardText(url: unknown): Promise<Obj> {
  const short = shortOf(url)
  if (!short || !SHORT.test(short)) throw new RangeError('adresse de carte Trello attendue')
  if (!connected()) throw new Error("Trello n'est pas connecté.")
  const fields = 'fields=name,desc,shortUrl,url&checklists=all&actions=commentCard&actions_limit=50&attachments=true&attachment_fields=name,url,mimeType'
  const [code, body] = await call('GET', `${API}/cards/${short}?${fields}`)
  if (code === 404) throw new Error("Cette carte n'est plus accessible avec ce compte.")
  if (code !== 200 || !isObj(body)) throw new Error('Lecture de la carte impossible.')
  const steps = (body.checklists || []).filter(isObj).map((cl: Obj) => ({
    name: cl.name || 'Liste',
    items: (cl.checkItems || []).filter(isObj).map((it: Obj) => ({ title: (it.name || '').trim(), completed: it.state === 'complete' })),
  }))
  const comments = (body.actions || [])
    .filter((a: unknown) => isObj(a) && (a as Obj).type === 'commentCard')
    .map((a: Obj) => ({ id: a.id ?? null, who: a.memberCreator?.fullName || '', date: (a.date || '').slice(0, 16).replace('T', ' '), text: (isObj(a.data) ? a.data.text : '') || '' }))
  const images: Record<string, string> = {}
  allowed.clear()
  for (const att of body.attachments || []) {
    if (!isObj(att)) continue
    const mime = String(att.mimeType || '')
      .split(';')[0]
      .trim()
      .toLowerCase()
    const link = att.url || ''
    if (SAFE_IMAGES.has(mime) && trelloHttps(link)) {
      images[att.name || 'image'] = link
      allowed.set(link, mime)
    }
  }
  return { text: body.desc || '', checklists: steps, comments, images }
}

/** Image déjà vue sur une carte de ce compte, hébergée par Trello. Toute autre adresse : refus, sans requête. */
export async function attachment(url: unknown): Promise<[string, Buffer]> {
  const u = String(url || '')
  if (!trelloHttps(u)) throw new RangeError('image inconnue')
  const mime = allowed.get(u)
  if (!mime || !SAFE_IMAGES.has(mime)) throw new RangeError('image inconnue')
  if (!connected()) throw new Error("Trello n'est pas connecté.")
  const [code, body, headers] = await call('GET', u, { raw: true })
  if (code !== 200 || !Buffer.isBuffer(body) || body.length > ATTACH_MAX) throw new Error('Image illisible.')
  const got = (headers['content-type'] || mime).split(';')[0].trim().toLowerCase()
  if (!SAFE_IMAGES.has(got)) throw new RangeError('format refusé')
  return [got, body]
}

// ── Rapport d'une issue → commentaire sur la carte ──────────────────────────────
export function posted(): Obj {
  let v: unknown
  try {
    v = store.read(store.TR_POSTED, {})
  } catch {
    v = {}
  }
  return isObj(v) ? v : {}
}

/** Seule écriture vers Trello : un commentaire, sur une carte identifiée par shortLink. */
async function postComment(short: string, text: string): Promise<string> {
  if (!SHORT.test(short || '')) throw new RangeError('adresse de carte Trello attendue')
  if (!connected()) throw new Error("Trello n'est pas connecté.")
  const [code, body] = await call('POST', `${API}/cards/${short}/actions/comments`, { body: new URLSearchParams({ text }).toString() })
  if (code === 401) throw new Error('Trello refuse le commentaire : reconnecte-toi.')
  if (code === 403 || code === 404) throw new Error("Trello refuse le commentaire : la carte n'est plus accessible avec ce compte.")
  if ((code !== 200 && code !== 201) || !isObj(body)) throw new Error("Trello n'a pas pris le commentaire.")
  return body.data?.card?.shortUrl || `https://trello.com/c/${short}`
}

export function dismiss(issue: Obj, undo = false): Obj {
  const key = `${issue.repo}#${issue.number}`
  const done = posted()
  if (undo) delete done[key]
  else done[key] = { ts: Date.now() / 1000, dismissed: true }
  store.write(store.TR_POSTED, done)
  return done
}

let posting: Promise<unknown> = Promise.resolve()

/** Publie le rapport en commentaire de la carte, une fois par rapport. */
export function publishReport(issue: Obj): Promise<Obj> {
  // Une publication à la fois : deux clics rapprochés ne postent pas deux fois.
  const run = posting.then(async () => {
    const rep = issue.report || {}
    if (!rep.id) throw new RangeError('pas de rapport pour cette issue')
    const key = String(rep.id)
    const short = shortOf(issue.tr_url || '')
    if (!short) throw new RangeError('adresse de carte Trello attendue')
    const done = posted()
    if (done[key]?.url) return done[key]
    const footer = `\n\n— Rapport de l'issue GitHub ${issue.repo || ''} #${issue.number}\n${issue.url || ''}`
    let text = ((rep.body || '').trim() + footer).trim()
    if (text.length > COMMENT_MAX) text = text.slice(0, COMMENT_MAX - 1) + '…'
    const url = await postComment(short, text)
    const again = posted()
    again[key] = { url, ts: Date.now() / 1000 }
    store.write(store.TR_POSTED, again)
    return again[key]
  })
  posting = run.catch(() => undefined)
  return run
}
