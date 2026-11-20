import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

// guest-preload.js tourne dans un site (monde isolé, sans module) : on en extrait la fonction à tester.
const src = fs.readFileSync(new URL('../desktop/guest-preload.js', import.meta.url), 'utf8')
const body = src.slice(src.indexOf('// <visibleDialog>'), src.indexOf('// </visibleDialog>'))
const visibleDialog = new Function(`const DIALOG = '[aria-modal="true"], [role="dialog"]'\n${body}\nreturn visibleDialog`)() as (
  doc: unknown,
  win: unknown,
) => boolean

type El = { hidden?: boolean; aria?: string; display?: string; visibility?: string; rects?: number }
const world = (els: El[]) => ({
  doc: {
    querySelectorAll: () =>
      els.map((e) => ({ hidden: e.hidden, getAttribute: () => e.aria ?? null, getClientRects: () => ({ length: e.rects ?? 1 }), __e: e })),
  },
  win: { getComputedStyle: (el: { __e: El }) => ({ display: el.__e.display ?? 'block', visibility: el.__e.visibility ?? 'visible' }) },
})

describe('garde d’Échap des sites : seules les fenêtres visibles comptent', () => {
  it('une fenêtre visible retient Échap', () => {
    const w = world([{}])
    expect(visibleDialog(w.doc, w.win)).toBe(true)
  })
  it('un role="dialog" caché dans la page ne compte pas (display, visibility, hidden, aria-hidden, sans boîte)', () => {
    for (const el of [{ display: 'none' }, { visibility: 'hidden' }, { hidden: true }, { aria: 'true' }, { rects: 0 }]) {
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
