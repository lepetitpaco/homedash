import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export type MenuItem =
  | { sep: true }
  | {
      sep?: false
      label: string
      hint?: string
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
          <div className="ctx-sep" key={`sep${i}`} />
        ) : (
          <button
            key={item.label}
            className={`ctx-item${item.danger ? ' is-danger' : ''}`}
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose()
              item.onSelect()
            }}
          >
            <span>{item.label}</span>
            {item.hint ? <em>{item.hint}</em> : null}
          </button>
        ),
      )}
    </div>
  )
}
