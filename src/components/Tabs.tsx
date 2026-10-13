export type TabId = 'links' | 'github' | 'events' | 'local' | 'settings'

export type Tab = {
  id: TabId
  icon: string
  label: string
  /** Compteur d'actions en attente, affiché en pastille. 0 ou absent = rien. */
  badge?: number
  badgeTitle?: string
}

export default function Tabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: Tab[]
  active: TabId
  onSelect: (id: TabId) => void
}) {
  return (
    <nav className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === active}
          className={`tab${t.id === active ? ' is-active' : ''}`}
          onClick={() => onSelect(t.id)}
        >
          <span aria-hidden="true">{t.icon}</span>
          {t.label}
          {t.badge ? (
            <span className="tab-badge" title={t.badgeTitle}>
              {t.badge}
            </span>
          ) : null}
        </button>
      ))}
    </nav>
  )
}
