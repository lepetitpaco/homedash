import { useDocker } from '../lib/docker'

/** Réglages → Docker : activer le dossier de la barre, choisir ce qu'il montre. */
export default function SetDocker({
  enabled,
  hidden,
  onChange,
}: {
  enabled: boolean
  hidden: string[]
  onChange: (enabled: boolean, hidden: string[]) => void
}) {
  const { available, links, loaded } = useDocker(enabled, true)
  return (
    <>
      <p className="set-hint">
        Pour les développeurs : un dossier 🐳 dans la barre de gauche, avec un lien vers chaque container qui publie un
        port web. homedash lit seulement la liste des containers : il ne démarre, n'arrête et ne modifie rien.
      </p>
      <div className="set-toggles">
        <label className="set-toggle">
          <input type="checkbox" checked={enabled} onChange={(e) => onChange(e.target.checked, hidden)} />
          🐳 Afficher mes containers Docker
        </label>
      </div>
      {!enabled || !loaded ? null : !available ? (
        <p className="set-hint">Docker ne répond pas sur cette machine : le dossier reste caché tant qu'il n'est pas lancé.</p>
      ) : !links.length ? (
        <p className="set-hint">Aucun container en marche ne publie de port web.</p>
      ) : (
        <div className="set-toggles">
          {links.map((l) => (
            <label className="set-toggle" key={l.id} title={l.image}>
              <input
                type="checkbox"
                checked={!hidden.includes(l.id)}
                onChange={(e) => onChange(enabled, e.target.checked ? hidden.filter((x) => x !== l.id) : [...hidden, l.id])}
              />
              {l.label} <em>{l.url}</em>
            </label>
          ))}
        </div>
      )}
    </>
  )
}
