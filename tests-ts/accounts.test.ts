/**
 * Plusieurs comptes GitHub : migration de config, jetons, isolation, routage.
 * Aucun appel réseau : jetons factices, et les appels GitHub remplacés.
 */

import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import * as accounts from '../server/accounts.ts'
import { removeGoneRepos } from '../server/app.ts'
import * as backup from '../server/backup.ts'
import * as events from '../server/events.ts'
import { GitHubAccount, setFetch, setRepoGone } from '../server/github.ts'
import * as store from '../server/store.ts'

const resetSecrets = () => fs.rmSync(store.pathOf(store.SECRETS), { force: true })

const LEGACY = () => ({
  groups: [],
  github: { org: 'mon-org', me: 'moi', label: 'Boulot', repos: ['api', 'front', 'perso/blog'], branch_repos: ['api'], upstream_repo: 'socle' },
  repos: { items: [{ name: 'api' }, { name: 'blog', owner: 'perso' }] },
})

describe('migration', () => {
  it("l'ancienne section github devient le compte main", () => {
    const [cfg, changed] = accounts.migrate(LEGACY())
    expect(changed).toBe(true)
    expect(cfg).not.toHaveProperty('github')
    expect(cfg.github_accounts.length).toBe(1)
    const main = cfg.github_accounts[0]
    expect([main.id, main.label]).toEqual(['main', 'Boulot'])
    expect(main).not.toHaveProperty('org')
    expect(main.repos).toEqual(['mon-org/api', 'mon-org/front', 'perso/blog'])
    expect(main.branch_repos).toEqual(['mon-org/api'])
    expect(main.upstream_repo).toBe('mon-org/socle')
  })
  it("les entrées de la carte Repos prennent l'ancienne org", () => {
    const items = accounts.migrate(LEGACY())[0].repos.items
    expect([items[0].owner, items[1].owner]).toEqual(['mon-org', 'perso'])
  })
  it('idempotente', () => {
    const [cfg] = accounts.migrate(LEGACY())
    const [again, changed] = accounts.migrate(structuredClone(cfg))
    expect(changed).toBe(false)
    expect(again).toEqual(cfg)
  })
  it('les liens tapés sans schéma en reçoivent un', () => {
    const urls = ['notion.so', 'www.figma.com/files', 'localhost:3000/app', '192.168.1.1', 'https://deja.fr', 'http://intranet', 'mailto:a@b.fr', '/api/file?p=x', '~/doc.pdf', '']
    const [cfg, changed] = accounts.migrate({ groups: [{ name: 'G', links: urls.map((url, i) => ({ name: String(i), url })) }] })
    expect(changed).toBe(true)
    expect(cfg.groups[0].links.map((l: any) => l.url)).toEqual([
      'https://notion.so', 'https://www.figma.com/files', 'http://localhost:3000/app', 'http://192.168.1.1', 'https://deja.fr',
      'http://intranet', 'mailto:a@b.fr', '/api/file?p=x', '~/doc.pdf', '',
    ])
    expect(accounts.migrate(structuredClone(cfg))[1]).toBe(false)
  })
  it('une config vide reçoit un compte', () => {
    expect(accounts.migrate({ groups: [] })[0].github_accounts.map((a: any) => a.id)).toEqual(['main'])
  })
  it('fromConfig ne lit que les comptes migrés', () => {
    expect(accounts.fromConfig({ github_accounts: [{ id: 'main' }, { label: 'sans id' }, "n'importe quoi", { id: 'perso', label: 'Perso' }] }).map((a) => a.id)).toEqual(['main', 'perso'])
  })
  it('normalized = migrate', () => {
    expect(accounts.normalized(LEGACY())).toEqual(accounts.migrate(LEGACY())[0])
  })
  it("settingsOf retire l'identité", () => {
    expect(accounts.settingsOf({ id: 'x', label: 'X', me: 'moi' })).toEqual({ me: 'moi' })
  })
  it('slug', () => {
    expect(accounts.slug('Perso', new Set())).toBe('perso')
    expect(accounts.slug('Client X !', new Set())).toBe('client-x')
    expect(accounts.slug('Perso', new Set(['perso']))).toBe('perso-2')
    expect(accounts.slug('Perso', new Set(['perso', 'perso-2']))).toBe('perso-3')
    expect(accounts.slug('', new Set())).toBe('compte')
    expect(accounts.slug('éé', new Set())).toBe('compte')
    expect(accounts.slug('x'.repeat(80), new Set()).length).toBeLessThanOrEqual(24)
  })
})

describe('jetons', () => {
  beforeEach(resetSecrets)
  afterEach(() => {
    resetSecrets()
    accounts.configure({ github_accounts: [] })
  })

  it("l'ancien jeton rejoint le premier compte", () => {
    store.writeSecret('github_token', 'ancien')
    accounts.migrateSecrets('main')
    expect(store.readSecret('github_token')).toBeUndefined()
    expect(store.readSecret('github_tokens')).toEqual({ main: 'ancien' })
  })
  it("l'ancien jeton n'écrase jamais un plus récent", () => {
    store.writeSecret('github_tokens', { main: 'récent' })
    store.writeSecret('github_token', 'ancien')
    accounts.migrateSecrets('main')
    expect(store.readSecret('github_tokens')).toEqual({ main: 'récent' })
  })
  it('poser, retirer, oublier', () => {
    accounts.configure({ github_accounts: [{ id: 'a' }, { id: 'b' }] })
    accounts.setToken('a', 'tok-a')
    accounts.setToken('b', 'tok-b')
    expect([accounts.get('a')?.token(), accounts.get('b')?.token()]).toEqual(['tok-a', 'tok-b'])
    accounts.setToken('a', null)
    expect(accounts.get('a')?.token()).toBeNull()
    accounts.forget('b')
    expect(store.readSecret('github_tokens')).toEqual({})
  })
  it('secrets.json en 600', () => {
    store.writeSecret('github_tokens', { a: 'x' })
    if (process.platform !== 'win32') expect(fs.statSync(store.pathOf(store.SECRETS)).mode & 0o777).toBe(0o600)
  })
  it('un jeton ne finit jamais dans la config', () => {
    const cfg = { groups: [], github_accounts: [{ id: 'a', me: 'moi' }] }
    accounts.configure(cfg)
    accounts.setToken('a', 'secret-xyz')
    expect(JSON.stringify(cfg)).not.toContain('secret-xyz')
  })
})

describe('isolation', () => {
  it('deux comptes ne partagent rien', () => {
    const m1 = new GitHubAccount()
    const m2 = new GitHubAccount()
    m1.configure({ me: 'un', repos: ['org-un/api'] })
    m2.configure({ me: 'deux', repos: ['org-deux/blog'] })
    m1.applyToken('jeton-un', 'ui')
    m2.applyToken(null, null)
    expect([m1.CFG.repos, m2.CFG.repos]).toEqual([['api'], ['blog']])
    expect([m1.owner('api'), m2.owner('api')]).toEqual(['org-un', ''])
    expect([m1.token(), m2.token()]).toEqual(['jeton-un', null])
    expect(m1.CFG).not.toBe(m2.CFG)
  })
  it('sémantique de configure', () => {
    const m = new GitHubAccount()
    m.configure({ me: 'moi', repos: ['o/a', 'o/b'] })
    expect(m.CFG.branch_repos).toEqual(['a', 'b']) // clé absente = repos
    m.configure({ me: 'moi', repos: ['o/a'], branch_repos: [] })
    expect(m.CFG.branch_repos).toEqual([]) // vide = vide
    m.configure({ me: 'moi', upstream_repo: 'o/socle' })
    expect([m.CFG.upstream_repo, m.owner('socle')]).toEqual(['socle', 'o'])
    m.configure({ me: 'moi' })
    expect(m.owner('a')).toBe('')
    expect(m.owner('a', 'remote-org')).toBe('remote-org')
  })
})

describe('routage de prForBranch', () => {
  let calls: [string, string, string, string | null | undefined][]
  beforeEach(() => {
    resetSecrets()
    accounts.configure({
      github_accounts: [
        { id: 'boulot', me: 'moi', repos: ['mon-org/api'] },
        { id: 'perso', me: 'moi', repos: [], branch_repos: ['perso/blog'] },
      ],
    })
    accounts.setToken('boulot', 't1')
    accounts.setToken('perso', 't2')
    calls = []
    for (const id of ['boulot', 'perso']) {
      const mod = accounts.get(id) as GitHubAccount
      mod.prForBranch = async (repo, branch, hint) => {
        calls.push([id, repo, branch, hint])
        return { from: id }
      }
    }
  })
  afterEach(() => {
    resetSecrets()
    accounts.reset()
  })

  it('vers le compte qui suit le repo', async () => {
    expect((await accounts.prForBranch('api', 'fix')).from).toBe('boulot')
    expect((await accounts.prForBranch('blog', 'fix', 'perso')).from).toBe('perso')
    expect(calls[calls.length - 1]).toEqual(['perso', 'blog', 'fix', 'perso'])
  })
  it('repo non suivi : premier compte connecté', async () => {
    expect((await accounts.prForBranch('inconnu', 'x')).from).toBe('boulot')
    accounts.setToken('boulot', null)
    expect((await accounts.prForBranch('inconnu', 'x')).from).toBe('perso')
    expect((await accounts.prForBranch('api', 'x')).from).toBe('perso')
  })
  it('aucun compte connecté', async () => {
    accounts.setToken('boulot', null)
    accounts.setToken('perso', null)
    expect(await accounts.prForBranch('api', 'x')).toBeNull()
    expect(calls).toEqual([])
  })
  it('get retombe sur le premier compte', () => {
    expect(accounts.get("n'existe pas")).toBe(accounts.get('boulot'))
    expect(accounts.allMods().map((m) => m.ACCOUNT.id)).toEqual(['boulot', 'perso'])
  })
  it('GitHub coupé : plus rien ne se lit', () => {
    accounts.configure({ features: { github: false }, github_accounts: [{ id: 'boulot', me: 'moi', repos: ['mon-org/api'] }] })
    const mod = accounts.get('boulot') as GitHubAccount
    expect(mod.enabled()).toBe(false)
    expect(accounts.enabled()).toBe(false)
    expect(mod.payload(mod.token())).toEqual({ enabled: false })
    expect(accounts.bcIssues()).toEqual({ issues: [], repos: [] })
    let kicked = false
    mod.kickoff = () => (kicked = true)
    accounts.kickoffAll()
    expect(kicked).toBe(false)
    accounts.configure({ github_accounts: [{ id: 'boulot', me: 'moi', repos: ['mon-org/api'] }] })
    expect(accounts.get('boulot')?.enabled()).toBe(true)
    expect(accounts.get('boulot')?.token()).toBe('t1')
  })
  it('un compte retiré est oublié', () => {
    accounts.configure({ github_accounts: [{ id: 'boulot', me: 'moi' }] })
    expect(accounts.allMods().map((m) => m.ACCOUNT.id)).toEqual(['boulot'])
  })
})

describe('GitHub', () => {
  afterEach(() => setFetch((i, init) => fetch(i, init)))

  it('la version distante ne bouge que si le distant change', async () => {
    const m = new GitHubAccount() as any
    m.CFG.repos = ['api']
    const branches = [
      { name: 'main', commit: { sha: 'a' } },
      { name: 'feat', commit: { sha: 'b' } },
    ]
    m.gh = async (p: string) => (p.endsWith('/api') ? { default_branch: 'main' } : [...branches])
    m.branchFact = async () => null
    await m.repoBranchFacts('api', 't')
    const v1 = m.remoteVersion()
    await m.repoBranchFacts('api', 't')
    expect(m.remoteVersion()).toBe(v1)
    branches[1] = { name: 'feat', commit: { sha: 'c' } }
    await m.repoBranchFacts('api', 't')
    expect(m.remoteVersion()).toBe(v1 + 1)
  })
  it('« Partagés avec toi » : repos collaborateur des comptes perso seulement', async () => {
    const m = new GitHubAccount() as any
    const asked: [string, unknown][] = []
    m.paged = async (p: string, _t: unknown, params: any) => {
      asked.push([p, params.affiliation])
      return [
        { name: 'homedash', full_name: 'lepetitpaco/homedash', private: true, owner: { login: 'lepetitpaco', type: 'User' }, pushed_at: '2026-10-24' },
        { name: 'api', full_name: 'Org/api', private: true, owner: { login: 'Org', type: 'Organization' }, pushed_at: '2026-10-23' },
      ]
    }
    m.whoami = async () => ({ ok: true, login: 'moi' })
    const out = await m.reposOf(GitHubAccount.SHARED)
    expect(asked).toEqual([['/user/repos', 'collaborator']])
    expect(out.repos.map((r: any) => r.full_name)).toEqual(['lepetitpaco/homedash'])
  })
  it("un vieux merge qui réapparaît n'est pas une nouvelle", () => {
    const m = new GitHubAccount()
    const old = { repo: 'admin', number: 1, title: 't', url: 'u', branch: 'b', merged_at_raw: '2026-10-23T07:44:34Z' }
    const fresh = { ...old, number: 2, merged_at_raw: '2026-10-24T01:45:00Z' }
    expect(m.diff({ merged: [] }, { merged: [old, fresh] }, ['merged'], '2026-10-24T01:35:00Z').map((e) => e.title)).toEqual(['🎉 PR mergée — admin #2'])
  })
  it('erreur serveur : la dernière réponse connue ; 404 : absent', async () => {
    const m = new GitHubAccount() as any
    m.etags.set('https://api.github.com/repos/o/r/pulls', ['etag', [{ number: 1 }]])
    setFetch(async () => new Response('', { status: 504 }))
    expect(await m.gh('/repos/o/r/pulls', 't')).toEqual([{ number: 1 }])
    setFetch(async () => new Response('', { status: 404 }))
    expect(await m.gh('/repos/o/r/pulls', 't')).toBeNull()
  })
  it('304 : la réponse en cache, hors quota', async () => {
    const m = new GitHubAccount() as any
    setFetch(async () => new Response(JSON.stringify([{ number: 9 }]), { headers: { ETag: 'W/"1"' } }))
    expect(await m.gh('/x', 't')).toEqual([{ number: 9 }])
    let sent: Record<string, string> = {}
    setFetch(async (_u, init) => {
      sent = init?.headers as Record<string, string>
      return new Response(null, { status: 304 })
    })
    expect(await m.gh('/x', 't')).toEqual([{ number: 9 }])
    expect(sent['If-None-Match']).toBe('W/"1"')
    expect([m.STATS.calls, m.STATS.hits]).toEqual([1, 1])
  })
  it('codes émoji', async () => {
    const { emojify } = await import('../server/github.ts')
    expect(emojify(':sparkles:(paie) :arrow_up: v1 :inconnu:')).toBe('✨(paie) ⬆️ v1 :inconnu:')
  })
  it('une issue ne se crée que dans un repo suivi par le compte', async () => {
    const m = new GitHubAccount()
    m.configure({ me: 'moi', repos: ['org/api'] })
    m.applyToken('t', 'ui')
    let posted = 0
    setFetch(async () => {
      posted++
      return new Response(JSON.stringify({ number: 3, html_url: 'u' }), { status: 201 })
    })
    await expect(m.createIssue('autre/api', 'x', '')).rejects.toThrow(RangeError)
    await expect(m.createIssue('org/front', 'x', '')).rejects.toThrow(RangeError)
    expect(posted).toBe(0)
    expect(await m.createIssue('org/api', 'x', '')).toEqual({ number: 3, url: 'u' })
    expect(posted).toBe(1)
  })
})

describe('carte En cours', () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
  const account = () => {
    const gh = new GitHubAccount()
    gh.configure({ id: 'main', repos: ['org/api'], me: 'moi' } as any)
    return gh
  }
  afterEach(() => setFetch((i, init) => fetch(i, init)))

  it('sert les runs en cours avec leurs jobs, jamais un run fini', async () => {
    const asked: string[] = []
    setFetch(async (input) => {
      const url = String(input)
      asked.push(url)
      if (url.includes('/actions/runs/7/jobs'))
        return json({ jobs: [{ name: 'version', status: 'completed', conclusion: 'success' }, { name: 'build', status: 'in_progress', conclusion: null }] })
      if (url.includes('/actions/runs'))
        return json({ workflow_runs: [
          { id: 7, name: 'release', status: 'in_progress', head_branch: 'main', display_title: 'Merge', html_url: 'u7' },
          { id: 8, name: 'pages', status: 'completed', conclusion: 'success', head_branch: 'main' },
        ] })
      return json([])
    })
    const gh = account()
    await gh.rebuild('tok', ['running'])
    expect(gh.data.running.map((r) => [r.repo, r.workflow, r.branch, r.url])).toEqual([['api', 'release', 'main', 'u7']])
    expect(gh.data.running[0].ci.checks.map((c: any) => [c.name, c.state])).toEqual([['version', 'pass'], ['build', 'pending']])
    expect(asked.some((u) => u.includes('/runs/8/jobs'))).toBe(false)
  })

  it('rien en cours : liste vide, aucun job demandé', async () => {
    const asked: string[] = []
    setFetch(async (input) => {
      asked.push(String(input))
      return json({ workflow_runs: [{ id: 8, status: 'completed' }] })
    })
    const gh = account()
    await gh.rebuild('tok', ['running'])
    expect(gh.data.running).toEqual([])
    expect(asked.some((u) => u.includes('/jobs'))).toBe(false)
  })

  it('accès refusé : liste vide, sans erreur pour le reste', async () => {
    setFetch(async () => json({ message: 'non' }, 403))
    const gh = account()
    await gh.rebuild('tok', ['running'])
    expect(gh.data.running).toEqual([])
    expect((gh as any).state.error).toBeNull()
  })
})

describe('dépôt disparu', () => {
  const REPOS = ['moi/vivant', 'moi/parti']
  const removed: [string, string[]][] = []
  const account = () => {
    const a = new GitHubAccount()
    a.ACCOUNT = { id: 'main', label: '' }
    a.configure({ repos: REPOS })
    a.applyToken('jeton', 'test')
    return a
  }
  const github = (status: (p: string) => number) =>
    setFetch(async (i) => new Response('{}', { status: status(new URL(String(i)).pathname) }))
  const pass = async (a: GitHubAccount) => {
    for (const r of REPOS) await a.gh(`/repos/${r}/pulls`, 'jeton')
    await (a as any).settleMissing('jeton')
  }
  const gone = (p: string) => (p.includes('/moi/parti') ? 404 : 200)

  beforeEach(() => {
    removed.length = 0
    setRepoGone((acc, list) => removed.push([acc, list]))
  })
  afterEach(() => {
    setFetch((i, init) => fetch(i, init))
    setRepoGone(() => undefined)
  })

  it('retire après deux passes de suite', async () => {
    github(gone)
    const a = account()
    await pass(a)
    expect(removed).toEqual([])
    await pass(a)
    expect(removed).toEqual([['main', ['moi/parti']]])
  })

  it('oublie un 404 passager', async () => {
    const a = account()
    github(gone)
    await pass(a)
    github(() => 200)
    await pass(a)
    github(gone)
    await pass(a)
    expect(removed).toEqual([])
  })

  it('ne retire rien si la vérification directe répond', async () => {
    github((p) => (p.endsWith('/moi/parti/pulls') ? 404 : 200))
    const a = account()
    await pass(a)
    await pass(a)
    expect(removed).toEqual([])
  })

  it('ne retire rien si le jeton est refusé', async () => {
    github((p) => (p === '/user' ? 401 : gone(p)))
    const a = account()
    await pass(a)
    await pass(a)
    expect(removed).toEqual([])
  })

  it('ne retire rien si tous les dépôts manquent', async () => {
    github((p) => (p === '/user' ? 200 : 404))
    const a = account()
    await pass(a)
    await pass(a)
    expect(removed).toEqual([])
  })

  it('une panne ou un refus ne compte pas', async () => {
    github((p) => (p.includes('/moi/parti') ? 503 : 200))
    const a = account()
    await pass(a)
    await pass(a)
    expect(removed).toEqual([])
  })

  it('un fichier absent d’un dépôt ne le rend pas suspect', async () => {
    github((p) => (p.includes('/contents/') ? 404 : 200))
    const a = account()
    await a.gh('/repos/moi/parti/contents/x', 'jeton')
    await (a as any).settleMissing('jeton')
    await a.gh('/repos/moi/parti/contents/x', 'jeton')
    await (a as any).settleMissing('jeton')
    expect(removed).toEqual([])
  })

  it('nettoie toute la config, sauvegarde d’abord, et le dit au journal', () => {
    store.write(store.CONFIG, {
      groups: [],
      github_accounts: [{ id: 'main', repos: REPOS, branch_repos: REPOS }],
      repos: { items: [{ name: 'vivant', owner: 'moi' }, { name: 'parti', owner: 'moi' }] },
      trello: { repos: REPOS },
    })
    const before = backup.listing().length
    removeGoneRepos('main', ['moi/parti'])
    const cfg = store.read(store.CONFIG, {}) as any
    expect(cfg.github_accounts[0].repos).toEqual(['moi/vivant'])
    expect(cfg.github_accounts[0].branch_repos).toEqual(['moi/vivant'])
    expect(cfg.repos.items.map((i: any) => i.name)).toEqual(['vivant'])
    expect(cfg.trello.repos).toEqual(['moi/vivant'])
    expect(backup.listing().length).toBe(before + 1)
    expect(events.payload().events.at(-1)?.title).toContain('moi/parti')
  })

  it('garde la carte si un autre compte suit encore le dépôt', () => {
    store.write(store.CONFIG, {
      groups: [],
      github_accounts: [{ id: 'main', repos: REPOS }, { id: 'deux', repos: ['moi/parti'] }],
      repos: { items: [{ name: 'parti', owner: 'moi' }] },
    })
    removeGoneRepos('main', ['moi/parti'])
    const cfg = store.read(store.CONFIG, {}) as any
    expect(cfg.github_accounts[0].repos).toEqual(['moi/vivant'])
    expect(cfg.github_accounts[1].repos).toEqual(['moi/parti'])
    expect(cfg.repos.items).toHaveLength(1)
  })
})
