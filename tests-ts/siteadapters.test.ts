import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SPLIT, PRESETS, applyProfile, interceptTable } from '../src/lib/splitView'

// desktop/site-adapters.js est du CommonJS de l'appli : chargé tel quel, sans Electron.
const adapters = createRequire(import.meta.url)('../desktop/site-adapters.js') as {
  siteOf: (url: string) => string | null
  run: (wc: unknown, op: string, hooks?: { before?: (name: string) => Promise<void> | void; field?: string }) => Promise<boolean | 'busy'>
  keyName: (k: string) => string
  createWheelSync: (now?: () => number) => (from: number, targets: unknown[], dy: number) => Promise<void>
  PLANS: Record<string, Record<string, unknown>>
  clickScript: (a: { scope: string | string[]; selectors: string[]; skip?: string }) => string
}

/** Une webview factice : note ce qu'on lui envoie. */
function fakeWc(url: string, js: unknown = true) {
  const sent: unknown[] = []
  const scripts: string[] = []
  return {
    sent,
    scripts,
    getURL: () => url,
    sendInputEvent: (e: unknown) => void sent.push(e),
    executeJavaScript: async (code: string) => {
      scripts.push(code)
      return code.includes('innerWidth, innerHeight]') ? [800, 600] : js
    },
  }
}

describe('adaptateurs de sites (vue scindée)', () => {
  it('reconnaît X, TikTok et Instagram par leur hôte, et rien d’autre', () => {
    expect(adapters.siteOf('https://x.com/home')).toBe('x')
    expect(adapters.siteOf('https://twitter.com/a')).toBe('x')
    expect(adapters.siteOf('https://www.tiktok.com/foryou')).toBe('tiktok')
    expect(adapters.siteOf('https://www.instagram.com/')).toBe('instagram')
    expect(adapters.siteOf('https://notx.com/')).toBeNull()
    expect(adapters.siteOf('https://x.com.evil.example/')).toBeNull()
    expect(adapters.siteOf('pas une adresse')).toBeNull()
  })

  it('« Suivre » n’existe pour aucun site (#166)', () => {
    for (const plan of Object.values(adapters.PLANS)) expect(plan.follow).toBeUndefined()
  })

  it('X : les actions cliquent dans le tweet centré (testid vérifiés sur le fil, #166), pas de touche', async () => {
    const wc = fakeWc('https://x.com/home')
    expect(await adapters.run(wc, 'like')).toBe(true)
    expect(wc.sent).toEqual([])
    expect(wc.scripts[0]).toContain('article[data-testid=\\"tweet\\"]')
    expect(wc.scripts[0]).toContain('[data-testid=\\"like\\"]')
    const sels = (op: string) => ((adapters.PLANS.x[op] as { dom: { selectors: string[] } }).dom.selectors)
    expect(sels('like')).toContain('[data-testid="unlike"]')
    expect(sels('save')).toContain('[data-testid="bookmark"]')
    expect(sels('share')).toContain('[data-testid="retweet"]')
    expect(sels('comment')).toEqual(['[data-testid="reply"]'])
  })

  it('X : « suivant » reste la touche native J (complète : keyDown, char, keyUp)', async () => {
    const wc = fakeWc('https://x.com/home')
    expect(await adapters.run(wc, 'next')).toBe(true)
    expect(wc.sent).toEqual([
      { type: 'keyDown', keyCode: 'j' },
      { type: 'char', keyCode: 'j' },
      { type: 'keyUp', keyCode: 'j' },
    ])
    expect(wc.scripts).toEqual([])
  })

  it('une touche envoyée à un site que sa table retiendrait est annoncée avant (sinon : boucle site → page → site)', async () => {
    const table = interceptTable(applyProfile(DEFAULT_SPLIT, 'scroll'), PRESETS.azerty, 3)
    const retained = new Set(table.keys)
    for (const [url, ops] of [
      ['https://x.com/home', ['next', 'prev']],
      ['https://www.tiktok.com/foryou', ['next', 'prev', 'like']],
    ] as const) {
      for (const op of ops) {
        const order: string[] = []
        const wc = fakeWc(url)
        const orig = wc.sendInputEvent
        wc.sendInputEvent = (e: unknown) => {
          const ev = e as { type: string; keyCode: string }
          if (ev.type === 'keyDown' && retained.has(adapters.keyName(ev.keyCode))) order.push(`key:${adapters.keyName(ev.keyCode)}`)
          orig(e)
        }
        // la molette « suivant » est limitée à un cran par quart de seconde : une webview neuve à chaque essai
        await adapters.run(wc, op, { before: (name) => void order.push(`announce:${name}`) })
        const sent = order.filter((o) => o.startsWith('key:'))
        for (const k of sent) {
          expect(order.indexOf(`announce:${k.slice(4)}`), `${url} ${op}`).toBeGreaterThanOrEqual(0)
          expect(order.indexOf(`announce:${k.slice(4)}`)).toBeLessThan(order.indexOf(k))
        }
      }
    }
  })

  it('Instagram : clic borné à la publication centrée, échec = false', async () => {
    const wc = fakeWc('https://www.instagram.com/', true)
    expect(await adapters.run(wc, 'like')).toBe(true)
    expect(wc.scripts[0]).toContain('"article"')
    expect(wc.scripts[0]).toContain('post.querySelectorAll')
    expect(wc.scripts[0]).not.toContain('textContent')
    // le « J'aime » d'un commentaire (dans une liste) ne compte pas
    expect(wc.scripts[0]).toContain('"ul, li"')
    expect(await adapters.run(fakeWc('https://www.instagram.com/', false), 'save')).toBe(false)
  })

  it('TikTok : la colonne d’actions commune (hors des <article>) passe avant le repli, favorite-icon pour Enregistrer (#166)', async () => {
    const wc = fakeWc('https://www.tiktok.com/foryou', true)
    expect(await adapters.run(wc, 'share')).toBe(true)
    expect(wc.scripts[0]).toContain('anchoring-engagement-vertical')
    const save = adapters.PLANS.tiktok.save as { dom: { scope: string[]; selectors: string[] } }
    expect(save.dom.scope[0]).toContain('anchoring-engagement-vertical')
    expect(save.dom.selectors[0]).toBe('[data-e2e="favorite-icon"]')
    expect(adapters.PLANS.tiktok.comment).toMatchObject({ dom: { selectors: ['[data-e2e="comment-icon"]'] } })
  })

  it('le script de clic : la première portée qui montre une publication gagne, jamais un élément ignoré', () => {
    type El = { r: { top: number; bottom: number; width: number; height: number }; kids: Record<string, El[]>; skip?: boolean; clicked?: boolean }
    const el = (top: number, bottom: number, kids: Record<string, El[]> = {}, skip = false): El => ({ r: { top, bottom, width: 20, height: bottom - top }, kids, skip })
    const run = (scope: string | string[], doc: Record<string, El[]>, skip = '') => {
      const wrap = (e: El) => ({
        getBoundingClientRect: () => e.r,
        querySelectorAll: (s: string) => (e.kids[s] || []).map(wrap),
        closest: (s: string) => (s === skip && e.skip ? e : s.includes('button') ? { click: () => void (e.clicked = true) } : null),
        click: () => void (e.clicked = true),
      })
      const g = globalThis as unknown as Record<string, unknown>
      g.innerHeight = 600
      g.document = { querySelectorAll: (s: string) => (doc[s] || []).map(wrap) }
      try {
        return eval(adapters.clickScript({ scope, selectors: ['.a'], skip })) as boolean
      } finally {
        delete g.document
        delete g.innerHeight
      }
    }
    const btn = el(290, 310)
    // portée 1 absente (ancienne mise en page) : repli sur la 2e
    expect(run(['.col', '.art'], { '.art': [el(0, 600, { '.a': [btn] })] })).toBe(true)
    expect(btn.clicked).toBe(true)
    // portée 1 présente mais hors écran : elle ne compte pas, le repli prend le relais
    const b2 = el(290, 310)
    expect(run(['.col', '.art'], { '.col': [el(900, 1200)], '.art': [el(0, 600, { '.a': [b2] })] })).toBe(true)
    // seul un élément à ignorer (cœur d'un commentaire) : rien n'est cliqué
    const b3 = el(290, 310, {}, true)
    expect(run('.art', { '.art': [el(0, 600, { '.a': [b3] })] }, 'ul, li')).toBe(false)
    expect(b3.clicked).toBeUndefined()
    // aucune publication : false
    expect(run('.art', {})).toBe(false)
  })

  it('le script de clic ne clique rien sans publication à l’écran', () => {
    const s = adapters.clickScript({ scope: 'article', selectors: ['svg'] })
    expect(s).toMatch(/if \(!post\) return false/)
  })

  it('action inconnue d’un site ou site inconnu : false, rien envoyé', async () => {
    const wc = fakeWc('https://example.com/')
    expect(await adapters.run(wc, 'like')).toBe(false)
    expect(await adapters.run(wc, 'follow')).toBe(false)
    expect(wc.sent).toEqual([])
    expect(wc.scripts).toEqual([])
  })

  it('suivant sur un site inconnu : la molette de la page', async () => {
    const wc = fakeWc('https://example.com/')
    expect(await adapters.run(wc, 'next')).toBe(true)
    expect(wc.sent[0]).toMatchObject({ type: 'mouseWheel', deltaY: -160 })
    const page = fakeWc('https://example.com/')
    await adapters.run(page, 'pagePrev')
    expect(page.sent[0]).toMatchObject({ type: 'mouseWheel', deltaY: 510 })
  })
})

describe('molette synchronisée : pas d’écho, même avec une page lente ou un écho en retard', () => {
  const wcOf = (id: number, slow = false) => {
    const sent: { deltaY: number }[] = []
    return {
      id,
      sent,
      isDestroyed: () => false,
      sendInputEvent: (e: { deltaY: number }) => void sent.push(e),
      // une page qui ne répond jamais (ou trop tard) : la taille est bornée à 100 ms
      executeJavaScript: () => (slow ? new Promise(() => undefined) : Promise.resolve([800, 600])),
    }
  }

  it('chaque recopie attend un écho, reconnu même très en retard (page lente)', async () => {
    let t = 0
    const forward = adapters.createWheelSync(() => t)
    const a = wcOf(1)
    const b = wcOf(2, true)
    const start = Date.now()
    await forward(1, [a, b], -120)
    expect(Date.now() - start).toBeLessThan(400)
    expect(b.sent).toHaveLength(1)
    expect(a.sent).toHaveLength(0)
    // l'écho de B arrive 1 s plus tard : ignoré (une fenêtre de 150 ms l'aurait laissé repartir)
    t += 1000
    await forward(2, [a, b], -120)
    expect(a.sent).toHaveLength(0)
    // une vraie molette de B ensuite : recopiée
    t += 100
    await forward(2, [a, b], -60)
    expect(a.sent).toHaveLength(1)
  })

  it('un écho qui ne vient jamais n’empêche pas la molette suivante (au-delà de 1,5 s)', async () => {
    let t = 0
    const forward = adapters.createWheelSync(() => t)
    const a = wcOf(1)
    const b = wcOf(2)
    await forward(1, [a, b], -50)
    t += 2000
    await forward(2, [a, b], -50)
    expect(a.sent).toHaveLength(1)
  })

  it('la taille de la page est gardée (pas une requête à chaque cran) et oubliée avec le site', async () => {
    let t = 0
    let calls = 0
    const forward = adapters.createWheelSync(() => t)
    const a = wcOf(1)
    const b = { ...wcOf(2), executeJavaScript: () => (calls++, Promise.resolve([800, 600])) }
    await forward(1, [a, b], -10)
    t += 10
    await forward(1, [a, b], -10)
    await forward(1, [a, b], -10)
    expect(calls).toBe(1)
    t += 2000
    await forward(1, [a, b], -10)
    expect(calls).toBe(2)
  })

  it('une touche native n’est pas envoyée si le focus du site est dans un champ de saisie : « busy »', async () => {
    const wc = fakeWc('https://www.tiktok.com/foryou', true)
    expect(await adapters.run(wc, 'like', { field: 'input, textarea' })).toBe('busy')
    expect(wc.sent).toEqual([])
    const free = fakeWc('https://www.tiktok.com/foryou', false)
    expect(await adapters.run(free, 'like', { field: 'input, textarea' })).toBe(true)
    expect(free.sent).toHaveLength(3)
  })
})
