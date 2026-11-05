/** Cloche : niveaux par type et regroupement Renovate (issue #131). */

import { describe, expect, it } from 'vitest'

import { BELL_FAMILIES, cleanPrefs, familyOf, groupEvents, groupKey, levelOf, othersOf, unseenCount } from '../src/lib/bellPrefs.ts'

let seq = 0
const day = (h: number) => new Date(2026, 10, 5, h, 0).getTime() / 1000
const ev = (kind: string, repo: string, title: string, body = '', ts = day(10)) => ({
  seq: ++seq,
  ts,
  kind,
  level: 'info',
  source: 'github',
  repo,
  title,
  body,
  url: '',
  tag: `${kind}:${repo}`,
  sticky: false,
})
const renNew = (repo: string, v = '1.273.0', ts?: number) =>
  ev('ren-new', repo, `🤖 Renovate disponible — ${repo}`, `chore(deps): update base-site to v${v}`, ts)

describe('niveaux par type', () => {
  it('défaut = compté, comme avant', () => {
    expect(levelOf(undefined, 'pr-pass')).toBe('notify')
    expect(levelOf({}, 'ren-new')).toBe('notify')
  })
  it('suit la famille, et ignore une valeur inconnue', () => {
    const prefs = { renovate: 'quiet', 'ci-pass': 'hide', merged: 'bof' } as never
    expect(levelOf(prefs, 'rm-pass')).toBe('quiet')
    expect(levelOf(prefs, 'pr-pass')).toBe('hide')
    expect(levelOf(prefs, 'pr-merged')).toBe('notify')
  })
  it('mise à jour de homedash et type inconnu : hors réglage, toujours comptés', () => {
    expect(familyOf('update')).toBeNull()
    expect(levelOf({ renovate: 'hide' }, 'update')).toBe('notify')
  })
  it('chaque type du serveur a une seule famille', () => {
    const kinds = BELL_FAMILIES.flatMap((f) => f.kinds)
    expect(new Set(kinds).size).toBe(kinds.length)
  })
  it('cleanPrefs ne garde que les écarts au défaut', () => {
    expect(cleanPrefs({ renovate: 'quiet', merged: 'notify', local: 'x', autre: 'hide' })).toEqual({ renovate: 'quiet' })
    expect(cleanPrefs(null)).toEqual({})
  })
})

describe('regroupement Renovate', () => {
  it('une version, six repos : une ligne', () => {
    const list = ['admin', 'cron', 'api', 'web', 'pharmacie', 'site'].map((r) => renNew(r)).reverse()
    const groups = groupEvents(list)
    expect(groups).toHaveLength(1)
    expect(groups[0].head.repo).toBe('site')
    expect(othersOf(groups[0])).toEqual(['pharmacie', 'web', 'api', 'cron', 'admin'])
  })
  it('types ou versions différents : lignes séparées ; le reste n’est jamais regroupé', () => {
    const list = [renNew('a', '1.2.0'), renNew('b', '1.3.0'), ev('rm-new', 'a', '✅ Renovate mergée — a v1.2.0'), ev('pr-pass', 'a', '✓ CI pass — a #1'), ev('pr-pass', 'b', '✓ CI pass — b #2')]
    expect(groupEvents(list)).toHaveLength(5)
    expect(groupKey(ev('ren-new', 'a', 'Renovate', 'pas de version'))).toBeNull()
  })
  it('pas d’un jour sur l’autre', () => {
    const list = [renNew('a', '1.2.0', day(9)), renNew('b', '1.2.0', new Date(2026, 10, 4, 22).getTime() / 1000)]
    expect(groupEvents(list)).toHaveLength(2)
  })
  it('garde l’ordre (plus récent d’abord) entre les lignes', () => {
    const a = ev('pr-fail', 'x', '✗ CI fail — x #1')
    const list = [renNew('a'), a, renNew('b')]
    expect(groupEvents(list).map((g) => g.head)).toEqual([list[0], a])
  })
})

describe('compteur', () => {
  it('compte des lignes, sans les discrètes ni les déjà vues', () => {
    const old = ev('pr-fail', 'x', '✗ CI fail — x #1')
    // plus récent d'abord, comme le journal : `old` est le plus ancien
    const list = [old, renNew('a'), renNew('b'), renNew('c'), ev('pr-pass', 'x', '✓ CI pass — x #1')].reverse()
    const seen = old.seq
    expect(unseenCount(list, seen, {})).toBe(2)
    expect(unseenCount(list, seen, { 'ci-pass': 'quiet' })).toBe(1)
    expect(unseenCount(list, seen, { renovate: 'quiet', 'ci-pass': 'hide' })).toBe(0)
  })
})
