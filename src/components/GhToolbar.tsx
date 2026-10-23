import { ago, type GhAccount, type GithubData } from '../lib/ghboard'

/**
 * Sélecteur de compte : affiché dès qu'il y en a plusieurs. Ne change que ce que
 * montre la page — tous les comptes restent suivis côté serveur, journal et
 * notifications compris.
 */
export function AccountSwitch({
  accounts,
  current,
  onAccount,
}: {
  accounts: GhAccount[]
  current?: string
  onAccount: (id: string) => void
}) {
  if (accounts.length < 2) return null
  return (
    <div className="gh-accounts" role="tablist" aria-label="Compte GitHub affiché">
      {accounts.map((a) => (
        <button
          key={a.id}
          role="tab"
          aria-selected={a.id === current}
          className={`gh-account${a.id === current ? ' is-active' : ''}${a.ok ? '' : ' is-off'}`}
          onClick={() => onAccount(a.id)}
          title={a.ok ? `${a.label} — connecté en tant que ${a.login}` : `${a.label} — non connecté (Réglages → GitHub)`}
        >
          {a.avatar ? <img src={a.avatar} alt="" /> : <span className="gh-account-dot" />}
          {a.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Barre de l'onglet GitHub : les contrôles qui valent pour toutes les cartes
 * (utilisateur observé, rafraîchissement) — les notifications sont sur la cloche plutôt que rangés dans
 * l'entête de l'une d'entre elles.
 */
export default function GhToolbar({
  data,
  onUser,
  onAccount,
  onRefresh,
  paused,
  onTogglePause,
  busy,
  cleanup,
  onCleanup,
}: {
  data: GithubData
  onUser: (login: string) => void
  onAccount: (id: string) => void
  onRefresh: () => void
  paused: boolean
  onTogglePause: () => void
  busy: boolean
  /** Branches locales devenues supprimables — le rappel de ménage post-merge. */
  cleanup: number
  onCleanup: () => void
}) {
  return (
    <div className="gh-bar">
      <AccountSwitch accounts={data.accounts ?? []} current={data.account} onAccount={onAccount} />
      {/* Placé ici et pas seulement dans l'onglet Local : c'est en regardant ses
          PRs, juste après un merge, qu'on est au bon moment pour faire le ménage. */}
      {cleanup > 0 ? (
        <button className="gh-bar-btn is-cleanup" onClick={onCleanup}
          title="Des branches locales sont mergées : leur copie sur ton disque ne sert plus. Ouvre l'onglet Local.">
          🧹 {cleanup} branche{cleanup > 1 ? 's' : ''} locale{cleanup > 1 ? 's' : ''} à supprimer
        </button>
      ) : null}
      {data.users.length > 1 ? (
        <label className="gh-bar-user">
          <span>Utilisateur</span>
          <select value={data.user} onChange={(e) => onUser(e.target.value)}>
            {data.users.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <span className="gh-bar-user">
          <span>Utilisateur</span>
          <strong>{data.user}</strong>
        </span>
      )}

      <span className="gh-bar-sep" />

      <span className="gh-bar-state">
        {busy ? (
          <>
            <span className="gh-spin" />
            fetch en cours…
          </>
        ) : paused ? (
          'en pause'
        ) : (
          `à jour ${ago(data.updated_at)}`
        )}
      </span>
      <span className="gh-bar-stats" title="Appels GitHub facturés / réponses 304 (hors quota)">
        {data.stats.calls} appels · {data.stats.hits} × 304
        {data.stats.errors ? ` · ${data.stats.errors} erreurs` : ''}
      </span>

      <div className="gh-bar-right">
        {data.error ? <span className="gh-bar-err">⚠ {data.error}</span> : null}
        <button
          className={`gh-bar-btn is-auto${paused ? '' : ' is-on'}`}
          title={
            paused
              ? 'Auto-refresh en pause — cliquer pour reprendre'
              : `Auto-refresh toutes les ${data.auto_refresh}s — cliquer pour mettre en pause`
          }
          onClick={onTogglePause}
        >
          {paused ? '▶' : '⏸'} {data.auto_refresh}s
        </button>
        <button
          className={`gh-bar-btn${busy ? ' is-busy' : ''}`}
          title="Tout rafraîchir maintenant"
          onClick={onRefresh}
        >
          ↻
        </button>
      </div>
    </div>
  )
}
