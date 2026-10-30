/** Issues GitHub liées à une tâche Basecamp : marqueurs, rapport, création. Aucun appel réseau. */

import { afterEach, describe, expect, it } from 'vitest'

import { CannotWrite, GitHubAccount, bcReport, setFetch } from '../server/github.ts'

const TASK = 'https://3.basecamp.com/123/buckets/456/todos/789'
const issue = (n: number, body: string, extra: Record<string, unknown> = {}) => ({
  number: n,
  title: `issue ${n}`,
  body,
  comments: 0,
  html_url: `https://github.com/org/api/issues/${n}`,
  state: 'open',
  updated_at: `2026-10-2${n}T10:00:00Z`,
  ...extra,
})
const comment = (id: number, body: string, html = '') => ({ id, body, body_html: html, user: { login: 'moi' }, html_url: `https://github.com/org/api/issues/1#c${id}`, created_at: '2026-10-22T10:00:00Z' })

afterEach(() => setFetch((i, init) => fetch(i, init)))

describe('rapport', () => {
  it('le dernier commentaire marqué gagne, marqueur retiré', () => {
    const r = bcReport([
      comment(1, '<!-- homedash:bc-report -->\nancien'),
      comment(2, '<!-- homedash:bc-report -->\n**Fait** : tout', '<!-- homedash:bc-report -->\n<p><strong>Fait</strong> : tout</p>'),
      comment(3, 'merci !'),
    ])
    expect([r?.id, r?.body, r?.html]).toEqual([2, '**Fait** : tout', '<p><strong>Fait</strong> : tout</p>'])
  })
  it('le marqueur doit ouvrir le commentaire', () => {
    expect(bcReport([comment(1, 'voir <!-- homedash:bc-report --> plus bas')])).toBeNull()
    expect(bcReport([])).toBeNull()
  })
})

describe('lecture', () => {
  it('seulement les issues liées, avec leur rapport', async () => {
    const gh = new GitHubAccount() as any
    gh.configure({ me: 'moi', repos: ['org/api'] })
    const calls: [string, string | undefined][] = []
    const issues = [issue(1, `Tâche\n<!-- homedash:bc ${TASK} -->`, { comments: 2 }), issue(2, 'sans lien'), issue(3, `<!-- homedash:bc ${TASK} -->`, { pull_request: { url: '…' } })]
    gh.gh = async (p: string, _t: unknown, _params: unknown, _cache: unknown, accept?: string) => {
      calls.push([p, accept])
      return p.endsWith('/comments') ? [comment(10, 'ok'), comment(11, "<!-- homedash:bc-report -->\nC'est fait.")] : issues
    }
    const [got] = await gh.fetchLinkedIssues('t')
    expect(got.length).toBe(1)
    expect([got[0].repo, got[0].number, got[0].bc_url]).toEqual(['org/api', 1, TASK])
    expect(got[0].report.body).toBe("C'est fait.")
    expect(calls.filter(([p]) => p.endsWith('/comments'))).toEqual([['/repos/org/api/issues/1/comments', 'application/vnd.github.full+json']])
    gh.data.issues = []
    expect(gh.bcIssues()).toEqual({ issues: [], repos: ['org/api'] })
  })
})

describe('cloche', () => {
  const item = (rid?: number) => ({ repo: 'org/api', number: 1, title: 't', url: 'u', report: rid ? { id: rid } : null })
  const evs = (before: any[], after: any[]) => new GitHubAccount().diff({ issues: before }, { issues: after }, ['issues'])
  it('un nouveau rapport sonne une fois', () => {
    const [ev] = evs([item()], [item(5)])
    expect([ev.kind, ev.source]).toEqual(['bc-report', 'basecamp'])
    expect(evs([item(5)], [item(5)])).toEqual([])
  })
  it('nouvelle issue avec rapport, rapport remplacé : ça sonne', () => {
    expect(evs([], [item(5)]).length).toBe(1)
    expect(evs([item(5)], [item(6)]).length).toBe(1)
  })
})

describe('création (seule écriture vers GitHub)', () => {
  const account = () => {
    const gh = new GitHubAccount()
    gh.configure({ me: 'moi', repos: ['org/api'] })
    gh.applyToken('t', 'ui')
    return gh
  }
  it('poste sur le repo suivi', async () => {
    const sent: [string, RequestInit | undefined][] = []
    setFetch(async (u, init) => {
      sent.push([String(u), init])
      return new Response(JSON.stringify({ number: 7, html_url: 'https://github.com/org/api/issues/7' }), { status: 201 })
    })
    expect(await account().createIssue('org/api', 'Titre', 'Corps')).toEqual({ number: 7, url: 'https://github.com/org/api/issues/7' })
    expect(sent.length).toBe(1)
    expect([sent[0][1]?.method, sent[0][0]]).toEqual(['POST', 'https://api.github.com/repos/org/api/issues'])
    expect(JSON.parse(sent[0][1]?.body as string)).toEqual({ title: 'Titre', body: 'Corps' })
  })
  it("une issue liée s'affiche tout de suite", async () => {
    const gh = account()
    setFetch(async () => new Response(JSON.stringify({ number: 8, html_url: 'https://github.com/org/api/issues/8' }), { status: 201 }))
    await gh.createIssue('org/api', 'Titre', `Besoin\n<!-- homedash:bc ${TASK} -->`)
    const i = gh.data.issues[0]
    expect([i.repo, i.number, i.bc_url, i.report]).toEqual(['org/api', 8, TASK, null])
  })
  it('repo non suivi ou étranger : refusé sans appel', async () => {
    let called = 0
    setFetch(async () => {
      called++
      return new Response('{}')
    })
    for (const repo of ['org/autre', 'pirate/api', 'api', '']) await expect(account().createIssue(repo, 't', 'b')).rejects.toThrow(RangeError)
    expect(called).toBe(0)
  })
  it('jeton en lecture seule : on le dit', async () => {
    setFetch(async () => new Response('{}', { status: 403 }))
    await expect(account().createIssue('org/api', 't', 'b')).rejects.toBeInstanceOf(CannotWrite)
  })
})
