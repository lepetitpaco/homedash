/** Ouvrir d'un clic les liens d'un groupe de branche (cartes PRs ouvertes et Branches, issue #127). */

import { describe, expect, it } from 'vitest'

import { linksToOpen, openAll } from '../src/lib/openTabs.ts'

const pr = (repo: string, n: number) => `https://github.com/Nutravalia/${repo}/pull/${n}`

describe('ouvrir les liens d’un groupe de branche', () => {
  it('garde l’ordre d’affichage, sans doublon ni lien vide', () => {
    expect(linksToOpen([pr('admin', 3043), null, pr('base-site', 1839), '', pr('admin', 3043), undefined, pr('cron', 2628)])).toEqual([
      pr('admin', 3043),
      pr('base-site', 1839),
      pr('cron', 2628),
    ])
  })

  it('n’ouvre que du http(s)', () => {
    expect(linksToOpen(['javascript:alert(1)', 'file:///etc/passwd', 'HTTPS://github.com/a/b/pull/1'])).toEqual([
      'HTTPS://github.com/a/b/pull/1',
    ])
  })

  it('ouvre chaque lien une fois', () => {
    const ouverts: string[] = []
    const r = openAll([pr('admin', 3043), pr('base-site', 1839), pr('admin', 3043)], (u) => {
      ouverts.push(u)
      return true
    })
    expect(ouverts).toEqual([pr('admin', 3043), pr('base-site', 1839)])
    expect(r).toEqual({ opened: 2, blocked: [] })
  })

  it('un onglet bloqué par le navigateur n’empêche pas les suivants, et il est signalé', () => {
    const r = openAll([pr('admin', 3043), pr('base-site', 1839), pr('cron', 2628)], (u) => u === pr('admin', 3043))
    expect(r.opened).toBe(1)
    expect(r.blocked).toEqual([pr('base-site', 1839), pr('cron', 2628)])
  })

  it('rien à ouvrir : rien n’est appelé', () => {
    let appels = 0
    expect(openAll([null, ''], () => ++appels > 0)).toEqual({ opened: 0, blocked: [] })
    expect(appels).toBe(0)
  })
})
