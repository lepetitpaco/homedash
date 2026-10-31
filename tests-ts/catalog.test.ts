import { describe, expect, it } from 'vitest'
import { CATALOG, catalogTab } from '../src/lib/catalog.ts'

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

  it('un raccourci ne capte pas les liens de son site', () => {
    expect(catalogTab(sites.find((s) => s.label === 'Instagram Direct')!).capture).toBe(false)
    expect(catalogTab(sites.find((s) => s.label === 'Instagram')!).capture).toBeUndefined()
  })
})
