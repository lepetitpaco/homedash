import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react'
import type { Command, Hit } from '../components/SearchResults'
import type { Normalized } from '../lib/config'
import type { GithubData } from '../lib/ghboard'
import type { LocalData } from '../lib/local'
import type { Note } from '../lib/notes'
import { rank } from '../lib/search'
import { asUrl, ENGINES, visits } from '../lib/visits'
import type { CustomTab, FlatLink } from '../types'

type Options = {
  cfg: Normalized | null
  links: FlatLink[]
  notes: Note[]
  /** Compte GitHub affiché : ses PRs et branches sont cherchables. */
  gh: GithubData | null
  local: LocalData | null
  searchRef: RefObject<HTMLInputElement | null>
  /** Une modale est ouverte : le clavier lui appartient. */
  paused: boolean
  track: (id: string) => void
  copy: (key: string, value: string) => Promise<void>
  openNote: (id: string) => void
  openLocal: () => void
  /** Ouvre une adresse : dans homedash ou le navigateur (Réglages → `ui.openLinks`). */
  open: (url: string) => void
  /** Onglets perso (éphémères compris), avec leur icône : on peut y aller d'ici. */
  tabs: { tab: CustomTab; icon: () => React.ReactNode }[]
  onTab: (t: CustomTab) => void
  /** Actions de homedash (aller sur un onglet, réglages, thème…). */
  commands: Command[]
}

/** Recherche unifiée (liens, repos, PRs, branches, dépôts locaux, infos, notes) et ses raccourcis clavier. */
export function useSearch({
  cfg,
  links,
  notes,
  gh,
  local,
  searchRef,
  paused,
  track,
  copy,
  openNote,
  openLocal,
  open,
  tabs,
  onTab,
  commands,
}: Options) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const infoItems = useMemo(() => {
    if (!cfg?.infos) return []
    return cfg.infos.groups.flatMap((group) =>
      group.items.map((item) => ({ group, item, key: `info:${group.title}/${item.label}` })),
    )
  }, [cfg])

  const repoItems = useMemo(
    () =>
      (cfg?.repos?.items ?? []).map((repo) => ({
        repo,
        owner: repo.owner ?? cfg?.repos?.defaultOwner ?? '',
      })),
    [cfg],
  )

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

    const repoHits: Hit[] = rank(
      repoItems,
      ({ repo, owner }) => [
        [repo.name, 1],
        [repo.note, 0.7],
        [owner, 0.5],
      ],
      q,
      10,
    ).map(({ repo, owner }) => ({ kind: 'repo', key: `repo:${owner}/${repo.name}`, repo, owner }))

    // Un dépôt local qui porte le nom d'un repo de la carte Repos est montré DANS
    // la carte de ce repo (côté GitHub + côté disque) : pas de doublon.
    const repoNames = new Set(repoItems.map(({ repo }) => repo.name.toLowerCase()))
    const localHits: Hit[] = rank(
      (local?.repos ?? []).filter((r) => !repoNames.has((r.repo ?? r.name).toLowerCase())),
      (r) => [
        [r.name, 1],
        [r.display, 0.5],
        [r.head ?? undefined, 0.4],
      ],
      q,
      8,
    ).map((r) => ({ kind: 'local', key: `local:${r.path}`, local: r }))

    const prHits: Hit[] = rank(
      [
        ...(gh?.prs ?? []).map((pr) => ({ pr, merged: false })),
        ...(gh?.merged ?? []).map((pr) => ({ pr, merged: true })),
      ],
      ({ pr }) => [
        [pr.title, 1],
        [`#${pr.number}`, 0.9],
        [pr.branch, 0.7],
        [pr.repo, 0.5],
      ],
      q,
      8,
    ).map(({ pr, merged }) => ({ kind: 'pr', key: `pr:${pr.repo}#${pr.number}`, pr, merged }))

    const branchHits: Hit[] = rank(
      gh?.branches.active ?? [],
      (b) => [
        [b.name, 1],
        [b.repo, 0.5],
      ],
      q,
      8,
    ).map((branch) => ({ kind: 'branch', key: `branch:${branch.repo}/${branch.name}`, branch }))

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

    // Comme une barre d'adresse : une adresse s'ouvre, un raccourci (`gh …`)
    // cherche sur son site, et le reste peut toujours partir sur Google.
    const url = asUrl(q)
    const goHits: Hit[] = url ? [{ kind: 'go', key: `go:${url}`, url }] : []
    const [first, ...rest] = q.split(/\s+/)
    const engine = rest.length ? ENGINES.find((e) => e.key === first.toLowerCase()) : undefined
    const web = (e: (typeof ENGINES)[number], text: string): Hit => ({
      kind: 'web',
      key: `web:${e.key}:${text}`,
      url: e.url + encodeURIComponent(text),
      q: text,
      engine: e.name,
      icon: e.icon,
    })
    const bangHits: Hit[] = engine ? [web(engine, rest.join(' '))] : []
    const googleHits: Hit[] = engine || url ? [] : [web(ENGINES[0], q)]

    const tabHits: Hit[] = rank(
      tabs,
      ({ tab }) => [
        [tab.label, 1],
        [tab.url, 0.4],
      ],
      q,
      6,
    ).map(({ tab, icon }) => ({ kind: 'tab', key: `tab:${tab.id}`, tab, icon }))

    const cmdHits: Hit[] = rank(
      commands,
      (c) => [
        [c.label, 1],
        [c.keywords, 0.6],
      ],
      q,
      5,
    ).map((cmd) => ({ kind: 'cmd', key: `cmd:${cmd.id}`, cmd }))

    // Historique : les pages déjà vues dans les onglets (titre, adresse).
    const pageHits: Hit[] = rank(
      visits(),
      (v) => [
        [v.title, 1],
        [v.url.replace(/^https?:\/\/(www\.)?/, ''), 0.6],
      ],
      q,
      8,
    ).map((visit) => ({ kind: 'page', key: `page:${visit.url}`, visit }))

    return [
      ...goHits,
      ...bangHits,
      ...tabHits,
      ...linkHits,
      ...cmdHits,
      ...repoHits,
      ...localHits,
      ...prHits,
      ...branchHits,
      ...infoHits,
      ...noteHits,
      ...pageHits,
      ...googleHits,
    ]
  }, [query, links, repoItems, local, gh, infoItems, notes, tabs, commands])

  useEffect(() => setActiveIndex(0), [query])

  const activate = useCallback(
    (hit: Hit) => {
      if (hit.kind === 'link') {
        track(hit.link.id)
        return
      }
      if (hit.kind === 'repo') {
        track(hit.key)
        return
      }
      if (hit.kind === 'pr' || hit.kind === 'branch') return // le lien s'ouvre de lui-même
      if (hit.kind === 'local') {
        openLocal()
        setQuery('')
        return
      }
      if (hit.kind === 'info') {
        void copy(hit.key, hit.item.value)
        return
      }
      if (hit.kind === 'go' || hit.kind === 'web' || hit.kind === 'page') {
        setQuery('')
        open(hit.kind === 'page' ? hit.visit.url : hit.url)
        return
      }
      if (hit.kind === 'tab') {
        setQuery('')
        onTab(hit.tab)
        return
      }
      if (hit.kind === 'cmd') {
        setQuery('')
        hit.cmd.run()
        return
      }
      // une note se consulte : on l'ouvre dans l'éditeur et on quitte la recherche
      openNote(hit.note.id)
      setQuery('')
    },
    [copy, track, openNote, openLocal, open, onTab],
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
          open(hit.link.url)
          track(hit.link.id)
        } else if (hit.kind === 'repo') {
          open(`https://github.com/${hit.owner}/${hit.repo.name}`)
          track(hit.key)
        } else if (hit.kind === 'pr' || hit.kind === 'branch') {
          open(hit.kind === 'pr' ? hit.pr.url : hit.branch.url)
        } else {
          activate(hit)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hits, activeIndex, activate, track, paused, searchRef, open])

  return { query, setQuery, hits, activeIndex, setActiveIndex, activate }
}
