import { describe, expect, it } from 'vitest'
import { adviceFor, CATALOG, catalogBackground, catalogTab, pauseChoice, pauseDefault, pauseHiddenOf } from '../src/lib/catalog.ts'
import { hiddenPauseWanted } from '../src/lib/splitView.ts'
import * as store from '../server/store.ts'

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
    expect(tab('Instagram')).toMatchObject({ preload: true })
    expect(tab('Instagram').sleep).toBeUndefined()
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
    // déjà effectif par le catalogue (sans clé) : rien à proposer
    expect(adviceFor(direct)).toBeNull()
    expect(adviceFor({ ...direct, pauseHidden: false })).toBeNull()
    // un réglage manuel contraire : proposé de revenir au catalogue en RETIRANT la clé
    const adv = adviceFor({ ...direct, pauseHidden: true })
    expect(adv && 'pauseHidden' in adv.patch ? adv.patch.pauseHidden : 'absent').toBeUndefined()
    expect(adv?.changes.join()).toMatch(/jamais de pause/)
  })

  it('un raccourci ne capte pas les liens de son site', () => {
    expect(catalogTab(sites.find((s) => s.label === 'Instagram Direct')!).capture).toBe(false)
    expect(catalogTab(sites.find((s) => s.label === 'Instagram')!).capture).toBeUndefined()
  })

  describe('pause quand je n’y suis pas (#175)', () => {
    const BACKGROUND = [
      'YouTube', 'YouTube Music', 'Spotify', 'Deezer', 'Apple Music', 'SoundCloud', 'Twitch', 'Netflix', 'Plex',
      'Meet', 'Zoom', 'Teams', 'Discord', 'Slack', 'Google Chat', 'WhatsApp', 'Messenger', 'Telegram', 'Element',
      'Instagram Direct', 'Messages X', 'Messagerie LinkedIn', 'Chat Reddit',
    ]
    const SCROLL = ['X', 'Instagram', 'Facebook', 'LinkedIn', 'TikTok', 'Reddit', 'Bluesky', 'Threads', 'Mastodon', 'Pinterest', 'Snapchat']

    it('tout le catalogue : exceptions en fond, tout le reste en pause', () => {
      for (const s of sites) {
        const t = { id: 'c', ...catalogTab(s) }
        const bg = BACKGROUND.includes(s.label)
        expect(!!s.background, s.label).toBe(bg)
        expect(pauseHiddenOf(t), s.label).toBe(!bg)
        // sans la clé (site existant, config ancienne) : même décision, reconnue par l'adresse
        const { pauseHidden: _ignored, ...old } = t
        expect(pauseHiddenOf(old), `${s.label} sans clé`).toBe(!bg)
        expect(catalogBackground(old), s.label).toBe(bg)
      }
      for (const l of BACKGROUND) expect(sites.some((s) => s.label === l), l).toBe(true)
      for (const l of SCROLL) expect(pauseHiddenOf({ id: 'c', ...catalogTab(sites.find((s) => s.label === l)!) }), l).toBe(true)
    })

    it('catalogTab écrit pauseHidden: false seulement pour un site qui joue en fond', () => {
      for (const s of sites) {
        const t = catalogTab(s)
        if (BACKGROUND.includes(s.label)) expect(t.pauseHidden, s.label).toBe(false)
        else expect('pauseHidden' in t, s.label).toBe(false)
      }
    })

    it('le réglage explicite prime ; un lien perso inconnu est en pause', () => {
      expect(pauseHiddenOf({ id: 'a', label: 'Radio', url: 'https://radio.exemple.test/', embed: true })).toBe(true)
      expect(pauseHiddenOf({ id: 'a', label: 'Radio', url: 'https://radio.exemple.test/', embed: true, pauseHidden: false })).toBe(false)
      expect(pauseHiddenOf({ id: 'b', label: 'YT', url: 'https://www.youtube.com/watch?v=1', embed: true, pauseHidden: true })).toBe(true)
      expect(pauseHiddenOf({ id: 'b', label: 'YT', url: 'https://www.youtube.com/', embed: true })).toBe(false)
    })

    it('adviceFor propose le bon réglage, jamais pour un site déjà conforme', () => {
      const yt = { id: 'y', label: 'YT', url: 'https://www.youtube.com/', embed: true, preload: false, icon: 'x' }
      // sans clé, le catalogue donne déjà « joue en fond » : rien à proposer (pas de changement déjà effectif)
      expect(adviceFor(yt)).toBeNull()
      // un réglage manuel contraire : retour au catalogue en retirant la clé
      expect(adviceFor({ ...yt, pauseHidden: true })).toEqual({ patch: { pauseHidden: undefined }, changes: ['joue en fond (jamais de pause)'] })
      expect(adviceFor({ ...yt, pauseHidden: false })).toBeNull()
      const fb = { id: 'f', label: 'FB', url: 'https://www.facebook.com/', embed: true, preload: false, sleep: true, icon: 'x' }
      expect(adviceFor(fb)).toBeNull()
      expect(adviceFor({ ...fb, pauseHidden: false })?.patch).toEqual({ pauseHidden: undefined })
    })

    it('un site est caché hors de la grille ou quand un autre est affiché', () => {
      const ctx = { open: false, shown: [], tab: 'x:a', searching: false }
      expect(hiddenPauseWanted('x:a', true, ctx)).toBe(false)
      expect(hiddenPauseWanted('x:b', true, ctx)).toBe(true)
      expect(hiddenPauseWanted('x:b', false, ctx)).toBe(false)
      expect(hiddenPauseWanted('x:a', true, { ...ctx, tab: 'links' })).toBe(true)
      expect(hiddenPauseWanted('x:a', true, { ...ctx, searching: true })).toBe(true)
      const open = { open: true, shown: ['x:a', 'copy:1'], tab: 'x:a', searching: false }
      expect(hiddenPauseWanted('x:a', true, open)).toBe(false)
      expect(hiddenPauseWanted('x:c', true, open)).toBe(true)
      expect(hiddenPauseWanted('copy:1', true, open)).toBe(false)
    })

    it('la config valide la clé : ancienne config sans clé acceptée, valeur invalide refusée', () => {
      const tab = { id: 'a', label: 'A', url: 'https://a.test/' }
      expect(store.validateConfig({ groups: [], tabs: [tab] })).toBeNull()
      expect(store.validateConfig({ groups: [], tabs: [{ ...tab, pauseHidden: false }] })).toBeNull()
      expect(store.validateConfig({ groups: [], tabs: [{ ...tab, pauseHidden: 'non' }] })).toContain('pauseHidden')
    })
  })

  it('choisir « Oui / Non » retire la clé quand le choix égale le défaut du catalogue', () => {
    const gmailLike = { id: 'x-1', label: 'DM', url: 'https://www.instagram.com/direct/inbox/', embed: true }
    const x = { id: 'x-2', label: 'X', url: 'https://x.com/', embed: true }
    expect(pauseDefault(gmailLike)).toBe(false)
    expect(pauseChoice(gmailLike, false)).toBeUndefined()
    expect(pauseChoice(gmailLike, true)).toBe(true)
    expect(pauseDefault(x)).toBe(true)
    expect(pauseChoice(x, true)).toBeUndefined()
    expect(pauseChoice(x, false)).toBe(false)
  })
})
