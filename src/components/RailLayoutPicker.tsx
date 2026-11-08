import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDismiss } from '../hooks/useDismiss'
import BarLayoutForm, { type Bars } from './BarLayoutForm'

/** « Disposition et taille… » : les choix des barres dans une fenêtre flottante, appliqués en direct. */
export default function RailLayoutPicker({ x, y, bars, onClose }: { x: number; y: number; bars: Bars; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  useDismiss(true, box, onClose)
  // Placé d'après sa vraie hauteur (elle change avec le mode choisi) : jamais sous le bas de l'écran.
  const [posY, setPosY] = useState(Math.max(8, y))
  useLayoutEffect(() => {
    const h = box.current?.offsetHeight ?? 0
    setPosY(Math.max(8, Math.min(y, window.innerHeight - h - 8)))
  })
  return createPortal(
    <div
      ref={box}
      className="rail-picker"
      role="dialog"
      aria-label="Disposition et taille"
      style={{ left: Math.max(8, Math.min(x, window.innerWidth - 360)), top: posY }}
    >
      <BarLayoutForm bars={bars} />
    </div>,
    document.body,
  )
}
