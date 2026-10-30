/**
 * « Pour commencer », en tête de l'accueil tant que la configuration n'est pas
 * finie : chaque étape dit son état et mène au bon endroit. Une étape dont on
 * ignore encore l'état (données pas arrivées) n'est pas montrée, sinon elle
 * clignoterait « à faire » au chargement. Disparaît quand tout est fait, ou
 * avec « Masquer » (`ui.setupHidden`).
 */
export type SetupStep = {
  id: string
  icon: string
  title: string
  hint: string
  done: boolean | undefined
  action: string
  run: () => void
}

type Props = {
  steps: SetupStep[]
  onHide: () => void
  onFeatures: () => void
}

export default function SetupCard({ steps, onHide, onFeatures }: Props) {
  const known = steps.filter((s) => s.done !== undefined)
  const left = known.filter((s) => !s.done).length
  if (!left) return null
  return (
    <section className="card setup-card">
      <header className="setup-head">
        <h2>👋 Pour commencer</h2>
        <span className="setup-count">
          {known.length - left} / {known.length}
        </span>
        <button className="reveal-btn" onClick={onHide} title="Ne plus afficher cette carte (Réglages → Affichage pour la retrouver)">
          Masquer
        </button>
      </header>
      <ol className="setup-steps">
        {known.map((s) => (
          <li key={s.id} className={s.done ? 'is-done' : undefined}>
            <span className="setup-icon" aria-hidden="true">
              {s.done ? '✓' : s.icon}
            </span>
            <div className="setup-text">
              <strong>{s.title}</strong>
              <span>{s.hint}</span>
            </div>
            {s.done ? null : (
              <button className="btn setup-go" onClick={s.run}>
                {s.action} →
              </button>
            )}
          </li>
        ))}
      </ol>
      <p className="setup-foot">
        Tu ne te sers pas de GitHub, de Basecamp, de Trello ou de tes dossiers de code ?{' '}
        <button className="setup-link" onClick={onFeatures}>
          Décoche-les dans Fonctionnalités
        </button>{' '}
        : l'étape disparaît.
      </p>
    </section>
  )
}
