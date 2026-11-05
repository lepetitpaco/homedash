import { describe, expect, it } from 'vitest'
import { cellsOf, daysFor, inPeriod, lastMonths, monthBounds, monthKey, monthLabel, monthsBetween, projectRowsOf, projectsOf, rate, rowsOf, sortRows, type SortKey, type StatItem } from '../src/lib/bcStats'

const it_ = (id: number, who: string, project: number, done: boolean, who_id: number | null = null, day = '2026-10-01'): StatItem => ({
  id,
  kind: 'todo',
  title: `T${id}`,
  url: '',
  who,
  who_id,
  project: `P${project}`,
  project_id: project,
  created_at: `${day}T08:00:00Z`,
  done,
})

const ITEMS = [it_(1, 'Léa', 1, true, 7), it_(2, 'Léa', 2, false, 7), it_(3, 'Max', 1, true), it_(4, 'Max', 1, true, null, '2026-10-05'), it_(5, 'Léa B.', 2, true, 7)]

describe('stats Basecamp', () => {
  it('cumul : une ligne par créateur, celui qui a le plus créé d’abord', () => {
    const rows = rowsOf(ITEMS)
    expect(rows.map((r) => [r.who, r.created, r.done])).toEqual([
      ['Léa', 3, 2], // même id, nom changé : même personne
      ['Max', 2, 2],
    ])
    // faites d'abord, puis la plus récente
    expect(rows[1].items.map((i) => i.id)).toEqual([4, 3])
  })

  it('par projet', () => {
    expect(rowsOf(ITEMS, 2).map((r) => [r.who, r.created, r.done])).toEqual([['Léa', 2, 1]])
    expect(projectsOf(ITEMS)).toEqual([
      { id: 1, name: 'P1', created: 3, done: 3 },
      { id: 2, name: 'P2', created: 2, done: 1 },
    ])
  })

  it('pourcentage', () => {
    expect([rate(2, 3), rate(0, 0), rate(5, 5)]).toEqual([67, 0, 100])
  })
})

describe('vue par projet et tri', () => {
  it('une ligne par projet', () => {
    expect(projectRowsOf(ITEMS).map((r) => [r.who, r.created, r.done])).toEqual([
      ['P1', 3, 3],
      ['P2', 2, 1],
    ])
  })

  it('tri sur chaque colonne, dans les deux sens, sans toucher à la liste', () => {
    const rows = rowsOf(ITEMS) // Léa 3/2, Max 2/2
    const names = (k: SortKey, desc: boolean) => sortRows(rows, k, desc).map((r) => r.who)
    expect(names('name', false)).toEqual(['Léa', 'Max'])
    expect(names('name', true)).toEqual(['Max', 'Léa'])
    expect(names('created', true)).toEqual(['Léa', 'Max'])
    expect(names('rate', true)).toEqual(['Max', 'Léa'])
    expect(names('done', true)).toEqual(['Léa', 'Max']) // égalité : par nom
    expect(rows.map((r) => r.who)).toEqual(['Léa', 'Max'])
  })
})

describe('mois et périodes', () => {
  it('mois locaux, bornes, derniers mois', () => {
    expect(monthKey(new Date(2026, 0, 31, 23, 0))).toBe('2026-01')
    const [a, b] = monthBounds('2026-12')
    expect([a.getMonth(), a.getDate(), b.getFullYear(), b.getMonth()]).toEqual([11, 1, 2027, 0])
    expect(lastMonths(3, new Date(2026, 0, 15))).toEqual(['2026-01', '2025-12', '2025-11'])
    expect(monthsBetween(new Date(2025, 10, 20), new Date(2026, 1, 1))).toEqual(['2025-11', '2025-12', '2026-01'])
    expect(monthLabel('2026-10', true, new Date(2026, 5, 1))).toBe('oct.')
    expect(monthLabel('2025-10', true, new Date(2026, 5, 1))).toBe('oct. 2025')
  })

  it('période du serveur : la plus petite qui couvre le début', () => {
    const now = new Date(2026, 10, 2)
    expect(daysFor(new Date(2026, 9, 30), now)).toBe(7)
    expect(daysFor(new Date(2026, 9, 1), now)).toBe(90)
    expect(daysFor(new Date(2025, 0, 1), now, [7, 30, 90, 365, 400])).toBe(400)
  })

  it('par mois : créées et faites ; tri sur un mois = créées ce mois-là', () => {
    const items = [it_(1, 'Léa', 1, true, 7, '2026-09-10'), it_(2, 'Max', 1, false, null, '2026-10-02'), it_(3, 'Max', 1, true, null, '2026-10-03')]
    expect([...cellsOf(items)].map(([m, c]) => [m, c.created, c.done])).toEqual([
      ['2026-09', 1, 1],
      ['2026-10', 2, 1],
    ])
    expect(sortRows(rowsOf(items), 'm:2026-09', true).map((r) => r.who)).toEqual(['Léa', 'Max'])
    expect(sortRows(rowsOf(items), 'm:2026-10', true).map((r) => r.who)).toEqual(['Max', 'Léa'])
    expect(inPeriod(items, new Date('2026-10-01T00:00:00Z'), new Date('2026-11-01T00:00:00Z')).map((i) => i.id)).toEqual([2, 3])
  })
})
