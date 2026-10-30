/** Trello : jeton jamais servi, lecture seule, journal amorcé sans bruit (portage de tests/test_trello.py). */

import { beforeEach, describe, expect, it } from 'vitest'

import * as events from '../server/events.ts'
import { GitHubAccount, setFetch, setIssueSources, trReport } from '../server/github.ts'
import * as store from '../server/store.ts'
import * as trello from '../server/trello.ts'

const KEY = 'api-key-test'
const TOKEN = 'token-secret-test'

const card = (i: number, closed = false, due = '2026-10-20T12:00:00.000Z') => ({
  id: `id${i}`,
  name: `Carte ${i}`,
  shortLink: `sl${i}`,
  shortUrl: `https://trello.com/c/sl${i}`,
  closed,
  due,
  dueComplete: false,
  pos: i,
  idBoard: 'b1',
  idList: 'l1',
  badges: { comments: 2, checkItems: 4, checkItemsChecked: 1 },
  board: { id: 'b1', name: 'Sprint', shortUrl: 'https://trello.com/b/xx/sprint' },
  list: { id: 'l1', name: 'En cours', pos: 10 },
})
const notif = (i: number, date = '2026-10-20T08:00:00.000Z') => ({
  id: `n${i}`,
  unread: true,
  type: 'commentCard',
  date,
  data: { text: 'bonjour', card: { name: 'Carte 1', shortLink: 'sl1', shortUrl: 'https://trello.com/c/sl1' }, board: { name: 'Sprint' } },
  memberCreator: { fullName: 'Bob' },
  display: { translation: 'Bob a commenté Carte 1' },
})

type Sent = { method: string; url: string; body: string | null; headers: Record<string, string> }

/** Remplace le réseau : répond selon l'adresse et garde chaque requête. */
class Fake {
  requests: Sent[] = []
  member: any = { fullName: 'Ada L', username: 'ada' }
  memberCode = 200
  cards: any[] = [card(1), card(2, true)]
  cardsCode = 200
  boardCards: any[] | null = null
  boards: any[] = [{ id: 'b1', name: 'Sprint', shortUrl: 'https://trello.com/b/xx/sprint', lists: [{ id: 'l1', name: 'En cours', pos: 10 }] }]
  notifs: any[] = [notif(1)]
  searchBody: any = { cards: [], actions: [], boards: [] }
  searchCode = 200
  cardBody: any = {}
  commentBody: any = { id: 'c1', data: { card: { shortUrl: 'https://trello.com/c/sl1' } } }
  files: Record<string, [string, Buffer] | { redirect: string }> = {}

  open = async (url: string, init: RequestInit): Promise<Response> => {
    this.requests.push({ method: (init.method || 'GET').toUpperCase(), url, body: (init.body as string) ?? null, headers: { ...(init.headers as Record<string, string>) } })
    const json = (code: number, body: unknown, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), { status: code, headers: { 'content-type': 'application/json', ...headers } })
    const file = this.files[url]
    if (file) {
      if ('redirect' in file) return new Response(null, { status: 302, headers: { Location: file.redirect } })
      return new Response(file[1], { headers: { 'content-type': file[0] } })
    }
    if (url.includes('/members/me/boards')) return json(200, this.boards)
    if (url.includes('/boards/') && !url.includes('/cards/')) {
      const board = { ...(this.boards[0] || { id: 'b1', name: 'Sprint' }) }
      board.cards = (this.boardCards ?? this.cards).filter((c) => !c.closed)
      return json(200, board)
    }
    if (url.includes('/members/me/cards')) return json(this.cardsCode, this.cards, this.cardsCode === 429 ? { 'retry-after': '12' } : {})
    if (url.includes('/notifications')) return json(200, this.notifs)
    if (url.includes('/members/me')) return json(this.memberCode, this.member)
    if (url.includes('/search?')) return json(this.searchCode, this.searchBody)
    if (url.includes('/actions/comments')) return json(200, this.commentBody)
    if (url.includes('/cards/')) return json(200, this.cardBody)
    return json(404, {})
  }
}

let fake: Fake
const posts = () => fake.requests.filter((r) => r.method === 'POST')

beforeEach(() => {
  store.writeSecret(trello.SECRET_KEY, null)
  store.write(store.TR_POSTED, {})
  trello.resetAll()
  fake = new Fake()
  trello.setOpen(fake.open)
})

const connect = () => store.writeSecret(trello.SECRET_KEY, { api_key: KEY, token: TOKEN, name: 'Ada', username: 'ada' })

describe('connexion', () => {
  it('le statut ne montre ni clé ni jeton ; le jeton part en en-tête OAuth, jamais dans l’adresse', async () => {
    trello.setKey(KEY)
    await trello.connect(TOKEN)
    const st = trello.status()
    expect(st.connected).toBe(true)
    expect(st.name).toBe('Ada L')
    const blob = JSON.stringify(st)
    for (const s of [KEY, TOKEN]) expect(blob).not.toContain(s)
    const req = fake.requests[fake.requests.length - 1]
    expect(req.url).not.toContain('token=')
    expect(req.url).not.toContain(TOKEN)
    expect(req.headers.Authorization).toContain('OAuth')
  })
  it('autorisation : read,write, sans expiration, jamais « account »', () => {
    trello.setKey(KEY)
    const q = new URL(trello.authorizeUrl()).searchParams
    expect([q.get('scope'), q.get('expiration'), q.get('response_type')]).toEqual(['read,write', 'never', 'token'])
    expect(q.get('return_url')).toBeNull()
  })
  it('un jeton refusé n’est pas gardé', async () => {
    trello.setKey(KEY)
    fake.memberCode = 401
    await expect(trello.connect(TOKEN)).rejects.toThrow(RangeError)
    expect(trello.connected()).toBe(false)
    expect(JSON.stringify(store.readSecret(trello.SECRET_KEY))).not.toContain(TOKEN)
  })
  it('oublier efface tout ; se déconnecter garde la clé', async () => {
    trello.setKey(KEY)
    await trello.connect(TOKEN)
    trello.disconnect()
    expect([trello.configured(), trello.connected()]).toEqual([true, false])
    trello.forget()
    expect(trello.configured()).toBe(false)
    expect(store.readSecret(trello.SECRET_KEY)).toBeUndefined()
  })
  it('clé vide : on garde l’actuelle ; une autre clé oublie le jeton', async () => {
    trello.setKey(KEY)
    await trello.connect(TOKEN)
    trello.setKey('  ')
    expect(trello.connected()).toBe(true)
    trello.setKey('autre-cle')
    const s = store.readSecret<any>(trello.SECRET_KEY)
    expect(s.api_key).toBe('autre-cle')
    expect(s).not.toHaveProperty('token')
  })
})

describe('lecture', () => {
  beforeEach(() => {
    connect()
    events.reset()
  })
  const seq0 = () => events.payload().seq

  it('coupé : rien n’est lu, le jeton est gardé', async () => {
    trello.setEnabled(false)
    expect(trello.kickoff()).toBe(false)
    expect(await trello.search('bonjour')).toEqual([])
    const p = trello.payload()
    expect([p.cards, p.unreads, p.enabled, p.configured]).toEqual([[], [], false, false])
    expect(trello.connected()).toBe(true)
    expect(fake.requests).toEqual([])
  })
  it('échéance terminée : la carte reste, marquée faite', () => {
    const raw = { ...card(1), dueComplete: true }
    const got = trello.normalizeCards([raw])
    expect([got.length, got[0].due_complete, got[0].due]).toEqual([1, true, raw.due])
  })
  it('carte fermée écartée ; tableau, liste et badges repris', () => {
    const got = trello.normalizeCards([card(1), card(2, true)])
    expect(got.map((c) => c.short_link)).toEqual(['sl1'])
    expect([got[0].board, got[0].list, got[0].comments, got[0].checks_done]).toEqual(['Sprint', 'En cours', 2, 1])
  })
  it('fond de tableau : seulement l’hôte des fonds Trello, en https, sans identifiants ni caractères piégés', () => {
    const bg = (url: unknown, brightness?: string) => trello.background({ prefs: { backgroundImage: url, backgroundBrightness: brightness } })
    expect(bg('https://evil.example/a.jpg', 'dark')).toEqual(['', 'dark'])
    expect(bg('http://trello-backgrounds.s3.amazonaws.com/a.jpg')[0]).toBe('')
    expect(bg('https://u:secret@trello-backgrounds.s3.amazonaws.com/a.jpg')[0]).toBe('')
    expect(bg('https://trello-backgrounds.s3.amazonaws.com/a.jpg") , url(x')[0]).toBe('')
    expect(bg('https://trello-backgrounds.s3.amazonaws.com/a.jpg', 'bizarre')).toEqual(['https://trello-backgrounds.s3.amazonaws.com/a.jpg', ''])
  })
  it('un tableau montre toutes les cartes visibles, pas une liste archivée', async () => {
    fake.boards = [{ id: 'b1', name: 'Sprint', lists: [{ id: 'l1', name: 'À faire', pos: 1 }, { id: 'l2', name: 'Fait', pos: 2 }, { id: 'l-old', name: 'Vieux', pos: 3, closed: true }] }]
    fake.cards = [card(1), { ...card(6), idList: 'l-old' }]
    fake.boardCards = [card(1), { ...card(4), idList: 'l2' }]
    await trello.rebuild()
    const got = Object.fromEntries(trello.payload().cards.map((c: any) => [c.short_link, c]))
    expect(new Set(Object.keys(got))).toEqual(new Set(['sl1', 'sl4', 'sl6']))
    expect([got.sl1.mine, got.sl4.mine, got.sl6.mine]).toEqual([true, false, true])
    expect(trello.payload().boards[0].lists.map((l: any) => l.id)).toEqual(['l1', 'l2'])
  })
  it('première lecture muette, seulement des GET', async () => {
    const before = seq0()
    await trello.rebuild()
    expect(events.payload().seq).toBe(before)
    expect(fake.requests.length).toBeGreaterThan(0)
    expect(fake.requests.every((r) => r.method === 'GET')).toBe(true)
    expect(trello.payload().cards.length).toBe(1)
  })
  it('lecture suivante : seulement la nouvelle carte et la nouvelle notif', async () => {
    await trello.rebuild()
    fake.cards = [card(1), card(3)]
    fake.notifs = [notif(1), notif(2, '2026-10-21T08:00:00.000Z')]
    const before = seq0()
    await trello.rebuild()
    const fresh = events.payload().events.filter((e) => (e.seq || 0) > before)
    expect(fresh.map((e) => e.kind).sort()).toEqual(['tr-notif', 'tr-task'])
    expect(fresh.every((e) => e.source === 'trello')).toBe(true)
    const again = seq0()
    await trello.rebuild()
    expect(seq0()).toBe(again)
  })
  it("la nouvelle carte d'un autre ne sonne pas", async () => {
    await trello.rebuild()
    fake.boardCards = [card(1), card(9)]
    const before = seq0()
    await trello.rebuild()
    expect(seq0()).toBe(before)
  })
  it('limite de Trello : pas de nouvel essai immédiat', async () => {
    fake.cardsCode = 429
    await trello.rebuild()
    expect(fake.requests.length).toBe(1)
    expect(trello.status().error).toContain('limite')
  })
  it('recherche gardée une minute, et rien si déconnecté', async () => {
    fake.searchBody = { cards: [card(1)], actions: [], boards: [] }
    await trello.search('carte')
    await trello.search('Carte')
    expect(fake.requests.length).toBe(1)
    trello.disconnect()
    expect(await trello.search('autre')).toEqual([])
    expect(fake.requests.length).toBe(1)
  })
  it('recherche limitée : un seul appel', async () => {
    fake.searchCode = 429
    await expect(trello.search('carte')).rejects.toThrow()
    expect(fake.requests.length).toBe(1)
  })
  it('contenu d’une carte, et images seulement de Trello et déjà vues', async () => {
    const before = fake.requests.length
    await expect(trello.attachment('https://evil.example/a.png')).rejects.toThrow(RangeError)
    await expect(trello.attachment('https://trello.com/1/cards/sl1/a.png')).rejects.toThrow(RangeError) // jamais vue
    expect(fake.requests.length).toBe(before)
    fake.cardBody = {
      desc: 'voir',
      checklists: [{ name: 'L', checkItems: [{ name: 'a', state: 'complete' }] }],
      actions: [{ id: 'a1', type: 'commentCard', memberCreator: { fullName: 'Bob' }, date: '2026-10-20T08:00:00Z', data: { text: 'ok' } }],
      attachments: [
        { name: 'a.png', url: 'https://trello.com/1/cards/sl1/a.png', mimeType: 'image/png' },
        { name: 'b.svg', url: 'https://trello.com/1/cards/sl1/b.svg', mimeType: 'image/svg+xml' },
        { name: 'c.png', url: 'https://evil.example/c.png', mimeType: 'image/png' },
      ],
    }
    const got = await trello.cardText('https://trello.com/c/sl1/1-carte')
    expect([got.text, got.checklists[0].items[0].completed, got.comments[0].who]).toEqual(['voir', true, 'Bob'])
    expect(Object.keys(got.images)).toEqual(['a.png'])
    await expect(trello.cardText('https://evil.example/c/sl1')).rejects.toThrow(RangeError)
    fake.files['https://trello.com/1/cards/sl1/a.png'] = ['image/png', Buffer.alloc(16 * 1024 * 1024)]
    await expect(trello.attachment('https://trello.com/1/cards/sl1/a.png')).rejects.toThrow()
  })
  it('image annoncée trop grosse : refusée sans lire le corps', async () => {
    connect()
    fake.cardBody = { attachments: [{ name: 'a.png', url: 'https://trello.com/1/cards/sl1/a.png', mimeType: 'image/png' }] }
    await trello.cardText('https://trello.com/c/sl1')
    let pulled = 0
    const body = new ReadableStream({
      pull(c) {
        pulled += 1
        c.enqueue(new Uint8Array(1024 * 1024))
      },
    })
    trello.setOpen(async () => new Response(body, { headers: { 'content-type': 'image/png', 'content-length': String(20 * 1024 * 1024) } }))
    await expect(trello.attachment('https://trello.com/1/cards/sl1/a.png')).rejects.toThrow()
    expect(pulled).toBeLessThanOrEqual(1)
  })
  it('image sans longueur annoncée : lecture coupée au plafond', async () => {
    connect()
    fake.cardBody = { attachments: [{ name: 'a.png', url: 'https://trello.com/1/cards/sl1/a.png', mimeType: 'image/png' }] }
    await trello.cardText('https://trello.com/c/sl1')
    let pulled = 0
    const body = new ReadableStream({
      pull(c) {
        pulled += 1
        c.enqueue(new Uint8Array(1024 * 1024))
      },
    })
    trello.setOpen(async () => new Response(body, { headers: { 'content-type': 'image/png' } }))
    await expect(trello.attachment('https://trello.com/1/cards/sl1/a.png')).rejects.toThrow()
    expect(pulled).toBeLessThan(20)
  })
  it('une redirection hors de Trello n’est pas suivie (le jeton ne part pas)', async () => {
    fake.cardBody = { attachments: [{ name: 'a.png', url: 'https://trello.com/1/cards/sl1/a.png', mimeType: 'image/png' }] }
    await trello.cardText('https://trello.com/c/sl1')
    fake.files['https://trello.com/1/cards/sl1/a.png'] = { redirect: 'https://evil.example/steal' }
    await expect(trello.attachment('https://trello.com/1/cards/sl1/a.png')).rejects.toThrow()
    expect(fake.requests.some((r) => r.url.includes('evil.example'))).toBe(false)
  })
})

describe('rapport sur la carte (seule écriture)', () => {
  const issue = () => ({ repo: 'org/api', number: 4, url: 'https://github.com/org/api/issues/4', tr_url: 'https://trello.com/c/sl1', report: { id: 9, body: 'Fait' } })
  beforeEach(connect)

  it('publié une fois ; écarter n’envoie rien', async () => {
    await trello.publishReport(issue())
    const again = await trello.publishReport(issue())
    expect(posts().length).toBe(1)
    expect(posts()[0].url).toContain('/cards/sl1/actions/comments')
    expect(posts()[0].url).not.toContain('token=')
    expect(again.url).toBe('https://trello.com/c/sl1')
    const n = fake.requests.length
    trello.dismiss({ repo: 'org/api', number: 8 })
    expect(fake.requests.length).toBe(n)
  })
  it('deux clics simultanés : un seul commentaire', async () => {
    await Promise.all([trello.publishReport(issue()), trello.publishReport(issue())])
    expect(posts().length).toBe(1)
  })
  it('un rapport trop long est coupé', async () => {
    await trello.publishReport({ ...issue(), report: { id: 10, body: 'x'.repeat(20000) } })
    expect(new URLSearchParams(posts()[0].body as string).get('text')?.length).toBeLessThanOrEqual(16384)
  })
  it('écarter se défait, sans rien envoyer', () => {
    trello.dismiss(issue())
    expect(trello.posted()['org/api#4'].dismissed).toBe(true)
    expect(trello.dismiss(issue(), true)).not.toHaveProperty('org/api#4')
    expect(posts()).toEqual([])
  })
  it('adresse de carte étrangère : refus sans envoi', async () => {
    await expect(trello.publishReport({ ...issue(), tr_url: 'https://evil.example/c/sl1' })).rejects.toThrow(RangeError)
    expect(posts()).toEqual([])
  })
})

describe('issues GitHub liées à Trello', () => {
  it('le rapport Trello se reconnaît à son marqueur', () => {
    const r = trReport([{ id: 1, body: '<!-- homedash:tr-report -->\nFait', user: { login: 'moi' } }, { id: 2, body: 'merci' }])
    expect([r?.id, r?.body]).toEqual([1, 'Fait'])
    expect(trReport([{ body: 'voir <!-- homedash:tr-report --> plus bas' }])).toBeNull()
  })
  it('listes séparées : une issue Trello ne va pas dans la liste Basecamp', async () => {
    const gh = new GitHubAccount() as any
    gh.configure({ me: 'moi', repos: ['org/api'] })
    gh.gh = async (p: string) =>
      p.endsWith('/comments')
        ? [{ id: 7, body: '<!-- homedash:tr-report -->\nok' }]
        : [
            { number: 1, title: 'tr', body: 'x <!-- homedash:tr https://trello.com/c/sl1 -->', comments: 1, state: 'open', updated_at: '2026-10-21' },
            { number: 2, title: 'bc', body: 'x <!-- homedash:bc https://3.basecamp.com/1/buckets/2/todos/3 -->', comments: 0, state: 'open', updated_at: '2026-10-20' },
          ]
    const calls: string[] = []
    const inner = gh.gh
    gh.gh = async (p: string, ...rest: unknown[]) => (calls.push(p), inner(p, ...rest))
    const [bc, tr] = await gh.fetchLinkedIssues('t')
    expect(calls.filter((p) => p.endsWith('/issues'))).toEqual(['/repos/org/api/issues'])
    expect(tr.map((i: any) => i.number)).toEqual([1])
    expect(tr[0].tr_url).toBe('https://trello.com/c/sl1')
    expect(tr[0].report.body).toBe('ok')
    expect(bc.map((i: any) => i.number)).toEqual([2])
  })
  it('ni Basecamp ni Trello : aucune issue lue', async () => {
    const gh = new GitHubAccount() as any
    gh.configure({ me: 'moi', repos: ['org/api'] })
    const calls: string[] = []
    gh.gh = async (p: string) => (calls.push(p), [])
    setIssueSources(() => ({ basecamp: false, trello: false }))
    try {
      expect(await gh.fetchLinkedIssues('t')).toEqual([[], []])
      expect(calls).toEqual([])
    } finally {
      setIssueSources(() => ({ basecamp: true, trello: true }))
    }
  })
  it('Trello seul : une issue Basecamp est ignorée', async () => {
    const gh = new GitHubAccount() as any
    gh.configure({ me: 'moi', repos: ['org/api'] })
    gh.gh = async () => [{ number: 2, title: 'bc', body: '<!-- homedash:bc https://3.basecamp.com/1/buckets/2/todos/3 -->', comments: 0 }]
    setIssueSources(() => ({ basecamp: false, trello: true }))
    try {
      expect(await gh.fetchLinkedIssues('t')).toEqual([[], []])
    } finally {
      setIssueSources(() => ({ basecamp: true, trello: true }))
    }
  })
  it('un rapport Trello sonne en Trello, pas en Basecamp', () => {
    const evs = new GitHubAccount().diff({ issues: [], tr_issues: [] }, { issues: [], tr_issues: [{ repo: 'org/api', number: 1, title: 't', url: 'u', report: { id: 5 } }] }, ['issues'])
    expect(evs.map((e) => [e.kind, e.source])).toEqual([['tr-report', 'trello']])
  })
  it('créer une issue avec le marqueur Trello la range dans la liste Trello seulement', async () => {
    const gh = new GitHubAccount()
    gh.configure({ me: 'moi', repos: ['org/api'] })
    gh.applyToken('t', 'ui')
    setFetch(async () => new Response(JSON.stringify({ number: 8, html_url: 'u8' }), { status: 201 }))
    await gh.createIssue('org/api', 'Titre', 'Besoin\n<!-- homedash:tr https://trello.com/c/sl1 -->')
    expect(gh.trIssues().issues.map((i) => i.number)).toEqual([8])
    expect(gh.bcIssues().issues).toEqual([])
    setFetch((i, init) => fetch(i, init))
  })
})
