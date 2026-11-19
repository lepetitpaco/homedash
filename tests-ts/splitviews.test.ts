import { describe, expect, it } from 'vitest'
import { validateConfig } from '../server/store'
import { makeView, newViewId, normalizeViews, removeView, renameView, siteNames, viewCounter, viewSlots } from '../src/lib/splitViews'
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
    expect(validateConfig(base)).toBeNull()
    expect(v('x')).toMatch(/splitViews/)
    expect(v([{ id: 'a' }])).toMatch(/name/)
    expect(v([{ id: 'a', name: 'n' }, { id: 'a', name: 'm' }])).toMatch(/double/)
    expect(v([{ id: 'a', name: 'n', slots: [1] }])).toMatch(/slots/)
    expect(v([{ id: 'a', name: 'n', slots: ['a', 'b', 'c', 'd', 'e'] }])).toMatch(/slots/)
  })
})
