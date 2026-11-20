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
 * Sélecteurs relus sur de vraies pages connectées (#166, comptes d'éléments, aucun clic) : X (fil), TikTok (Pour toi),
 * Instagram (fil). Ce qui n'est pas vérifié : l'effet réel d'un clic, les pages hors fil (profil, publication seule, Reels).
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
// TikTok (vérifié #166) : la colonne d'actions (j'aime, enregistrer…) est UNE colonne commune posée hors des <article>,
// celle de la vidéo en cours. Elle passe en premier ; les <article> restent le repli d'une ancienne mise en page.
const TT = ['[data-e2e="anchoring-engagement-vertical"]', '[data-e2e="recommend-list-item-container"], article']
const X = 'article[data-testid="tweet"]'
const IG = 'article'
const IGSKIP = 'ul, li'

const PLANS = {
  x: {
    next: key('j'),
    prev: key('k'),
    // Clics dans le tweet centré (et non les touches de X, qui agissent sur SON tweet « focus », pas forcément celui du centre).
    // « Repartager » ouvre le menu Republier / Citer, rien n'est publié ; les formes « déjà fait » défont l'action (comme la touche).
    like: dom(X, ['[data-testid="like"]', '[data-testid="unlike"]']),
    save: dom(X, ['[data-testid="bookmark"]', '[data-testid="removeBookmark"]']),
    share: dom(X, ['[data-testid="retweet"]', '[data-testid="unretweet"]']),
    comment: dom(X, ['[data-testid="reply"]']),
  },
  tiktok: {
    next: key('Down'),
    prev: key('Up'),
    like: key('l'),
    save: dom(TT, ['[data-e2e="favorite-icon"]', '[data-e2e="bookmark-icon"]', '[data-e2e="undefined-icon"]', '[data-e2e="collect-icon"]']),
    share: dom(TT, ['[data-e2e="share-icon"]']),
    comment: dom(TT, ['[data-e2e="comment-icon"]']),
  },
  instagram: {
    next: { scroll: 1 },
    prev: { scroll: -1 },
    like: dom(IG, ['svg[aria-label="J’aime"]', "svg[aria-label=\"J'aime\"]", 'svg[aria-label="Like"]', 'svg[aria-label="Je n’aime plus"]', 'svg[aria-label="Unlike"]'], IGSKIP),
    save: dom(IG, ['svg[aria-label="Enregistrer"]', 'svg[aria-label="Save"]', 'svg[aria-label="Retirer"]', 'svg[aria-label="Remove"]'], IGSKIP),
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
    // scope : un sélecteur, ou une liste essayée dans l'ordre (la première qui montre une publication à l'écran gagne).
    [].concat(scope).some(function (sc) {
      document.querySelectorAll(sc).forEach(function (p) {
        var r = p.getBoundingClientRect();
        if (r.height < 2 || r.bottom < 0 || r.top > innerHeight) return;
        var d = r.top <= cy && r.bottom >= cy ? 0 : Math.min(Math.abs(r.top - cy), Math.abs(r.bottom - cy));
        if (d < pd) { pd = d; post = p }
      });
      return !!post;
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
 * Pause des vidéos et des sons d'un panneau inactif (#168) ou d'un site qu'on ne regarde pas (#175, même mécanisme).
 * Chaque <video> / <audio> en lecture est marqué puis mis en pause ; tant que le site reste caché, un média que le site
 * relance seul est remis en pause (écouteur `play`). La reprise ne relance que les médias marqués : une pause à la main
 * n'est jamais relancée par homedash.
 */
const PAUSE_SCRIPT = `(function () {
  // Jamais un appel : un média à srcObject (flux WebRTC : appel Instagram, Messenger, Meet, Zoom, Teams, Jitsi…) n'est
  // ni coupé ni suivi. Un <audio> (notification) relancé par la page est seulement remis en pause, sans être marqué :
  // sinon un vieux « ding » repartirait au retour sur le site.
  var skip = function (m) { return !!m.srcObject };
  window.__hdHold = true;
  if (!window.__hdHoldOn) {
    window.__hdHoldOn = true;
    document.addEventListener('play', function (e) {
      var v = e.target;
      if (!window.__hdHold || !v || skip(v)) return;
      if (v.tagName === 'VIDEO') { v.setAttribute('data-hd-paused', '1'); v.pause() }
      else if (v.tagName === 'AUDIO') v.pause();
    }, true);
  }
  document.querySelectorAll('video, audio').forEach(function (v) {
    if (!skip(v) && !v.paused && !v.ended) { v.setAttribute('data-hd-paused', '1'); v.pause() }
  });
  return true;
})()`
const RESUME_SCRIPT = `(function () {
  window.__hdHold = false;
  document.querySelectorAll('video[data-hd-paused], audio[data-hd-paused]').forEach(function (v) {
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

/**
 * Molette au centre de la page : repli de « suivant / précédent » et des pages entières. `onWheel` prévient juste avant
 * (main.js la note comme un écho attendu : une touche n'est ni recopiée par la synchro ni prise pour un geste de molette).
 */
async function wheel(wc, dir, page, onWheel) {
  let size = [800, 600]
  try {
    size = await wc.executeJavaScript('[innerWidth, innerHeight]')
  } catch {
    /* page en cours de chargement : tailles par défaut */
  }
  // Chromium : un deltaY négatif fait descendre la page.
  const dy = -dir * (page ? Math.round(size[1] * 0.85) : 160)
  if (onWheel) onWheel(wc)
  wc.sendInputEvent({ type: 'mouseWheel', x: Math.round(size[0] / 2), y: Math.round(size[1] / 2), deltaX: 0, deltaY: dy, canScroll: true })
  return true
}

const NAV = { next: 1, prev: -1, pageNext: 1, pagePrev: -1 }
const lastNav = new WeakMap()

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

/**
 * Exécute `op` (next, prev, pageNext, pagePrev, like, save, share, comment) sur la page `wc`.
 * Résout true si c'est fait ; false si l'action n'existe pas pour ce site ou que sa cible est introuvable (la page
 * affiche « action indisponible ») ; `'busy'` si le focus du site est dans un champ de saisie (un brouillon en cours :
 * rien n'est envoyé).
 */
async function run(wc, op, hooks = {}) {
  // Avec un geste de la personne (2e argument) : sans lui, `play()` peut être refusé par le site.
  if (op === 'pause') return !!(await wc.executeJavaScript(PAUSE_SCRIPT, true))
  if (op === 'resume') return !!(await wc.executeJavaScript(RESUME_SCRIPT, true))
  const plan = PLANS[siteOf(wc.getURL())]?.[op]
  // Une touche native tomberait dans un brouillon en cours : rien n'est envoyé (« indisponible »).
  if (plan?.key && (await inField(wc, hooks.field))) return 'busy'
  if (op in NAV) {
    const page = op.startsWith('page')
    // Un flux qui avance carte par carte : pas deux crans en moins d'un quart de seconde (touche maintenue).
    const now = Date.now()
    if (!page && now - (lastNav.get(wc) || 0) < 250) return true
    if (!page) lastNav.set(wc, now)
    if (!page && plan?.key) return await sendKey(wc, plan.key, hooks.before), true
    if (!page && plan?.scroll) return !!(await wc.executeJavaScript(scrollScript(plan.scroll)))
    return wheel(wc, NAV[op], page, hooks.wheel)
  }
  if (!plan) return false
  if (plan.key) return await sendKey(wc, plan.key, hooks.before), true
  if (plan.dom) return !!(await wc.executeJavaScript(clickScript(plan.dom)))
  return false
}

/**
 * Molette d'un panneau recopiée dans les autres (« Défilement synchronisé »), depuis n'importe quel panneau (#177).
 * Renvoie `true` pour une vraie molette, `false` pour un écho absorbé. `self` : le panneau d'origine reçoit aussi la
 * molette (Maj l'a rendue horizontale chez lui). `forget(id)` : la souris entre dans ce panneau, ses échos en attente
 * sont oubliés (sinon sa vraie molette était prise pour un écho). La recopie est elle-même une molette :
 * chaque envoi attend UN écho, décompté à sa réception (un écho en retard est donc reconnu, quel que soit son retard,
 * jusqu'à 1,5 s ; passé ce délai on cesse de l'attendre). La taille de la page est gardée en cache (rafraîchie 1 fois
 * par seconde au plus, attente bornée à 100 ms) et oubliée quand le site disparaît.
 */
function createWheelSync(now = Date.now) {
  const echoes = new Map() // id → { n: échos attendus, until }
  const sizes = new Map() // id → { size, at }
  const refresh = (wc) =>
    Promise.race([wc.executeJavaScript('[innerWidth, innerHeight]'), new Promise((r) => setTimeout(() => r(null), 100))])
      .then((v) => {
        if (Array.isArray(v)) sizes.set(wc.id, { size: v, at: now() })
        return v
      })
      .catch(() => null)
  const sizeOf = async (wc) => {
    const hit = sizes.get(wc.id)
    if (hit) {
      if (now() - hit.at > 1000) void refresh(wc)
      return hit.size
    }
    return (await refresh(wc)) || [400, 400]
  }
  // `targets` : tous les panneaux de la vue (ce qui n'y est plus est oublié) ; `only` : ceux qui reçoivent (null = tous).
  const forward = async (from, targets, dy, self = false, only = null) => {
    if (!Number.isFinite(dy)) return false
    const mine = echoes.get(from)
    if (mine && mine.until > now() && mine.n > 0) {
      mine.n--
      return false
    }
    const live = new Set(targets.filter((t) => t && !(t.isDestroyed && t.isDestroyed())).map((t) => t.id))
    for (const id of [...sizes.keys()]) if (!live.has(id)) sizes.delete(id)
    for (const id of [...echoes.keys()]) if (!live.has(id)) echoes.delete(id)
    for (const wc of targets) {
      if (!wc || (wc.id === from && !self) || !live.has(wc.id) || (only && !only.includes(wc.id))) continue
      const size = await sizeOf(wc)
      const e = echoes.get(wc.id)
      echoes.set(wc.id, { n: (e && e.until > now() ? e.n : 0) + 1, until: now() + 1500 })
      wc.sendInputEvent({ type: 'mouseWheel', x: Math.round(size[0] / 2), y: Math.round(size[1] / 2), deltaX: 0, deltaY: Math.max(-2000, Math.min(2000, dy)), canScroll: true })
    }
    return true
  }
  // La souris entre dans un panneau : ce qu'on attendait de lui comme écho est oublié (sa molette est alors la vraie).
  forward.forget = (id) => echoes.delete(id)
  // homedash envoie lui-même une molette à ce panneau (touche J, N, Espace…) : elle revient comme un écho, absorbé.
  forward.expect = (id) => {
    const e = echoes.get(id)
    echoes.set(id, { n: (e && e.until > now() ? e.n : 0) + 1, until: now() + 1500 })
  }
  return forward
}

/**
 * Quels panneaux reçoivent la molette venue de `from` (#177) : avec le défilement synchronisé, tous ; Maj inverse le
 * réglage. `msg` : ce que le préload envoie (`{ dy, shift, sideways }`, ou un nombre pour un préload d'avant #177).
 * `sideways` : Maj a rendu la molette horizontale dans le panneau d'origine, il la reçoit donc aussi (`self`).
 * `only` : les panneaux qui la reçoivent (`null` = tous). `null` : message illisible ou molette nulle.
 */
function wheelTargets(sync, msg, from) {
  const m =
    typeof msg === 'number'
      ? { dy: msg, shift: false, sideways: false }
      : msg && typeof msg === 'object'
        ? { dy: Number(msg.dy), shift: !!msg.shift, sideways: !!msg.sideways }
        : null
  if (!m || !Number.isFinite(m.dy) || !m.dy) return null
  const all = !!sync !== m.shift
  return { dy: m.dy, self: m.sideways, only: all ? null : m.sideways ? [from] : [] }
}

module.exports = { wheelTargets, createWheelSync, inField, PAUSE_SCRIPT, RESUME_SCRIPT, siteOf, run, PLANS, clickScript, scrollScript, keyName }
