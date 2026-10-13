import type { GithubData } from '../lib/ghboard'
import { CiBadge, GhCard, GhEmpty, GhRow } from './GhCard'

export default function GhMerged({
  data,
  color,
  onRefresh,
  building,
  removable,
  onCleanup,
}: {
  data: GithubData
  color: string
  onRefresh?: () => void
  building?: boolean
  /** `repo/branche` encore présentes en local alors que la PR est mergée. */
  removable?: Set<string>
  onCleanup?: () => void
}) {
  return (
    <GhCard icon="✅" title="Mergées" count={data.merged.length} color={color} onRefresh={onRefresh} building={building}>
      {data.merged.length === 0 ? <GhEmpty>Aucune PR mergée</GhEmpty> : null}
      {data.merged.map((p) => (
        <GhRow
          key={`${p.repo}#${p.number}`}
          repo={p.repo}
          className="is-stale"
          right={<CiBadge ci={p.ci} url={p.url} />}
        >
          <a className="gh-title" href={p.url} target="_blank" rel="noreferrer" title={p.title}>
            {p.title}
          </a>
          <div className="gh-meta">
            <span className="gh-num">#{p.number}</span>
            {p.merged_at ? ` · ${p.merged_at.slice(5, 16)}` : null}
            {/* La PR est close, mais la branche traîne encore sur le disque :
                c'est ici, en relisant ses merges, qu'on pense au ménage. */}
            {p.branch && removable?.has(`${p.repo}/${p.branch}`) ? (
              <>
                {' · '}
                <button className="gh-broom" onClick={onCleanup}
                  title={`La branche locale ${p.branch} est mergée : sa copie sur ton disque ne sert plus. Ouvrir l'onglet Local.`}>
                  🧹 branche locale à supprimer
                </button>
              </>
            ) : null}
          </div>
        </GhRow>
      ))}
    </GhCard>
  )
}
