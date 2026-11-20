import { describe, expect, it } from 'vitest'
import { validateConfig } from '../server/store'
import { DEFAULT_SPLIT, withMode } from '../src/lib/splitView'
import { moveView, viewsAt, droppedSlots, makeView, newViewId, normalizeViews, removeView, renameView, siteNames, viewCounter, viewSlots } from '../src/lib/splitViews'
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
    const r = viewSlots(v, sites)
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
    expect(viewCounter(v, { 'x:x-a': 2, 'x:x-b': 5, 'x:x-c': 7 }, quiet)).toBe(2)
  })

  it('compteur d’une vue : la somme de ses sites, chacun une fois', () => {
    const v = normalizeViews([{ id: 'sv-1', name: 'V', layout: 'c3', slots: ['x-a', 'x-b', 'x-a'] }])[0]
    expect(viewCounter(v, { 'x:x-a': 3, 'x:x-b': 4, 'x:x-c': 9 }, sites)).toBe(7)
    expect(viewCounter(v, {}, sites)).toBe(0)
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

  it('copies (#172) : absentes = tous les sites réels ; seuls les sites réels comptent dans le compteur', () => {
    const old = normalizeViews([{ id: 'sv-1', name: 'V', layout: 'c3', slots: ['x-a', 'x-b', 'x-c'] }])[0]
    expect(old.copies).toBeUndefined()
    expect(viewSlots(old, sites).copies).toEqual([false, false, false, false])
    const v = normalizeViews([{ id: 'sv-2', name: 'Flux', layout: 'c3', slots: ['x-a', 'x-b', 'x-c'], copies: [true, false, true, true] }])[0]
    expect(v.copies).toEqual([true, false, true, false])
    expect(normalizeViews([v])).toEqual([v])
    expect(viewCounter(v, { 'x:x-a': 5, 'x:x-b': 2, 'x:x-c': 9 }, sites)).toBe(2)
    expect(validateConfig({ groups: [], splitViews: [v] })).toBeNull()
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
})
