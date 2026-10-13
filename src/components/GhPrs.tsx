import type { GithubData, Pr } from '../lib/ghboard'
import { BranchGroup, CiBadge, GhCard, GhEmpty, GhRow, groupByBranch } from './GhCard'

function PrRow({ p, grouped }: { p: Pr; grouped?: boolean }) {
  return (
    <GhRow repo={p.repo} right={<CiBadge ci={p.ci} url={p.url} />}>
      <a className="gh-title" href={p.url} target="_blank" rel="noreferrer" title={p.title}>
        {p.title}
      </a>
      <div className="gh-meta">
        <span className="gh-num">#{p.number}</span>
        {p.branch && !grouped ? <span className="gh-branch-inline"> {p.branch}</span> : null}
        {p.created_at ? ` · ${p.created_at.slice(5, 16)}` : null}
      </div>
    </GhRow>
  )
}

function PrGroup({ branch, items }: { branch: string; items: Pr[] }) {
  const ok = items.filter((p) => p.ci.state === 'pass').length
  const tag = ok === items.length ? '✅ toutes vertes' : `${ok}/${items.length} vertes`
  return (
    <BranchGroup branch={branch} summary={`${items.length} PRs · ${tag}`}>
      {items.map((p) => (
        <PrRow key={`${p.repo}#${p.number}`} p={p} grouped />
      ))}
    </BranchGroup>
  )
}

export default function GhPrs({
  data,
  color,
  onRefresh,
  building,
}: {
  data: GithubData
  color: string
  onRefresh?: () => void
  building?: boolean
}) {
  return (
    <GhCard icon="🔀" title="PRs ouvertes" count={data.prs.length} color={color} onRefresh={onRefresh} building={building}>
      {data.prs.length === 0 ? <GhEmpty>Aucune PR ouverte</GhEmpty> : null}
      {groupByBranch(data.prs, (p) => p.branch).map((g) =>
        g.length > 1 ? (
          <PrGroup key={`branch:${g[0].branch}`} branch={g[0].branch!} items={g} />
        ) : (
          <PrRow key={`${g[0].repo}#${g[0].number}`} p={g[0]} />
        ),
      )}
    </GhCard>
  )
}
