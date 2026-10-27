import { useEffect, useState } from 'react'
import { shown } from '../lib/errors'
import {
  trAuthorize,
  trConnect,
  trDisconnect,
  trForget,
  trSetKey,
  trStatus,
  type TrStatus,
} from '../lib/trello'
import { confirmDialog } from './ConfirmHost'

const ADMIN = 'https://trello.com/power-ups/admin'

/**
 * Connexion Trello : une clé d'API (Power-Up personnel), puis le jeton collé
 * depuis la page d'autorisation. Le jeton ne revient jamais du serveur.
 */
export default function SetTrello() {
  const [st, setSt] = useState<TrStatus | null>(null)
  const [key, setKey] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)

  const load = () => {
    trStatus()
      .then(setSt)
      .catch((e: unknown) => setError(shown('Trello', e)))
  }
  useEffect(load, [])

  const saveKey = () => {
    setBusy(true)
    setError('')
    trSetKey(key.trim())
      .then((next) => {
        setSt(next)
        setKey('')
        setEditing(false)
      })
      .catch((e: unknown) => setError(shown('Trello', e)))
      .finally(() => setBusy(false))
  }

  const login = () => {
    setBusy(true)
    setError('')
    trAuthorize()
      .then(({ url }) => window.open(url, '_blank', 'noopener'))
      .catch((e: unknown) => setError(shown('Trello', e)))
      .finally(() => setBusy(false))
  }

  const send = () => {
    setBusy(true)
    setError('')
    trConnect(token.trim())
      .then((next) => {
        setSt(next)
        setToken('')
      })
      .catch((e: unknown) => setError(shown('Trello', e)))
      .finally(() => setBusy(false))
  }

  const unlink = () => {
    void confirmDialog({
      title: 'Déconnecter Trello ?',
      body: [
        'Le jeton est effacé de homedash. La clé d’API reste, pour te reconnecter.',
        'Rien ne change dans Trello. Pour retirer l’accès là-bas aussi : ton compte Trello → Applications.',
      ],
      confirmLabel: 'Déconnecter',
    }).then((ok) => {
      if (!ok) return
      setBusy(true)
      trDisconnect()
        .then(setSt)
        .catch((e: unknown) => setError(shown('Trello', e)))
        .finally(() => setBusy(false))
    })
  }

  const wipe = () => {
    void confirmDialog({
      title: 'Oublier l’appli Trello ?',
      body: ['Clé d’API et jeton sont effacés de homedash. L’onglet Trello disparaît.'],
      confirmLabel: 'Oublier',
      danger: true,
    }).then((ok) => {
      if (!ok) return
      setBusy(true)
      trForget()
        .then(setSt)
        .catch((e: unknown) => setError(shown('Trello', e)))
        .finally(() => setBusy(false))
    })
  }

  if (!st) return <p className="set-hint">Chargement…</p>
  const showKey = !st.configured || editing

  return (
    <div className="set-connect">
      <p className="set-hint">
        🔒 <strong>Lecture seule</strong> : homedash lit tes cartes assignées et tes notifications non lues, et
        n'affiche que des liens. Il ne coche rien, ne marque rien comme lu et ne poste un commentaire sur une carte
        que lorsque tu publies le rapport d'une issue.
      </p>

      {st.connected ? (
        <div className="set-account">
          <div className="set-account-text">
            <strong>{st.name || st.username}</strong>
            {st.username ? <span> · @{st.username}</span> : null}
            <span className="set-ok"> ✓ connecté</span>
            <em>jeton enregistré côté serveur, il n'expire pas tout seul</em>
          </div>
          <div className="set-account-actions">
            <button onClick={unlink} disabled={busy}>
              déconnecter
            </button>
          </div>
        </div>
      ) : st.configured ? (
        <>
          <div className="set-add">
            <button onClick={login} disabled={busy}>
              {busy ? '…' : 'Se connecter à Trello'}
            </button>
            <span className="set-hint">
              Ouvre Trello dans un nouvel onglet. Autorise, copie le jeton affiché, et colle-le ci-dessous.
            </span>
          </div>
          <div className="set-add">
            <input
              value={token}
              placeholder="colle le jeton"
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && token.trim() && send()}
              autoComplete="off"
              data-1p-ignore
              data-bwignore
              data-lpignore="true"
            />
            <button onClick={send} disabled={busy || !token.trim()}>
              Valider
            </button>
          </div>
        </>
      ) : null}

      {st.error && st.connected ? <p className="set-hint set-bad">⚠ {st.error}</p> : null}
      {error ? <p className="set-hint set-bad">✗ {error}</p> : null}

      {showKey ? (
        <>
          <details className="set-howto" open={!st.configured}>
            <summary>Comment faire (une fois, pas besoin d'être admin)</summary>
            <ol>
              <li>
                Ouvre{' '}
                <a href={ADMIN} target="_blank" rel="noreferrer" data-outside>
                  trello.com/power-ups/admin
                </a>{' '}
                (connecté à ton Trello), crée un Power-Up au nom <code>homedash</code> s'il n'existe pas.
              </li>
              <li>
                Onglet <em>API key</em> : génère une clé et colle-la ci-dessous, puis <strong>Enregistrer la clé</strong>.
              </li>
              <li>
                Clique <strong>Se connecter à Trello</strong> et autorise. Trello affiche un jeton : copie-le dans le
                champ, puis <strong>Valider</strong>. Le jeton reste sur cette machine.
              </li>
              <li>
                Pour révoquer plus tard : ton compte Trello → <em>Applications</em>, à côté de homedash.
              </li>
            </ol>
          </details>
          <h3 className="set-sub">Clé d'API</h3>
          <div className="set-grid">
            <label className="set-field">
              <span>Clé d'API {st.has_key ? <em>vide = garder l'actuelle</em> : null}</span>
              <input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                autoComplete="off"
                data-1p-ignore
                data-bwignore
                data-lpignore="true"
              />
            </label>
          </div>
          <div className="set-add">
            <button onClick={saveKey} disabled={busy || (!key.trim() && !st.has_key)}>
              Enregistrer la clé
            </button>
            {st.configured ? (
              <button className="set-danger-link" onClick={() => setEditing(false)}>
                annuler
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="set-add">
          <button onClick={() => setEditing(true)}>Changer la clé</button>
          <button className="set-danger-link" onClick={wipe}>
            Oublier l'appli
          </button>
        </div>
      )}
    </div>
  )
}
