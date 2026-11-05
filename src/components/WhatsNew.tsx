import { useEffect, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { isMac } from '../lib/keys'
import { withKeys, type WhatsNewCard, type WhatsNewVersion } from '../lib/whatsNew'

/**
 * « Quoi de neuf » : une carte par nouveauté, la capture quand il y en a une, et « Essayer » qui mène au bon endroit.
 * Ouverte une fois après une mise à jour (App), puis à la demande (bouton de version, page Nouveautés).
 * Échap, ✕, le fond ou un « Essayer » la ferment.
 */
export default function WhatsNew({
  versions,
  from,
  onGo,
  onClose,
}: {
  versions: WhatsNewVersion[]
  /** Version d'avant la mise à jour, s'il y en a une. */
  from: string | null
  onGo: (go: NonNullable<WhatsNewCard['go']>) => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!versions.length) return null
  const latest = versions[0].version
  const several = versions.length > 1

  // Portée dans <body> : la barre du haut a un backdrop-filter (CLAUDE.md, Front).
  return createPortal(
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wn" role="dialog" aria-modal="true" aria-labelledby="wn-title">
        <header className="wn-head">
          <div>
            <p className="wn-kicker">✨ Quoi de neuf</p>
            <h2 id="wn-title">homedash {latest}</h2>
            <p className="wn-sub">
              {from ? `Ce qui a changé depuis la ${from}. ` : ''}
              Tout le détail : le numéro de version, en haut à droite.
            </p>
          </div>
          <button className="wn-close" onClick={onClose} title="Fermer (Échap)" aria-label="Fermer">
            ✕
          </button>
        </header>

        <div className="wn-body">
          {versions.map((v) => (
            <section key={v.version} className="wn-version">
              {several ? <h3 className="wn-version-title">{v.version}</h3> : null}
              <div className="wn-grid">
                {v.cards.map((c) => (
                  <article key={c.id} className={`wn-card${c.image ? ' has-image' : ''}`}>
                    {c.image ? (
                      <img className="wn-shot" src={c.image} alt="" loading="lazy" style={c.imageCrop ? ({ objectViewBox: `inset(${c.imageCrop})` } as CSSProperties) : undefined} />
                    ) : null}
                    <div className="wn-card-main">
                      <span className="wn-icon" aria-hidden="true">
                        {c.icon}
                      </span>
                      <div className="wn-card-text">
                        <h4>{c.title}</h4>
                        <p>{withKeys(c.text, isMac)}</p>
                        {c.go ? (
                          <button className="wn-try" onClick={() => onGo(c.go!)}>
                            Essayer →
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="modal-foot">
          <span className="modal-hint">Pour la revoir : clic sur le numéro de version</span>
          <button className="btn btn-primary" onClick={onClose} autoFocus>
            C'est parti
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
