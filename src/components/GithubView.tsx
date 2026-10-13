import GhToolbar, { AccountSwitch } from './GhToolbar'
import Section, { type SectionCtx } from './Section'

/** Onglet GitHub : barre (compte, utilisateur, rafraîchissement) et cartes. */
export default function GithubView({ ctx, onSettings }: { ctx: SectionCtx; onSettings: () => void }) {
  const { gh, local, cfg } = ctx
  return (
    <>
      {gh.data && !gh.data.enabled ? (
        // compte affiché pas (encore) connecté : on garde de quoi revenir aux autres
        <div className="gh-bar">
          <AccountSwitch accounts={gh.data.accounts ?? []} current={gh.data.account} onAccount={gh.setAccount} />
          <span className="gh-bar-state">
            {gh.data.error ?? 'Ce compte n’est pas connecté.'}{' '}
            <button className="loc-roots-edit" onClick={onSettings}>
              Réglages
            </button>
          </span>
        </div>
      ) : null}
      {gh.data?.enabled ? (
        <GhToolbar
          data={gh.data}
          onUser={gh.setUser}
          onAccount={gh.setAccount}
          onRefresh={() => gh.refresh()}
          paused={gh.paused}
          onTogglePause={gh.togglePause}
          busy={!!gh.busyScope}
          cleanup={local.todo}
          onCleanup={ctx.openLocal}
        />
      ) : null}
      {gh.busyScope ? <div className="gh-progress" /> : null}
      <div className="gh-page">
        {cfg.githubSections.map((s) => (
          <Section key={s.key} section={s} ctx={ctx} />
        ))}
      </div>
    </>
  )
}
