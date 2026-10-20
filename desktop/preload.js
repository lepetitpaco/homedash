/**
 * Pont entre la page homedash et l'appli. Exposé seulement à la page homedash
 * (main.js retire tout preload des webviews) : de quoi savoir qu'on tourne dans
 * l'appli, poser le badge du Dock et ouvrir un lien dans le navigateur par
 * défaut. Rien d'autre : pas de Node, pas de fichier, pas de commande.
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('homedashDesktop', {
  version: process.versions.electron,
  platform: process.platform,
  /** Ce que cette version de l'appli sait faire (absent = appli 1.0.0). */
  features: ['sessions', 'reload-tab', 'links'],
  /** Nombre affiché sur l'icône du Dock (0 = rien). */
  setBadge: (n) => ipcRenderer.send('homedash:badge', n),
  /** Ouvre une adresse http(s) dans le navigateur par défaut. */
  openExternal: (url) => ipcRenderer.send('homedash:open', url),
  /**
   * Action du menu de clic droit d'un site (copier, coller, précédent…) sur sa
   * webview `id`, ou `copyText` pour mettre un texte (un lien) au presse-papiers.
   */
  guestAction: (id, action, extra) => ipcRenderer.send('homedash:guest', { id, action, ...(extra || {}) }),
  /** Clic (`click`) ou Échap (`escape`) dans un site. Renvoie de quoi se désabonner. */
  onGuestDown: (cb) => {
    const handler = (_e, kind) => cb(kind)
    ipcRenderer.on('homedash:guest-down', handler)
    return () => ipcRenderer.removeListener('homedash:guest-down', handler)
  },
  /** ⇧⌘R (menu de l'appli) : recharger l'onglet ouvert. Renvoie de quoi se désabonner. */
  onReloadTab: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('homedash:reload-tab', handler)
    return () => ipcRenderer.removeListener('homedash:reload-tab', handler)
  },
})
