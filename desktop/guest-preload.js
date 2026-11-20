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
let split = { open: false, table: { codes: [], shift: [], alt: [], relay: [] }, field: '', spaceKeep: '', sync: false }
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
// <visibleDialog> : seule une fenêtre VISIBLE retient Échap (un role="dialog" caché, transparent ou hors de l'écran ne compte pas).
const DIALOG = '[aria-modal="true"], [role="dialog"], [role="alertdialog"], dialog[open]'
function visibleDialog(doc, win) {
  for (const el of doc.querySelectorAll(DIALOG)) {
    if (el.getAttribute('aria-hidden') === 'true' || el.hidden) continue
    const st = win.getComputedStyle(el)
    if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) continue
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0 || r.right <= 0 || r.bottom <= 0 || r.left >= win.innerWidth || r.top >= win.innerHeight) continue
    return true
  }
  return false
}
// </visibleDialog>

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
      if (!split.table.relay.includes('escape') || visibleDialog(document, window)) return
      setTimeout(() => !e.defaultPrevented && send(), 0)
      return
    }
    // Touches physiques (`e.code`, #177) : pareil en AZERTY et en QWERTY, sur Mac et sur Windows ; Maj a sa propre liste.
    const t = split.table
    const hit = e.altKey
      ? !e.shiftKey && (t.alt || []).includes(e.code)
      : ((e.shiftKey ? t.shift : t.codes) || []).includes(e.code)
    if (!hit) return
    // Espace garde son sens sur un bouton, un lien, une vidéo (même règle que la page).
    if (e.code === 'Space' && split.spaceKeep && e.target?.closest?.(split.spaceKeep)) return
    e.preventDefault()
    e.stopImmediatePropagation()
    send()
  },
  true,
)

// Survol et clic : la page sait ainsi quel panneau est visé (en Flux, le son et les touches le suivent : dernier geste).
let lastHover = 0
document.addEventListener(
  'mouseover',
  (e) => {
    if (!split.open) return
    // La souris arrive dans le site (de dehors) : `enter`, jamais retardé (main.js oublie alors les échos de molette).
    if (!e.relatedTarget) {
      lastHover = Date.now()
      ipcRenderer.send('homedash:split-hover', 'enter')
      return
    }
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

// Molette d'un panneau : toujours signalée vue ouverte (main.js décide : synchro, Maj qui l'inverse, écho, geste qui
// donne le son). Maj + molette d'une souris devient une molette horizontale (Windows, et macOS pour une souris) :
// `sideways`, la valeur horizontale sert alors de valeur verticale.
window.addEventListener(
  'wheel',
  (e) => {
    if (!split.open || !e.isTrusted) return
    const sideways = e.shiftKey && e.deltaY === 0 && e.deltaX !== 0
    const dy = -(sideways ? e.deltaX : e.deltaY)
    if (dy) ipcRenderer.send('homedash:split-wheel', { dy, shift: e.shiftKey, sideways })
  },
  { capture: true, passive: true },
)
