/**
 * homedash — appli de bureau.
 *
 * Elle embarque tout : le front et le serveur (server.js, dans un
 * utilityProcess). La page garde son adresse http://localhost:7777, servie par
 * l'appli elle-même, sans aucun port ouvert. Mode dev : HOMEDASH_URL (par
 * exemple http://localhost:7778, le Docker de dev) charge une autre adresse et
 * le serveur embarqué ne démarre pas.
 *
 * Ce qu'elle apporte à la page : des <webview> pour les onglets perso. Une page
 * web ne peut montrer un autre site que dans une iframe, que Gmail, Google
 * Chat, GitHub… refusent ; une webview est un affichage du navigateur lui-même,
 * soumis à aucun refus. La page détecte l'appli (`window.homedashDesktop`,
 * posé par preload.js) et choisit seule webview ou iframe.
 */
const { app, BrowserWindow, Menu, Notification, Tray, clipboard, dialog, nativeImage, session, shell, ipcMain, webContents } = require('electron')
const { execFile, execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const server = require('./server')
const { afterStart, runUpdate } = require('./updater')

// Profil à part (tests, seconde instance) : HOMEDASH_PROFILE=/un/dossier. Sans
// lui, ~/Library/Application Support/homedash (Mac), %APPDATA%\homedash (Windows).
if (process.env.HOMEDASH_PROFILE) app.setPath('userData', path.resolve(process.env.HOMEDASH_PROFILE))

// Session commune des webviews : une connexion Google vaut pour Gmail et pour
// Chat, et survit au redémarrage de l'appli. Un onglet peut en demander une à
// part (« Compte » dans Réglages : perso, pro…) : `persist:homedash-tabs-<nom>`.
// Les onglets d'un même compte partagent leur connexion.
const PARTITION = 'persist:homedash-tabs'
/** L'icône de l'appli : embarquée (`icon.png`, assemble.sh), ou celle du dépôt quand on lance les sources. */
const appIcon = () => {
  for (const p of [path.join(__dirname, 'icon.png'), path.join(__dirname, 'build', 'icon.png')]) {
    const icon = nativeImage.createFromPath(p)
    if (!icon.isEmpty()) return icon
  }
  return nativeImage.createEmpty()
}
/** Identifiant de l'appli pour macOS et Windows (notifications, barre des tâches). Ne plus le changer. */
const APP_ID = 'com.lepetitpaco.homedash'
const OWN_PARTITION = /^persist:homedash-tabs-[a-z0-9-]{1,40}$/

function settingsFile() {
  return path.join(app.getPath('userData'), 'desktop.json')
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) || {}
  } catch {
    return {}
  }
}

function writeSettings(patch) {
  const next = { ...readSettings(), ...patch }
  try {
    fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2))
  } catch {
    /* disque plein, droits : la fenêtre reprendra sa taille par défaut */
  }
}

/**
 * Mode dev : HOMEDASH_URL (ou `devUrl` dans desktop.json) charge un homedash
 * servi ailleurs (le Docker de dev). Sinon, celui de l'appli. L'ancien réglage
 * `url` (appli 1.x, qui pointait vers le container) n'est plus lu.
 */
function devUrl() {
  // `dev.json` : posé dans l'appli par `build-local.sh --dev` (l'appli de dev, éclair orange).
  let built = ''
  try {
    built = JSON.parse(fs.readFileSync(path.join(__dirname, 'dev.json'), 'utf8')).devUrl || ''
  } catch {
    /* appli normale */
  }
  const raw = process.env.HOMEDASH_URL || readSettings().devUrl || built
  try {
    return raw ? new URL(raw).origin : ''
  } catch {
    return ''
  }
}

const DEV = devUrl()
/** Dossier du dépôt, posé par `build-local.sh --dev` : le menu Branche n'existe que dans l'appli de dev. */
const REPO_DIR = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'dev.json'), 'utf8')).repoDir || ''
  } catch {
    return ''
  }
})()
const HOME = DEV || server.ORIGIN
// Mode dev : un profil à part (`homedash-dev`), pour tourner à côté de l'appli de tous les jours
// sans partager ses connexions ni son verrou « une seule instance ».
if (DEV && !process.env.HOMEDASH_PROFILE) app.setPath('userData', path.join(app.getPath('appData'), 'homedash-dev'))

/** Appel à l'API de homedash : par messages (appli), ou en http (mode dev). */
async function call(method, p, payload) {
  if (!DEV) return server.api(method, p, payload)
  const r = await fetch(HOME + p, {
    method,
    cache: 'no-store',
    headers: payload === undefined ? {} : { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })
  return { status: r.status, data: await r.json().catch(() => null) }
}
const isHome = (url) => {
  try {
    return new URL(url).origin === HOME
  } catch {
    return false
  }
}
const isWeb = (url) => /^https?:\/\//i.test(url)

/**
 * Lien de redirection d'un site (Google Chat et Gmail passent leurs liens par
 * google.com/url?q=…) → l'adresse finale. Sans ça, un lien X reçu dans Chat
 * passe pour un lien Google et s'ouvre dans l'onglet Chat.
 */
function unwrap(url) {
  try {
    const u = new URL(url)
    const h = u.hostname
    const q =
      (/(^|\.)google\.[a-z.]+$/.test(h) && u.pathname === '/url' && (u.searchParams.get('q') || u.searchParams.get('url'))) ||
      (/^l\.(facebook|instagram)\.com$/.test(h) && u.searchParams.get('u'))
    return q && isWeb(q) ? q : url
  } catch {
    return url
  }
}

/** Pages de connexion : restent dans l'onglet (la session est la sienne). */
const AUTH = /^(accounts\.google\.com|appleid\.apple\.com|login\.microsoftonline\.com|login\.live\.com)$/
const isAuth = (url) => {
  try {
    return AUTH.test(new URL(url).hostname)
  } catch {
    return false
  }
}

/**
 * User-Agent d'un Chrome ordinaire. Google refuse sa page de connexion aux
 * navigateurs embarqués qu'il reconnaît (« Electron/… » dans l'UA) : sans ça,
 * pas de Gmail ni de Chat. C'est ce que font Ferdium, Rambox…
 */
function chromeUA(ua) {
  return ua.replace(/ Electron\/\S+/, '').replace(new RegExp(` ${app.getName()}/\\S+`, 'i'), '')
}

/**
 * Sites qui exigent l'UA de Chrome, les seuls à le recevoir :
 *  · Google (et YouTube, qui se connecte par Google) refuse sa page de
 *    connexion aux navigateurs embarqués ;
 *  · Discord, voyant « Electron », se croit dans sa propre appli de bureau et
 *    range son jeton ailleurs : déconnecté à chaque rechargement.
 * Partout ailleurs l'appli se présente telle qu'elle est : l'UA maquillé ne
 * collait pas au reste du navigateur, et l'anti-robots de Cloudflare
 * (Turnstile) refusait alors tout captcha, même coché à la main.
 */
const CHROME_ONLY = /(^|\.)(google\.[a-z.]+|youtube\.com|gmail\.com|googleusercontent\.com|gstatic\.com|discord\.com|discordapp\.com|discord\.gg)$/i
const needsChrome = (url) => {
  try {
    return CHROME_ONLY.test(new URL(url).hostname)
  } catch {
    return false
  }
}
/**
 * Page de connexion Google : un Firefox, pas un Chrome (issue #20). Pour un
 * compte Gmail perso, Google recoupe l'UA avec les Client Hints (`sec-ch-ua`),
 * où Electron s'annonce « Chromium » sans « Google Chrome » : « ce navigateur
 * n'est peut-être pas sécurisé ». Firefox n'envoie pas ces en-têtes, ils sont
 * retirés. Un compte pro (SSO de l'entreprise) passait déjà. Comme Ferdium.
 */
const GOOGLE_LOGIN = /^accounts\.google\.com$/i
const needsFirefox = (url) => {
  try {
    return GOOGLE_LOGIN.test(new URL(url).hostname)
  } catch {
    return false
  }
}
const FIREFOX_UA =
  process.platform === 'win32'
    ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0'
    : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:145.0) Gecko/20100101 Firefox/145.0'
/** UA d'une adresse : Firefox (connexion Google), Chrome (`CHROME_ONLY`), sinon le vrai. */
const uaFor = (url, ua) => (needsFirefox(url) ? FIREFOX_UA : needsChrome(url) ? ua.chrome : ua.honest)

/** Sessions d'onglets : la page de chaque site y reçoit son UA (`web-contents-created`). */
const tabSessions = new Map()

let win = null
let quitting = false
// Webviews des onglets perso : seules cibles des actions demandées par la page.
const guests = new Set()

/**
 * Demande à la page homedash quoi faire d'un lien venu d'un site : l'ouvrir
 * dans un onglet perso de ce site (renvoie true), sinon le navigateur par
 * défaut. La page décide (elle connaît les onglets) ; une page ancienne sans
 * `__homedashRoute` → navigateur, comme avant.
 */
// `flip` : ⌘clic / Ctrl+clic / ⇧clic, l'inverse du réglage des liens de la page (issue #32).
async function route(url, fromId, flip = false) {
  if (!win) return
  let handled = false
  try {
    handled = await win.webContents.executeJavaScript(
      `window.__homedashRoute ? window.__homedashRoute(${JSON.stringify(url)}, ${Number(fromId)}, ${!!flip}) : false`,
      true,
    )
  } catch {
    handled = false
  }
  if (!handled) void shell.openExternal(url)
}

/**
 * Ctrl+Tab, Ctrl+Maj+Tab : changer de site (issue #102). Écouté sur la fenêtre et
 * sur chaque site, car c'est celui qui a le focus qui reçoit le clavier ; la page
 * dessine la liste. Ctrl relâché ouvre le site choisi, Échap annule.
 */
let switching = false
function watchSiteSwitch(wc) {
  wc.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'Tab' && input.control && !input.meta && !input.alt) {
      // Pas de preventDefault ici : Chromium ignorerait ensuite le relâchement de Ctrl.
      // Ce sont preload.js et guest-preload.js qui empêchent Tab de déplacer le focus.
      switching = true
      win?.webContents.send('homedash:site-switch', input.shift ? 'prev' : 'next')
    } else if (switching && input.type === 'keyDown' && /^[1-9]$/.test(input.key)) {
      switching = false
      win?.webContents.send('homedash:site-switch', Number(input.key) - 1)
    } else if (switching && input.type === 'keyUp' && input.key === 'Control') {
      switching = false
      win?.webContents.send('homedash:site-switch', 'open')
    } else if (switching && input.type === 'keyDown' && input.key === 'Escape') {
      switching = false
      win?.webContents.send('homedash:site-switch', 'cancel')
    }
  })
}

function fallbackPage(reason) {
  const why = reason ? String(reason).replace(/[<>&]/g, '') : ''
  const html = DEV
    ? `<!doctype html><meta charset=utf-8><title>homedash</title>
<body style="font:15px system-ui;background:#0b0d12;color:#e5e7eb;padding:3rem;line-height:1.6">
<h2>Mode dev : homedash ne répond pas sur <code>${HOME}</code></h2>
<p>Le Docker de dev est-il lancé ? Dans le dossier du projet :</p>
<pre style="background:#151922;padding:.8rem 1rem;border-radius:.4rem">docker compose -f docker-compose.dev.yml up -d</pre>
<p style="color:#9ca3af">${why ? why + ' · ' : ''}nouvel essai toutes les 3 s…</p>
<script>setTimeout(() => location.replace(${JSON.stringify(HOME)}), 3000)</script>`
    : `<!doctype html><meta charset=utf-8><title>homedash</title>
<body style="font:15px system-ui;background:#0b0d12;color:#e5e7eb;padding:3rem;line-height:1.6">
<h2>homedash n'a pas pu démarrer</h2>
<p>Le serveur intégré à l'appli s'est arrêté. Tes données ne sont pas touchées.</p>
<p style="color:#9ca3af">${why}</p>
<p>Quitte homedash puis relance-le. Si ça recommence : Aide → Signaler un problème.</p>`
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html)
}

function createWindow() {
  const saved = readSettings().bounds
  win = new BrowserWindow({
    width: 1600,
    height: 1000,
    ...(saved || {}),
    minWidth: 900,
    minHeight: 600,
    title: DEV ? 'homedash (dev)' : 'homedash',
    backgroundColor: '#0b0d12',
    // Windows : la barre de menus n'apparaît qu'avec Alt (comme Slack, Discord).
    autoHideMenuBar: process.platform === 'win32',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: true,
      spellcheck: false,
    },
  })
  win.once('ready-to-show', () => win.show())

  // Taille / position enregistrées une fois le geste fini : `resize` et `move`
  // arrivent par dizaines par seconde pendant qu'on glisse la fenêtre.
  let saveTimer = null
  const remember = () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (win && !win.isDestroyed() && !win.isMinimized() && !win.isFullScreen()) writeSettings({ bounds: win.getBounds() })
    }, 600)
  }
  // Précédent / suivant venus du système : balayage (macOS ; c'est ce qu'envoient
  // Logi Options+ et les souris à gestes) et touches multimédia (Windows).
  watchSiteSwitch(win.webContents)
  // Ctrl relâché dans une autre appli : la fenêtre ne le verrait jamais.
  win.on('blur', () => {
    if (!switching) return
    switching = false
    win?.webContents.send('homedash:site-switch', 'cancel')
  })
  win.on('swipe', (_e, d) => (d === 'left' ? pageNav('back') : d === 'right' ? pageNav('forward') : undefined))
  win.on('app-command', (_e, cmd) =>
    cmd === 'browser-backward' ? pageNav('back') : cmd === 'browser-forward' ? pageNav('forward') : undefined,
  )
  win.on('resize', remember)
  win.on('move', remember)

  // Mac et Windows : fermer la fenêtre la cache, l'appli continue (pastilles,
  // cloche, sondages). Seul « Quitter » l'arrête (Dock, ou icône près de l'horloge).
  let closing = false
  win.on('close', (e) => {
    if ((process.platform === 'darwin' || process.platform === 'win32') && !quitting) {
      e.preventDefault()
      win.hide()
      return
    }
    // Ailleurs, fermer la fenêtre détruit les sites : fermés proprement d'abord.
    // En train de quitter : `before-quit` l'a déjà fait, et empêcher la fermeture
    // ici annulerait la sortie (l'appli restait ouverte, sans fenêtre).
    if (closing || quitting) return
    e.preventDefault()
    closing = true
    void unloadGuests().finally(() => win?.close())
  })
  // Fenêtre détruite : plus de `win` (sinon `activate` appelait show() dessus).
  win.on('closed', () => {
    win = null
  })

  const wc = win.webContents
  // Les liens « nouvel onglet » de homedash (target=_blank, window.open) vont
  // dans le navigateur par défaut, comme depuis l'appli installée via Safari.
  wc.setWindowOpenHandler(({ url }) => {
    if (isWeb(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  // La fenêtre principale n'affiche que homedash.
  wc.on('will-navigate', (e, url) => {
    if (isHome(url) || url.startsWith('data:')) return
    e.preventDefault()
    if (isWeb(url)) void shell.openExternal(url)
  })
  wc.on('did-fail-load', (_e, code, desc, url, isMain) => {
    // -3 = navigation annulée (un rechargement qui en remplace un autre)
    if (isMain && code !== -3 && isHome(url)) void win.loadURL(fallbackPage(desc))
  })

  // Une <webview> ne s'attache qu'à nos conditions : jamais de Node, jamais de
  // preload, toujours la session partagée, et seulement une page web ou un
  // fichier servi par homedash.
  wc.on('will-attach-webview', (e, prefs, params) => {
    // Seul preload admis : le nôtre (boutons précédent / suivant de la souris),
    // en monde isolé, sans rien exposer au site.
    prefs.preload = path.join(__dirname, 'guest-preload.js')
    prefs.nodeIntegration = false
    prefs.nodeIntegrationInSubFrames = false
    prefs.contextIsolation = true
    prefs.sandbox = true
    // La page choisit la session d'un onglet, mais seulement parmi les nôtres.
    params.partition = OWN_PARTITION.test(params.partition || '') ? params.partition : PARTITION
    setupTabsSession(params.partition)
    if (!isWeb(params.src || '')) e.preventDefault()
  })
  wc.on('did-attach-webview', (_e, guest) => {
    guest.setWindowOpenHandler(({ url: raw, disposition, features }) => {
      const url = unwrap(raw)
      // Fenêtre surgissante de connexion Google (window.open, « Se connecter
      // avec Google », Meet…) : dans l'appli, pour garder la session, et la page
      // qui l'a ouverte attend sa réponse.
      if (disposition === 'new-window' && /^https:\/\/accounts\.google\.com\//.test(url)) {
        // même session que l'onglet : la connexion doit atterrir dans SON compte
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 520,
            height: 680,
            autoHideMenuBar: true,
            webPreferences: { session: guest.session, sandbox: true, contextIsolation: true },
          },
        }
      }
      // « Se connecter » ouvert en nouvel onglet (workspace.google.com →
      // accounts.google.com) : dans l'onglet lui-même, sinon la connexion se
      // ferait dans le navigateur et pas dans homedash.
      if (isAuth(url)) {
        void guest.loadURL(url)
        return { action: 'deny' }
      }
      // Un autre site : un onglet perso de ce site s'il y en a un (la page
      // décide), sinon le navigateur par défaut.
      // ⌘clic / Ctrl+clic = onglet en arrière-plan ; ⇧clic = fenêtre sans
      // dimensions (un window.open du site, lui, en donne souvent).
      const flip = disposition === 'background-tab' || (disposition === 'new-window' && !features)
      if (isWeb(url)) void route(url, guest.id, flip)
      return { action: 'deny' }
    })
    guests.add(guest.id)
    watchSiteSwitch(guest)
    guest.once('destroyed', () => guests.delete(guest.id))
    // Un site se met à émettre du son, ou s'arrête : 🔊 sur son onglet.
    guest.on('audio-state-changed', (e) => {
      win?.webContents.send('homedash:audio', { id: guest.id, audible: !!e.audible })
    })
    // Clic droit dans un site : le menu de homedash, dessiné par la page (lien,
    // texte, champ, image). Les actions reviennent par `homedash:guest`.
    guest.on('context-menu', (_ev, p) => {
      const info = {
        id: guest.id,
        x: p.x,
        y: p.y,
        link: isWeb(p.linkURL || '') ? p.linkURL : '',
        image: p.mediaType === 'image' && isWeb(p.srcURL || '') ? p.srcURL : '',
        text: (p.selectionText || '').slice(0, 2000),
        editable: !!p.isEditable,
        canBack: guest.navigationHistory.canGoBack(),
        canForward: guest.navigationHistory.canGoForward(),
      }
      void win?.webContents
        .executeJavaScript(`window.__homedashMenu ? window.__homedashMenu(${JSON.stringify(info)}) : false`, true)
        .catch(() => undefined)
    })
  })

  // Mode dev : l'éclair passe à l'orange (Dock, barre des tâches) pour ne pas confondre les deux appli.
  if (DEV) wc.once('did-finish-load', () => void devIcon())
  void win.loadURL(HOME)
}

/** L'icône en orange, dessinée par la page (le processus principal n'a pas de quoi teinter une image). */
async function devIcon() {
  try {
    const url = await win.webContents.executeJavaScript(`new Promise((ok) => {
      const img = new Image()
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = c.height = 512
        const g = c.getContext('2d'); g.filter = 'hue-rotate(185deg) saturate(1.6)'; g.drawImage(img, 0, 0, 512, 512)
        ok(c.toDataURL('image/png'))
      }
      img.onerror = () => ok('')
      img.src = 'icon-512.png'
    })`)
    if (!url) return
    const icon = nativeImage.createFromDataURL(url)
    if (process.platform === 'darwin') app.dock.setIcon(icon)
    else win?.setIcon(icon)
  } catch {
    /* page pas chargée : l'icône normale reste */
  }
}

const ready = new Set()

/** UA et permissions d'une session d'onglets, une fois par session. */
function setupTabsSession(partition) {
  if (ready.has(partition)) return
  ready.add(partition)
  const s = session.fromPartition(partition)
  // Mes sites peut afficher un fichier du disque (http://localhost:7777/api/file) :
  // c'est la seule adresse de homedash qu'un onglet atteint.
  if (!DEV) server.serve(s, true)
  // UA honnête par défaut ; celui de Chrome pour les requêtes vers Google
  // (pages, cadres, redirections) — et pour leur navigator.userAgent, plus bas.
  const honest = s.getUserAgent()
  const chrome = chromeUA(honest)
  const ua = { honest, chrome }
  tabSessions.set(s, ua)
  s.webRequest.onBeforeSendHeaders((details, done) => {
    const h = details.requestHeaders
    if (needsFirefox(details.url)) {
      for (const k of Object.keys(h)) if (/^sec-ch-ua/i.test(k)) delete h[k]
    }
    if (needsFirefox(details.url) || needsChrome(details.url)) h['User-Agent'] = uaFor(details.url, ua)
    done({ requestHeaders: h })
  })
  // Notifications de Gmail / Chat, presse-papiers, caméra et micro (Meet) : à
  // ces sites choisis par l'utilisateur. macOS demande en plus pour caméra et micro.
  const allowed = new Set(['notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'media'])
  s.setPermissionRequestHandler((_wc, permission, done) => done(allowed.has(permission)))
  s.setPermissionCheckHandler((_wc, permission) => allowed.has(permission))
}

// ── Appli de dev : changer de branche ───────────────────────────────────────
// Le container sert le dossier du dépôt à chaud : changer de branche ici suffit.
const git = (...args) => new Promise((resolve, reject) => {
  execFile('/usr/bin/git', args, { cwd: REPO_DIR }, (err, out, errOut) => (err ? reject(new Error(errOut.trim() || err.message)) : resolve(out.trim())))
})

function branchList() {
  try {
    const current = execFileSync('/usr/bin/git', ['branch', '--show-current'], { cwd: REPO_DIR, encoding: 'utf8' }).trim()
    const refs = execFileSync('/usr/bin/git', ['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes/origin'], { cwd: REPO_DIR, encoding: 'utf8' })
    const names = refs
      .split('\n')
      .filter((r) => r && r !== 'refs/remotes/origin/HEAD')
      .map((r) => r.replace(/^refs\/(heads|remotes\/origin)\//, ''))
    return { current, names: [...new Set(names)].sort((a, b) => a.localeCompare(b)) }
  } catch {
    return { current: '', names: [] }
  }
}

const branchError = (message, detail) => dialog.showMessageBox(win, { type: 'warning', message, detail, buttons: ['OK'] })

/** Attend que le container réponde de nouveau (il refait `npm ci` à son redémarrage). */
async function waitForDev(ms = 180_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, 2000))
    try {
      if ((await fetch(HOME)).ok) return true
    } catch {
      /* pas encore */
    }
  }
  return false
}

async function switchBranch(name) {
  try {
    // Rien de mis de côté automatiquement : un travail en cours reste où il est.
    const dirty = await git('status', '--porcelain', '--untracked-files=no')
    if (dirty) return void branchError('Branche non changée', `Des modifications ne sont pas commitées :\n\n${dirty}\n\nCommite-les d'abord.`)
    const before = await git('rev-parse', 'HEAD')
    await git('switch', name)
    const changed = (await git('diff', '--name-only', before, 'HEAD')).split('\n')
    if (changed.includes('package-lock.json')) {
      // Dépendances différentes : le container les réinstalle en redémarrant.
      await new Promise((resolve, reject) => {
        const env = { ...process.env, PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.PATH || ''}` }
        execFile('docker', ['compose', '-f', 'docker-compose.dev.yml', 'restart'], { cwd: REPO_DIR, env }, (err) => (err ? reject(err) : resolve()))
      })
      if (!(await waitForDev())) throw new Error('Le container de dev ne répond pas après son redémarrage.')
    } else {
      await new Promise((r) => setTimeout(r, 2000)) // le temps que le serveur se relance (`node --watch`)
    }
    await reloadHome()
    if (changed.some((f) => f.startsWith('desktop/')))
      void branchError(`Branche ${name}`, "Cette branche change aussi l'appli elle-même (desktop/) : pour le tester, sh desktop/build-local.sh --dev --install.")
  } catch (e) {
    void branchError('Branche non changée', e.message)
  }
  setupMenu()
}

/** Branches locales disparues de GitHub (fusionnées, donc supprimées là-bas), jamais main, preprod ni la branche en cours. */
async function cleanBranches() {
  try {
    await git('fetch', '--prune', 'origin')
    const { current } = branchList()
    const refs = await git('for-each-ref', '--format=%(refname:short) %(upstream:track)', 'refs/heads')
    const gone = refs
      .split('\n')
      .filter((l) => l.endsWith('[gone]'))
      .map((l) => l.split(' ')[0])
      .filter((n) => !['main', 'preprod', current].includes(n))
    if (!gone.length) return void branchError('Rien à nettoyer', 'Aucune branche locale disparue de GitHub.')
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      message: `Supprimer ${gone.length} branche(s) locale(s) ?`,
      detail: `Elles n'existent plus sur GitHub :\n\n${gone.join('\n')}`,
      buttons: ['Annuler', 'Supprimer'],
      defaultId: 1,
      cancelId: 0,
    })
    if (response === 1) await git('branch', '-D', ...gone)
  } catch (e) {
    void branchError('Nettoyage impossible', e.message)
  }
  setupMenu()
}

async function fetchBranches() {
  try {
    await git('fetch', '--prune', 'origin')
  } catch (e) {
    void branchError('Impossible de joindre GitHub', e.message)
  }
  setupMenu()
}

function branchMenu() {
  const { current, names } = branchList()
  return {
    label: `Branche : ${current || 'détachée'}`,
    submenu: [
      ...names.map((name) => ({
        label: name,
        type: 'radio',
        checked: name === current,
        click: () => {
          if (name !== current) void switchBranch(name)
        },
      })),
      { type: 'separator' },
      { label: 'Récupérer les branches de GitHub', click: () => void fetchBranches() },
      { label: 'Nettoyer les branches fusionnées…', click: () => void cleanBranches() },
      { label: 'Journal du dev', click: () => void shell.openPath(path.join(REPO_DIR, 'CHANGELOG-dev.md')) },
    ],
  }
}

function setupMenu() {
  const askUrl = async () => {
    const choice = await dialog.showMessageBox(win, {
      type: 'info',
      message: 'Mode dev',
      detail: `L'appli affiche ${HOME} au lieu de son homedash intégré.\n\nPour revenir au fonctionnement normal : lance l'appli sans HOMEDASH_URL, et retire "devUrl" de :\n${settingsFile()}`,
      buttons: ['OK', 'Ouvrir le dossier'],
    })
    if (choice.response === 1) shell.showItemInFolder(settingsFile())
  }
  const mac = process.platform === 'darwin'
  const settings = { label: 'Réglages…', accelerator: 'CmdOrCtrl+,', click: () => toPage('settings') }
  // Menus réduits à ce qui sert (issue #7) : les menus standard d'Electron
  // (rôles editMenu, windowMenu…) ajoutent une vingtaine d'entrées inutiles ici.
  const template = [
    mac
      ? {
          label: app.name,
          submenu: [
            { role: 'about', label: 'À propos de homedash' },
            settings,
            { type: 'separator' },
            { role: 'hide', label: 'Masquer homedash' },
            { role: 'quit', label: 'Quitter homedash' },
          ],
        }
      : { label: 'homedash', submenu: [settings, { type: 'separator' }, { role: 'quit', label: 'Quitter' }] },
    // Indispensable sur Mac : sans ces rôles, ⌘C / ⌘V / ⌘Z ne marchent plus nulle part.
    {
      label: 'Édition',
      submenu: [
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Rétablir' },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout sélectionner' },
      ],
    },
    {
      label: 'Présentation',
      submenu: [
        // ⌘R : seulement l'onglet ouvert, comme dans un navigateur (issue #63) :
        // recharger toute la page remonte une douzaine de sites d'un coup. La
        // page sait lequel est ouvert (preload.js) ; un onglet natif relit ses données.
        {
          label: "Recharger l'onglet ouvert",
          accelerator: 'CmdOrCtrl+R',
          click: () => win?.webContents.send('homedash:reload-tab'),
        },
        // ⇧⌘R : toute la page homedash, onglets perso compris (sites fermés
        // proprement d'abord). PAS le rôle `reload` d'Electron : il recharge ce
        // qui a le focus.
        {
          label: 'Recharger tout homedash',
          accelerator: 'Shift+CmdOrCtrl+R',
          click: () => void reloadHome(),
        },
        { type: 'separator' },
        { role: 'zoomIn', label: 'Zoom avant' },
        { role: 'zoomOut', label: 'Zoom arrière' },
        { role: 'resetZoom', label: 'Taille réelle' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' },
        ...(DEV ? [{ label: 'Mode dev…', click: askUrl }] : []),
        // Outils de développement (⌥⌘I, Ctrl+Maj+I) : au clavier seulement, sauf en mode dev où ils sont au menu.
        { role: 'toggleDevTools', label: 'Outils de développement', visible: !!DEV },
      ],
    },
    {
      label: 'Fenêtre',
      submenu: [
        { role: 'minimize', label: 'Réduire' },
        { role: 'close', label: 'Fermer' },
      ],
    },
    {
      role: 'help',
      label: 'Aide',
      submenu: [
        { label: 'Nouveautés', click: () => toPage('help-news') },
        { label: 'Guide', click: () => toPage('help-guide') },
        { type: 'separator' },
        // La nouvelle version vient des Releases GitHub : téléchargée, vérifiée,
        // installée, l'appli se relance (updater.js).
        { label: 'Vérifier les mises à jour…', click: () => void checkUpdates() },
        { type: 'separator' },
        { label: 'Signaler un problème…', click: () => void openRepo('issues/new') },
        { label: 'Voir les issues', click: () => void openRepo('issues') },
        { label: 'Voir le dépôt sur GitHub', click: () => void openRepo('') },
      ],
    },
  ]
  if (REPO_DIR) template.splice(3, 0, branchMenu())
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/**
 * Premier lancement de la 2.0 : pas encore de données. On propose de reprendre
 * celles de l'installation Docker (le dossier `data/` du projet) : COPIE,
 * jamais déplacement, l'original reste intact. Sinon on part de zéro, et un
 * export complet s'importe ensuite dans Réglages → Sauvegardes.
 */
async function firstRun() {
  const dir = server.dataDir()
  if (fs.existsSync(path.join(dir, 'config.json'))) return
  const home = require('node:os').homedir()
  const project = readSettings().projectDir // retenu par l'appli 1.x pour ses mises à jour
  const guesses = [project && path.join(project, 'data'), ...['homedash', 'dev/homedash', 'dev/projects/tools/homedash', 'projects/homedash'].map((d) => path.join(home, d, 'data'))]
  const isData = (d) => !!d && fs.existsSync(path.join(d, 'config.json'))
  let found = guesses.find(isData) || null
  for (;;) {
    const r = await dialog.showMessageBox({
      type: 'question',
      message: 'Bienvenue dans homedash 2.0',
      detail:
        (found
          ? `Une installation Docker de homedash a été trouvée :\n${found}\n\nReprendre ses données (liens, notes, comptes, jetons, sauvegardes) ? Elles sont copiées : l'original n'est pas touché.`
          : "Tu avais homedash avec Docker ? Choisis son dossier « data » pour reprendre tes données (copiées, l'original n'est pas touché).") +
        '\n\nDepuis une autre machine : commence à zéro, puis Réglages → Sauvegardes → importer un export complet.',
      buttons: found ? ['Reprendre ces données', 'Choisir un autre dossier…', 'Commencer à zéro'] : ['Choisir le dossier data…', 'Commencer à zéro'],
      defaultId: 0,
      cancelId: found ? 2 : 1,
    })
    const choice = found ? r.response : r.response === 0 ? 1 : 2
    if (choice === 2) return
    if (choice === 1) {
      const pick = await dialog.showOpenDialog({ title: 'Dossier « data » de homedash', properties: ['openDirectory'], defaultPath: found || home })
      const d = pick.filePaths?.[0]
      if (!d) continue
      const data = isData(d) ? d : isData(path.join(d, 'data')) ? path.join(d, 'data') : null
      if (!data) {
        await dialog.showMessageBox({ type: 'warning', message: "Ce dossier n'est pas un dossier de données homedash", detail: 'Il doit contenir config.json (le dossier « data » du projet homedash).' })
        continue
      }
      found = data
      continue
    }
    try {
      fs.mkdirSync(path.dirname(dir), { recursive: true })
      fs.cpSync(found, dir, { recursive: true, errorOnExist: false, force: false, preserveTimestamps: true })
      // les jetons restent lisibles par toi seul
      for (const n of fs.readdirSync(dir)) if (n.startsWith('secrets')) fs.chmodSync(path.join(dir, n), 0o600)
      return
    } catch (e) {
      await dialog.showMessageBox({ type: 'error', message: 'Copie impossible', detail: `${e.message}\n\nRien n'a été modifié dans ${found}.` })
      found = null
    }
  }
}

/**
 * Windows : icône près de l'horloge. Fermer la fenêtre ne quitte pas (les
 * pastilles et la cloche continuent) ; l'icône la rouvre, son menu quitte.
 */
let tray = null
function setupTray() {
  if (process.platform !== 'win32' || tray) return
  const icon = appIcon()
  tray = new Tray(icon.isEmpty() ? icon : icon.resize({ width: 16, height: 16 }))
  tray.setToolTip('homedash')
  const show = () => {
    if (!win) createWindow()
    else {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  }
  tray.on('click', show)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Ouvrir homedash', click: show },
      { type: 'separator' },
      { label: 'Quitter homedash', click: () => app.quit() },
    ]),
  )
}

// ── Pont avec la page (preload.js) ──────────────────────────────────────────
// Seule la page homedash peut s'en servir : jamais une webview.
const fromHome = (e) => e.sender === win?.webContents && isHome(e.senderFrame?.url || '')

ipcMain.on('homedash:badge', (e, n) => {
  if (!fromHome(e)) return
  const count = Math.max(0, Math.floor(Number(n) || 0))
  if (process.platform === 'darwin') app.dock.setBadge(count ? String(count > 99 ? '99+' : count) : '')
  else if (process.platform === 'win32') void setTaskbarBadge(count)
  else app.setBadgeCount(count)
})

/**
 * Windows n'a pas de badge à nombre : une petite icône par-dessus celle de la
 * barre des tâches (overlay), dessinée par la page (canvas) puisque le
 * processus principal n'a pas de quoi dessiner du texte.
 */
async function setTaskbarBadge(count) {
  if (!win) return
  if (!count) return win.setOverlayIcon(null, '')
  const text = count > 99 ? '99+' : String(count)
  try {
    const url = await win.webContents.executeJavaScript(`(() => {
      const c = document.createElement('canvas'); c.width = c.height = 32
      const g = c.getContext('2d')
      g.fillStyle = '#f23f43'; g.beginPath(); g.arc(16, 16, 16, 0, Math.PI * 2); g.fill()
      g.fillStyle = '#fff'; g.font = 'bold ${text.length > 2 ? 13 : text.length > 1 ? 17 : 20}px sans-serif'
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(${JSON.stringify(text)}, 16, 17)
      return c.toDataURL('image/png')
    })()`)
    win.setOverlayIcon(nativeImage.createFromDataURL(url), `${text} non lu(s)`)
  } catch {
    /* page pas encore chargée : le prochain nombre repassera */
  }
}

/**
 * Précédent / suivant pour la page : le site ouvert s'il a de l'historique,
 * sinon l'onglet d'avant (`window.__homedashNav`, absent d'une page ancienne).
 */
function pageNav(dir, tabsOnly = false) {
  if (dir !== 'back' && dir !== 'forward') return
  void win?.webContents
    .executeJavaScript(`window.__homedashNav ? window.__homedashNav(${JSON.stringify(dir)}, ${tabsOnly}) : false`, true)
    .catch(() => undefined)
}

// Précédent / suivant dans un site (guest-preload.js : souris, ⌘[ ⌘]) : son
// historique d'abord, puis celui des onglets.
ipcMain.on('homedash:guest-nav', (e, dir) => {
  const g = e.sender
  if (!guests.has(g.id)) return
  const h = g.navigationHistory
  if (dir === 'back' && h.canGoBack()) h.goBack()
  else if (dir === 'forward' && h.canGoForward()) h.goForward()
  else pageNav(dir, true)
})

// Clic ou Échap dans un site : la page ferme ses menus ouverts (elle ne les voit pas).
ipcMain.on('homedash:guest-down', (e, key) => {
  if (guests.has(e.sender.id)) win?.webContents.send('homedash:guest-down', key === 'escape' ? 'escape' : 'click')
})

// Actions du menu de clic droit d'un site, sur la webview visée.
const GUEST_ACTIONS = new Set(['copy', 'cut', 'paste', 'selectAll', 'back', 'forward', 'reload', 'copyImage'])
ipcMain.on('homedash:guest', (e, msg) => {
  if (!fromHome(e) || !msg || typeof msg !== 'object') return
  const { id, action, text, x, y } = msg
  if (action === 'copyText') {
    clipboard.writeText(String(text || '').slice(0, 10000))
    return
  }
  if (!guests.has(id) || !GUEST_ACTIONS.has(action)) return
  const g = webContents.fromId(id)
  if (!g || g.isDestroyed()) return
  if (action === 'back') g.navigationHistory.goBack()
  else if (action === 'forward') g.navigationHistory.goForward()
  else if (action === 'reload') g.reload()
  else if (action === 'copyImage') g.copyImageAt(Number(x) || 0, Number(y) || 0)
  else g[action]()
})

/**
 * Effacer les données de navigation d'une session d'onglets (cookies, stockage,
 * cache) : celles d'un site (`host`, et son domaine parent : `mail.google.com`
 * → tout `google.com`), ou toute la session d'un compte. Déconnecte de ce site.
 * Seules les sessions d'onglets sont acceptées, jamais celle de homedash.
 */
ipcMain.handle('homedash:tab-memory', (e) => {
  if (!fromHome(e)) return null
  const metrics = app.getAppMetrics()
  const byPid = new Map(metrics.map((m) => [m.pid, m]))
  const tabs = {}
  for (const id of guests) {
    const g = webContents.fromId(id)
    if (!g || g.isDestroyed()) continue
    const pid = g.getOSProcessId()
    const m = byPid.get(pid)
    if (m) tabs[id] = { mb: Math.round(m.memory.workingSetSize / 1024), pid } // Ko → Mo
  }
  return { total_mb: Math.round(metrics.reduce((s, m) => s + m.memory.workingSetSize / 1024, 0)), tabs }
})

ipcMain.handle('homedash:clear-data', async (e, req) => {
  if (!fromHome(e)) return false
  const partition = String(req?.partition || '')
  if (partition !== PARTITION && !OWN_PARTITION.test(partition)) return false
  const s = session.fromPartition(partition)
  const host = String(req?.host || '').toLowerCase()
  if (!host) {
    await s.clearStorageData()
    await s.clearCache()
    return true
  }
  if (!/^[a-z0-9.-]+$/.test(host)) return false
  const base = host.split('.').slice(-2).join('.')
  const mine = (d) => d.replace(/^\./, '') === base || d.endsWith(`.${base}`)
  for (const c of await s.cookies.get({}))
    if (mine(c.domain)) await s.cookies.remove(`${c.secure ? 'https' : 'http'}://${c.domain.replace(/^\./, '')}${c.path}`, c.name)
  for (const h of new Set([host, base, `www.${base}`])) await s.clearStorageData({ origin: `https://${h}` })
  await s.clearCache()
  return true
})

/**
 * Export complet (#61) : les cookies des sessions d'onglets que la page désigne
 * (jamais celle de homedash), pour les emporter, chiffrés, sur une autre machine.
 */
const tabsPartition = (p) => p === PARTITION || OWN_PARTITION.test(p)
ipcMain.handle('homedash:cookies-export', async (e, partitions) => {
  if (!fromHome(e)) return null
  const out = {}
  for (const p of new Set([PARTITION, ...(Array.isArray(partitions) ? partitions : [])].map(String))) {
    if (!tabsPartition(p)) continue
    const list = await session.fromPartition(p).cookies.get({})
    if (list.length) out[p] = list
  }
  return out
})

/**
 * Import complet : les cookies reviennent dans leurs sessions. Certains sites
 * (Google, Microsoft…) refusent une session venue d'une autre machine et
 * redemandent la connexion : la page le dit avant.
 */
ipcMain.handle('homedash:cookies-import', async (e, jar) => {
  if (!fromHome(e) || !jar || typeof jar !== 'object') return { ok: 0, failed: 0 }
  let ok = 0
  let failed = 0
  for (const [p, list] of Object.entries(jar)) {
    if (!tabsPartition(p) || !Array.isArray(list)) continue
    setupTabsSession(p)
    const s = session.fromPartition(p)
    for (const c of list) {
      try {
        const host = String(c.domain || '').replace(/^\./, '')
        await s.cookies.set({
          url: `${c.secure ? 'https' : 'http'}://${host}${c.path || '/'}`,
          name: c.name,
          value: c.value,
          // Cookie d'hôte : pas de domaine, sinon il deviendrait valable pour les sous-domaines.
          ...(c.hostOnly ? {} : { domain: c.domain }),
          path: c.path,
          secure: !!c.secure,
          httpOnly: !!c.httpOnly,
          ...(c.expirationDate ? { expirationDate: c.expirationDate } : {}),
          ...(c.sameSite && c.sameSite !== 'unspecified' ? { sameSite: c.sameSite } : {}),
        })
        ok++
      } catch {
        failed++
      }
    }
    await s.cookies.flushStore()
  }
  return { ok, failed }
})

// Version de l'appli (la page compare avec celle que demande le changelog).
ipcMain.on('homedash:app-version', (e) => {
  e.returnValue = fromHome(e) ? app.getVersion() : ''
})

// ── Mises à jour et actions du menu ─────────────────────────────────────────
/** Version, changelog et dépôt d'après le serveur (`/api/changelog`) ; `check` le fait vérifier GitHub. */
async function changelog(check = false) {
  return (await (check ? call('POST', '/api/changelog/check', {}) : call('GET', '/api/changelog'))).data || {}
}

/** La page affiche une partie de Réglages (`settings`, `help-news`, `help-guide`). */
function toPage(target) {
  if (!win) return
  win.show()
  win.webContents.send('homedash:menu', target)
}

async function openRepo(sub) {
  let repo = 'lepetitpaco/homedash'
  try {
    repo = (await changelog()).repo || repo
  } catch {
    /* serveur injoignable : le dépôt par défaut */
  }
  void shell.openExternal(`https://github.com/${repo}${sub ? `/${sub}` : ''}`)
}

/** Bouton de la page ou menu : updater.js, qui demande confirmation. */
async function startUpdate() {
  win?.show()
  if (DEV) {
    await dialog.showMessageBox(win, { type: 'info', message: 'Mode dev', detail: "En mode dev, homedash vient du Docker de dev : rien à mettre à jour ici." })
    return { ok: false, reason: 'mode dev' }
  }
  return runUpdate({
    win,
    repo: (await changelog().catch(() => ({}))).repo || 'lepetitpaco/homedash',
    call,
    dataDir: server.dataDir(),
    send: (msg) => win?.webContents.send('homedash:update-log', msg),
    beforeQuit: async () => {
      quitting = true
      await unloadGuests()
    },
  })
}

/** Menu « Vérifier les mises à jour… » : GitHub interrogé tout de suite, réponse en fenêtre. */
async function checkUpdates() {
  let data
  try {
    data = await changelog(true)
  } catch {
    return dialog.showMessageBox(win, { type: 'warning', message: 'homedash ne répond pas', detail: 'Relance homedash, puis réessaie.' })
  }
  if (data.error)
    return dialog.showMessageBox(win, { type: 'warning', message: 'Vérification impossible', detail: data.error })
  if (!data.update)
    return dialog.showMessageBox(win, {
      type: 'info',
      message: `homedash est à jour (${data.current})`,
      detail: `Appli de bureau ${app.getVersion()}.`,
    })
  const r = await dialog.showMessageBox(win, {
    type: 'info',
    message: `homedash ${data.latest} est disponible`,
    detail: `Tu as la ${data.current}.\n\n` + data.incoming.map((e) => `${e.version} : ${e.items.length} nouveauté(s)`).join('\n'),
    buttons: ['Mettre à jour', 'Voir les nouveautés', 'Plus tard'],
    defaultId: 0,
    cancelId: 2,
  })
  if (r.response === 0) void startUpdate()
  if (r.response === 1) toPage('help-news')
}

// Bouton « Mettre à jour maintenant » du changelog. La page ne choisit rien
// d'autre que de le demander.
ipcMain.handle('homedash:update', async (e) => (fromHome(e) ? startUpdate() : { ok: false, reason: 'refusé' }))

/**
 * Connexion à Basecamp en un clic. Launchpad refuse une adresse de retour en
 * localhost : on garde celle de Réglages (`https://<domaine>/oauth`, qui n'a pas
 * besoin d'exister) et l'appli intercepte la redirection avant qu'elle parte
 * sur le réseau. La fenêtre utilise la session des onglets : déjà connecté à
 * Basecamp dans un onglet, il n'y a qu'à cliquer « Autoriser ».
 */
let basecampWindow = null
ipcMain.handle('homedash:basecamp-connect', async (e) => {
  if (!fromHome(e)) return { ok: false, reason: 'refusé' }
  if (basecampWindow) {
    basecampWindow.focus()
    return { ok: false, reason: 'déjà ouverte' }
  }
  const auth = (await call('GET', '/api/basecamp/auth')).data || {}
  const back = String(auth.redirect_uri || '')
  if (!/^https?:\/\//.test(back)) return { ok: false, reason: 'adresse de retour manquante (Réglages → Basecamp)' }
  const start = await call('POST', '/api/basecamp/authorize', {})
  if (start.status !== 200 || !start.data?.url) return { ok: false, reason: start.data?.error || 'appli Basecamp non renseignée' }
  setupTabsSession(PARTITION)
  return new Promise((resolve) => {
    const w = new BrowserWindow({
      width: 560,
      height: 760,
      parent: win || undefined,
      title: 'Connexion à Basecamp',
      autoHideMenuBar: true,
      webPreferences: { session: session.fromPartition(PARTITION), sandbox: true, contextIsolation: true, nodeIntegration: false },
    })
    basecampWindow = w
    let done = false
    const finish = (result) => {
      if (done) return
      done = true
      resolve(result)
      if (!w.isDestroyed()) w.close()
    }
    // La redirection vers l'adresse de retour : on la lit, on ne la suit pas.
    const intercept = (ev, url) => {
      if (!url.startsWith(back.split('?')[0])) return
      ev.preventDefault()
      const err = (() => {
        try {
          return new URL(url).searchParams.get('error')
        } catch {
          return null
        }
      })()
      if (err) return finish({ ok: false, reason: `Basecamp a refusé l'accès (${err})` })
      void call('POST', '/api/basecamp/code', { code: url }).then((r) =>
        finish(r.status === 200 ? { ok: true } : { ok: false, reason: r.data?.error || 'connexion refusée' }),
      )
    }
    w.webContents.on('will-redirect', intercept)
    w.webContents.on('will-navigate', intercept)
    w.webContents.setWindowOpenHandler(({ url }) => {
      if (isWeb(url)) void w.loadURL(url)
      return { action: 'deny' }
    })
    w.on('closed', () => {
      basecampWindow = null
      finish({ ok: false, reason: 'fenêtre fermée' })
    })
    void w.loadURL(start.data.url)
  })
})

ipcMain.on('homedash:open', (e, url) => {
  if (fromHome(e) && isWeb(String(url))) void shell.openExternal(String(url))
})

/**
 * Réglages de notifications du système, sur la page de homedash : c'est là que
 * macOS (« Pastilles de l'app ») ou Windows autorisent le nombre sur l'icône.
 * Sur Mac, une notification d'abord : la première fois, elle déclenche la
 * demande d'autorisation et inscrit homedash dans la liste des réglages, sans
 * quoi la page s'ouvrirait sans lui.
 */
ipcMain.on('homedash:notif-settings', (e) => {
  if (!fromHome(e)) return
  if (process.platform === 'darwin') {
    if (Notification.isSupported())
      new Notification({
        title: 'homedash',
        body: "Active « Pastilles de l'app » pour voir les non-lus sur l'icône du Dock.",
        silent: true,
      }).show()
    const id = APP_ID
    setTimeout(() => void shell.openExternal(`x-apple.systempreferences:com.apple.Notifications-Settings.extension?id=${id}`), 800)
  } else if (process.platform === 'win32') {
    void shell.openExternal('ms-settings:notifications')
  }
})

// ── Journal de performance ─────────────────────────────────────────────────
// Toutes les 5 min : mémoire et CPU de l'appli, de la page homedash et de
// chaque onglet perso, envoyés au serveur qui les écrit dans data/perf/
// (perflog.py). Des noms d'onglets et de domaines, jamais d'adresse complète.
const PERF_EVERY = 5 * 60 * 1000

function postPerf(record) {
  call('POST', '/api/perf', { source: 'app', ...record }).catch(() => undefined) // serveur arrêté : la mesure est perdue, rien de grave
}

async function perfSample(kind = 'sample', extra = {}) {
  if (!win || win.isDestroyed()) return
  const metrics = app.getAppMetrics()
  const byPid = new Map(metrics.map((m) => [m.pid, m]))
  const mb = (m) => (m ? Math.round(m.memory.workingSetSize / 1024) : null) // Ko → Mo
  const cpu = (m) => (m ? Math.round(m.cpu.percentCPUUsage * 10) / 10 : null)
  // Nom et compte de chaque onglet : la page les connaît (webview → onglet).
  let names = {}
  try {
    names = await win.webContents.executeJavaScript('window.__homedashTabs ? window.__homedashTabs() : {}', true)
  } catch {
    names = {}
  }
  const pids = new Map()
  const tabs = []
  for (const id of guests) {
    const g = webContents.fromId(id)
    if (!g || g.isDestroyed()) continue
    const pid = g.getOSProcessId()
    pids.set(pid, (pids.get(pid) || 0) + 1)
    let host = ''
    try {
      host = new URL(g.getURL()).hostname
    } catch {
      host = ''
    }
    const n = names[id] || {}
    tabs.push({ tab: n.label || host, account: n.account || null, host, pid, mb: mb(byPid.get(pid)), cpu: cpu(byPid.get(pid)) })
  }
  // Deux onglets du même site et du même compte peuvent partager un processus.
  for (const t of tabs) if (pids.get(t.pid) > 1) t.shared = true
  const byType = (type) => metrics.filter((m) => m.type === type).reduce((s, m) => s + mb(m), 0)
  postPerf({
    kind,
    ...extra,
    total_mb: metrics.reduce((s, m) => s + mb(m), 0),
    cpu: Math.round(metrics.reduce((s, m) => s + m.cpu.percentCPUUsage, 0) * 10) / 10,
    procs: metrics.length,
    page_mb: mb(byPid.get(win.webContents.getOSProcessId())),
    main_mb: byType('Browser'),
    gpu_mb: byType('GPU'),
    visible: win.isVisible(),
    tabs,
  })
}

// Pics : toutes les 30 s, un relevé léger (sans écriture). CPU au-dessus de
// 80 % ou mémoire en hausse de plus de 400 Mo depuis le relevé précédent : une
// ligne « spike » avec le détail par onglet. Une au plus toutes les 5 min.
let lastTotal = 0
let lastSpike = 0
function watchSpikes() {
  const metrics = app.getAppMetrics()
  const total = metrics.reduce((s, m) => s + m.memory.workingSetSize / 1024, 0)
  const cpu = metrics.reduce((s, m) => s + m.cpu.percentCPUUsage, 0)
  const grew = lastTotal ? total - lastTotal : 0
  lastTotal = total
  if ((cpu < 80 && grew < 400) || Date.now() - lastSpike < 5 * 60 * 1000) return
  lastSpike = Date.now()
  void perfSample('spike', { reason: cpu >= 80 ? 'cpu' : 'memoire', grew_mb: Math.round(grew) })
}

// ── Cycle de vie ────────────────────────────────────────────────────────────
/**
 * Ferme proprement les sites des onglets avant de les détruire (rechargement de
 * homedash, fermeture de l'appli, relance après mise à jour) : leurs
 * `beforeunload` / `unload` s'exécutent. Discord, par exemple, n'écrit son jeton
 * de connexion qu'à ce moment-là ; détruit net, il redemandait la connexion.
 * `ms` : le temps laissé au plus lent.
 */
async function unloadGuests(ms = 1500) {
  const open = [...guests].map((id) => webContents.fromId(id)).filter((w) => w && !w.isDestroyed())
  if (!open.length) return
  await Promise.race([
    Promise.all(open.map((w) => w.loadURL('about:blank').catch(() => undefined))),
    new Promise((r) => setTimeout(r, ms)),
  ])
}

/** Recharger homedash (⌘R, après une mise à jour) : les sites fermés proprement d'abord. */
async function reloadHome() {
  await unloadGuests()
  win?.webContents.reloadIgnoringCache()
}

// Page d'un onglet (webview, ou fenêtre de connexion qu'il ouvre) : son
// navigator.userAgent suit le site affiché, comme les en-têtes ci-dessus.
app.on('web-contents-created', (_e, wc) => {
  wc.on('did-start-navigation', (details) => {
    const ua = tabSessions.get(wc.session)
    if (!ua || !details.isMainFrame || details.isSameDocument) return
    const want = uaFor(details.url, ua)
    if (wc.getUserAgent() !== want) wc.setUserAgent(want)
  })
})

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })
  // Quitter : les sites d'abord fermés proprement (voir unloadGuests), puis on quitte pour de bon.
  let unloaded = false
  app.on('before-quit', (e) => {
    quitting = true
    if (unloaded) return
    e.preventDefault()
    postPerf({ kind: 'event', event: 'quit' })
    void unloadGuests().finally(() => {
      unloaded = true
      server.stop() // le serveur suit l'appli : quitter l'arrête
      app.quit()
    })
  })
  app.on('activate', () => {
    if (win) win.show()
    else createWindow()
  })
  app.on('window-all-closed', () => {
    // Mac et Windows : l'appli reste (Dock, icône près de l'horloge). Ailleurs, elle quitte.
    if (process.platform !== 'darwin' && process.platform !== 'win32') app.quit()
  })
  // Windows : identité de l'appli pour la barre des tâches et les notifications
  // (sans elle, les notifications des sites ne s'affichent pas).
  if (process.platform === 'win32') app.setAppUserModelId(APP_ID)
  app.whenReady().then(async () => {
    if (process.platform === 'darwin' && !app.isPackaged) {
      const icon = appIcon()
      if (!icon.isEmpty()) app.dock.setIcon(icon)
    }
    let failed = ''
    if (!DEV) {
      // La page et son API : http://localhost:7777, servi par l'appli, sans port.
      await firstRun()
      server.serve(session.defaultSession)
      await server.start().catch((e) => (failed = e.message))
      // Un plantage en route : relancé une fois, puis la page se recharge.
      let restarts = 0
      server.onExit(() => {
        if (quitting) return
        if (restarts++ >= 2) return void win?.loadURL(fallbackPage("le serveur s'est arrêté plusieurs fois"))
        setTimeout(() => {
          server
            .start()
            .then(() => win?.webContents.reloadIgnoringCache())
            .catch((e) => win?.loadURL(fallbackPage(e.message)))
        }, 1000)
      })
    }
    setupTabsSession(PARTITION)
    setupMenu()
    // Une branche changée dans le terminal : le menu suit au retour sur l'appli.
    if (REPO_DIR) app.on('browser-window-focus', () => setupMenu())
    setupTray()
    createWindow()
    if (failed) void win.loadURL(fallbackPage(failed))
    if (!DEV) void afterStart(win).catch(() => undefined)
    postPerf({ kind: 'event', event: 'start', version: app.getVersion(), electron: process.versions.electron })
    win.on('hide', () => postPerf({ kind: 'event', event: 'hide' }))
    win.on('show', () => postPerf({ kind: 'event', event: 'show' }))
    setTimeout(() => perfSample(), 60 * 1000) // une première mesure, le temps que tout charge
    setInterval(() => perfSample(), PERF_EVERY)
    setInterval(watchSpikes, 30 * 1000)
  })
}
