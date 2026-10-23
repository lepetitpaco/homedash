/** Journal des événements servi par le backend Python (`GET /api/events`). */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { notifyEvents } from './notifications'
import { shown } from './errors'

export type EventLevel = 'ok' | 'bad' | 'warn' | 'info'
export type EventSource = 'github' | 'local' | 'basecamp'

export type HdEvent = {
  /** Entier strictement croissant, jamais réutilisé. L'ordre fait autorité. */
  seq: number
  ts: number
  kind: string
  level: EventLevel
  source: EventSource
  repo: string
  title: string
  body: string
  url: string
  /** Repris tel quel par la notification : un tag = un remplacement, pas un empilement. */
  tag: string
  sticky: boolean
  /** Compte GitHub d'origine, quand il y en a plusieurs. */
  account?: string
}

type Payload = { events: HdEvent[]; seq: number; total: number }

/**
 * Où mène un événement DANS homedash (onglet Local, vue Issues de Basecamp) ;
 * `undefined` = son `url`, dehors.
 */
export type InApp = (e: HdEvent) => (() => void) | undefined

const SEEN_KEY = 'homedash:events-seen'
const POLL = 15_000

function readSeen(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0
  } catch {
    return 0
  }
}

/**
 * Sonde le journal et en tire les notifications.
 *
 * Deux repères distincts, qui répondent à deux questions différentes :
 *
 *  · `baseline` — ce que CETTE page a vu passer depuis son chargement. Fixée au
 *    premier sondage sans rien notifier : ouvrir le dashboard le matin ne doit
 *    pas faire sonner la nuit entière, c'est précisément le rôle de la page de
 *    la raconter tranquillement. Vit en mémoire, meurt avec l'onglet.
 *
 *  · `seen` — ce que l'utilisateur a effectivement lu, pour la pastille. Vit
 *    dans le localStorage : c'est une préférence d'affichage, propre au
 *    navigateur, comme le thème et les groupes repliés.
 *
 * Le sondage ne s'arrête PAS quand l'onglet est caché, pour la même raison que
 * celui de GitHub : c'est là que les notifications servent.
 *
 * `off` : sources des fonctionnalités coupées (Réglages → Fonctionnalités). Leurs
 * événements, même anciens, ne sont ni montrés, ni comptés, ni notifiés.
 */
export function useEvents(inApp: InApp, off: EventSource[] = []): {
  events: HdEvent[]
  error: string | null
  /** Nombre d'événements plus récents que ce qui a été lu. Pastille de l'onglet. */
  unseen: number
  /** `seq` du plus récent, et repère figé à l'ouverture de la page. */
  latest: number
  seen: number
  markSeen: () => void
  clear: () => void
  refresh: () => Promise<unknown>
} {
  const [events, setEvents] = useState<HdEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [seen, setSeenState] = useState<number>(readSeen)
  const [latest, setLatest] = useState(0)

  const seenRef = useRef(seen)
  const baseline = useRef<number | null>(null)
  // `inApp` sert de destination au clic sur une notification (ménage local,
  // rapport prêt) ; passer par une ref évite de relancer la boucle à chaque rendu.
  const act = useRef(inApp)
  act.current = inApp
  const offRef = useRef(off)
  offRef.current = off

  const setSeen = useCallback((value: number) => {
    seenRef.current = value
    setSeenState(value)
    try {
      localStorage.setItem(SEEN_KEY, String(value))
    } catch {
      /* stockage indisponible */
    }
  }, [])

  const load = useCallback(async () => {
    try {
      const res = await fetch('api/events', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as Payload
      setError(null)
      // même journal (même dernier seq, même taille) : rien à redessiner
      setEvents((prev) =>
        prev.length === data.events.length && prev[0]?.seq === data.events[0]?.seq ? prev : data.events,
      )
      setLatest(data.seq)

      // Journal reparti en arrière (data/ remonté d'une sauvegarde, fichier
      // effacé) : les repères d'avant désigneraient un futur qui n'existe plus
      // et plus rien ne serait jamais signalé. On se recale plutôt que de rester
      // muet pour toujours.
      if (data.seq < seenRef.current) setSeen(data.seq)
      if (baseline.current !== null && data.seq < baseline.current) baseline.current = null

      if (baseline.current === null) {
        baseline.current = data.seq // premier tour : on prend acte, on ne sonne pas
      } else if (data.seq > baseline.current) {
        const since = baseline.current
        baseline.current = data.seq
        const fresh = data.events.filter((e) => e.seq > since && !offRef.current.includes(e.source))
        if (fresh.length > 0) notifyEvents(fresh, act.current)
      }
      return data
    } catch (e) {
      setError(shown('cloche', e))
      return null
    }
  }, [setSeen])

  useEffect(() => {
    let alive = true
    let timer = 0
    const tick = async () => {
      await load()
      if (!alive) return
      timer = window.setTimeout(tick, POLL)
    }
    void tick()
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [load])

  const markSeen = useCallback(() => {
    if (latest > seenRef.current) setSeen(latest)
  }, [latest, setSeen])

  const clear = useCallback(() => {
    void fetch('api/events', { method: 'DELETE' })
      .then(() => load())
      .catch(() => undefined)
  }, [load])

  const offKey = off.join(',')
  const kept = useMemo(
    () => (offKey ? events.filter((e) => !offKey.split(',').includes(e.source)) : events),
    [events, offKey],
  )

  return {
    events: kept,
    error,
    unseen: kept.filter((e) => e.seq > seen).length,
    latest,
    seen,
    markSeen,
    clear,
    /** Relit le journal tout de suite (bouton « tout actualiser »). */
    refresh: load,
  }
}

/** « 14:32 », ou « hier 09:07 » — le séparateur de jour porte le reste. */
export function hhmm(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const DAY_FMT = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

/** Clé de regroupement par jour + libellé affichable. */
export function dayOf(ts: number): { key: string; label: string } {
  const d = new Date(ts * 1000)
  const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  const today = new Date()
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (same(d, today)) return { key, label: "aujourd'hui" }
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (same(d, yesterday)) return { key, label: 'hier' }
  return { key, label: DAY_FMT.format(d) }
}
