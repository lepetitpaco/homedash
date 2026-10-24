import type { GithubData, Pr } from '../lib/ghboard'
import { CiBadge, GateBanner, GhCard, GhEmpty, GhRow } from './GhCard'

const WAIT_TAG: Record<string, string> = {
  running: '⏳ tests en cours',
  blocked: '⛔ CI KO',
  ready: '✅ prête à merger',
  open: '⏳ attente base-site',
}

function OpenRow({ p }: { p: Pr }) {
  return (
    <GhRow repo={p.repo} right={<CiBadge ci={p.ci} url={p.url} />}>
      <a className="gh-title" href={p.url} target="_blank" rel="noreferrer" title={p.title}>
        {p.title}
      </a>
      <div className="gh-meta">
        <span className="gh-num">#{p.number}</span>
        {p.created_at ? ` · ${p.created_at.slice(5, 16)}` : null}
      </div>
    </GhRow>
  )
}

/**
 * Une PR mergée dont la CI tourne encore, c'est ce qu'on attend pour propager la
 * version : elle est mise en avant, pas grisée comme une PR terminée.
 */
function MergedRow({ p }: { p: Pr }) {
  const running = p.ci.state === 'pending'
  const broken = p.ci.state === 'fail'
  const cls = running ? 'is-running' : broken ? 'is-broken' : 'is-stale'
  return (
    <GhRow repo={p.repo} className={cls} right={<CiBadge ci={p.ci} url={p.url} />}>
      <a className="gh-title" href={p.url} target="_blank" rel="noreferrer" title={p.title}>
        {p.title}
      </a>
      {running ? (
        <div className="gh-meta is-running">
          <span className="gh-dot" />#{p.number} · merge fait, build &amp; tests en cours…
        </div>
      ) : broken ? (
        <div className="gh-meta is-broken">#{p.number} · CI en échec après merge</div>
      ) : (
        <div className="gh-meta">
          <span className="gh-num">#{p.number}</span>
          {p.merged_at ? ` · mergée le ${p.merged_at.slice(5, 16)}` : null}
        </div>
      )}
    </GhRow>
  )
}

export default function GhRenovate({
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
  const r = data.renovate
  const nothing =
    r.open_count === 0 && r.merged_groups.length === 0 && r.upstream_merged.length === 0

  return (
    <GhCard
      icon="🤖"
      title="Renovate — base-site"
      count={r.open_count}
      color={color}
      onRefresh={onRefresh}
      building={building}
    >
      {nothing ? <GhEmpty>Aucune PR Renovate</GhEmpty> : null}

      {r.upstream_open.length > 0 || r.upstream_merged.length > 0 ? (
        <>
          <div className="gh-divider">⬆️ Dans le projet socle (base-site)</div>
          {r.gate ? <GateBanner gate={r.gate} /> : null}
          {r.upstream_open.map((p) => (
            <OpenRow key={`u${p.repo}#${p.number}`} p={p} />
          ))}
          {r.upstream_merged.map((p) => (
            <MergedRow key={`um${p.repo}#${p.number}`} p={p} />
          ))}
        </>
      ) : null}

      {r.open_groups.length > 0 ? (
        <>
          <div className="gh-divider">⬇️ À reporter dans les autres projets, par version</div>
          {r.open_groups.map((g) => (
            <div key={g.version}>
              <div className="gh-version">
                <span className="gh-vtag">{g.version}</span>
                <span className="gh-sub">
                  {g.items.length} repo{g.items.length > 1 ? 's' : ''}
                </span>
                {g.gate ? (
                  <span className={`gh-tag is-wait-${g.gate.cls}`}>{WAIT_TAG[g.gate.cls]}</span>
                ) : null}
              </div>
              {g.gate ? <GateBanner gate={g.gate} /> : null}
              {g.items.map((p) => (
                <OpenRow key={`${p.repo}#${p.number}`} p={p} />
              ))}
            </div>
          ))}
        </>
      ) : null}

      {r.merged_groups.length > 0 ? (
        <>
          <div className="gh-divider">✅ Récemment mergées (24 h) — par version</div>
          {r.merged_groups.map((g) => (
            <div key={g.version}>
              <div className="gh-version">
                <span className="gh-vtag">{g.version}</span>
                <span className="gh-sub">
                  {g.items.length} repo{g.items.length > 1 ? 's' : ''}
                </span>
              </div>
              {g.items.map((p) => (
                <MergedRow key={`m${p.repo}#${p.number}`} p={p} />
              ))}
            </div>
          ))}
        </>
      ) : null}
    </GhCard>
  )
}
