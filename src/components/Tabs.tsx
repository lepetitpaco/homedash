/** `x:<id>` = onglet perso (`config.tabs`). */
export type TabId = 'links' | 'github' | 'basecamp' | 'events' | 'local' | 'settings' | `x:${string}`

export type Tab = {
  id: TabId
  /** Emoji, ou une image (icône d'un site pour un onglet perso). */
  icon: React.ReactNode
  label: string
  /** Compteur d'actions en attente, affiché en pastille. 0 ou absent = rien. */
  badge?: number
  badgeTitle?: string
  /** Pastille rouge (non-lus) plutôt que verte (ménage à faire). */
  badgeAlert?: boolean
  /** Compte de connexion d'un onglet perso : trait et lettre à sa couleur. */
  session?: { name: string; color: string }
  /** Onglets voisins du même groupe = un « duo » : un seul bloc, deux moitiés cliquables. */
  group?: { id: string; title: string }
  /** Onglet perso « ouvrir à part » : un lien vers `href`, pas une vue de la page. */
  href?: string
  title?: string
}

function TabButton({ t, active, onSelect }: { t: Tab; active: boolean; onSelect: (id: TabId) => void }) {
  const inner = (
    <>
      <span aria-hidden="true">{t.icon}</span>
      {t.label}
      {t.session ? (
        <span className="tab-session" title={`compte ${t.session.name}`}>
          {t.session.name.trim().charAt(0).toUpperCase()}
        </span>
      ) : null}
      {t.href ? (
        <span className="tab-out" aria-hidden="true">
          ↗
        </span>
      ) : null}
      {t.badge ? (
        <span className={`tab-badge${t.badgeAlert ? ' is-alert' : ''}`} title={t.badgeTitle}>
          {t.badge > 99 ? '99+' : t.badge}
        </span>
      ) : null}
    </>
  )
  // Ouvert à part : un vrai lien (clic milieu, ⌘-clic, glisser fonctionnent).
  if (t.href) {
    return (
      <a
        className={`tab${t.session ? ' has-session' : ''}`}
        style={t.session ? { ['--session' as string]: t.session.color } : undefined}
        href={t.href}
        target="_blank"
        rel="noreferrer"
        title={t.title ?? t.href}
      >
        {inner}
      </a>
    )
  }
  return (
    <button
      role="tab"
      aria-selected={active}
      className={`tab${active ? ' is-active' : ''}${t.session ? ' has-session' : ''}`}
      style={t.session ? { ['--session' as string]: t.session.color } : undefined}
      onClick={() => onSelect(t.id)}
      title={t.session ? `${t.title ?? t.label} · compte ${t.session.name}` : t.title}
    >
      {inner}
    </button>
  )
}

export default function Tabs({
  tabs,
  active,
  onSelect,
  onAdd,
}: {
  tabs: Tab[]
  active: TabId
  onSelect: (id: TabId) => void
  /** ＋ en bout de barre : ajouter un onglet perso. */
  onAdd?: () => void
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
      {onAdd ? (
        <button className="tab tab-add" onClick={onAdd} title="Ajouter un onglet : un site ou un fichier du disque">
          ＋
        </button>
      ) : null}
    </nav>
  )
}
