/**
 * Vue scindée (issue #160) : ce que fait chaque touche d'action (suivant, j'aime, enregistrer…) sur X, TikTok
 * et Instagram. Un adaptateur par site, reconnu par son hôte. C'est LE fichier qui casse quand un site change
 * ses pages : rien d'autre ne connaît leurs noms de classes ou de boutons.
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
const dom = (selectors, texts = []) => ({ dom: { selectors, texts } })

const PLANS = {
  x: {
    next: key('j'),
    prev: key('k'),
    like: key('l'),
    save: key('b'),
    share: key('t'),
    comment: key('r'),
    follow: dom(['[data-testid$="-follow"]'], ['suivre', 'follow']),
  },
  tiktok: {
    next: key('Down'),
    prev: key('Up'),
    like: key('l'),
    save: dom(['[data-e2e="bookmark-icon"]', '[data-e2e="undefined-icon"]', '[data-e2e="collect-icon"]'], []),
    share: dom(['[data-e2e="share-icon"]'], []),
    comment: dom(['[data-e2e="comment-icon"]'], []),
    follow: dom(['[data-e2e="feed-follow"]', '[data-e2e="browse-follow"]'], ['suivre', 'follow']),
  },
  instagram: {
    next: { scroll: 1 },
    prev: { scroll: -1 },
    like: dom(['svg[aria-label="J’aime"]', "svg[aria-label=\"J'aime\"]", 'svg[aria-label="Like"]']),
    save: dom(['svg[aria-label="Enregistrer"]', 'svg[aria-label="Save"]']),
    share: dom(['svg[aria-label="Partager"]', 'svg[aria-label="Share"]', 'svg[aria-label="Partager la publication"]']),
    comment: dom(['svg[aria-label="Commenter"]', 'svg[aria-label="Comment"]']),
    follow: dom([], ['suivre', 'follow']),
  },
}

/** Script exécuté dans la page : clique sur l'élément de l'action le plus proche du centre ; renvoie true si trouvé. */
function clickScript({ selectors, texts }) {
  return `(function (sel, texts) {
    var cy = innerHeight / 2, best = null, bd = 1e9, els = [];
    sel.forEach(function (s) { try { document.querySelectorAll(s).forEach(function (e) { els.push(e) }) } catch (e) {} });
    if (texts.length) document.querySelectorAll('button, [role=button], a').forEach(function (e) {
      if (texts.indexOf((e.textContent || '').trim().toLowerCase()) >= 0) els.push(e)
    });
    els.forEach(function (e) {
      var r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) return;
      var d = Math.abs((r.top + r.bottom) / 2 - cy);
      if (d < bd) { bd = d; best = e }
    });
    if (!best) return false;
    (best.closest('button, [role=button], a') || best).click();
    return true;
  })(${JSON.stringify(selectors)}, ${JSON.stringify(texts)})`
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

/** Touche native : appui complet (keyDown, char, keyUp), comme au clavier. */
function sendKey(wc, k) {
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
 * Exécute `op` (next, prev, pageNext, pagePrev, like, save, share, comment, follow) sur la page `wc`.
 * Résout true si c'est fait, false si l'action n'existe pas pour ce site ou que sa cible est introuvable
 * (la page affiche alors « action indisponible »).
 */
async function run(wc, op) {
  const plan = PLANS[siteOf(wc.getURL())]?.[op]
  if (op in NAV) {
    const page = op.startsWith('page')
    // Un flux qui avance carte par carte : pas deux crans en moins d'un quart de seconde (touche maintenue).
    const now = Date.now()
    if (!page && now - (lastNav.get(wc) || 0) < 250) return true
    if (!page) lastNav.set(wc, now)
    if (!page && plan?.key) return sendKey(wc, plan.key), true
    if (!page && plan?.scroll) return !!(await wc.executeJavaScript(scrollScript(plan.scroll)))
    return wheel(wc, NAV[op], page)
  }
  if (!plan) return false
  if (plan.key) return sendKey(wc, plan.key), true
  if (plan.dom) return !!(await wc.executeJavaScript(clickScript(plan.dom)))
  return false
}

module.exports = { siteOf, run, PLANS, clickScript, scrollScript }
