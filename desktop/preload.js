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
  /** Nombre affiché sur l'icône du Dock (0 = rien). */
  setBadge: (n) => ipcRenderer.send('homedash:badge', n),
  /** Ouvre une adresse http(s) dans le navigateur par défaut. */
  openExternal: (url) => ipcRenderer.send('homedash:open', url),
})
