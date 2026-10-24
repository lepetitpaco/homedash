import { useState } from 'react'
import type { Branch, GithubData, Pr } from '../lib/ghboard'
import { BranchGroup, GhCard, GhEmpty, GhRow, groupByBranch } from './GhCard'

const ROLE_LABEL: Record<string, [string, string]> = {
  // Créée par soi : le cas normal de la liste, pas d'étiquette (« créée » sur
  // chaque ligne n'apprenait rien, issue #44).
  'creator:tip': ['dernier commit', 'Branche mergée sans PR retrouvée — auteur du commit de tête'],
  contributor: ['participé', "Commits sur la branche, mais créée par quelqu'un d'autre"],
}

/**
 * `b.pr` n'est rempli par le backend que pour une branche mergée (économie
 * d'appels) : la PR ouverte se retrouve dans `data.prs`, par repo + branche.
 */
type OpenPrs = Map<string, Pr>
const prKey = (repo: string, branch: string) => `${repo}\u0000${branch}`

function Row({ b, me, openPr, grouped }: { b: Branch; me: string; openPr?: Pr; grouped?: boolean }) {
  const roleKey = b.role === 'creator' ? `creator:${b.creator_src}` : 'contributor'
  const [label, hint] = ROLE_LABEL[roleKey] ?? ['', '']

  return (
    <GhRow
      repo={b.repo}
      className={b.merged ? 'is-stale' : undefined}
      right={
        <>
          <span className="gh-date">{b.date.slice(5, 16)}</span>
          {b.last_author && b.last_author !== me ? (
            <span className="gh-sub" title="Auteur du dernier commit">par {b.last_author}</span>
          ) : null}
        </>
      }
    >
      <div className="gh-line">
        <a className="gh-branch" href={b.url} target="_blank" rel="noreferrer" title={b.name}>
          {b.name}
        </a>
        {label ? (
          <span className={`gh-tag is-${b.role}`} title={hint}>
            {label}
          </span>
        ) : null}
        {grouped && !b.merged && !b.pr && !openPr ? (
          <span className="gh-tag is-nopr" title="Les autres repos de ce chantier ont peut-être une PR, celui-ci non">
            sans PR
          </span>
        ) : null}
        {b.merged ? (
          <span className="gh-tag is-merged" title="Plus aucun commit propre : déjà dans la branche par défaut">
            mergée
          </span>
        ) : null}
      </div>
      <div className="gh-meta">
        {b.ahead ? `${b.ahead} commit${b.ahead > 1 ? 's' : ''}` : `à jour avec ${b.base}`}
        {b.pr ? (
          <>
            {' · '}
            <a className="gh-link" href={b.pr.url} target="_blank" rel="noreferrer">
              #{b.pr.number}
            </a>
          </>
        ) : openPr ? (
          <>
            {' · '}
            <a className="gh-link" href={openPr.url} target="_blank" rel="noreferrer" title={openPr.title}>
              PR #{openPr.number}
            </a>
          </>
        ) : null}
        {b.authors.length ? (
          <span className="gh-who" title="Participants à la branche">
            {' 👥'}
            {b.authors.map((a) => (
              <span
                key={a}
                className={a === me ? 'gh-chip is-me' : 'gh-chip'}
                title={
                  [a === b.creator ? 'a créé la branche' : '', a === b.last_author ? 'dernier commit' : '']
                    .filter(Boolean)
                    .join(' · ') || 'a des commits sur la branche'
                }
              >
                {a}
                {a === b.creator ? '★' : ''}
              </span>
            ))}
          </span>
        ) : null}
      </div>
    </GhRow>
  )
}

export default function GhBranches({
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
  const [showStale, setShowStale] = useState(false)
  const { active, stale } = data.branches
  const openPrs: OpenPrs = new Map(
    data.prs.filter((p) => p.branch).map((p) => [prKey(p.repo, p.branch!), p]),
  )
  const row = (b: Branch, grouped?: boolean) => (
    <Row
      key={`${b.repo}/${b.name}`}
      b={b}
      me={data.user}
      openPr={openPrs.get(prKey(b.repo, b.name))}
      grouped={grouped}
    />
  )

  return (
    <GhCard
      icon="🌿"
      title="Branches actives"
      count={active.length}
      color={color}
      onRefresh={onRefresh}
      building={building}
    >
      {active.length === 0 ? <GhEmpty>Aucune branche active</GhEmpty> : null}
      {groupByBranch(active, (b) => b.name).map((g) => {
        if (g.length === 1) return row(g[0])
        const withPr = g.filter((b) => b.pr || openPrs.has(prKey(b.repo, b.name))).length
        const tag = withPr === g.length ? '✅ toutes en PR' : `${withPr}/${g.length} avec PR`
        return (
          <BranchGroup key={`branch:${g[0].name}`} branch={g[0].name} summary={`${g.length} repos · ${tag}`}>
            {g.map((b) => row(b, true))}
          </BranchGroup>
        )
      })}

      {stale.length > 0 ? (
        <>
          <button className="gh-cleanup" onClick={() => setShowStale((v) => !v)}>
            🧹{' '}
            {showStale
              ? 'masquer les branches mergées'
              : `${stale.length} branche${stale.length > 1 ? 's' : ''} mergée${
                  stale.length > 1 ? 's' : ''
                } non supprimée${stale.length > 1 ? 's' : ''} — afficher`}
          </button>
          {showStale
            ? stale.map((b) => row(b))
            : null}
        </>
      ) : null}
    </GhCard>
  )
}
