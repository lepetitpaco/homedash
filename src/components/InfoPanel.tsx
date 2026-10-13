import { useState } from 'react'
import type { InfoRef } from '../lib/mutate'
import type { InfosConfig } from '../types'

type Props = {
  infos: InfosConfig
  /** Clic droit sur une info, sur un titre de groupe ; bouton ＋ de l'en-tête. */
  onContextItem: (e: React.MouseEvent, ref: InfoRef) => void
  onContextGroup: (e: React.MouseEvent, index: number) => void
  onAdd: (e: React.MouseEvent) => void
}

/**
 * Valeurs à copier d'un clic. Tout s'édite comme les liens : clic droit sur une
 * ligne ou un titre de groupe, ou le ＋ de l'en-tête.
 */
export default function InfoPanel({ infos, onContextItem, onContextGroup, onAdd }: Props) {
  // Volontairement non persisté : au prochain chargement, les secrets sont masqués.
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1400)
    } catch {
      setCopied(null)
    }
  }

  const hasSecret = infos.groups.some((g) => g.items.some((i) => i.secret))

  return (
    <section className="card info-card" style={{ ['--accent' as string]: infos.color ?? '#38bdf8' }}>
      <header className="group-head" onContextMenu={onAdd}>
        <div className="group-toggle static">
          <span className="group-icon" aria-hidden="true">
            {infos.icon}
          </span>
          <h2 className="group-title">{infos.title}</h2>
          {hasSecret ? (
            <button className="reveal-btn" onClick={() => setRevealed((r) => !r)}>
              {revealed ? infos.hideLabel : infos.revealLabel}
            </button>
          ) : null}
          <button className="reveal-btn info-add" onClick={onAdd} title="Ajouter une info ou un groupe">
            ＋
          </button>
        </div>
      </header>
      <div className="info-body">
        {infos.groups.map((group, gi) => (
          <div
            className="info-group"
            key={gi}
            style={{ ['--accent' as string]: group.color ?? infos.color ?? '#8b93a3' }}
          >
            <div
              className="info-group-title"
              onContextMenu={(e) => onContextGroup(e, gi)}
              title="Clic droit : ajouter, modifier, supprimer"
            >
              <span aria-hidden="true">{group.icon}</span> {group.title}
            </div>
            {group.items.length === 0 ? (
              <button className="info-empty" onClick={(e) => onContextGroup(e, gi)}>
                ＋ ajouter une info
              </button>
            ) : null}
            {group.items.map((item, ii) => {
              const key = `${gi}:${ii}`
              const masked = item.secret && !revealed
              return (
                <button
                  className="info-row"
                  key={key}
                  onClick={() => void copy(key, item.value)}
                  onContextMenu={(e) => onContextItem(e, { group: gi, index: ii })}
                  title={`Copier ${item.label} — clic droit pour modifier`}
                >
                  <span className="info-label">
                    {item.label}
                    {item.note ? <em className="info-note">{item.note}</em> : null}
                  </span>
                  <span className={`info-value${masked ? ' is-masked' : ''}`}>
                    {copied === key ? '✓ copié' : masked ? '••••••••' : item.value}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}
