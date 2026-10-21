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
const { app, BrowserWindow, Menu, Notification, clipboard, dialog, nativeImage, session, shell, ipcMain, webContents } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { runUpdate } = require('./updater')

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
  win.on('swipe', (_e, d) => (d === 'left' ? pageNav('back') : d === 'right' ? pageNav('forward') : undefined))
  win.on('app-command', (_e, cmd) =>
    cmd === 'browser-backward' ? pageNav('back') : cmd === 'browser-forward' ? pageNav('forward') : undefined,
  )
  win.on('resize', remember)
  win.on('move', remember)

  // macOS : fermer la fenêtre la cache, l'appli continue (pastilles du Dock à jour).
  let closing = false
  win.on('close', (e) => {
    if (process.platform === 'darwin' && !quitting) {
      e.preventDefault()
      win.hide()
      return
    }
    // Ailleurs, fermer la fenêtre détruit les sites : fermés proprement d'abord.
    if (closing) return
    e.preventDefault()
    closing = true
    void unloadGuests().finally(() => win?.close())
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
    guest.setWindowOpenHandler(({ url: raw, disposition }) => {
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
      if (isWeb(url)) void route(url, guest.id)
      return { action: 'deny' }
    })
    guests.add(guest.id)
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

  void win.loadURL(HOME)
}

const ready = new Set()

/** UA et permissions d'une session d'onglets, une fois par session. */
function setupTabsSession(partition) {
  if (ready.has(partition)) return
  ready.add(partition)
  const s = session.fromPartition(partition)
  // UA honnête par défaut ; celui de Chrome pour les requêtes vers Google
  // (pages, cadres, redirections) — et pour leur navigator.userAgent, plus bas.
  const honest = s.getUserAgent()
  const chrome = chromeUA(honest)
  tabSessions.set(s, { honest, chrome })
  s.webRequest.onBeforeSendHeaders((details, done) => {
    if (needsChrome(details.url)) details.requestHeaders['User-Agent'] = chrome
    done({ requestHeaders: details.requestHeaders })
  })
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
        // ⌘R : toute la page homedash, onglets perso compris (après un
        // redéploiement). PAS le rôle `reload` d'Electron : il recharge ce qui a
        // le focus, donc le site d'un onglet perso dès qu'on a cliqué dedans.
        {
          label: 'Recharger homedash',
          accelerator: 'CmdOrCtrl+R',
          click: () => void reloadHome(),
        },
        // ⇧⌘R : seulement le site ouvert ; la page sait lequel (preload.js).
        {
          label: "Recharger l'onglet ouvert",
          accelerator: 'Shift+CmdOrCtrl+R',
          click: () => win?.webContents.send('homedash:reload-tab'),
        },
        { type: 'separator' },
        { role: 'zoomIn', label: 'Zoom avant' },
        { role: 'zoomOut', label: 'Zoom arrière' },
        { role: 'resetZoom', label: 'Taille réelle' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' },
        { label: 'Adresse de homedash…', click: askUrl },
        // Outils de développement : au clavier seulement (⌥⌘I), pas dans le menu.
        { role: 'toggleDevTools', visible: false },
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
        // Mettre à jour = homedash ET l'appli : elle se reconstruit sur place quand
        // le CHANGELOG le demande, rien à télécharger.
        { label: 'Vérifier les mises à jour…', click: () => void checkUpdates() },
        { label: 'Mettre à jour maintenant…', click: () => void startUpdate(false) },
        { label: 'Forcer la mise à jour…', click: () => void startUpdate(true) },
        { type: 'separator' },
        { label: 'Signaler un problème…', click: () => void openRepo('issues/new') },
        { label: 'Voir les issues', click: () => void openRepo('issues') },
        { label: 'Voir le dépôt sur GitHub', click: () => void openRepo('') },
      ],
    },
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

// Version de l'appli (la page compare avec celle que demande le changelog).
ipcMain.on('homedash:app-version', (e) => {
  e.returnValue = fromHome(e) ? app.getVersion() : ''
})

// ── Mises à jour et actions du menu ─────────────────────────────────────────
/** Version, changelog et dépôt d'après le serveur (`/api/changelog`) ; `check` le fait vérifier GitHub. */
async function changelog(check = false) {
  const r = await fetch(`${HOME}/api/changelog${check ? '/check' : ''}`, {
    cache: 'no-store',
    ...(check ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' } : {}),
  })
  return r.json()
}

/** La page affiche une partie de Réglages (`settings`, `help-news`, `help-guide`). */
function toPage(target) {
  if (!win) return
  win.show()
  win.webContents.send('homedash:menu', target)
}

async function openRepo(sub) {
  let repo = 'davidgennaoui/homedash'
  try {
    repo = (await changelog()).repo || repo
  } catch {
    /* serveur injoignable : le dépôt par défaut */
  }
  void shell.openExternal(`https://github.com/${repo}${sub ? `/${sub}` : ''}`)
}

/** Bouton de la page ou menu : updater.js, qui demande confirmation. */
async function startUpdate(force) {
  let serverDir = ''
  try {
    serverDir = (await changelog()).dir || ''
  } catch {
    /* serveur injoignable : on demandera le dossier */
  }
  win?.show()
  return runUpdate({
    win,
    home: HOME,
    reloadHome,
    serverDir,
    force,
    settings: { read: readSettings, write: writeSettings },
    send: (msg) => win?.webContents.send('homedash:update-log', msg),
  })
}

/** Menu « Vérifier les mises à jour… » : GitHub interrogé tout de suite, réponse en fenêtre. */
async function checkUpdates() {
  let data
  try {
    data = await changelog(true)
  } catch {
    return dialog.showMessageBox(win, { type: 'warning', message: 'homedash ne répond pas', detail: 'Docker Desktop est-il lancé ?' })
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
  if (r.response === 0) void startUpdate(false)
  if (r.response === 1) toPage('help-news')
}

// Bouton « Mettre à jour maintenant » du changelog. La page ne choisit rien
// d'autre que de le demander.
ipcMain.handle('homedash:update', async (e) => (fromHome(e) ? startUpdate(false) : { ok: false, reason: 'refusé' }))

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
    const id = 'com.github.davidgennaoui.homedash'
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
  fetch(`${HOME}/api/perf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'app', ...record }),
  }).catch(() => undefined) // serveur arrêté : la mesure est perdue, rien de grave
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
    const want = needsChrome(details.url) ? ua.chrome : ua.honest
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
      app.quit()
    })
  })
  app.on('activate', () => {
    if (win) win.show()
    else createWindow()
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  // Windows : identité de l'appli pour la barre des tâches et les notifications
  // (sans elle, les notifications des sites ne s'affichent pas).
  if (process.platform === 'win32') app.setAppUserModelId('com.github.davidgennaoui.homedash')
  app.whenReady().then(() => {
    if (process.platform === 'darwin' && !app.isPackaged) {
      const icon = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png'))
      if (!icon.isEmpty()) app.dock.setIcon(icon)
    }
    setupTabsSession(PARTITION)
    setupMenu()
    createWindow()
    postPerf({ kind: 'event', event: 'start', version: app.getVersion(), electron: process.versions.electron })
    win.on('hide', () => postPerf({ kind: 'event', event: 'hide' }))
    win.on('show', () => postPerf({ kind: 'event', event: 'show' }))
    setTimeout(() => perfSample(), 60 * 1000) // une première mesure, le temps que tout charge
    setInterval(() => perfSample(), PERF_EVERY)
    setInterval(watchSpikes, 30 * 1000)
  })
}
