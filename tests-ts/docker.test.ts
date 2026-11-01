/** Docker : une seule requête possible, en lecture, et rien sans activation. */

import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { handle, httpHosts } from '../server/app.ts'
import { entriesOf, read, sockets } from '../server/docker.ts'
import * as store from '../server/store.ts'
import { MONOGRAM_COLORS, dockerStopped, dockerTabs, monogram } from '../src/lib/dockerTabs.ts'

const web = { Names: ['/web'], Image: 'nginx', State: 'running', Ports: [{ IP: '0.0.0.0', PrivatePort: 80, PublicPort: 8080, Type: 'tcp' }, { IP: '::', PrivatePort: 80, PublicPort: 8080, Type: 'tcp' }] }

const compose = (project: string) => ({ 'com.docker.compose.project': project })

describe('lignes déduites de Docker', () => {
  it('donne une ligne par port web publié, sans doublon', () => {
    expect(entriesOf([web])).toEqual([{ id: 'web', label: 'web', image: 'nginx', running: true, ports: [{ port: 8080, url: 'http://localhost:8080/' }] }])
  })

  it('écarte les bases de données, UDP et les ports non publiés', () => {
    const c = { Names: ['/db'], State: 'running', Ports: [{ PrivatePort: 5432, PublicPort: 15432, Type: 'tcp' }, { PrivatePort: 53, PublicPort: 5353, Type: 'udp' }, { PrivatePort: 80, Type: 'tcp' }] }
    expect(entriesOf([c])).toEqual([])
  })

  it('fait une seule ligne d’un container à plusieurs ports, le plus petit d’abord', () => {
    const c = { Names: ['/app'], State: 'running', Ports: [{ PublicPort: 81, Type: 'tcp' }, { PublicPort: 80, Type: 'tcp' }] }
    const [e] = entriesOf([c])
    expect(e.label).toBe('app')
    expect(e.ports.map((p) => p.port)).toEqual([80, 81])
  })

  it('réunit les services d’un projet Compose', () => {
    const a = { Names: ['/toolbox_web'], State: 'running', Labels: compose('toolbox'), Ports: [{ PublicPort: 3000, Type: 'tcp' }] }
    const b = { Names: ['/toolbox_piper'], State: 'exited', Labels: compose('toolbox'), Ports: [] }
    const list = entriesOf([a, b])
    expect(list.map((e) => [e.label, e.running])).toEqual([['toolbox', true]])
  })

  it('montre un projet Compose éteint, pas un reste de docker run', () => {
    const off = { Names: ['/toolbox_web'], State: 'exited', Labels: compose('toolbox'), Ports: [] }
    const created = { Names: ['/bm'], State: 'created', Labels: compose('bangermaster'), Ports: [] }
    const rest = { Names: ['/vigorous_varahamihira'], State: 'exited', Ports: [] }
    const oneoff = { Names: ['/x'], State: 'exited', Labels: { ...compose('y'), 'com.docker.compose.oneoff': 'True' }, Ports: [] }
    expect(entriesOf([off, created, rest, oneoff]).map((e) => [e.label, e.running])).toEqual([['bangermaster', false], ['toolbox', false]])
  })

  it('ne montre pas comme éteint un projet en marche sans page web', () => {
    const c = { Names: ['/redis'], State: 'running', Labels: compose('cache'), Ports: [{ PrivatePort: 6379, PublicPort: 6379, Type: 'tcp' }] }
    expect(entriesOf([c])).toEqual([])
  })

  it('classe les lignes en marche d’abord', () => {
    const off = { Names: ['/a'], State: 'exited', Labels: compose('a'), Ports: [] }
    expect(entriesOf([off, web]).map((e) => e.label)).toEqual(['web', 'a'])
  })

  it('résiste à une réponse inattendue', () => {
    expect(entriesOf(null)).toEqual([])
    expect(entriesOf([{ Names: ['/<script>'], State: 'running', Ports: [{ PublicPort: 80, Type: 'tcp' }] }, {}])).toEqual([])
  })

  it('masque les lignes décochées, ouvre le premier port, et laisse les éteintes à part', () => {
    const off = { Names: ['/a'], State: 'exited', Labels: compose('a'), Ports: [] }
    const list = entriesOf([web, off])
    expect(dockerTabs(list, []).map((t) => [t.id, t.url])).toEqual([['dk-web', 'http://localhost:8080/']])
    expect(dockerTabs(list, ['web'])).toEqual([])
    expect(dockerStopped(list, []).map((e) => e.id)).toEqual(['a'])
    expect(dockerStopped(list, ['a'])).toEqual([])
  })
})

describe('monogramme', () => {
  it('prend les initiales des mots, sinon deux lettres', () => {
    expect(monogram('homedash-dev').letters).toBe('HD')
    expect(monogram('hd_multi.web').letters).toBe('HM')
    expect(monogram('tiroir').letters).toBe('TI')
  })

  it('donne toujours la même couleur à un container', () => {
    expect(monogram('tiroir').color).toBe(monogram('tiroir').color)
    expect(MONOGRAM_COLORS).toContain(monogram('tiroir').color)
  })

  it('reste lisible en lettres blanches', () => {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    for (const c of MONOGRAM_COLORS) expect(1.05 / (lum(c) + 0.05)).toBeGreaterThanOrEqual(4.5)
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

  it('n’envoie que GET /containers/json?all=1', async () => {
    const r = await read([await fake()])
    expect(r.available).toBe(true)
    expect(r.entries).toHaveLength(1)
    expect(seen).toEqual(['GET /containers/json?all=1'])
  })

  it('dit Docker absent, sans erreur', async () => {
    expect(await read([path.join(dir, 'rien.sock')])).toEqual({ available: false, entries: [] })
  })

  it('la route ne touche pas au socket sans activation', async () => {
    process.env.DOCKER_HOST = `unix://${await fake()}`
    const get = async (url: string) => {
      const u = new URL(url, 'http://localhost')
      const res = await handle({ method: 'GET', path: u.pathname, query: u.searchParams, headers: { host: 'localhost:7778' }, body: Buffer.alloc(0) }, { hosts: httpHosts('') })
      return JSON.parse(String(res.body))
    }
    store.write(store.CONFIG, { groups: [] })
    expect(await get('/api/docker')).toEqual({ available: false, entries: [] })
    expect(seen).toEqual([])
    store.write(store.CONFIG, { groups: [], docker: { enabled: true } })
    expect((await get('/api/docker')).entries).toHaveLength(1)
  })
})
