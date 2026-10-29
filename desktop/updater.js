/**
 * Mise à jour de l'appli depuis les Releases GitHub (2.0 : plus de git ni de Docker).
 *
 *   1. la dernière Release, et dans son `latest-mac.yml` / `latest.yml` le
 *      fichier qui correspond à cette machine, avec son empreinte sha512 ;
 *   2. téléchargement, empreinte vérifiée : un fichier abîmé ou modifié est refusé ;
 *   3. sauvegarde des données (instantané, Réglages → Sauvegardes) ;
 *   4. l'appli se ferme et se remplace : Mac, le .app extrait du .zip ; Windows,
 *      l'installateur en silencieux. Puis elle se relance.
 *
 * Même chemin sur Mac et Windows, sans dépendance. Dépôt privé : le jeton du
 * premier compte GitHub connecté sert au téléchargement (jamais envoyé ailleurs
 * qu'à api.github.com). La page ne demande qu'« une mise à jour » ; une fenêtre
 * du système demande confirmation. L'avancement remonte à la page.
 */
const { app, dialog } = require('electron')
const { spawn } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { Readable } = require('node:stream')
const { pipeline } = require('node:stream/promises')
const { matches, newer, parseLatest, pick } = require('./release')

const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'
let running = false

/** Jeton du premier compte GitHub connecté (dépôt privé), lu dans les données de l'appli. */
function token(dataDir) {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(dataDir, 'secrets.json'), 'utf8'))
    return Object.values(s.github_tokens || {}).find(Boolean) || null
  } catch {
    return null
  }
}

function headers(tok, accept = 'application/vnd.github+json') {
  return { Accept: accept, 'User-Agent': `homedash/${app.getVersion()}`, 'X-GitHub-Api-Version': '2022-11-28', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }
}

async function getJson(url, tok) {
  const r = await fetch(url, { headers: headers(tok), signal: AbortSignal.timeout(15000) })
  if (!r.ok) throw new Error(r.status === 404 ? 'aucune version publiée (ou dépôt privé sans compte GitHub connecté)' : `GitHub répond ${r.status}`)
  return r.json()
}

/** La dernière Release et le fichier de cette machine. */
async function checkRelease(repo, dataDir) {
  const tok = token(dataDir)
  const rel = await getJson(`https://api.github.com/repos/${repo}/releases/latest`, tok)
  const version = String(rel.tag_name || '').replace(/^v/, '')
  const latestName = isMac ? 'latest-mac.yml' : 'latest.yml'
  const yml = (rel.assets || []).find((a) => a.name === latestName)
  if (!yml) return { version, newer: newer(version, app.getVersion()), file: null, reason: `${latestName} absent de la Release` }
  const text = await (await download(yml, tok)).text()
  const want = pick(parseLatest(text))
  const asset = want && (rel.assets || []).find((a) => a.name === want.url)
  return {
    version,
    newer: newer(version, app.getVersion()),
    url: rel.html_url,
    file: asset ? { name: asset.name, size: asset.size, sha512: want.sha512, asset } : null,
    reason: asset ? null : "pas de fichier pour cette machine dans la Release",
  }
}

/** Fichier d'une Release : par l'API (avec jeton, dépôt privé) ou l'adresse publique. */
async function download(asset, tok) {
  const url = tok ? asset.url : asset.browser_download_url
  // L'API répond par une redirection vers le stockage : le jeton ne la suit pas (fetch le retire).
  const r = await fetch(url, { headers: headers(tok, 'application/octet-stream'), redirect: 'follow' })
  if (!r.ok) throw new Error(`téléchargement refusé (${r.status})`)
  return r
}

/** Télécharge dans `dest` et rend l'empreinte sha512 (base64, comme latest*.yml). */
async function fetchTo(asset, tok, dest, log) {
  const r = await download(asset, tok)
  const hash = crypto.createHash('sha512')
  let got = 0
  let last = 0
  const counter = new (require('node:stream').Transform)({
    transform(chunk, _enc, done) {
      hash.update(chunk)
      got += chunk.length
      const pct = asset.size ? Math.floor((got / asset.size) * 100) : 0
      if (pct >= last + 10) {
        last = pct
        log(`… ${pct} %`)
      }
      done(null, chunk)
    },
  })
  await pipeline(Readable.fromWeb(r.body), counter, fs.createWriteStream(dest))
  return hash.digest('base64')
}

function run(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: 'ignore' })
    p.on('error', () => resolve(1))
    p.on('close', (code) => resolve(code ?? 1))
  })
}

/**
 * Remplace l'appli une fois fermée, puis la relance. Un processus détaché s'en
 * charge : l'appli ne s'écrase pas elle-même pendant qu'elle tourne.
 */
function swapAndRelaunch(staged) {
  if (isWin) {
    // NSIS d'electron-builder : /S = silencieux, --force-run = relancer après.
    const q = (s) => s.replace(/'/g, "''")
    const ps = `while (Get-Process -Id ${process.pid} -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 500 }; Start-Process -FilePath '${q(staged)}' -ArgumentList '/S','--updated','--force-run'`
    spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
  } else {
    // homedash.app qui tourne : …/homedash.app/Contents/MacOS/homedash
    const bundle = path.resolve(process.execPath, '..', '..', '..')
    const q = (s) => `'${s.replace(/'/g, `'\\''`)}'`
    const script = `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.5; done; rm -rf ${q(bundle)} && mv ${q(staged)} ${q(bundle)}; open ${q(bundle)}`
    spawn('/bin/sh', ['-c', script], { detached: true, stdio: 'ignore' }).unref()
  }
}

/**
 * Lance la mise à jour : `call` parle au serveur (instantané des données),
 * `beforeQuit` ferme proprement les sites, `send` remonte l'avancement à la page.
 */
async function runUpdate({ win, repo, call, dataDir, send, beforeQuit }) {
  const log = (line, kind = 'out') => send({ line, kind })
  if (running) return { ok: false, reason: 'déjà en cours' }
  if (!app.isPackaged) {
    await dialog.showMessageBox(win, { type: 'info', message: "Appli lancée depuis les sources", detail: 'La mise à jour ne remplace qu\'une appli installée.' })
    return { ok: false, reason: 'non installée' }
  }
  let rel
  try {
    rel = await checkRelease(repo, dataDir)
  } catch (e) {
    log(`Vérification impossible : ${e.message}`, 'error')
    return { ok: false, reason: e.message }
  }
  if (!rel.newer) {
    await dialog.showMessageBox(win, { type: 'info', message: `homedash est à jour (${app.getVersion()})` })
    return { ok: false, reason: 'à jour' }
  }
  if (!rel.file) {
    log(`Version ${rel.version} publiée, mais ${rel.reason}.`, 'error')
    return { ok: false, reason: rel.reason }
  }
  const ok = await dialog.showMessageBox(win, {
    type: 'question',
    message: `Installer homedash ${rel.version} ?`,
    detail:
      `Tu as la ${app.getVersion()}.\n\n• téléchargement depuis GitHub (${Math.round((rel.file.size || 0) / 1e6)} Mo), empreinte vérifiée\n` +
      "• tes données sont sauvegardées avant\n• homedash se ferme, se remplace et se relance (quelques secondes)",
    buttons: ['Installer', 'Plus tard'],
    defaultId: 0,
    cancelId: 1,
  })
  if (ok.response !== 0) return { ok: false, reason: 'annulé' }

  running = true
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'homedash-update-'))
  let handedOver = false
  try {
    const file = path.join(work, rel.file.name)
    log(`Téléchargement de ${rel.file.name}…`, 'cmd')
    const digest = await fetchTo(rel.file.asset, token(dataDir), file, log)
    if (!matches(digest, rel.file.sha512)) {
      log("Empreinte différente de celle publiée : fichier abîmé ou modifié, rien n'a été installé.", 'error')
      return { ok: false, reason: 'empreinte' }
    }
    log('✓ Empreinte vérifiée.')
    const snap = await call('POST', '/api/backups', {})
    if (snap.status !== 200) {
      log("Sauvegarde des données impossible : mise à jour annulée, rien n'a changé.", 'error')
      return { ok: false, reason: 'sauvegarde' }
    }
    log(`✓ Données sauvegardées (${snap.data?.name}).`)
    let staged = file
    if (isMac) {
      // ditto : l'outil de macOS, garde les attributs et la signature du bundle
      const out = path.join(work, 'app')
      if ((await run('/usr/bin/ditto', ['-x', '-k', file, out])) !== 0) {
        log("Le fichier téléchargé ne s'ouvre pas : rien n'a été installé.", 'error')
        return { ok: false, reason: 'zip' }
      }
      staged = path.join(out, 'homedash.app')
      if (!fs.existsSync(staged)) {
        log("homedash.app introuvable dans le fichier : rien n'a été installé.", 'error')
        return { ok: false, reason: 'zip' }
      }
    }
    log("homedash se ferme, se remplace et se relance…", 'done')
    swapAndRelaunch(staged)
    handedOver = true
    await beforeQuit()
    setTimeout(() => app.quit(), 300)
    return { ok: true, relaunch: true }
  } catch (e) {
    log(`Mise à jour interrompue : ${e.message}. Rien n'a changé.`, 'error')
    return { ok: false, reason: e.message }
  } finally {
    running = false
    // Échec : le téléchargement ne sert plus. Réussite : le processus détaché en a besoin.
    if (!handedOver) fs.rmSync(work, { recursive: true, force: true })
  }
}

module.exports = { checkRelease, runUpdate }
