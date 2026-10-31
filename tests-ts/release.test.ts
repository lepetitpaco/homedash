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

describe('mise à jour Windows', () => {
  const args = { pid: 42, appDir: 'C:\\Users\\d’Arc\\homedash', appExe: 'C:\\Users\\d’Arc\\homedash\\homedash.exe', staged: "C:\\T\\o'k\\setup.exe", logFile: 'C:\\L\\update.log', pendingFile: 'C:\\L\\update-pending.json', version: '2.3.0' }
  const log = (...steps: string[]) => steps.map((s) => `2026-11-01T10:00:00 ${s}`).join('\r\n') + '\r\n'
  const pending = { from: '2.2.0', to: '2.3.0', at: 1000 }

  it('le script double toutes les apostrophes, typographiques comprises', () => {
    const script = release.winUpdateScript(args)
    expect(script).toContain("'C:\\T\\o''k\\setup.exe'")
    expect(script).toContain("d’’Arc")
    expect(script).toContain("homedash\\'") // séparateur final : « homedash-dev » n'est pas ce dossier
  })

  it("le script attend avec WaitForExit, pas Start-Process -Wait (qui attendrait l'appli relancée)", () => {
    const script = release.winUpdateScript(args)
    expect(script).toContain('WaitForExit(')
    expect(script).not.toMatch(/Start-Process[^;]*-Wait\b(?!ingDirectory)/)
  })

  it("le script s'arrête si l'appli a annulé la tentative", () => {
    expect(release.winUpdateScript(args)).toContain("Test-Path -LiteralPath 'C:\\L\\update-pending.json'")
  })

  it('la version comparée ignore le quatrième chiffre de Windows', () => {
    expect(release.winUpdateScript(args)).toContain(release.winSameVersion('2.3.0'))
    expect(release.winSameVersion('2.3.0')).toContain("'^(\\d+\\.\\d+\\.\\d+)\\.0$'")
  })

  it('le relais ne dépend pas de detached et protège le chemin du script', () => {
    const cmd = release.winRelayCommand({ scriptFile: "C:\\T\\d’Arc é\\update.ps1", cwd: 'C:\\T\\d’Arc é' })
    expect(cmd).toContain('-WindowStyle Hidden')
    expect(cmd).toContain(`'"C:\\T\\d’’Arc é\\update.ps1"'`)
  })

  it('une version plus récente : réussie, même si le journal parle mal', () => {
    expect(release.updateOutcome({ pending, logText: '', version: '2.3.0', now: 2000 }).state).toBe('done')
  })

  it('pas de tentative : rien à dire', () => {
    expect(release.updateOutcome({ pending: null, logText: '', version: '2.2.0' }).state).toBe('none')
  })

  it('appli ouverte à la main pendant l\'installation : on attend', () => {
    expect(release.updateOutcome({ pending, logText: log('start', 'launched'), version: '2.2.0', now: 2000 }).state).toBe('running')
  })

  it('journal sans fin, délai passé : échec', () => {
    const r = release.updateOutcome({ pending, logText: log('start'), version: '2.2.0', now: 1000 + release.WIN_MAX_MS + 1 })
    expect(r.state).toBe('failed')
  })

  it.each([
    [[], "n'a pas démarré"],
    [['start', 'waited', 'launch-failed Accès refusé', 'relaunch', 'end'], "n'a pas pu se lancer"],
    [['start', 'waited', 'launched', 'exit-timeout', 'end'], "pas fini à temps"],
    [['start', 'waited', 'launched', 'exit 2', 'version 2.2.0', 'relaunch', 'end'], '(code 2)'],
    [['start', 'waited', 'launched', 'exit 0', 'version 2.2.0', 'relaunch', 'end'], 'sans remplacer'],
  ])('version inchangée : la raison suit le journal (%j)', (steps, text) => {
    const r = release.updateOutcome({ pending, logText: steps.length ? log(...steps) : '', version: '2.2.0', now: 2000 })
    expect(r.state).toBe('failed')
    expect(r.reason).toContain(text)
  })

  it('le BOM ajouté par PowerShell ne gêne pas la lecture du journal', () => {
    expect(release.parseUpdateLog('\uFEFF2026-11-01T10:00:00 start\r\n')).toEqual([{ step: 'start', detail: '' }])
  })
})
