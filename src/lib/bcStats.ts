/**
 * Statistiques Basecamp : tâches (to-dos et cartes) créées sur une période, et
 * combien sont faites, par personne qui les a créées. Le serveur ne voit que les
 * projets dont le compte est membre : les stats ne portent que sur eux.
 */

/** Une tâche telle que la rend `GET /api/basecamp/stats`. */
export type StatItem = {
  id: number | null
  kind: 'todo' | 'card'
  title: string
  url: string
  who: string
  who_id: number | null
  project: string
  project_id: number | null
  created_at: string
  done: boolean
}

/** `filling` : remplissage en arrière-plan en cours, données disponibles depuis cette date. */
export type StatsData = { days: number; since: string; ts: number; partial: boolean; auto?: boolean; filling?: string | null; items: StatItem[] }

/** Une ligne du tableau : une personne ou un projet. */
export type StatRow = { key: string; who: string; created: number; done: number; items: StatItem[] }

export type StatProject = { id: number; name: string; created: number; done: number }

/** Projets présents dans les données, du plus actif au moins actif. */
export function projectsOf(items: StatItem[]): StatProject[] {
  const by = new Map<number, StatProject>()
  for (const it of items) {
    if (it.project_id == null) continue
    const p = by.get(it.project_id) ?? { id: it.project_id, name: it.project || '?', created: 0, done: 0 }
    p.created++
    if (it.done) p.done++
    by.set(it.project_id, p)
  }
  return [...by.values()].sort((a, b) => b.created - a.created || b.done - a.done || a.name.localeCompare(b.name))
}

/**
 * Une ligne par créateur : tâches créées, tâches faites, et la liste (faites
 * d'abord, puis la plus récente). `project` null = tous les projets cumulés.
 */
export function rowsOf(items: StatItem[], project: number | null = null): StatRow[] {
  const by = new Map<string, StatRow>()
  for (const it of items) {
    if (project !== null && it.project_id !== project) continue
    // même personne même si son nom change : l'id d'abord
    const key = it.who_id != null ? `id:${it.who_id}` : `name:${it.who}`
    const r = by.get(key) ?? { key, who: it.who, created: 0, done: 0, items: [] }
    r.created++
    if (it.done) r.done++
    r.items.push(it)
    by.set(key, r)
  }
  const rows = [...by.values()]
  for (const r of rows) r.items.sort((a, b) => Number(b.done) - Number(a.done) || b.created_at.localeCompare(a.created_at))
  return rows.sort((a, b) => b.created - a.created || b.done - a.done || a.who.localeCompare(b.who))
}

/** Part faite, en pourcentage entier (0 si rien de créé). */
export function rate(done: number, created: number): number {
  return created ? Math.round((done / created) * 100) : 0
}

/** Une ligne par projet (`who` = nom du projet), avec ses tâches. */
export function projectRowsOf(items: StatItem[]): StatRow[] {
  const by = new Map<string, StatRow>()
  for (const it of items) {
    const key = `p:${it.project_id ?? it.project}`
    const r = by.get(key) ?? { key, who: it.project || '?', created: 0, done: 0, items: [] }
    r.created++
    if (it.done) r.done++
    r.items.push(it)
    by.set(key, r)
  }
  return [...by.values()].sort((a, b) => b.done - a.done || b.created - a.created || a.who.localeCompare(b.who))
}

/** Colonne de tri ; `m:AAAA-MM` = tâches créées ce mois-là (vue par mois). */
export type SortKey = 'name' | 'created' | 'done' | 'rate' | `m:${string}`

/** Trie les lignes sur une colonne ; à égalité, par nom. Ne modifie pas la liste reçue. */
export function sortRows(rows: StatRow[], key: SortKey, desc: boolean): StatRow[] {
  const month = key.startsWith('m:') ? key.slice(2) : ''
  const val = (r: StatRow) =>
    month ? cellsOf(r.items).get(month)?.created ?? 0 : key === 'created' ? r.created : key === 'done' ? r.done : key === 'rate' ? (r.created ? r.done / r.created : 0) : 0
  return [...rows].sort((a, b) => {
    const d = key === 'name' ? a.who.localeCompare(b.who, 'fr') : val(a) - val(b)
    return (desc ? -d : d) || a.who.localeCompare(b.who, 'fr')
  })
}

// ── Périodes et mois (heure locale) ──────────────────────────────────────────

/** Mois local d'une date ISO : `AAAA-MM`. */
export function monthKey(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Début du mois `AAAA-MM` (heure locale), et début du mois suivant. */
export function monthBounds(key: string): [Date, Date] {
  const [y, m] = key.split('-').map(Number)
  return [new Date(y, m - 1, 1), new Date(y, m, 1)]
}

/** Les `n` derniers mois, du plus récent (mois en cours compris) au plus ancien. */
export function lastMonths(n: number, now = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)))
}

/** Mois de `from` à `to` compris, dans l'ordre. */
export function monthsBetween(from: Date, to: Date): string[] {
  const out: string[] = []
  for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d < to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) out.push(monthKey(d))
  return out
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
/** « oct. 2026 » ; `short` : « oct. » si c'est l'année en cours. */
export function monthLabel(key: string, short = false, now = new Date()): string {
  const [y, m] = key.split('-').map(Number)
  return short && y === now.getFullYear() ? MONTHS[m - 1] : `${MONTHS[m - 1]} ${y}`
}

/** Tâches créées dans [from, to[. */
export function inPeriod(items: StatItem[], from: Date, to: Date): StatItem[] {
  const a = from.getTime()
  const b = to.getTime()
  return items.filter((it) => {
    const t = Date.parse(it.created_at)
    return t >= a && t < b
  })
}

/** Plus petite période du serveur qui couvre `from` (au plus un an). */
export function daysFor(from: Date, now = new Date(), choices: readonly number[] = [7, 30, 90, 365]): number {
  const need = Math.ceil((now.getTime() - from.getTime()) / 86400_000)
  return choices.find((d) => d >= need) ?? choices[choices.length - 1]
}

export type Cell = { created: number; done: number }

/** Tâches créées et faites, par mois (`AAAA-MM`). */
export function cellsOf(items: StatItem[]): Map<string, Cell> {
  const out = new Map<string, Cell>()
  for (const it of items) {
    const k = monthKey(it.created_at)
    const c = out.get(k) ?? { created: 0, done: 0 }
    c.created++
    if (it.done) c.done++
    out.set(k, c)
  }
  return out
}
