/**
 * Ce que la mise à jour décide sans rien toucher (updater.js s'en sert) : quelle
 * version est plus récente, quel fichier de la Release va à cette machine, et
 * si le fichier téléchargé est bien celui publié. Sans Electron : testé à part
 * (tests-ts/release.test.ts).
 */
const { spawn } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

/** `1.10.0` > `1.9.3`. */
function newer(a, b) {
  const x = String(a).split('.').map(Number)
  const y = String(b).split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0)
  return false
}

/**
 * `latest-mac.yml` / `latest.yml` d'electron-builder → [{url, sha512, size}].
 * Format fixe et simple : pas besoin d'une bibliothèque YAML.
 */
function parseLatest(text) {
  const files = []
  let cur = null
  for (const line of String(text).split(/\r?\n/)) {
    const item = /^\s*-\s+url:\s*(.+)$/.exec(line)
    if (item) {
      cur = { url: item[1].trim().replace(/^['"]|['"]$/g, '') }
      files.push(cur)
      continue
    }
    const kv = /^\s+(sha512|size):\s*(.+)$/.exec(line)
    if (kv && cur) cur[kv[1]] = kv[1] === 'size' ? Number(kv[2]) : kv[2].trim().replace(/^['"]|['"]$/g, '')
    else if (/^\S/.test(line)) cur = null
  }
  return files
}

/** Le fichier de cette machine : zip Mac de la bonne architecture, ou installateur Windows. */
function pick(files, platform = process.platform, arch = process.arch) {
  if (platform === 'darwin') {
    const a = arch === 'arm64' ? 'arm64' : 'x64'
    return files.find((f) => f.url.endsWith('.zip') && f.url.includes(`-${a}-`)) || null
  }
  if (platform === 'win32') return files.find((f) => f.url.endsWith('.exe')) || null
  return null
}

/** Empreinte d'un fichier au format de latest*.yml : sha512 en base64. */
function sha512Of(file) {
  return crypto.createHash('sha512').update(fs.readFileSync(file)).digest('base64')
}

/** Le fichier téléchargé est-il celui publié ? Sans empreinte publiée : non. */
function matches(digest, expected) {
  return typeof expected === 'string' && expected.length > 0 && digest === expected
}

const WIN_WAIT_S = 60 // l'appli et ses processus enfants ont une minute pour se fermer
const WIN_INSTALL_MS = 5 * 60 * 1000 // l'installateur, cinq minutes pour finir
const WIN_START_MS = 20 * 1000 // le script, vingt secondes pour démarrer
/** Au-delà, le script a forcément fini : une installation sans `end` au journal est morte. */
const WIN_MAX_MS = 7 * 60 * 1000

/** Chaîne PowerShell entre apostrophes : PowerShell prend aussi les apostrophes typographiques pour des délimiteurs. */
function psQuote(s) {
  return `'${String(s).replace(/['‘’‚‛]/g, '$&$&')}'`
}

/**
 * Script du PowerShell détaché : attend que l'appli soit fermée, lance
 * l'installateur, vérifie la version installée et rouvre l'appli si elle n'a pas
 * été remplacée. Chaque étape est notée au journal (une ligne `date étape détail`).
 * Installateur encore en cours après le délai : pas de réouverture, il la fermerait.
 * `pendingFile` disparu avant l'installation : l'appli a annulé, elle reste ouverte.
 */
function winUpdateScript({ pid, appDir, appExe, staged, logFile, pendingFile, version }) {
  return [
    `$log = ${psQuote(logFile)}`,
    `$exe = ${psQuote(appExe)}`,
    `function Note($m) { try { Add-Content -LiteralPath $log -Value ((Get-Date -Format o) + ' ' + $m) -Encoding UTF8 } catch {} }`,
    `Note 'start'`,
    `$dir = ${psQuote(appDir.replace(/[\\/]*$/, '\\'))}`,
    `function Left { try { @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($dir, [StringComparison]::OrdinalIgnoreCase) }).Count } catch { @(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).Count } }`,
    `$limit = (Get-Date).AddSeconds(${WIN_WAIT_S})`,
    `while (((Left) -gt 0) -and ((Get-Date) -lt $limit)) { Start-Sleep -Seconds 1 }`,
    `if ((Left) -gt 0) { Note 'wait-timeout' } else { Note 'waited' }`,
    `if (-not (Test-Path -LiteralPath ${psQuote(pendingFile)})) { Note 'cancelled'; exit }`,
    `$ok = $false`,
    `$hung = $false`,
    `try { $p = Start-Process -FilePath ${psQuote(staged)} -ArgumentList '/S','--updated','--force-run' -PassThru -ErrorAction Stop; $null = $p.Handle; Note 'launched'; if ($p.WaitForExit(${WIN_INSTALL_MS})) { Note ('exit ' + $p.ExitCode); $v = (Get-Item -LiteralPath $exe -ErrorAction SilentlyContinue).VersionInfo.ProductVersion; Note ('version ' + $v); $ok = (($p.ExitCode -eq 0) -and ($v -eq ${psQuote(version)})) } else { Note 'exit-timeout'; $hung = $true } } catch { Note ('launch-failed ' + $_.Exception.Message) }`,
    `if ((-not $ok) -and (-not $hung)) { try { Start-Process -FilePath $exe -WorkingDirectory ${psQuote(appDir)} -ErrorAction Stop; Note 'relaunch' } catch { Note ('relaunch-failed ' + $_.Exception.Message) } }`,
    `Note 'end'`,
  ].join('; ')
}

/**
 * Commande du PowerShell relais. Lancé avec `detached`, powershell.exe se ferme
 * aussitôt en code 0 sans rien exécuter ; sans `detached`, il meurt avec l'appli.
 * Le relais, lui, démarre le vrai script hors de l'appli, puis se ferme (#82).
 * Start-Process n'entoure pas les arguments de guillemets : le chemin a les siens.
 */
function winRelayCommand({ scriptFile, cwd }) {
  return `Start-Process -FilePath powershell.exe -WindowStyle Hidden -WorkingDirectory ${psQuote(cwd)} -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',${psQuote(`"${scriptFile}"`)}`
}

/**
 * Démarre le script et attend la ligne `start` du journal : c'est la seule preuve
 * qu'il tourne, ni l'événement `spawn` ni le code de sortie n'en disent rien.
 * UTF-8 avec BOM : sans lui, PowerShell 5.1 abîme les accents des chemins.
 */
async function startWinScript({ script, dir, logFile, timeoutMs = WIN_START_MS }) {
  const scriptFile = path.join(dir, 'update.ps1')
  fs.writeFileSync(scriptFile, `\uFEFF${script}`, 'utf8')
  const relay = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', winRelayCommand({ scriptFile, cwd: dir })], {
    cwd: dir,
    stdio: 'ignore',
    windowsHide: true,
  })
  let failure = null
  relay.once('error', (e) => (failure = e))
  const limit = Date.now() + timeoutMs
  while (Date.now() < limit) {
    if (failure) throw failure
    let text = ''
    try {
      text = fs.readFileSync(logFile, 'utf8')
    } catch {
      /* pas encore écrit */
    }
    if (parseUpdateLog(text).some((s) => s.step === 'start')) return
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error("l'installation n'a pas démarré")
}

/** Lignes du journal → [{step, detail}]. */
function parseUpdateLog(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => /^\S+ (\S+)(?: (.*))?$/.exec(line.trim()))
    .filter(Boolean)
    .map((m) => ({ step: m[1], detail: m[2] || '' }))
}

/** Ce qu'il faut dire à la personne, d'après la dernière étape atteinte. */
function explainFailure(steps) {
  const find = (name) => steps.find((s) => s.step === name)
  const busy = 'Un fichier de homedash était peut-être encore utilisé.'
  if (!steps.length) return "L'installation n'a pas démarré."
  if (find('launch-failed')) return "L'installateur n'a pas pu se lancer. Windows ou un antivirus l'a peut-être bloqué."
  if (find('exit-timeout')) return "L'installateur n'a pas fini à temps."
  const exit = find('exit')
  if (exit && exit.detail !== '0') return `L'installateur s'est arrêté avant la fin (code ${exit.detail}). ${busy}`
  if (exit) return `L'installateur s'est fermé sans remplacer homedash. ${busy}`
  return "L'installation s'est interrompue avant la fin."
}

/**
 * Au démarrage, après une tentative de mise à jour :
 * `none` rien à dire, `done` réussie, `running` encore en cours (appli ouverte à
 * la main entre-temps), `failed` version inchangée, avec la raison (`reason`).
 */
function updateOutcome({ pending, logText, version, now = Date.now() }) {
  if (!pending) return { state: 'none' }
  if (newer(version, pending.from)) return { state: 'done' }
  const steps = parseUpdateLog(logText)
  const finished = steps.some((s) => s.step === 'end')
  if (steps.length && !finished && now - pending.at < WIN_MAX_MS) return { state: 'running' }
  return { state: 'failed', reason: explainFailure(steps) }
}

module.exports = { WIN_MAX_MS, explainFailure, matches, newer, parseLatest, parseUpdateLog, pick, psQuote, sha512Of, startWinScript, updateOutcome, winRelayCommand, winUpdateScript }
