import { noteTitle, notePreview, type Note } from '../lib/notes'
import type { Branch, GithubData, Pr } from '../lib/ghboard'
import type { LocalData, LocalRepo } from '../lib/local'
import type { CustomTab, FlatLink, Health, InfoGroup, InfoItem, RepoItem, ReposConfig } from '../types'
import type { Visit } from '../lib/visits'
import type { BcFound } from '../lib/basecamp'
import Favicon from './Favicon'
import SearchPreview from './SearchPreview'

export type Hit =
  | { kind: 'link'; key: string; link: FlatLink }
  | { kind: 'repo'; key: string; repo: RepoItem; owner: string }
  | { kind: 'pr'; key: string; pr: Pr; merged: boolean }
  | { kind: 'branch'; key: string; branch: Branch }
  | { kind: 'local'; key: string; local: LocalRepo }
  | { kind: 'info'; key: string; group: InfoGroup; item: InfoItem }
  | { kind: 'note'; key: string; note: Note }
  /** Adresse tapée : l'ouvrir. */
  | { kind: 'go'; key: string; url: string }
  /** Recherche sur le web (Google, ou le site d'un raccourci : `gh …`, `yt …`). */
  | { kind: 'web'; key: string; url: string; q: string; engine: string; icon: string }
  /** Onglet perso (éphémères compris) : y aller. */
  | { kind: 'tab'; key: string; tab: CustomTab; icon: () => React.ReactNode }
  /** Page déjà vue dans un onglet (historique). */
  | { kind: 'page'; key: string; visit: Visit }
  /** Action de homedash : aller sur un onglet, réglages, thème… */
  | { kind: 'cmd'; key: string; cmd: Command }
  /** Basecamp : une de mes tâches, ou un résultat de la recherche dans tout Basecamp. */
  | { kind: 'bc'; key: string; item: BcFound }

/** Type Basecamp → icône et nom, pour la ligne et la carte. */
export const BC_TYPES: Record<string, [string, string]> = {
  Todo: ['✅', 'to-do'],
  'Kanban::Card': ['🗂', 'carte'],
  Comment: ['💬', 'commentaire'],
  Message: ['📣', 'message'],
  Document: ['📄', 'document'],
  Upload: ['📎', 'fichier'],
  'Question::Answer': ['🙋', 'réponse'],
  'Schedule::Entry': ['📅', 'événement'],
  Todolist: ['📋', 'liste'],
}
export const BC_COLOR = '#2da562'

export type Command = {
  id: string
  icon: React.ReactNode
  label: string
  /** Mots cherchés en plus du nom. */
  keywords?: string
  hint?: string
  run: () => void
}

/** Ligne et carte des résultats « navigateur » : même forme pour tous. */
export function plainHit(hit: Hit): {
  icon: React.ReactNode
  name: string
  sub: string
  chip: string
  color: string
  action: string
} | null {
  switch (hit.kind) {
    case 'go':
      return { icon: '↗', name: `Ouvrir ${hit.url.replace(/^https?:\/\//, '')}`, sub: hit.url, chip: 'adresse', color: '#60a5fa', action: 'Ouvrir' }
    case 'web':
      return { icon: hit.icon, name: `Rechercher « ${hit.q} »`, sub: `sur ${hit.engine}`, chip: hit.engine, color: '#60a5fa', action: 'Rechercher' }
    case 'tab':
      return { icon: hit.icon(), name: hit.tab.label, sub: hit.tab.url, chip: hit.tab.id.startsWith('tmp-') ? 'temporaire' : 'onglet', color: '#a78bfa', action: 'Aller à l’onglet' }
    case 'page':
      return { icon: '🕘', name: hit.visit.title || hit.visit.url, sub: hit.visit.url, chip: hit.visit.tab || 'historique', color: '#94a3b8', action: 'Ouvrir' }
    case 'cmd':
      return { icon: hit.cmd.icon, name: hit.cmd.label, sub: hit.cmd.hint ?? '', chip: 'action', color: '#f59e0b', action: 'Lancer' }
    case 'bc': {
      const [icon, label] = BC_TYPES[hit.item.type] ?? ['🏕', 'Basecamp']
      return {
        icon,
        name: hit.item.title,
        sub: [hit.item.project, hit.item.parent].filter(Boolean).join(' › '),
        chip: hit.item.mine ? 'ma tâche' : `Basecamp · ${label}`,
        color: BC_COLOR,
        action: 'Ouvrir dans Basecamp',
      }
    }
    default:
      return null
  }
}

type Props = {
  hits: Hit[]
  activeIndex: number
  favicons: boolean
  faviconProvider: string
  health: Record<string, Health>
  revealSecrets: boolean
  copiedKey: string | null
  infoColor: string
  noteColor: string
  noteIcon: string
  emptyHint: string
  counts: Record<string, number>
  gh: GithubData | null
  repos: ReposConfig | undefined
  local: LocalData | null
  onOpenLocal: () => void
  copy: (key: string, value: string) => Promise<void>
  onActivate: (hit: Hit) => void
  onHover: (index: number) => void
  /** Basecamp : en faire une issue (absent : aucun repo où la créer). */
  onBcIssue?: (item: BcFound) => void
  /** Basecamp : une de mes tâches, montrée dans l'onglet Basecamp. */
  onBcShow?: (item: BcFound) => void
  /** Basecamp : la fiche de la tâche (ses échanges), ouverte sur le commentaire trouvé. */
  onBcView?: (item: BcFound) => void
}

export default function SearchResults({
  hits,
  activeIndex,
  favicons,
  faviconProvider,
  health,
  revealSecrets,
  copiedKey,
  infoColor,
  noteColor,
  noteIcon,
  emptyHint,
  counts,
  gh,
  repos,
  local,
  onOpenLocal,
  copy,
  onActivate,
  onHover,
  onBcIssue,
  onBcShow,
  onBcView,
}: Props) {
  if (hits.length === 0) {
    return (
      <div className="card results empty-results">
        <p>{emptyHint}</p>
      </div>
    )
  }

  const current = hits[activeIndex] ?? hits[0]

  // Liste à gauche, carte complète de la sélection à droite.
  return (
    <div className="search-layout">
      <div className="card results">
        {hits.map((hit, i) => {
          const active = i === activeIndex
          const common = {
            className: `result${active ? ' is-active' : ''}`,
            onMouseEnter: () => onHover(i),
          }

          const plain = plainHit(hit)
          if (plain) {
            return (
              <button key={hit.key} {...common} onClick={() => onActivate(hit)}>
                <span className="favicon monogram" style={{ background: `${plain.color}22`, color: plain.color }}>
                  {plain.icon}
                </span>
                <span className="result-main">
                  <span className="result-name">{plain.name}</span>
                  {plain.sub ? <span className="result-sub">{plain.sub}</span> : null}
                </span>
                <span className="chip" style={{ borderColor: `${plain.color}55`, color: plain.color }}>
                  {plain.chip}
                </span>
              </button>
            )
          }

          if (hit.kind === 'link') {
            const { link } = hit
            return (
              <a
                key={hit.key}
                {...common}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                onClick={() => onActivate(hit)}
              >
                <Favicon
                  url={link.url}
                  name={link.name}
                  color={link.color}
                  enabled={favicons}
                  provider={faviconProvider}
                />
                <span className="result-main">
                  <span className="result-name">{link.name}</span>
                  <span className="result-sub">{link.url}</span>
                </span>
                {link.check && health[link.id] ? <span className={`dot dot-${health[link.id]}`} /> : null}
                <span className="chip" style={{ borderColor: `${link.color}55`, color: link.color }}>
                  {link.icon} {link.group}
                </span>
              </a>
            )
          }

          if (hit.kind === 'repo') {
            const color = repos?.color ?? '#a78bfa'
            return (
              <a
                key={hit.key}
                {...common}
                href={`https://github.com/${hit.owner}/${hit.repo.name}`}
                target="_blank"
                rel="noreferrer"
                onClick={() => onActivate(hit)}
              >
                <span className="favicon monogram" style={{ background: `${color}22`, color }}>
                  {repos?.icon ?? '🐙'}
                </span>
                <span className="result-main">
                  <span className="result-name">{hit.repo.name}</span>
                  <span className="result-sub">
                    {hit.owner}
                    {hit.repo.note ? ` · ${hit.repo.note}` : ''}
                  </span>
                </span>
                <span className="chip" style={{ borderColor: `${color}55`, color }}>
                  repo
                </span>
              </a>
            )
          }

          if (hit.kind === 'pr' || hit.kind === 'branch') {
            const isPr = hit.kind === 'pr'
            const url = isPr ? hit.pr.url : hit.branch.url
            const repo = isPr ? hit.pr.repo : hit.branch.repo
            const color = isPr ? '#60a5fa' : '#3fb950'
            return (
              <a
                key={hit.key}
                {...common}
                href={url}
                target="_blank"
                rel="noreferrer"
                onClick={() => onActivate(hit)}
              >
                <span className="favicon monogram" style={{ background: `${color}22`, color }}>
                  {isPr ? '🔀' : '🌿'}
                </span>
                <span className="result-main">
                  <span className="result-name">
                    {isPr ? `#${hit.pr.number} ${hit.pr.title}` : hit.branch.name}
                  </span>
                  <span className="result-sub">{repo}</span>
                </span>
                <span className="chip" style={{ borderColor: `${color}55`, color }}>
                  {isPr ? (hit.merged ? 'PR mergée' : 'PR') : 'branche'}
                </span>
              </a>
            )
          }

          if (hit.kind === 'local') {
            const color = '#94a3b8'
            return (
              <button key={hit.key} {...common} onClick={() => onActivate(hit)}>
                <span className="favicon monogram" style={{ background: `${color}22`, color }}>
                  💻
                </span>
                <span className="result-main">
                  <span className="result-name">{hit.local.name}</span>
                  <span className="result-sub">
                    {hit.local.display}
                    {hit.local.head ? ` · ${hit.local.head}` : ''}
                  </span>
                </span>
                <span className="chip" style={{ borderColor: `${color}55`, color }}>
                  local
                </span>
              </button>
            )
          }

          if (hit.kind === 'info') {
            const masked = hit.item.secret && !revealSecrets
            const color = hit.group.color ?? infoColor
            return (
              <button key={hit.key} {...common} onClick={() => onActivate(hit)}>
                <span className="favicon monogram" style={{ background: `${color}22`, color }}>
                  {hit.group.icon ?? 'i'}
                </span>
                <span className="result-main">
                  <span className="result-name">{hit.item.label}</span>
                  <span className="result-sub">
                    {copiedKey === hit.key
                      ? '✓ copié dans le presse-papier'
                      : masked
                        ? '•••••••• — Entrée pour copier'
                        : hit.item.value}
                  </span>
                </span>
                <span className="chip" style={{ borderColor: `${color}55`, color }}>
                  {hit.group.title}
                </span>
              </button>
            )
          }

          if (hit.kind !== 'note') return null
          return (
            <button key={hit.key} {...common} onClick={() => onActivate(hit)}>
              <span className="favicon monogram" style={{ background: `${noteColor}22`, color: noteColor }}>
                {noteIcon}
              </span>
              <span className="result-main">
                <span className="result-name">{noteTitle(hit.note.text)}</span>
                <span className="result-sub">
                  {notePreview(hit.note.text) || 'note — Entrée pour ouvrir'}
                </span>
              </span>
              <span className="chip" style={{ borderColor: `${noteColor}55`, color: noteColor }}>
                notes
              </span>
            </button>
          )
        })}
      </div>
      <SearchPreview
        hit={current}
        favicons={favicons}
        faviconProvider={faviconProvider}
        health={health}
        counts={counts}
        gh={gh}
        repos={repos}
        local={local}
        onOpenLocal={onOpenLocal}
        copiedKey={copiedKey}
        infoColor={infoColor}
        noteColor={noteColor}
        noteIcon={noteIcon}
        copy={copy}
        onActivate={onActivate}
        onBcIssue={onBcIssue}
        onBcShow={onBcShow}
        onBcView={onBcView}
      />
    </div>
  )
}
