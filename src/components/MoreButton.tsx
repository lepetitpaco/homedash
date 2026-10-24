/**
 * « ⋯ » au survol : le même menu que le clic droit. Beaucoup d'actions
 * (modifier, dupliquer, garder…) n'existaient qu'au clic droit, sans rien qui le
 * dise (issue #60). Un `span` plutôt qu'un bouton : il vit dans un lien.
 */
export default function MoreButton({ onMenu, label = 'Plus d’actions' }: { onMenu: (e: React.MouseEvent) => void; label?: string }) {
  return (
    <span
      className="more-btn"
      role="button"
      aria-label={label}
      title={`${label} (aussi au clic droit)`}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onMenu(e)
      }}
    >
      ⋯
    </span>
  )
}
