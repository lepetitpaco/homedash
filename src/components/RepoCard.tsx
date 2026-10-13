import { useState } from 'react'
import { template } from '../lib/config'
import type { GithubData } from '../lib/ghboard'
import type { ReposConfig } from '../types'

type Props = {
  repos: ReposConfig
  onOpen: (id: string) => void
  /** Données GitHub : alimente les compteurs par repo quand elles sont là. */
  gh?: GithubData | null
}

/** Ce que la couche GitHub sait de ce repo : branches actives, PRs ouvertes, Renovate. */
function counts(gh: GithubData | null | undefined, repo: string) {
  if (!gh?.enabled) return null
  const branches = gh.branches.active.filter((b) => b.repo === repo).length
  const prs = gh.prs.filter((p) => p.repo === repo).length
  const renovate = [
    ...gh.renovate.upstream_open,
    ...gh.renovate.open_groups.flatMap((g) => g.items),
  ].filter((p) => p.repo === repo)
  const failing = renovate.some((p) => p.ci.state === 'fail')
  const waiting = renovate.some((p) => p.ci.state === 'pending')
  if (!branches && !prs && !renovate.length) return null
  return { branches, prs, renovate: renovate.length, failing, waiting }
}

export default function RepoCard({ repos, onOpen, gh }: Props) {
  const [copied, setCopied] = useState<string | null>(null)
  const actions = repos.actions ?? []

  const copyClone = async (owner: string, name: string) => {
    if (!repos.cloneTemplate) return
    try {
      await navigator.clipboard.writeText(template(repos.cloneTemplate, { owner, repo: name }))
      setCopied(name)
      setTimeout(() => setCopied((c) => (c === name ? null : c)), 1400)
    } catch {
      setCopied(null)
    }
  }

  return (
    <section className="card repos-card" style={{ ['--accent' as string]: repos.color ?? '#a78bfa' }}>
      <header className="group-head">
        <div className="group-toggle static">
          <span className="group-icon" aria-hidden="true">
            {repos.icon}
          </span>
          <h2 className="group-title">{repos.title}</h2>
          <span className="group-count">{repos.items.length}</span>
        </div>
      </header>
      <div className="repo-grid">
        {repos.items.map((repo) => {
          const owner = repo.owner ?? repos.defaultOwner ?? ''
          const vars = { owner, repo: repo.name, me: repos.me ?? '' }
          const base = `https://github.com/${owner}/${repo.name}`
          const id = `repo:${owner}/${repo.name}`
          const live = counts(gh, repo.name)
          return (
            <div className="repo" key={id}>
              <a className="repo-name" href={base} target="_blank" rel="noreferrer" onClick={() => onOpen(id)}>
                {repo.name}
              </a>
              <div className="repo-top">
                {repos.cloneTemplate ? (
                  <button
                    className="repo-clone"
                    title={template(repos.cloneTemplate, vars)}
                    onClick={() => void copyClone(owner, repo.name)}
                  >
                    {copied === repo.name ? '✓ copié' : repos.cloneLabel}
                  </button>
                ) : null}
              </div>
              <div className="repo-sub">
                {owner}
                {repo.note ? ` · ${repo.note}` : ''}
              </div>
              {live ? (
                <div className="repo-live">
                  {live.branches ? (
                    <span className="repo-stat" title="Branches actives">
                      🌿 {live.branches}
                    </span>
                  ) : null}
                  {live.prs ? (
                    <span className="repo-stat" title="Mes PRs ouvertes">
                      🔀 {live.prs}
                    </span>
                  ) : null}
                  {live.renovate ? (
                    <span
                      className={`repo-stat${
                        live.failing ? ' is-fail' : live.waiting ? ' is-wait' : ''
                      }`}
                      title="PRs Renovate ouvertes"
                    >
                      🤖 {live.renovate}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <div className="repo-actions">
                {actions.map((action) => (
                  <a
                    key={action.label}
                    className={`repo-chip${action.highlight ? ' repo-chip-mine' : ''}`}
                    href={`${base}${template(action.path, vars)}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => onOpen(`${id}#${action.label}`)}
                  >
                    {action.label}
                  </a>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
