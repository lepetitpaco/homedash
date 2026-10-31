import type { Run } from '../lib/ghboard'
import { GhCard } from './GhCard'

function RunRow({ run }: { run: Run }) {
  const { checks } = run.ci
  const count = (state: string) => checks.filter((c) => c.state === state).length
  const [ok, pending, fail] = [count('pass'), count('pending'), count('fail')]
  return (
    <div className="gh-run">
      <div className="gh-run-head">
        <span className="gh-repo">{run.repo}</span>
        <a className="gh-title" href={run.url} target="_blank" rel="noreferrer" title={run.title}>
          {run.workflow}
        </a>
        <span className={`gh-badge is-${checks.length ? run.ci.state : 'pending'}`}>
          {checks.length ? [ok ? `${ok} ✓` : '', pending ? `${pending} ⟳` : '', fail ? `${fail} ✗` : ''].filter(Boolean).join(' · ') || run.ci.label : 'en attente'}
        </span>
      </div>
      <div className="gh-meta">
        {run.branch}
        {run.title ? ` · ${run.title}` : ''}
      </div>
      {checks.length ? (
        <ul className="gh-run-jobs">
          {checks.map((c, i) => (
            <li key={`${c.name}-${i}`} className={`is-${c.state}`}>
              <span aria-hidden="true">{c.icon}</span>
              <a href={c.url || run.url} target="_blank" rel="noreferrer" title={c.name}>
                {c.name}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** Ce qui tourne sur les repos suivis. Absente quand rien ne tourne (GithubView). */
export default function GhRunning({ runs }: { runs: Run[] }) {
  return (
    <div className="gh-running">
      <GhCard title="En cours" icon="⚙️" color="#d29922" count={runs.length}>
        {runs.map((run) => (
          <RunRow key={`${run.repo}#${run.id}`} run={run} />
        ))}
      </GhCard>
    </div>
  )
}
