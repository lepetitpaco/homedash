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
  /** L, B, T, C, F : actions propres à chaque site (suppose `keys`). */
  actions: boolean
  /** Table de mixage : une paire de touches par panneau (suppose `keys`). */
  mixer: boolean
  /** Une molette pour tous les panneaux. */
  sync: boolean
  /** Garder le son du dernier panneau à la sortie de la souris. */
  keep: boolean
  keyboard: KeyboardChoice
}

/** Les cases qui définissent un mode ; `keep` et `keyboard` n'en font pas partie. */
type ProfileBoxes = Pick<SplitPrefs, 'follow' | 'keys' | 'actions' | 'mixer' | 'sync'>

/** Les deux préréglages : Classic = double écran, rien d'intercepté ; Scroll = multi-scroll de flux. */
export const PROFILES: Record<'classic' | 'scroll', ProfileBoxes> = {
  classic: { follow: 'all', keys: false, actions: false, mixer: false, sync: false },
  scroll: { follow: 'hover', keys: true, actions: true, mixer: false, sync: false },
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
    keep: bool('keep', base.keep),
    keyboard,
  })
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

export const DEFAULT_LAYOUT = 'c2'

export const layoutOf = (id: string): SplitLayout => LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0]

/** Le plus de panneaux qu'une disposition en compte. */
export const MAX_PANES = 4

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

/** Nombre de feuilles d'un arbre. */
export function paneCount(tree: SplitNode): number {
  return tree === 'pane' ? 1 : tree.children.reduce((s, c) => s + paneCount(c), 0)
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

/** Panneau suivant ou précédent, en boucle. */
export function stepPane(active: number, n: number, dir: 1 | -1): number {
  return n < 1 ? 0 : (active + dir + n) % n
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

export type KeyEvt = { key: string; code: string; shift: boolean; alt: boolean; ctrl: boolean; meta: boolean }

/** Actions propres à chaque site, avec la touche homedash qui les déclenche. */
export const SITE_ACTIONS = [
  { id: 'like', key: 'l', label: "J'aime" },
  { id: 'save', key: 'b', label: 'Enregistrer' },
  { id: 'share', key: 't', label: 'Repartager' },
  { id: 'comment', key: 'c', label: 'Commenter' },
  { id: 'follow', key: 'f', label: 'Suivre' },
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
  if (prefs.mixer) {
    for (let i = 0; i < Math.min(preset.mix.length, ctx.panes); i++) {
      if (k === preset.mix[i][0]) return { type: 'scroll', pane: i, dir: -1, page: false }
      if (k === preset.mix[i][1]) return { type: 'scroll', pane: i, dir: 1, page: false }
    }
    return null
  }
  if (k === 'j' || k === 'ArrowDown') return { type: 'scroll', pane: null, dir: 1, page: false }
  if (k === 'k' || k === 'ArrowUp') return { type: 'scroll', pane: null, dir: -1, page: false }
  if (k === 'n') return { type: 'scroll', pane: null, dir: 1, page: true }
  if (k === 'p') return { type: 'scroll', pane: null, dir: -1, page: true }
  if (k === ' ') return { type: 'scroll', pane: null, dir: e.shift ? -1 : 1, page: true }
  if (k === 'z') return { type: 'zoom' }
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
