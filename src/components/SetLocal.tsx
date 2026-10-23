import { useEffect, useState } from 'react'
import { browse, getRoots, type Browse, type RootStatus } from '../lib/admin'
import { shown as errorText } from '../lib/errors'

type Root = { path?: string; as?: string }

type Props = {
  roots: Root[]
  maxDepth: number
  onRoots: (roots: Root[]) => void
  onMaxDepth: (n: number) => void
}

const shownOf = (r: Root | string) =>
  (typeof r === 'string' ? r : (r.as ?? r.path ?? '')).replace(/\/+$/, '')

/**
 * Dossiers où l'onglet Local cherche des clones git. Le dossier personnel est
 * monté en lecture seule dans le conteneur : on choisit ici sans toucher au
 * docker-compose. Rien n'est jamais écrit dans ces dossiers.
 */
export default function SetLocal({ roots, maxDepth, onRoots, onMaxDepth }: Props) {
  const [status, setStatus] = useState<RootStatus[]>([])
  const [view, setView] = useState<Browse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  // Une même racine peut apparaître sous deux formes (chemin du conteneur et de
  // l'hôte) dans une config ancienne : on la montre une fois.
  const shown = [...new Set(roots.map(shownOf).filter(Boolean))]

  useEffect(() => {
    getRoots()
      .then((r) => setStatus(r.roots))
      .catch(() => setStatus([]))
  }, [roots])

  const go = (path: string) => {
    setError(null)
    browse(path)
      .then((b) => (b.error ? setError(b.error) : setView(b)))
      .catch((e: unknown) => setError(errorText('dépôts locaux', e)))
  }

  useEffect(() => {
    if (open && !view) go('~')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const covered = (p: string) =>
    shown.find((s) => p === s || p.startsWith(s + '/') || s.startsWith(p + '/'))

  const add = (p: string) => {
    const clash = covered(p)
    if (clash) {
      setError(`${p} recoupe ${clash} — les dépôts seraient lus deux fois`)
      return
    }
    onRoots([...roots, { path: p, as: p }])
    setOpen(false)
  }

  const remove = (s: string) => onRoots(roots.filter((r) => shownOf(r) !== s))

  const ok = (s: string) => status.find((x) => x.as === s)?.ok

  return (
    <>
      <h3 className="set-sub">Dossiers lus</h3>
      {shown.length ? (
        <ul className="set-roots">
          {shown.map((s) => (
            <li key={s}>
              <code>{s}</code>
              {ok(s) === false ? (
                <span className="set-bad" title="Ni montée dans le conteneur, ni présente sur ce disque">
                  {' '}
                  ✗ introuvable
                </span>
              ) : ok(s) ? (
                <span className="set-ok"> ✓</span>
              ) : null}
              <button className="set-del" onClick={() => remove(s)} title="Ne plus lire ce dossier">
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="set-hint">Aucun dossier : l'onglet Local reste vide.</p>
      )}

      {open ? (
        <div className="set-browser">
          <div className="set-browser-head">
            <code>{view?.path ?? '~'}</code>
            {view ? (
              <span className="set-hint">
                {view.repos.count}
                {view.repos.partial ? '+' : ''} dépôt(s) sur {maxDepth} niveaux
              </span>
            ) : null}
            <span className="set-spacer" />
            {view && !view.starts?.some((st) => st.path === view.path) ? (
              <button onClick={() => add(view.path)} disabled={!!covered(view.path)}>
                ✓ lire ce dossier
              </button>
            ) : null}
            <button onClick={() => setOpen(false)}>fermer</button>
          </div>
          {error ? <p className="set-hint set-bad">✗ {error}</p> : null}
          {(view?.starts?.length ?? 0) > 1 ? (
            <div className="set-browser-starts">
              {view!.starts!.map((st) => (
                <button
                  key={st.path}
                  className={`xs-btn${view!.path === st.path || view!.path.startsWith(st.path + '/') ? ' is-on' : ''}`}
                  onClick={() => go(st.path)}
                >
                  {st.path === '~' ? '🏠' : '💽'} {st.label}
                </button>
              ))}
            </div>
          ) : null}
          <ul className="set-dirs">
            {view?.parent ? (
              <li>
                <button onClick={() => go(view.parent!)}>↰ ..</button>
              </li>
            ) : null}
            {view?.dirs.map((d) => (
              <li key={d.path}>
                <button onClick={() => go(d.path)} title="Ouvrir">
                  {d.git ? '📦' : '📁'} {d.name}
                </button>
                {covered(d.path) ? <span className="set-hint"> déjà lu</span> : null}
              </li>
            ))}
            {view && view.dirs.length === 0 ? <li className="set-hint">aucun sous-dossier</li> : null}
          </ul>
        </div>
      ) : (
        <div className="set-add">
          <button onClick={() => setOpen(true)}>+ ajouter un dossier</button>
        </div>
      )}

      <div className="set-grid">
        <label className="set-field">
          <span>
            Profondeur <em>niveaux de sous-dossiers parcourus</em>
          </span>
          <input
            type="number"
            min={1}
            max={6}
            value={maxDepth}
            onChange={(e) => onMaxDepth(Math.min(6, Math.max(1, Number.parseInt(e.target.value, 10) || 3)))}
          />
        </label>
      </div>
      <p className="set-hint">
        Choisis le dossier qui <em>contient</em> tes clones (boulot, perso…) : chacun est parcouru sur{' '}
        {maxDepth} niveaux à la recherche de <code>.git</code>, où qu'il soit : dossier personnel ou ailleurs
        sur le disque (💽). 📦 = dépôt git. Lecture seule : tout est monté <code>:ro</code>, aucune
        commande git n'est lancée.
      </p>
    </>
  )
}
