/** Basecamp : lecture seule, secrets jamais servis, journal amorcé sans bruit. */

import fs from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'

import * as basecamp from '../server/basecamp.ts'
import * as events from '../server/events.ts'
import * as store from '../server/store.ts'

const HREF = 'https://3.basecampapi.com/123'
const IDENTITY = {
  identity: { first_name: 'Ada', last_name: 'L' },
  accounts: [
    { product: 'bcx', id: 1, name: 'Ancien', href: 'https://basecamp.com/1' },
    { product: 'bc3', id: 123, name: 'Ma boîte', href: HREF, app_href: 'https://3.basecamp.com/123' },
  ],
}

const task = (i: number, title = 'Tâche') => ({
  id: i,
  content: title,
  app_url: `https://3.basecamp.com/123/todos/${i}`,
  bucket: { name: 'Projet', app_url: 'https://3.basecamp.com/123/buckets/9' },
  parent: { title: 'Liste', app_url: 'https://3.basecamp.com/123/todolists/8' },
  due_on: '2026-10-20',
  children: [],
})
const notif = (i: number, updated = '2026-10-20T08:00:00Z') => ({
  id: i,
  title: `Message ${i}`,
  app_url: `https://3.basecamp.com/123/m/${i}`,
  bucket_name: 'Projet',
  section: 'inbox',
  creator: { name: 'Bob' },
  content_excerpt: 'Bonjour',
  unread_count: 1,
  updated_at: updated,
  readable_sgid: 'sgid-secret-ish',
})
const card = (i: number, column = 55) => ({
  id: i,
  content: `Carte ${i}`,
  type: 'Kanban::Card',
  app_url: `https://3.basecamp.com/123/buckets/9/card_tables/cards/${i}`,
  bucket: { id: 9, name: 'Projet' },
  parent: { title: 'En cours', app_url: `https://3.basecamp.com/123/buckets/9/card_tables/columns/${column}` },
  children: [],
})
const BOARD = {
  id: 77,
  title: 'Sprint',
  app_url: 'https://3.basecamp.com/123/buckets/9/card_tables/77',
  lists: [
    { id: 54, title: 'À faire', type: 'Kanban::Column' },
    { id: 55, title: 'En cours', type: 'Kanban::Column', color: 'blue' },
    { id: 56, title: 'Fait', type: 'Kanban::DoneColumn' },
  ],
}

type Sent = { method: string; url: string; body: string | null; headers: Record<string, string> }

/** Remplace le réseau : répond selon l'adresse et garde chaque requête. */
class Fake {
  requests: Sent[] = []
  assignments: any = { priorities: [task(1)], non_priorities: [task(2)] }
  readings: any = { unreads: [notif(10)], reads: [] }
  status: Record<string, number> = {}
  links: Record<string, string> = {}
  extra: Record<string, unknown> = {}
  files: Record<string, [string, string] | { redirect: string }> = {}

  open = async (url: string, init: RequestInit): Promise<Response> => {
    const method = (init.method || 'GET').toUpperCase()
    this.requests.push({ method, url, body: (init.body as string) ?? null, headers: { ...(init.headers as Record<string, string>) } })
    const file = this.files[url]
    if (file) {
      if ('redirect' in file) return new Response(null, { status: 302, headers: { Location: file.redirect } })
      return new Response(file[1], { headers: { 'Content-Type': file[0] } })
    }
    const code = this.status[new URL(url).pathname]
    if (code) return new Response('', { status: code })
    let body: unknown
    if (url === basecamp.TOKEN_URL) body = { access_token: 'AT-' + this.requests.length, refresh_token: 'RT', expires_in: 1209600 }
    else if (url === basecamp.IDENTITY_URL) body = IDENTITY
    else if (url.endsWith(basecamp.ASSIGNMENTS)) body = this.assignments
    else if (url.endsWith(basecamp.READINGS)) body = this.readings
    else if (url.includes('/card_tables/columns/')) body = { id: 55, parent: { url: `${HREF}/card_tables/77.json` } }
    else if (url.endsWith('/card_tables/77.json')) body = BOARD
    else if (url in this.extra) body = this.extra[url]
    else if (url.includes('/search.json?'))
      body = [
        { id: 3, type: 'Todo', title: 'Bug congés', plain_text_content: 'Bug congés', app_url: 'https://3.basecamp.com/123/buckets/9/todos/3', status: 'active', bucket: { name: 'IT' }, parent: { title: 'Demandes' }, due_on: '2026-11-02' },
        { id: 4, type: 'Comment', title: 'Re: Bug congés', status: 'active', plain_text_content: 'Corrigé  dans\nla 2.3', creator: { name: 'Flo' }, app_url: 'https://3.basecamp.com/123/buckets/9/todos/3#__recording_4' },
        { id: 5, type: 'Todo', title: 'sans adresse' },
        { id: 6, type: 'Todo', title: 'Vieux bug congés', status: 'archived', app_url: 'https://3.basecamp.com/123/buckets/9/todos/6' },
      ]
    else if (url.endsWith('/buckets/9/todos/2.json'))
      body = { id: 2, title: 'Tâche 2', comments_count: 1, description: '<div>Refaire la <strong>page</strong> :<ul><li>logo</li><li><a href="https://x.fr">lien</a></li></ul></div>' }
    else if (method === 'POST' && url.endsWith('/buckets/9/recordings/5/comments.json'))
      body = { id: 900, app_url: 'https://3.basecamp.com/123/buckets/9/card_tables/cards/5#__recording_900' }
    else if (url.endsWith('/buckets/9/recordings/2/comments.json?page=2')) body = [{ id: 32, creator: { name: 'Max' }, created_at: '2026-10-23T09:00:00Z', content: '<div>Fait.</div>' }]
    else if (url.endsWith('/buckets/9/recordings/2/comments.json'))
      body = [{ id: 31, creator: { name: 'Flo' }, created_at: '2026-10-22T09:00:00Z', content: '<div>Pour vendredi&nbsp;!</div>' }]
    else throw new Error(`URL inattendue : ${url}`)
    return new Response(JSON.stringify(body), { headers: url in this.links ? { Link: this.links[url] } : {} })
  }
}

let net: Fake
let seq0 = 0
const recorded = () => events.payload().events.filter((e) => (e.seq || 0) > seq0)

const connect = async () => {
  basecamp.setApp('cid', 'CSECRET', 'https://monsite.fr/oauth')
  await basecamp.exchange('CODE')
}
const build = () => basecamp.rebuild()

beforeEach(() => {
  store.writeSecret(basecamp.SECRET_KEY, null)
  basecamp.resetAll()
  net = new Fake()
  basecamp.setOpen(net.open)
  seq0 = events.payload().seq
})

describe('coupé dans Réglages → Fonctionnalités', () => {
  it('ne lit plus rien et garde la connexion', async () => {
    await connect()
    await build()
    basecamp.setEnabled(false)
    const before = net.requests.length
    expect(basecamp.kickoff()).toBe(false)
    expect(await basecamp.search('congés')).toEqual([])
    expect(net.requests.length).toBe(before)
    const p = basecamp.payload()
    expect([p.configured, p.enabled]).toEqual([false, false])
    expect(p.tasks).toEqual({ priorities: [], others: [] })
    expect(p.unreads).toEqual([])
    // Rallumé : connexion gardée, et ce qui a bougé entre-temps ne sonne pas.
    net.assignments.priorities.push(task(3, 'Nouvelle'))
    basecamp.setEnabled(true)
    expect(basecamp.connected()).toBe(true)
    seq0 = events.payload().seq
    await build()
    expect(recorded()).toEqual([])
    expect(basecamp.payload().enabled).toBe(true)
  })
})

describe('lecture seule', () => {
  it('Basecamp ne reçoit que des GET', async () => {
    net.assignments.non_priorities.push(card(5))
    await connect()
    await build()
    await build()
    // jeton proche de l'expiration : renouvellement compris dans le parcours
    store.writeSecret(basecamp.SECRET_KEY, { ...store.readSecret<any>(basecamp.SECRET_KEY), expires_at: 0 })
    await build()
    expect(net.requests.length).toBeGreaterThan(0)
    for (const r of net.requests) {
      if (r.url === basecamp.TOKEN_URL) {
        expect(r.method).toBe('POST')
        continue
      }
      expect(r.method, r.url).toBe('GET')
      expect(r.body, r.url).toBeNull()
    }
    const read = new Set(net.requests.filter((r) => r.url.startsWith(HREF)).map((r) => new URL(r.url).pathname))
    expect(read).toEqual(new Set(['/123' + basecamp.ASSIGNMENTS, '/123' + basecamp.READINGS, '/123/card_tables/columns/55.json', '/123/card_tables/77.json']))
  })
  it("aucune fonction d'écriture n'existe", () => {
    const src = fs.readFileSync(new URL('../server/basecamp.ts', import.meta.url), 'utf-8')
    for (const verb of ["'PUT'", "'DELETE'", "'PATCH'", '"PUT"', '"DELETE"', '"PATCH"', '/my/unreads', '/my/priorities', 'completion']) expect(src).not.toContain(verb)
  })
})

describe("contenu d'une tâche", () => {
  it('description et échanges, en GET seulement', async () => {
    await connect()
    const before = net.requests.length
    const got = await basecamp.taskText('https://3.basecamp.com/123/buckets/9/todos/2')
    expect(got.text).toContain('Refaire la **page** :')
    expect(got.text).toContain('- logo')
    expect(got.text).toContain('- [lien](https://x.fr)')
    expect(got.text).not.toContain('Flo')
    expect(got.comments).toEqual([{ id: 31, who: 'Flo', date: '2026-10-22', text: 'Pour vendredi !' }])
    const done = net.requests.slice(before)
    expect(new Set(done.map((r) => r.method))).toEqual(new Set(['GET']))
    expect(done.every((r) => r.url.startsWith(HREF))).toBe(true)
  })
  it('les pièces jointes deviennent des liens Basecamp', () => {
    const text = basecamp.htmlText(
      '<div><bc-attachment url="https://preview.3.basecamp.com/1/blobs/k/previews/full" content-type="image/png" filename="Capture [1].png"></bc-attachment><bc-attachment filename="devis.pdf"></bc-attachment></div>',
    )
    expect(text).toContain('[🖼 Capture (1).png](<https://preview.3.basecamp.com/1/blobs/k/previews/full>) (sur Basecamp)')
    expect(text).toContain('📎 devis.pdf (sur Basecamp)')
  })
  it('les commentaires suivent les pages sans jamais quitter le compte', async () => {
    await connect()
    const first = `${HREF}/buckets/9/recordings/2/comments.json`
    net.links[first] = `<${first}?page=2>; rel="next"`
    expect((await basecamp.taskText('https://3.basecamp.com/123/buckets/9/todos/2')).comments.map((c: any) => c.who)).toEqual(['Flo', 'Max'])
    net.links[first] = '<https://evil.example/comments.json?page=2>; rel="next"'
    const before = net.requests.length
    expect((await basecamp.taskText('https://3.basecamp.com/123/buckets/9/todos/2')).comments.map((c: any) => c.who)).toEqual(['Flo'])
    expect(net.requests.slice(before).some((r) => r.url.includes('evil'))).toBe(false)
  })
  it('les images renvoient à leur adresse de téléchargement', async () => {
    await connect()
    net.extra[`${HREF}/buckets/9/todos/7.json`] = {
      id: 7,
      description:
        '<div><bc-attachment sgid="S1" url="https://preview.3.basecamp.com/b/1" content-type="image/png" filename="a.png"></bc-attachment><bc-attachment sgid="S2" url="https://preview.3.basecamp.com/b/2" content-type="application/pdf" filename="d.pdf"></bc-attachment></div>',
      description_attachments: [
        { sgid: 'S1', download_url: `${HREF}/blobs/k1/download/a.png` },
        { sgid: 'S2', download_url: `${HREF}/blobs/k2/download/d.pdf` },
      ],
    }
    expect((await basecamp.taskText('https://3.basecamp.com/123/buckets/9/todos/7')).images).toEqual({ 'https://preview.3.basecamp.com/b/1': `${HREF}/blobs/k1/download/a.png` })
  })
  it('pièce jointe : seulement du compte, seulement une image, jeton jamais redirigé', async () => {
    await connect()
    const before = net.requests.length
    for (const url of ['https://evil.example/blobs/x', `${HREF}/buckets/9/todos/2.json`, '']) await expect(basecamp.attachment(url)).rejects.toThrow(RangeError)
    expect(net.requests.length).toBe(before)
    const ok = `${HREF}/blobs/k1/download/a.png`
    const moved = `${HREF}/blobs/k4/download/b.png`
    net.files = {
      [ok]: ['image/png', 'PNG'],
      [`${HREF}/blobs/k3/download/x.svg`]: ['image/svg+xml', '<svg/>'],
      [moved]: { redirect: 'https://storage.example/signed/b.png' },
      'https://storage.example/signed/b.png': ['image/png', 'B'],
    }
    const [ctype, data] = await basecamp.attachment(ok)
    expect([ctype, data.toString()]).toEqual(['image/png', 'PNG'])
    await expect(basecamp.attachment(`${HREF}/blobs/k3/download/x.svg`)).rejects.toThrow(RangeError)
    expect((await basecamp.attachment(moved))[1].toString()).toBe('B')
    const storage = net.requests.find((r) => r.url.startsWith('https://storage.example'))
    expect(storage?.headers.Authorization).toBeUndefined()
    expect(net.requests.find((r) => r.url === moved)?.headers.Authorization).toBeDefined()
  })
  it("refuse tout sauf une adresse de tâche", async () => {
    await connect()
    const before = net.requests.length
    for (const url of ['https://evil.example/x', '', 'https://3.basecamp.com/123/buckets/9/messages/2']) await expect(basecamp.taskText(url)).rejects.toThrow(RangeError)
    expect(net.requests.length).toBe(before)
  })
})

describe('recherche', () => {
  it('lit en GET et garde ce que la page affiche', async () => {
    await connect()
    const before = net.requests.length
    const got = await basecamp.search('  bug   congés ')
    expect(got.map((i) => i.id)).toEqual([3, 4])
    const [todo, comment] = got
    expect([todo.project, todo.parent, todo.due_on, todo.excerpt]).toEqual(['IT', 'Demandes', '2026-11-02', ''])
    expect([comment.excerpt, comment.creator]).toEqual(['Corrigé dans la 2.3', 'Flo'])
    const done = net.requests.slice(before)
    expect(done.length).toBe(1)
    expect([done[0].method, done[0].body]).toEqual(['GET', null])
    expect(new URL(done[0].url).searchParams.get('q')).toBe('bug congés')
    await basecamp.search('Bug Congés')
    expect(net.requests.length).toBe(before + 1)
  })
  it('deux caractères et une connexion', async () => {
    expect(await basecamp.search('bug')).toEqual([])
    await connect()
    const before = net.requests.length
    expect(await basecamp.search(' b ')).toEqual([])
    expect(net.requests.length).toBe(before)
  })
})

describe("rapport d'une issue (seule écriture)", () => {
  const ISSUE = {
    repo: 'org/api',
    number: 7,
    url: 'https://github.com/org/api/issues/7',
    bc_url: 'https://3.basecamp.com/123/buckets/9/card_tables/cards/5',
    report: {
      id: 41,
      body: '**Fait**',
      html: '<p class="x"><strong>Fait</strong> <a href="javascript:alert(1)">piège</a><a href="https://ok.fr">lien</a></p><script>alert(1)</script><h2 onclick="x()">Suite</h2><pre><code>a &lt; b</code></pre>',
    },
  }
  const prepare = async () => {
    store.write(store.BC_POSTED, {})
    await connect()
    return net.requests.length
  }

  it('publié une seule fois, sur les commentaires de la tâche', async () => {
    const before = await prepare()
    const got = await basecamp.publishReport(ISSUE)
    const again = await basecamp.publishReport(ISSUE)
    expect(got).toEqual(again)
    expect(got.url).toContain('#__recording_900')
    const done = net.requests.slice(before)
    expect(done.length).toBe(1)
    expect([done[0].method, done[0].url]).toEqual(['POST', `${HREF}/buckets/9/recordings/5/comments.json`])
    const content: string = JSON.parse(done[0].body as string).content
    expect(content.startsWith('<div><strong>Fait</strong> piège<a href="https://ok.fr">lien</a></div>')).toBe(true)
    for (const bad of ['script', 'javascript', 'onclick', 'class=', 'alert']) expect(content).not.toContain(bad)
    expect(content).toContain('lien</a></div><div><br></div><h1>Suite</h1><div><br></div><pre>a &lt; b</pre>')
    expect(content).toContain('<a href="https://github.com/org/api/issues/7">org/api #7</a>')
    expect(basecamp.payload().posted['41'].url).toBe(got.url)
  })
  it('deux clics simultanés : un seul commentaire', async () => {
    const before = await prepare()
    await Promise.all([basecamp.publishReport(ISSUE), basecamp.publishReport(ISSUE)])
    expect(net.requests.slice(before).length).toBe(1)
  })
  it("écarter n'envoie rien et se défait", async () => {
    const before = await prepare()
    expect(basecamp.dismiss(ISSUE)['org/api#7'].dismissed).toBe(true)
    expect(basecamp.dismiss(ISSUE, true)).not.toHaveProperty('org/api#7')
    expect(net.requests.length).toBe(before)
  })
  it("exige une adresse de tâche et un rapport", async () => {
    const before = await prepare()
    await expect(basecamp.publishReport({ ...ISSUE, bc_url: 'https://evil.example/x' })).rejects.toThrow(RangeError)
    await expect(basecamp.publishReport({ ...ISSUE, report: null })).rejects.toThrow(RangeError)
    expect(net.requests.length).toBe(before)
  })
})

describe('kanban', () => {
  it('les cartes ont leur tableau et ses colonnes, dans l\'ordre', async () => {
    net.assignments.non_priorities.push(card(5))
    await connect()
    await build()
    await build()
    const p = basecamp.payload()
    const c = p.tasks.others.find((t: any) => t.id === 5)
    expect([c.kind, c.column_id, c.board_id]).toEqual(['card', 55, 77])
    expect(p.boards['77'].columns.map((x: any) => x.title)).toEqual(['À faire', 'En cours', 'Fait'])
    const todo = p.tasks.others.find((t: any) => t.id === 2)
    expect([todo.kind, todo.column_id]).toEqual(['todo', null])
    expect(net.requests.filter((r) => r.url.includes('/card_tables/columns/')).length).toBe(1)
  })
  it('un tableau illisible ne casse pas les tâches', async () => {
    net.assignments.non_priorities.push(card(5))
    net.status['/123/card_tables/77.json'] = 403
    await connect()
    await build()
    const p = basecamp.payload()
    expect(p.error).toBeNull()
    expect(p.boards).toEqual({})
    expect(p.tasks.others.length).toBe(2)
  })
})

describe('secrets et OAuth', () => {
  it('les secrets ne sortent jamais de secrets.json', async () => {
    await connect()
    await build()
    const out = JSON.stringify([basecamp.status(), basecamp.payload()])
    for (const secret of ['CSECRET', 'AT-', 'RT', 'sgid-secret-ish']) expect(out).not.toContain(secret)
    expect(basecamp.status().account).toBe('Ma boîte')
  })
  it('un secret vide garde le précédent', async () => {
    await connect()
    basecamp.setApp('cid', '', 'https://monsite.fr/oauth')
    let s = store.readSecret<any>(basecamp.SECRET_KEY)
    expect(s.client_secret).toBe('CSECRET')
    expect(s.access_token).toBeTruthy()
    basecamp.setApp('cid', '', 'https://autre.fr/oauth')
    s = store.readSecret<any>(basecamp.SECRET_KEY)
    expect(s.redirect_uri).toBe('https://autre.fr/oauth')
    expect(s.access_token).toBeTruthy()
    basecamp.setApp('autre', '', 'https://monsite.fr/oauth')
    expect(store.readSecret<any>(basecamp.SECRET_KEY).access_token).toBeFalsy()
  })
  it("se déconnecter garde l'appli", async () => {
    await connect()
    basecamp.disconnect()
    expect([basecamp.status().configured, basecamp.status().connected]).toEqual([true, false])
  })
  it('le state est exigé et à usage unique', () => {
    basecamp.setApp('cid', 's', 'https://monsite.fr/oauth')
    const st = new URL(basecamp.authorizeUrl()).searchParams.get('state')
    expect(basecamp.checkState('inventé')).toBe(false)
    expect(basecamp.checkState(st)).toBe(true)
    expect(basecamp.checkState(st)).toBe(false)
  })
  it("l'adresse de retour entière est acceptée", () => {
    expect(basecamp.parseCode('  abc ')).toEqual(['abc', null])
    expect(basecamp.parseCode('https://x.test/cb?code=abc&state=st')).toEqual(['abc', 'st'])
  })
  it('jeton expiré : un seul renouvellement sur 401', async () => {
    await connect()
    net.status['/123' + basecamp.ASSIGNMENTS] = 401
    await build()
    expect(basecamp.payload().error).toContain('HTTP 401')
    expect(net.requests.filter((r) => r.method === 'POST').length).toBe(2)
  })
  it('les liens de l\'API deviennent des liens du site', () => {
    const boost = { ...notif(13), type: 'BoostReport', app_url: 'https://3.basecampapi.com/123/my/boosts' }
    expect(basecamp.normalizeUnreads({ unreads: [boost] })[0].url).toBe('https://app.basecamp.com/123/my/boosts')
    expect(basecamp.webUrl('https://3.basecampapi.com/123/buckets/9/todos/4.json', 'https://3.basecamp.com')).toBe('https://3.basecamp.com/123/buckets/9/todos/4')
    expect(basecamp.webUrl('https://app.basecamp.com/123/m/1')).toBe('https://app.basecamp.com/123/m/1')
  })
  it('les liens suivent le site du compte', async () => {
    net.readings.unreads.push({ ...notif(14), app_url: 'https://3.basecampapi.com/123/my/boosts' })
    await connect()
    await build()
    expect(basecamp.payload().unreads.map((n: any) => n.url)).toContain('https://3.basecamp.com/123/my/boosts')
  })
})

describe('journal', () => {
  it('première lecture muette, puis seulement les nouveautés', async () => {
    await connect()
    await build()
    expect(recorded()).toEqual([])
    expect(basecamp.payload().tasks.priorities.length).toBe(1)
    net.assignments.non_priorities.push(task(3, 'Nouvelle'))
    net.readings.unreads.push(notif(11))
    await build()
    expect(recorded().map((e) => e.kind).sort()).toEqual(['bc-notif', 'bc-task'])
    expect(recorded().every((e) => e.source === 'basecamp')).toBe(true)
    seq0 = events.payload().seq
    await build()
    expect(recorded()).toEqual([])
  })
  it('se reconnecter réamorce', async () => {
    await connect()
    await build()
    await connect()
    net.readings.unreads.push(notif(12))
    await build()
    expect(recorded()).toEqual([])
  })
})
