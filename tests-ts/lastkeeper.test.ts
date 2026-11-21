import { describe, expect, it } from 'vitest'
import { MAX_WAIT_MS, MIN_GAP_MS, QUIET_MS, createLastKeeper } from '../src/lib/lastKeeper'
import { NAV_START, navOk, normalizeViews, withLast } from '../src/lib/splitViews'
import type { SavedSplitView } from '../src/types'

/** Une horloge et une config factices : `latest` avance à chaque écriture, comme `useConfigState`. */
function world(views: SavedSplitView[]) {
  let t = 0
  const timers = new Map<number, { at: number; fn: () => void }>()
  let next = 1
  const cfg = { latest: { splitViews: views } as { splitViews: SavedSplitView[] } }
  const writes: { id: string; last: (string | null)[] }[] = []
  const keeper = createLastKeeper(
    {
      stored: (id) => {
        const v = normalizeViews(cfg.latest.splitViews).find((x) => x.id === id)
        return v ? (v.last ?? []) : null
      },
      write: (id, last) => {
        writes.push({ id, last })
        cfg.latest = { splitViews: normalizeViews(cfg.latest.splitViews).map((v) => (v.id === id ? withLast(v, last) : v)) }
      },
    },
    {
      now: () => t,
      set: (fn, ms) => (timers.set(next, { at: t + ms, fn }), next++),
      clear: (id) => void timers.delete(id),
    },
  )
  const advance = (ms: number) => {
    const end = t + ms
    for (;;) {
      const due = [...timers.entries()].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      t = due[1].at
      timers.delete(due[0])
      due[1].fn()
    }
    t = end
  }
  return { keeper, cfg, writes, advance }
}
const v = (id: string, last?: (string | null)[]): SavedSplitView => ({ id, name: id, layout: 'c2', slots: ['x-a', 'x-b', null, null], ...(last ? { last } : {}) })
const reel = (n: number) => `https://www.instagram.com/reel/${n}/`

describe('dernières adresses : écriture regroupée (#180)', () => {
  it('5 s après la dernière navigation, une seule écriture', () => {
    const w = world([v('A')])
    w.keeper.open('A')
    w.keeper.note('A', 0, reel(1))
    w.advance(2000)
    w.keeper.note('A', 0, reel(2))
    w.advance(QUIET_MS - 1)
    expect(w.writes).toHaveLength(0)
    w.advance(1)
    expect(w.writes).toEqual([{ id: 'A', last: [reel(2), null, null, null] }])
  })
  it('navigation continue : écrite au plus tard 60 s après la première navigation non écrite, jamais en rafale', () => {
    const w = world([v('A')])
    w.keeper.open('A')
    for (let i = 0; i < 300; i++) {
      w.keeper.note('A', 0, reel(i)) // un reel toutes les 2 s pendant 10 min
      w.advance(2000)
    }
    expect(w.writes.length).toBeGreaterThanOrEqual(9)
    expect(w.writes.length).toBeLessThanOrEqual(10)
    expect(MAX_WAIT_MS).toBeGreaterThan(MIN_GAP_MS)
  })
  it('la fermeture écrit tout de suite ; rien si rien n’a changé', () => {
    const w = world([v('A', [reel(1)])])
    expect(w.keeper.open('A')).toEqual([reel(1), null, null, null])
    w.keeper.note('A', 0, reel(1))
    w.keeper.close('A')
    expect(w.writes).toHaveLength(0)
    w.keeper.open('A')
    w.keeper.note('A', 1, reel(9))
    w.keeper.close('A')
    expect(w.writes).toEqual([{ id: 'A', last: [reel(1), reel(9), null, null] }])
  })
  it('ajouter une vue après des navigations dans une autre : la vue neuve n’est jamais effacée', () => {
    const w = world([v('A')])
    w.keeper.open('A')
    w.keeper.note('A', 0, reel(1))
    // createView : ce qui attend part d'abord, puis l'ajout s'écrit sur la config qui le contient
    w.keeper.flush()
    w.cfg.latest = { splitViews: [...w.cfg.latest.splitViews, v('B')] }
    // openSavedView(B) : rien à réécrire, la config garde B et l'adresse de A
    w.keeper.open('B')
    w.advance(MAX_WAIT_MS * 2)
    const ids = w.cfg.latest.splitViews.map((x) => x.id)
    expect(ids).toEqual(['A', 'B'])
    expect(normalizeViews(w.cfg.latest.splitViews)[0].last).toEqual([reel(1), null, null, null])
    expect(w.writes).toHaveLength(1)
  })
  it('annuler « Modifier la vue » repart de l’enregistré ; une vue disparue n’est jamais réécrite', () => {
    const w = world([v('A', [reel(1)])])
    w.keeper.open('A')
    w.keeper.note('A', 0, reel(2))
    w.keeper.flush() // editView écrit d'abord
    expect(w.keeper.open('A', { reset: true })).toEqual([reel(2), null, null, null])
    w.keeper.note('A', 1, reel(3))
    w.cfg.latest = { splitViews: [] } // vue supprimée entre-temps
    w.keeper.close('A')
    expect(w.writes).toHaveLength(1)
  })
  it('« Repartir du début » / enregistrement : adoptés, plus rien n’attend', () => {
    const w = world([v('A', [reel(1)])])
    w.keeper.open('A')
    w.keeper.note('A', 0, reel(5))
    w.keeper.adopt('A', [])
    w.cfg.latest = { splitViews: [v('A')] }
    w.advance(MAX_WAIT_MS * 2)
    expect(w.writes).toHaveLength(0)
    expect(w.keeper.pendingOf('A')).toEqual([null, null, null, null])
  })
  it('quitter / recharger / mettre à jour : about:blank dans chaque copie ne note rien, l’adresse écrite est gardée', () => {
    const home = 'https://www.instagram.com/'
    const w = world([v('A', [reel(1)])])
    w.keeper.open('A')
    // la copie démarre sur l'adresse notée : rien de neuf
    let nav = navOk(NAV_START, reel(1), home, 200)
    w.keeper.note('A', 0, nav.current)
    // unloadGuests (main.js) charge about:blank dans toutes les webviews, puis pagehide écrit ce qui attend
    const after = navOk(nav, 'about:blank', home)
    expect(after).toBe(nav)
    nav = after
    w.keeper.note('A', 0, nav.current)
    w.keeper.flush()
    w.keeper.close('A')
    expect(w.writes).toHaveLength(0)
    expect(normalizeViews(w.cfg.latest.splitViews)[0].last).toEqual([reel(1), null, null, null])
  })
})
