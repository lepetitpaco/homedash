/**
 * Ce qui sonne dans la cloche (issue #131). Deux leviers, comme GitHub ou Slack :
 *
 *  · **par type** (Réglages → Notifications) : `notify` = compté et notifié (défaut, comme avant),
 *    `quiet` = dans la liste sans compter ni notifier, `hide` = nulle part ;
 *  · **regroupement** : les événements Renovate d'une même version (un par repo) ne font qu'une ligne,
 *    et le compteur compte des lignes, pas des événements.
 *
 * Pur : le serveur (`events.ts`) décide toujours seul de ce qui est un événement.
 */
/** Ce dont le regroupement a besoin d'un événement (`HdEvent`, sans dépendre de la page). */
export type BellEvent = { seq: number; ts: number; kind: string; title: string; body: string; repo: string }

export type BellLevel = 'notify' | 'quiet' | 'hide'
export type BellFamily = 'ci-fail' | 'ci-pass' | 'merged' | 'renovate' | 'renovate-fail' | 'local' | 'basecamp' | 'trello'
export type BellPrefs = Partial<Record<BellFamily, BellLevel>>

export const BELL_LEVELS: { id: BellLevel; label: string; title: string }[] = [
  { id: 'notify', label: 'Compter', title: 'Dans la liste, dans le compteur de la cloche, et en notification si elles sont actives' },
  { id: 'quiet', label: 'Discret', title: 'Dans la liste seulement : ni compteur, ni notification' },
  { id: 'hide', label: 'Masqué', title: 'Nulle part (le serveur continue de le noter au journal)' },
]

/** Dans l'ordre de la page de réglages. `kinds` : les `kind` du serveur rangés dans la famille. */
export const BELL_FAMILIES: { id: BellFamily; icon: string; label: string; kinds: string[] }[] = [
  { id: 'ci-fail', icon: '✗', label: 'CI en échec sur une PR', kinds: ['pr-fail'] },
  { id: 'ci-pass', icon: '✓', label: 'CI qui repasse au vert', kinds: ['pr-pass'] },
  { id: 'merged', icon: '🎉', label: 'PR et branches mergées', kinds: ['pr-merged', 'branch-merged'] },
  { id: 'renovate', icon: '🤖', label: 'Renovate : disponible, mergée, validée', kinds: ['ren-new', 'rm-new', 'rm-pass'] },
  { id: 'renovate-fail', icon: '⛔', label: 'Renovate en échec', kinds: ['ren-fail', 'rm-fail'] },
  { id: 'local', icon: '🧹', label: 'Branches locales à nettoyer', kinds: ['local-cleanup'] },
  { id: 'basecamp', icon: '🏕', label: 'Basecamp : notifications, tâches, rapports', kinds: ['bc-notif', 'bc-task', 'bc-report'] },
  { id: 'trello', icon: '📋', label: 'Trello : notifications, cartes, rapports', kinds: ['tr-notif', 'tr-task', 'tr-report'] },
]

const FAMILY_OF = new Map(BELL_FAMILIES.flatMap((f) => f.kinds.map((k) => [k, f.id] as const)))
const LEVELS = new Set<string>(BELL_LEVELS.map((l) => l.id))

/** Famille d'un `kind` ; `null` = hors réglage (mise à jour de homedash, type inconnu) : toujours compté. */
export function familyOf(kind: string): BellFamily | null {
  return FAMILY_OF.get(kind) ?? null
}

/** Niveau d'un événement ; une valeur absente ou inconnue = `notify`, le comportement d'avant. */
export function levelOf(prefs: BellPrefs | null | undefined, kind: string): BellLevel {
  const fam = familyOf(kind)
  const v = fam ? prefs?.[fam] : undefined
  return v && LEVELS.has(v) ? v : 'notify'
}

/** Ne garde que des niveaux connus et différents du défaut : la config reste courte. */
export function cleanPrefs(prefs: unknown): BellPrefs {
  const out: BellPrefs = {}
  if (!prefs || typeof prefs !== 'object') return out
  for (const f of BELL_FAMILIES) {
    const v = (prefs as Record<string, unknown>)[f.id]
    if (v === 'quiet' || v === 'hide') out[f.id] = v
  }
  return out
}

// ── Regroupement ────────────────────────────────────────────────────────────

const GROUPED = new Set(['ren-new', 'ren-fail', 'rm-new', 'rm-pass', 'rm-fail'])
const VERSION = /\bv?(\d+\.\d+\.\d+)\b/

/** Clé de regroupement : même type Renovate, même version. `null` = ligne seule. */
export function groupKey(e: Pick<BellEvent, 'kind' | 'title' | 'body'>): string | null {
  if (!GROUPED.has(e.kind)) return null
  const v = VERSION.exec(`${e.title} ${e.body}`)?.[1]
  return v ? `${e.kind}:${v}` : null
}

export type EventGroup<E extends BellEvent = BellEvent> = {
  /** Le plus récent : sa ligne, son lien, son heure. */
  head: E
  /** Tous, `head` compris, du plus récent au plus ancien. */
  items: E[]
}

/**
 * Regroupe une liste déjà triée (plus récent d'abord). Un groupe se forme sur la même journée
 * locale seulement : une version qui traîne sur deux jours garde une ligne par jour.
 */
export function groupEvents<E extends BellEvent>(events: E[]): EventGroup<E>[] {
  const out: EventGroup<E>[] = []
  const open = new Map<string, EventGroup<E>>()
  for (const e of events) {
    const k = groupKey(e)
    const d = new Date(e.ts * 1000)
    const key = k && `${k}|${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    const g = key ? open.get(key) : undefined
    if (g) {
      g.items.push(e)
      continue
    }
    const fresh = { head: e, items: [e] }
    out.push(fresh)
    if (key) open.set(key, fresh)
  }
  return out
}

/** Les repos des autres lignes d'un groupe, pour le dire sous le titre. */
export function othersOf(g: EventGroup<BellEvent>): string[] {
  return [...new Set(g.items.slice(1).map((e) => e.repo).filter((r) => r && r !== g.head.repo))]
}

/** Nombre de lignes nouvelles (après `seen`) qui comptent : regroupées, sans les discrètes. */
export function unseenCount(events: BellEvent[], seen: number, prefs: BellPrefs | null | undefined): number {
  const fresh = events.filter((e) => e.seq > seen && levelOf(prefs, e.kind) === 'notify')
  return groupEvents(fresh).length
}
