/**
 * homedash — appli de bureau.
 *
 * Une coquille autour de la page servie par le conteneur : elle n'embarque ni
 * le front ni le backend, elle charge `http://localhost:7777` (ou HOMEDASH_URL).
 * Un `git pull` + redéploiement met donc homedash à jour sans reconstruire
 * l'appli.
 *
 * Ce qu'elle apporte à la page : des <webview> pour les onglets perso. Une page
 * web ne peut montrer un autre site que dans une iframe, que Gmail, Google
 * Chat, GitHub… refusent ; une webview est un affichage du navigateur lui-même,
 * soumis à aucun refus. La page détecte l'appli (`window.homedashDesktop`,
 * posé par preload.js) et choisit seule webview ou iframe.
 */
const { app, BrowserWindow, Menu, clipboard, dialog, nativeImage, session, shell, ipcMain, webContents } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

// Session commune des webviews : une connexion Google vaut pour Gmail et pour
// Chat, et survit au redémarrage de l'appli. Un onglet peut en demander une à
// part (« Compte » dans Réglages : perso, pro…) : `persist:homedash-tabs-<nom>`.
// Les onglets d'un même compte partagent leur connexion.
const PARTITION = 'persist:homedash-tabs'
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

/** Adresse de homedash : variable d'environnement, réglage enregistré, ou le défaut du docker-compose. */
function homeUrl() {
  const raw = process.env.HOMEDASH_URL || readSettings().url || 'http://localhost:7777'
  try {
    return new URL(raw).origin
  } catch {
    return 'http://localhost:7777'
  }
}

const HOME = homeUrl()
const isHome = (url) => {
  try {
    return new URL(url).origin === HOME
  } catch {
    return false
  }
}
const isWeb = (url) => /^https?:\/\//i.test(url)
/** `mail.google.com` → `google.com` : deux sous-domaines d'un même site. */
const siteOf = (url) => {
  try {
    return new URL(url).hostname.split('.').slice(-2).join('.')
  } catch {
    return ''
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
async function route(url, fromId) {
  if (!win) return
  let handled = false
  try {
    handled = await win.webContents.executeJavaScript(
      `window.__homedashRoute ? window.__homedashRoute(${JSON.stringify(url)}, ${Number(fromId)}) : false`,
      true,
    )
  } catch {
    handled = false
  }
  if (!handled) void shell.openExternal(url)
}

function fallbackPage(reason) {
  const html = `<!doctype html><meta charset=utf-8><title>homedash</title>
<body style="font:15px system-ui;background:#0b0d12;color:#e5e7eb;padding:3rem;line-height:1.6">
<h2>homedash ne répond pas sur <code>${HOME}</code></h2>
<p>Le conteneur est-il lancé ? Dans le dossier du projet :</p>
<pre style="background:#151922;padding:.8rem 1rem;border-radius:.4rem">docker compose up -d</pre>
<p style="color:#9ca3af">${reason ? String(reason).replace(/[<>&]/g, '') + ' · ' : ''}nouvel essai toutes les 3 s…</p>
<script>setTimeout(() => location.replace(${JSON.stringify(HOME)}), 3000)</script>`
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
    title: 'homedash',
    backgroundColor: '#0b0d12',
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

  const remember = () => {
    if (!win.isMinimized() && !win.isFullScreen()) writeSettings({ bounds: win.getBounds() })
  }
  win.on('resize', remember)
  win.on('move', remember)

  // macOS : fermer la fenêtre la cache, l'appli continue (pastilles du Dock à jour).
  win.on('close', (e) => {
    if (process.platform === 'darwin' && !quitting) {
      e.preventDefault()
      win.hide()
    }
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
    delete prefs.preload
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
    guest.setWindowOpenHandler(({ url, disposition }) => {
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
      // Lien « nouvel onglet » vers le même site (workspace.google.com →
      // accounts.google.com : « Se connecter ») : dans l'onglet lui-même, sinon
      // la connexion se ferait dans le navigateur et pas dans homedash.
      if (isWeb(url) && siteOf(url) === siteOf(guest.getURL())) {
        void guest.loadURL(url)
        return { action: 'deny' }
      }
      // Un autre site : un onglet perso de ce site s'il y en a un (la page
      // décide), sinon le navigateur par défaut.
      if (isWeb(url)) void route(url, guest.id)
      return { action: 'deny' }
    })
    guests.add(guest.id)
    guest.once('destroyed', () => guests.delete(guest.id))
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

  void win.loadURL(HOME)
}

const ready = new Set()

/** UA et permissions d'une session d'onglets, une fois par session. */
function setupTabsSession(partition) {
  if (ready.has(partition)) return
  ready.add(partition)
  const s = session.fromPartition(partition)
  s.setUserAgent(chromeUA(s.getUserAgent()))
  // Notifications de Gmail / Chat, presse-papiers, caméra et micro (Meet) : à
  // ces sites choisis par l'utilisateur. macOS demande en plus pour caméra et micro.
  const allowed = new Set(['notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'media'])
  s.setPermissionRequestHandler((_wc, permission, done) => done(allowed.has(permission)))
  s.setPermissionCheckHandler((_wc, permission) => allowed.has(permission))
}

function setupMenu() {
  const askUrl = async () => {
    const choice = await dialog.showMessageBox(win, {
      type: 'info',
      message: 'Adresse de homedash',
      detail: `Actuellement : ${HOME}\n\nPour une autre adresse (autre port, seconde instance), lance l'appli avec HOMEDASH_URL=http://localhost:7778, ou écris {"url": "…"} dans :\n${settingsFile()}`,
      buttons: ['OK', 'Ouvrir le dossier'],
    })
    if (choice.response === 1) shell.showItemInFolder(settingsFile())
  }
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' },
    {
      label: 'Présentation',
      submenu: [
        // ⌘R : toute la page homedash, onglets perso compris (après un
        // redéploiement). PAS le rôle `reload` d'Electron : il recharge ce qui a
        // le focus, donc le site d'un onglet perso dès qu'on a cliqué dedans.
        {
          label: 'Recharger homedash',
          accelerator: 'CmdOrCtrl+R',
          click: () => win?.webContents.reloadIgnoringCache(),
        },
        // ⇧⌘R : seulement le site ouvert ; la page sait lequel (preload.js).
        {
          label: "Recharger l'onglet ouvert",
          accelerator: 'Shift+CmdOrCtrl+R',
          click: () => win?.webContents.send('homedash:reload-tab'),
        },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { label: 'Adresse de homedash…', click: askUrl },
      ],
    },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── Pont avec la page (preload.js) ──────────────────────────────────────────
// Seule la page homedash peut s'en servir : jamais une webview.
const fromHome = (e) => e.sender === win?.webContents && isHome(e.senderFrame?.url || '')

ipcMain.on('homedash:badge', (e, n) => {
  if (!fromHome(e)) return
  const count = Math.max(0, Math.floor(Number(n) || 0))
  if (process.platform === 'darwin') app.dock.setBadge(count ? String(count > 99 ? '99+' : count) : '')
  else app.setBadgeCount(count)
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

ipcMain.on('homedash:open', (e, url) => {
  if (fromHome(e) && isWeb(String(url))) void shell.openExternal(String(url))
})

// ── Cycle de vie ────────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })
  app.on('before-quit', () => {
    quitting = true
  })
  app.on('activate', () => {
    if (win) win.show()
    else createWindow()
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.whenReady().then(() => {
    if (process.platform === 'darwin' && !app.isPackaged) {
      const icon = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png'))
      if (!icon.isEmpty()) app.dock.setIcon(icon)
    }
    setupTabsSession(PARTITION)
    setupMenu()
    createWindow()
  })
}
