type Props = {
  /** Outil dont on choisit les repos, pour le texte. */
  tool: string
  /** Repos suivis (PRs) de tous les comptes, `propriétaire/repo`. */
  followed: string[]
  /** Repos cochés. Vide = tous les repos suivis. */
  chosen: string[]
  onChange: (list: string[]) => void
}

/**
 * Repos où créer les issues depuis un outil (#26) : Basecamp pour le travail,
 * Trello pour le perso, par exemple. Le serveur refuse les autres.
 */
export default function SetToolRepos(p: Props) {
  const on = new Set(p.chosen.map((r) => r.toLowerCase()))
  const toggle = (key: string) =>
    p.onChange(on.has(key.toLowerCase()) ? p.chosen.filter((x) => x.toLowerCase() !== key.toLowerCase()) : [...p.chosen, key].sort())
  // un repo coché puis retiré du suivi reste décochable
  const shown = [...new Set([...p.followed, ...p.chosen])].sort()

  return (
    <details className="set-section">
      <summary>
        <span>Repos où créer les issues</span>
        <em>{p.chosen.length ? `${p.chosen.length} repo(s)` : 'tous les repos suivis'}</em>
      </summary>
      <p className="set-hint">
        Les issues créées depuis {p.tool} ne peuvent aller que dans les repos cochés. Aucun coché = tous les
        repos suivis.
      </p>
      {shown.length ? (
        <div className="set-chips">
          {shown.map((k) => (
            <label key={k} className={`set-chip set-check${on.has(k.toLowerCase()) ? ' is-on' : ''}`}>
              <input type="checkbox" checked={on.has(k.toLowerCase())} onChange={() => toggle(k)} />
              {k}
            </label>
          ))}
        </div>
      ) : (
        <p className="set-hint">Aucun repo suivi : ajoute-en dans Réglages → GitHub.</p>
      )}
    </details>
  )
}
