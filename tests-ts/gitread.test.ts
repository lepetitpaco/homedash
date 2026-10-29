/**
 * `gitread` contre git lui-même, sur de vrais dépôts temporaires : refs libres et
 * empaquetées, HEAD, en-têtes de commit, ahead/behind, amont, fichiers modifiés,
 * et les objets des packs, deltas `ofs` ET `ref`. Exige git (`apk add git`).
 */

import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import * as gitread from '../server/gitread.ts'

const HAS_GIT = spawnSync('git', ['--version']).status === 0

let tmp: string
let repo: string
let env: NodeJS.ProcessEnv
let clock: number
const opened: gitread.Repo[] = []

function run(cwd: string, args: string[], extra: NodeJS.ProcessEnv = {}): string {
  return execFileSync('git', args, { cwd, env: { ...env, ...extra }, encoding: 'utf-8' }).trim()
}
const git = (...args: string[]) => run(repo, args)

function commit(msg: string, files?: Record<string, string>): string {
  // Commits horodatés à la main : ahead/behind trie par date.
  for (const [name, content] of Object.entries(files || { [`${msg}.txt`]: msg })) {
    const p = path.join(repo, name)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, content)
    git('add', name)
  }
  clock += 60
  run(repo, ['commit', '-q', '-m', msg], { GIT_AUTHOR_DATE: `${clock} +0000`, GIT_COMMITTER_DATE: `${clock} +0000` })
  return git('rev-parse', 'HEAD')
}

function open(dir = repo): gitread.Repo {
  const r = new gitread.Repo(dir)
  opened.push(r)
  return r
}

function gitRefs(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of git('for-each-ref', '--format=%(refname) %(objectname)').split('\n')) {
    const [name, sha] = line.split(' ')
    if (name && !name.endsWith('/HEAD')) out[name] = sha
  }
  return out
}

/** main 3 commits, feature 2 commits partis du 1er, un merge de `merged`, origin/main un commit derrière. */
function buildHistory(): void {
  const base = commit('init')
  git('switch', '-q', '-c', 'feature')
  commit('f1')
  commit('f2')
  git('switch', '-q', 'main')
  const behind = commit('m1')
  commit('m2')
  git('switch', '-q', '-c', 'merged', base)
  commit('g1')
  git('switch', '-q', 'main')
  clock += 60
  run(repo, ['merge', '-q', '--no-ff', '-m', 'merge merged', 'merged'], { GIT_AUTHOR_DATE: `${clock} +0000`, GIT_COMMITTER_DATE: `${clock} +0000` })
  git('update-ref', 'refs/remotes/origin/main', behind)
  git('update-ref', 'refs/remotes/origin/feature', git('rev-parse', 'feature~1'))
  git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main')
  git('config', 'branch.feature.remote', 'origin')
  git('config', 'branch.feature.merge', 'refs/heads/feature')
}

function assertMatchesGit(r: gitread.Repo): void {
  expect(r.refs).toEqual(gitRefs())
  for (const name of git('for-each-ref', '--format=%(refname:short)', 'refs/heads').split('\n')) {
    const sha = git('rev-parse', name)
    const info = r.commit(sha)
    expect(info, name).not.toBeNull()
    expect(info?.subject).toBe(git('log', '-1', '--format=%s', sha))
    expect(info?.author).toBe(git('log', '-1', '--format=%an', sha))
    expect(info?.time).toBe(Number(git('log', '-1', '--format=%ct', sha)))
    expect(info?.parents).toEqual(git('log', '-1', '--format=%P', sha).split(/\s+/).filter(Boolean))
  }
  for (const [a, b] of [
    ['feature', 'main'],
    ['main', 'origin/main'],
    ['merged', 'main'],
    ['feature', 'origin/feature'],
    ['main', 'feature'],
  ]) {
    const [left, right] = git('rev-list', '--left-right', '--count', `${a}...${b}`).split(/\s+/).map(Number)
    const [ahead, behind, capped] = r.aheadBehind(git('rev-parse', a), git('rev-parse', b))
    expect([ahead, behind], `${a}...${b}`).toEqual([left, right])
    expect(capped).toBe(false)
  }
}

/** Un gros fichier modifié à la marge à chaque commit : force des chaînes de deltas. */
function bigHistory(): void {
  const lines = Array.from({ length: 400 }, (_, i) => `ligne ${i} ` + 'x'.repeat(60))
  for (let n = 0; n < 12; n++) {
    lines[n * 7] = `modifiée au commit ${n}`
    commit(`c${n}`, { 'gros.txt': lines.join('\n') + '\n', [`dir/f${n}.txt`]: `${n}\n` })
  }
}

function packTypes(): Set<number> {
  const dir = path.join(repo, '.git/objects/pack')
  const types = new Set<number>()
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.pack'))) {
    const data = fs.readFileSync(path.join(dir, name))
    for (const line of git('verify-pack', '-v', path.join(dir, name.replace(/\.pack$/, '.idx'))).split('\n')) {
      const parts = line.split(/\s+/)
      if (parts.length >= 5 && parts[0].length === 40) types.add((data[Number(parts[4])] >> 4) & 7)
    }
  }
  return types
}

function assertObjectsReadable(): void {
  const r = open()
  const shas = git('rev-list', '--objects', '--all')
    .split('\n')
    .filter(Boolean)
    .map((s) => s.split(' ')[0])
  const objects = path.join(repo, '.git/objects')
  const loose = fs.readdirSync(objects).filter((d) => /^[0-9a-f]{2}$/.test(d) && fs.readdirSync(path.join(objects, d)).length)
  expect(loose, 'il reste des objets libres : le test ne lit pas les packs').toEqual([])
  for (const sha of shas) {
    const kind = git('cat-file', '-t', sha)
    const found = r.rawObject(sha)
    expect(found, sha).not.toBeNull()
    const expected = execFileSync('git', ['cat-file', kind, sha], { cwd: repo, env })
    expect(found?.[1].equals(expected), `${kind} ${sha}`).toBe(true)
  }
  assertMatchesGit(r)
}

describe.skipIf(!HAS_GIT)('gitread contre git', () => {
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'homedash-gitread-'))
    repo = path.join(tmp, 'repo')
    fs.mkdirSync(repo)
    // Aucune config de l'utilisateur (signature, hooks, modèles…).
    env = {
      ...process.env,
      HOME: tmp,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: path.join(tmp, 'gitconfig'),
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 't@example.com',
    }
    clock = 1_700_000_000
    git('init', '-q', '-b', 'main')
    git('config', 'commit.gpgsign', 'false')
    git('config', 'remote.origin.url', 'git@github.com:mon-org/api.git')
  })
  afterEach(() => {
    for (const r of opened.splice(0)) r.close()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('refs libres, HEAD et commits', () => {
    buildHistory()
    const r = open()
    assertMatchesGit(r)
    expect(r.head()).toEqual(['main', git('rev-parse', 'main')])
    expect(r.defaultBranch()).toBe('main')
    expect(r.remoteUrl()).toBe('git@github.com:mon-org/api.git')
    expect(r.upstreamOf('feature')).toBe('origin/feature')
    expect(r.upstreamOf('merged')).toBeNull()
  })
  it('refs empaquetées', () => {
    buildHistory()
    git('pack-refs', '--all')
    expect(fs.existsSync(path.join(repo, '.git/refs/heads/feature'))).toBe(false)
    assertMatchesGit(open())
  })
  it('un ref libre prime sur le ref empaqueté', () => {
    buildHistory()
    git('pack-refs', '--all')
    git('update-ref', 'refs/heads/feature', git('rev-parse', 'main'))
    expect(open().refs['refs/heads/feature']).toBe(git('rev-parse', 'main'))
  })
  it('HEAD détachée', () => {
    buildHistory()
    const sha = git('rev-parse', 'feature~1')
    git('switch', '-q', '--detach', sha)
    expect(open().head()).toEqual([null, sha])
  })
  it('dépôt vide', () => {
    const r = open()
    expect(r.head()).toEqual(['main', null])
    expect(r.refs).toEqual({})
  })
  it('plafond du parcours', () => {
    buildHistory()
    expect(open().aheadBehind(git('rev-parse', 'feature'), git('rev-parse', 'main'), 1)[2]).toBe(true)
  })
  it('pack avec deltas ofs', () => {
    bigHistory()
    buildHistory()
    git('repack', '-adf', '-q')
    git('prune')
    expect(packTypes().has(6)).toBe(true)
    assertObjectsReadable()
  })
  it('pack avec deltas ref', () => {
    bigHistory()
    buildHistory()
    git('-c', 'repack.useDeltaBaseOffset=false', 'repack', '-adf', '-q')
    git('prune')
    const types = packTypes()
    expect(types.has(7)).toBe(true)
    expect(types.has(6)).toBe(false)
    assertObjectsReadable()
  })
  it('un clone frais se lit entièrement depuis les packs', () => {
    bigHistory()
    buildHistory()
    const clone = path.join(tmp, 'clone')
    run(tmp, ['clone', '-q', '--no-local', repo, clone])
    const r = open(clone)
    const head = run(clone, ['rev-parse', 'HEAD'])
    expect(r.head()[1]).toBe(head)
    expect(r.commit(head)).not.toBeNull()
    expect(r.defaultBranch()).toBe('main')
    expect(r.refs['refs/remotes/origin/feature']).toBe(run(clone, ['rev-parse', 'origin/feature']))
  })
  it('fichiers modifiés comptés comme git status', async () => {
    commit('a', { 'a.txt': 'a\n', 'b.txt': 'b\n', 'c.txt': 'c\n', 'd.txt': 'd\n', 'sub/e.txt': 'e\n' })
    expect(open().modified()).toEqual({ known: true, count: 0, capped: false })
    await new Promise((r) => setTimeout(r, 1100)) // mtime distinct de celui de l'index
    fs.writeFileSync(path.join(repo, 'a.txt'), 'a modifié\n') // taille changée
    fs.writeFileSync(path.join(repo, 'b.txt'), 'B\n') // même taille
    fs.rmSync(path.join(repo, 'c.txt')) // supprimé
    const now = new Date()
    fs.utimesSync(path.join(repo, 'd.txt'), now, now) // touché, identique
    fs.writeFileSync(path.join(repo, 'nouveau.txt'), 'non suivi\n') // hors périmètre
    const got = open().modified() // AVANT git status, qui réécrit l'index
    expect(got.known).toBe(true)
    expect(got.count).toBe(3)
    expect(git('status', '--porcelain', '--untracked-files=no').split('\n').filter((l) => l.trim()).length).toBe(3)
  })
  it("gitread n'écrit jamais", () => {
    bigHistory()
    buildHistory()
    git('repack', '-ad', '-q')
    fs.writeFileSync(path.join(repo, 'gros.txt'), 'modifié\n')
    const snapshot = () => {
      const out: Record<string, string> = {}
      const walk = (d: string) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name)
          if (e.isDirectory()) walk(p)
          else {
            const st = fs.statSync(p, { bigint: true })
            out[p] = `${st.mtimeNs}:${st.size}`
          }
        }
      }
      walk(path.join(repo, '.git'))
      return out
    }
    const before = snapshot()
    const r = new gitread.Repo(repo)
    void r.refs
    r.head()
    r.defaultBranch()
    r.modified()
    r.stashCount()
    for (const sha of Object.values(r.refs)) r.commit(sha)
    r.aheadBehind(git('rev-parse', 'feature'), git('rev-parse', 'main'))
    r.close()
    expect(snapshot()).toEqual(before)
  })
  it('découverte et empreinte', async () => {
    commit('a')
    const nested = path.join(repo, 'vendor-lib')
    fs.mkdirSync(nested)
    run(nested, ['init', '-q'])
    fs.mkdirSync(path.join(tmp, 'node_modules', 'x'), { recursive: true })
    run(path.join(tmp, 'node_modules', 'x'), ['init', '-q'])
    expect(new Set(gitread.discover(tmp, new Set(['node_modules']), 3))).toEqual(new Set([repo, nested]))
    const before = gitread.signature(repo)
    await new Promise((r) => setTimeout(r, 10))
    fs.writeFileSync(path.join(repo, '.git', 'FETCH_HEAD'), '')
    expect(gitread.whatChanged(before, gitread.signature(repo))).toBe('git fetch')
  })
})
