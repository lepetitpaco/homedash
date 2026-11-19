/**
 * Chargé dans les sites des onglets perso, dans un monde isolé : le site ne le
 * voit pas et ne peut rien lui demander. Deux tâches :
 *  - précédent / suivant (boutons de la souris, ⌘[ ⌘]), qu'Electron ne gère pas ;
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

// Clavier, comme un navigateur : ⌘[ ⌘], et ⌘← ⌘→ hors d'un champ de saisie
// (même règle que navKey() de la page).
window.addEventListener(
  'keydown',
  (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return
    let dir = e.key === '[' ? 'back' : e.key === ']' ? 'forward' : null
    const editing = e.target?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]')
    if (!dir && !editing) dir = e.key === 'ArrowLeft' ? 'back' : e.key === 'ArrowRight' ? 'forward' : null
    if (!dir) return
    e.preventDefault()
    ipcRenderer.send('homedash:guest-nav', dir)
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

// Ctrl+Tab change de site (main.js) : Tab ne doit pas aussi déplacer le focus ici.
window.addEventListener(
  'keydown',
  (e) => {
    if (e.key !== 'Tab' || !e.ctrlKey || e.metaKey || e.altKey) return
    e.preventDefault()
    e.stopImmediatePropagation()
  },
  true,
)

// ── Vue scindée (issue #160) ────────────────────────────────────────────────
// Rien ne se passe tant que la vue n'est pas ouverte, ni en mode Classic (table de touches vide) :
// aucune touche retenue, rien relayé. Sinon : les touches de la table sont retenues (le site ne les voit pas,
// pour ne pas doubler ses propres raccourcis) et relayées à la page, qui décide de l'action. Jamais dans un
// champ de saisie. Échap est relayé sans être retenu.
let split = { open: false, table: { keys: [], alt: [], relay: [] }, sync: false }
ipcRenderer.on('homedash:split-config', (_e, cfg) => {
  if (cfg && typeof cfg === 'object') split = cfg
})
ipcRenderer.invoke('homedash:split-get').then((cfg) => cfg && (split = cfg)).catch(() => undefined)

const EDITING = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]'
const inField = (t) => !!t?.closest?.(EDITING)

window.addEventListener(
  'keydown',
  (e) => {
    if (!split.open || e.isComposing || inField(e.target) || inField(document.activeElement)) return
    const send = () => ipcRenderer.send('homedash:split-key', { key: e.key, code: e.code, shift: e.shiftKey, alt: e.altKey })
    if (e.ctrlKey || e.metaKey) return
    if (e.key === 'Escape') {
      if (split.table.relay.includes('escape')) send()
      return
    }
    const hit = e.altKey
      ? !e.shiftKey && split.table.alt.includes(e.code)
      : split.table.keys.includes(e.key.toLowerCase())
    if (!hit) return
    e.preventDefault()
    e.stopImmediatePropagation()
    send()
  },
  true,
)

// Survol et clic : la page sait ainsi quel panneau est visé (le son et les touches le suivent, selon le réglage).
let lastHover = 0
document.addEventListener(
  'mouseover',
  () => {
    const now = Date.now()
    if (!split.open || now - lastHover < 300) return
    lastHover = now
    ipcRenderer.send('homedash:split-hover')
  },
  true,
)

window.addEventListener(
  'pointerdown',
  () => split.open && ipcRenderer.send('homedash:split-hover', 'pick'),
  true,
)

// Molette d'un panneau, recopiée dans les autres quand « Scroll synchronisé » est coché.
window.addEventListener(
  'wheel',
  (e) => {
    if (split.open && split.sync && e.isTrusted) ipcRenderer.send('homedash:split-wheel', -e.deltaY)
  },
  { capture: true, passive: true },
)
