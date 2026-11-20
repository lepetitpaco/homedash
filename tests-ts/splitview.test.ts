import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SPLIT,
  LAYOUTS,
  PRESETS,
  PROFILES,
  applyProfile,
  assignSites,
  detectKeyboard,
  detectProfile,
  dragRatios,
  effectiveMuted,
  effectivePaused,
  pauseWanted,
  LAYER_SELECTOR,
  focusOnHover,
  focusOnLeave,
  focusOnPick,
  interceptTable,
  layoutOf,
  isEditing,
  FLAG_HELP,
  MODE_LABELS,
  FIELD_SELECTOR,
  mixLabel,
  normalizeSplit,
  patchPrefs,
  presetOf,
  resolveKey,
  type KeyEvt,
  type SplitNode,
  type SplitPrefs,
} from '../src/lib/splitView'

const ev = (key: string, over: Partial<KeyEvt> = {}): KeyEvt => ({
  key,
  code: '',
  shift: false,
  alt: false,
  ctrl: false,
  meta: false,
  ...over,
})
const scroll: SplitPrefs = applyProfile(DEFAULT_SPLIT, 'scroll')
const classic: SplitPrefs = applyProfile(DEFAULT_SPLIT, 'classic')
const ctx = { editing: false, panes: 3 }

describe('modes Classic / Scroll et cases à cocher', () => {
  it('les cases d’un préréglage donnent son mode', () => {
    expect(detectProfile(PROFILES.classic)).toBe('classic')
    expect(detectProfile(PROFILES.scroll)).toBe('scroll')
    expect(classic.mode).toBe('classic')
    expect(scroll.mode).toBe('scroll')
  })

  it('Classic : tous les sons, aucun raccourci', () => {
    expect(classic).toMatchObject({ follow: 'all', keys: false, actions: false, mixer: false, sync: false })
  })

  it('modifier une case donne « Personnalisé », recliquer le mode restaure le préréglage', () => {
    const custom = patchPrefs(scroll, { sync: true })
    expect(custom.mode).toBe('custom')
    expect(applyProfile(custom, 'scroll')).toMatchObject({ mode: 'scroll', sync: false })
    expect(applyProfile(custom, 'classic').mode).toBe('classic')
    expect(patchPrefs(custom, { sync: false }).mode).toBe('scroll')
  })

  it('actions et mixage activent les raccourcis ; les décocher décoche les deux', () => {
    expect(patchPrefs(classic, { actions: true }).keys).toBe(true)
    expect(patchPrefs(classic, { mixer: true }).keys).toBe(true)
    const all = patchPrefs(scroll, { mixer: true })
    expect(all).toMatchObject({ keys: true, actions: true, mixer: true })
    expect(patchPrefs(all, { keys: false })).toMatchObject({ keys: false, actions: false, mixer: false })
  })

  it('changer le clavier ou « garder le son » ne change pas le mode', () => {
    expect(patchPrefs(scroll, { keyboard: 'qwerty', keep: false }).mode).toBe('scroll')
  })

  it('une config ancienne ou abîmée prend les défauts', () => {
    expect(normalizeSplit(undefined)).toEqual(DEFAULT_SPLIT)
    expect(normalizeSplit('x')).toEqual(DEFAULT_SPLIT)
    expect(normalizeSplit({ follow: 'zzz', keys: 'oui', keyboard: 12 })).toEqual(DEFAULT_SPLIT)
    expect(normalizeSplit({ mode: 'classic' })).toMatchObject({ mode: 'classic', follow: 'all', keys: false })
    expect(normalizeSplit({ keys: false, actions: true, mixer: true })).toMatchObject({ keys: false, actions: false, mixer: false })
    expect(normalizeSplit({ ...scroll, sync: true }).mode).toBe('custom')
  })
})

describe('dispositions', () => {
  it('chaque disposition compte autant de panneaux que son n', () => {
    const count = (n: SplitNode): number => (n === 'pane' ? 1 : n.children.reduce((t, c) => t + count(c), 0))
    for (const l of LAYOUTS) expect(count(l.tree)).toBe(l.n)
    expect(layoutOf('nimporte').id).toBe(LAYOUTS[0].id)
  })

  it('les cases reçoivent les sites récents, sans doublon, en gardant les choix déjà faits', () => {
    expect(assignSites([], 3, ['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c', null])
    expect(assignSites(['b', null, null, null], 3, ['a', 'b', 'c'])).toEqual(['b', 'a', 'c', null])
    expect(assignSites(['a', 'b', 'c', 'd'], 2, [])).toEqual(['a', 'b', null, null])
    expect(assignSites([], 2, ['a'])).toEqual(['a', null, null, null])
  })

  it('un séparateur déplacé garde un minimum aux deux voisins et le total', () => {
    expect(dragRatios([1, 1], 0, 0.25)).toEqual([1.5, 0.5])
    const far = dragRatios([1, 1], 0, 5)
    expect(far[0] + far[1]).toBeCloseTo(2)
    expect(far[1]).toBeGreaterThanOrEqual(0.24 - 1e-9)
    expect(dragRatios([1, 1, 1], 1, -5)[1]).toBeGreaterThanOrEqual(0.36 - 1e-9)
    expect(dragRatios([1, 1], 4, 0.1)).toEqual([1, 1])
  })
})

describe('son', () => {
  const shown = ['x:a', 'x:b', 'x:c']
  const split = (over = {}) => ({ open: true, follow: 'hover' as const, shown, sound: 'x:b', ...over })

  it('Scroll : un seul panneau a le son', () => {
    expect(effectiveMuted('x:a', false, split())).toBe(true)
    expect(effectiveMuted('x:b', false, split())).toBe(false)
    expect(effectiveMuted('x:c', false, split())).toBe(true)
  })

  it('Classic (tous les sons) : aucun muet automatique', () => {
    for (const k of shown) expect(effectiveMuted(k, false, split({ follow: 'all' }))).toBe(false)
  })

  it('le muet manuel prime toujours', () => {
    expect(effectiveMuted('x:b', true, split())).toBe(true)
    expect(effectiveMuted('x:a', true, split({ follow: 'all' }))).toBe(true)
    expect(effectiveMuted('x:a', true, split({ open: false }))).toBe(true)
  })

  it('hors vue scindée, ou hors grille, rien n’est touché', () => {
    expect(effectiveMuted('x:a', false, split({ open: false }))).toBe(false)
    expect(effectiveMuted('x:z', false, split())).toBe(false)
  })

  it('personne n’a le son : tout est coupé', () => {
    expect(effectiveMuted('x:a', false, split({ sound: null }))).toBe(true)
  })

  it('le survol donne le son ; à la sortie il reste ou se coupe', () => {
    const f = { active: 0, sound: 0 }
    expect(focusOnHover(f, 2, 'hover')).toEqual({ active: 2, sound: 2 })
    expect(focusOnHover(f, 2, 'keyboard')).toEqual(f)
    expect(focusOnHover(f, 2, 'all')).toEqual(f)
    expect(focusOnLeave({ active: 2, sound: 2 }, 'hover', true)).toEqual({ active: 2, sound: 2 })
    expect(focusOnLeave({ active: 2, sound: 2 }, 'hover', false)).toEqual({ active: 2, sound: null })
    expect(focusOnLeave({ active: 2, sound: 2 }, 'keyboard', false)).toEqual({ active: 2, sound: 2 })
  })

  it('« Garder le son » décoché : la sortie coupe, revenir sur le même panneau le rend', () => {
    const out = focusOnLeave({ active: 1, sound: 1 }, 'hover', false)
    expect(out).toEqual({ active: 1, sound: null })
    expect(focusOnHover(out, 1, 'hover')).toEqual({ active: 1, sound: 1 })
    // coché : le son reste au dernier panneau
    expect(focusOnLeave({ active: 1, sound: 1 }, 'hover', true).sound).toBe(1)
  })

  it('un clic ou Alt+chiffre donne le son, sauf quand tous l’ont', () => {
    expect(focusOnPick({ active: 0, sound: 0 }, 1, 'keyboard')).toEqual({ active: 1, sound: 1 })
    expect(focusOnPick({ active: 0, sound: 0 }, 1, 'hover')).toEqual({ active: 1, sound: 1 })
    expect(focusOnPick({ active: 0, sound: null }, 1, 'all')).toEqual({ active: 1, sound: null })
  })
})

describe('pause des vidéos (#168)', () => {
  const shown = ['x:a', 'x:b']
  it('Scroll : seul le panneau qui a le son lit ; il suit le son, « garder » compris', () => {
    expect(effectivePaused('x:a', scroll, shown, 'x:a')).toBe(false)
    expect(effectivePaused('x:b', scroll, shown, 'x:a')).toBe(true)
    // la souris sort et le son se coupe (garder décoché) : tout est en pause, comme le son
    expect(effectivePaused('x:a', scroll, shown, null)).toBe(true)
  })
  it('Classic et « tous les sons » : rien n’est touché ; hors de la grille non plus', () => {
    expect(classic.pause).toBe(false)
    expect(effectivePaused('x:b', classic, shown, 'x:a')).toBe(false)
    expect(effectivePaused('x:b', patchPrefs(scroll, { follow: 'all' }), shown, 'x:a')).toBe(false)
    expect(effectivePaused('x:z', scroll, shown, 'x:a')).toBe(false)
  })
  it('c’est une case du mode : la décocher donne Personnalisé', () => {
    expect(scroll.pause).toBe(true)
    expect(patchPrefs(scroll, { pause: false }).mode).toBe('custom')
    expect(normalizeSplit({ mode: 'scroll' }).pause).toBe(true)
    expect(normalizeSplit({ mode: 'classic' }).pause).toBe(false)
    expect(normalizeSplit({ pause: 'oui' }).pause).toBe(DEFAULT_SPLIT.pause)
  })
})

describe('clavier : touche + préréglage → action', () => {
  const az = PRESETS.azerty
  const qw = PRESETS.qwerty

  it('Classic : aucune touche n’est interceptée', () => {
    for (const key of ['j', 'k', 'l', 'z', 'n', ' ', 'ArrowDown', 'Escape']) {
      expect(resolveKey(ev(key), classic, az, ctx)).toBeNull()
    }
    expect(resolveKey(ev('&', { alt: true, code: 'Digit1' }), classic, az, ctx)).toBeNull()
    expect(interceptTable(classic, az, 3)).toEqual({ keys: [], alt: [], relay: [] })
  })

  it('jamais dans un champ de saisie', () => {
    expect(resolveKey(ev('j'), scroll, az, { editing: true, panes: 3 })).toBeNull()
    expect(resolveKey(ev('&', { alt: true, code: 'Digit1' }), scroll, az, { editing: true, panes: 3 })).toBeNull()
    expect(resolveKey(ev('Escape'), scroll, az, { editing: true, panes: 3 })).toBeNull()
  })

  it('Alt + rangée du haut suit la touche physique, en AZERTY comme en QWERTY', () => {
    // AZERTY : la touche Digit1 porte « & » (ou « ¡ » avec Alt sur Mac) ; c'est le code qui compte
    for (const p of [az, qw]) {
      expect(resolveKey(ev('&', { alt: true, code: 'Digit1' }), scroll, p, ctx)).toEqual({ type: 'focus', pane: 0 })
      expect(resolveKey(ev('¡', { alt: true, code: 'Digit2' }), scroll, p, ctx)).toEqual({ type: 'focus', pane: 1 })
      expect(resolveKey(ev("'", { alt: true, code: 'Digit4' }), scroll, p, { editing: false, panes: 4 })).toEqual({ type: 'focus', pane: 3 })
    }
    expect(resolveKey(ev('1', { alt: true, code: 'Digit1' }), scroll, qw, ctx)).toEqual({ type: 'focus', pane: 0 })
  })

  it('Alt + chiffre au-delà des panneaux, avec Maj ou Ctrl : rien', () => {
    expect(resolveKey(ev('4', { alt: true, code: 'Digit4' }), scroll, qw, ctx)).toBeNull()
    expect(resolveKey(ev('1', { alt: true, shift: true, code: 'Digit1' }), scroll, qw, ctx)).toBeNull()
    expect(resolveKey(ev('1', { alt: true, ctrl: true, code: 'Digit1' }), scroll, qw, ctx)).toBeNull()
  })

  it('J/K, flèches, N/P, Espace, Z, Échap', () => {
    const r = (e: KeyEvt) => resolveKey(e, scroll, az, ctx)
    expect(r(ev('j'))).toEqual({ type: 'scroll', pane: null, dir: 1, page: false })
    expect(r(ev('K'))).toEqual({ type: 'scroll', pane: null, dir: -1, page: false })
    expect(r(ev('ArrowDown'))).toEqual({ type: 'scroll', pane: null, dir: 1, page: false })
    expect(r(ev('ArrowUp'))).toEqual({ type: 'scroll', pane: null, dir: -1, page: false })
    expect(r(ev('n'))).toEqual({ type: 'scroll', pane: null, dir: 1, page: true })
    expect(r(ev('p'))).toEqual({ type: 'scroll', pane: null, dir: -1, page: true })
    expect(r(ev(' '))).toEqual({ type: 'scroll', pane: null, dir: 1, page: true })
    expect(r(ev(' ', { shift: true }))).toEqual({ type: 'scroll', pane: null, dir: -1, page: true })
    expect(r(ev('z'))).toEqual({ type: 'zoom' })
    expect(r(ev('Escape'))).toEqual({ type: 'leave' })
  })

  it('actions par site : L B T C, seulement si cochées', () => {
    expect(resolveKey(ev('l'), scroll, az, ctx)).toEqual({ type: 'site', id: 'like' })
    expect(resolveKey(ev('b'), scroll, az, ctx)).toEqual({ type: 'site', id: 'save' })
    expect(resolveKey(ev('t'), scroll, az, ctx)).toEqual({ type: 'site', id: 'share' })
    expect(resolveKey(ev('c'), scroll, az, ctx)).toEqual({ type: 'site', id: 'comment' })
    // « Suivre » (F) est retiré tant que les sélecteurs ne sont pas vérifiés (#166) : la touche reste au site
    expect(resolveKey(ev('f'), scroll, az, ctx)).toBeNull()
    const noActions = patchPrefs(scroll, { actions: false })
    expect(resolveKey(ev('l'), noActions, az, ctx)).toBeNull()
    expect(resolveKey(ev('j'), noActions, az, ctx)).not.toBeNull()
  })

  it('une touche avec Ctrl ou ⌘ n’est jamais prise (copier, coller…)', () => {
    expect(resolveKey(ev('c', { ctrl: true }), scroll, az, ctx)).toBeNull()
    expect(resolveKey(ev('l', { meta: true }), scroll, az, ctx)).toBeNull()
  })

  it('table de mixage : A/Q Z/S E/D R/F en AZERTY, Q/A W/S E/D R/F en QWERTY', () => {
    const mix = patchPrefs(scroll, { mixer: true })
    const r = (key: string, p = az) => resolveKey(ev(key), mix, p, { editing: false, panes: 4 })
    expect(r('a')).toEqual({ type: 'scroll', pane: 0, dir: -1, page: false })
    expect(r('q')).toEqual({ type: 'scroll', pane: 0, dir: 1, page: false })
    expect(r('z')).toEqual({ type: 'scroll', pane: 1, dir: -1, page: false })
    expect(r('s')).toEqual({ type: 'scroll', pane: 1, dir: 1, page: false })
    expect(r('r')).toEqual({ type: 'scroll', pane: 3, dir: -1, page: false })
    expect(r('f')).toEqual({ type: 'scroll', pane: 3, dir: 1, page: false })
    // QWERTY : les mêmes positions physiques, d'où des lettres différentes
    expect(r('q', qw)).toEqual({ type: 'scroll', pane: 0, dir: -1, page: false })
    expect(r('a', qw)).toEqual({ type: 'scroll', pane: 0, dir: 1, page: false })
    expect(r('w', qw)).toEqual({ type: 'scroll', pane: 1, dir: -1, page: false })
    // en mixage, J/K et Z ne servent plus ; Échap et Alt+chiffre restent
    expect(r('j')).toBeNull()
    expect(r('z', qw)).toBeNull()
    expect(r('Escape')).toEqual({ type: 'leave' })
    expect(resolveKey(ev('1', { alt: true, code: 'Digit1' }), mix, az, ctx)).toEqual({ type: 'focus', pane: 0 })
    // un panneau absent n'a pas ses touches
    expect(resolveKey(ev('e'), mix, az, { editing: false, panes: 2 })).toBeNull()
  })

  it('la table du préload se tire de resolveKey', () => {
    const t = interceptTable(scroll, az, 3)
    expect(t.keys).toEqual(expect.arrayContaining(['j', 'k', 'n', 'p', 'z', 'l', 'b', 't', 'c', 'arrowdown', 'arrowup', ' ']))
    expect(t.keys).not.toContain('a')
    expect(t.keys).not.toContain('f')
    expect(t.alt).toEqual(['Digit1', 'Numpad1', 'Digit2', 'Numpad2', 'Digit3', 'Numpad3'])
    expect(t.relay).toEqual(['escape'])
    const m = interceptTable(patchPrefs(scroll, { mixer: true }), qw, 4)
    expect(m.keys).toEqual(expect.arrayContaining(['q', 'a', 'w', 's', 'e', 'd', 'r', 'f']))
    expect(m.keys).not.toContain('j')
  })
})

describe('préréglage clavier', () => {
  it('Automatique : KeyQ qui vaut q = QWERTY, sinon AZERTY (repli compris)', () => {
    expect(detectKeyboard('q')).toBe('qwerty')
    expect(detectKeyboard('a')).toBe('azerty')
    expect(detectKeyboard(undefined)).toBe('azerty')
    expect(presetOf('auto', 'qwerty').name).toBe('QWERTY')
    expect(presetOf('azerty', 'qwerty').name).toBe('AZERTY')
    expect(presetOf('qwerty', 'azerty').name).toBe('QWERTY')
  })

  it('les paires d’un panneau pour l’affichage', () => {
    expect(mixLabel(PRESETS.azerty, 0)).toBe('A / Q')
    expect(mixLabel(PRESETS.qwerty, 1)).toBe('W / S')
    expect(mixLabel(PRESETS.qwerty, 9)).toBe('')
  })
})

describe('libellés partagés et champs de saisie', () => {
  it('chaque case a son aide, et la table de mixage dit ce qu’elle remplace', () => {
    expect(FLAG_HELP.map((f) => f.key)).toEqual(['keys', 'actions', 'mixer', 'sync', 'pause', 'keep'])
    expect(FLAG_HELP.find((f) => f.key === 'mixer')?.hint).toMatch(/remplace/)
    expect(MODE_LABELS.map((m) => m.id)).toEqual(['classic', 'scroll', 'custom'])
  })

  it('un champ de saisie : sélecteur ou contenteditable', () => {
    const el = (hit: boolean, ce = false) => ({ closest: (s: string) => (hit && s === FIELD_SELECTOR ? {} : null), isContentEditable: ce })
    expect(isEditing(el(true))).toBe(true)
    expect(isEditing(el(false, true))).toBe(true)
    expect(isEditing(el(false))).toBe(false)
    expect(isEditing(null)).toBe(false)
  })
})

describe('pause et fermeture de la vue (#168)', () => {
  const base = { prefs: { pause: true, follow: 'hover' as const }, sound: 'x:1', tab: 'links' }
  it('vue A [1,2] fermée sans site affiché : tous les sites garés restent en pause', () => {
    expect(pauseWanted('x:1', { ...base, open: false, shown: [], parked: true })).toBe(true)
    expect(pauseWanted('x:2', { ...base, open: false, shown: [], prev: true })).toBe(true)
  })
  it('le site affiché reprend, un autre reste en pause', () => {
    expect(pauseWanted('x:1', { ...base, open: false, shown: [], parked: true, tab: 'x:1' })).toBe(false)
    expect(pauseWanted('x:2', { ...base, open: false, shown: [], prev: true, tab: 'x:1' })).toBe(true)
  })
  it('vue B [1,3] ouverte après : le site 2, hors de la grille, garde sa pause (pas de son caché)', () => {
    const b = { ...base, open: true, shown: ['x:1', 'x:3'] }
    expect(pauseWanted('x:2', { ...b, prev: true })).toBe(true)
    expect(pauseWanted('x:2', { ...b, prev: false })).toBe(false)
    expect(pauseWanted('x:1', b)).toBe(false)
    expect(pauseWanted('x:3', b)).toBe(true)
  })
  it('un site jamais touché par la pause n’est pas pris à la fermeture', () => {
    expect(pauseWanted('x:9', { ...base, open: false, shown: [] })).toBe(false)
  })
  it('les couches se reconnaissent à leur rôle', () => {
    for (const r of ['dialog', 'menu', 'listbox']) expect(LAYER_SELECTOR).toContain(`[role="${r}"]`)
  })
})
