import { describe, expect, it } from 'vitest'

import { orderSites, stepIndex, touchRecent } from '../src/lib/siteSwitch.ts'

describe('changer de site au clavier', () => {
  it('met le dernier site utilisé en tête, sans doublon', () => {
    expect(touchRecent(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b'])
    expect(touchRecent([], 'a')).toEqual(['a'])
  })

  it('retire les sites disparus et ajoute les nouveaux à la fin', () => {
    expect(orderSites(['c', 'gone', 'a'], ['a', 'b', 'c', 'd'])).toEqual(['c', 'a', 'b', 'd'])
  })

  it('tourne en boucle dans les deux sens', () => {
    expect(stepIndex(0, 3, 'next')).toBe(1)
    expect(stepIndex(2, 3, 'next')).toBe(0)
    expect(stepIndex(0, 3, 'prev')).toBe(2)
    expect(stepIndex(0, 0, 'next')).toBe(0)
  })
})
