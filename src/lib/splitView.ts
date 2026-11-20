/**
 * Vue scindée (issue #160) : plusieurs sites côte à côte dans un seul onglet. Toute la logique sans
 * React ni Electron, pour être testée : dispositions, modes Classic / Scroll et leurs cases à cocher,
 * clavier AZERTY / QWERTY, son (qui est muet), traduction touche → action.
 *
 * Les touches sont résolues ici (`resolveKey`) ; `interceptTable` en tire la liste que `guest-preload.js`
 * applique dans les sites, pour ne jamais décider à deux endroits.
 */

// ── modes et cases à cocher ────────────────────────────────────────────────

export type SplitMode = 'classic' | 'scroll' | 'custom'
/** Qui a le son : tous les panneaux, celui sous la souris, ou celui qu'on a choisi au clavier / au clic. */
export type Follow = 'all' | 'hover' | 'keyboard'
export type KeyboardChoice = 'auto' | 'azerty' | 'qwerty'

export type SplitPrefs = {
  mode: SplitMode
  follow: Follow
  /** Raccourcis clavier (Alt+chiffre, J/K, N/P, Z, Échap). Décochés : aucune touche n'est interceptée. */
  keys: boolean
  /** L, B, T, C : actions propres à chaque site (suppose `keys`). Pas de « Suivre » : voir #166. */
  actions: boolean
  /** Table de mixage : une paire de touches par panneau (suppose `keys`). */
  mixer: boolean
  /** Une molette pour tous les panneaux. */
  sync: boolean
  /** Pause : les vidéos des panneaux qui n'ont pas le son (#168). */
  pause: boolean
  /** Garder le son du dernier panneau à la sortie de la souris. */
  keep: boolean
  keyboard: KeyboardChoice
}

/** Les cases qui définissent un mode ; `keep` et `keyboard` n'en font pas partie. */
type ProfileBoxes = Pick<SplitPrefs, 'follow' | 'keys' | 'actions' | 'mixer' | 'sync' | 'pause'>

/** Les deux préréglages : Classic = double écran, rien d'intercepté ; Scroll = multi-scroll de flux. */
export const PROFILES: Record<'classic' | 'scroll', ProfileBoxes> = {
  classic: { follow: 'all', keys: false, actions: false, mixer: false, sync: false, pause: false },
  scroll: { follow: 'hover', keys: true, actions: true, mixer: true, sync: false, pause: true },
}

export const DEFAULT_SPLIT: SplitPrefs = { mode: 'scroll', ...PROFILES.scroll, keep: true, keyboard: 'auto' }

/** Le mode que disent les cases : un des préréglages à l'identique, sinon « Personnalisé ». */
export function detectProfile(p: ProfileBoxes): SplitMode {
  for (const id of ['classic', 'scroll'] as const) {
    const want = PROFILES[id]
    if ((Object.keys(want) as (keyof ProfileBoxes)[]).every((k) => p[k] === want[k])) return id
  }
  return 'custom'
}

/** Dépendances entre cases : actions et mixage supposent les raccourcis ; sans eux, ni l'un ni l'autre. */
function settle(p: SplitPrefs, touched?: Partial<SplitPrefs>): SplitPrefs {
  const next = { ...p }
  if (touched && (touched.actions === true || touched.mixer === true)) next.keys = true
  if (!next.keys) {
    next.actions = false
    next.mixer = false
  }
  next.mode = detectProfile(next)
  return next
}

/** Modifier des cases à la main : les dépendances jouent, et le mode se déduit (Personnalisé si ça ne colle plus). */
export function patchPrefs(p: SplitPrefs, patch: Partial<Omit<SplitPrefs, 'mode'>>): SplitPrefs {
  return settle({ ...p, ...patch }, patch)
}

/** Recliquer un mode restaure son préréglage (les cases `keep` et `keyboard` restent). */
export function applyProfile(p: SplitPrefs, id: 'classic' | 'scroll'): SplitPrefs {
  return settle({ ...p, ...PROFILES[id] })
}

/** Réglages lus dans `ui.split` : une clé absente ou absurde prend son défaut (config ancienne ou abîmée). */
export function normalizeSplit(raw: unknown): SplitPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const bool = (k: string, d: boolean) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : d)
  const follow: Follow = r.follow === 'all' || r.follow === 'hover' || r.follow === 'keyboard' ? r.follow : DEFAULT_SPLIT.follow
  const keyboard: KeyboardChoice =
    r.keyboard === 'azerty' || r.keyboard === 'qwerty' || r.keyboard === 'auto' ? r.keyboard : DEFAULT_SPLIT.keyboard
  // Sans aucune case enregistrée, le mode seul peut avoir été noté : il donne les cases de départ.
  const base =
    r.mode === 'classic' || r.mode === 'scroll'
      ? { ...DEFAULT_SPLIT, ...PROFILES[r.mode] }
      : DEFAULT_SPLIT
  return settle({
    mode: base.mode,
    follow: 'follow' in r ? follow : base.follow,
    keys: bool('keys', base.keys),
    actions: bool('actions', base.actions),
    mixer: bool('mixer', base.mixer),
    sync: bool('sync', base.sync),
    pause: bool('pause', base.pause),
    keep: bool('keep', base.keep),
    keyboard,
  })
}

// ── libellés partagés (barre de la vue et Réglages) ───────────────────────

export const MODE_LABELS: { id: SplitMode; label: string; hint: string }[] = [
  { id: 'classic', label: 'Messagerie', hint: 'Suivre Instagram, Discord… : tous les sons, jamais de pause, aucune touche interceptée' },
  { id: 'scroll', label: 'Flux', hint: 'Défiler TikTok, X, Instagram : le son suit la souris, pause des vidéos, raccourcis et table de mixage' },
  { id: 'custom', label: 'Personnalisé', hint: 'Tes cases à cocher ne correspondent à aucun mode' },
]

export const FOLLOW_OPTIONS: { value: Follow; label: string }[] = [
  { value: 'all', label: 'Tous les sons' },
  { value: 'hover', label: 'Le son suit la souris' },
  { value: 'keyboard', label: 'Le son suit le clavier' },
]

export const KEYBOARD_OPTIONS: { value: KeyboardChoice; label: string }[] = [
  { value: 'auto', label: 'Clavier : automatique' },
  { value: 'azerty', label: 'Clavier : AZERTY' },
  { value: 'qwerty', label: 'Clavier : QWERTY' },
]

/** Les cases à cocher, avec leur aide : la même dans la barre de la vue et dans Réglages. */
export const FLAG_HELP: { key: 'keys' | 'actions' | 'mixer' | 'sync' | 'pause' | 'keep'; label: string; hint: string }[] = [
  { key: 'keys', label: 'Raccourcis clavier', hint: 'Alt + chiffre, J K ou ↓ ↑, N P, Espace, Z (X avec la table de mixage), Échap' },
  { key: 'actions', label: 'Actions par site', hint: "L j'aime, B enregistrer, T repartager, C commenter (X, TikTok, Instagram) ; coche aussi les raccourcis" },
  { key: 'mixer', label: 'Table de mixage', hint: 'une paire de touches par panneau pour le défiler d’une main (A Q, Z S, E D, R F en AZERTY) ; agrandir passe de Z à X ; coche aussi les raccourcis' },
  { key: 'sync', label: 'Défilement synchronisé', hint: 'une molette pour tous les panneaux' },
  { key: 'pause', label: 'Pause : les panneaux inactifs', hint: 'les vidéos du panneau qui n\'a pas le son sont mises en pause, et reprennent quand il le retrouve' },
  { key: 'keep', label: 'Garder le son à la sortie', hint: 'le dernier panneau garde le son quand la souris sort de la grille' },
]

/** Un champ de saisie : les touches ne sont jamais prises dedans (page, sites et focus du survol). */
export const FIELD_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]'
/** Espace garde son sens natif sur un bouton, un lien ou une vidéo (page et sites : la même règle). */
export const SPACE_KEEPS = 'button, a, [role="button"], video, summary'
/** Un champ de saisie, ou un contenteditable. */
export function isEditing(el: { closest?: (s: string) => unknown; isContentEditable?: boolean } | null | undefined): boolean {
  return !!el && (!!el.closest?.(FIELD_SELECTOR) || el.isContentEditable === true)
}

// ── dispositions ───────────────────────────────────────────────────────────

/** Une disposition est un arbre : une feuille = un panneau, un nœud = un découpage en lignes ou en colonnes. */
export type SplitNode = { dir: 'row' | 'col'; ratios: number[]; children: SplitNode[] } | 'pane'

export type SplitLayout = { id: string; label: string; n: number; tree: SplitNode }

const row = (...children: SplitNode[]): SplitNode => ({ dir: 'row', ratios: children.map(() => 1), children })
const col = (...children: SplitNode[]): SplitNode => ({ dir: 'col', ratios: children.map(() => 1), children })

export const LAYOUTS: SplitLayout[] = [
  { id: 'c2', label: '2 colonnes', n: 2, tree: row('pane', 'pane') },
  { id: 'r2', label: '2 lignes', n: 2, tree: col('pane', 'pane') },
  { id: 'c3', label: '3 colonnes', n: 3, tree: row('pane', 'pane', 'pane') },
  {
    id: 't3',
    label: '1 grand et 2 petits',
    n: 3,
    tree: { dir: 'row', ratios: [2, 1], children: ['pane', col('pane', 'pane')] },
  },
  { id: 'g4', label: '2 par 2', n: 4, tree: col(row('pane', 'pane'), row('pane', 'pane')) },
  { id: 'c4', label: '4 colonnes', n: 4, tree: row('pane', 'pane', 'pane', 'pane') },
]

export const DEFAULT_SPLIT_LAYOUT = 'c2'

export const layoutOf = (id: string): SplitLayout => LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0]

/** Le plus de panneaux qu'une disposition en compte. */
const MAX_PANES = 4

/**
 * Chaque case reçoit un site : ceux déjà choisis restent, les cases vides prennent les candidats dans
 * l'ordre (les plus récents d'abord), sans doublon. Les cases en trop sont vidées ; sans candidat, vide.
 */
export function assignSites(current: (string | null)[], n: number, candidates: string[]): (string | null)[] {
  const out: (string | null)[] = Array.from({ length: MAX_PANES }, (_, i) => (i < n ? (current[i] ?? null) : null))
  const used = new Set(out.filter((k): k is string => !!k))
  const free = candidates.filter((k) => !used.has(k))
  for (let i = 0; i < n; i++) if (!out[i]) out[i] = free.shift() ?? null
  return out
}

/**
 * Déplacer un séparateur : `index` est le séparateur entre les enfants `index` et `index + 1`, `delta` la
 * part de la longueur du nœud dont on le tire. Les deux voisins gardent au moins `min` (part de la longueur).
 */
export function dragRatios(ratios: number[], index: number, delta: number, min = 0.12): number[] {
  const total = ratios.reduce((s, r) => s + r, 0)
  const a = ratios[index]
  const b = ratios[index + 1]
  if (a === undefined || b === undefined || total <= 0) return ratios
  const lo = min * total
  const pair = a + b
  if (pair < 2 * lo) return ratios
  const na = Math.min(pair - lo, Math.max(lo, a + delta * total))
  const out = [...ratios]
  out[index] = na
  out[index + 1] = pair - na
  return out
}

// ── son ────────────────────────────────────────────────────────────────────

/** Qui a le son et les touches : le panneau actif, et celui qui joue (`null` = aucun). */
export type Focus = { active: number; sound: number | null }

/** La souris entre dans un panneau : il devient actif et a le son, si le son suit la souris. */
export function focusOnHover(f: Focus, pane: number, follow: Follow): Focus {
  return follow === 'hover' ? { active: pane, sound: pane } : f
}

/** Clic ou touche (Alt+chiffre) : le panneau devient actif ; il a le son sauf si tous l'ont déjà. */
export function focusOnPick(f: Focus, pane: number, follow: Follow): Focus {
  return { active: pane, sound: follow === 'all' ? f.sound : pane }
}

/** La souris quitte la grille : le son reste au dernier panneau (`keep`) ou se coupe. */
export function focusOnLeave(f: Focus, follow: Follow, keep: boolean): Focus {
  return follow === 'hover' && !keep ? { ...f, sound: null } : f
}

/**
 * Le son d'un site : coupé s'il l'a été à la main (clic droit, toujours prioritaire) ; sinon, dans la vue
 * scindée et hors « tous les sons », coupé tant qu'il n'a pas le son. `sound` = clé du site qui joue.
 * Un site qui n'est pas dans la grille n'est pas touché.
 */
export function effectiveMuted(
  key: string,
  manual: boolean,
  split: { open: boolean; follow: Follow; shown: string[]; sound: string | null },
): boolean {
  if (manual) return true
  if (!split.open || split.follow === 'all' || !split.shown.includes(key)) return false
  return split.sound !== key
}

/**
 * Pause des vidéos (#168) : un site de la grille est en pause tant qu'il n'a pas le son (même panneau que
 * le son, donc « garder » vaut aussi pour l'image). Jamais en « tous les sons » (Classic), ni hors de la grille.
 */
export function effectivePaused(
  key: string,
  prefs: Pick<SplitPrefs, 'pause' | 'follow'>,
  shown: string[],
  sound: string | null,
): boolean {
  return prefs.pause && prefs.follow !== 'all' && shown.includes(key) && sound !== key
}

/**
 * À la fermeture de la vue, que deviennent les vidéos mises en pause ? `true` : seul le site qui reste affiché
 * reprend ; les sites garés restent en pause (et sans son) jusqu'à ce qu'on les affiche. `false` : tout reprend,
 * y compris hors écran. Décision provisoire en attendant Paco (#168) : une seule ligne à changer.
 */
export const CLOSE_KEEPS_PARKED_PAUSED = true

/**
 * Une couche flottante (menu, liste de choix, fenêtre) : tout ce qui porte ces rôles. Échap est à elle, pas à la vue.
 * Règle : une nouvelle couche porte `role="dialog"`, `role="menu"` ou `role="listbox"` (le conseil du Dock, un toast,
 * n'en est pas une).
 */
export const LAYER_SELECTOR = '[role="dialog"]:not(.dock-hint), [role="menu"], [role="listbox"]'

/**
 * La pause voulue d'un site, d'après l'état de la vue (#168). `prev` : en pause d'après nous jusqu'ici ; `parked` :
 * il était dans la vue qui vient de se fermer ; `tab` : le site affiché. Un site HORS de la grille ouverte garde son
 * état : une autre vue ne relance pas, caché, un site garé en pause.
 */
export function pauseWanted(
  key: string,
  c: { open: boolean; prefs: Pick<SplitPrefs, 'pause' | 'follow'>; shown: string[]; sound: string | null; tab: string; prev?: boolean; parked?: boolean },
): boolean {
  if (c.open) return c.shown.includes(key) ? effectivePaused(key, c.prefs, c.shown, c.sound) : !!c.prev
  if (!(c.prev || c.parked)) return false
  return CLOSE_KEEPS_PARKED_PAUSED && key !== c.tab
}

/**
 * Pause quand je n'y suis pas (#175) : un site qui n'est pas affiché (garé, autre site, autre page, recherche, ou hors de
 * la grille d'une vue ouverte) est en pause si son réglage le veut. Un seul mécanisme avec #168 (même script dans le
 * site) : la pause finale est celle de la vue OU celle-ci. Une copie de vue n'est jamais « cachée » : elle suit sa case.
 */
export function hiddenPauseWanted(
  key: string,
  setting: boolean,
  c: { open: boolean; shown: string[]; tab: string; searching: boolean },
): boolean {
  if (!setting || key.startsWith('copy:')) return false
  const displayed = c.open ? c.shown.includes(key) : !c.searching && key === c.tab
  return !displayed
}

// ── clavier ────────────────────────────────────────────────────────────────

export type Preset = {
  name: string
  /** [haut, bas] pour chaque panneau, en lettres telles qu'étiquetées sur la touche (`event.key`). */
  mix: [string, string][]
  /** Étiquettes de la rangée du haut pour Alt+chiffre (la touche se lit par `event.code`). */
  digits: string[]
}

/** Des données, pas du code : un autre clavier (BÉPO, Dvorak…) = une entrée de plus. */
export const PRESETS: Record<'azerty' | 'qwerty', Preset> = {
  azerty: { name: 'AZERTY', mix: [['a', 'q'], ['z', 's'], ['e', 'd'], ['r', 'f']], digits: ['&', 'é', '"', "'"] },
  qwerty: { name: 'QWERTY', mix: [['q', 'a'], ['w', 's'], ['e', 'd'], ['r', 'f']], digits: ['1', '2', '3', '4'] },
}

/** « Automatique » : la touche `KeyQ` porte-t-elle un q ? QWERTY ; sinon (ou sans réponse) AZERTY. */
export function detectKeyboard(keyQ: string | undefined): 'azerty' | 'qwerty' {
  return keyQ === 'q' ? 'qwerty' : 'azerty'
}

export function presetOf(choice: KeyboardChoice, detected: 'azerty' | 'qwerty'): Preset {
  return PRESETS[choice === 'auto' ? detected : choice]
}

/** La touche d'agrandir : Z, ou X quand la table de mixage prend Z. */
export const zoomKey = (prefs: { mixer: boolean }) => (prefs.mixer ? 'x' : 'z')

export type KeyEvt = { key: string; code: string; shift: boolean; alt: boolean; ctrl: boolean; meta: boolean }

/** Actions propres à chaque site, avec la touche homedash qui les déclenche. */
export const SITE_ACTIONS = [
  { id: 'like', key: 'l', label: "J'aime" },
  { id: 'save', key: 'b', label: 'Enregistrer' },
  { id: 'share', key: 't', label: 'Repartager' },
  { id: 'comment', key: 'c', label: 'Commenter' },
] as const
export type SiteActionId = (typeof SITE_ACTIONS)[number]['id']

export type SplitAction =
  | { type: 'focus'; pane: number }
  /** `pane` : le panneau visé ; `null` = le panneau actif. `page` : une page entière plutôt qu'un cran. */
  | { type: 'scroll'; pane: number | null; dir: 1 | -1; page: boolean }
  | { type: 'zoom' }
  /** Échap : quitter l'agrandissement, puis la vue. */
  | { type: 'leave' }
  | { type: 'site'; id: SiteActionId }

/**
 * Ce que fait une touche dans la vue scindée, ou `null` : alors elle passe au site, intacte.
 * Jamais d'action dans un champ de saisie (`editing`) ni quand les raccourcis sont décochés
 * (Classic : aucune touche interceptée). Les lettres suivent l'étiquette (`key`), Alt+chiffre la
 * touche physique (`code`).
 */
export function resolveKey(
  e: KeyEvt,
  prefs: Pick<SplitPrefs, 'keys' | 'actions' | 'mixer'>,
  preset: Preset,
  ctx: { editing: boolean; panes: number },
): SplitAction | null {
  if (!prefs.keys || ctx.editing) return null
  if (e.alt && !e.ctrl && !e.meta && !e.shift) {
    const m = /^(?:Digit|Numpad)([1-4])$/.exec(e.code)
    if (m && Number(m[1]) <= ctx.panes) return { type: 'focus', pane: Number(m[1]) - 1 }
    return null
  }
  if (e.ctrl || e.meta || e.alt) return null
  if (e.code === 'Escape' || e.key === 'Escape') return { type: 'leave' }
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
  // Table de mixage : une paire de touches par panneau. Elle n'enlève rien aux autres touches, sauf Z (agrandir),
  // qui est « panneau 2 haut » en AZERTY : avec le mixage, on agrandit avec X (dans les deux claviers).
  if (prefs.mixer) {
    for (let i = 0; i < Math.min(preset.mix.length, ctx.panes); i++) {
      if (k === preset.mix[i][0]) return { type: 'scroll', pane: i, dir: -1, page: false }
      if (k === preset.mix[i][1]) return { type: 'scroll', pane: i, dir: 1, page: false }
    }
  }
  if (k === 'j' || k === 'ArrowDown') return { type: 'scroll', pane: null, dir: 1, page: false }
  if (k === 'k' || k === 'ArrowUp') return { type: 'scroll', pane: null, dir: -1, page: false }
  if (k === 'n') return { type: 'scroll', pane: null, dir: 1, page: true }
  if (k === 'p') return { type: 'scroll', pane: null, dir: -1, page: true }
  if (k === ' ') return { type: 'scroll', pane: null, dir: e.shift ? -1 : 1, page: true }
  if (k === zoomKey(prefs)) return { type: 'zoom' }
  if (prefs.actions) {
    const a = SITE_ACTIONS.find((x) => x.key === k)
    if (a) return { type: 'site', id: a.id }
  }
  return null
}

/** Ce que `guest-preload.js` doit intercepter dans un site (puis relayer à la page). */
export type InterceptTable = {
  /** Touches sans modificateur, en minuscules (`j`, `arrowdown`, ` `). */
  keys: string[]
  /** Touches physiques d'Alt+chiffre. */
  alt: string[]
  /** Échap : relayé à la page, jamais retenu (le site doit pouvoir fermer sa fenêtre). */
  relay: string[]
}

/** La table, tirée de `resolveKey` lui-même : aucune liste à tenir à jour à côté. */
export function interceptTable(
  prefs: Pick<SplitPrefs, 'keys' | 'actions' | 'mixer'>,
  preset: Preset,
  panes: number,
): InterceptTable {
  const out: InterceptTable = { keys: [], alt: [], relay: [] }
  if (!prefs.keys) return out
  const base = { code: '', shift: false, alt: false, ctrl: false, meta: false }
  const ctx = { editing: false, panes }
  for (const key of [...'abcdefghijklmnopqrstuvwxyz', 'ArrowDown', 'ArrowUp', ' ']) {
    if (resolveKey({ ...base, key }, prefs, preset, ctx)) out.keys.push(key.toLowerCase())
  }
  for (let d = 1; d <= 4; d++) {
    const code = `Digit${d}`
    if (resolveKey({ ...base, key: String(d), code, alt: true }, prefs, preset, ctx)) out.alt.push(code, `Numpad${d}`)
  }
  out.relay.push('escape')
  return out
}

/** « A / Q » : les touches d'un panneau en mode mixage, pour l'affichage. */
export function mixLabel(preset: Preset, pane: number): string {
  const m = preset.mix[pane]
  return m ? `${m[0].toUpperCase()} / ${m[1].toUpperCase()}` : ''
}
