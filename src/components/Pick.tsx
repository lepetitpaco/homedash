import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type PickOption = {
  value: string
  label: string
  /** Pastille de couleur devant le libellé (compte, dossier). */
  color?: string
  hint?: string
}

/**
 * Liste de choix aux couleurs de homedash, à la place d'un <select> du
 * système : pastilles de couleur, et une action en bas (« ＋ nouveau… »).
 *
 * Le menu est rendu dans <body>, en position fixe sous le bouton (au-dessus
 * s'il manque de place) : rien ne le coupe, ni un cadre en `overflow: hidden`
 * ni la barre « Enregistrer » collée en bas.
 */
export default function Pick({
  value,
  options,
  onChange,
  action,
  title,
}: {
  value: string
  options: PickOption[]
  onChange: (value: string) => void
  /** Dernière ligne, séparée : créer un compte, un dossier… */
  action?: { label: string; onSelect: () => void }
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; minWidth: number } | null>(null)
  const close = useCallback(() => setOpen(false), [])
  const cur = options.find((o) => o.value === value) ?? options[0]

  // Place le menu sous le bouton, ou au-dessus s'il déborderait de la fenêtre.
  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const place = () => {
      const r = btn.current!.getBoundingClientRect()
      const h = menu.current?.offsetHeight ?? 0
      const below = r.bottom + 4 + h <= window.innerHeight - 8
      setPos({ left: r.left, top: below ? r.bottom + 4 : Math.max(8, r.top - 4 - h), minWidth: r.width })
    }
    place()
    // la page défile ou change de taille : le menu suivrait mal, on le ferme
    // (mais défiler dans le menu lui-même, non)
    const onScroll = (e: Event) => !menu.current?.contains(e.target as Node) && close()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!menu.current?.contains(t) && !btn.current?.contains(t)) close()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  return (
    <span
      className="pick"
      // Échap ferme le menu, pas la fenêtre qui le contient (l'événement remonte
      // jusqu'à elle, portail compris)
      onKeyDown={(e) => {
        if (open && e.key === 'Escape') {
          e.stopPropagation()
          close()
        }
      }}
    >
      <button
        ref={btn}
        type="button"
        className={`pick-btn${open ? ' is-open' : ''}`}
        onClick={() => {
          setPos(null)
          setOpen(!open)
        }}
        title={title}
      >
        {cur?.color ? <span className="pick-dot" style={{ background: cur.color }} /> : null}
        <span className="pick-label">{cur?.label}</span>
        <span className="pick-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open
        ? createPortal(
        <span
          ref={menu}
          className="pick-menu"
          role="listbox"
          // invisible le temps de mesurer sa hauteur, puis placé
          style={pos ? { left: pos.left, top: pos.top, minWidth: pos.minWidth } : { visibility: 'hidden', left: 0, top: 0 }}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`pick-item${o.value === value ? ' is-on' : ''}`}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
            >
              {o.color ? <span className="pick-dot" style={{ background: o.color }} /> : <span className="pick-dot is-none" />}
              <span>{o.label}</span>
              {o.hint ? <em>{o.hint}</em> : null}
            </button>
          ))}
          {action ? (
            <>
              <span className="pick-sep" />
              <button
                type="button"
                className="pick-item pick-action"
                onClick={() => {
                  setOpen(false)
                  action.onSelect()
                }}
              >
                {action.label}
              </button>
            </>
          ) : null}
        </span>,
            document.body,
          )
        : null}
    </span>
  )
}
