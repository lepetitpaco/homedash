/**
 * Vue scindée (issue #160) : plusieurs sites côte à côte dans un seul onglet. Toute la logique sans
 * React ni Electron, pour être testée : dispositions, modes Messagerie / Flux et leurs deux cases, étiquettes
 * AZERTY / QWERTY, son (qui est muet), traduction touche → action.
 *
 * Les touches sont résolues ici (`resolveKey`) ; `interceptTable` en tire la liste que `guest-preload.js`
 * applique dans les sites, pour ne jamais décider à deux endroits.
 */

// ── modes et cases à cocher ────────────────────────────────────────────────

/** `classic` = Messagerie, `scroll` = Flux (noms internes du code seulement). */
export type SplitMode = 'classic' | 'scroll'
export type KeyboardChoice = 'auto' | 'azerty' | 'qwerty'

/**
 * Le mode décide de tout (#177, décision de Paco : trop d'options pour un comportement qui doit être évident) :
 * Flux = table de mixage et raccourcis toujours actifs, le son au panneau du dernier geste, pause des autres ;
 * Messagerie = tous les sons, jamais de pause, aucune touche prise. Il ne reste que deux cases, dans les deux modes.
 */
export type SplitPrefs = {
  mode: SplitMode
  /** Une molette pour tous les panneaux (Maj + molette fait l'inverse). */
  sync: boolean
  /** L, B, T, C : actions propres à chaque site, en Flux. Pas de « Suivre » : voir #166. */
  actions: boolean
}

/**
 * Synchro cochée par défaut en Flux (#177 : c'est l'usage du doomscroll à plusieurs), décochée en Messagerie (deux
 * conversations n'ont pas à défiler ensemble) ; elle se change dans les deux.
 */
export const syncDefault = (mode: SplitMode): boolean => mode === 'scroll'

export const DEFAULT_SPLIT: SplitPrefs = { mode: 'scroll', sync: syncDefault('scroll'), actions: true }

/**
 * Les clés du modèle d'avant #177 (« Le son suit », raccourcis, mixage, pause, garder le son) : ignorées à la lecture,
 * jamais renvoyées, sans migration (décision de Paco). `sync` et `actions` gardent le même sens et sont repris tels
 * quels. `keyboard` reste dans `ui.split` (Réglages), lu à part par `normalizeKeyboard`.
 */
export const LEGACY_SPLIT_KEYS = ['follow', 'keys', 'mixer', 'pause', 'keep', 'keyboard'] as const

/** Changer de mode garde « Actions par site » et applique la synchro par défaut du mode. */
export function withMode(p: SplitPrefs, mode: SplitMode): SplitPrefs {
  return { ...p, mode, sync: syncDefault(mode) }
}

/**
 * Réglages lus dans `ui.split` ou dans une vue enregistrée : une clé absente ou absurde prend son défaut (la synchro,
 * celui du mode), les clés d'avant #177 sont ignorées et jamais renvoyées. L'ancien « Personnalisé » n'est plus un
 * mode : il redevient Messagerie si le son était à tous (`follow: 'all'`, ce qui définissait Messagerie), sinon Flux.
 */
export function normalizeSplit(raw: unknown): SplitPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const mode: SplitMode =
    r.mode === 'classic' || r.mode === 'scroll'
      ? r.mode
      : r.mode === 'custom'
        ? r.follow === 'all'
          ? 'classic'
          : 'scroll'
        : DEFAULT_SPLIT.mode
  const bool = (k: string, d: boolean) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : d)
  return { mode, sync: bool('sync', syncDefault(mode)), actions: bool('actions', DEFAULT_SPLIT.actions) }
}

/** Le clavier choisi dans Réglages (`ui.split.keyboard`) : seulement les étiquettes affichées, les touches sont physiques. */
export function normalizeKeyboard(raw: unknown): KeyboardChoice {
  const k = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).keyboard : undefined
  return k === 'azerty' || k === 'qwerty' ? k : 'auto'
}

// ── libellés partagés (barre de la vue et Réglages) ───────────────────────

/** Flux d'abord, Messagerie ensuite : l'ordre du lexique (`CLAUDE.md`), le même dans la barre de la vue, le composeur et Réglages (#187). */
export const MODE_LABELS: { id: SplitMode; label: string; hint: string }[] = [
  { id: 'scroll', label: 'Flux', hint: 'Défiler TikTok, X, Instagram : le panneau où tu agis a le son, les autres sont en pause ; table de mixage et raccourcis' },
  { id: 'classic', label: 'Messagerie', hint: 'Suivre Instagram, Discord… : tous les sons, jamais de pause, aucune touche interceptée' },
]

/** Seulement dans Réglages : la détection automatique se trompe rarement, et le choix ne change que les étiquettes. */
export const KEYBOARD_OPTIONS: { value: KeyboardChoice; label: string }[] = [
  { value: 'auto', label: 'Clavier : automatique' },
  { value: 'azerty', label: 'Clavier : AZERTY' },
  { value: 'qwerty', label: 'Clavier : QWERTY' },
]

/** Les deux cases, avec leur aide : la même dans la barre de la vue et dans Réglages. */
export const FLAG_HELP: { key: 'sync' | 'actions'; label: string; hint: string }[] = [
  { key: 'sync', label: 'Défilement synchronisé', hint: 'défiler un panneau à la molette fait défiler tous les autres ; Maj + molette fait l’inverse' },
  { key: 'actions', label: 'Actions par site', hint: "en Flux : L j'aime, B enregistrer, T repartager, C commenter (X, TikTok, Instagram)" },
]

/** Sans effet en Messagerie (aucune touche n'y est prise) : la case y est grisée, avec cette aide. */
export const ACTIONS_OFF_HINT = 'sans effet en Messagerie : aucune touche n’y est prise'

/** Les modificateurs, dits pareil dans la bulle ⓘ de la vue et dans Réglages (#177). */
export const MODIFIERS_HELP =
  'Mêmes touches sur Mac et Windows (lues à leur place sur le clavier) : Maj (⇧) maintenu = tous les panneaux ; J K et ↓ ↑ visent le panneau sous la souris ; Maj + molette inverse le défilement synchronisé.'

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

/** Séparateur au clavier (#188) : un pas de 2 % de la longueur du nœud par flèche. */
export const SEP_STEP = 0.02
export function nudgeRatios(ratios: number[], index: number, dir: -1 | 1): number[] {
  return dragRatios(ratios, index, dir * SEP_STEP)
}
/** Ce qu'annonce un séparateur (`aria-valuenow / min / max`, en % de la longueur) : les vraies bornes de `dragRatios`, pas des valeurs rondes. */
export function separatorValue(ratios: number[], index: number, min = 0.12): { now: number; min: number; max: number } {
  const total = ratios.reduce((s, r) => s + r, 0)
  const a = ratios[index]
  const b = ratios[index + 1]
  if (a === undefined || b === undefined || total <= 0) return { now: 50, min: 0, max: 100 }
  return { now: Math.round((100 * a) / total), min: Math.round(100 * min), max: Math.round((100 * (a + b - min * total)) / total) }
}

// ── son ────────────────────────────────────────────────────────────────────

/** Qui a le son et les touches : le panneau actif, et celui qui joue (`null` = aucun). */
export type Focus = { active: number; sound: number | null }

/**
 * Le mode focus (⌘⇧F, ⤢ : les barres se cachent, #144) est permis sur un site affiché ET sur une vue scindée ouverte,
 * quel que soit l'onglet dessous, même l'accueil (#183). Avant, la vue scindée n'avait ni bouton ni raccourci à elle :
 * ⌘⇧F ne marchait que par hasard, quand le site dessous en était un.
 */
export function canFocus(siteShown: boolean, splitOpen: boolean): boolean {
  return siteShown || splitOpen
}

/**
 * Un geste sur un panneau : survol, molette, touche de mixage, Alt+chiffre, clic. En Flux il devient actif et prend
 * le son, **le dernier geste gagne** (#177) ; la souris qui sort de la grille ne coupe rien. En Messagerie tous ont
 * le son : seul le panneau actif change.
 */
export function focusOnGesture(f: Focus, pane: number, mode: SplitMode): Focus {
  return mode === 'scroll' ? { active: pane, sound: pane } : { active: pane, sound: f.sound }
}

/**
 * Le son d'un site : coupé s'il l'a été à la main (clic droit, toujours prioritaire) ; sinon, dans une vue Flux,
 * coupé tant qu'il n'a pas le son. `sound` = clé du site qui joue. Un site qui n'est pas dans la grille n'est pas touché.
 */
export function effectiveMuted(
  key: string,
  manual: boolean,
  split: { open: boolean; mode: SplitMode; shown: string[]; sound: string | null },
): boolean {
  if (manual) return true
  if (!split.open || split.mode !== 'scroll' || !split.shown.includes(key)) return false
  return split.sound !== key
}

/**
 * Pause des vidéos (#168) : en Flux, un site de la grille est en pause tant qu'il n'a pas le son (toujours, #177).
 * Jamais en Messagerie, ni hors de la grille.
 */
export function effectivePaused(key: string, mode: SplitMode, shown: string[], sound: string | null): boolean {
  return mode === 'scroll' && shown.includes(key) && sound !== key
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
  c: { open: boolean; mode: SplitMode; shown: string[]; sound: string | null; tab: string; prev?: boolean; parked?: boolean },
): boolean {
  if (c.open) return c.shown.includes(key) ? effectivePaused(key, c.mode, c.shown, c.sound) : !!c.prev
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
  /** [haut, bas] pour chaque panneau, en lettres telles qu'étiquetées sur la touche : pour l'affichage seulement. */
  mix: [string, string][]
  /** Étiquettes de la rangée du haut pour Alt+chiffre (la touche se lit par `event.code`). */
  digits: string[]
}

/** Des données, pas du code : un autre clavier (BÉPO, Dvorak…) = une entrée de plus. */
export const PRESETS: Record<'azerty' | 'qwerty', Preset> = {
  azerty: { name: 'AZERTY', mix: [['a', 'q'], ['z', 's'], ['e', 'd'], ['r', 'f']], digits: ['&', 'é', '"', "'"] },
  qwerty: { name: 'QWERTY', mix: [['q', 'a'], ['w', 's'], ['e', 'd'], ['r', 'f']], digits: ['1', '2', '3', '4'] },
}

/**
 * Table de mixage : [haut, bas] de chaque panneau en touches **physiques** (`event.code`). Les mêmes positions en
 * AZERTY et en QWERTY (A/Q = Q/A), seules les étiquettes changent (`PRESETS`). Toutes les touches de la vue se lisent
 * par `event.code`, jamais par le caractère : Alt donne des symboles sur Mac, Maj des majuscules, et ce qui compte est
 * la place de la touche (#177 : identique sur Mac et Windows).
 */
export const MIX_CODES: [string, string][] = [
  ['KeyQ', 'KeyA'],
  ['KeyW', 'KeyS'],
  ['KeyE', 'KeyD'],
  ['KeyR', 'KeyF'],
]

/** « Automatique » : la touche `KeyQ` porte-t-elle un q ? QWERTY ; sinon (ou sans réponse) AZERTY. */
export function detectKeyboard(keyQ: string | undefined): 'azerty' | 'qwerty' {
  return keyQ === 'q' ? 'qwerty' : 'azerty'
}

export function presetOf(choice: KeyboardChoice, detected: 'azerty' | 'qwerty'): Preset {
  return PRESETS[choice === 'auto' ? detected : choice]
}

/** Agrandir : X, car Z est « panneau 2 haut » en AZERTY (table de mixage). */
export const ZOOM_CODE = 'KeyX'
export const ZOOM_LABEL = 'X'

export type KeyEvt = { key: string; code: string; shift: boolean; alt: boolean; ctrl: boolean; meta: boolean }

/** Actions propres à chaque site, avec la touche homedash qui les déclenche (`code` : la touche physique). */
export const SITE_ACTIONS = [
  { id: 'like', key: 'l', code: 'KeyL', label: "J'aime" },
  { id: 'save', key: 'b', code: 'KeyB', label: 'Enregistrer' },
  { id: 'share', key: 't', code: 'KeyT', label: 'Repartager' },
  { id: 'comment', key: 'c', code: 'KeyC', label: 'Commenter' },
] as const
export type SiteActionId = (typeof SITE_ACTIONS)[number]['id']

/**
 * Quel panneau défiler : un numéro, `active` (le panneau actif), `hover` (celui sous la souris, sinon l'actif) ou
 * `all` (tous les panneaux affichés : Maj).
 */
export type PaneTarget = number | 'active' | 'hover' | 'all'

export type SplitAction =
  | { type: 'focus'; pane: number }
  /** `page` : une page entière plutôt qu'un cran. */
  | { type: 'scroll'; pane: PaneTarget; dir: 1 | -1; page: boolean }
  | { type: 'zoom' }
  /** Échap : quitter l'agrandissement, puis la vue. */
  | { type: 'leave' }
  | { type: 'site'; id: SiteActionId }

/**
 * Ce que fait une touche dans la vue scindée, ou `null` : alors elle passe au site, intacte.
 * Jamais en Messagerie (aucune touche prise) ni dans un champ de saisie (`editing`). Touches physiques (`code`).
 * Modificateurs (#177, mêmes sur Mac et Windows) : **Maj = tous les panneaux** (touches de mixage, J K, flèches, N P) ;
 * Alt + chiffre choisit le panneau ; Ctrl et ⌘ ne sont jamais pris (copier, coller, raccourcis du système).
 * J K et les flèches visent le panneau sous la souris ; une touche de mixage, toujours son panneau.
 */
export function resolveKey(e: KeyEvt, prefs: Pick<SplitPrefs, 'mode' | 'actions'>, ctx: { editing: boolean; panes: number }): SplitAction | null {
  if (prefs.mode !== 'scroll' || ctx.editing) return null
  if (e.ctrl || e.meta) return null
  if (e.alt) {
    const m = /^(?:Digit|Numpad)([1-4])$/.exec(e.code)
    if (!e.shift && m && Number(m[1]) <= ctx.panes) return { type: 'focus', pane: Number(m[1]) - 1 }
    return null
  }
  const c = e.code
  if (c === 'Escape' || e.key === 'Escape') return { type: 'leave' }
  const all = e.shift
  for (let i = 0; i < Math.min(MIX_CODES.length, ctx.panes); i++) {
    const [up, down] = MIX_CODES[i]
    if (c === up || c === down) return { type: 'scroll', pane: all ? 'all' : i, dir: c === up ? -1 : 1, page: false }
  }
  if (c === 'KeyJ' || c === 'ArrowDown') return { type: 'scroll', pane: all ? 'all' : 'hover', dir: 1, page: false }
  if (c === 'KeyK' || c === 'ArrowUp') return { type: 'scroll', pane: all ? 'all' : 'hover', dir: -1, page: false }
  if (c === 'KeyN') return { type: 'scroll', pane: all ? 'all' : 'active', dir: 1, page: true }
  if (c === 'KeyP') return { type: 'scroll', pane: all ? 'all' : 'active', dir: -1, page: true }
  // Maj + Espace garde son sens de toujours : une page plus haut.
  if (c === 'Space') return { type: 'scroll', pane: 'active', dir: e.shift ? -1 : 1, page: true }
  // Agrandir et les actions n'ont pas de sens « pour tous » : avec Maj, la touche reste au site.
  if (all) return null
  if (c === ZOOM_CODE) return { type: 'zoom' }
  if (prefs.actions) {
    const a = SITE_ACTIONS.find((x) => x.code === c)
    if (a) return { type: 'site', id: a.id }
  }
  return null
}

/** Ce que `guest-preload.js` doit intercepter dans un site (puis relayer à la page). Touches physiques (`event.code`). */
export type InterceptTable = {
  /** Touches sans modificateur (`KeyJ`, `ArrowDown`, `Space`). */
  codes: string[]
  /** Touches avec Maj seule. */
  shift: string[]
  /** Touches physiques d'Alt+chiffre. */
  alt: string[]
  /** Échap : relayé à la page, jamais retenu (le site doit pouvoir fermer sa fenêtre). */
  relay: string[]
}

const ALL_CODES = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((l) => `Key${l}`).concat(['ArrowDown', 'ArrowUp', 'Space'])

/** La table, tirée de `resolveKey` lui-même : aucune liste à tenir à jour à côté. Vide en Messagerie. */
export function interceptTable(prefs: Pick<SplitPrefs, 'mode' | 'actions'>, panes: number): InterceptTable {
  const out: InterceptTable = { codes: [], shift: [], alt: [], relay: [] }
  if (prefs.mode !== 'scroll') return out
  const base = { key: '', shift: false, alt: false, ctrl: false, meta: false }
  const ctx = { editing: false, panes }
  for (const code of ALL_CODES) {
    if (resolveKey({ ...base, code }, prefs, ctx)) out.codes.push(code)
    if (resolveKey({ ...base, code, shift: true }, prefs, ctx)) out.shift.push(code)
  }
  for (let d = 1; d <= 4; d++) {
    const code = `Digit${d}`
    if (resolveKey({ ...base, code, alt: true }, prefs, ctx)) out.alt.push(code, `Numpad${d}`)
  }
  out.relay.push('escape')
  return out
}

/** « A / Q » : les touches d'un panneau en mode mixage, pour l'affichage. */
export function mixLabel(preset: Preset, pane: number): string {
  const m = preset.mix[pane]
  return m ? `${m[0].toUpperCase()} / ${m[1].toUpperCase()}` : ''
}

/**
 * La légende de la barre (`short`, en toutes lettres quand il y a la place) et son aide complète (`long`, bulle de ⓘ).
 * Une seule source pour l'écran et les tests.
 */
export function splitLegend(mode: SplitMode, preset: Preset, panes: number): { short: string; long: string } {
  if (mode !== 'scroll') {
    const text = "Aucune touche interceptée : tu tapes dans les sites comme d'habitude."
    return { short: text, long: `${text} Défilement synchronisé : Maj + molette fait l'inverse.` }
  }
  const mix = preset.mix.slice(0, panes).map((_, i) => `${i + 1} : ${mixLabel(preset, i)}`).join('  ·  ')
  return {
    short: `Défiler : ${mix}  ·  Maj : tous  ·  Alt + chiffre : panneau  ·  ${ZOOM_LABEL} : agrandir`,
    long: [
      `Table de mixage : ${mix} (un panneau ; Maj + touche : tous).`,
      'J K ou ↓ ↑ : le panneau sous la souris (Maj : tous). N P, Espace : page suivante / précédente.',
      `Alt + ${preset.digits.slice(0, panes).join(' ')} : choisir le panneau. ${ZOOM_LABEL} : agrandir. Échap : quitter.`,
      "Molette : avec le défilement synchronisé, tous les panneaux suivent ; Maj + molette fait l'inverse.",
      'Le panneau où tu agis (survol, molette, touche, clic) a le son ; les autres sont coupés et en pause.',
      MODIFIERS_HELP,
      'Jamais dans un champ de saisie.',
    ].join(' '),
  }
}
