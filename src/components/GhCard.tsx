import type { ReactNode } from 'react'
import type { Ci, Gate } from '../lib/ghboard'

/** Coquille commune aux cartes GitHub : reprend l'entête des cartes homedash. */
export function GhCard({
  icon,
  title,
  count,
  color,
  building,
  actions,
  onRefresh,
  refreshTitle,
  children,
}: {
  icon: string
  title: string
  count?: number
  color: string
  building?: boolean
  actions?: ReactNode
  /** Rafraîchit cette seule section (↻ de la carte). */
  onRefresh?: () => void
  /** Infobulle du ↻, quand il ne rafraîchit pas que cette carte. */
  refreshTitle?: string
  children: ReactNode
}) {
  return (
    <section
      className={`card gh-card${building ? ' is-busy' : ''}`}
      style={{ ['--accent' as string]: color }}
    >
      <header className="group-head">
        <div className="group-toggle static">
          <span className="group-icon" aria-hidden="true">
            {icon}
          </span>
          <h2 className="group-title">{title}</h2>
          {actions}
          {count !== undefined ? <span className="group-count">{count}</span> : null}
          {onRefresh ? (
            <button
              className={`gh-card-refresh${building ? ' is-busy' : ''}`}
              title={
                building
                  ? 'Rafraîchissement en cours…'
                  : (refreshTitle ?? 'Rafraîchir cette carte')
              }
              onClick={onRefresh}
            >
              ↻
            </button>
          ) : null}
        </div>
      </header>
      <div className="gh-body">{children}</div>
    </section>
  )
}

/** Un seul badge par PR : le détail des checks passe en infobulle. */
export function CiBadge({ ci, url }: { ci: Ci; url?: string }) {
  const detail = ci.checks.length
    ? ci.checks.map((c) => `${c.icon} ${c.name}`).join('\n')
    : 'Aucun check'
  const cls = `gh-badge is-${ci.state}`
  if (url && ci.checks.length) {
    return (
      <a className={cls} title={detail} href={`${url}/checks`} target="_blank" rel="noreferrer">
        {ci.label}
      </a>
    )
  }
  return (
    <span className={cls} title={detail}>
      {ci.label}
    </span>
  )
}

export function GateBanner({ gate }: { gate: Gate }) {
  return (
    <div className={`gh-gate is-${gate.cls}`}>
      <span className="gh-gate-icon" aria-hidden="true">
        {gate.icon}
      </span>
      <div>
        <div className="gh-gate-title">{gate.title}</div>
        <div className="gh-gate-detail">{gate.detail}</div>
      </div>
    </div>
  )
}

export function GhEmpty({ children }: { children: ReactNode }) {
  return <p className="gh-empty">{children}</p>
}

/** Ligne générique : pastille repo, contenu tronqué, statut à droite. */
export function GhRow({
  repo,
  children,
  right,
  className,
}: {
  repo: string
  children: ReactNode
  right?: ReactNode
  className?: string
}) {
  return (
    <div className={`gh-row${className ? ` ${className}` : ''}`}>
      <span className="gh-repo" title={repo}>
        {repo}
      </span>
      <div className="gh-main">{children}</div>
      {right ? <div className="gh-right">{right}</div> : null}
    </div>
  )
}

/**
 * Regroupe les éléments qui partagent un nom de branche d'un repo à l'autre :
 * c'est en général un même chantier découpé en plusieurs dépôts, à merger
 * ensemble. L'ordre d'origine est conservé ; un groupe prend la place de son
 * premier membre. Sans nom de branche, un élément reste seul.
 */
export function groupByBranch<T>(items: T[], branchOf: (t: T) => string | undefined): T[][] {
  const groups: T[][] = []
  const byBranch = new Map<string, T[]>()
  for (const it of items) {
    const name = branchOf(it)
    const g = name ? byBranch.get(name) : undefined
    if (g) {
      g.push(it)
      continue
    }
    const fresh = [it]
    groups.push(fresh)
    if (name) byBranch.set(name, fresh)
  }
  return groups
}

/** Enveloppe d'un groupe « même branche, plusieurs repos ». */
export function BranchGroup({
  branch,
  summary,
  children,
}: {
  branch: string
  summary: ReactNode
  children: ReactNode
}) {
  return (
    <div className="gh-prgroup">
      <div className="gh-prgroup-head" title="Même branche dans plusieurs repos : à merger ensemble">
        <span aria-hidden="true">🔗</span>
        <span className="gh-branch-inline">{branch}</span>
        <span className="gh-prgroup-count">{summary}</span>
      </div>
      {children}
    </div>
  )
}
