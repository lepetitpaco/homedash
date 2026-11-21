import { describe, expect, it } from 'vitest'
import { validateConfig } from '../server/store'
import { DEFAULT_SPLIT, withMode } from '../src/lib/splitView'
import { LAST_MAX, NAV_START, cleanUrl, navFail, navOk, copiesFor, copyFrame, isPageUrl, keepLast, notedUrl, sameLast, sameSite, startUrl, withLast, moveView, viewsAt, droppedSlots, makeView, newViewId, normalizeViews, removeView, renameView, siteNames, viewCounter, viewSlots } from '../src/lib/splitViews'
import type { CustomTab, TabSession } from '../src/types'

const tab = (id: string, label: string, session?: string): CustomTab => ({ id, label, url: `https://${id}.example`, embed: true, session })
const sites = [tab('x-a', 'X', 's-pro'), tab('x-b', 'X', 's-perso'), tab('x-c', 'Instagram'), tab('x-d', 'X')]
const sessions: TabSession[] = [
  { id: 's-pro', name: 'pro', color: '#1d4ed8' },
  { id: 's-perso', name: 'perso', color: '#15803d' },
]

describe('vues scindées enregistrées (#169)', () => {
  it('une config sans la clé, ou abîmée, donne aucune vue (défaut dans le code)', () => {
    expect(normalizeViews(undefined)).toEqual([])
    expect(normalizeViews('x')).toEqual([])
    expect(normalizeViews([null, 3, { id: 'a' }, { id: 'b', name: '  ' }])).toEqual([])
  })

  it('normalisation idempotente : id uniques, disposition connue, 4 cases au plus', () => {
    const raw = [
      { id: 'sv-1', name: ' Flux ', layout: 'nimporte', slots: ['x-a', 'x-b', 'x-c', 'x-d', 'x-e'], ratios: { '': [2, 1], bad: [1] } },
      { id: 'sv-1', name: 'Doublon', layout: 'c2', slots: [] },
    ]
    const once = normalizeViews(raw)
    expect(once).toHaveLength(1)
    expect(once[0]).toMatchObject({ id: 'sv-1', name: 'Flux', layout: 'c2', slots: ['x-a', 'x-b', null, null], ratios: { '': [2, 1] } })
    expect(normalizeViews(once)).toEqual(once)
  })

  it('on garde les sites, jamais un onglet temporaire', () => {
    const v = makeView('sv-1', 'Mix', 'c3', ['x:x-a', 'x:tmp-9', null], sites)
    expect(v.slots).toEqual(['x-a', null, null, null])
  })

  it('un site supprimé de Mes sites : la case est signalée, la vue ne casse pas', () => {
    const v = normalizeViews([{ id: 'sv-1', name: 'V', layout: 'c2', slots: ['x-a', 'x-zzz'] }])[0]
    const r = viewSlots(v, sites, 'classic')
    expect(r.keys).toEqual(['x:x-a', null, null, null])
    expect(r.gone).toEqual([false, true, false, false])
  })

  it('deux comptes d’un même site se distinguent dans le sélecteur', () => {
    const n = siteNames(sites, sessions)
    expect(n['x-a']).toBe('X · pro')
    expect(n['x-b']).toBe('X · perso')
    expect(n['x-c']).toBe('Instagram')
    expect(n['x-d']).toBe('X')
    // jamais deux entrées identiques
    const twins = siteNames([tab('x-1', 'X'), tab('x-2', 'X')], [])
    expect(new Set(Object.values(twins)).size).toBe(2)
  })

  it('« Garder cette vue » signale les cases qu’elle ne gardera pas (onglet temporaire, Docker)', () => {
    expect(droppedSlots(['x:x-a', 'x:tmp-9', 'x:dk-abc', null], sites)).toEqual([1, 2])
    expect(droppedSlots(['x:x-a', 'x:x-b', null, null], sites)).toEqual([])
  })

  it('compteur d’une vue : seulement les sites qui comptent comme le Dock', () => {
    const quiet = [tab('x-a', 'X'), { ...tab('x-b', 'X'), notify: false }, { ...tab('x-c', 'Doc'), embed: false }]
    const v = normalizeViews([{ id: 'sv-1', name: 'V', layout: 'c3', slots: ['x-a', 'x-b', 'x-c'] }])[0]
    expect(viewCounter(v, { 'x:x-a': 2, 'x:x-b': 5, 'x:x-c': 7 }, quiet, 'classic')).toBe(2)
  })

  it('compteur d’une vue : la somme de ses sites, chacun une fois', () => {
    const v = normalizeViews([{ id: 'sv-1', name: 'V', layout: 'c3', slots: ['x-a', 'x-b', 'x-a'] }])[0]
    expect(viewCounter(v, { 'x:x-a': 3, 'x:x-b': 4, 'x:x-c': 9 }, sites, 'classic')).toBe(7)
    expect(viewCounter(v, {}, sites, 'classic')).toBe(0)
  })

  it('renommer, supprimer, nouvel id', () => {
    const v = normalizeViews([{ id: 'sv-1', name: 'V', layout: 'c2', slots: [] }])
    expect(renameView(v, 'sv-1', ' Nouveau ')[0].name).toBe('Nouveau')
    expect(renameView(v, 'sv-1', '  ')[0].name).toBe('V')
    expect(removeView(v, 'sv-1')).toEqual([])
    expect(newViewId(['sv-1'])).toMatch(/^sv-/)
  })

  it('le serveur accepte les vues et refuse une config abîmée avant écriture', () => {
    const base = { groups: [] }
    const v = (splitViews: unknown) => validateConfig({ ...base, splitViews })
    const ok = { splitViews: [{ id: 'sv-1', name: 'V', layout: 'c2', slots: ['x-a', null] }] }
    expect(validateConfig({ ...base, ...ok })).toBeNull()
    expect(v([{ id: 'a', name: 'n', ratios: { '': [2, 1] } }])).toBeNull()
    expect(v([{ id: 'a', name: 'n', ratios: { '': [1] } }])).toMatch(/ratios/)
    expect(v([{ id: 'a', name: 'n', ratios: { '': [1, 0] } }])).toMatch(/ratios/)
    expect(v([{ id: 'a', name: 'n'.repeat(61) }])).toMatch(/trop long/)
    expect(validateConfig(base)).toBeNull()
    expect(v('x')).toMatch(/splitViews/)
    expect(v([{ id: 'a' }])).toMatch(/name/)
    expect(v([{ id: 'a', name: 'n' }, { id: 'a', name: 'm' }])).toMatch(/double/)
    expect(v([{ id: 'a', name: 'n', slots: [1] }])).toMatch(/slots/)
    expect(v([{ id: 'a', name: 'n', slots: ['a', 'b', 'c', 'd', 'e'] }])).toMatch(/slots/)
  })

  it('une ancienne config (vues sans position) se charge telle quelle : à la fin, hors dossier', () => {
    const old = [{ id: 'sv-1', name: 'Flux', layout: 'c2', slots: ['x-a', 'x-b'] }]
    const views = normalizeViews(old)
    expect(views[0].before).toBeUndefined()
    expect(views[0].folder).toBeUndefined()
    expect(viewsAt(views, { before: null }, { folders: [], sites: ['x-a'] })).toHaveLength(1)
    expect(normalizeViews(views)).toEqual(views)
  })

  it('placer une vue : devant un site, dans un dossier, à la fin ; un site ou dossier disparu la remet à la fin', () => {
    const v = normalizeViews([
      { id: 'a', name: 'A', layout: 'c2', slots: [] },
      { id: 'b', name: 'B', layout: 'c2', slots: [] },
    ])
    const known = { folders: ['f1'], sites: ['x-a', 'x-b'] }
    const m1 = moveView(v, 'b', { before: 'x-a' })
    expect(viewsAt(m1, { before: 'x-a' }, known).map((x) => x.id)).toEqual(['b'])
    const m2 = moveView(m1, 'b', { folder: 'f1' })
    expect(viewsAt(m2, { folder: 'f1', before: null }, known).map((x) => x.id)).toEqual(['b'])
    expect(viewsAt(m2, { before: null }, known).map((x) => x.id)).toEqual(['a'])
    // devant une autre vue : même place, juste avant elle
    const m3 = moveView(moveView(v, 'a', { before: 'x-b' }), 'b', { beforeView: 'a' })
    expect(viewsAt(m3, { before: 'x-b' }, known).map((x) => x.id)).toEqual(['b', 'a'])
    // dossier supprimé / site supprimé : la vue n'est pas perdue
    expect(viewsAt(m2, { before: null }, { folders: [], sites: [] }).map((x) => x.id).sort()).toEqual(['a', 'b'])
    expect(viewsAt(m1, { before: null }, { folders: [], sites: [] }).map((x) => x.id).sort()).toEqual(['a', 'b'])
    // la place passe par la sauvegarde / restauration comme le reste (validée par le serveur)
    expect(validateConfig({ groups: [], splitViews: m2 })).toBeNull()
    expect(validateConfig({ groups: [], splitViews: [{ id: 'a', name: 'n', before: 4 }] })).toMatch(/before/)
  })

  it('copies (#179) : le type décide seul, quel que soit le `copies[]` stocké (vue d’avant comprise, sans migration)', () => {
    const counts = { 'x:x-a': 5, 'x:x-b': 2, 'x:x-c': 9 }
    const slots = ['x-a', 'x-b', 'x-c']
    // vue Flux d'avant #172 : pas de `copies` → des copies partout, aucun vrai site (donc rien lié à l'onglet), compteur 0
    const oldFlux = normalizeViews([{ id: 'sv-1', name: 'Doomscrolling', layout: 'c3', slots, prefs: { mode: 'scroll' } }])[0]
    expect(oldFlux.copies).toBeUndefined()
    expect(viewSlots(oldFlux, sites, 'classic').copies).toEqual([true, true, true, true])
    expect(viewCounter(oldFlux, counts, sites, 'classic')).toBe(0)
    // vue sans type du tout (avant #172) : le type de Réglages décide
    const bare = normalizeViews([{ id: 'sv-0', name: 'V', layout: 'c3', slots }])[0]
    expect(viewSlots(bare, sites, 'scroll').copies).toEqual([true, true, true, true])
    expect(viewSlots(bare, sites, 'classic').copies).toEqual([false, false, false, false])
    expect(viewCounter(bare, counts, sites, 'classic')).toBe(16)
    // mixte stocké (bascule par panneau d'avant #179) : en Flux tout est copie, en Messagerie tout est vrai site
    const mixFlux = normalizeViews([{ id: 'sv-2', name: 'F', layout: 'c3', slots, copies: [true, false, true, true], prefs: { mode: 'scroll' } }])[0]
    expect(mixFlux.copies).toEqual([true, false, true, false])
    expect(normalizeViews([mixFlux])).toEqual([mixFlux])
    expect(viewSlots(mixFlux, sites, 'classic').copies).toEqual([true, true, true, true])
    expect(viewCounter(mixFlux, counts, sites, 'classic')).toBe(0)
    const mixMsg = { ...mixFlux, prefs: { mode: 'classic' as const, sync: false, actions: true } }
    expect(viewSlots(mixMsg, sites, 'scroll').copies).toEqual([false, false, false, false])
    expect(viewCounter(mixMsg, counts, sites, 'scroll')).toBe(16)
    expect(copiesFor('scroll')).toEqual([true, true, true, true])
    expect(copiesFor('classic')).toEqual([false, false, false, false])
    expect(validateConfig({ groups: [], splitViews: [mixFlux] })).toBeNull()
    expect(validateConfig({ groups: [], splitViews: [{ id: 'a', name: 'n', copies: [1] }] })).toMatch(/copies/)
  })

  it('le type d’une vue (Flux / Messagerie) est gardé dans la vue ; absent = réglages du moment (vues d’avant)', () => {
    const old = normalizeViews([{ id: 'sv-1', name: 'V', layout: 'c2', slots: [] }])[0]
    expect(old.prefs).toBeUndefined()
    const flux = makeView('sv-2', 'F', 'c2', [], sites, undefined, undefined, [true, true], withMode(DEFAULT_SPLIT, 'scroll'))
    const msg = makeView('sv-3', 'M', 'c2', [], sites, undefined, undefined, undefined, withMode(DEFAULT_SPLIT, 'classic'))
    expect(flux.prefs).toEqual({ mode: 'scroll', sync: true, actions: true })
    expect(msg.prefs).toEqual({ mode: 'classic', sync: false, actions: true })
    expect(normalizeViews([flux, msg])).toEqual([flux, msg])
    expect(validateConfig({ groups: [], splitViews: [flux, msg] })).toBeNull()
    expect(validateConfig({ groups: [], splitViews: [{ id: 'a', name: 'n', prefs: 3 }] })).toMatch(/prefs/)
    expect(validateConfig({ groups: [], splitViews: [{ id: 'a', name: 'n', prefs: { inconnu: 1 } }] })).toMatch(/prefs/)
  })

  it('vue enregistrée avant #177 : acceptée telle quelle à l’écriture, anciennes cases ignorées à la lecture, sans migration', () => {
    const legacy = {
      id: 'sv-9',
      name: 'Ancienne',
      layout: 'c2',
      slots: ['x-a', 'x-b'],
      prefs: { mode: 'classic', follow: 'all', keys: false, actions: false, mixer: false, sync: true, pause: false, keep: true, keyboard: 'auto' },
    }
    // une config qui la contient s'enregistre toujours (sauvegarde, autre réglage) : jamais refusée
    expect(validateConfig({ groups: [], splitViews: [legacy] })).toBeNull()
    const v = normalizeViews([legacy])[0]
    expect(v.prefs).toEqual({ mode: 'classic', sync: true, actions: false })
    const custom = normalizeViews([{ ...legacy, prefs: { ...legacy.prefs, mode: 'custom', follow: 'hover' } }])[0]
    expect(custom.prefs?.mode).toBe('scroll')
  })
  it('copie hors de l’appli (navigateur) : un cadre ; un site qui refuse d’être encadré le dit', () => {
    expect(copyFrame(true, 'https://www.instagram.com/')).toBe('webview')
    expect(copyFrame(true, 'https://x.com/home')).toBe('webview')
    expect(copyFrame(false, 'https://www.instagram.com/')).toBe('iframe')
    expect(copyFrame(false, 'https://x.com/home')).toBe('refused')
  })
})

describe('dernière adresse des copies (#180)', () => {
  const home = 'https://www.instagram.com/'
  it('on note une page du même site ; jamais un autre site, une page vide ou en erreur, ni l’accueil lui-même', () => {
    expect(notedUrl('https://www.instagram.com/reel/abc/', home)).toBe('https://www.instagram.com/reel/abc/')
    expect(notedUrl('https://instagram.com/p/xyz/', home)).toBe('https://instagram.com/p/xyz/') // au www. près
    expect(notedUrl('https://www.facebook.com/x', home)).toBeNull()
    expect(notedUrl('https://evil.example/www.instagram.com/', home)).toBeNull()
    expect(notedUrl('about:blank', home)).toBeNull()
    expect(notedUrl('chrome-error://chromewebdata/', home)).toBeNull()
    expect(notedUrl('data:text/html,x', home)).toBeNull()
    expect(notedUrl('', home)).toBeNull()
    expect(notedUrl(undefined, home)).toBeNull()
    expect(notedUrl(home, home)).toBeNull()
    expect(notedUrl(`https://www.instagram.com/${'a'.repeat(3000)}`, home)).toBeNull()
    expect(sameSite('http://www.instagram.com/', home)).toBe(true) // http → https redirigé : même site
    expect(sameSite('https://www.instagram.com:8443/', home)).toBe(false)
  })
  it('à la réouverture : l’adresse notée si elle reste sur le site du panneau, sinon l’adresse de départ', () => {
    expect(startUrl('https://www.instagram.com/reel/abc/', home)).toBe('https://www.instagram.com/reel/abc/')
    expect(startUrl('https://x.com/home', home)).toBe(home) // le panneau a changé de site
    expect(startUrl(null, home)).toBe(home)
    expect(startUrl(undefined, home)).toBe(home)
    expect(startUrl('about:blank', home)).toBe(home)
  })
  it('clé additive : absente si rien de noté, jamais renvoyée vide ; validée avant écriture', () => {
    const old = normalizeViews([{ id: 'sv-1', name: 'V', layout: 'c2', slots: ['x-a', 'x-b'] }])[0]
    expect('last' in old).toBe(false)
    const v = normalizeViews([{ id: 'sv-1', name: 'V', layout: 'c2', slots: ['x-a', 'x-b'], last: ['https://x.com/a', 'javascript:alert(1)', 'https://x.com/c'] }])[0]
    // la 2e n'est pas une page, la 3e est hors de la disposition (2 panneaux)
    expect(v.last).toEqual(['https://x.com/a', null, null, null])
    expect(normalizeViews([{ ...old, last: [null, 'about:blank'] }])[0].last).toBeUndefined()
    expect(validateConfig({ groups: [], splitViews: [v] })).toBeNull()
    expect(validateConfig({ groups: [], splitViews: [{ id: 'a', name: 'n', last: ['javascript:x'] }] })).toMatch(/last/)
    expect(validateConfig({ groups: [], splitViews: [{ id: 'a', name: 'n', last: [1] }] })).toMatch(/last/)
    expect(validateConfig({ groups: [], splitViews: [{ id: 'a', name: 'n', last: [null, null, null, null, null] }] })).toMatch(/last/)
    expect(isPageUrl('https://x.com/')).toBe(true)
  })
  it('« Repartir du début » efface tout ; changer le site d’un panneau efface son adresse seulement', () => {
    const v = withLast(normalizeViews([{ id: 'sv-1', name: 'V', layout: 'c3', slots: ['x-a', 'x-b', 'x-c'] }])[0], ['https://x.com/1', 'https://x.com/2', null])
    expect(v.last).toEqual(['https://x.com/1', 'https://x.com/2', null, null])
    expect('last' in withLast(v, [])).toBe(false)
    expect(keepLast(v, ['x-a', 'x-c', 'x-b', null])).toEqual(['https://x.com/1', null, null, null])
    expect(keepLast(v, ['x-a', 'x-b', 'x-c', null])).toEqual(['https://x.com/1', 'https://x.com/2', null, null])
    expect(keepLast({ slots: v.slots }, v.slots)).toEqual([null, null, null, null])
  })
  it('rien à écrire si les adresses n’ont pas changé', () => {
    expect(sameLast(undefined, [null, null, null, null])).toBe(true)
    expect(sameLast(['https://x.com/1'], ['https://x.com/1', null])).toBe(true)
    expect(sameLast(['https://x.com/1'], ['https://x.com/2'])).toBe(false)
  })
})

describe('dernière adresse : vie privée, erreurs, accueil (#180)', () => {
  const home = 'https://www.instagram.com/'
  it('jamais de #…, d’identifiants ni de paramètre sensible', () => {
    expect(cleanUrl('https://user:pw@www.instagram.com/reel/1/?a=1#frag')).toBe('https://www.instagram.com/reel/1/?a=1')
    expect(cleanUrl('https://x.com/p?access_token=1&sig=2&Session_id=3&authuser=0&code=9&api_key=k&password=p&jwt=j&secret=s&igsh=ok')).toBe(
      'https://x.com/p?igsh=ok',
    )
    expect(notedUrl('https://www.instagram.com/reel/1/?token=abc#c', home)).toBe('https://www.instagram.com/reel/1/')
    expect(cleanUrl('ftp://x.com/')).toBeNull()
  })
  it('l’accueil se reconnaît au / final, au www. et au passage http → https près', () => {
    expect(notedUrl('https://www.instagram.com', home)).toBeNull()
    expect(notedUrl('https://instagram.com/', home)).toBeNull()
    expect(notedUrl('https://www.instagram.com/', 'http://instagram.com')).toBeNull()
    expect(notedUrl('https://www.instagram.com/reel/1/', 'http://instagram.com')).toBe('https://www.instagram.com/reel/1/')
  })
  it('une réponse HTTP en erreur n’est pas notée ; un échec rend la dernière bonne adresse', () => {
    let s = navOk(NAV_START, 'https://www.instagram.com/reel/1/', home, 200)
    s = navOk(s, 'https://www.instagram.com/reel/2/', home)
    expect(s.current).toBe('https://www.instagram.com/reel/2/')
    expect(navOk(s, 'https://www.instagram.com/reel/404/', home, 404)).toBe(s)
    const s3 = navOk(s, 'https://www.instagram.com/reel/3/', home, 200)
    expect(navFail(s3, 'https://www.instagram.com/reel/3/', home, -105).current).toBe('https://www.instagram.com/reel/2/')
    // chargement remplacé (-3), schéma inconnu (-302), sous-cadre ou autre adresse : rien ne change
    expect(navFail(s3, 'https://www.instagram.com/reel/3/', home, -3)).toBe(s3)
    expect(navFail(s3, 'https://www.instagram.com/reel/3/', home, -302)).toBe(s3)
    expect(navFail(s3, 'https://www.instagram.com/reel/3/', home, -105, false)).toBe(s3)
    expect(navFail(s3, 'https://www.instagram.com/reel/9/', home, -105)).toBe(s3)
    // autre site : on repartira de l'accueil
    expect(navOk(s3, 'https://www.facebook.com/x', home).current).toBeNull()
  })
  it('le client n’accepte que ce que le serveur accepte (même borne)', () => {
    const long = `https://x.com/${'a'.repeat(LAST_MAX)}`
    expect(isPageUrl(long)).toBe(false)
    expect(validateConfig({ groups: [], splitViews: [{ id: 'a', name: 'n', last: [long] }] })).toMatch(/last/)
    const max = `https://x.com/${'a'.repeat(LAST_MAX - 'https://x.com/'.length)}`
    expect(max.length).toBe(LAST_MAX)
    expect(isPageUrl(max)).toBe(true)
    expect(validateConfig({ groups: [], splitViews: [{ id: 'a', name: 'n', last: [max] }] })).toBeNull()
    for (const u of ['https:', 'javascript:x', 'about:blank']) {
      expect(isPageUrl(u)).toBe(false)
    }
  })
})
