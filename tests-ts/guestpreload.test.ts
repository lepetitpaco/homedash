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
