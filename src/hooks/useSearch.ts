import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react'
import type { Hit } from '../components/SearchResults'
import type { Normalized } from '../lib/config'
import type { Note } from '../lib/notes'
import { rank } from '../lib/search'
import type { FlatLink } from '../types'

type Options = {
  cfg: Normalized | null
  links: FlatLink[]
  notes: Note[]
  searchRef: RefObject<HTMLInputElement | null>
  /** Une modale est ouverte : le clavier lui appartient. */
  paused: boolean
  track: (id: string) => void
  copy: (key: string, value: string) => Promise<void>
  openNote: (id: string) => void
}

/** Recherche unifiée (liens, infos, notes) et ses raccourcis clavier. */
export function useSearch({ cfg, links, notes, searchRef, paused, track, copy, openNote }: Options) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const infoItems = useMemo(() => {
    if (!cfg?.infos) return []
    return cfg.infos.groups.flatMap((group) =>
      group.items.map((item) => ({ group, item, key: `info:${group.title}/${item.label}` })),
    )
  }, [cfg])

  // --- recherche unifiée ---------------------------------------------------
  const hits: Hit[] = useMemo(() => {
    const q = query.trim()
    if (!q) return []
    const linkHits: Hit[] = rank(
      links,
      (l) => [
        [l.name, 1],
        [l.note, 0.7],
        [l.group, 0.6],
        [l.tags, 0.5],
        [l.url, 0.35],
      ],
      q,
      25,
    ).map((link) => ({ kind: 'link', key: `link:${link.id}`, link }))

    const infoHits: Hit[] = rank(
      infoItems,
      ({ group, item }) => [
        [item.label, 1],
        [item.note, 0.7],
        [group.title, 0.8],
        [item.secret ? undefined : item.value, 0.5],
      ],
      q,
      10,
    ).map(({ group, item, key }) => ({ kind: 'info', key, group, item }))

    const noteHits: Hit[] = rank(notes, (n) => [[n.text, 1]], q, 8).map((note) => ({
      kind: 'note',
      key: `note:${note.id}`,
      note,
    }))

    return [...linkHits, ...infoHits, ...noteHits]
  }, [query, links, infoItems, notes])

  useEffect(() => setActiveIndex(0), [query])

  const activate = useCallback(
    (hit: Hit) => {
      if (hit.kind === 'link') {
        track(hit.link.id)
        return
      }
      if (hit.kind === 'info') {
        void copy(hit.key, hit.item.value)
        return
      }
      // une note se consulte : on l'ouvre dans l'éditeur et on quitte la recherche
      openNote(hit.note.id)
      setQuery('')
    },
    [copy, track, openNote],
  )

  // --- clavier -------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (paused) return
      const inField =
        e.target instanceof HTMLElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)

      if ((e.key === '/' && !inField) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }
      if (e.key === 'Escape') {
        setQuery('')
        searchRef.current?.blur()
        return
      }
      if (hits.length === 0) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => (i + 1) % hits.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => (i - 1 + hits.length) % hits.length)
      } else if (e.key === 'Enter') {
        const hit = hits[activeIndex]
        if (!hit) return
        e.preventDefault()
        if (hit.kind === 'link') {
          window.open(hit.link.url, '_blank', 'noopener')
          track(hit.link.id)
        } else {
          activate(hit)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hits, activeIndex, activate, track, paused, searchRef])

  return { query, setQuery, hits, activeIndex, setActiveIndex, activate }
}
