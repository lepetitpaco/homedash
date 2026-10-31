import { describe, expect, it } from 'vitest'
import { adviceFor, CATALOG, catalogTab } from '../src/lib/catalog.ts'

const sites = CATALOG.flatMap((g) => g.sites)

describe('catalogue de sites', () => {
  it('une adresse et un nom une seule fois', () => {
    expect(new Set(sites.map((s) => s.url)).size).toBe(sites.length)
    expect(new Set(sites.map((s) => s.label)).size).toBe(sites.length)
  })

  it('applique le réglage recommandé', () => {
    const tab = (label: string) => catalogTab(sites.find((s) => s.label === label)!)
    expect(tab('Gmail')).toMatchObject({ embed: true, preload: true })
    expect(tab('Gmail').sleep).toBeUndefined()
    expect(tab('Reddit')).toMatchObject({ preload: false, sleep: true })
    expect(tab('Spotify').preload).toBe(false)
    expect(tab('Spotify').sleep).toBeUndefined()
  })

  it('conseille un onglet existant sans toucher à son nom, son adresse ni son icône', () => {
    const facebook = { id: 'x-1', label: 'Mon FB', url: 'https://www.facebook.com/', embed: true, icon: '📘' }
    const advice = adviceFor(facebook)!
    expect(advice.patch).toEqual({ preload: false, sleep: true })
    expect(advice.changes).toEqual(['chargé au 1er clic', 'mise en veille'])
    expect(adviceFor({ id: 'x-2', label: 'Gmail', url: 'https://mail.google.com/', embed: true })?.patch).toEqual({ icon: catalogTab(sites.find((s) => s.label === 'Gmail')!).icon })
  })

  it('reste muet si rien ne change, ou si le site est inconnu', () => {
    const gmail = catalogTab(sites.find((s) => s.label === 'Gmail')!)
    expect(adviceFor({ id: 'x-3', ...gmail })).toBeNull()
    expect(adviceFor({ id: 'x-4', label: 'Maison', url: 'https://exemple.test/', embed: true })).toBeNull()
    expect(adviceFor({ id: 'x-5', label: 'FB', url: 'https://www.facebook.com/', embed: false })).toBeNull()
  })

  it('reconnaît un raccourci avant son site', () => {
    const direct = { id: 'x-6', label: 'DM', url: 'https://www.instagram.com/direct/inbox/', embed: true, icon: 'x' }
    expect(adviceFor(direct)).toBeNull()
  })

  it('un raccourci ne capte pas les liens de son site', () => {
    expect(catalogTab(sites.find((s) => s.label === 'Instagram Direct')!).capture).toBe(false)
    expect(catalogTab(sites.find((s) => s.label === 'Instagram')!).capture).toBeUndefined()
  })
})
