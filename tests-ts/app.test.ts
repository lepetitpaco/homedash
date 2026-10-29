/**
 * Le cœur de l'API, sans réseau : contrôles de sécurité, version de config,
 * fonctionnalités coupées, sauvegardes, et jamais un jeton dans une réponse.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

import * as accounts from '../server/accounts.ts'
import { type Req, handle, httpHosts, loadSections, refused } from '../server/app.ts'
import * as basecamp from '../server/basecamp.ts'
import { setFetch } from '../server/github.ts'
import * as localgit from '../server/localgit.ts'
import * as store from '../server/store.ts'

const T = { hosts: httpHosts('homedash-dev.localhost') }
const BASE = { title: 't', groups: [{ name: 'Liens', links: [{ name: 'A', url: 'https://a.test' }] }] }

function req(method: string, url: string, opts: { body?: unknown; headers?: Record<string, string>; raw?: string } = {}): Req {
  const u = new URL(url, 'http://localhost')
  const body = opts.raw !== undefined ? Buffer.from(opts.raw) : opts.body !== undefined ? Buffer.from(JSON.stringify(opts.body)) : Buffer.alloc(0)
  const headers: Record<string, string> = { host: 'localhost:7778', ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}) }
  for (const [k, v] of Object.entries(opts.headers || {})) headers[k.toLowerCase()] = v
  return { method, path: u.pathname, query: u.searchParams, headers, body }
}

async function call(method: string, url: string, opts: Parameters<typeof req>[2] = {}) {
  const res = await handle(req(method, url, opts), T)
  const text = typeof res.body === 'string' ? res.body : res.body.toString()
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return { status: res.status, json, headers: res.headers }
}

beforeEach(() => {
  store.write(store.CONFIG, BASE)
  loadSections()
})

describe('contrôles de sécurité', () => {
  it('hôte inconnu : refusé, même en lecture (DNS rebinding)', async () => {
    expect((await call('GET', '/api/config', { headers: { host: 'evil.example' } })).status).toBe(403)
  })
  it('hôte de dev autorisé', async () => {
    expect((await call('GET', '/api/config', { headers: { host: 'homedash-dev.localhost:7778' } })).status).toBe(200)
  })
  it('écriture depuis une autre origine : refusée', async () => {
    const r = await call('PUT', '/api/notes', { body: [], headers: { origin: 'https://evil.example' } })
    expect(r.status).toBe(403)
  })
  it('écriture intersite : refusée', async () => {
    expect((await call('PUT', '/api/notes', { body: [], headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403)
    expect((await call('PUT', '/api/notes', { body: [], headers: { origin: 'null' } })).status).toBe(403)
  })
  it("corps sans Content-Type JSON : refusé (formulaire d'un autre site)", async () => {
    const r = await handle({ ...req('POST', '/api/usage', { raw: '{"id":"x"}' }), headers: { host: 'localhost', 'content-type': 'text/plain' } }, T)
    expect(r.status).toBe(403)
  })
  it('protocole de l\'appli : seul son propre hôte', () => {
    const app = { hosts: new Set(['app']) }
    expect(refused({ ...req('GET', '/api/config'), headers: { host: 'app' } }, app, false)).toBeNull()
    expect(refused({ ...req('GET', '/api/config'), headers: { host: 'localhost' } }, app, false)).not.toBeNull()
    expect(refused({ ...req('PUT', '/api/notes', { body: [] }), headers: { host: 'app', origin: 'https://gmail.com', 'content-type': 'application/json' } }, app, true)).toBe('origine non autorisée')
  })
  it('JSON invalide : 400', async () => {
    expect((await handle({ ...req('PUT', '/api/notes', { raw: '{oups' }), headers: { host: 'localhost', 'content-type': 'application/json' } }, T)).status).toBe(400)
  })
})

describe('version de config', () => {
  it('GET donne la version', async () => {
    const r = await call('GET', '/api/config')
    expect(r.status).toBe(200)
    expect(r.json.title).toBe('t')
    expect(r.headers['X-Config-Version']).toBe(store.version(store.CONFIG))
  })
  it('écrire sur la version courante, puis une périmée est refusée', async () => {
    const v1 = (await call('GET', '/api/config')).headers['X-Config-Version']
    const ok = await call('PUT', '/api/config', { body: { ...BASE, title: 'onglet 1' }, headers: { 'x-config-version': v1 } })
    expect(ok.status).toBe(200)
    expect(ok.headers['X-Config-Version']).not.toBe(v1)
    expect(ok.json.version).toBe(ok.headers['X-Config-Version'])
    const stale = await call('PUT', '/api/config', { body: { ...BASE, title: 'onglet 2' }, headers: { 'x-config-version': v1 } })
    expect(stale.status).toBe(409)
    expect(stale.json.conflict).toBe(true)
    expect(store.read<any>(store.CONFIG, {}).title).toBe('onglet 1')
  })
  it("sans en-tête de version, on écrit comme avant", async () => {
    expect((await call('PUT', '/api/config', { body: { ...BASE, title: 'script' } })).status).toBe(200)
    expect(store.read<any>(store.CONFIG, {}).title).toBe('script')
  })
  it('config invalide : 422, rien écrit', async () => {
    const r = await call('PUT', '/api/config', { body: { groups: 'non' } })
    expect(r.status).toBe(422)
    expect(store.read<any>(store.CONFIG, {}).title).toBe('t')
  })
  it('config abîmée : la page propose la dernière sauvegarde valide', async () => {
    await call('POST', '/api/backups', { body: {} })
    fs.writeFileSync(store.pathOf(store.CONFIG), '{"title": "t",\n  oups }')
    const r = await call('GET', '/api/config')
    expect(r.status).toBe(500)
    expect(r.json.broken).toBe(true)
    expect(r.json.line).toBe(2)
    expect(r.json.backup?.name).toMatch(/manuelle\.json$/)
    const fixed = await call('POST', '/api/config/repair', { body: {} })
    expect(fixed.status).toBe(200)
    expect(store.read<any>(store.CONFIG, {}).title).toBe('t')
    expect(fs.readdirSync(store.DATA_DIR()).some((n) => n.startsWith('config.broken-'))).toBe(true)
  })
})

describe('fonctionnalités coupées', () => {
  it('Local et Basecamp coupés puis rallumés', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hd-root-'))
    const local = { roots: [{ path: dir }] }
    store.write(store.CONFIG, { ...BASE, local, features: { local: false, basecamp: false } })
    loadSections()
    expect(localgit.enabled()).toBe(false)
    expect(basecamp.payload().configured).toBe(false)
    expect(String(localgit.payload().error)).toContain('Fonctionnalités')
    store.write(store.CONFIG, { ...BASE, local })
    loadSections()
    expect(localgit.CFG.enabled).toBe(true)
    fs.rmSync(dir, { recursive: true })
  })
})

describe('notes, compteurs, sauvegardes', () => {
  it('notes validées', async () => {
    expect((await call('PUT', '/api/notes', { body: [{ id: 'a', text: 'x' }] })).status).toBe(200)
    expect((await call('PUT', '/api/notes', { body: [{ text: 'sans id' }] })).status).toBe(422)
    expect((await call('GET', '/api/notes')).json).toEqual([{ id: 'a', text: 'x' }])
  })
  it('compteurs', async () => {
    await call('POST', '/api/usage', { body: { id: 'l1' } })
    const r = await call('POST', '/api/usage', { body: { id: 'l1' } })
    expect(r.json.l1.count).toBe(2)
  })
  it('restauration : instantané avant, et rien sans config valide', async () => {
    const exported = (await call('GET', '/api/backup')).json
    expect(exported.homedash_backup).toBe(1)
    store.write(store.CONFIG, { ...BASE, title: 'changé' })
    expect((await call('POST', '/api/backup/restore', { body: { homedash_backup: 1, files: { config: { groups: 'non' } } } })).status).toBe(422)
    const r = await call('POST', '/api/backup/restore', { body: exported })
    expect(r.status).toBe(200)
    expect(r.json.before).toMatch(/avant-restauration(-\d+)?\.json$/)
    expect(store.read<any>(store.CONFIG, {}).title).toBe('t')
  })
  it('nom de sauvegarde venu de l\'URL : vérifié', async () => {
    expect((await call('GET', '/api/backups/..%2Fsecrets.json')).status).toBe(404)
    expect((await call('DELETE', '/api/backups/..%2Fconfig.json')).status).toBe(404)
  })
})

describe('jetons jamais servis', () => {
  it('aucune réponse ne contient un jeton', async () => {
    store.write(store.CONFIG, { ...BASE, github_accounts: [{ id: 'main', me: 'moi' }] })
    loadSections()
    // aucun appel réseau : GitHub répond « moi » à tout
    setFetch(async () => new Response(JSON.stringify({ login: 'moi' }), { status: 200 }))
    accounts.setToken('main', 'ghp_SECRETSECRETSECRETSECRET1234')
    const routes = ['/api/config', '/api/github/accounts', '/api/backup', '/api/backups', '/api/health', '/api/basecamp/auth', '/api/errors']
    for (const r of routes) {
      const res = await handle(req('GET', r), T)
      const text = typeof res.body === 'string' ? res.body : res.body.toString()
      expect(text, r).not.toContain('SECRETSECRET')
    }
    accounts.setToken('main', null)
    setFetch((i, init) => fetch(i, init))
  })
})

describe('fichiers statiques', () => {
  it('pas de traversée de répertoire', async () => {
    const r = await handle({ ...req('GET', '/x'), path: '/../../etc/passwd' }, T)
    expect([403, 404]).toContain(r.status)
  })
  it('route inconnue : 404', async () => {
    expect((await call('GET', '/api/nexiste-pas')).status).toBe(404)
  })
})
