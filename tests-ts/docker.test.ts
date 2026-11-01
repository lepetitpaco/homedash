/** Docker : une seule requête possible, en lecture, et rien sans activation. */

import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { handle, httpHosts } from '../server/app.ts'
import { linksOf, read, sockets } from '../server/docker.ts'
import * as store from '../server/store.ts'
import { dockerTabs } from '../src/lib/dockerTabs.ts'

const web = { Names: ['/web'], Image: 'nginx', Ports: [{ IP: '0.0.0.0', PrivatePort: 80, PublicPort: 8080, Type: 'tcp' }, { IP: '::', PrivatePort: 80, PublicPort: 8080, Type: 'tcp' }] }

describe('liens déduits des ports', () => {
  it('donne un lien par port web publié, sans doublon', () => {
    expect(linksOf([web]).map((l) => [l.id, l.label, l.url])).toEqual([['web-8080', 'web', 'http://localhost:8080/']])
  })

  it('écarte les bases de données, UDP et les ports non publiés', () => {
    const c = { Names: ['/db'], Ports: [{ PrivatePort: 5432, PublicPort: 15432, Type: 'tcp' }, { PrivatePort: 53, PublicPort: 5353, Type: 'udp' }, { PrivatePort: 80, Type: 'tcp' }] }
    expect(linksOf([c])).toEqual([])
  })

  it('distingue les ports d’un même container', () => {
    const c = { Names: ['/app'], Ports: [{ PublicPort: 81, Type: 'tcp' }, { PublicPort: 80, Type: 'tcp' }] }
    expect(linksOf([c]).map((l) => l.label)).toEqual(['app :80', 'app :81'])
  })

  it('résiste à une réponse inattendue', () => {
    expect(linksOf(null)).toEqual([])
    expect(linksOf([{ Names: ['/<script>'], Ports: [{ PublicPort: 80, Type: 'tcp' }] }, {}])).toEqual([])
  })

  it('masque les liens décochés', () => {
    const links = linksOf([web])
    expect(dockerTabs(links, []).map((t) => t.id)).toEqual(['dk-web-8080'])
    expect(dockerTabs(links, ['web-8080'])).toEqual([])
  })
})

describe('socket', () => {
  it('ignore un DOCKER_HOST réseau', () => {
    const list = sockets({ DOCKER_HOST: 'tcp://10.0.0.1:2375' }, '/h', 'linux')
    expect(list.join()).not.toContain('10.0.0.1')
    expect(sockets({ DOCKER_HOST: 'unix:///x/d.sock' }, '/h', 'linux')[0]).toBe('/x/d.sock')
  })

  let dir = ''
  let server: http.Server | null = null
  const seen: string[] = []
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-'))
    seen.length = 0
  })
  afterEach(async () => {
    await new Promise((ok) => (server ? server.close(ok) : ok(null)))
    server = null
    fs.rmSync(dir, { recursive: true, force: true })
    delete process.env.DOCKER_HOST
  })
  const fake = async () => {
    const sock = path.join(dir, 'd.sock')
    server = http.createServer((req, res) => {
      seen.push(`${req.method} ${req.url}`)
      res.end(JSON.stringify([web]))
    })
    await new Promise<void>((ok) => server!.listen(sock, ok))
    return sock
  }

  it('n’envoie que GET /containers/json', async () => {
    const r = await read([await fake()])
    expect(r.available).toBe(true)
    expect(r.links).toHaveLength(1)
    expect(seen).toEqual(['GET /containers/json'])
  })

  it('dit Docker absent, sans erreur', async () => {
    expect(await read([path.join(dir, 'rien.sock')])).toEqual({ available: false, links: [] })
  })

  it('la route ne touche pas au socket sans activation', async () => {
    process.env.DOCKER_HOST = `unix://${await fake()}`
    const get = async (url: string) => {
      const u = new URL(url, 'http://localhost')
      const res = await handle({ method: 'GET', path: u.pathname, query: u.searchParams, headers: { host: 'localhost:7778' }, body: Buffer.alloc(0) }, { hosts: httpHosts('') })
      return JSON.parse(String(res.body))
    }
    store.write(store.CONFIG, { groups: [] })
    expect(await get('/api/docker')).toEqual({ available: false, links: [] })
    expect(seen).toEqual([])
    store.write(store.CONFIG, { groups: [], docker: { enabled: true } })
    expect((await get('/api/docker')).links).toHaveLength(1)
  })
})
