import { useEffect, useRef } from 'react'

/**
 * Pied de page collé en bas de l'écran. Sa hauteur est publiée dans
 * --footer-h pour que les autres éléments collés en bas (la barre
 * « Enregistrer » de Réglages) se posent au-dessus au lieu d'être recouverts.
 */
export default function Footer({ count }: { count: number }) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement
    const ro = new ResizeObserver(() => root.style.setProperty('--footer-h', `${el.offsetHeight}px`))
    ro.observe(el)
    return () => {
      ro.disconnect()
      root.style.removeProperty('--footer-h')
    }
  }, [])

  return (
    <footer className="footer" ref={ref}>
      <span>
        <kbd>/</kbd> ou <kbd>⌘K</kbd> rechercher
      </span>
      <span>
        <kbd>↑</kbd>
        <kbd>↓</kbd> naviguer
      </span>
      <span>
        <kbd>↵</kbd> ouvrir / copier
      </span>
      <span>clic droit : modifier</span>
      <span className="footer-right">{count} liens</span>
    </footer>
  )
}
