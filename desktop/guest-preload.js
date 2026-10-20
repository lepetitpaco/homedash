/**
 * Chargé dans les sites des onglets perso, dans un monde isolé : le site ne le
 * voit pas et ne peut rien lui demander. Une seule tâche : les boutons
 * précédent / suivant de la souris, qu'Electron ne gère pas lui-même.
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
