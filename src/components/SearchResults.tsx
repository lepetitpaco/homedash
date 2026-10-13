import { noteTitle, notePreview, type Note } from '../lib/notes'
import type { Branch, GithubData, Pr } from '../lib/ghboard'
import type { LocalData, LocalRepo } from '../lib/local'
import type { FlatLink, Health, InfoGroup, InfoItem, RepoItem, ReposConfig } from '../types'
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
      />
    </div>
  )
}
