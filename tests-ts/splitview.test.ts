import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SPLIT,
  LAYOUTS,
  MIX_CODES,
  PRESETS,
  assignSites,
  detectKeyboard,
  dragRatios,
  effectiveMuted,
  effectivePaused,
  pauseWanted,
  LAYER_SELECTOR,
  canFocus,
  focusOnGesture,
  interceptTable,
  layoutOf,
  isEditing,
  FLAG_HELP,
  MODE_LABELS,
  FIELD_SELECTOR,
  LEGACY_SPLIT_KEYS,
  MODIFIERS_HELP,
  mixLabel,
  normalizeKeyboard,
  normalizeSplit,
  presetOf,
  resolveKey,
  splitLegend,
  withMode,
  type Focus,
  type KeyEvt,
  type SplitNode,
  type SplitPrefs,
} from '../src/lib/splitView'

/** Une touche par sa place (`code`) ; `key` n'est qu'une étiquette, que la vue ne lit pas (sauf Échap). */
const ev = (code: string, over: Partial<KeyEvt> = {}): KeyEvt => ({
  key: '',
  code,
  shift: false,
  alt: false,
  ctrl: false,
  meta: false,
  ...over,
})
const flux: SplitPrefs = withMode(DEFAULT_SPLIT, 'scroll')
const classic: SplitPrefs = withMode(DEFAULT_SPLIT, 'classic')
const ctx = { editing: false, panes: 3 }

describe('modes Messagerie / Flux et leurs deux cases (#177)', () => {
  it('défaut : Flux, synchro et actions cochées ; la synchro par défaut dépend du mode', () => {
    expect(DEFAULT_SPLIT).toEqual({ mode: 'scroll', sync: true, actions: true })
    // changer de mode garde les actions et applique la synchro par défaut du mode
    expect(withMode({ mode: 'scroll', sync: true, actions: false }, 'classic')).toEqual({ mode: 'classic', sync: false, actions: false })
    expect(withMode({ mode: 'classic', sync: false, actions: true }, 'scroll')).toEqual({ mode: 'scroll', sync: true, actions: true })
  })

  it('une config absente ou abîmée prend les défauts (la synchro, celle du mode)', () => {
    expect(normalizeSplit(undefined)).toEqual(DEFAULT_SPLIT)
    expect(normalizeSplit('x')).toEqual(DEFAULT_SPLIT)
    expect(normalizeSplit({ mode: 'zzz', sync: 'oui', actions: 3 })).toEqual(DEFAULT_SPLIT)
    expect(normalizeSplit({ mode: 'classic' })).toEqual({ mode: 'classic', sync: false, actions: true })
    expect(normalizeSplit({ mode: 'classic', sync: true })).toEqual({ mode: 'classic', sync: true, actions: true })
    expect(normalizeSplit({ mode: 'scroll', sync: false })).toEqual({ mode: 'scroll', sync: false, actions: true })
  })

  it('ancien format (avant #177) : mode, sync et actions gardés, les clés disparues ignorées et jamais renvoyées', () => {
    const oldFlux = { mode: 'scroll', follow: 'hover', keys: true, actions: false, mixer: true, sync: false, pause: true, keep: true, keyboard: 'qwerty' }
    const oldMsg = { mode: 'classic', follow: 'all', keys: false, actions: false, mixer: false, sync: false, pause: false, keep: true, keyboard: 'auto' }
    expect(normalizeSplit(oldFlux)).toEqual({ mode: 'scroll', sync: false, actions: false })
    expect(normalizeSplit(oldMsg)).toEqual({ mode: 'classic', sync: false, actions: false })
    for (const old of [oldFlux, oldMsg]) {
      const keys = Object.keys(normalizeSplit(old))
      expect(keys.sort()).toEqual(['actions', 'mode', 'sync'])
      for (const k of LEGACY_SPLIT_KEYS) expect(keys).not.toContain(k)
    }
    // valeurs absurdes dans les anciennes clés : rien ne casse
    expect(normalizeSplit({ follow: 12, keys: 'x', pause: null })).toEqual(DEFAULT_SPLIT)
  })

  it('l’ancien « Personnalisé » redevient Messagerie si le son était à tous, sinon Flux', () => {
    expect(normalizeSplit({ mode: 'custom', follow: 'all', keys: false }).mode).toBe('classic')
    expect(normalizeSplit({ mode: 'custom', follow: 'hover', keys: true }).mode).toBe('scroll')
    expect(normalizeSplit({ mode: 'custom', follow: 'keyboard' }).mode).toBe('scroll')
    expect(normalizeSplit({ mode: 'custom' }).mode).toBe('scroll')
  })

  it('le clavier (Réglages seulement) se lit à part, ancien format compris', () => {
    expect(normalizeKeyboard({ keyboard: 'qwerty', follow: 'hover' })).toBe('qwerty')
    expect(normalizeKeyboard({ keyboard: 'azerty' })).toBe('azerty')
    expect(normalizeKeyboard({ keyboard: 12 })).toBe('auto')
    expect(normalizeKeyboard(undefined)).toBe('auto')
    expect(normalizeSplit({ keyboard: 'qwerty' })).toEqual(DEFAULT_SPLIT)
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

describe('son : le dernier geste gagne (#177)', () => {
  const shown = ['x:a', 'x:b', 'x:c']
  const split = (over = {}) => ({ open: true, mode: 'scroll' as const, shown, sound: 'x:b', ...over })

  it('Flux : un seul panneau a le son', () => {
    expect(effectiveMuted('x:a', false, split())).toBe(true)
    expect(effectiveMuted('x:b', false, split())).toBe(false)
    expect(effectiveMuted('x:c', false, split())).toBe(true)
  })

  it('Messagerie (tous les sons) : aucun muet automatique', () => {
    for (const k of shown) expect(effectiveMuted(k, false, split({ mode: 'classic' }))).toBe(false)
  })

  it('le muet manuel prime toujours', () => {
    expect(effectiveMuted('x:b', true, split())).toBe(true)
    expect(effectiveMuted('x:a', true, split({ mode: 'classic' }))).toBe(true)
    expect(effectiveMuted('x:a', true, split({ open: false }))).toBe(true)
  })

  it('hors vue scindée, ou hors grille, rien n’est touché', () => {
    expect(effectiveMuted('x:a', false, split({ open: false }))).toBe(false)
    expect(effectiveMuted('x:z', false, split())).toBe(false)
  })

  it('Flux : chaque geste (survol, molette, touche, clic) donne le son et le panneau actif, le dernier gagne', () => {
    let f: Focus = { active: 0, sound: 0 }
    f = focusOnGesture(f, 2, 'scroll') // survol du panneau 3
    expect(f).toEqual({ active: 2, sound: 2 })
    f = focusOnGesture(f, 1, 'scroll') // touche de mixage du panneau 2
    expect(f).toEqual({ active: 1, sound: 1 })
    f = focusOnGesture(f, 0, 'scroll') // molette ou clic sur le panneau 1
    expect(f).toEqual({ active: 0, sound: 0 })
  })

  it('Messagerie : le geste change le panneau actif, jamais le son (tous l’ont)', () => {
    expect(focusOnGesture({ active: 0, sound: null }, 1, 'classic')).toEqual({ active: 1, sound: null })
  })
})

describe('pause des vidéos (#168)', () => {
  const shown = ['x:a', 'x:b']
  it('Flux : toujours, seul le panneau qui a le son lit', () => {
    expect(effectivePaused('x:a', 'scroll', shown, 'x:a')).toBe(false)
    expect(effectivePaused('x:b', 'scroll', shown, 'x:a')).toBe(true)
    expect(effectivePaused('x:a', 'scroll', shown, null)).toBe(true)
  })
  it('Messagerie : jamais ; hors de la grille non plus', () => {
    expect(effectivePaused('x:b', 'classic', shown, 'x:a')).toBe(false)
    expect(effectivePaused('x:z', 'scroll', shown, 'x:a')).toBe(false)
  })
})

describe('clavier : touche physique → action', () => {
  const r = (e: KeyEvt, p: SplitPrefs = flux, panes = 3) => resolveKey(e, p, { editing: false, panes })

  it('Messagerie : aucune touche n’est interceptée', () => {
    for (const code of ['KeyJ', 'KeyK', 'KeyL', 'KeyX', 'KeyN', 'Space', 'ArrowDown', 'Escape', 'KeyQ']) {
      expect(r(ev(code), classic)).toBeNull()
      expect(r(ev(code, { shift: true }), classic)).toBeNull()
    }
    expect(r(ev('Digit1', { alt: true }), classic)).toBeNull()
    expect(interceptTable(classic, 4)).toEqual({ codes: [], shift: [], alt: [], relay: [] })
  })

  it('jamais dans un champ de saisie', () => {
    expect(resolveKey(ev('KeyJ'), flux, { editing: true, panes: 3 })).toBeNull()
    expect(resolveKey(ev('KeyQ', { shift: true }), flux, { editing: true, panes: 3 })).toBeNull()
    expect(resolveKey(ev('Digit1', { alt: true }), flux, { editing: true, panes: 3 })).toBeNull()
    expect(resolveKey(ev('Escape'), flux, { editing: true, panes: 3 })).toBeNull()
  })

  it('Alt + rangée du haut suit la touche physique (le caractère varie : « & », « ¡ » sur Mac)', () => {
    expect(r(ev('Digit1', { alt: true, key: '&' }))).toEqual({ type: 'focus', pane: 0 })
    expect(r(ev('Digit2', { alt: true, key: '¡' }))).toEqual({ type: 'focus', pane: 1 })
    expect(r(ev('Numpad3', { alt: true }))).toEqual({ type: 'focus', pane: 2 })
    expect(r(ev('Digit4', { alt: true }), flux, 4)).toEqual({ type: 'focus', pane: 3 })
  })

  it('Alt + chiffre au-delà des panneaux, avec Maj ou Ctrl : rien', () => {
    expect(r(ev('Digit4', { alt: true }))).toBeNull()
    expect(r(ev('Digit1', { alt: true, shift: true }))).toBeNull()
    expect(r(ev('Digit1', { alt: true, ctrl: true }))).toBeNull()
  })

  it('Ctrl et ⌘ ne sont jamais pris (copier, coller…), avec ou sans Maj', () => {
    for (const code of ['KeyC', 'KeyL', 'KeyQ', 'KeyJ', 'ArrowDown']) {
      expect(r(ev(code, { ctrl: true }))).toBeNull()
      expect(r(ev(code, { meta: true }))).toBeNull()
      expect(r(ev(code, { meta: true, shift: true }))).toBeNull()
    }
  })

  it('table de mixage, toujours en Flux : un seul panneau, dans le sens de la touche', () => {
    const r4 = (code: string) => r(ev(code), flux, 4)
    expect(r4('KeyQ')).toEqual({ type: 'scroll', pane: 0, dir: -1, page: false })
    expect(r4('KeyA')).toEqual({ type: 'scroll', pane: 0, dir: 1, page: false })
    expect(r4('KeyW')).toEqual({ type: 'scroll', pane: 1, dir: -1, page: false })
    expect(r4('KeyS')).toEqual({ type: 'scroll', pane: 1, dir: 1, page: false })
    expect(r4('KeyE')).toEqual({ type: 'scroll', pane: 2, dir: -1, page: false })
    expect(r4('KeyD')).toEqual({ type: 'scroll', pane: 2, dir: 1, page: false })
    expect(r4('KeyR')).toEqual({ type: 'scroll', pane: 3, dir: -1, page: false })
    expect(r4('KeyF')).toEqual({ type: 'scroll', pane: 3, dir: 1, page: false })
    // un panneau absent n'a pas ses touches
    expect(r(ev('KeyR'), flux, 3)).toBeNull()
  })

  it('Maj + touche de mixage : tous les panneaux, dans le sens de la touche', () => {
    expect(r(ev('KeyQ', { shift: true }))).toEqual({ type: 'scroll', pane: 'all', dir: -1, page: false })
    expect(r(ev('KeyS', { shift: true }))).toEqual({ type: 'scroll', pane: 'all', dir: 1, page: false })
  })

  it('les étiquettes AZERTY / QWERTY tombent sur les mêmes touches physiques', () => {
    // place → lettre de chaque clavier, pour les touches du mixage
    const layout = {
      azerty: { KeyQ: 'a', KeyA: 'q', KeyW: 'z', KeyS: 's', KeyE: 'e', KeyD: 'd', KeyR: 'r', KeyF: 'f' },
      qwerty: { KeyQ: 'q', KeyA: 'a', KeyW: 'w', KeyS: 's', KeyE: 'e', KeyD: 'd', KeyR: 'r', KeyF: 'f' },
    } as const
    for (const kb of ['azerty', 'qwerty'] as const) {
      MIX_CODES.forEach(([up, down], i) => {
        expect(PRESETS[kb].mix[i], `${kb} ${i}`).toEqual([layout[kb][up as keyof (typeof layout)[typeof kb]], layout[kb][down as keyof (typeof layout)[typeof kb]]])
      })
    }
  })

  it('J K et flèches : le panneau sous la souris ; Maj : tous', () => {
    expect(r(ev('KeyJ'))).toEqual({ type: 'scroll', pane: 'hover', dir: 1, page: false })
    expect(r(ev('KeyK'))).toEqual({ type: 'scroll', pane: 'hover', dir: -1, page: false })
    expect(r(ev('ArrowDown'))).toEqual({ type: 'scroll', pane: 'hover', dir: 1, page: false })
    expect(r(ev('ArrowUp'))).toEqual({ type: 'scroll', pane: 'hover', dir: -1, page: false })
    expect(r(ev('ArrowDown', { shift: true }))).toEqual({ type: 'scroll', pane: 'all', dir: 1, page: false })
    expect(r(ev('KeyK', { shift: true }))).toEqual({ type: 'scroll', pane: 'all', dir: -1, page: false })
  })

  it('N P, Espace (Maj + Espace = page précédente), X, Échap', () => {
    expect(r(ev('KeyN'))).toEqual({ type: 'scroll', pane: 'active', dir: 1, page: true })
    expect(r(ev('KeyP'))).toEqual({ type: 'scroll', pane: 'active', dir: -1, page: true })
    expect(r(ev('KeyN', { shift: true }))).toEqual({ type: 'scroll', pane: 'all', dir: 1, page: true })
    expect(r(ev('Space'))).toEqual({ type: 'scroll', pane: 'active', dir: 1, page: true })
    expect(r(ev('Space', { shift: true }))).toEqual({ type: 'scroll', pane: 'active', dir: -1, page: true })
    expect(r(ev('KeyX'))).toEqual({ type: 'zoom' })
    expect(r(ev('KeyZ'))).toBeNull()
    expect(r(ev('Escape'))).toEqual({ type: 'leave' })
    expect(r(ev('', { key: 'Escape' }))).toEqual({ type: 'leave' })
  })

  it('actions par site : L B T C seulement si cochées, jamais avec Maj (pas de « J\'aime » à tous)', () => {
    expect(r(ev('KeyL'))).toEqual({ type: 'site', id: 'like' })
    expect(r(ev('KeyB'))).toEqual({ type: 'site', id: 'save' })
    expect(r(ev('KeyT'))).toEqual({ type: 'site', id: 'share' })
    expect(r(ev('KeyC'))).toEqual({ type: 'site', id: 'comment' })
    expect(r(ev('KeyL', { shift: true }))).toBeNull()
    expect(r(ev('KeyX', { shift: true }))).toBeNull()
    const noActions = { ...flux, actions: false }
    expect(r(ev('KeyL'), noActions)).toBeNull()
    expect(r(ev('KeyJ'), noActions)).not.toBeNull()
  })

  it('les lettres se lisent par la place, jamais par le caractère (Maj, Alt sur Mac)', () => {
    expect(r(ev('KeyJ', { key: 'J' }))).toEqual(r(ev('KeyJ', { key: 'j' })))
    // la touche qui porte « j » ailleurs ne compte pas : seule la place compte
    expect(r(ev('KeyY', { key: 'j' }))).toBeNull()
  })

  it('aucune collision entre la table de mixage et le reste', () => {
    const others = ['KeyJ', 'KeyK', 'KeyN', 'KeyP', 'KeyL', 'KeyB', 'KeyT', 'KeyC', 'Space', 'ArrowDown', 'ArrowUp', 'KeyX', 'Escape']
    for (const code of MIX_CODES.flat()) expect(others).not.toContain(code)
  })

  it('la table du préload se tire de resolveKey, Maj comprise', () => {
    const t = interceptTable(flux, 3)
    expect(t.codes).toEqual(
      expect.arrayContaining(['KeyQ', 'KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyJ', 'KeyK', 'KeyN', 'KeyP', 'KeyX', 'KeyL', 'KeyB', 'KeyT', 'KeyC', 'ArrowDown', 'ArrowUp', 'Space']),
    )
    expect(t.codes).not.toContain('KeyR') // 3 panneaux
    expect(t.codes).not.toContain('KeyZ')
    expect(t.shift).toEqual(expect.arrayContaining(['KeyQ', 'KeyA', 'KeyJ', 'KeyK', 'ArrowDown', 'ArrowUp', 'KeyN', 'KeyP', 'Space']))
    expect(t.shift).not.toContain('KeyL')
    expect(t.shift).not.toContain('KeyX')
    expect(t.alt).toEqual(['Digit1', 'Numpad1', 'Digit2', 'Numpad2', 'Digit3', 'Numpad3'])
    expect(t.relay).toEqual(['escape'])
    expect(interceptTable({ ...flux, actions: false }, 3).codes).not.toContain('KeyL')
  })
})

describe('étiquettes du clavier', () => {
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

  it('la légende dit les touches, Maj, la molette et « pareil sur Mac et Windows »', () => {
    const l = splitLegend('scroll', PRESETS.azerty, 2)
    expect(l.short).toContain('A / Q')
    expect(l.short).toContain('Maj')
    expect(l.short).not.toContain('E / D')
    expect(l.long).toMatch(/Mac et Windows/)
    expect(l.long).toMatch(/Maj \+ molette/)
    expect(l.long).toMatch(/sous la souris/)
    expect(splitLegend('scroll', PRESETS.qwerty, 4).short).toContain('Q / A')
    expect(splitLegend('classic', PRESETS.azerty, 2).short).toMatch(/Aucune touche/)
    // la même phrase dans la bulle ⓘ et dans Réglages → Vue scindée
    expect(l.long).toContain(MODIFIERS_HELP)
    expect(MODIFIERS_HELP).toMatch(/Mac et Windows/)
    expect(MODIFIERS_HELP).toMatch(/Maj/)
  })
})

describe('libellés partagés et champs de saisie', () => {
  it('deux modes, deux cases, chacune avec son aide', () => {
    expect(MODE_LABELS.map((m) => m.id)).toEqual(['classic', 'scroll'])
    expect(FLAG_HELP.map((f) => f.key)).toEqual(['sync', 'actions'])
    expect(FLAG_HELP.find((f) => f.key === 'sync')?.hint).toMatch(/Maj/)
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
  const base = { mode: 'scroll' as const, sound: 'x:1', tab: 'links' }
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

describe('mode focus : site ou vue scindée (#183)', () => {
  it('permis sur un site affiché', () => expect(canFocus(true, false)).toBe(true))
  it('permis sur une vue scindée, même sans site dessous (accueil)', () => expect(canFocus(false, true)).toBe(true))
  it('permis quand les deux sont là', () => expect(canFocus(true, true)).toBe(true))
  it('refusé sur une page sans site ni vue', () => expect(canFocus(false, false)).toBe(false))
})
