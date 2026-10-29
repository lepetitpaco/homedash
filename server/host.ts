/**
 * Le serveur dans l'appli de bureau : lancé par desktop/main.js dans un
 * utilityProcess (un plantage ne ferme pas la fenêtre). Aucun port : les
 * requêtes de la page arrivent par messages et repartent de même.
 *
 * Seule exception, facultative : Réglages → « Accès depuis le navigateur »
 * (`ui.browserAccess`) ouvre http://localhost:7777, sur 127.0.0.1 seulement.
 */

import type http from 'node:http'

import { handle, httpHosts, setBrowserAccess, setOnConfig, setPublicDir, start } from './app.ts'
import { createServer } from './http.ts'

type Port = {
  on(event: 'message', cb: (e: { data: any }) => void): void
  postMessage(msg: unknown): void
}

const port = (process as unknown as { parentPort?: Port }).parentPort
if (!port) {
  console.error('host.ts se lance depuis l\'appli de bureau (utilityProcess)')
  process.exit(1)
}

/** L'adresse que la page croit appeler : servie par l'appli, sans socket. */
const APP = { hosts: new Set(['localhost', '127.0.0.1']) }
const BROWSER_PORT = Number(process.env.HOMEDASH_BROWSER_PORT || 7777)

let browser: http.Server | null = null

/** Ouvre ou ferme l'accès depuis le navigateur, au gré de la config. */
function browserAccess(on: boolean): void {
  if (on && !browser) {
    const srv = createServer({ hosts: httpHosts() })
    srv.on('error', (e: NodeJS.ErrnoException) => {
      const why = e.code === 'EADDRINUSE' ? `le port ${BROWSER_PORT} est déjà pris (l'ancien homedash Docker tourne encore ?)` : e.message
      setBrowserAccess({ on: false, error: why })
      browser = null
    })
    srv.listen(BROWSER_PORT, '127.0.0.1', () => setBrowserAccess({ on: true, error: null, url: `http://localhost:${BROWSER_PORT}` }))
    browser = srv
  } else if (!on && browser) {
    browser.close()
    browser = null
    setBrowserAccess({ on: false, error: null })
  }
}

if (process.env.PUBLIC_DIR) setPublicDir(process.env.PUBLIC_DIR)
setOnConfig((cfg) => browserAccess(cfg.ui?.browserAccess === true))
start()

port.on('message', async ({ data: m }) => {
  if (!m || m.type !== 'request') return
  try {
    const url = new URL(m.url)
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(m.headers || {})) headers[k.toLowerCase()] = String(v)
    // Une requête interne n'a pas d'en-tête Host : c'est celui de l'adresse.
    headers.host ||= url.host
    const res = await handle(
      { method: m.method, path: url.pathname, query: url.searchParams, headers, body: Buffer.from(m.body || new Uint8Array()) },
      APP,
    )
    const body = typeof res.body === 'string' ? Buffer.from(res.body) : res.body
    port.postMessage({ type: 'response', id: m.id, status: res.status, headers: res.headers, body: new Uint8Array(body), file: res.file })
  } catch (e) {
    port.postMessage({ type: 'response', id: m.id, status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: new TextEncoder().encode(JSON.stringify({ error: String(e) })) })
  }
})

port.postMessage({ type: 'ready' })
