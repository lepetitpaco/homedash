/** Mise à jour de l'appli : quelle version, quel fichier, et refus d'un fichier qui n'est pas celui publié. */

import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const release = createRequire(import.meta.url)('../desktop/release.js')

const MAC = `version: 2.0.1
files:
  - url: homedash-2.0.1-arm64-mac.zip
    sha512: AAA=
    size: 100
  - url: homedash-2.0.1-x64-mac.zip
    sha512: 'BBB='
    size: 120
  - url: homedash-2.0.1-arm64.dmg
    sha512: CCC=
    size: 130
path: homedash-2.0.1-arm64-mac.zip
sha512: AAA=
releaseDate: '2026-11-01T10:00:00.000Z'
`
const WIN = `version: 2.0.1
files:
  - url: homedash-2.0.1-setup.exe
    sha512: WWW=
    size: 90
path: homedash-2.0.1-setup.exe
sha512: WWW=
`

describe('mise à jour', () => {
  it('versions', () => {
    expect(release.newer('2.0.1', '2.0.0')).toBe(true)
    expect(release.newer('2.0.0', '2.0.0')).toBe(false)
    expect(release.newer('1.10.0', '1.9.9')).toBe(true)
  })
  it("le bon fichier pour chaque machine", () => {
    const mac = release.parseLatest(MAC)
    expect(mac.length).toBe(3)
    expect(release.pick(mac, 'darwin', 'arm64')).toEqual({ url: 'homedash-2.0.1-arm64-mac.zip', sha512: 'AAA=', size: 100 })
    expect(release.pick(mac, 'darwin', 'x64').url).toBe('homedash-2.0.1-x64-mac.zip')
    expect(release.pick(release.parseLatest(WIN), 'win32', 'x64').url).toBe('homedash-2.0.1-setup.exe')
    expect(release.pick(mac, 'linux', 'x64')).toBeNull()
  })
  it("empreinte : celle d'electron-builder (sha512 en base64), et refus si elle diffère", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hd-rel-'))
    const file = path.join(dir, 'a.zip')
    fs.writeFileSync(file, 'contenu publié')
    const published = crypto.createHash('sha512').update('contenu publié').digest('base64')
    expect(release.matches(release.sha512Of(file), published)).toBe(true)
    fs.writeFileSync(file, 'contenu modifié')
    expect(release.matches(release.sha512Of(file), published)).toBe(false)
    expect(release.matches(release.sha512Of(file), '')).toBe(false)
    expect(release.matches(release.sha512Of(file), undefined)).toBe(false)
    fs.rmSync(dir, { recursive: true })
  })
})
