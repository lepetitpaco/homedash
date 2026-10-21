import { useEffect, useState } from 'react'
import { template } from '../lib/config'
import type { CiState, GithubData } from '../lib/ghboard'
import type { LocalData, LocalRepo } from '../lib/local'
import { noteTitle } from '../lib/notes'
import type { Health, ReposConfig } from '../types'
import Favicon from './Favicon'
import { plainHit, type Hit } from './SearchResults'

type Props = {
  hit: Hit
  favicons: boolean
  faviconProvider: string
  health: Record<string, Health>
  /** Nombre d'ouvertures par id (data/usage.json). */
  counts: Record<string, number>
  gh: GithubData | null
  repos: ReposConfig | undefined
  local: LocalData | null
  onOpenLocal: () => void
  copiedKey: string | null
  infoColor: string
  noteColor: string
  noteIcon: string
  copy: (key: string, value: string) => Promise<void>
  onActivate: (hit: Hit) => void
}

const HEALTH: Record<Health, string> = {
  unknown: '',
  checking: '⏳ test en cours',
  up: '🟢 en ligne',
  down: '🔴 injoignable',
}

const CI_ICON: Record<CiState, string> = { pass: '✅', fail: '❌', pending: '⏳', unknown: '·' }

/**
 * La carte de l'élément sélectionné dans la recherche : tout ce qu'on sait de
 * lui et ses actions, au lieu d'une simple ligne. Elle suit la sélection
 * (flèches, survol) ; la `key` sur le hit relance l'animation d'entrée.
 */
export default function SearchPreview(props: Props) {
  const { hit } = props
  return (
    <aside className="sp" key={hit.key} aria-live="polite">
      {hit.kind === 'link' ? (
        <LinkPreview {...props} hit={hit} />
      ) : hit.kind === 'repo' ? (
        <RepoPreview {...props} hit={hit} />
      ) : hit.kind === 'pr' ? (
        <PrPreview {...props} hit={hit} />
      ) : hit.kind === 'branch' ? (
        <BranchPreview {...props} hit={hit} />
      ) : hit.kind === 'local' ? (
        <div className="sp-card" style={{ ['--accent' as string]: '#94a3b8' }}>
          <LocalHead repo={hit.local} />
          <LocalBody {...props} repo={hit.local} />
        </div>
      ) : hit.kind === 'info' ? (
        <InfoPreview {...props} hit={hit} />
      ) : hit.kind === 'note' ? (
        <NotePreview {...props} hit={hit} />
      ) : (
        <PlainPreview {...props} hit={hit} />
      )}
    </aside>
  )
}

function LinkPreview({
  hit,
  favicons,
  faviconProvider,
  health,
  counts,
  copiedKey,
  copy,
  onActivate,
}: Props & { hit: Extract<Hit, { kind: 'link' }> }) {
  const { link } = hit
  const state = link.check ? HEALTH[health[link.id] ?? 'unknown'] : ''
  const opened = counts[link.id] ?? 0
  return (
    <div className="sp-card" style={{ ['--accent' as string]: link.color }}>
      <div className="sp-head">
        <span className="sp-icon">
          <Favicon url={link.url} name={link.name} color={link.color} enabled={favicons} provider={faviconProvider} />
        </span>
        <div className="sp-title">
          <strong>{link.name}</strong>
          <span className="sp-chip">
            {link.icon} {link.group}
          </span>
        </div>
      </div>
      <code className="sp-url">{link.url}</code>
      {link.note ? <p className="sp-note">{link.note}</p> : null}
      <div className="sp-facts">
        {link.pinned ? <span>📌 épinglé</span> : null}
        {state ? <span>{state}</span> : null}
        <span>{opened ? `ouvert ${opened} fois` : 'jamais ouvert d’ici'}</span>
        {link.tags ? <span>🏷 {link.tags}</span> : null}
      </div>
      <div className="sp-actions">
        <a className="btn btn-primary" href={link.url} target="_blank" rel="noreferrer" onClick={() => onActivate(hit)}>
          Ouvrir ↗
        </a>
        <button className="btn" onClick={() => void copy(`sp:${hit.key}`, link.url)}>
          {copiedKey === `sp:${hit.key}` ? '✓ copiée' : 'Copier l’URL'}
        </button>
      </div>
    </div>
  )
}

function RepoPreview(props: Props & { hit: Extract<Hit, { kind: 'repo' }> }) {
  const { hit, gh, repos, counts, copiedKey, copy, onActivate } = props
  const { repo, owner } = hit
  const base = `https://github.com/${owner}/${repo.name}`
  const vars = { owner, repo: repo.name, me: repos?.me ?? '' }
  const data = gh?.enabled ? gh : null
  const prs = data ? data.prs.filter((p) => p.repo === repo.name) : []
  const branches = data ? data.branches.active.filter((b) => b.repo === repo.name) : []
  const clone = repos?.cloneTemplate ? template(repos.cloneTemplate, vars) : null
  const opened = counts[`repo:${owner}/${repo.name}`] ?? 0
  // Le même repo cloné sur le disque : sa carte réunit les deux côtés.
  const onDisk = props.local?.repos?.find(
    (r) => (r.repo ?? r.name).toLowerCase() === repo.name.toLowerCase(),
  )
  return (
    <div className="sp-card" style={{ ['--accent' as string]: repos?.color ?? '#a78bfa' }}>
      <div className="sp-head">
        <span className="sp-icon sp-emoji">{repos?.icon ?? '🐙'}</span>
        <div className="sp-title">
          <strong>{repo.name}</strong>
          <span className="sp-chip">
            {owner}
            {repo.note ? ` · ${repo.note}` : ''}
          </span>
        </div>
      </div>

      {data ? (
        <>
          <div className="sp-section">
            🔀 PRs ouvertes <b>{prs.length}</b>
          </div>
          {prs.length ? (
            <ul className="sp-list">
              {prs.slice(0, 5).map((p) => (
                <li key={p.number}>
                  <a href={p.url} target="_blank" rel="noreferrer">
                    <span title={p.ci.label}>{CI_ICON[p.ci.state]}</span> #{p.number} {p.title}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sp-empty">aucune</p>
          )}
          <div className="sp-section">
            🌿 Branches actives <b>{branches.length}</b>
          </div>
          {branches.length ? (
            <ul className="sp-list">
              {branches.slice(0, 5).map((b) => (
                <li key={b.name}>
                  <a href={b.url} target="_blank" rel="noreferrer">
                    {b.name}
                    {b.pr ? <em> · PR #{b.pr.number}</em> : null}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sp-empty">aucune</p>
          )}
        </>
      ) : (
        <p className="sp-empty">Connecte GitHub (Réglages) pour voir ses PRs et branches ici.</p>
      )}

      {onDisk ? (
        <>
          <div className="sp-section sp-divider">💻 Sur ton disque · {onDisk.display}</div>
          <LocalBody {...props} repo={onDisk} />
        </>
      ) : null}

      <div className="sp-facts">
        <span>{opened ? `ouvert ${opened} fois` : 'jamais ouvert d’ici'}</span>
      </div>
      <div className="sp-actions">
        <a className="btn btn-primary" href={base} target="_blank" rel="noreferrer" onClick={() => onActivate(hit)}>
          Ouvrir sur GitHub ↗
        </a>
        {(repos?.actions ?? []).map((a) => (
          <a
            key={a.label}
            className="btn"
            href={`${base}${template(a.path, vars)}`}
            target="_blank"
            rel="noreferrer"
          >
            {a.label}
          </a>
        ))}
        {clone ? (
          <button className="btn" title={clone} onClick={() => void copy(`sp:${hit.key}`, clone)}>
            {copiedKey === `sp:${hit.key}` ? '✓ copié' : (repos?.cloneLabel ?? 'clone')}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function InfoPreview({
  hit,
  infoColor,
  copiedKey,
  onActivate,
}: Props & { hit: Extract<Hit, { kind: 'info' }> }) {
  const { item, group } = hit
  // Volontairement remis à zéro à chaque carte : un secret ne reste pas affiché.
  const [shown, setShown] = useState(false)
  useEffect(() => setShown(false), [hit.key])
  const color = group.color ?? infoColor
  const masked = item.secret && !shown
  return (
    <div className="sp-card" style={{ ['--accent' as string]: color }}>
      <div className="sp-head">
        <span className="sp-icon sp-emoji">{group.icon ?? '🔑'}</span>
        <div className="sp-title">
          <strong>{item.label}</strong>
          <span className="sp-chip">{group.title}</span>
        </div>
      </div>
      <code className={`sp-value${masked ? ' is-masked' : ''}`}>{masked ? '••••••••••' : item.value}</code>
      {item.note ? <p className="sp-note">{item.note}</p> : null}
      <div className="sp-actions">
        <button className="btn btn-primary" onClick={() => onActivate(hit)}>
          {copiedKey === hit.key ? '✓ copié' : 'Copier'}
        </button>
        {item.secret ? (
          <button className="btn" onClick={() => setShown((v) => !v)}>
            {shown ? '🙈 masquer' : '👁 afficher'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function NotePreview({
  hit,
  noteColor,
  noteIcon,
  onActivate,
}: Props & { hit: Extract<Hit, { kind: 'note' }> }) {
  return (
    <div className="sp-card" style={{ ['--accent' as string]: noteColor }}>
      <div className="sp-head">
        <span className="sp-icon sp-emoji">{noteIcon}</span>
        <div className="sp-title">
          <strong>{noteTitle(hit.note.text)}</strong>
          <span className="sp-chip">note</span>
        </div>
      </div>
      <pre className="sp-text">{hit.note.text}</pre>
      <div className="sp-actions">
        <button className="btn btn-primary" onClick={() => onActivate(hit)}>
          Ouvrir la note
        </button>
      </div>
    </div>
  )
}

/** Adresse, recherche web, onglet, page de l'historique, action : une carte simple. */
function PlainPreview({ hit, onActivate }: Props) {
  const p = plainHit(hit)
  if (!p) return null
  const when = hit.kind === 'page' ? new Date(hit.visit.ts) : null
  return (
    <div className="sp-card" style={{ ['--accent' as string]: p.color }}>
      <div className="sp-head">
        <span className="sp-icon sp-emoji">{p.icon}</span>
        <div className="sp-title">
          <strong>{p.name}</strong>
          <span className="sp-chip">{p.chip}</span>
        </div>
      </div>
      {p.sub ? <code className="sp-url">{p.sub}</code> : null}
      {hit.kind === 'page' && when ? (
        <div className="sp-facts">
          <span>vue {hit.visit.n} fois</span>
          <span>dernière fois le {when.toLocaleDateString('fr-FR')} à {when.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      ) : null}
      <div className="sp-actions">
        <button className="btn btn-primary" onClick={() => onActivate(hit)}>
          {p.action} ⏎
        </button>
      </div>
    </div>
  )
}

function PrPreview({ hit }: Props & { hit: Extract<Hit, { kind: 'pr' }> }) {
  const { pr, merged } = hit
  const failing = pr.ci.checks.filter((c) => c.state === 'fail').slice(0, 5)
  return (
    <div className="sp-card" style={{ ['--accent' as string]: merged ? '#a78bfa' : '#60a5fa' }}>
      <div className="sp-head">
        <span className="sp-icon sp-emoji">🔀</span>
        <div className="sp-title">
          <strong>{pr.title}</strong>
          <span className="sp-chip">
            {pr.repo} #{pr.number}
            {merged ? ' · mergée' : ''}
          </span>
        </div>
      </div>
      <div className="sp-facts">
        <span>
          {CI_ICON[pr.ci.state]} CI : {pr.ci.label || pr.ci.state}
        </span>
        {pr.branch ? <span>🌿 {pr.branch}</span> : null}
        {pr.version ? <span>📦 {pr.version}</span> : null}
        {merged && pr.merged_at ? <span>mergée {pr.merged_at.slice(0, 10)}</span> : null}
        {!merged && pr.created_at ? <span>ouverte {pr.created_at.slice(0, 10)}</span> : null}
      </div>
      {failing.length ? (
        <>
          <div className="sp-section">❌ Vérifications en échec</div>
          <ul className="sp-list">
            {failing.map((c) => (
              <li key={c.name}>
                <a href={c.url} target="_blank" rel="noreferrer">
                  {c.icon} {c.name}
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <div className="sp-actions">
        <a className="btn btn-primary" href={pr.url} target="_blank" rel="noreferrer">
          Ouvrir la PR ↗
        </a>
      </div>
    </div>
  )
}

function BranchPreview({ hit }: Props & { hit: Extract<Hit, { kind: 'branch' }> }) {
  const { branch: b } = hit
  return (
    <div className="sp-card" style={{ ['--accent' as string]: '#3fb950' }}>
      <div className="sp-head">
        <span className="sp-icon sp-emoji">🌿</span>
        <div className="sp-title">
          <strong>{b.name}</strong>
          <span className="sp-chip">{b.repo}</span>
        </div>
      </div>
      <div className="sp-facts">
        <span>{b.merged ? '✓ mergée' : `${b.ahead} commit(s) d’avance sur ${b.base}`}</span>
        {b.creator ? <span>👤 {b.creator}</span> : null}
        {b.authors.length > 1 ? <span>👥 {b.authors.join(', ')}</span> : null}
        {b.date ? <span>dernier commit {b.date.slice(0, 10)}</span> : null}
      </div>
      <div className="sp-actions">
        <a className="btn btn-primary" href={b.url} target="_blank" rel="noreferrer">
          Ouvrir la branche ↗
        </a>
        {b.pr ? (
          <a className="btn" href={b.pr.url} target="_blank" rel="noreferrer">
            PR #{b.pr.number}
            {b.pr.merged ? ' (mergée)' : ''}
          </a>
        ) : null}
      </div>
    </div>
  )
}

function LocalHead({ repo }: { repo: LocalRepo }) {
  return (
    <div className="sp-head">
      <span className="sp-icon sp-emoji">💻</span>
      <div className="sp-title">
        <strong>{repo.name}</strong>
        <span className="sp-chip">{repo.display}</span>
      </div>
    </div>
  )
}

/**
 * L'état d'un dépôt du disque, en lecture seule comme l'onglet Local : les
 * commandes sont du texte à copier.
 */
function LocalBody({ repo, copiedKey, copy, onOpenLocal }: Props & { repo: LocalRepo }) {
  const toDelete = repo.branches.filter((b) => b.action.kind === 'delete')
  const toCheck = repo.branches.filter((b) => b.action.kind === 'check')
  const cmd = repo.commands[0]
  return (
    <>
      {repo.error ? <p className="sp-empty">⚠ {repo.error}</p> : null}
      <div className="sp-facts">
        <span>📍 {repo.detached ? 'HEAD détachée' : (repo.head ?? '?')}</span>
        <span>{repo.counts.branches} branche(s)</span>
        {repo.dirty?.count ? <span>✏️ {repo.dirty.count} fichier(s) modifié(s)</span> : null}
        {repo.stashes ? <span>📦 {repo.stashes} stash</span> : null}
        {repo.counts.unpushed ? <span>⬆ {repo.counts.unpushed} à pousser</span> : null}
      </div>
      {toDelete.length || toCheck.length ? (
        <ul className="sp-list sp-plain">
          {toDelete.slice(0, 5).map((b) => (
            <li key={b.name}>🗑 {b.name}</li>
          ))}
          {toCheck.slice(0, 3).map((b) => (
            <li key={b.name}>🔍 {b.name}</li>
          ))}
        </ul>
      ) : (
        <p className="sp-empty">✓ rien à nettoyer</p>
      )}
      <div className="sp-actions">
        {cmd ? (
          <button className="btn" title={cmd.cmd} onClick={() => void copy(`sp:cmd:${repo.path}`, cmd.cmd)}>
            {copiedKey === `sp:cmd:${repo.path}` ? '✓ copiée' : `Copier : ${cmd.label}`}
          </button>
        ) : null}
        <button className="btn" onClick={onOpenLocal}>
          Voir dans l’onglet Local
        </button>
      </div>
    </>
  )
}
