import { noteTitle, notePreview, type Note } from '../lib/notes'
import type { FlatLink, Health, InfoGroup, InfoItem } from '../types'
import Favicon from './Favicon'

export type Hit =
  | { kind: 'link'; key: string; link: FlatLink }
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

  return (
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
  )
}
