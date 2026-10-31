/**
 * Mise à jour Windows, pour de vrai : le script lancé par la vraie fonction, avec un
 * faux installateur. Ne tourne que sous Windows (CI : windows.yml) : ailleurs, le bug
 * de #82 n'existe pas et ce test ne prouverait rien.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const releasePath = createRequire(import.meta.url).resolve('../desktop/release.js')
const release = createRequire(import.meta.url)(releasePath)

async function until(check: () => boolean, ms = 60_000) {
  const limit = Date.now() + ms
  while (!check() && Date.now() < limit) await new Promise((r) => setTimeout(r, 250))
  return check()
}

function setup(code: number) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homedash test d'é’-"))
  const appDir = path.join(root, 'app')
  const dir = path.join(root, 'maj')
  fs.mkdirSync(appDir)
  fs.mkdirSync(dir)
  const appExe = path.join(appDir, 'homedash.cmd')
  fs.writeFileSync(appExe, '@echo relance> "%~dp0relaunched"\r\n')
  const staged = path.join(dir, 'setup.cmd')
  fs.writeFileSync(staged, `@echo %*> "%~dp0args"\r\n@exit /b ${code}\r\n`)
  const logFile = path.join(root, 'update.log')
  const pendingFile = path.join(root, 'update-pending.json')
  fs.writeFileSync(pendingFile, '{}')
  const script = release.winUpdateScript({ pid: 999999, appDir, appExe, staged, logFile, pendingFile, version: '9.9.9' })
  const steps = () => (fs.existsSync(logFile) ? release.parseUpdateLog(fs.readFileSync(logFile, 'utf8')).map((s: { step: string }) => s.step) : [])
  return { appDir, dir, logFile, pendingFile, script, staged, steps }
}

describe.runIf(process.platform === 'win32')('mise à jour Windows, en vrai', () => {
  it("le script survit au processus qui l'a lancé, et va au bout", async () => {
    const t = setup(0)
    const child = `require(${JSON.stringify(releasePath)}).startWinScript(${JSON.stringify({ script: t.script, dir: t.dir, logFile: t.logFile })}).then(()=>process.exit(0),(e)=>{console.error(e);process.exit(1)})`
    execFileSync(process.execPath, ['-e', child], { stdio: 'inherit' }) // il sort dès la ligne `start`
    expect(await until(() => t.steps().includes('end'))).toBe(true)
    expect(t.steps().slice(0, 4)).toEqual(['start', 'waited', 'launched', 'exit'])
    expect(fs.readFileSync(path.join(t.dir, 'args'), 'utf8').trim()).toBe('/S --updated --force-run')
    // Faux exe sans numéro de version : le script le voit comme non remplacé, et rouvre l'appli.
    expect(t.steps()).toContain('relaunch')
    expect(await until(() => fs.existsSync(path.join(t.appDir, 'relaunched')))).toBe(true)
  }, 120_000)

  it("installateur en échec : le code est noté et l'appli se rouvre", async () => {
    const t = setup(2)
    await release.startWinScript({ script: t.script, dir: t.dir, logFile: t.logFile })
    expect(await until(() => t.steps().includes('end'))).toBe(true)
    expect(fs.readFileSync(t.logFile, 'utf8')).toMatch(/ exit 2\r?\n/)
    expect(await until(() => fs.existsSync(path.join(t.appDir, 'relaunched')))).toBe(true)
  }, 120_000)

  it("tentative annulée : l'installateur n'est pas lancé", async () => {
    const t = setup(0)
    fs.rmSync(t.pendingFile)
    await release.startWinScript({ script: t.script, dir: t.dir, logFile: t.logFile })
    expect(await until(() => t.steps().includes('cancelled'))).toBe(true)
    expect(fs.existsSync(path.join(t.dir, 'args'))).toBe(false)
  }, 120_000)

  it('script qui ne démarre pas : erreur, pas de fausse réussite', async () => {
    const t = setup(0)
    await expect(release.startWinScript({ script: 'exit 0', dir: t.dir, logFile: t.logFile, timeoutMs: 8000 })).rejects.toThrow("n'a pas démarré")
  }, 60_000)
})
