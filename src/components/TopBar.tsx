import { useEffect, useRef, useState } from 'react'

type Props = {
  title: string
  subtitle?: string
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
  onAddGroup: () => void
  /** Cloche du journal, posée à gauche des boutons. */
  bell?: React.ReactNode
}

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
  title,
  subtitle,
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
  onAddGroup,
  bell,
}: Props) {
  const now = useClock(showClock)
  const spinRef = useRef<HTMLButtonElement>(null)

  const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const date = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo" aria-hidden="true">
          ⚡
        </span>
        <span className="brand-text">
          <strong>{title}</strong>
          {subtitle ? <em>{subtitle}</em> : null}
        </span>
      </div>

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
          onClick={onAddGroup}
          title="Nouvelle catégorie"
          aria-label="Nouvelle catégorie"
        >
          ＋
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
