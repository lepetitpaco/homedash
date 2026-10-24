type Props = {
  /** La carte est-elle affichée dans l'onglet GitHub (`gh:renovate` dans githubLayout) ? */
  shown: boolean
  upstream: string
  author: string
  /** Repos suivis, et ceux dont on surveille les PRs Renovate. */
  tracked: string[]
  watched: string[]
  onShown: (on: boolean) => void
  onUpstream: (v: string) => void
  onAuthor: (v: string) => void
  onWatched: (list: string[]) => void
}

const DEFAULT_UPSTREAM = 'base-site'
const DEFAULT_AUTHOR = 'renovate[bot]'

/**
 * La carte Renovate suit une mise à jour de dépendance du repo socle jusqu'aux
 * repos qui l'embarquent. Tout ce qui la règle est ici et nulle part ailleurs.
 */
export default function SetRenovate(p: Props) {
  const up = p.upstream || DEFAULT_UPSTREAM
  const toggle = (key: string) =>
    p.onWatched(p.watched.includes(key) ? p.watched.filter((x) => x !== key) : [...p.watched, key].sort())

  return (
    <details className="set-section" open={p.shown}>
      <summary>
        <span>Carte Renovate</span>
        <em>{p.shown ? `active · ${p.watched.length} repo(s) dérivé(s)` : 'masquée'}</em>
      </summary>
      <p className="set-hint">
        Suit les PRs de mise à jour de dépendances : d'abord sur le <strong>repo socle</strong>, puis sur
        les <strong>repos dérivés</strong> qui le reprennent. Elle indique où en est chaque version (prête,
        en cours, bloquée). Les autres cartes n'utilisent aucun de ces réglages.
      </p>
      <label className="set-toggle">
        <input type="checkbox" checked={p.shown} onChange={(e) => p.onShown(e.target.checked)} />
        Afficher la carte dans l'onglet GitHub
      </label>
      <div className="set-grid">
        <label className="set-field">
          <span>
            Repo socle <em>reçoit les mises à jour en premier</em>
          </span>
          <input
            value={p.upstream}
            placeholder={`vide = ${DEFAULT_UPSTREAM}`}
            onChange={(e) => p.onUpstream(e.target.value)}
            autoComplete="off"
            data-1p-ignore
          />
        </label>
        <label className="set-field">
          <span>
            Compte qui ouvre les PRs <em>le bot Renovate</em>
          </span>
          <input
            value={p.author}
            placeholder={`vide = ${DEFAULT_AUTHOR}`}
            onChange={(e) => p.onAuthor(e.target.value)}
            autoComplete="off"
            data-1p-ignore
          />
        </label>
      </div>
      <span className="set-field-label">Repos dérivés</span>
      <div className="set-chips">
        {p.tracked
          // le repo socle n'est pas un dérivé de lui-même
          .filter((k) => k !== up && k.split('/').pop() !== up)
          .map((k) => (
            <label key={k} className={`set-chip set-check${p.watched.includes(k) ? ' is-on' : ''}`}>
              <input type="checkbox" checked={p.watched.includes(k)} onChange={() => toggle(k)} />
              {k.split('/').pop()}
            </label>
          ))}
      </div>
      <p className="set-hint">
        Sur un repo dérivé, seules les PRs du bot qui portent sur <code>base-site</code> sont retenues.
      </p>
    </details>
  )
}
