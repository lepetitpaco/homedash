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
