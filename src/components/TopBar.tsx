import { useEffect, useRef, useState } from 'react'

type Props = {
  query: string
  onQuery: (q: string) => void
  placeholder: string
  showClock: boolean
  theme: 'dark' | 'light'
  onTheme: () => void
  searchRef: React.RefObject<HTMLInputElement | null>
  resultCount: number | null
  /** Où cherche la barre (issue #38) : son icône, son nom, `null` = partout ; clic = le menu des portées. */
  scope?: { icon: string; label: string | null; onPick: (e: React.MouseEvent) => void }
  /** « Tout actualiser » : GitHub, Basecamp, Local, la cloche, les non-lus des sites. */
  onRefresh: () => void
  /** Actualisation en cours : la flèche tourne. */
  refreshing?: boolean
  /** Cloche du journal, posée à gauche des boutons. */
  bell?: React.ReactNode
  /** Version installée / mise à jour disponible. */
  version?: React.ReactNode
  /** Un site est affiché (barre de gauche) : son en-tête prend la place du logo. */
  site?: boolean
}

/** Où CustomTabView place l'en-tête du site affiché (une rangée de moins). */
export const TOPBAR_SITE_SLOT = 'topbar-site'

function useClock(enabled: boolean) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(id)
  }, [enabled])
  return now
}

export default function TopBar({
  query,
  onQuery,
  placeholder,
  showClock,
  theme,
  onTheme,
  searchRef,
  resultCount,
  scope,
  onRefresh,
  refreshing = false,
  bell,
  version,
  site = false,
}: Props) {
  const now = useClock(showClock)
  const barRef = useRef<HTMLElement>(null)
  const [stuck, setStuck] = useState(false)

  // Hauteur publiée pour les autres éléments collants (elle change quand la
  // barre passe sur deux lignes en écran étroit), et liseré dès qu'on défile.
  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const ro = new ResizeObserver(() =>
      document.documentElement.style.setProperty('--topbar-h', `${bar.offsetHeight}px`),
    )
    ro.observe(bar)
    const onScroll = () => setStuck(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const date = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <header className={`topbar${stuck ? ' is-stuck' : ''}${site ? ' is-site' : ''}`} ref={barRef}>
      {site ? <div className="topbar-site" id={TOPBAR_SITE_SLOT} /> : null}

      <div className="search-wrap">
        {scope ? (
          <button
            type="button"
            className={`search-scope${scope.label ? ' is-on' : ''}`}
            onClick={scope.onPick}
            title={scope.label ? `Recherche limitée à ${scope.label} : clic pour changer` : 'Chercher partout : clic pour limiter'}
            aria-label={scope.label ? `Recherche limitée à ${scope.label}` : 'Où chercher'}
          >
            {scope.icon}
          </button>
        ) : (
          <span className="search-icon" aria-hidden="true">
            ⌕
          </span>
        )}
        <input
          ref={searchRef}
          className="search"
          type="search"
          value={query}
          placeholder={scope?.label ? `Rechercher dans ${scope.label}…` : placeholder}
          autoComplete="off"
          spellCheck={false}
          aria-label="Rechercher"
          onChange={(e) => onQuery(e.target.value)}
        />
        {resultCount !== null ? <span className="search-count">{resultCount}</span> : null}
      </div>

      <div className="topbar-right">
        {showClock ? (
          <div className="clock">
            <strong>{time}</strong>
            <em>{date}</em>
          </div>
        ) : null}
        {version}
        {bell}
        <button
          className={`icon-btn${refreshing ? ' is-spinning' : ''}`}
          onClick={onRefresh}
          disabled={refreshing}
          title="Tout actualiser : GitHub, Basecamp, dépôts locaux, la cloche et les non-lus des sites (ceux en veille sont réveillés)"
          aria-label="Tout actualiser"
        >
          ⟳
        </button>
        <button
          className="icon-btn"
          onClick={onTheme}
          title="Changer de thème"
          aria-label="Changer de thème"
        >
          {theme === 'dark' ? '☾' : '☀'}
        </button>
      </div>
    </header>
  )
}
