import { describe, expect, it } from 'vitest'
import { rank } from '../src/lib/search'
import { settingsEntries, SETTINGS_INDEX } from '../src/lib/settingsIndex'

const find = (q: string, on = {}) =>
  rank(settingsEntries(on), (e) => [
    [e.label, 1],
    [e.keywords, 0.6],
  ], q, 3).map((e) => e.section)

describe('la recherche trouve les Réglages', () => {
  it.each([
    ['sauvegarde', 'set-backups'],
    ['restaurer', 'set-backups'],
    ['jeton', 'set-github:account'],
    ['token', 'set-github:account'],
    ['veille', 'set-tabs:more'],
    ['disposition', 'set-bars'],
    ['soulignés', 'set-bars'],
    ['notifications', 'set-notifs'],
    ['largeur', 'set-display'],
    ['docker', 'set-tabs:docker'],
    ['erreurs', 'help-diag'],
    ['guide', 'help-guide'],
    ['localhost', 'set-features'],
  ])('« %s » → %s', (q, section) => {
    expect(find(q)[0]).toBe(section)
  })

  it('une fonctionnalité coupée n’a pas d’entrée', () => {
    expect(find('basecamp', { basecamp: false })).not.toContain('set-basecamp')
    expect(find('basecamp')).toContain('set-basecamp')
  })

  it('ids uniques', () => {
    expect(new Set(SETTINGS_INDEX.map((e) => e.id)).size).toBe(SETTINGS_INDEX.length)
  })
})
