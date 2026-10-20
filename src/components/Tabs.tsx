export type TabId = 'links' | 'github' | 'basecamp' | 'events' | 'local' | 'settings'

export type Tab = {
  id: TabId
  icon: string
  label: string
  /** Compteur d'actions en attente, affiché en pastille. 0 ou absent = rien. */
  badge?: number
  badgeTitle?: string
  /** Onglets voisins du même groupe = un « duo » : un seul bloc, deux moitiés cliquables. */
  group?: { id: string; title: string }
}

function TabButton({ t, active, onSelect }: { t: Tab; active: boolean; onSelect: (id: TabId) => void }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      className={`tab${active ? ' is-active' : ''}`}
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
  )
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
  // Onglets voisins d'un même groupe rassemblés dans un seul bloc.
  const runs: Tab[][] = []
  for (const t of tabs) {
    const last = runs[runs.length - 1]
    if (t.group && last?.[0].group?.id === t.group.id) last.push(t)
    else runs.push([t])
  }
  return (
    <nav className="tabs" role="tablist">
      {runs.map((run) =>
        run.length > 1 && run[0].group ? (
          <div
            key={run[0].group.id}
            className={`tab-duo${run.some((t) => t.id === active) ? ' is-active' : ''}`}
            title={run[0].group.title}
          >
            {run.map((t, i) => (
              <span key={t.id} className="tab-duo-part">
                {i ? (
                  <span className="tab-duo-link" aria-hidden="true">
                    ⇄
                  </span>
                ) : null}
                <TabButton t={t} active={t.id === active} onSelect={onSelect} />
              </span>
            ))}
          </div>
        ) : (
          <TabButton key={run[0].id} t={run[0]} active={run[0].id === active} onSelect={onSelect} />
        ),
      )}
    </nav>
  )
}
