import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

// guest-preload.js tourne dans un site (monde isolé, sans module) : on en extrait le vrai code à tester,
// avec sa vraie liste de fenêtres (`DIALOG`).
const src = fs.readFileSync(new URL('../desktop/guest-preload.js', import.meta.url), 'utf8')
const body = src.slice(src.indexOf('// <visibleDialog>'), src.indexOf('// </visibleDialog>'))
const make = new Function(`${body}\nreturn { visibleDialog, DIALOG }`) as () => {
  visibleDialog: (doc: unknown, win: unknown) => boolean
  DIALOG: string
}
const { visibleDialog, DIALOG } = make()

type El = { hidden?: boolean; aria?: string; display?: string; visibility?: string; opacity?: string; rect?: [number, number, number, number] }
const world = (els: El[]) => ({
  doc: {
    querySelectorAll: () =>
      els.map((e) => ({
        hidden: e.hidden,
        getAttribute: () => e.aria ?? null,
        getBoundingClientRect: () => {
          const [left, top, width, height] = e.rect ?? [100, 100, 300, 200]
          return { left, top, width, height, right: left + width, bottom: top + height }
        },
        __e: e,
      })),
  },
  win: {
    innerWidth: 1000,
    innerHeight: 800,
    getComputedStyle: (el: { __e: El }) => ({ display: el.__e.display ?? 'block', visibility: el.__e.visibility ?? 'visible', opacity: el.__e.opacity ?? '1' }),
  },
})

describe('garde d’Échap des sites : seules les fenêtres visibles comptent', () => {
  it('la liste des fenêtres reconnues', () => {
    for (const sel of ['[aria-modal="true"]', '[role="dialog"]', 'dialog[open]']) expect(DIALOG).toContain(sel)
  })
  it('une fenêtre visible retient Échap', () => {
    const w = world([{}])
    expect(visibleDialog(w.doc, w.win)).toBe(true)
  })
  it('caché dans la page, transparent, sans taille ou hors de l’écran : ne compte pas', () => {
    for (const el of [
      { display: 'none' },
      { visibility: 'hidden' },
      { hidden: true },
      { aria: 'true' },
      { opacity: '0' },
      { rect: [0, 0, 0, 0] as [number, number, number, number] },
      { rect: [-2000, 0, 300, 200] as [number, number, number, number] },
      { rect: [100, 5000, 300, 200] as [number, number, number, number] },
    ]) {
      const w = world([el])
      expect(visibleDialog(w.doc, w.win), JSON.stringify(el)).toBe(false)
    }
  })
  it('un seul visible parmi des cachés suffit', () => {
    const w = world([{ display: 'none' }, {}])
    expect(visibleDialog(w.doc, w.win)).toBe(true)
    const none = world([])
    expect(visibleDialog(none.doc, none.win)).toBe(false)
  })
})

// Molette et survol de la vue scindée (#177) : le vrai code du préload, extrait de la même façon.
const wh = src.slice(src.indexOf('// <wheelHover>'), src.indexOf('// </wheelHover>'))
const { sidewaysWheel, pointerMoved, blockWanted } = new Function(`${wh}\nreturn { sidewaysWheel, pointerMoved, blockWanted }`)() as {
  blockWanted: (cfg: unknown) => boolean
  sidewaysWheel: (e: { shiftKey: boolean; deltaX: number; deltaY: number }) => boolean
  pointerMoved: (last: { x: number; y: number } | null, x: number, y: number) => boolean
}

describe('vue scindée : molette horizontale de Maj et survol sans mouvement (#177)', () => {
  it('Maj + molette d’une souris (horizontale) est reconnue ; un trackpad horizontal sans Maj n’est jamais touché', () => {
    expect(sidewaysWheel({ shiftKey: true, deltaX: 100, deltaY: 0 })).toBe(true)
    expect(sidewaysWheel({ shiftKey: false, deltaX: 40, deltaY: 0 })).toBe(false)
    // Maj sur un trackpad Mac : la molette reste verticale, rien à bloquer
    expect(sidewaysWheel({ shiftKey: true, deltaX: 0, deltaY: 60 })).toBe(false)
    expect(sidewaysWheel({ shiftKey: true, deltaX: 3, deltaY: 60 })).toBe(false)
  })
  it('le blocage de Maj + molette horizontale vaut vue ouverte, Flux comme Messagerie ; retiré à la fermeture', () => {
    expect(blockWanted({ open: true, table: { codes: ['KeyJ'] } })).toBe(true) // Flux
    expect(blockWanted({ open: true, table: { codes: [], shift: [], alt: [], relay: [] } })).toBe(true) // Messagerie
    expect(blockWanted({ open: false })).toBe(false)
    expect(blockWanted(null)).toBe(false)
  })
  it('un survol compte si la souris a bougé, pas si le contenu a défilé sous elle', () => {
    expect(pointerMoved(null, 10, 10)).toBe(true)
    expect(pointerMoved({ x: 10, y: 10 }, 10, 12)).toBe(true)
    expect(pointerMoved({ x: 10, y: 10 }, 10, 10)).toBe(false)
  })
})
