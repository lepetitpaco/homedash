import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { newerThan, type Changelog, type ChangelogEntry } from '../lib/changelog'
import { desktop } from '../lib/desktop'
import { inline } from '../lib/markdown'
import { isMac, isWindows } from '../lib/keys'

/**
 * Version installée, dans la barre du haut. Discrète quand tout est à jour,
 * mise en avant quand une version plus récente est publiée. Un clic ouvre une
 * modale : commande de mise à jour (à copier, rien n'est lancé d'ici) et changelog.
 * Pas un onglet : c'est une information sur l'application, pas un outil.
 */
export default function VersionMenu({
  data,
  busy,
  onCheck,
}: {
  data: Changelog | null
  busy: boolean
  onCheck: () => void
}) {
  const [open, setOpen] = useState(false)

  // Échap ferme la modale (le clic sur le fond aussi, plus bas).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!data) return null

  return (
    <>
      <button
        className={`version-btn${data.update ? ' is-update' : ''}${open ? ' is-open' : ''}`}
        onClick={() => setOpen(!open)}
        title={data.update ? `homedash ${data.latest} est disponible` : `homedash ${data.current} — nouveautés`}
        aria-expanded={open}
      >
        {data.update ? `⬆ ${data.latest}` : `v${data.current}`}
      </button>

      {/* Rendue dans <body> : la barre du haut a un `backdrop-filter`, qui ferait
          de la barre (et non de l'écran) le repère de cette modale fixe. */}
      {open ? createPortal(
        <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal cl-modal" role="dialog" aria-modal="true" aria-label="Version et nouveautés">
            <div className="modal-head cl-head">
              <span>homedash {data.current}</span>
              <span className="cl-status">
                {data.error ? `⚠ ${data.error}` : data.update ? '' : data.checked_at ? '✓ à jour' : ''}
              </span>
            </div>

            <div className="modal-body cl-body">
              <ChangelogBody data={data} />
            </div>

            <div className="modal-foot">
              <span className="modal-hint">Échap pour fermer</span>
              <button className="btn" onClick={onCheck} disabled={busy}>
                {busy ? 'vérification…' : 'Vérifier les mises à jour'}
              </button>
              <button className="btn btn-primary" onClick={() => setOpen(false)}>
                Fermer
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  )
}

/**
 * Commande de mise à jour, appli de bureau et changelog : la fenêtre de la
 * version, et Réglages → Aide → Nouveautés.
 */
export function ChangelogBody({ data }: { data: Changelog }) {
  const [copied, setCopied] = useState<false | 'update' | 'desktop'>(false)
  // Les commandes du système de celui qui lit (PowerShell sous Windows).
  const command = (isWindows && data.command_windows) || data.command
  const desktopCommand = isWindows ? data.desktop_command_windows : isMac ? data.desktop_command : undefined

  // `which` : la commande copiée (mise à jour, ou construction de l'appli).
  const copy = (text = command, which: 'update' | 'desktop' = 'update') => {
    try {
      void navigator.clipboard?.writeText(text).then(() => {
        setCopied(which)
        window.setTimeout(() => setCopied(false), 1400)
      })
    } catch {
      /* presse-papier absent hors localhost/HTTPS */
    }
  }

  // Appli de bureau : la plus récente qu'exige une version (installée ou à venir).
  const required = [...data.incoming, ...data.entries]
    .map((e) => e.desktop)
    .filter((v): v is string => !!v)
    .reduce<string | null>((max, v) => (!max || newerThan(v, max) ? v : max), null)
  const appVersion = desktop?.appVersion
  const appTooOld = !!desktop && !!required && (!appVersion || newerThan(required, appVersion))
  const canUpdate = !!desktop?.update

  return (
    <>
    {/* À jour : une phrase, la commande repliée. Une version dispo : le bouton de
        l'appli d'abord, la commande seulement s'il n'y a pas d'appli (issue #44). */}
    <div className={`cl-update${data.update ? '' : ' is-idle'}`}>
      <strong>
        {data.update ? `⬆️ La version ${data.latest} est disponible` : '✓ Tu as la dernière version'}
      </strong>
      {canUpdate && data.update ? <UpdateNow appTooOld={appTooOld} required={required} /> : null}
      {data.update && !canUpdate && !command ? (
        // 2.0 : plus de commande, c'est l'appli qui se met à jour (page ouverte dans un navigateur).
        <p>Dans l'appli homedash : Aide → Vérifier les mises à jour.</p>
      ) : data.update && !canUpdate ? (
        <>
          <p>Colle cette commande dans un terminal :</p>
          <button className="cl-cmd" onClick={() => copy()} title="Copier la commande">
            <code>{command}</code>
            <span>{copied === 'update' ? '✓ copié' : 'copier'}</span>
          </button>
        </>
      ) : !command ? null : (
        <details className="cl-manual">
          <summary>Mettre à jour à la main (terminal)</summary>
          <button className="cl-cmd" onClick={() => copy()} title="Copier la commande">
            <code>{command}</code>
            <span>{copied === 'update' ? '✓ copié' : 'copier'}</span>
          </button>
        </details>
      )}
      {appTooOld && !canUpdate ? (
        <p className="cl-warn">
          💻 Cette version demande l'<strong>appli de bureau {required}</strong> (tu as{' '}
          {appVersion ?? 'une version plus ancienne'}) : reconstruis-la une fois avec la commande ci-dessous. Elle
          se mettra ensuite à jour toute seule.
        </p>
      ) : null}
      {data.update ? <p className="cl-safe">Tes données sont sauvegardées automatiquement avant la mise à jour.</p> : null}
      {desktopCommand && !desktop?.update ? (
        <div className="cl-desktop">
          <strong>💻 Appli de bureau ({isMac ? 'Mac' : 'Windows'})</strong>
          <p>
            Elle se construit sur {isMac ? 'ce Mac' : 'ce PC'} (Docker suffit), une seule fois : ensuite, « Mettre à
            jour » la reconstruit toute seule quand il le faut.
          </p>
          {desktopCommand ? (
            <button
              className="cl-cmd"
              onClick={() => copy(desktopCommand, 'desktop')}
              title="Copier la commande"
            >
              <code>{desktopCommand}</code>
              <span>{copied === 'desktop' ? '✓ copié' : 'copier'}</span>
            </button>
          ) : null}
        </div>
      ) : null}
      {data.incoming.map((e) => (
        <Entry key={e.version} entry={e} fresh />
      ))}
    </div>
    {data.entries.map((e, i) => (
      <Entry key={e.version} entry={e} current={i === 0} />
    ))}
    </>
  )
}

/**
 * « Mettre à jour maintenant » (appli de bureau) : l'appli demande confirmation,
 * puis (2.0) télécharge la Release, vérifie son empreinte, sauvegarde les
 * données et se relance ; (1.x) git pull et docker compose. Elle raconte ici ce
 * qu'elle fait.
 */
function UpdateNow({ appTooOld, required }: { appTooOld: boolean; required: string | null }) {
  const [lines, setLines] = useState<{ line: string; kind: string }[]>([])
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'failed'>('idle')
  const box = useRef<HTMLPreElement>(null)

  useEffect(
    () =>
      desktop?.onUpdateLog?.((msg) => {
        setLines((l) => [...l.slice(-400), msg])
        window.setTimeout(() => box.current?.scrollTo({ top: box.current.scrollHeight }), 0)
      }),
    [],
  )

  const run = () => {
    setLines([])
    setState('running')
    void desktop
      ?.update?.()
      .then((r) => setState(r.ok ? 'done' : r.reason === 'annulé' ? 'idle' : 'failed'))
      .catch(() => setState('failed'))
  }

  return (
    <div className="cl-now">
      <button className="btn btn-primary" onClick={run} disabled={state === 'running'}>
        {state === 'running' ? 'mise à jour…' : '⬆ Mettre à jour maintenant'}
      </button>
      <span className="cl-now-hint">
        {desktop?.features?.includes('release-update')
          ? "Téléchargée depuis GitHub, vérifiée, tes données sauvegardées : homedash se relance tout seul."
          : appTooOld
            ? `L'appli de bureau se reconstruit aussi (version ${required}) puis se relance : une demi-minute de plus.`
            : 'git pull et docker compose, lancés pour toi ; la page se recharge à la fin.'}
      </span>
      {lines.length ? (
        <pre ref={box} className={`cl-log${state === 'failed' ? ' is-failed' : ''}`}>
          {lines.map((l, i) => (
            <span key={i} className={`cl-log-${l.kind}`}>
              {l.line}
              {'\n'}
            </span>
          ))}
        </pre>
      ) : null}
    </div>
  )
}

function Entry({ entry, current, fresh }: { entry: ChangelogEntry; current?: boolean; fresh?: boolean }) {
  return (
    <article className={`cl-entry${fresh ? ' is-fresh' : ''}`}>
      <div className="cl-entry-head">
        <span className="cl-version">{entry.version}</span>
        {entry.date ? <time>{entry.date}</time> : null}
        {current ? <span className="cl-tag">installée</span> : null}
        {fresh ? <span className="cl-tag is-new">nouvelle</span> : null}
        {entry.desktop ? (
          <span className="cl-tag is-desktop" title="Cette version demande une appli de bureau au moins aussi récente">
            💻 appli {entry.desktop} requise
          </span>
        ) : null}
      </div>
      <ul>
        {entry.items.map((item, i) => (
          // « (#44) » : utile dans le fichier, pas pour qui lit les nouveautés.
          <li key={i}>{inline(item.replace(/\s*\((?:#\d+(?:,\s*)?)+\)/g, ''))}</li>
        ))}
      </ul>
    </article>
  )
}
