import { useState } from 'react'
import type { InfosConfig } from '../types'

type Props = { infos: InfosConfig }

export default function InfoPanel({ infos }: Props) {
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
      <header className="group-head">
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
        </div>
      </header>
      <div className="info-body">
        {infos.groups.map((group) => (
          <div
            className="info-group"
            key={group.title}
            style={{ ['--accent' as string]: group.color ?? infos.color ?? '#8b93a3' }}
          >
            <div className="info-group-title">
              <span aria-hidden="true">{group.icon}</span> {group.title}
            </div>
            {group.items.map((item) => {
              const key = `${group.title}:${item.label}`
              const masked = item.secret && !revealed
              return (
                <button
                  className="info-row"
                  key={key}
                  onClick={() => void copy(key, item.value)}
                  title={`Copier ${item.label}`}
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
