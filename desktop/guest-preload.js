/**
 * Chargé dans les sites des onglets perso, dans un monde isolé : le site ne le
 * voit pas et ne peut rien lui demander. Deux tâches :
 *  - précédent / suivant (boutons de la souris, ⌘[ ⌘]), qu'Electron ne gère pas ;
 *  - signaler un clic ou Échap dans le site : la page homedash ne les voit pas,
 *    et ses menus ouverts (clic droit, cloche…) doivent se fermer ;
 *  - vue scindée (#160, en bas du fichier) : touches retenues et relayées, survol, molette (IPC
 *    `homedash:split-config`, `-get`, `-key`, `-hover`, `-wheel`). Inactif tant que la vue n'est pas ouverte.
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
// champ de saisie. Échap est relayé sans être retenu, et seulement si le site ne s'en est pas servi.
let split = { open: false, table: { keys: [], alt: [], relay: [] }, field: '', spaceKeep: '', sync: false }
// Touche que homedash va envoyer lui-même à ce site (site-adapters.js) : on la laisse passer une fois.
let pass = { name: '', until: 0 }
ipcRenderer.on('homedash:split-pass', (_e, name) => {
  pass = { name: String(name || ''), until: Date.now() + 500 }
  ipcRenderer.send('homedash:split-pass-ok')
})
ipcRenderer.on('homedash:split-config', (_e, cfg) => {
  if (cfg && typeof cfg === 'object') split = cfg
})
ipcRenderer.invoke('homedash:split-get').then((cfg) => cfg && (split = cfg)).catch(() => undefined)

// Champ de saisie : la liste vient de la page (splitView.ts, une seule source).
const inField = (el) => {
  if (!el) return false
  try {
    return el.isContentEditable === true || (!!split.field && !!el.closest?.(split.field))
  } catch {
    return false
  }
}
const DIALOG = '[aria-modal="true"], [role="dialog"], [role="alertdialog"], dialog[open]'

window.addEventListener(
  'keydown',
  (e) => {
    if (!split.open || e.isComposing || inField(e.target) || inField(document.activeElement)) return
    const send = () => ipcRenderer.send('homedash:split-key', { key: e.key, code: e.code, shift: e.shiftKey, alt: e.altKey })
    if (e.ctrlKey || e.metaKey) return
    if (pass.name && Date.now() < pass.until && e.key.toLowerCase() === pass.name) {
      pass = { name: '', until: 0 }
      return
    }
    if (e.key === 'Escape') {
      // Le site ferme sa fenêtre avec Échap : la vue reste. On attend que ses propres écouteurs aient joué.
      if (!split.table.relay.includes('escape') || document.querySelector(DIALOG)) return
      setTimeout(() => !e.defaultPrevented && send(), 0)
      return
    }
    const hit = e.altKey
      ? !e.shiftKey && split.table.alt.includes(e.code)
      : split.table.keys.includes(e.key.toLowerCase())
    if (!hit) return
    // Espace garde son sens sur un bouton, un lien, une vidéo (même règle que la page).
    if (e.key === ' ' && split.spaceKeep && e.target?.closest?.(split.spaceKeep)) return
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
window.addEventListener('pointerdown', () => split.open && ipcRenderer.send('homedash:split-hover', 'pick'), true)
// La souris quitte le site (vers la barre, une autre partie de homedash, hors de la fenêtre).
document.addEventListener('mouseout', (e) => !e.relatedTarget && split.open && ipcRenderer.send('homedash:split-hover', 'leave'), true)

// Molette d'un panneau, recopiée dans les autres quand « Scroll synchronisé » est coché.
window.addEventListener(
  'wheel',
  (e) => {
    if (split.open && split.sync && e.isTrusted) ipcRenderer.send('homedash:split-wheel', -e.deltaY)
  },
  { capture: true, passive: true },
)
