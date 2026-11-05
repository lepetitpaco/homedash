import { describe, expect, it } from 'vitest'
import { shouldShowWhatsNew, WHATS_NEW, whatsNewSince, withKeys, type WhatsNewCard } from '../src/lib/whatsNew'
import { SETTINGS_INDEX } from '../src/lib/settingsIndex'

const card = (id: string, o: Partial<WhatsNewCard> = {}): WhatsNewCard => ({ id, icon: '✨', title: id, text: id, ...o })
const table = {
  '2.4.0': [card('a')],
  '2.5.0': [card('b'), card('gh', { feature: 'github' }), card('ext', { desktop: 'extensions' })],
  '2.6.0': [card('c')],
}

describe('Quoi de neuf', () => {
  it('les versions après celle d’avant, jusqu’à l’actuelle, la plus récente d’abord', () => {
    expect(whatsNewSince('2.4.1', '2.6.0', {}, null, table).map((v) => v.version)).toEqual(['2.6.0', '2.5.0'])
    expect(whatsNewSince('2.5.0', '2.5.0', {}, null, table)).toEqual([])
    expect(whatsNewSince('2.3.0', '2.4.0', {}, null, table).map((v) => v.version)).toEqual(['2.4.0'])
  })
  it('sans les fonctionnalités coupées ni ce que l’appli n’a pas', () => {
    const ids = (on = {}, f: string[] | null = null) => whatsNewSince('2.4.1', '2.5.0', on, f, table)[0].cards.map((c) => c.id)
    expect(ids()).toEqual(['b', 'gh'])
    expect(ids({ github: false })).toEqual(['b'])
    expect(ids({}, ['extensions'])).toEqual(['b', 'gh', 'ext'])
  })
  it('une version sans carte restante disparaît', () => {
    expect(whatsNewSince('2.4.1', '2.5.0', { github: false }, null, { '2.5.0': [card('gh', { feature: 'github' })] })).toEqual([])
  })
  it('ouverte seule : après une vraie mise à jour, une fois par version', () => {
    const v = whatsNewSince('2.4.1', '2.5.0', {}, null, table)
    expect(shouldShowWhatsNew('2.4.1', '2.5.0', null, v)).toBe(true)
    expect(shouldShowWhatsNew('2.4.1', '2.5.0', '2.5.0', v)).toBe(false)
    expect(shouldShowWhatsNew(null, '2.5.0', null, v)).toBe(false) // première installation
    expect(shouldShowWhatsNew('2.4.1', '2.5.1', null, [])).toBe(false) // rien de neuf à montrer
  })
  it('le raccourci du mode focus selon la machine', () => {
    expect(withKeys('ou {focus} ici', true)).toBe('ou ⌘⇧F ici')
    expect(withKeys('ou {focus} ici', false)).toBe('ou Ctrl+Maj+F ici')
  })
  it('les vraies cartes : ids uniques, « Essayer » vers une partie de Réglages qui existe', () => {
    const sections = new Set(SETTINGS_INDEX.map((e) => e.section.split(':')[0]))
    for (const [version, cards] of Object.entries(WHATS_NEW)) {
      expect(version).toMatch(/^\d+\.\d+\.\d+$/)
      expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length)
      for (const c of cards) if (c.go && 'section' in c.go) expect(sections.has(c.go.section.split(':')[0])).toBe(true)
    }
  })
})
