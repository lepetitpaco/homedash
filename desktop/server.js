/**
 * Le serveur homedash embarqué (server/host.js), lancé dans un utilityProcess.
 *
 * La page garde son adresse de toujours, http://localhost:7777, mais aucune
 * requête ne passe par le réseau : l'appli intercepte cette adresse dans ses
 * sessions (`protocol.handle('http')`) et la transmet au serveur par messages.
 * Même origine qu'avant : réglages de la page (localStorage), connexions des
 * sites et contexte sûr (notifications, presse-papiers) sont conservés.
 *
 * Les sessions des sites (webviews) ne reçoivent que `GET /api/file` : un site
 * tiers chargé dans un onglet n'atteint jamais l'API.
 */
const { app, net, utilityProcess } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { Readable } = require('node:stream')

/** L'adresse interne de homedash : jamais ouverte sur le réseau. */
const ORIGIN = 'http://localhost:7777'

let child = null
let ready = null
let seq = 0
const pending = new Map()
const listeners = new Set()

/** Dossier de données : ~/Library/Application Support/homedash/data, %APPDATA%\homedash\data. */
const dataDir = () => path.join(app.getPath('userData'), 'data')

/** Le front, le serveur, le changelog et le guide, embarqués avec l'appli. */
const root = () => __dirname

function env() {
  const home = os.homedir().replace(/\\/g, '/')
  const win = process.platform === 'win32'
  const disk = win ? `${(process.env.SystemDrive || 'C:').replace(/\\/g, '/')}` : '/Volumes'
  return {
    ...process.env,
    DATA_DIR: dataDir(),
    PUBLIC_DIR: path.join(root(), 'public'),
    HOMEDASH_ROOT: root(),
    // Profil de l'appli (sessions, cookies, stockage des sites) : jamais servi par Mes sites.
    HOMEDASH_PROFILE_DIR: app.getPath('userData'),
    // Plus de montage Docker : le dossier personnel et le disque sont les vrais.
    HOST_MOUNT: home,
    HOST_HOME: home,
    DISK_MOUNT: win ? `${disk}/` : disk,
    HOST_DISK: disk,
    TZ: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris',
  }
}

/** Lance le serveur ; résout quand il répond. Un plantage est signalé (`onExit`) et relancé une fois. */
function start() {
  if (ready) return ready
  fs.mkdirSync(dataDir(), { recursive: true })
  child = utilityProcess.fork(path.join(root(), 'server', 'host.js'), [], { env: env(), serviceName: 'homedash-server', stdio: 'pipe' })
  child.stdout?.on('data', (d) => process.stdout.write(d))
  child.stderr?.on('data', (d) => process.stderr.write(d))
  ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('le serveur ne démarre pas')), 30_000)
    child.on('message', (m) => {
      if (m?.type === 'ready') {
        clearTimeout(timer)
        resolve()
      } else if (m?.type === 'response') {
        const p = pending.get(m.id)
        pending.delete(m.id)
        p?.(m)
      }
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`le serveur s'est arrêté (code ${code})`))
    })
  })
  child.once('exit', (code) => {
    child = null
    ready = null
    for (const [, p] of pending) p({ status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: Buffer.from('{"error":"serveur arrêté"}') })
    pending.clear()
    for (const fn of listeners) fn(code)
  })
  return ready
}

function stop() {
  child?.kill()
  child = null
  ready = null
}

/** Prévenu quand le serveur s'arrête (plantage). */
function onExit(fn) {
  listeners.add(fn)
}

/** Une requête au serveur, sans réseau : {status, headers, body (Buffer), file?}. */
async function request(method, url, headers = {}, body = null) {
  if (!ready) start()
  await ready
  const id = ++seq
  return new Promise((resolve) => {
    pending.set(id, (m) => resolve({ ...m, body: Buffer.from(m.body || []) }))
    child.postMessage({ type: 'request', id, method, url, headers, body: body ? new Uint8Array(body) : null })
  })
}

/** Appel JSON au serveur depuis l'appli (menus, mise à jour) : comme la page l'aurait fait. */
async function api(method, p, payload) {
  const body = payload === undefined ? null : Buffer.from(JSON.stringify(payload))
  const res = await request(method, ORIGIN + p, { 'content-type': 'application/json', origin: ORIGIN }, body)
  const text = res.body.toString('utf8')
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { status: res.status, data }
}

function toResponse(res) {
  if (res.file) {
    const size = fs.statSync(res.file).size
    return new Response(Readable.toWeb(fs.createReadStream(res.file)), {
      status: res.status,
      headers: { ...res.headers, 'Content-Length': String(size) },
    })
  }
  // 204/304 et compagnie : pas de corps
  const empty = res.status === 204 || res.status === 304 || (res.status >= 300 && res.status < 400 && !res.body.length)
  return new Response(empty ? null : res.body, { status: res.status, headers: res.headers })
}

const isOurs = (url) => {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' && u.host === 'localhost:7777'
  } catch {
    return false
  }
}

/**
 * Intercepte http://localhost:7777 dans une session. `onlyFiles` (sessions des
 * sites) : seulement `GET /api/file`, tout le reste de l'adresse est refusé.
 * Les autres adresses http passent normalement.
 */
function serve(session, onlyFiles = false) {
  session.protocol.handle('http', async (req) => {
    if (!isOurs(req.url)) return net.fetch(req, { bypassCustomProtocolHandlers: true })
    const u = new URL(req.url)
    if (onlyFiles && !(req.method === 'GET' && u.pathname === '/api/file')) return new Response('', { status: 404 })
    const headers = {}
    req.headers.forEach((v, k) => (headers[k] = v))
    const body = req.method === 'GET' || req.method === 'HEAD' ? null : Buffer.from(await req.arrayBuffer())
    try {
      return toResponse(await request(req.method, req.url, headers, body))
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
    }
  })
}

module.exports = { ORIGIN, api, dataDir, onExit, request, serve, start, stop }
