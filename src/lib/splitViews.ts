/**
 * Vues scindées enregistrées (issue #169) : ce qu'on garde dans `config.splitViews`, et ce qu'on en tire.
 * Sans React, pour être testé. Une vue garde l'id des *sites* ; un onglet temporaire n'y entre jamais
 * (il est fermé au redémarrage, comme ailleurs).
 */
import { DEFAULT_SPLIT_LAYOUT, layoutOf, normalizeSplit, type SplitMode } from './splitView'
import { refusesEmbed } from './customTabs'
import type { CustomTab, SavedSplitView, TabSession } from '../types'

const SLOTS = 4

/** Les vues lisibles d'une config : absente ou abîmée = rien, jamais d'erreur (défaut dans le code). */
export function normalizeViews(raw: unknown): SavedSplitView[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: SavedSplitView[] = []
  for (const v of raw) {
    if (!v || typeof v !== 'object') continue
    const r = v as Record<string, unknown>
    if (typeof r.id !== 'string' || !r.id || typeof r.name !== 'string' || !r.name.trim() || seen.has(r.id)) continue
    seen.add(r.id)
    const layout = layoutOf(typeof r.layout === 'string' ? r.layout : DEFAULT_SPLIT_LAYOUT)
    const slots = Array.from({ length: SLOTS }, (_, i) => {
      const k = Array.isArray(r.slots) ? r.slots[i] : null
      return i < layout.n && typeof k === 'string' && k ? k : null
    })
    const ratios: Record<string, number[]> = {}
    if (r.ratios && typeof r.ratios === 'object') {
      for (const [path, list] of Object.entries(r.ratios as Record<string, unknown>)) {
        if (Array.isArray(list) && list.length >= 2 && list.length <= SLOTS && list.every((n) => typeof n === 'number' && n > 0 && Number.isFinite(n))) ratios[path] = list as number[]
      }
    }
    const copies = Array.from({ length: SLOTS }, (_, i) => i < layout.n && Array.isArray(r.copies) && r.copies[i] === true)
    const text = (k: string) => (typeof r[k] === 'string' && r[k] ? (r[k] as string) : undefined)
    out.push({
      id: r.id,
      name: r.name.trim().slice(0, 60),
      layout: layout.id,
      slots,
      ...(copies.some(Boolean) ? { copies } : {}),
      ...(r.prefs && typeof r.prefs === 'object' ? { prefs: normalizeSplit(r.prefs) } : {}),
      ...(text('before') ? { before: text('before') } : {}),
      ...(text('folder') ? { folder: text('folder') } : {}),
      ...(Object.keys(ratios).length ? { ratios } : {}),
    })
  }
  return out
}

export function newViewId(taken: string[]): string {
  let id = ''
  do id = `sv-${Math.random().toString(36).slice(2, 8)}`
  while (taken.includes(id))
  return id
}

/**
 * Les vues d'un endroit de la barre : dans ce dossier (`folder`, absent = hors dossier), devant ce site (`before`,
 * `null` = à la fin). Un dossier ou un site disparu ne perd pas la vue : elle retombe hors dossier, à la fin.
 */
export function viewsAt<T extends { folder?: string; before?: string }>(
  views: T[],
  where: { folder?: string; before: string | null },
  known: { folders: string[]; sites: string[] },
): T[] {
  return views.filter((v) => {
    const folder = v.folder && known.folders.includes(v.folder) ? v.folder : undefined
    if (folder !== where.folder) return false
    const before = v.before && known.sites.includes(v.before) ? v.before : null
    return before === where.before
  })
}

/**
 * Place une vue : devant un site (`before`), dans un dossier (`folder`), ou à la fin hors dossier (`{}`). `beforeView` :
 * devant une autre vue (même place, juste avant elle dans l'ordre).
 */
export function moveView(
  views: SavedSplitView[],
  id: string,
  to: { before?: string; folder?: string; beforeView?: string },
): SavedSplitView[] {
  const moved = views.find((v) => v.id === id)
  if (!moved || to.beforeView === id) return views
  const { before: _b, folder: _f, ...rest } = moved
  let place: Pick<SavedSplitView, 'before' | 'folder'> = { ...(to.before ? { before: to.before } : {}), ...(to.folder ? { folder: to.folder } : {}) }
  const others = views.filter((v) => v.id !== id)
  const anchor = to.beforeView ? others.findIndex((v) => v.id === to.beforeView) : -1
  if (anchor >= 0) place = { ...(others[anchor].before ? { before: others[anchor].before } : {}), ...(others[anchor].folder ? { folder: others[anchor].folder } : {}) }
  const next = { ...rest, ...place }
  if (anchor >= 0) others.splice(anchor, 0, next)
  else others.push(next)
  return others
}

/** Une vue qu'on garde : seuls les sites (hors onglets temporaires et Docker) entrent dans ses cases. */
export function makeView(
  id: string,
  name: string,
  layout: string,
  slotKeys: (string | null)[],
  sites: CustomTab[],
  ratios?: Record<string, number[]>,
  place?: Pick<SavedSplitView, 'before' | 'folder'>,
  copies?: boolean[],
  prefs?: SavedSplitView['prefs'],
): SavedSplitView {
  const ids = new Set(sites.map((t) => t.id))
  const slots = slotKeys.map((k) => {
    const sid = k?.startsWith('x:') ? k.slice(2) : null
    return sid && ids.has(sid) ? sid : null
  })
  return normalizeViews([{ id, name, layout, slots, ratios, copies, prefs, ...(place ?? {}) }])[0]
}

/** Le type d'une vue : le sien (`prefs.mode`), sinon celui de Réglages au moment de l'ouverture (vue sans `prefs`). */
export function viewMode(view: Pick<SavedSplitView, 'prefs'>, fallback: SplitMode): SplitMode {
  return view.prefs?.mode ?? fallback
}

/**
 * Copie ou vrai site, par panneau (#179) : **le type décide seul**. Flux = toujours des copies (une page à part sur la
 * même connexion : défiler la tuile ne bouge jamais l'onglet du site), Messagerie = toujours les vrais sites
 * (notifications, compteurs, appels). Le `copies[]` stocké n'est plus lu : une vue Flux d'avant #172, sans lui, ouvrait
 * les vrais sites, liés à leur onglet. Aucune migration : il est encore écrit (même valeur) pour les applis d'avant.
 */
export function copiesFor(mode: SplitMode): boolean[] {
  return Array.from({ length: SLOTS }, () => mode === 'scroll')
}

/**
 * Comment afficher une copie : une `webview` dans l'appli (sur la connexion du site) ; hors de l'appli (navigateur), un
 * simple cadre sur l'adresse du site, qui est déjà « une autre page, mêmes cookies » (la page doit marcher sans l'appli,
 * comme les sites, `CustomTabView`) ; `refused` pour un site connu pour refuser d'être affiché dans une autre page.
 */
export function copyFrame(inApp: boolean, url: string): 'webview' | 'iframe' | 'refused' {
  if (inApp) return 'webview'
  return refusesEmbed(url) ? 'refused' : 'iframe'
}

/**
 * Les cases d'une vue, prêtes à ouvrir : la clé d'onglet du site, ou `null`. `gone` = ids dont le site a été
 * supprimé de Mes sites (le panneau affiche « Site retiré », la vue ne casse pas). `copies` : d'après le type
 * (`copiesFor`) ; `fallback` = le type de Réglages, pour une vue sans `prefs`.
 */
export function viewSlots(view: SavedSplitView, sites: CustomTab[], fallback: SplitMode): { keys: (string | null)[]; gone: boolean[]; copies: boolean[] } {
  const ids = new Set(sites.map((t) => t.id))
  const gone = view.slots.map((id) => !!id && !ids.has(id))
  return { keys: view.slots.map((id, i) => (id && !gone[i] ? `x:${id}` : null)), gone, copies: copiesFor(viewMode(view, fallback)) }
}

/**
 * Nom d'un site dans le sélecteur d'un panneau : « X · pro » quand il a un compte (une connexion à part), le
 * nom seul sinon. Deux entrées ne portent jamais le même nom : la 2e reçoit « (2) ».
 */
export function siteNames(sites: CustomTab[], sessions: TabSession[]): Record<string, string> {
  const out: Record<string, string> = {}
  const used = new Map<string, number>()
  for (const t of sites) {
    const account = sessions.find((s) => s.id === t.session)?.name
    const base = account ? `${t.label} · ${account}` : t.label
    const n = (used.get(base) ?? 0) + 1
    used.set(base, n)
    out[t.id] = n > 1 ? `${base} (${n})` : base
  }
  return out
}

/**
 * Cases qu'« Enregistrer » (nouvelle vue ou Modifier la vue) ne garde pas : un onglet temporaire ou un container Docker (calculés, jamais dans
 * la config) n'est pas un site de Mes sites. Renvoie leur numéro (0 = première case).
 */
export function droppedSlots(slotKeys: (string | null)[], sites: CustomTab[]): number[] {
  const ids = new Set(sites.map((t) => t.id))
  return slotKeys.flatMap((k, i) => (k && !(k.startsWith('x:') && ids.has(k.slice(2))) ? [i] : []))
}

/**
 * Compteur d'une vue : la somme de ceux de ses sites, chacun une seule fois, comptés comme le Dock
 * (un site dont les notifications sont coupées ne compte pas).
 */
export function viewCounter(view: SavedSplitView, counts: Record<string, number>, sites: CustomTab[], fallback: SplitMode): number {
  const ids = new Set(sites.filter((t) => t.embed && t.notify !== false).map((t) => t.id))
  // une copie n'a ni compteur ni notification : seuls les panneaux « site réel » comptent (pas de doublon) ; en Flux, aucun
  const copies = copiesFor(viewMode(view, fallback))
  const once = new Set(view.slots.filter((id, i): id is string => !!id && ids.has(id) && !copies[i]))
  let sum = 0
  for (const id of once) sum += counts[`x:${id}`] ?? 0
  return sum
}

/** Renommer une vue (un nom vide est refusé) ; la supprimer ; les sites supprimés de Mes sites laissent leurs cases (« Site retiré »). */
export const renameView = (views: SavedSplitView[], id: string, name: string): SavedSplitView[] =>
  views.map((v) => (v.id === id && name.trim() ? { ...v, name: name.trim().slice(0, 60) } : v))

export const removeView = (views: SavedSplitView[], id: string): SavedSplitView[] => views.filter((v) => v.id !== id)
