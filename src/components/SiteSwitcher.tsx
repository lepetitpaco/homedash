import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type SwitcherSite = {
  key: string
  label: string
  icon: ReactNode
  /** Adresse courte, sous le nom. */
  host?: string
  unread?: number
  asleep?: boolean
  session?: { name: string; color: string }
}

/** La fenêtre de Ctrl+Tab : affichée tant que Ctrl reste appuyé. */
export default function SiteSwitcher({
  sites,
  index,
  onHover,
  onPick,
}: {
  sites: SwitcherSite[]
  index: number
  onHover: (index: number) => void
  onPick: (index: number) => void
}) {
  const on = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    on.current?.scrollIntoView({ block: 'nearest' })
  }, [index])
  const current = sites[index]
  return createPortal(
    <div className="site-switcher-back">
      <div className="site-switcher" role="listbox" aria-label="Changer de site">
        <header className="site-switcher-head">
          <strong>{current?.label}</strong>
          {current?.host ? <span>{current.host}</span> : null}
        </header>
        <div className="site-switcher-grid">
          {sites.map((s, i) => (
            <button
              key={s.key}
              ref={i === index ? on : undefined}
              type="button"
              className={`site-switcher-tile${i === index ? ' is-on' : ''}${s.asleep ? ' is-asleep' : ''}`}
              role="option"
              aria-selected={i === index}
              // Vrai mouvement seulement : une souris immobile sous la fenêtre ne change pas le choix.
              onMouseMove={(e) => {
                if ((e.movementX || e.movementY) && i !== index) onHover(i)
              }}
              onClick={() => onPick(i)}
            >
              {i < 9 ? <kbd className="site-switcher-digit">{i + 1}</kbd> : null}
              <span className="site-switcher-icon" style={s.session ? { boxShadow: `0 0 0 3px ${s.session.color}` } : undefined}>
                {s.icon}
                {s.unread ? <span className="site-switcher-badge">{s.unread > 99 ? '99+' : s.unread}</span> : null}
              </span>
              <span className="site-switcher-name">{s.label}</span>
              {s.asleep || s.session ? <span className="site-switcher-sub">{s.asleep ? '💤 en veille' : s.session?.name}</span> : null}
            </button>
          ))}
        </div>
        <footer className="site-switcher-foot">
          <span><kbd>Tab</kbd> <kbd>Maj+Tab</kbd> choisir</span>
          <span><kbd>1</kbd>–<kbd>9</kbd> ouvrir direct</span>
          <span>Relâcher <kbd>Ctrl</kbd> ou clic : ouvrir</span>
          <span><kbd>Échap</kbd> rester ici</span>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
