/** Sites à lire à gauche de la cloche, barres masquées (issue #130). */

import { describe, expect, it } from 'vitest'

import { unreadSites } from '../src/lib/unreadSites.ts'

type T = { id: string; embed?: boolean; notify?: boolean }
const key = (t: T) => `x:${t.id}`
const tabs: T[] = [
  { id: 'gmail', embed: true },
  { id: 'chat', embed: true },
  { id: 'muet', embed: true, notify: false },
  { id: 'dehors', embed: false },
  { id: 'discord', embed: true },
  { id: 'wiki', embed: true },
]
const counts = { 'x:gmail': 2, 'x:chat': 9, 'x:muet': 5, 'x:dehors': 4, 'x:discord': 2, 'x:wiki': 0 }

describe('unreadSites', () => {
  it('le plus chargé d’abord, puis l’ordre de la barre ; sans les coupés, les sites du navigateur ni les zéros', () => {
    expect(unreadSites(tabs, counts, key, null).map((s) => [s.tab.id, s.n])).toEqual([
      ['chat', 9],
      ['gmail', 2],
      ['discord', 2],
    ])
  })
  it('sans le site affiché', () => {
    expect(unreadSites(tabs, counts, key, 'x:chat').map((s) => s.tab.id)).toEqual(['gmail', 'discord'])
  })
  it('rien à lire : liste vide', () => {
    expect(unreadSites(tabs, {}, key, null)).toEqual([])
  })
})
