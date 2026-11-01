// Vraies captures de la page, sur une instance de démo (données fictives : data/ et fixtures.mjs).
// Lancé par docs/demo/capture.sh (Chromium dans Docker). `ONLY=accueil,github` n'en reprend que certaines.
import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as fx from './fixtures.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, '..', 'screenshots')
const URL = process.env.DEMO_URL || 'http://localhost:7790/'
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, colorScheme: 'dark' })
const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
for (const [name, body] of Object.entries({ github: fx.github, local: fx.local, basecamp: fx.basecamp, trello: fx.trello, events: fx.events }))
  await page.route(new RegExp(`/api/${name}(\\?.*)?$`), (r) => r.fulfill(json(body)))

const tab = (label) => page.locator('button', { hasText: label }).first().click()
const shots = {
  accueil: async () => {},
  github: () => tab('GitHub'),
  local: () => tab('Local'),
  basecamp: () => tab('Basecamp'),
  trello: async () => {
    await tab('Trello')
    await page.waitForTimeout(800)
    await page.getByText('Site perso', { exact: true }).first().click()
  },
  cloche: () => page.locator('button[aria-label="Notifications"]').click(),
  recherche: async () => {
    await page.keyboard.press('/')
    await page.keyboard.type('paiement', { delay: 40 })
  },
}

// La barre et ses réglages : une config de démo plus fournie, pour montrer dossiers, comptes et Docker.
const site = (id, label, url, more = {}) => ({ id, label, url, embed: true, ...more })
const demoSites = [
  site('x-wiki', 'Wikipédia', 'https://www.wikipedia.org/'),
  site('x-osm', 'OpenStreetMap', 'https://www.openstreetmap.org/', { session: 'pro' }),
  site('x-mail', 'Boîte mail', 'https://www.bbc.com/', { session: 'pro' }),
  site('x-yt', 'YouTube', 'https://www.youtube.com/', { session: 'perso' }),
  site('x-mdn', 'MDN', 'https://developer.mozilla.org/', { folder: 'f-dev' }),
  site('x-caniuse', 'Can I use', 'https://caniuse.com/', { folder: 'f-dev' }),
  site('x-hn', 'Hacker News', 'https://news.ycombinator.com/', { folder: 'f-lecture', session: 'perso' }),
]
const demoDocker = {
  available: true,
  entries: [
    { id: 'boutique', label: 'boutique', image: 'boutique-web', running: true, ports: [{ port: 3000, url: 'http://localhost:3000/' }] },
    { id: 'blog', label: 'blog', image: 'ghost', running: true, ports: [{ port: 2368, url: 'http://localhost:2368/' }] },
    { id: 'api-test', label: 'api-test', image: 'api', running: false, ports: [] },
  ],
}
const barPage = async ({ width = 1600, height = 1000, labels = 'right', size = 'icons' } = {}) => {
  const p = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: 'dark' })
  await p.addInitScript(
    ([l, z]) => {
      localStorage.setItem('homedash:rail-labels', l)
      localStorage.setItem('homedash:rail-size', z)
      localStorage.setItem('homedash:rail-closed', '[]')
      localStorage.setItem('homedash:dock-hint', 'done')
      localStorage.setItem('homedash:tab-counts', JSON.stringify({ 'x:x-mail': 3, 'x:x-hn': 12 }))
      const base = { version: 'demo', appVersion: 'demo', platform: 'darwin', features: ['site-switch', 'sessions'], onSiteSwitch: (cb) => ((window.__switch = cb), () => undefined) }
      window.homedashDesktop = new Proxy(base, { get: (t, k) => (k in t ? t[k] : () => () => undefined) })
    },
    [labels, size],
  )
  await p.route(/\/api\/config(\?.*)?$/, async (r) => {
    if (r.request().method() !== 'GET') return r.continue()
    const res = await r.fetch()
    await r.fulfill({
      response: res,
      json: {
        ...(await res.json()),
        tabs: demoSites,
        tabFolders: [{ id: 'f-dev', name: 'Dev', color: '#60a5fa' }, { id: 'f-lecture', name: 'Lecture', color: '#f59e0b' }],
        tabSessions: [{ id: 'pro', name: 'pro', color: '#38bdf8' }, { id: 'perso', name: 'perso', color: '#a855f7' }],
        docker: { enabled: true },
      },
    })
  })
  await p.route(/\/api\/docker(\?.*)?$/, (r) => r.fulfill(json(demoDocker)))
  await p.goto(URL, { waitUntil: 'networkidle' })
  await p.waitForTimeout(1500)
  return p
}
const out = (name) => path.join(OUT, `${name}.jpg`)
const jpeg = { type: 'jpeg', quality: 85 }
const barMenu = async (p) => {
  await p.locator('.rail-foot').click({ button: 'right', position: { x: 8, y: 4 } })
  await p.waitForTimeout(300)
}
const extra = {
  'barre-trois-largeurs': async () => {
    const cuts = []
    for (const [labels, size] of [['right', 'icons'], ['grid2', 'icons'], ['text', 'icons'], ['none', 'icons'], ['none', 'mini']]) {
      const p = await barPage({ height: 800, labels, size })
      const w = await p.evaluate(() => document.querySelector('.rail').offsetWidth)
      cuts.push((await p.screenshot({ ...jpeg, clip: { x: 0, y: 0, width: w, height: 800 } })).toString('base64'))
      await p.close()
    }
    const p = await browser.newPage({ viewport: { width: 880, height: 800 }, deviceScaleFactor: 2 })
    await p.setContent(`<body style="margin:0;background:#23262d;display:flex;gap:12px">${cuts.map((c) => `<img style="height:800px" src="data:image/jpeg;base64,${c}">`).join('')}`)
    await p.waitForTimeout(300)
    const w = await p.evaluate(() => document.body.scrollWidth)
    await p.setViewportSize({ width: w, height: 800 })
    await p.screenshot({ ...jpeg, path: out('barre-trois-largeurs') })
    await p.close()
  },
  'barre-clic-droit': async () => {
    const p = await barPage({ height: 800, labels: 'none' })
    await barMenu(p)
    await p.screenshot({ ...jpeg, path: out('barre-clic-droit'), clip: { x: 0, y: 340, width: 430, height: 460 } })
    await p.close()
  },
  'barre-disposition': async () => {
    const p = await barPage({ height: 800, labels: 'grid2' })
    await barMenu(p)
    await p.locator('span', { hasText: 'Disposition et taille…' }).click()
    await p.waitForTimeout(300)
    await p.mouse.move(1000, 400)
    await p.screenshot({ ...jpeg, path: out('barre-disposition'), clip: { x: 0, y: 200, width: 620, height: 600 } })
    await p.close()
  },
  'changer-de-site': async () => {
    const p = await barPage({ width: 1280, height: 800 })
    await p.evaluate(() => window.__switch('next'))
    await p.waitForTimeout(400)
    await p.evaluate(() => window.__switch('next'))
    await p.waitForTimeout(300)
    await p.screenshot({ ...jpeg, path: out('changer-de-site') })
    await p.close()
  },
  'reglages-onglets': async () => {
    const p = await barPage({ height: 960, labels: 'none' })
    await p.locator('.rail-settings').click()
    await p.waitForTimeout(500)
    await p.locator('button', { hasText: 'Mes sites' }).last().click()
    await p.waitForTimeout(800)
    await p.screenshot({ ...jpeg, path: out('reglages-onglets') })
    await p.close()
  },
  sauvegardes: async () => {
    const p = await barPage({ height: 960, labels: 'none' })
    await p.locator('.rail-settings').click()
    await p.waitForTimeout(500)
    await p.locator('button', { hasText: 'Sauvegardes' }).last().click()
    await p.waitForTimeout(800)
    await p.locator('#set-backups').screenshot({ ...jpeg, path: out('sauvegardes') })
    await p.close()
  },
}
for (const [name, act] of Object.entries(extra)) {
  if (ONLY && !ONLY.has(name)) continue
  await act()
  console.log(`✓ ${name}.jpg`)
}

for (const [name, act] of Object.entries(shots)) {
  if (ONLY && !ONLY.has(name)) continue
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await act()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 85 })
  console.log(`✓ ${name}.jpg`)
}
await browser.close()
