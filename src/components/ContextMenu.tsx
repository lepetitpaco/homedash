import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export type MenuChip = { label: string; color?: string; onSelect: () => void }

export type MenuItem =
  | { sep: true }
  /** Intertitre d'une section (« Ouvrir », « Texte »…). */
  | { sep?: false; heading: string }
  /** Une action déclinée en pastilles sur une ligne (onglet éphémère : un compte par pastille). */
  | { sep?: false; label: string; icon?: ReactNode; chips: MenuChip[] }
  | {
      sep?: false
      label: string
      hint?: string
      /** Icône devant le libellé. */
      icon?: ReactNode
      /** Pastille de couleur après le libellé (compte de l'onglet cible), avec `hint` pour texte. */
      dot?: string
      danger?: boolean
      disabled?: boolean
      onSelect: () => void
    }

export type MenuState = {
  x: number
  y: number
  title?: string
  items: MenuItem[]
}

type Props = {
  state: MenuState | null
  onClose: () => void
}

export default function ContextMenu({ state, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  // Repositionne le menu pour qu'il reste dans la fenêtre.
  useLayoutEffect(() => {
    if (!state || !ref.current) return
    const { offsetWidth: w, offsetHeight: h } = ref.current
    setPos({
      x: Math.min(state.x, Math.max(8, window.innerWidth - w - 8)),
      y: Math.min(state.y, Math.max(8, window.innerHeight - h - 8)),
    })
  }, [state])

  useEffect(() => {
    if (!state) return
    const close = () => onClose()
    // Un pointerdown DANS le menu doit être ignoré : fermer ici démonterait le
    // bouton avant que son click ne se déclenche, et l'action serait perdue.
    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof Node && ref.current?.contains(e.target)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', close)
    }
  }, [state, onClose])

  if (!state) return null

  return (
    <div
      className="ctx"
      ref={ref}
      style={{ left: pos.x, top: pos.y }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {state.title ? <div className="ctx-title">{state.title}</div> : null}
      {state.items.map((item, i) =>
        item.sep ? (
          <div className="ctx-sep" key={i} />
        ) : 'heading' in item ? (
          <div className="ctx-heading" key={i}>
            {item.heading}
          </div>
        ) : 'chips' in item ? (
          <div className="ctx-item ctx-chips" key={i}>
            {item.icon !== undefined ? <span className="ctx-icon">{item.icon}</span> : null}
            <span>{item.label}</span>
            <span className="ctx-chip-row">
              {item.chips.map((c) => (
                <button
                  key={c.label}
                  className="ctx-chip"
                  style={c.color ? { ['--c' as string]: c.color } : undefined}
                  onClick={() => {
                    onClose()
                    c.onSelect()
                  }}
                >
                  {c.color ? <i className="ctx-dot" /> : null}
                  {c.label}
                </button>
              ))}
            </span>
          </div>
        ) : (
          <button
            key={i}
            className={`ctx-item${item.danger ? ' is-danger' : ''}`}
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose()
              item.onSelect()
            }}
          >
            {item.icon !== undefined ? <span className="ctx-icon">{item.icon}</span> : null}
            <span>{item.label}</span>
            {item.dot ? (
              <em className="ctx-tag" style={{ ['--c' as string]: item.dot }}>
                <i className="ctx-dot" />
                {item.hint}
              </em>
            ) : item.hint ? (
              <em>{item.hint}</em>
            ) : null}
          </button>
        ),
      )}
    </div>
  )
}
