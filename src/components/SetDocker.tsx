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
  const { available, entries, loaded } = useDocker(enabled, true)
  return (
    <>
      <p className="set-hint">
        Pour les développeurs : un dossier 🐳 dans la barre de gauche, avec une ligne par projet ou container. Ceux qui sont
        éteints restent visibles, en plus fade. homedash lit seulement la liste : il ne démarre, n'arrête et ne modifie rien.
      </p>
      <div className="set-toggles">
        <label className="set-toggle">
          <input type="checkbox" checked={enabled} onChange={(e) => onChange(e.target.checked, hidden)} />
          🐳 Afficher mes containers Docker
        </label>
      </div>
      {!enabled || !loaded ? null : !available ? (
        <p className="set-hint">homedash n'arrive pas à joindre Docker sur cette machine : le dossier reste caché pour l'instant.</p>
      ) : !entries.length ? (
        <p className="set-hint">Aucun projet ni container à afficher pour l'instant.</p>
      ) : (
        <div className="set-toggles">
          {entries.map((e) => (
            <label className={`set-toggle${e.running ? '' : ' is-stopped'}`} key={e.id} title={e.image}>
              <input
                type="checkbox"
                checked={!hidden.includes(e.id)}
                onChange={(ev) => onChange(enabled, ev.target.checked ? hidden.filter((x) => x !== e.id) : [...hidden, e.id])}
              />
              {e.label}{' '}
              <em>
                {e.running
                  ? e.ports[0].url + (e.ports.length > 1 ? ` · ${e.ports.length - 1} autre${e.ports.length > 2 ? 's' : ''} port${e.ports.length > 2 ? 's' : ''}` : '')
                  : 'éteint'}
              </em>
            </label>
          ))}
        </div>
      )}
    </>
  )
}
