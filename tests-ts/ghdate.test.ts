/** Dates des cartes GitHub en heure locale (issue #140). Dates construites en heure locale : le test vaut sous tout fuseau. */

import { describe, expect, it } from 'vitest'

import { ghDate, ghDateFull } from '../src/lib/ghDate.ts'

const now = new Date(2026, 10, 5, 17, 30) // jeudi 5 novembre 2026, 17:30 locale
const at = (...a: [number, number, number, number, number]) => new Date(...a).toISOString()

describe('ghDate', () => {
  it('aujourd’hui : l’heure seule, en heure locale (pas UTC)', () => {
    expect(ghDate(at(2026, 10, 5, 9, 5), now)).toBe('09:05')
  })
  it('hier, y compris à cheval sur un mois', () => {
    expect(ghDate(at(2026, 10, 4, 23, 59), now)).toBe('hier 23:59')
    expect(ghDate(at(2026, 9, 31, 8, 0), new Date(2026, 10, 1, 10, 0))).toBe('hier 08:00')
  })
  it('plus ancien : jour et mois, l’année si elle diffère', () => {
    expect(ghDate(at(2026, 10, 3, 14, 12), now)).toBe('3 nov. 14:12')
    expect(ghDate(at(2025, 11, 31, 14, 12), now)).toBe('31 déc. 2025')
  })
  it('vide si absente ou illisible', () => {
    expect(ghDate(null, now)).toBe('')
    expect(ghDate('pas une date', now)).toBe('')
    expect(ghDateFull(undefined)).toBe('')
  })
  it('bulle : la date complète', () => {
    expect(ghDateFull(at(2026, 10, 5, 14, 12))).toBe('jeudi 5 novembre 2026 à 14:12')
  })
})
