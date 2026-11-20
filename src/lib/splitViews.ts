/**
 * Vues scindées enregistrées (issue #169) : ce qu'on garde dans `config.splitViews`, et ce qu'on en tire.
 * Sans React, pour être testé. Une vue garde l'id des *sites* ; un onglet temporaire n'y entre jamais
 * (il est fermé au redémarrage, comme ailleurs).
 */
import { DEFAULT_SPLIT_LAYOUT, layoutOf } from './splitView'
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
    out.push({ id: r.id, name: r.name.trim().slice(0, 60), layout: layout.id, slots, ...(Object.keys(ratios).length ? { ratios } : {}) })
  }
  return out
}

export function newViewId(taken: string[]): string {
  let id = ''
  do id = `sv-${Math.random().toString(36).slice(2, 8)}`
  while (taken.includes(id))
  return id
}

/** Une vue qu'on garde : seuls les sites (hors onglets temporaires) entrent dans ses cases. */
export function makeView(
  id: string,
  name: string,
  layout: string,
  slotKeys: (string | null)[],
  sites: CustomTab[],
  ratios?: Record<string, number[]>,
): SavedSplitView {
  const ids = new Set(sites.map((t) => t.id))
  const slots = slotKeys.map((k) => {
    const sid = k?.startsWith('x:') ? k.slice(2) : null
    return sid && ids.has(sid) ? sid : null
  })
  return normalizeViews([{ id, name, layout, slots, ratios }])[0]
}

/**
 * Les cases d'une vue, prêtes à ouvrir : la clé d'onglet du site, ou `null`. `gone` = ids dont le site a été
 * supprimé de Mes sites (le panneau affiche « Site retiré », la vue ne casse pas).
 */
export function viewSlots(view: SavedSplitView, sites: CustomTab[]): { keys: (string | null)[]; gone: boolean[] } {
  const ids = new Set(sites.map((t) => t.id))
  const gone = view.slots.map((id) => !!id && !ids.has(id))
  return { keys: view.slots.map((id, i) => (id && !gone[i] ? `x:${id}` : null)), gone }
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
 * Cases que « Garder cette vue » ne garde pas : un onglet temporaire ou un container Docker (calculés, jamais dans
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
export function viewCounter(view: SavedSplitView, counts: Record<string, number>, sites: CustomTab[]): number {
  const ids = new Set(sites.filter((t) => t.embed && t.notify !== false).map((t) => t.id))
  const once = new Set(view.slots.filter((id): id is string => !!id && ids.has(id)))
  let sum = 0
  for (const id of once) sum += counts[`x:${id}`] ?? 0
  return sum
}

/** Renommer une vue (un nom vide est refusé) ; la supprimer ; les sites supprimés de Mes sites laissent leurs cases (« Site retiré »). */
export const renameView = (views: SavedSplitView[], id: string, name: string): SavedSplitView[] =>
  views.map((v) => (v.id === id && name.trim() ? { ...v, name: name.trim().slice(0, 60) } : v))

export const removeView = (views: SavedSplitView[], id: string): SavedSplitView[] => views.filter((v) => v.id !== id)
