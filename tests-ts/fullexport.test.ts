/** Export complet (#61) : chiffré, refusé sans le bon mot de passe ou modifié, importé sans rien perdre. */

import fs from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'

import * as backup from '../server/backup.ts'
import * as fullexport from '../server/fullexport.ts'
import * as store from '../server/store.ts'

const TOKEN = 'ghp_EXPORTSECRET0123456789abcdef'
const COOKIES = { 'persist:homedash-tabs': [{ name: 'SID', value: 'cookie-secret', domain: '.google.com', path: '/', secure: true }], 'persist:autre': [{ name: 'x', value: 'y' }] }

beforeEach(() => {
  store.write(store.CONFIG, { title: 'chez moi', groups: [{ name: 'Liens', links: [{ name: 'A', url: 'https://a.test' }] }], tabs: [{ id: 'gm', label: 'Gmail', url: 'https://mail.google.com' }] })
  store.write(store.NOTES, [{ id: 'n1', text: 'note' }])
  store.write(store.SECRETS, { github_tokens: { main: TOKEN }, basecamp: { access_token: 'bc-secret' } }, 0o600)
})

const sealed = () => fullexport.seal(fullexport.collect(COOKIES, '2.0.0'), 'motdepasse')

describe('export complet', () => {
  it('aucun secret en clair dans le fichier', () => {
    const file = sealed()
    for (const secret of [TOKEN, 'bc-secret', 'cookie-secret', 'chez moi']) expect(file).not.toContain(secret)
  })
  it('mot de passe trop court refusé', () => {
    expect(() => fullexport.seal(fullexport.collect({}, '2.0.0'), 'court')).toThrow(RangeError)
  })
  it('seules les sessions des onglets partent', () => {
    expect(Object.keys(fullexport.open(sealed(), 'motdepasse').cookies)).toEqual(['persist:homedash-tabs'])
  })
  it('mauvais mot de passe : refus', () => {
    expect(() => fullexport.open(sealed(), 'mauvais!')).toThrow('mot de passe incorrect')
  })
  it('un octet modifié : refus', () => {
    const f = JSON.parse(sealed())
    const data = Buffer.from(f.data, 'base64')
    data[10] ^= 1
    f.data = data.toString('base64')
    expect(() => fullexport.open(JSON.stringify(f), 'motdepasse')).toThrow(RangeError)
  })
  it("pas un export : refus lisible", () => {
    expect(() => fullexport.open('{"homedash_backup":1}', 'x')).toThrow("n'est pas un export complet")
    expect(() => fullexport.open('pas du json', 'x')).toThrow("n'est pas un export complet")
  })
  it("paramètres de dérivation hors bornes : refus avant tout calcul", () => {
    const f = JSON.parse(sealed())
    f.kdf.N = 2 ** 24
    expect(() => fullexport.open(JSON.stringify(f), 'motdepasse')).toThrow('fichier invalide')
  })
  it("l'aperçu ne montre aucun secret", () => {
    const sum = fullexport.summary(fullexport.open(sealed(), 'motdepasse'))
    expect(sum).toMatchObject({ title: 'chez moi', links: 1, tabs: 1, github_tokens: 1, basecamp: true, notes: 1, cookies: 1, cookie_sites: 1 })
    for (const secret of [TOKEN, 'bc-secret', 'cookie-secret']) expect(JSON.stringify(sum)).not.toContain(secret)
  })
})

describe('import complet', () => {
  it('instantané avant, jetons remplacés gardés à part, en 600', () => {
    const payload = fullexport.open(sealed(), 'motdepasse')
    // l'autre machine avait d'autres réglages et un autre jeton
    store.write(store.CONFIG, { title: 'ailleurs', groups: [] })
    store.write(store.SECRETS, { github_tokens: { main: 'ancien-jeton' } }, 0o600)
    const before = backup.listing().length
    const done = fullexport.apply(payload, { settings: true, secrets: true, cookies: true })
    expect(done.before).toMatch(/avant-import/)
    expect(backup.listing().length).toBe(before + 1)
    expect(store.read<any>(store.CONFIG, {}).title).toBe('chez moi')
    expect(store.readSecret<any>('github_tokens')).toEqual({ main: TOKEN })
    const kept = fs.readdirSync(store.DATA_DIR()).find((n) => n.startsWith('secrets.avant-import-'))
    expect(kept).toBeDefined()
    expect(fs.readFileSync(store.pathOf(kept as string), 'utf-8')).toContain('ancien-jeton')
    if (process.platform !== 'win32') expect(fs.statSync(store.pathOf(kept as string)).mode & 0o777).toBe(0o600)
    expect(done.cookies['persist:homedash-tabs'][0].name).toBe('SID')
  })
  it("rien n'est écrit si la config du fichier est invalide", () => {
    const payload = fullexport.open(sealed(), 'motdepasse')
    payload.files.config = { groups: 'non' }
    const before = backup.listing().length
    expect(() => fullexport.apply(payload, { settings: true, secrets: true })).toThrow(RangeError)
    expect(backup.listing().length).toBe(before)
    expect(store.read<any>(store.CONFIG, {}).title).toBe('chez moi')
  })
})
