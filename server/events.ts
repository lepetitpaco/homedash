/**
 * Journal des événements : ce qui a changé, gardé au-delà de la notification.
 *
 * Tenu par le serveur, qui tourne en continu et voit les transitions même sans
 * page ouverte ; il survit au rechargement et c'est le même partout. Le front
 * s'en sert pour peupler la cloche et décider quoi notifier.
 *
 * `seq` est un entier strictement croissant, jamais réutilisé, même après un
 * vidage : c'est lui, et pas l'horodatage, que le front compare.
 */

import * as store from './store.ts'

/** Deux jours de bavardage bien tassé. */
export const MAX = 300

export type Event = {
  kind: string
  level: string
  source: string
  title: string
  body: string
  repo: string
  url: string
  tag: string
  sticky: boolean
  keys?: string[]
  seq?: number
  ts?: number
  [k: string]: unknown
}

type Journal = { seq: number; events: Event[] }
let journal: Journal | null = null

function load(): Journal {
  if (journal === null) {
    let raw: unknown
    try {
      raw = store.read(store.EVENTS, null)
    } catch {
      raw = null // fichier corrompu : on repart à vide
    }
    const r = raw as Partial<Journal> | null
    if (r && typeof r === 'object' && Array.isArray(r.events)) {
      journal = { seq: Math.trunc(Number(r.seq || 0)), events: r.events.slice(0, MAX) }
    } else {
      journal = { seq: 0, events: [] }
    }
  }
  return journal
}

/** Tests : relit le fichier au prochain accès. */
export function reset(): void {
  journal = null
}

type EventOpts = { body?: string; repo?: string; url?: string; tag?: string; sticky?: boolean; keys?: Iterable<string> | null }

/**
 * Construit un événement sans l'enregistrer : l'appelant en pousse un lot.
 * `tag` est repris par la notification ; `keys` : ce que l'événement annonce
 * quand il en regroupe plusieurs (voir `tagsSince`).
 */
export function event(kind: string, level: string, source: string, title: string, opts: EventOpts = {}): Event {
  const repo = opts.repo || ''
  const ev: Event = {
    kind,
    level,
    source,
    title,
    body: opts.body || '',
    repo,
    url: opts.url || '',
    tag: opts.tag || `${kind}:${repo}`,
    sticky: !!opts.sticky,
  }
  const keys = opts.keys ? [...opts.keys] : []
  if (keys.length) ev.keys = keys
  return ev
}

/** Ajoute un lot en tête. Retourne le nombre effectivement enregistré. */
export function record(items: (Event | null | undefined | false)[]): number {
  const list = items.filter(Boolean) as Event[]
  if (!list.length) return 0
  const j = load()
  const now = Date.now() / 1000
  const fresh: Event[] = []
  for (const it of list) {
    j.seq += 1
    fresh.push({ ...it, seq: j.seq, ts: it.ts || now })
  }
  // le plus récent d'abord : le front affiche et tronque sans retourner
  j.events = [...fresh.reverse(), ...j.events].slice(0, MAX)
  try {
    store.write(store.EVENTS, j)
  } catch (e) {
    // Le journal en mémoire reste juste : un disque plein ne doit pas faire échouer le cycle.
    console.error(`✗ Journal : ${e}`)
  }
  console.log(fresh.length === 1 ? `📓 Journal : +1 (${fresh[0].title})` : `📓 Journal : +${fresh.length} événements → seq ${j.seq}`)
  return fresh.length
}

/** Tags (et `keys`) des événements notés depuis `ts` : le journal dit « déjà annoncé » (issue #40). */
export function tagsSince(ts: number): Set<string> {
  const out = new Set<string>()
  for (const e of load().events) {
    if ((e.ts || 0) >= ts) {
      out.add(e.tag)
      for (const k of e.keys || []) out.add(k)
    }
  }
  return out
}

/** `since` = dernier `seq` connu du client, pour ne renvoyer que la suite. */
export function payload(since: number | null = null, limit: number = MAX): { events: Event[]; seq: number; total: number } {
  const j = load()
  let evs = j.events.slice(0, Math.max(1, Math.min(Math.trunc(limit || MAX), MAX)))
  if (since !== null) evs = evs.filter((e) => (e.seq || 0) > since)
  return { events: evs, seq: j.seq, total: j.events.length }
}

/** Vide le journal mais garde le compteur. */
export function clear(): boolean {
  const j = load()
  j.events = []
  store.write(store.EVENTS, j)
  return true
}
