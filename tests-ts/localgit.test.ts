/**
 * Verdicts de l'onglet Local : la seule logique où une erreur fait perdre du travail.
 * Branches construites à la main, mêmes clés que `readRepo()`, même chaîne
 * verdict → safety → action, et `commands` pour le dépôt.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import * as events from '../server/events.ts'
import * as localgit from '../server/localgit.ts'
import * as store from '../server/store.ts'

const DEFAULT = 'main'

function branch(over: Record<string, any> = {}): Record<string, any> {
  return {
    name: 'feature/x', sha: 'a'.repeat(40), short: 'aaaaaaaa', current: false, protected: false,
    upstream: null, remote_ref: false, remote_sha: null, ahead_default: 2, behind_default: 0, capped: false,
    push_ahead: null, push_behind: null, on_github: null, date: 0, author: '', subject: '', pr: null,
    ...over,
  }
}

function judge(b: Record<string, any>) {
  const [state, advice, flag] = localgit.verdict(b, DEFAULT)
  Object.assign(b, { state, advice, delete: flag })
  b.safety = localgit.safety(b, DEFAULT)
  b.action = localgit.action(b, b.safety)
  return b
}

describe('verdicts', () => {
  it('mergée et encore sur GitHub : supprimable avec -d', () => {
    const b = judge(branch({ ahead_default: 0, on_github: true, remote_ref: true, push_ahead: 0, push_behind: 0 }))
    expect([b.state, b.delete, b.safety.level, b.action.kind]).toEqual(['merged', '-d', 'merged', 'delete'])
  })
  it('mergée puis supprimée sur GitHub', () => {
    const b = judge(branch({ ahead_default: 0, on_github: false, remote_ref: true }))
    expect([b.state, b.delete, b.action.kind]).toEqual(['gone-merged', '-d', 'delete'])
  })
  it('GitHub prime sur un ref distant local périmé', () => {
    expect(judge(branch({ ahead_default: 0, on_github: false, remote_ref: true })).state).toBe('gone-merged')
    expect(judge(branch({ ahead_default: 0, on_github: null, remote_ref: true })).state).toBe('merged')
  })
  it('squashée : retrouvée par sa PR mergée', () => {
    const b = judge(branch({ ahead_default: 3, on_github: false, pr: { number: 42, merged: true } }))
    expect([b.state, b.delete, b.safety.level, b.action.kind]).toEqual(['squashed', '-D', 'squash', 'delete'])
  })
  it('poussée puis supprimée sans PR : jamais « à supprimer »', () => {
    const b = judge(branch({ ahead_default: 2, on_github: false, remote_ref: true }))
    expect([b.state, b.delete, b.safety.level, b.safety.label, b.action.kind]).toEqual(['gone', '-D', 'local', '⚠ effacée de GitHub', 'check'])
  })
  it("l'amont seul prouve un push passé", () => {
    const b = judge(branch({ on_github: null, upstream: 'origin/feature/x' }))
    expect([b.state, b.safety.label]).toEqual(['gone', '⚠ effacée de GitHub'])
  })
  it('une PR seule prouve un push passé', () => {
    const b = judge(branch({ on_github: false, pr: { number: 7, merged: false } }))
    expect([b.state, b.delete, b.action.kind]).toEqual(['closed-pr', null, 'keep'])
  })
  it('jamais poussée', () => {
    const b = judge(branch({ on_github: false }))
    expect([b.state, b.delete, b.safety.label, b.action.kind]).toEqual(['local-only', null, '⚠ jamais envoyée', 'keep'])
  })
  it('poussée, en cours', () => {
    const b = judge(branch({ ahead_default: 3, on_github: true, remote_ref: true, push_ahead: 0, push_behind: 0 }))
    expect([b.state, b.safety.level, b.action.kind]).toEqual(['ok', 'pushed', 'work'])
  })
  it('poussée en partie', () => {
    const b = judge(branch({ ahead_default: 3, on_github: true, remote_ref: true, push_ahead: 2, push_behind: 0 }))
    expect([b.state, b.safety.level, b.action.kind]).toEqual(['unpushed', 'partial', 'keep'])
  })
  it('sur GitHub sans copie locale : pas « à jour »', () => {
    const b = judge(branch({ ahead_default: 3, on_github: true }))
    expect(b.state).not.toBe('ok')
    expect(b.safety.label).not.toContain('0 non poussé')
  })
  it('divergée', () => {
    const b = judge(branch({ on_github: true, remote_ref: true, push_ahead: 1, push_behind: 2 }))
    expect([b.state, b.delete]).toEqual(['diverged', null])
  })
  it('la branche courante ne se supprime jamais', () => {
    const b = judge(branch({ ahead_default: 0, on_github: true, remote_ref: true, push_ahead: 0, push_behind: 0, current: true }))
    expect([b.state, b.delete, b.action.kind]).toEqual(['merged', null, 'current'])
    expect(b.advice).toContain('git switch')
  })
  it('ni courante squashée', () => {
    const b = judge(branch({ ahead_default: 3, on_github: false, current: true, pr: { number: 1, merged: true } }))
    expect(b.delete).toBeNull()
    expect(b.action.kind).not.toBe('delete')
  })
  it('ni protégée', () => {
    const b = judge(branch({ name: 'main', protected: true, ahead_default: 0, on_github: false }))
    expect([b.state, b.delete, b.action.kind]).toEqual(['protected', null, 'ref'])
    const behind = judge(branch({ name: 'main', protected: true, behind_default: 4 }))
    expect([behind.state, behind.delete]).toEqual(['behind', null])
  })
  it('invariants sur toutes les combinaisons', () => {
    const prs = [null, { number: 1, merged: true }, { number: 2, merged: false }]
    let n = 0
    for (const cur of [true, false])
      for (const prot of [true, false])
        for (const up of [null, 'origin/x'])
          for (const rref of [true, false])
            for (const ongh of [null, true, false])
              for (const ahead of [0, 3])
                for (const behind of [0, 2])
                  for (const pa of [null, 0, 1])
                    for (const pb of [null, 0, 1])
                      for (const pr of prs) {
                        const b = judge(branch({ current: cur, protected: prot, upstream: up, remote_ref: rref, on_github: ongh, ahead_default: ahead, behind_default: behind, push_ahead: pa, push_behind: pb, pr }))
                        n++
                        if (b.action.kind === 'delete') expect(localgit.SAFE_LEVELS).toContain(b.safety.level)
                        if (cur || prot) {
                          expect(b.delete).toBeNull()
                          expect(['delete', 'check']).not.toContain(b.action.kind)
                        }
                        if (b.delete === '-d') expect(ahead).toBe(0)
                        if (!(rref || up || pr) && ongh !== true && ahead) expect(localgit.SAFE_LEVELS).not.toContain(b.safety.level)
                      }
    expect(n).toBeGreaterThan(1000)
  })
})

describe('commandes', () => {
  const entry = (...bs: Record<string, any>[]) => ({ display: '~/dev/projet', default_branch: DEFAULT, branches: bs.map(judge) })
  const byId = (cmds: Record<string, any>[]) => Object.fromEntries(cmds.map((c) => [c.id, c]))

  it('le fetch est toujours proposé', () => {
    const cmds = localgit.commands(entry())
    expect(cmds.map((c) => c.id)).toEqual(['fetch'])
    expect(cmds[0].cmd).toContain('git fetch --prune')
  })
  it('les commandes suivent le drapeau de suppression', () => {
    const cmds = byId(
      localgit.commands(
        entry(
          branch({ name: 'merged-one', ahead_default: 0, on_github: true, remote_ref: true, push_ahead: 0, push_behind: 0 }),
          branch({ name: 'squashed-one', ahead_default: 3, on_github: false, pr: { number: 5, merged: true } }),
          branch({ name: 'gone-one', on_github: false, remote_ref: true }),
          branch({ name: 'current-merged', ahead_default: 0, on_github: true, remote_ref: true, push_ahead: 0, push_behind: 0, current: true }),
          branch({ name: 'main', protected: true, ahead_default: 0, on_github: true }),
          branch({ name: 'wip', on_github: false }),
        ),
      ),
    )
    expect(cmds.delete.cmd).toContain('git branch -d merged-one')
    expect(cmds.squashed.cmd).toContain('git branch -D squashed-one')
    expect(cmds.force.cmd).toContain('gone-one')
    expect(cmds.force.danger).toBe(true)
    const every = Object.values(cmds).map((c: any) => c.cmd).join(' ')
    for (const never of ['current-merged', ' main', 'wip']) expect(every).not.toContain(never)
  })
  it('les noms de branche dangereux sont entre guillemets', () => {
    const cmd = byId(localgit.commands(entry(branch({ name: 'x;rm -rf ~', ahead_default: 0, on_github: true, remote_ref: true, push_ahead: 0, push_behind: 0 })))).delete.cmd
    expect(cmd).toContain("'x;rm -rf ~'")
  })
  it('chemin avec espaces entre guillemets, ~ nu', () => {
    expect(localgit.shellPath('~/dev/projet')).toBe('~/dev/projet')
    expect(localgit.shellPath('~/mes projets/x')).toBe('"~/mes projets/x"')
  })
  it('branche par défaut en retard : pull, pas merge', () => {
    const cmds = byId(localgit.commands(entry(branch({ name: 'main', protected: true, current: true, ahead_default: 0, behind_default: 3, on_github: true, remote_ref: true, upstream: 'origin/main', push_ahead: 0, push_behind: 3 }))))
    expect(cmds.pull.cmd).toBe('cd ~/dev/projet && git pull')
    expect(cmds.merge).toBeUndefined()
  })
  it('pull nomme la branche sans amont', () => {
    expect(byId(localgit.commands(entry(branch({ name: 'feat', current: true, ahead_default: 0, on_github: true, remote_ref: true, push_ahead: 0, push_behind: 2 })))).pull.cmd).toContain('git pull origin feat')
  })
  it('pas de pull si divergée', () => {
    expect(byId(localgit.commands(entry(branch({ name: 'feat', current: true, on_github: true, remote_ref: true, upstream: 'origin/feat', push_ahead: 1, push_behind: 2 })))).pull).toBeUndefined()
  })
  it('merge même pour une branche jamais poussée', () => {
    const cmds = byId(localgit.commands(entry(branch({ name: 'wip', current: true, ahead_default: 1, behind_default: 3, on_github: false }))))
    expect(cmds.merge.cmd).toContain('git fetch origin && git merge origin/main')
  })
  it('pull puis merge en retard des deux côtés', () => {
    const ids = localgit.commands(entry(branch({ name: 'feat', current: true, ahead_default: 1, behind_default: 3, on_github: true, remote_ref: true, upstream: 'origin/feat', push_ahead: 0, push_behind: 2 }))).map((c) => c.id)
    expect(ids.indexOf('pull')).toBeLessThan(ids.indexOf('merge'))
  })
  it('adresse du distant', () => {
    for (const url of ['git@github.com:mon-org/api.git', 'https://github.com/mon-org/api.git', 'https://github.com/mon-org/api', 'ssh://git@github.com/mon-org/api.git'])
      expect(localgit.parseRemote(url)).toEqual(['mon-org', 'api'])
    expect(localgit.parseRemote(null)[1]).toBeNull()
  })
})

describe('🧹 dans la cloche', () => {
  const iso = (ago: number) => new Date(Date.now() - ago * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const repo = (name: string, ...bs: [string, any][]) => ({ name, url: '', branches: bs.map(([b, pr]) => ({ name: b, action: { kind: 'delete', detail: '' }, pr })) })
  const recorded = () => events.payload().events

  beforeEach(() => {
    store.write(store.EVENTS, { seq: 0, events: [] })
    events.reset()
    localgit.resetJournal(true)
  })

  it('un vieux merge trouvé tard se tait, un récent est annoncé', () => {
    localgit.recordCleanup([repo('api')])
    localgit.recordCleanup([repo('api', ['fix/vieux', { merged_at: iso(90 * 86400), url: '' }], ['fix/hier', { merged_at: iso(3600), url: '' }], ['supprimee', null])])
    const titles = recorded().map((e) => e.title)
    expect(titles.length).toBe(2)
    expect(titles.some((t) => t.includes('fix/hier'))).toBe(true)
    expect(titles.some((t) => t.includes('supprimee'))).toBe(true)
  })
  it('déjà annoncée avant un redémarrage : rien', () => {
    const recent: [string, any] = ['fix/hier', { merged_at: iso(3600), url: '' }]
    localgit.recordCleanup([repo('api')])
    localgit.recordCleanup([repo('api', recent)])
    expect(recorded().length).toBe(1)
    localgit.resetJournal(true)
    localgit.recordCleanup([repo('api')])
    localgit.recordCleanup([repo('api', recent)])
    expect(recorded().length).toBe(1)
  })
  it('la même branche dans plusieurs dépôts : une ligne', () => {
    const b: [string, any] = ['fix/hier', { merged_at: iso(3600), url: '' }]
    localgit.recordCleanup([repo('api'), repo('web'), repo('app')])
    localgit.recordCleanup([repo('api', b), repo('web', b), repo('app')])
    expect(recorded().length).toBe(1)
    expect(recorded()[0].title).toContain('2 dépôts')
    expect([...(recorded()[0].keys || [])].sort()).toEqual(['local:api/fix/hier', 'local:web/fix/hier'])
  })
  it("un dépôt vu pour la première fois ne produit rien", () => {
    localgit.recordCleanup([repo('api')])
    localgit.recordCleanup([repo('api'), repo('nouveau', ['x', { merged_at: iso(60) }])])
    expect(recorded()).toEqual([])
  })
})

describe('disque hors du dossier personnel (#31)', () => {
  let root: string
  let home: string
  let disk: string
  const saved = { ...process.env }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'hd-disk-'))
    home = path.join(root, 'host')
    disk = path.join(root, 'hostdisk')
    for (const d of ['dev/api/.git', 'Library']) fs.mkdirSync(path.join(home, d), { recursive: true })
    for (const d of ['projets/site/.git', 'Windows', '$Recycle.Bin', 'Users']) fs.mkdirSync(path.join(disk, d), { recursive: true })
    fs.writeFileSync(path.join(home, 'notes.md'), '')
    // lien vers le conteneur (comme /Volumes/Macintosh HD → /) : jamais suivi
    fs.symlinkSync('/', path.join(disk, 'Macintosh HD'))
    Object.assign(process.env, { HOST_MOUNT: home, DISK_MOUNT: disk, HOST_HOME: 'C:\\Users\\moi', HOST_DISK: 'C:' })
    localgit.resetConfig()
  })
  afterEach(() => {
    for (const k of ['HOST_MOUNT', 'DISK_MOUNT', 'HOST_HOME', 'HOST_DISK']) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('chemins Windows aller-retour', () => {
    expect(localgit.resolve('C:/projets/site')).toBe(disk + '/projets/site')
    expect(localgit.resolve('c:\\projets\\site')).toBe(disk + '/projets/site')
    expect(localgit.display(disk + '/projets/site')).toBe('C:/projets/site')
    expect(localgit.resolve('~/dev')).toBe(home + '/dev')
    expect(localgit.display(disk + '/Users/moi/dev')).toBe('~/dev')
  })
  it('volumes Mac', () => {
    Object.assign(process.env, { HOST_HOME: '/Users/moi', HOST_DISK: '/Volumes' })
    expect(localgit.resolve('/Volumes/projets')).toBe(disk + '/projets')
    expect(localgit.display(disk + '/projets')).toBe('/Volumes/projets')
  })
  it('le choix atteint le disque mais pas au-delà', () => {
    const top = localgit.browse('C:') as any
    expect(top.dirs.map((d: any) => d.name)).toEqual(['projets', 'Users'])
    expect(top.parent).toBeNull()
    expect(top.starts.map((s: any) => s.path)).toEqual(['~', 'C:'])
    expect((localgit.browse('C:/projets') as any).repos.count).toBe(1)
    expect(localgit.browse('C:/Macintosh HD')).toHaveProperty('error')
    expect(localgit.browse('/etc')).toHaveProperty('error')
  })
  it('le choix de fichier reste dans le dossier personnel', () => {
    expect(localgit.browse('C:/projets', true)).toHaveProperty('error')
    expect((localgit.browse('~', true) as any).files.map((f: any) => f.name)).toEqual(['notes.md'])
  })
  it('sans disque monté, rien ne change', () => {
    process.env.DISK_MOUNT = '/nexiste/pas'
    expect(localgit.resolve('C:/projets')).toBe('C:/projets')
    expect((localgit.browse('~') as any).starts.map((s: any) => s.path)).toEqual(['~'])
  })
})
