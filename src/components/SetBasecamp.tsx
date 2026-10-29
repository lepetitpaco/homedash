import { useEffect, useState } from 'react'
import {
  bcAuthorize,
  bcCode,
  bcDisconnect,
  bcForget,
  bcSetApp,
  bcStatus,
  ABOUT_URL,
  CALLBACK_PATH,
  DEFAULT_CALLBACK_SITE,
  callbackSite,
  redirectFor,
  siteOf,
  type BcStatus,
} from '../lib/basecamp'
import { confirmDialog } from './ConfirmHost'
import { shown } from '../lib/errors'
import { desktop } from '../lib/desktop'

const LAUNCHPAD = 'https://launchpad.37signals.com/integrations'

/**
 * Connexion Basecamp, en trois temps : l'appli déclarée sur Launchpad (client id
 * et secret), « Se connecter », puis l'adresse où Basecamp a renvoyé le
 * navigateur, recollée ici (Launchpad refuse les adresses locales).
 * Enregistré tout de suite côté serveur, dans data/secrets.json : rien ne passe
 * par config.json ni par le bouton Enregistrer.
 */
export default function SetBasecamp() {
  const [st, setSt] = useState<BcStatus | null>(null)
  const [clientId, setClientId] = useState('')
  const [secret, setSecret] = useState('')
  const [site, setSite] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  const apply = (s: BcStatus) => {
    setSt(s)
    setClientId(s.client_id)
    // le défaut s'affiche en indication, pas en valeur saisie
    const host = siteOf(s.redirect_uri)
    setSite(host === DEFAULT_CALLBACK_SITE ? '' : host)
  }

  useEffect(() => {
    bcStatus()
      .then(apply)
      .catch((e: unknown) => setError(shown('Basecamp', e)))
  }, [])

  const run = (p: Promise<BcStatus | void>) => {
    setBusy(true)
    setError(null)
    p.then((s) => s && apply(s))
      .catch((e: unknown) => setError(shown('Basecamp', e)))
      .finally(() => setBusy(false))
  }

  const saveApp = () =>
    run(
      bcSetApp(clientId.trim(), secret.trim(), redirectFor(cleanSite ?? DEFAULT_CALLBACK_SITE)).then((s) => {
        setSecret('')
        setEditing(false)
        return s
      }),
    )

  // Appli 2.0 : une fenêtre de l'appli, retour intercepté, rien à coller. Sinon
  // un nouvel onglet : on garde celui-ci pour y coller l'adresse de retour.
  const inApp = !!desktop?.basecampConnect
  const login = () =>
    run(
      inApp
        ? desktop!.basecampConnect!().then((r) => {
            if (!r.ok && r.reason !== 'fenêtre fermée') throw new Error(r.reason || 'connexion refusée')
            return bcStatus()
          })
        : bcAuthorize().then(({ url }) => void window.open(url, '_blank', 'noopener')),
    )

  const sendCode = () => run(bcCode(code.trim()).then((s) => (setCode(''), s)))

  const unlink = () =>
    void confirmDialog({
      title: 'Déconnecter Basecamp ?',
      body: [
        "La connexion est effacée de homedash. L'appli (client id et secret) est conservée : se reconnecter = un clic.",
        'Rien ne change dans Basecamp. Pour retirer l’accès là-bas aussi : launchpad.37signals.com → Apps.',
      ],
      confirmLabel: 'Déconnecter',
      danger: true,
    }).then((ok) => ok && run(bcDisconnect()))

  const forget = () =>
    void confirmDialog({
      title: 'Oublier l’appli Basecamp ?',
      body: [
        'Client id, secret et connexion sont effacés de homedash ; l’onglet Basecamp disparaît.',
        "L'appli reste déclarée sur Launchpad, tu pourras la recoller ici.",
      ],
      confirmLabel: 'Oublier',
      danger: true,
    }).then((ok) => ok && run(bcForget()))

  if (!st) return <p className="set-hint">{error ? `✗ ${error}` : 'lecture de la connexion…'}</p>

  const cleanSite = callbackSite(site)
  const redirect = redirectFor(cleanSite ?? DEFAULT_CALLBACK_SITE)
  const saved = st.redirect_uri || redirectFor(DEFAULT_CALLBACK_SITE)
  const showApp = !st.configured || editing

  return (
    <div className="set-connect">
      <p className="set-hint">
        🔒 <strong>Lecture seule</strong> : homedash lit tes tâches assignées et tes notifications non lues, et
        n'affiche que des liens. Il ne coche rien, ne marque rien comme lu et ne poste rien dans Basecamp.
      </p>

      {st.connected ? (
        <div className="set-account">
          <div className="set-account-text">
            <strong>{st.account}</strong>
            {st.name ? <span> · {st.name}</span> : null}
            <span className="set-ok"> ✓ connecté</span>
            <em>
              jeton enregistré côté serveur, renouvelé tout seul
              {st.accounts > 1 ? ` · ${st.accounts} comptes Basecamp, le premier est utilisé` : ''}
            </em>
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
              {busy ? '…' : 'Se connecter à Basecamp'}
            </button>
            <span className="set-hint">
              {inApp ? (
                <>Ouvre Basecamp dans une fenêtre de l'appli : autorise, et c'est tout. Si ça ne marche pas, copie l'adresse de la page où tu arrives (<code>{siteOf(saved)}</code>) et colle-la ci-dessous.</>
              ) : (
                <>Ouvre Basecamp dans un nouvel onglet. Autorise, puis copie l'adresse complète de la page où tu arrives (<code>{siteOf(saved)}</code>) et colle-la ci-dessous.</>
              )}
            </span>
          </div>
          <div className="set-add">
            <input
              value={code}
              placeholder={`${saved}?code=… (adresse complète de la page d'arrivée)`}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendCode()}
              autoComplete="off"
              data-1p-ignore
              data-bwignore
              data-lpignore="true"
            />
            <button onClick={sendCode} disabled={busy || !code.trim()}>
              Valider
            </button>
          </div>
        </>
      ) : null}

      {st.error && st.connected ? <p className="set-hint set-bad">⚠ {st.error}</p> : null}
      {error ? <p className="set-hint set-bad">✗ {error}</p> : null}

      {showApp ? (
        <>
          {/* Avant les champs : on crée l'appli d'abord, on remplit ensuite. */}
          <details className="set-howto" open={!st.configured}>
            <summary>Comment faire (une fois, 3 minutes, pas besoin d'être admin)</summary>
            <p className="set-hint">
              Basecamp demande à chacun de déclarer sa propre « appli » pour homedash. C'est un formulaire à
              remplir une fois ; ensuite la connexion se renouvelle toute seule.
            </p>
            <ol>
              <li>
                Ouvre{' '}
                <a href={LAUNCHPAD} target="_blank" rel="noreferrer" data-outside>
                  launchpad.37signals.com/integrations
                </a>{' '}
                (connecté à ton Basecamp habituel), puis <em>Register another application</em>.
              </li>
              <li>
                Remplis : nom <code>homedash</code>, entreprise : ta boîte, <em>Your website URL</em> :{' '}
                <code>{ABOUT_URL}</code>, <em>Products</em> : coche seulement <strong>Basecamp 4</strong>.
              </li>
              <li>
                <em>Redirect URI</em> : <code>{redirect || redirectFor(DEFAULT_CALLBACK_SITE)}</code> (copie-la telle
                quelle). Valide le formulaire.
              </li>
              <li>
                Launchpad affiche un <strong>Client ID</strong> et un <strong>Client Secret</strong> : colle-les
                ci-dessous, laisse « Mon site de callback » vide, puis <strong>Enregistrer l'appli</strong>.
              </li>
              <li>
                Clique <strong>Se connecter à Basecamp</strong> et autorise. Tu arrives sur une page vide ou
                « introuvable » : c'est normal. Copie <strong>son adresse complète</strong> dans la barre du
                navigateur (elle contient <code>?code=…</code>), colle-la dans le champ qui apparaît ici, puis{' '}
                <strong>Valider</strong>.
              </li>
            </ol>
            <p className="set-hint">
              Pourquoi une page vide : Basecamp refuse de renvoyer vers ton ordinateur, il renvoie donc vers
              example.com (adresse réservée aux exemples), et tu rapportes le code à la main. Ce code ne sert
              qu'une fois et ne vaut rien sans ton Client Secret, qui reste sur cette machine. Si tu as ton propre
              site, tu peux le mettre comme site de callback.
            </p>
          </details>
          <h3 className="set-sub">Appli Launchpad</h3>
          <div className="set-grid">
            <label className="set-field">
              <span>Client ID</span>
              <input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                autoComplete="off"
                data-1p-ignore
                data-bwignore
                data-lpignore="true"
              />
            </label>
            <label className="set-field">
              <span>
                Client secret {st.has_secret ? <em>vide = garder l'actuel</em> : null}
              </span>
              <input
                type="password"
                value={secret}
                placeholder={st.has_secret ? '••••••••' : ''}
                onChange={(e) => setSecret(e.target.value)}
                autoComplete="off"
                data-1p-ignore
                data-bwignore
                data-lpignore="true"
              />
            </label>
            <label className="set-field">
              <span>
                Mon site de callback <em>un domaine à toi, ou vide = {DEFAULT_CALLBACK_SITE}</em>
              </span>
              <span className="set-affix">
                <span className="set-affix-part">https://</span>
                <input
                  value={site}
                  placeholder={DEFAULT_CALLBACK_SITE}
                  onChange={(e) => setSite(e.target.value)}
                  autoComplete="off"
                  data-1p-ignore
                />
                <span className="set-affix-part">{CALLBACK_PATH}</span>
              </span>
            </label>
          </div>
          {cleanSite ? (
            <p className="set-hint">
              <em>Redirect URI</em> à mettre dans Launchpad, à l'identique : <code>{redirect}</code>
            </p>
          ) : (
            <p className="set-hint set-bad">
              Domaine invalide : juste le nom, comme <code>monsite.fr</code> (pas de <code>localhost</code>, d'IP
              ni de port — Launchpad les refuse).
            </p>
          )}
          <div className="set-add">
            <button
              onClick={saveApp}
              disabled={busy || !cleanSite || !clientId.trim() || (!secret.trim() && !st.has_secret)}
            >
              Enregistrer l'appli
            </button>
            {editing ? <button onClick={() => setEditing(false)}>annuler</button> : null}
          </div>
        </>
      ) : (
        <div className="set-add">
          <button onClick={() => setEditing(true)} disabled={busy}>
            modifier l'appli
          </button>
          <button className="set-danger-link" onClick={forget} disabled={busy}>
            Oublier l'appli Basecamp
          </button>
        </div>
      )}
    </div>
  )
}
