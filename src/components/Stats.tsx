import type { Usage } from '../lib/usage'
import type { FlatLink, StatsConfig } from '../types'

type Props = {
  config: StatsConfig
  links: FlatLink[]
  usage: Usage
  onOpen: (link: FlatLink) => void
  onReset: () => void
}

/**
 * Comparaison de magnitudes sur quelques items : barres horizontales, une seule
 * teinte (la magnitude n'est pas une identité), valeur en label direct. La
 * couleur de la catégorie est portée par une pastille à côté du nom, pas par la
 * barre — sinon la teinte encoderait deux choses à la fois.
 */
export default function Stats({ config, links, usage, onOpen, onReset }: Props) {
  const rows = links
    .map((link) => ({ link, count: usage[link.id]?.count ?? 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count || a.link.name.localeCompare(b.link.name))
    .slice(0, config.count ?? 6)

  const total = Object.values(usage).reduce((sum, u) => sum + u.count, 0)
  const tracked = Object.keys(usage).length
  const max = rows[0]?.count ?? 1

  return (
    <section className="card stats-card" style={{ ['--accent' as string]: config.color ?? '#60a5fa' }}>
      <header className="group-head">
        <div className="group-toggle static">
          <span className="group-icon" aria-hidden="true">
            {config.icon}
          </span>
          <h2 className="group-title">{config.title}</h2>
          {total > 0 ? (
            <button className="reveal-btn" onClick={onReset} title="Remettre les compteurs à zéro">
              raz
            </button>
          ) : null}
        </div>
      </header>

      <div className="stats-body">
        {total === 0 ? (
          <p className="stats-empty">
            Aucune ouverture enregistrée pour l'instant — les tuiles du haut se rempliront au fur et à
            mesure.
          </p>
        ) : (
          <>
            <div className="stats-hero">
              <strong>{total}</strong>
              <span>
                ouverture{total > 1 ? 's' : ''} · {tracked} lien{tracked > 1 ? 's' : ''}
              </span>
            </div>

            <ol className="stats-list">
              {rows.map(({ link, count }) => (
                <li className="stat-row" key={link.id}>
                  <a
                    className="stat-link"
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    title={`${link.name} — ${count} ouverture${count > 1 ? 's' : ''} · ${link.group}`}
                    onClick={() => onOpen(link)}
                  >
                    <span className="stat-head">
                      <span className="stat-dot" style={{ background: link.color }} aria-hidden="true" />
                      <span className="stat-name">{link.name}</span>
                      <span className="stat-count">{count}</span>
                    </span>
                    <span className="stat-track">
                      <span className="stat-bar" style={{ width: `${Math.max(4, (count / max) * 100)}%` }} />
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </section>
  )
}
