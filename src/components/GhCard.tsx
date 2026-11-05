import { useState, type ReactNode } from 'react'
import { desktop } from '../lib/desktop'
import type { Ci, Gate } from '../lib/ghboard'
import { getGroupOpener, linksToOpen, openAll } from '../lib/openTabs'

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
/** Hors appli (page dans un navigateur) : `window.open`, `false` si la fenêtre surgissante a été bloquée. */
function openInBrowserWindow(url: string): boolean {
  const w = window.open(url, '_blank')
  if (!w) return false
  try {
    w.opener = null
  } catch {
    /* fenêtre d'un autre site : rien à couper */
  }
  return true
}

export function BranchGroup({
  branch,
  summary,
  links,
  linksLabel = 'PR',
  children,
}: {
  branch: string
  summary: ReactNode
  /** Liens des lignes du groupe, ouverts d'un coup par le bouton ↗ (issue #127). */
  links?: readonly (string | null | undefined)[]
  /** Ce qu'ouvre le bouton, pour sa bulle : « PR », « PR ou branches »… */
  linksLabel?: string
  children: ReactNode
}) {
  const [blocked, setBlocked] = useState(0)
  const toOpen = linksToOpen(links ?? [])
  const openGroup = (e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }) => {
    const inApp = desktop ? getGroupOpener() : null
    if (inApp) {
      inApp(toOpen, e.metaKey || e.ctrlKey || e.shiftKey)
      setBlocked(0)
      return
    }
    setBlocked(openAll(toOpen, openInBrowserWindow).blocked.length)
  }
  return (
    <div className="gh-prgroup">
      <div className="gh-prgroup-head" title="Même branche dans plusieurs repos : à merger ensemble">
        <span aria-hidden="true">🔗</span>
        <span className="gh-branch-inline">{branch}</span>
        {toOpen.length > 1 ? (
          <button
            type="button"
            className="gh-prgroup-open"
            onClick={openGroup}
            title={`Ouvrir les ${toOpen.length} ${linksLabel} de cette branche, une par onglet${desktop ? ' · ⌘clic : l’inverse du réglage des liens (appli ↔ navigateur)' : ''}`}
          >
            ↗ ouvrir les {toOpen.length}
          </button>
        ) : null}
        <span className="gh-prgroup-count">{summary}</span>
      </div>
      {blocked > 0 ? (
        <div className="gh-prgroup-blocked" role="status">
          {blocked} onglet{blocked > 1 ? 's' : ''} bloqué{blocked > 1 ? 's' : ''} par le navigateur : autorise les fenêtres
          surgissantes pour homedash, puis réessaie.
        </div>
      ) : null}
      {children}
    </div>
  )
}
