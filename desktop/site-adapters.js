/**
 * Vue scindée (issue #160) : ce que fait chaque touche d'action (suivant, j'aime, enregistrer…) sur X, TikTok
 * et Instagram. Un adaptateur par site, reconnu par son hôte. C'est LE fichier qui casse quand un site change
 * ses pages : rien d'autre ne connaît leurs noms de classes ou de boutons.
 *
 * Une action ne vise que la publication centrée à l'écran (`scope`) : jamais un bouton pris au hasard ailleurs
 * dans la page. « Suivre » n'existe pas ici : sans vérification sur de vraies pages, il pourrait faire suivre un
 * compte suggéré (voir #166).
 *
 * Deux façons d'agir : envoyer au site sa propre touche (`key`), ou cliquer dans la page (`dom`) sur l'élément
 * de l'action le plus proche du centre de l'écran. Attributs stables seulement (`data-testid`, `data-e2e`,
 * `aria-label` en français ET en anglais), jamais des classes générées.
 *
 * Garde-fous : une touche = une action de l'utilisateur, jamais de boucle ni d'action automatique ;
 * « Commenter » ouvre le champ sans rien envoyer ; aucune lecture ni collecte du contenu des pages.
 *
 * ⚠ Sélecteurs écrits d'après les attributs connus, pas encore vérifiés sur de vraies pages connectées.
 */

const HOSTS = [
  ['x', /(^|\.)(x|twitter)\.com$/],
  ['tiktok', /(^|\.)tiktok\.com$/],
  ['instagram', /(^|\.)instagram\.com$/],
]

/** Le site que montre cette adresse (`x`, `tiktok`, `instagram`), ou null. */
function siteOf(url) {
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    return null
  }
  const hit = HOSTS.find(([, re]) => re.test(host))
  return hit ? hit[0] : null
}

const key = (k) => ({ key: k })
// `skip` : ce qui ne compte pas dans la publication (le cœur d'un commentaire n'est pas le « J'aime » du post).
const dom = (scope, selectors, skip = '') => ({ dom: { scope, selectors, skip } })

// Publication visée = celle qui contient le centre de l'écran (ou la plus proche).
const TT = '[data-e2e="recommend-list-item-container"], article'
const IG = 'article'
const IGSKIP = 'ul, li'

const PLANS = {
  x: {
    next: key('j'),
    prev: key('k'),
    like: key('l'),
    save: key('b'),
    share: key('t'),
    comment: key('r'),
  },
  tiktok: {
    next: key('Down'),
    prev: key('Up'),
    like: key('l'),
    save: dom(TT, ['[data-e2e="bookmark-icon"]', '[data-e2e="undefined-icon"]', '[data-e2e="collect-icon"]']),
    share: dom(TT, ['[data-e2e="share-icon"]']),
    comment: dom(TT, ['[data-e2e="comment-icon"]']),
  },
  instagram: {
    next: { scroll: 1 },
    prev: { scroll: -1 },
    like: dom(IG, ['svg[aria-label="J’aime"]', "svg[aria-label=\"J'aime\"]", 'svg[aria-label="Like"]'], IGSKIP),
    save: dom(IG, ['svg[aria-label="Enregistrer"]', 'svg[aria-label="Save"]'], IGSKIP),
    share: dom(IG, ['svg[aria-label="Partager"]', 'svg[aria-label="Share"]', 'svg[aria-label="Partager la publication"]'], IGSKIP),
    comment: dom(IG, ['svg[aria-label="Commenter"]', 'svg[aria-label="Comment"]'], IGSKIP),
  },
}

/**
 * Script exécuté dans la page : clique sur l'élément de l'action DANS la publication centrée (`scope`) ;
 * renvoie true si trouvé, false (rien cliqué) sinon, y compris sans publication à l'écran.
 */
function clickScript({ scope, selectors, skip = '' }) {
  return `(function (scope, sel, skip) {
    var cy = innerHeight / 2, post = null, pd = 1e9;
    document.querySelectorAll(scope).forEach(function (p) {
      var r = p.getBoundingClientRect();
      if (r.height < 2 || r.bottom < 0 || r.top > innerHeight) return;
      var d = r.top <= cy && r.bottom >= cy ? 0 : Math.min(Math.abs(r.top - cy), Math.abs(r.bottom - cy));
      if (d < pd) { pd = d; post = p }
    });
    if (!post) return false;
    var best = null, bd = 1e9;
    sel.forEach(function (s) { try { post.querySelectorAll(s).forEach(function (e) {
      var r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || (skip && e.closest(skip))) return;
      var d = Math.abs((r.top + r.bottom) / 2 - cy);
      if (d < bd) { bd = d; best = e }
    }) } catch (e) {} });
    if (!best) return false;
    (best.closest('button, [role=button], a') || best).click();
    return true;
  })(${JSON.stringify(scope)}, ${JSON.stringify(selectors)}, ${JSON.stringify(skip)})`
}

/** Défilement programmatique d'un cran (Instagram) : le conteneur qui défile sous le centre de l'écran. */
function scrollScript(dir) {
  return `(function (dir) {
    var el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    while (el && el !== document.body) {
      var o = getComputedStyle(el).overflowY;
      if ((o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight + 4) break;
      el = el.parentElement;
    }
    if (!el || el === document.body) el = document.scrollingElement || document.documentElement;
    el.scrollBy({ top: dir * el.clientHeight * 0.9, behavior: 'smooth' });
    return true;
  })(${dir})`
}

/**
 * Pause des vidéos d'un panneau inactif (#168). Chaque <video> en lecture est marquée puis mise en pause ; tant que
 * le panneau reste inactif, une vidéo que le site relance seul est remise en pause (écouteur `play`). La reprise
 * ne relance que les vidéos marquées : une vidéo mise en pause à la main n'est jamais relancée par homedash.
 */
const PAUSE_SCRIPT = `(function () {
  window.__hdHold = true;
  if (!window.__hdHoldOn) {
    window.__hdHoldOn = true;
    document.addEventListener('play', function (e) {
      var v = e.target;
      if (window.__hdHold && v && v.tagName === 'VIDEO') { v.setAttribute('data-hd-paused', '1'); v.pause() }
    }, true);
  }
  document.querySelectorAll('video').forEach(function (v) {
    if (!v.paused && !v.ended) { v.setAttribute('data-hd-paused', '1'); v.pause() }
  });
  return true;
})()`
const RESUME_SCRIPT = `(function () {
  window.__hdHold = false;
  document.querySelectorAll('video[data-hd-paused]').forEach(function (v) {
    v.removeAttribute('data-hd-paused');
    try { var p = v.play(); if (p && p.catch) p.catch(function () {}) } catch (e) {}
  });
  return true;
})()`

/** Le nom que le site verra dans `event.key` pour une touche d'`sendInputEvent` (celui que le préload compare). */
const keyName = (k) => ({ Down: 'arrowdown', Up: 'arrowup' })[k] || k.toLowerCase()

/**
 * Touche native : appui complet (keyDown, char, keyUp), comme au clavier. Le préload du site retient les touches
 * de la vue scindée (J, K, L, flèches…) : sans prévenir, il reprendrait celle-ci et on tournerait en rond. `before`
 * l'annonce (accusé de réception attendu) juste avant l'envoi.
 */
async function sendKey(wc, k, before) {
  if (before) await before(keyName(k))
  wc.sendInputEvent({ type: 'keyDown', keyCode: k })
  if (k.length === 1) wc.sendInputEvent({ type: 'char', keyCode: k })
  wc.sendInputEvent({ type: 'keyUp', keyCode: k })
}

/** Molette au centre de la page : repli de « suivant / précédent » et des pages entières. */
async function wheel(wc, dir, page) {
  let size = [800, 600]
  try {
    size = await wc.executeJavaScript('[innerWidth, innerHeight]')
  } catch {
    /* page en cours de chargement : tailles par défaut */
  }
  // Chromium : un deltaY négatif fait descendre la page.
  const dy = -dir * (page ? Math.round(size[1] * 0.85) : 160)
  wc.sendInputEvent({ type: 'mouseWheel', x: Math.round(size[0] / 2), y: Math.round(size[1] / 2), deltaX: 0, deltaY: dy, canScroll: true })
  return true
}

const NAV = { next: 1, prev: -1, pageNext: 1, pagePrev: -1 }
const lastNav = new WeakMap()

/**
 * Exécute `op` (next, prev, pageNext, pagePrev, like, save, share, comment) sur la page `wc`.
 * Résout true si c'est fait, false si l'action n'existe pas pour ce site ou que sa cible est introuvable
 * (la page affiche alors « action indisponible »).
 */
/** Le focus du site est-il dans un champ de saisie ? (même requête que le focus donné par le survol) */
async function inField(wc, field) {
  if (!field) return false
  try {
    return !!(await wc.executeJavaScript(
      `(() => { const a = document.activeElement; return !!a && (a.isContentEditable === true || !!a.closest(${JSON.stringify(field)})) })()`,
    ))
  } catch {
    return false
  }
}

async function run(wc, op, hooks = {}) {
  // Avec un geste de la personne (2e argument) : sans lui, `play()` peut être refusé par le site.
  if (op === 'pause') return !!(await wc.executeJavaScript(PAUSE_SCRIPT, true))
  if (op === 'resume') return !!(await wc.executeJavaScript(RESUME_SCRIPT, true))
  const plan = PLANS[siteOf(wc.getURL())]?.[op]
  // Une touche native tomberait dans un brouillon en cours : rien n'est envoyé (« indisponible »).
  if (plan?.key && (await inField(wc, hooks.field))) return false
  if (op in NAV) {
    const page = op.startsWith('page')
    // Un flux qui avance carte par carte : pas deux crans en moins d'un quart de seconde (touche maintenue).
    const now = Date.now()
    if (!page && now - (lastNav.get(wc) || 0) < 250) return true
    if (!page) lastNav.set(wc, now)
    if (!page && plan?.key) return await sendKey(wc, plan.key, hooks.before), true
    if (!page && plan?.scroll) return !!(await wc.executeJavaScript(scrollScript(plan.scroll)))
    return wheel(wc, NAV[op], page)
  }
  if (!plan) return false
  if (plan.key) return await sendKey(wc, plan.key, hooks.before), true
  if (plan.dom) return !!(await wc.executeJavaScript(clickScript(plan.dom)))
  return false
}

/**
 * Molette d'un panneau recopiée dans les autres (« Scroll synchronisé »). La recopie est elle-même une molette :
 * son écho est ignoré, et l'anti-écho est posé JUSTE avant l'envoi (après l'attente de la taille de la page, qui est
 * bornée à 100 ms et gardée en cache) : une page lente ne peut pas laisser repartir l'écho.
 */
function createWheelSync(now = Date.now) {
  const echo = new Map()
  const sizes = new Map()
  const sizeOf = async (wc) => {
    const fresh = Promise.race([wc.executeJavaScript('[innerWidth, innerHeight]'), new Promise((r) => setTimeout(() => r(null), 100))])
      .then((v) => (Array.isArray(v) ? (sizes.set(wc.id, v), v) : null))
      .catch(() => null)
    return sizes.get(wc.id) || (await fresh) || [400, 400]
  }
  return async (from, targets, dy) => {
    if (!Number.isFinite(dy) || (echo.get(from) || 0) > now()) return
    for (const wc of targets) {
      if (!wc || wc.id === from || (wc.isDestroyed && wc.isDestroyed())) continue
      const size = await sizeOf(wc)
      echo.set(wc.id, now() + 150)
      wc.sendInputEvent({ type: 'mouseWheel', x: Math.round(size[0] / 2), y: Math.round(size[1] / 2), deltaX: 0, deltaY: Math.max(-2000, Math.min(2000, dy)), canScroll: true })
    }
  }
}

module.exports = { createWheelSync, inField, PAUSE_SCRIPT, RESUME_SCRIPT, siteOf, run, PLANS, clickScript, scrollScript, keyName }
