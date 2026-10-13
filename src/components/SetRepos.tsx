import { useEffect, useMemo, useState } from 'react'
import { getRepos, type GhRepo, type Owner } from '../lib/admin'

export type Use = 'prs' | 'branches' | 'card'

type Props = {
  /** Compte GitHub dont le jeton sert à lister. */
  account: string
  /** Comptes dont le jeton voit les repos : le sien d'abord, puis ses orgs. */
  owners: Owner[]
  /** Repos suivis (`propriétaire/repo`) et ce que chacun alimente. */
  uses: Record<Use, string[]>
  connected: boolean
  /** Renvoie un message si le repo ne peut pas être suivi. */
  onTrack: (key: string) => string | null
  onToggle: (use: Use, key: string) => void
  onRemove: (key: string) => void
}

/**
 * Ce qu'un repo suivi alimente. Les trois sont actifs par défaut ; on n'en
 * coupe un que pour une raison précise (un repo dont on ne veut que le lien, un
 * repo trop bavard en branches…).
 */
const USES: { key: Use; label: string; on: string; off: string }[] = [
  {
    key: 'prs',
    label: 'PRs',
    on: 'Ses PRs ouvertes et mergées apparaissent dans les cartes « PRs ouvertes » et « PRs mergées ».',
    off: 'Ses PRs n’apparaissent pas.',
  },
  {
    key: 'branches',
    label: 'Branches',
    on: 'Ses branches apparaissent dans « Branches actives ». L’onglet Local sait aussi, grâce à GitHub, si une branche a été mergée ou supprimée.',
    off: 'Ses branches n’apparaissent pas, et l’onglet Local juge ses branches sur tes seuls refs locaux (à jour de ton dernier git fetch).',
  },
  {
    key: 'card',
    label: 'Carte',
    on: 'Il a sa ligne dans la carte Repos (liens PRs, Branches, Actions, clone…).',
    off: 'Pas de ligne dans la carte Repos.',
  },
]

const SHOWN = 12
const ownerOf = (key: string) => (key.includes('/') ? key.split('/')[0] : '')
const nameOf = (key: string) => key.split('/').pop() ?? key

/**
 * Repos suivis, rangés par propriétaire, et ajout depuis tout ce que voit le
 * jeton. Toutes les listes sont chargées une fois à l'ouverture : passer d'un
 * compte à l'autre ne relance aucun appel.
 */
export default function SetRepos({ account, owners, uses, connected, onTrack, onToggle, onRemove }: Props) {
  const [lists, setLists] = useState<Record<string, GhRepo[] | string>>({})
  const [tab, setTab] = useState('')
  const [filter, setFilter] = useState('')
  const [all, setAll] = useState(false)
  const [manual, setManual] = useState('')
  const [error, setError] = useState<string | null>(null)

  const logins = owners.map((o) => o.login)

  // Chargé une fois par compte et par liste de comptes visibles : changer
  // d'onglet ne relance rien, changer de compte GitHub repart de zéro.
  useEffect(() => {
    setLists({})
    if (!connected || !logins.length) return
    setTab((t) => (t && logins.includes(t) ? t : logins[0]))
    let alive = true
    for (const login of logins) {
      getRepos(login, account)
        .then((repos) => alive && setLists((cur) => ({ ...cur, [login]: repos })))
        .catch(
          (e: unknown) =>
            alive && setLists((cur) => ({ ...cur, [login]: e instanceof Error ? e.message : String(e) })),
        )
    }
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, account, logins.join(',')])

  const tracked = useMemo(
    () => [...new Set([...uses.prs, ...uses.branches, ...uses.card])].sort(),
    [uses],
  )

  // Cadres : les comptes connus d'abord (dans l'ordre du jeton), puis ceux qui
  // n'apparaissent que dans la config.
  const groups = useMemo(() => {
    const order = [...logins, ...tracked.map(ownerOf).filter((o) => !logins.includes(o))]
    return [...new Set(order)]
      .map((o) => ({ owner: o, keys: tracked.filter((k) => ownerOf(k) === o) }))
      .filter((g) => g.keys.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracked, logins.join(',')])

  const current = lists[tab]
  const candidates = useMemo(() => {
    if (!Array.isArray(current)) return []
    const q = filter.trim().toLowerCase()
    return current
      .filter((r) => !r.archived && !tracked.includes(r.full_name))
      .filter((r) => !q || r.name.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q))
  }, [current, tracked, filter])

  const privateOf = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const l of Object.values(lists)) if (Array.isArray(l)) for (const r of l) m.set(r.full_name, r.private)
    return m
  }, [lists])

  const track = (key: string) => {
    const problem = onTrack(key)
    setError(problem)
    return !problem
  }

  const addManual = () => {
    const value = manual.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/+$/, '')
    if (!value) return
    if (!value.includes('/')) {
      setError('Écris le repo avec son propriétaire : propriétaire/repo.')
      return
    }
    if (track(value)) setManual('')
  }

  const avatar = (login: string) => owners.find((o) => o.login === login)?.avatar
  const visible = all || filter ? candidates : candidates.slice(0, SHOWN)
  const countOf = (login: string) => {
    const l = lists[login]
    return Array.isArray(l) ? l.filter((r) => !r.archived && !tracked.includes(r.full_name)).length : null
  }

  return (
    <>
      <h3 className="set-sub">Repos suivis</h3>
      <p className="set-hint">
        Un repo suivi alimente les cartes de l'onglet GitHub, la carte Repos et l'onglet Local. Clique une
        pastille pour couper l'un des trois — survole-la pour voir l'effet.
      </p>

      {groups.length ? (
        groups.map((g) => (
          <div className="set-owner" key={g.owner || '?'}>
            <div className="set-owner-head">
              {avatar(g.owner) ? <img src={avatar(g.owner)!} alt="" /> : null}
              <strong>{g.owner || 'sans propriétaire'}</strong>
              <span>{g.keys.length}</span>
            </div>
            <ul className="set-tracked">
              {g.keys.map((key) => (
                <li key={key}>
                  <span className="set-repo">{nameOf(key)}</span>
                  {privateOf.get(key) ? <span className="set-tag">privé</span> : null}
                  <span className="set-spacer" />
                  {USES.map((u) => {
                    const on = uses[u.key].includes(key)
                    return (
                      <button
                        key={u.key}
                        className={`set-use${on ? ' is-on' : ''}`}
                        onClick={() => onToggle(u.key, key)}
                        title={on ? u.on : u.off}
                      >
                        {u.label}
                      </button>
                    )
                  })}
                  <button className="set-del" onClick={() => onRemove(key)} title="Ne plus suivre ce repo">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      ) : (
        <p className="set-hint">Aucun repo suivi — ajoute-en ci-dessous.</p>
      )}

      <h3 className="set-sub">Ajouter</h3>
      {!connected ? (
        <p className="set-hint">Connecte GitHub ci-dessus pour choisir dans la liste de tes repos.</p>
      ) : (
        <div className="set-picker">
          <div className="set-tabs" role="tablist">
            {owners.map((o) => {
              const n = countOf(o.login)
              return (
                <button
                  key={o.login}
                  role="tab"
                  aria-selected={o.login === tab}
                  className={`set-tab${o.login === tab ? ' is-active' : ''}`}
                  onClick={() => {
                    setTab(o.login)
                    setAll(false)
                  }}
                >
                  {o.avatar ? <img src={o.avatar} alt="" /> : null}
                  {o.login}
                  <span>{n ?? '…'}</span>
                </button>
              )
            })}
          </div>
          <input
            className="set-filter"
            value={filter}
            placeholder={`filtrer les repos de ${tab}…`}
            onChange={(e) => setFilter(e.target.value)}
            autoComplete="off"
            data-1p-ignore
          />
          {typeof current === 'string' ? (
            <p className="set-hint set-bad">✗ {current}</p>
          ) : current === undefined ? (
            <p className="set-hint">chargement des repos de {tab}…</p>
          ) : candidates.length === 0 ? (
            <p className="set-hint">
              {filter ? 'Aucun repo ne correspond.' : `Tous les repos visibles de ${tab} sont suivis.`}
            </p>
          ) : (
            <ul className="set-pick-list">
              {visible.map((r) => (
                <li key={r.full_name}>
                  <button onClick={() => track(r.full_name)} title={`Suivre ${r.full_name}`}>
                    ＋
                  </button>
                  <span className="set-repo">{r.name}</span>
                  {r.private ? <span className="set-tag">privé</span> : null}
                  <em>{r.description ?? ''}</em>
                  <time>{r.pushed_at?.slice(0, 10)}</time>
                </li>
              ))}
              {!all && !filter && candidates.length > SHOWN ? (
                <li>
                  <button className="set-more" onClick={() => setAll(true)}>
                    voir les {candidates.length - SHOWN} autres
                  </button>
                </li>
              ) : null}
            </ul>
          )}
        </div>
      )}
      {error ? <p className="set-hint set-bad">✗ {error}</p> : null}
      <div className="set-add">
        <input
          value={manual}
          placeholder="ou à la main : propriétaire/repo"
          onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addManual()}
          autoComplete="off"
          data-1p-ignore
        />
        <button onClick={addManual}>+ suivre</button>
      </div>
      <p className="set-hint">
        Un onglet par compte que voit le jeton, repos triés par activité. Un repo absent n'est pas visible
        par le jeton : ajoute-le à son <em>Repository access</em> sur GitHub. Chaque repo coûte quelques
        appels par cycle — rester sous une quinzaine.
      </p>
    </>
  )
}
