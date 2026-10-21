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
  hasChecks: boolean
  onRefresh: () => void
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
  hasChecks,
  onRefresh,
  bell,
  version,
  site = false,
}: Props) {
  const now = useClock(showClock)
  const spinRef = useRef<HTMLButtonElement>(null)
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
        <span className="search-icon" aria-hidden="true">
          ⌕
        </span>
        <input
          ref={searchRef}
          className="search"
          type="search"
          value={query}
          placeholder={placeholder}
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
        {hasChecks ? (
          <button
            className="icon-btn"
            ref={spinRef}
            onClick={() => {
              spinRef.current?.classList.remove('spin')
              void spinRef.current?.offsetWidth
              spinRef.current?.classList.add('spin')
              onRefresh()
            }}
            title="Re-tester les liens surveillés"
            aria-label="Re-tester les liens surveillés"
          >
            ⟳
          </button>
        ) : null}
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
