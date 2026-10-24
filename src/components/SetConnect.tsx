import { useState } from 'react'
import { connect, disconnect, type Auth } from '../lib/admin'
import { confirmDialog } from './ConfirmHost'
import { shown } from '../lib/errors'

type Props = {
  account: string
  auth: Auth | null
  onChange: (auth: Auth) => void
}

// Lien de création pré-rempli : un jeton classic ne peut pas être restreint à des
// repos, mais il se crée en un clic. Le fine-grained est le bon choix, il se
// règle à la main (pas de pré-remplissage possible côté GitHub).
const FINE_URL = 'https://github.com/settings/personal-access-tokens/new'
const CLASSIC_URL =
  'https://github.com/settings/tokens/new?scopes=repo,read:org&description=homedash'

/** Connexion d'UN compte : chaque compte des Réglages a la sienne. */
export default function SetConnect({ account, auth, onChange }: Props) {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  const submit = () => {
    const value = token.trim()
    if (!value) return
    setBusy(true)
    setError(null)
    connect(account, value)
      .then((a) => {
        onChange(a)
        setToken('')
        setEditing(false)
      })
      .catch((e: unknown) => setError(shown('compte GitHub', e)))
      .finally(() => setBusy(false))
  }

  const unlink = () => {
    void confirmDialog({
      title: 'Déconnecter GitHub ?',
      body: [
        'Le jeton est effacé de homedash. Il reste valide sur GitHub : révoque-le là-bas si tu ne veux plus t’en servir.',
        "L'onglet GitHub se vide jusqu'à la prochaine connexion. Les réglages (org, repos, équipe) sont conservés.",
      ],
      confirmLabel: 'Déconnecter',
      danger: true,
    }).then((ok) => ok && unlinkNow())
  }

  const unlinkNow = () => {
    setBusy(true)
    disconnect(account)
      .then(onChange)
      .catch((e: unknown) => setError(shown('compte GitHub', e)))
      .finally(() => setBusy(false))
  }

  const connected = !!auth?.ok
  const showForm = !connected || editing

  return (
    <div className="set-connect">
      {auth === null ? (
        <p className="set-hint">vérification de la connexion…</p>
      ) : connected ? (
        <div className="set-account">
          {auth.avatar ? <img src={auth.avatar} alt="" className="set-avatar" /> : null}
          <div className="set-account-text">
            <strong>{auth.login}</strong>
            {auth.name ? <span> · {auth.name}</span> : null}
            <span className="set-ok"> ✓ connecté</span>
            <em>jeton enregistré côté serveur, jamais renvoyé au navigateur</em>
          </div>
          <div className="set-account-actions">
            <button onClick={() => setEditing((v) => !v)} disabled={busy}>
              {editing ? 'annuler' : 'changer de jeton'}
            </button>
            {auth.source === 'ui' ? (
              <button onClick={unlink} disabled={busy}>
                déconnecter
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="set-hint">
          {auth.error ? <span className="set-bad">{auth.error}. </span> : null}
          Pas encore connecté. Colle un jeton GitHub : il sert uniquement à <strong>lire</strong>{' '}
          branches, PRs et CI.
        </p>
      )}

      {showForm ? (
        <>
          <div className="set-add">
            <input
              type="password"
              value={token}
              placeholder="github_pat_… ou ghp_…"
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              // gestionnaires de mots de passe : ce n'est pas un identifiant
              autoComplete="off"
              data-1p-ignore
              data-bwignore
              data-lpignore="true"
            />
            <button onClick={submit} disabled={busy || !token.trim()}>
              {busy ? 'vérification…' : 'Connecter'}
            </button>
          </div>
          {error ? <p className="set-hint set-bad">✗ {error}</p> : null}
          {/* Ouverte tant qu'on n'est pas connecté : c'est l'étape où l'on bloquait. */}
          <details className="set-howto" open={!connected}>
            <summary>Comment créer un jeton (2 minutes)</summary>
            <p className="set-hint">
              Un jeton est un mot de passe limité que tu crées sur GitHub pour homedash. Il reste sur cette
              machine.
            </p>
            <ol>
              <li>
                Ouvre{' '}
                <a href={FINE_URL} target="_blank" rel="noreferrer" data-outside>
                  la page de création du jeton
                </a>{' '}
                (connecté à ton compte GitHub).
              </li>
              <li>
                <strong>Token name</strong> : homedash. <strong>Expiration</strong> : la plus longue possible.
              </li>
              <li>
                <strong>Resource owner</strong> : l'organisation de tes repos de travail (ou ton compte pour
                tes repos perso). Un jeton par propriétaire : pour l'autre, ajoute un compte en haut de la page.
              </li>
              <li>
                <strong>Repository access</strong> : <em>All repositories</em>, ou seulement ceux à suivre.
              </li>
              <li>
                <strong>Permissions</strong> → <em>Repository permissions</em>, en <strong>Read-only</strong> :
                Contents, Pull requests, Commit statuses, Checks, Issues (Metadata se coche tout seul). Pour
                créer une issue depuis une tâche Basecamp : Issues en <strong>Read and write</strong>.
              </li>
              <li>
                <strong>Generate token</strong>, copie le jeton (il commence par <code>github_pat_</code>), colle-le
                ci-dessus puis <strong>Connecter</strong>.
              </li>
            </ol>
            <p className="set-hint">
              Si tes repos de travail n'apparaissent pas ensuite, l'organisation doit peut-être approuver le
              jeton (demande à un admin). Plus rapide, mais avec plus de droits :{' '}
              <a href={CLASSIC_URL} target="_blank" rel="noreferrer" data-outside>
                un jeton « classic » déjà rempli
              </a>{' '}
              : choisis l'expiration, <strong>Generate token</strong>, copie, colle. Il ouvre tous tes repos,
              y compris en écriture.
            </p>
          </details>
        </>
      ) : null}
    </div>
  )
}
