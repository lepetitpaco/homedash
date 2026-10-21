/**
 * Mise à jour depuis l'appli (bouton du changelog) : ce que la page ne peut
 * pas faire, le container n'ayant ni git ni Docker de la machine.
 *
 *   1. git pull, puis docker compose up -d --build, dans le dossier du projet ;
 *   2. si la coquille de l'appli a changé (desktop/package.json plus récent que
 *      l'appli qui tourne), elle se reconstruit sur place, se ferme, est
 *      remplacée et se relance ; sinon la page est rechargée.
 *
 * La page ne demande qu'« une mise à jour » : les commandes sont fixées ici,
 * et une fenêtre du système demande confirmation à chaque fois. L'avancement
 * remonte à la page (`homedash:update-log`).
 */
const { app, dialog } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const isWin = process.platform === 'win32'
let running = false

/** `1.10.0` > `1.9.3`. */
const newer = (a, b) => {
  const x = String(a).split('.').map(Number)
  const y = String(b).split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0)
  return false
}

const isProject = (dir) =>
  !!dir && fs.existsSync(path.join(dir, 'docker-compose.yml')) && fs.existsSync(path.join(dir, 'desktop', 'package.json'))

/**
 * Une commande dans le shell de l'utilisateur : sur Mac un shell de connexion
 * (une appli lancée du Dock n'a pas son PATH : docker, git de Homebrew…),
 * PowerShell sous Windows. Chaque ligne de sortie part à la page.
 */
function sh(cmd, cwd, log) {
  return new Promise((resolve) => {
    log(`$ ${cmd}`, 'cmd')
    const child = isWin
      ? spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd], { cwd, windowsHide: true })
      : spawn(process.env.SHELL || '/bin/zsh', ['-lc', cmd], { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
    const out = (buf) =>
      String(buf)
        .split(/\r?\n|\r/)
        .filter((l) => l.trim())
        .forEach((l) => log(l))
    child.stdout.on('data', out)
    child.stderr.on('data', out)
    child.on('error', (e) => {
      log(e.message, 'error')
      resolve(1)
    })
    child.on('close', (code) => resolve(code ?? 1))
  })
}

/** Le dossier du projet : celui que donne le serveur, le dernier choisi, ou on le demande. */
async function projectDir(win, serverDir, settings) {
  for (const d of [serverDir, settings.read().projectDir]) if (isProject(d)) return d
  const pick = await dialog.showOpenDialog(win, {
    title: 'Où est le dossier homedash ?',
    message: 'Choisis le dossier du projet homedash (celui qui contient docker-compose.yml).',
    properties: ['openDirectory'],
  })
  const dir = pick.filePaths?.[0]
  if (!isProject(dir)) return null
  settings.write({ projectDir: dir })
  return dir
}

/** Attend que le serveur réponde de nouveau (après docker compose up). */
async function waitServer(home, log) {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(`${home}/api/changelog`, { cache: 'no-store' })
      if (r.ok) return true
    } catch {
      /* container en cours de redémarrage */
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  log('Le serveur ne répond pas après 3 min : vérifie Docker Desktop.', 'error')
  return false
}

/**
 * Remplace l'appli par celle qu'on vient de construire, une fois fermée, et la
 * relance. Le remplacement est fait par un processus détaché : l'appli ne
 * s'écrase pas elle-même pendant qu'elle tourne.
 */
function swapAndRelaunch(dir, version, log) {
  if (isWin) {
    const setup = path.join(dir, 'desktop', 'dist.noindex', `homedash-${version}-win-x64-setup.exe`)
    const exe = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'homedash', 'homedash.exe')
    const ps = `Start-Sleep -Seconds 2; Start-Process -FilePath '${setup}' -ArgumentList '/S' -Wait; Start-Process '${exe}'`
    spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref()
  } else {
    // homedash.app qui tourne : …/homedash.app/Contents/MacOS/homedash
    const bundle = path.resolve(process.execPath, '..', '..', '..')
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
    const built = path.join(dir, 'desktop', 'dist.noindex', `homedash-darwin-${arch}`, 'homedash.app')
    const q = (s) => `'${s.replace(/'/g, `'\\''`)}'`
    const script = `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.5; done; rm -rf ${q(bundle)} && cp -R ${q(built)} ${q(bundle)}; open ${q(bundle)}`
    spawn('/bin/sh', ['-c', script], { detached: true, stdio: 'ignore' }).unref()
  }
  log("L'appli se ferme, se remplace et se relance…", 'done')
  setTimeout(() => app.exit(0), 1200)
}

/**
 * Lance la mise à jour. `serverDir` : dossier du projet d'après le serveur
 * (HOMEDASH_DIR), vide sous Windows le plus souvent.
 */
async function runUpdate({ win, home, serverDir, settings, send }) {
  const log = (line, kind = 'out') => send({ line, kind })
  if (running) return { ok: false, reason: 'déjà en cours' }
  const dir = await projectDir(win, serverDir, settings)
  if (!dir) return { ok: false, reason: 'dossier du projet introuvable' }

  const ok = await dialog.showMessageBox(win, {
    type: 'question',
    message: 'Mettre à jour homedash ?',
    detail:
      `Dans ${dir} :\n• git pull (récupère la nouvelle version)\n• docker compose up -d --build (2 à 3 min)\n\n` +
      "Tes données sont sauvegardées avant. Si l'appli elle-même a changé, elle se reconstruit, se ferme et se relance (quelques minutes de plus).",
    buttons: ['Mettre à jour', 'Annuler'],
    defaultId: 0,
    cancelId: 1,
  })
  if (ok.response !== 0) return { ok: false, reason: 'annulé' }

  running = true
  try {
    log(`Dossier : ${dir}`)
    if ((await sh('git pull --ff-only', dir, log)) !== 0) {
      log("git pull a échoué (modifications locales ? identifiants GitHub ?) : rien n'a été changé.", 'error')
      return { ok: false, reason: 'git pull' }
    }
    if ((await sh('docker compose up -d --build', dir, log)) !== 0) {
      log('Le container ne s’est pas reconstruit : Docker Desktop est-il lancé ?', 'error')
      return { ok: false, reason: 'docker' }
    }
    if (!(await waitServer(home, log))) return { ok: false, reason: 'serveur' }
    log('✓ homedash est à jour.', 'done')

    let shell = ''
    try {
      shell = JSON.parse(fs.readFileSync(path.join(dir, 'desktop', 'package.json'), 'utf8')).version
    } catch {
      /* pas de desktop/ : rien à reconstruire */
    }
    if (!app.isPackaged || !shell || !newer(shell, app.getVersion())) {
      log('Rechargement de la page…', 'done')
      setTimeout(() => win?.webContents.reloadIgnoringCache(), 1500)
      return { ok: true }
    }

    log(`Nouvelle version de l'appli (${app.getVersion()} → ${shell}) : reconstruction…`)
    const build = isWin
      ? `powershell -NoProfile -ExecutionPolicy Bypass -File desktop\\build-windows.ps1`
      : 'sh desktop/build-local.sh'
    if ((await sh(build, dir, log)) !== 0) {
      log("La reconstruction de l'appli a échoué : homedash est à jour, l'appli garde son ancienne version.", 'error')
      setTimeout(() => win?.webContents.reloadIgnoringCache(), 3000)
      return { ok: false, reason: 'build' }
    }
    swapAndRelaunch(dir, shell, log)
    return { ok: true, relaunch: true }
  } finally {
    running = false
  }
}

module.exports = { runUpdate }
