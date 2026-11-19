import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SPLIT, PRESETS, applyProfile, interceptTable } from '../src/lib/splitView'

// desktop/site-adapters.js est du CommonJS de l'appli : chargé tel quel, sans Electron.
const adapters = createRequire(import.meta.url)('../desktop/site-adapters.js') as {
  siteOf: (url: string) => string | null
  run: (wc: unknown, op: string, hooks?: { before?: (name: string) => Promise<void> | void }) => Promise<boolean>
  keyName: (k: string) => string
  PLANS: Record<string, Record<string, unknown>>
  clickScript: (a: { scope: string; selectors: string[] }) => string
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

  it('X : touche native complète (keyDown, char, keyUp)', async () => {
    const wc = fakeWc('https://x.com/home')
    expect(await adapters.run(wc, 'like')).toBe(true)
    expect(wc.sent).toEqual([
      { type: 'keyDown', keyCode: 'l' },
      { type: 'char', keyCode: 'l' },
      { type: 'keyUp', keyCode: 'l' },
    ])
    expect(wc.scripts).toEqual([])
  })

  it('une touche envoyée à un site que sa table retiendrait est annoncée avant (sinon : boucle site → page → site)', async () => {
    const table = interceptTable(applyProfile(DEFAULT_SPLIT, 'scroll'), PRESETS.azerty, 3)
    const retained = new Set(table.keys)
    for (const [url, ops] of [
      ['https://x.com/home', ['next', 'prev', 'like', 'save', 'share', 'comment']],
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
