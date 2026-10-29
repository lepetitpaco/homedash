/** Petits modules : stockage, journal d'erreurs, journal, changelog, fichiers de Mes sites, perf. */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import * as errlog from '../server/errlog.ts'
import * as events from '../server/events.ts'
import * as favicons from '../server/favicons.ts'
import * as localfile from '../server/localfile.ts'
import * as perflog from '../server/perflog.ts'
import * as perfreport from '../server/perfreport.ts'
import * as store from '../server/store.ts'
import * as updates from '../server/updates.ts'

describe('stockage', () => {
  it('écriture atomique, même JSON que la 1.x', () => {
    store.write('x.json', { a: 'é', b: [1, 2] })
    expect(fs.readFileSync(store.pathOf('x.json'), 'utf-8')).toBe('{\n  "a": "é",\n  "b": [\n    1,\n    2\n  ]\n}\n')
    expect(fs.existsSync(store.pathOf('x.json.tmp'))).toBe(false)
  })
  it('fichier abîmé : ligne et colonne', () => {
    fs.writeFileSync(store.pathOf('bad.json'), '{\n  "a": 1,\n  oups\n}')
    try {
      store.read('bad.json', {})
      throw new Error('aurait dû lever')
    } catch (e) {
      expect(e).toBeInstanceOf(store.Broken)
      expect((e as store.Broken).line).toBe(3)
    }
  })
  it('version : change avec le contenu, vide si absent', () => {
    expect(store.version('absent.json')).toBe('')
    store.write('v.json', { a: 1 })
    const v1 = store.version('v.json')
    store.write('v.json', { a: 2 })
    expect(store.version('v.json')).not.toBe(v1)
  })
  it('validation de config', () => {
    expect(store.validateConfig({ groups: [] })).toBeNull()
    expect(store.validateConfig([])).toContain('racine')
    expect(store.validateConfig({ groups: [{ name: 'g', links: [{ name: 'a' }] }] })).toContain('url manquant')
    expect(store.validateConfig({ groups: [], tabs: [{ id: 'a', label: 'A', url: 'u' }, { id: 'a', label: 'B', url: 'v' }] })).toContain('en double')
    expect(store.validateConfig({ groups: [], github_accounts: [{ id: 'a', merged_count: -1 }] })).toContain('entier positif')
    expect(store.validateConfig({ groups: [], features: { local: 'non' } })).toContain('vrai ou faux')
  })
})

describe("journal d'erreurs", () => {
  beforeEach(() => {
    errlog.clear()
    errlog.resetBurst()
  })
  it('masque les jetons', () => {
    errlog.record('serveur', 'vu', 'Bearer abcdefghijklmnop ghp_aaaaaaaaaaaaaaaaaaaaaaaaa ?token=xyz&a=1', 'GET /x')
    const [e] = errlog.listing()
    expect(e.detail).not.toContain('abcdefghijklmnop')
    expect(e.detail).not.toContain('ghp_aaaa')
    expect(e.detail).not.toContain('xyz')
  })
  it('une page qui boucle : trois entrées par minute au plus', () => {
    for (let i = 0; i < 10; i++) errlog.record('page', 'même erreur', 'pareil', 'ici')
    expect(errlog.listing().length).toBe(3)
  })
})

describe('journal des événements', () => {
  it('seq jamais réutilisé, même après un vidage', () => {
    events.record([events.event('a', 'info', 'x', 'un')])
    const seq = events.payload().seq
    events.clear()
    events.record([events.event('a', 'info', 'x', 'deux')])
    expect(events.payload().events[0].seq).toBe(seq + 1)
  })
  it('since ne rend que la suite', () => {
    const before = events.payload().seq
    events.record([events.event('a', 'info', 'x', 'trois'), events.event('a', 'info', 'x', 'quatre')])
    expect(events.payload(before).events.map((e) => e.title)).toEqual(['quatre', 'trois'])
  })
})

describe('changelog', () => {
  it('version, date, appli de bureau, puces sur plusieurs lignes', () => {
    const got = updates.parse('# Changelog\n\n## 2.0.0 — 2026-11-01\nAppli de bureau : 2.0.0\n\n- un\n  suite\n- deux\n\n## 1.9.0 — 2026-10-01\n- vieux\n')
    expect(got).toEqual([
      { version: '2.0.0', date: '2026-11-01', desktop: '2.0.0', items: ['un suite', 'deux'] },
      { version: '1.9.0', date: '2026-10-01', items: ['vieux'] },
    ])
  })
  it('comparaison de versions', () => {
    expect(updates.newer('1.10.0', '1.9.3')).toBe(true)
    expect(updates.newer('2.0.0', '2.0.0')).toBe(false)
  })
  it('instantané avant une nouvelle version, une seule fois', async () => {
    const backup = await import('../server/backup.ts')
    store.write(store.CONFIG, { groups: [] })
    store.write('version.json', { version: '0.0.1' })
    updates.onStart()
    expect(backup.listing().some((b) => b.reason.startsWith('avant-'))).toBe(true)
    const n = backup.listing().length
    updates.onStart()
    expect(backup.listing().length).toBe(n)
  })
})

describe('Mes sites : fichiers du disque', () => {
  let home: string
  const saved = process.env.HOST_MOUNT
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'hd-home-'))
    fs.mkdirSync(path.join(home, 'docs'))
    fs.mkdirSync(path.join(home, '.ssh'))
    fs.mkdirSync(path.join(home, 'autre-homedash'))
    fs.writeFileSync(path.join(home, 'docs', 'a.md'), '# a')
    fs.writeFileSync(path.join(home, 'docs', 'page.html'), '<script>x</script>')
    fs.writeFileSync(path.join(home, '.ssh', 'id'), 'cle')
    fs.writeFileSync(path.join(home, 'autre-homedash', 'secrets.json'), '{}')
    fs.symlinkSync('/etc', path.join(home, 'lien'))
    process.env.HOST_MOUNT = home
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.HOST_MOUNT
    else process.env.HOST_MOUNT = saved
    fs.rmSync(home, { recursive: true, force: true })
  })
  it('servis dans le dossier personnel seulement', () => {
    expect(localfile.locate('~/docs/a.md')).toBe(fs.realpathSync(path.join(home, 'docs', 'a.md')))
    expect(() => localfile.locate('~/.ssh/id')).toThrow('caché')
    expect(() => localfile.locate('~/lien/passwd')).toThrow('hors du dossier personnel')
    expect(() => localfile.locate('/etc/passwd')).toThrow()
    expect(() => localfile.locate('~/autre-homedash/secrets.json')).toThrow('homedash')
    expect(() => localfile.locate('')).toThrow('vide')
  })
  it("le profil de l'appli (cookies, stockage des sites) n'est jamais servi", () => {
    const profile = path.join(home, 'Library', 'homedash')
    fs.mkdirSync(path.join(profile, 'Local Storage'), { recursive: true })
    fs.writeFileSync(path.join(profile, 'Local Storage', 'x.log'), 'jeton')
    process.env.HOMEDASH_PROFILE_DIR = profile
    try {
      expect(() => localfile.locate('~/Library/homedash/Local Storage/x.log')).toThrow("dossier de l'appli")
      expect(localfile.locate('~/docs/a.md')).toBeTruthy()
    } finally {
      delete process.env.HOMEDASH_PROFILE_DIR
    }
  })
  it('ce qui exécute du code passe dans un sandbox', () => {
    const h = localfile.headers(localfile.locate('~/docs/page.html'))
    expect(h['Content-Security-Policy']).toContain('sandbox')
    expect(localfile.headers(localfile.locate('~/docs/a.md'))['Content-Type']).toBe('text/plain; charset=utf-8')
  })
  it('un dossier : sa liste, sans les cachés', () => {
    const html = localfile.listing(localfile.locate('~')).toString()
    expect(html).toContain('docs')
    expect(html).not.toContain('.ssh')
  })
})

describe('icônes', () => {
  afterEach(() => favicons.setOpen((url) => fetch(url)))
  it("un nom d'hôte seulement, jamais une adresse", async () => {
    await expect(favicons.get('https://evil/x')).rejects.toThrow()
    await expect(favicons.get('a b')).rejects.toThrow()
  })
  it('le site lui-même seulement pour un onglet de la config', async () => {
    favicons.clearCache()
    const asked: string[] = []
    favicons.setOpen(async (url) => {
      asked.push(url)
      return new Response('', { status: 404 })
    })
    await favicons.get('prive.example')
    expect(asked.some((u) => u.startsWith('https://prive.example'))).toBe(false)
    favicons.clearCache()
    await favicons.get('prive.example', undefined, new Set(['prive.example']))
    expect(asked).toContain('https://prive.example/favicon.ico')
  })
})

describe('journal de performance', () => {
  it("éteint, rien n'est écrit", () => {
    perflog.configure(false)
    expect(perflog.append('page', { kind: 'event' })).toBe(false)
  })
  it('allumé : une ligne, puis le résumé du jour', () => {
    perflog.configure(true)
    perflog.append('server', { kind: 'sample', rss_mb: 50, cpu_pct: 2, github_calls: 3, github_304: 4, local_scans: 1, ops: {}, requests: { 'GET /api/x': 2 } })
    const [day] = perfreport.report(perflog.perfDir(), 1)
    expect(day.server.samples).toBe(1)
    expect(day.server.routes).toEqual([{ route: 'GET /api/x', n: 2 }])
    expect(perfreport.text([day])).toContain('GitHub 3 appels')
    expect(() => perflog.append('autre', {})).toThrow('refusée')
    perflog.configure(false)
  })
  it('les routes sont comptées sans leurs valeurs', () => {
    expect(perflog.route('/api/github/user/ada?x=1')).toBe('/api/github/user/*')
    expect(perflog.route('/index.html')).toBe('(page)')
  })
})
