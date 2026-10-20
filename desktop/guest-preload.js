/**
 * Chargé dans les sites des onglets perso, dans un monde isolé : le site ne le
 * voit pas et ne peut rien lui demander. Deux tâches :
 *  - les boutons précédent / suivant de la souris, qu'Electron ne gère pas ;
 *  - signaler un clic ou Échap dans le site : la page homedash ne les voit pas,
 *    et ses menus ouverts (clic droit, cloche…) doivent se fermer.
 */
const { ipcRenderer } = require('electron')

window.addEventListener(
  'mouseup',
  (e) => {
    if (e.button !== 3 && e.button !== 4) return
    e.preventDefault()
    ipcRenderer.send('homedash:guest-nav', e.button === 3 ? 'back' : 'forward')
  },
  true,
)

window.addEventListener('pointerdown', () => ipcRenderer.send('homedash:guest-down'), true)
window.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Escape') ipcRenderer.send('homedash:guest-down', 'escape')
  },
  true,
)
