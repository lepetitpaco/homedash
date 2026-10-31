import { describe, expect, it } from 'vitest'
import { formatMb, readMemory } from '../src/lib/tabMemory.ts'

describe('mémoire des sites', () => {
  it('écrit les tailles en Mo puis en Go', () => {
    expect(formatMb(312)).toBe('312 Mo')
    expect(formatMb(2867)).toBe('2,8 Go')
  })

  it('rapproche les webviews des onglets, sans compter deux fois un processus partagé', () => {
    const m = readMemory(
      { total_mb: 1000, tabs: { '1': { mb: 300, pid: 10 }, '2': { mb: 300, pid: 10 }, '3': { mb: 100, pid: 11 }, '4': { mb: 50, pid: 12 } } },
      (guest) => ({ '1': 'a', '2': 'b', '3': 'c' } as Record<string, string>)[guest],
    )
    expect(m.total).toBe(1000)
    expect(m.sites).toBe(450)
    expect(m.tabs).toEqual({ a: { mb: 300, shared: true }, b: { mb: 300, shared: true }, c: { mb: 100, shared: false } })
  })
})
