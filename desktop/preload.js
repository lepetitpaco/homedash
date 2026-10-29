/**
 * Pont entre la page homedash et l'appli. Exposé seulement à la page homedash
 * (main.js retire tout preload des webviews) : de quoi savoir qu'on tourne dans
 * l'appli, poser le badge du Dock et ouvrir un lien dans le navigateur par
 * défaut. Rien d'autre : pas de Node, pas de fichier, pas de commande.
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('homedashDesktop', {
  version: process.versions.electron,
  /** Version de l'appli elle-même (desktop/package.json), ≥ 1.4.0. */
  appVersion: ipcRenderer.sendSync('homedash:app-version'),
  platform: process.platform,
  /** Ce que cette version de l'appli sait faire (absent = appli 1.0.0). */
  features: [
    'sessions',
    'reload-tab',
    'links',
    'audio',
    'update',
    'menu',
    'notif-settings',
    'clear-data',
    'link-flip',
    // 2.0 : serveur intégré, mise à jour par les Releases, ⌘R = l'onglet ouvert (#63),
    // connexion Basecamp en un clic, export complet avec les connexions des sites (#61).
    'app-server',
    'release-update',
    'reload-swap',
    'basecamp-connect',
    'full-export',
  ],
  /** Nombre affiché sur l'icône du Dock (0 = rien). */
  setBadge: (n) => ipcRenderer.send('homedash:badge', n),
  /**
   * Met homedash à jour depuis la dernière Release GitHub (téléchargée, vérifiée,
   * données sauvegardées, puis l'appli se remplace et se relance), après
   * confirmation dans une fenêtre du système. Résout { ok, reason?, relaunch? }.
   */
  update: () => ipcRenderer.invoke('homedash:update'),
  /** Connexion à Basecamp dans une fenêtre de l'appli, retour intercepté. Résout { ok, reason? }. */
  basecampConnect: () => ipcRenderer.invoke('homedash:basecamp-connect'),
  /**
   * Cookies des sessions d'onglets, pour l'export complet ({ partition: cookies[] }),
   * et leur réimport. Seulement les sessions des onglets, jamais celle de homedash.
   */
  exportCookies: (partitions) => ipcRenderer.invoke('homedash:cookies-export', partitions),
  importCookies: (data) => ipcRenderer.invoke('homedash:cookies-import', data),
  /** Avancement de la mise à jour ({ line, kind }). Renvoie de quoi se désabonner. */
  onUpdateLog: (cb) => {
    const handler = (_e, msg) => cb(msg)
    ipcRenderer.on('homedash:update-log', handler)
    return () => ipcRenderer.removeListener('homedash:update-log', handler)
  },
  /** Menu de l'appli → une page de homedash (`settings`, `help-news`, `help-guide`). */
  onMenu: (cb) => {
    const handler = (_e, target) => cb(target)
    ipcRenderer.on('homedash:menu', handler)
    return () => ipcRenderer.removeListener('homedash:menu', handler)
  },
  /**
   * Effacer cookies, stockage et cache d'une session d'onglets : d'un site
   * (`host`) ou de tout le compte (sans `host`). Résout true si c'est fait.
   */
  clearData: (partition, host) => ipcRenderer.invoke('homedash:clear-data', { partition, host }),
  /** Réglages de notifications du système, sur la page de homedash (pastille de l'icône). */
  openNotificationSettings: () => ipcRenderer.send('homedash:notif-settings'),
  /** Ouvre une adresse http(s) dans le navigateur par défaut. */
  openExternal: (url) => ipcRenderer.send('homedash:open', url),
  /**
   * Action du menu de clic droit d'un site (copier, coller, précédent…) sur sa
   * webview `id`, ou `copyText` pour mettre un texte (un lien) au presse-papiers.
   */
  guestAction: (id, action, extra) => ipcRenderer.send('homedash:guest', { id, action, ...(extra || {}) }),
  /** Un site émet du son ou s'arrête ({ id, audible }). Renvoie de quoi se désabonner. */
  onAudio: (cb) => {
    const handler = (_e, state) => cb(state)
    ipcRenderer.on('homedash:audio', handler)
    return () => ipcRenderer.removeListener('homedash:audio', handler)
  },
  /** Clic (`click`) ou Échap (`escape`) dans un site. Renvoie de quoi se désabonner. */
  onGuestDown: (cb) => {
    const handler = (_e, kind) => cb(kind)
    ipcRenderer.on('homedash:guest-down', handler)
    return () => ipcRenderer.removeListener('homedash:guest-down', handler)
  },
  /** ⌘R (menu de l'appli ; ⇧⌘R avant la 2.0) : recharger l'onglet ouvert. Renvoie de quoi se désabonner. */
  onReloadTab: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('homedash:reload-tab', handler)
    return () => ipcRenderer.removeListener('homedash:reload-tab', handler)
  },
})
