import { useEffect, useState } from 'react'
import { getMembers, lookupUser, type Member } from '../lib/admin'
import { confirmDialog } from './ConfirmHost'

type Props = {
  account: string
  /** Organisations du jeton : leurs membres sont proposés. */
  orgs: string[]
  users: string[]
  me: string
  connected: boolean
  /** Login du jeton : proposé en premier, et utilisateur par défaut si rien n'est choisi. */
  login?: string
  onUsers: (users: string[]) => void
  onMe: (me: string) => void
}

/**
 * Les comptes du sélecteur de l'onglet GitHub. Ce ne sont PAS des connexions :
 * le jeton de l'instance lit tout, ces logins disent seulement de qui on
 * regarde les branches et les PRs.
 */
export default function SetTeam({ account, orgs, users, me, connected, login, onUsers, onMe }: Props) {
  const [members, setMembers] = useState<Member[] | null>(null)
  const [membersError, setMembersError] = useState<string | null>(null)
  const [manual, setManual] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!connected || !orgs.length) return
    setMembers(null)
    setMembersError(null)
    Promise.allSettled(orgs.map((o) => getMembers(o, account))).then((res) => {
      const seen = new Set<string>()
      const all = res
        .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
        .filter((m) => !seen.has(m.login) && seen.add(m.login))
      setMembers(all)
      const failed = res.find((r) => r.status === 'rejected')
      if (!all.length && failed?.status === 'rejected') setMembersError(String(failed.reason))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, account, orgs.join(',')])

  const add = (u: string) => {
    if (users.includes(u)) return
    onUsers([...users, u])
    if (!me) onMe(u)
  }

  const remove = (u: string) => {
    const next = users.filter((x) => x !== u)
    onUsers(next)
    if (me === u) onMe(next[0] ?? '')
  }

  const addManual = () => {
    const value = manual.trim().replace(/^@/, '')
    if (!value) return
    setChecking(true)
    setError(null)
    // vérifié auprès de GitHub : une faute de frappe donnerait un onglet vide sans explication
    lookupUser(value, account)
      .then((u) => {
        add(u.login)
        setManual('')
      })
      .catch(() => setError(`« ${value} » n'existe pas sur GitHub`))
      .finally(() => setChecking(false))
  }

  const avatar = (u: string) => members?.find((m) => m.login === u)?.avatar
  const suggestions = (members ?? []).filter((m) => !users.includes(m.login))
  if (login && !users.includes(login) && !suggestions.some((m) => m.login === login)) {
    suggestions.unshift({ login })
  }

  return (
    <>
      <h3 className="set-sub">Équipe</h3>
      <p className="set-hint">
        Les personnes dont l'onglet GitHub montre branches et PRs (sélecteur en haut de l'onglet).
        <strong>★</strong> = celle affichée à l'ouverture — clique une étoile pour changer. Ce ne sont pas
        des connexions : le jeton ci-dessus lit tout.
      </p>
      <div className="set-chips">
        {users.map((u) => (
          <span className={`set-chip${u === me ? ' is-me' : ''}`} key={u}>
            {avatar(u) ? <img src={avatar(u)!} alt="" /> : null}
            <button className="set-star" onClick={() => onMe(u)} title="Afficher à l'ouverture">
              {u === me ? '★' : '☆'}
            </button>
            {u}
            <button
              className="set-del"
              onClick={() => {
                // sans ça, un clic malencontreux retire un coéquipier en silence
                void confirmDialog({
                  title: `Retirer ${u} de l'équipe ?`,
                  body: "Il disparaît du sélecteur de l'onglet GitHub. Rien n'est supprimé sur GitHub ; tu pourras le rajouter.",
                  confirmLabel: 'Retirer',
                }).then((ok) => ok && remove(u))
              }}
              title="Retirer"
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      {connected && suggestions.length ? (
        <div className="set-chips set-suggest">
          {suggestions.map((m) => (
            <button key={m.login} className="set-chip is-add" onClick={() => add(m.login)} title="Ajouter">
              {m.avatar ? <img src={m.avatar} alt="" /> : null}＋ {m.login}
            </button>
          ))}
        </div>
      ) : null}
      {connected && membersError ? (
        <p className="set-hint">
          Membres de {orgs.join(', ')} non listables ({membersError}) — ajout à la main ci-dessous.
        </p>
      ) : null}

      <div className="set-add">
        <input
          value={manual}
          placeholder="ajouter un login GitHub"
          onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addManual()}
          autoComplete="off"
          data-1p-ignore
          data-bwignore
          data-lpignore="true"
        />
        <button onClick={addManual} disabled={checking || !manual.trim()}>
          {checking ? '…' : '+ ajouter'}
        </button>
      </div>
      {error ? <p className="set-hint set-bad">✗ {error}</p> : null}
    </>
  )
}
