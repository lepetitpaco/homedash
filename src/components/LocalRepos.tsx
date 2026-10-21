import { useCallback, useMemo, useState } from 'react'
import { GhCard, GhEmpty } from './GhCard'
import Masonry from './Masonry'
import { agoShort, isCalm, type LocalBranch, type LocalCommand, type LocalData, type LocalRepo }
  from '../lib/local'

// Préférence d'affichage, donc locale au navigateur — comme le thème et l'état
// replié des catégories. Rien de tout ça n'a sa place dans config.json, qui
// décrit la page et non la façon dont un poste donné la regarde.
const TODO_KEY = 'homedash:local-only-todo'

/** Étiquette et couleur par état. L'ordre de gravité vient déjà du backend. */
const STATE: Record<string, { label: string; cls: string; title: string }> = {
  gone:          { label: 'effacée du distant', cls: 'is-danger',
                   title: "Poussée par le passé puis supprimée sur GitHub, avec des commits qui ne sont pas dans la branche par défaut" },
  'closed-pr':   { label: 'PR fermée',        cls: 'is-danger',
                   title: 'PR fermée sans merge et branche absente du distant' },
  squashed:      { label: 'PR mergée',        cls: 'is-warn',
                   title: 'La PR est mergée : le contenu est sur le distant, mais pas sous ce sha — squash/rebase, ou master local pas encore fetché' },
  // Ces deux libellés disent l'état du *distant* : répéter « à supprimer », déjà
  // écrit dans la colonne de gauche, ne remplissait que du pixel.
  'gone-merged': { label: 'mergée',           cls: 'is-ok',
                   title: 'Mergée dans la branche par défaut, et déjà supprimée sur GitHub' },
  merged:        { label: 'mergée · en ligne', cls: 'is-ok',
                   title: 'Mergée, mais la branche existe encore sur GitHub — à supprimer là-bas aussi' },
  'local-only':  { label: 'jamais poussée',   cls: 'is-warn',
                   title: "Ni ref distant, ni amont configuré, ni PR : ce travail n'a jamais quitté ce disque" },
  diverged:      { label: 'divergée',         cls: 'is-warn',
                   title: 'Des commits des deux côtés' },
  unpushed:      { label: 'à pousser',        cls: 'is-info',
                   title: 'En avance sur sa branche distante' },
  behind:        { label: 'en retard',        cls: 'is-info',
                   title: 'En retard sur le distant' },
  unknown:       { label: 'non comparée',     cls: 'is-info',
                   title: 'Existe sur GitHub, mais pas de copie locale de la branche distante : git fetch pour comparer' },
  ok:            { label: 'à jour',           cls: 'is-mute', title: 'Rien à faire' },
  protected:     { label: 'référence',        cls: 'is-mute', title: 'Branche de référence' },
}

function Copy({ cmd, onCopy, copied }: { cmd: string; onCopy: (c: string) => void; copied: boolean }) {
  return (
    <button className={`loc-copy${copied ? ' is-copied' : ''}`} onClick={() => onCopy(cmd)}
      title="Copier la commande — rien n'est lancé depuis cette page">
      {copied ? '✓ copié' : '⧉ copier'}
    </button>
  )
}

function Command({ c, copied, onCopy }: {
  c: LocalCommand
  copied: string | null
  onCopy: (cmd: string) => void
}) {
  return (
    <div className={`loc-cmd${c.danger ? ' is-danger' : ''}`}>
      <div className="loc-cmd-head">
        <span className="loc-cmd-label">{c.danger ? '⚠ ' : ''}{c.label}</span>
        <Copy cmd={c.cmd} onCopy={onCopy} copied={copied === c.cmd} />
      </div>
      <code className="loc-cmd-line">{c.cmd}</code>
      <p className="loc-cmd-hint">{c.hint}</p>
    </div>
  )
}

function BranchRow({ b, repo }: { b: LocalBranch; repo: LocalRepo }) {
  const meta = STATE[b.state] ?? STATE.ok
  // On ne lie que ce qui existe vraiment en face : `on_github` quand on l'a,
  // le ref distant local sinon. Un lien 404 vaut moins que pas de lien.
  const onRemote = b.on_github ?? b.remote_ref
  const url = repo.url && onRemote ? `${repo.url}/tree/${encodeURIComponent(b.name)}` : null
  const gap = [
    b.ahead_default ? `${b.ahead_default}↑` : null,
    b.behind_default ? `${b.behind_default}↓` : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={`gh-row loc-row is-${b.action.kind}${b.current ? ' is-current' : ''}`}>
      {/* Colonne de gauche : la conclusion, et rien d'autre. C'est elle qu'on lit
          en diagonale sur vingt-cinq lignes. */}
      <span className={`loc-action is-${b.action.kind}`} title={b.action.detail}>
        {b.action.label}
      </span>

      <div className="gh-main">
        <div className="gh-line">
          {url ? (
            <a className="gh-branch" href={url} target="_blank" rel="noreferrer" title={b.name}>
              {b.name}
            </a>
          ) : (
            <span className="gh-branch" title={`${b.name} — absente du distant`}>
              {b.name}
            </span>
          )}
          <span className={`loc-safe is-${b.safety.level}`} title={b.safety.detail}>
            {b.safety.label}
          </span>
          {b.delete ? (
            <code className="loc-flag" title={`git branch ${b.delete} ${b.name}`}>
              {b.delete}
            </code>
          ) : null}
        </div>
        <div className="gh-meta" title={`${b.short} · ${b.subject}`}>
          {b.advice}
          {b.pr ? (
            <>
              {' · '}
              <a className="gh-link" href={b.pr.url} target="_blank" rel="noreferrer">
                PR #{b.pr.number}
              </a>
            </>
          ) : null}
        </div>
      </div>

      <div className="gh-right">
        <span className={`gh-badge ${meta.cls}`} title={meta.title}>
          {meta.label}
        </span>
        {gap ? (
          <span className="gh-sub" title={`vs origin/${repo.default_branch ?? 'défaut'} — ${
            b.ahead_default} devant, ${b.behind_default} derrière`}>
            {gap}
            {b.capped ? '+' : ''}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function RepoCardLocal({ repo, copied, onCopy, onRefresh, refreshing }: {
  repo: LocalRepo
  copied: string | null
  onCopy: (cmd: string) => void
  onRefresh: () => void
  refreshing: boolean
}) {
  const [showCalm, setShowCalm] = useState(false)
  const [showCmds, setShowCmds] = useState(false)
  const busy = repo.branches.filter((b) => !isCalm(b))
  const calm = repo.branches.filter(isCalm)
  const { deletable, squashed, risky } = repo.counts

  return (
    <GhCard
      icon="📁"
      title={repo.name}
      count={repo.counts.branches}
      color={risky ? '#f85149' : deletable || squashed ? '#fbbf24' : '#34d399'}
      // Un ↻ par carte pour ne pas remonter à la barre : la relecture est de
      // toute façon globale (0,2 s pour tous les dépôts), l'infobulle le dit.
      onRefresh={onRefresh}
      refreshTitle="Relire tous les dépôts sur le disque — aucune commande git n'est lancée"
      building={refreshing}
      actions={
        <span className="loc-head-tags">
          {deletable + squashed > 0 ? (
            <span className="gh-tag is-wait-ready"
              title="Branches mergées qui traînent encore sur ce disque : leur contenu est déjà dans la branche par défaut">
              {deletable + squashed} à supprimer
            </span>
          ) : null}
          {repo.counts.at_risk > 0 ? (
            <span className="gh-tag is-wait-blocked"
              title="Branches dont des commits n'existent nulle part ailleurs — ne rien supprimer ici">
              {repo.counts.at_risk} à garder
            </span>
          ) : (
            <span className="gh-tag is-safe" title="Aucune branche de ce dépôt ne contient de travail unique : rien ne peut être perdu">
              🛡 tout sauvegardé
            </span>
          )}
          {repo.head ? (
            <span className="loc-head" title={repo.detached ? 'HEAD détachée' : 'branche courante'}>
              {repo.detached ? '⚠ ' : ''}
              {repo.head}
            </span>
          ) : null}
          {repo.dirty?.count ? (
            <span className="gh-tag is-wait-blocked" title="Fichiers suivis modifiés">
              {repo.dirty.count} modif{repo.dirty.count > 1 ? 's' : ''}
            </span>
          ) : null}
          {repo.stashes ? (
            <span className="gh-tag is-contributor" title="Remises en attente">
              {repo.stashes} stash
            </span>
          ) : null}
          {!repo.linked ? (
            <span className="gh-tag is-merged"
              title="Ce dépôt n'est pas dans Réglages → Repos suivis : l'état en ligne vient de ton disque, peut-être pas à jour (git fetch)">
              hors GitHub
            </span>
          ) : null}
        </span>
      }
    >
      {repo.error ? <GhEmpty>⚠ {repo.error}</GhEmpty> : null}

      <div className="loc-sub">
        <span title={repo.path}>{repo.display}</span>
        <span className={repo.fetched_at && Date.now() / 1000 - repo.fetched_at > 86400
          ? 'loc-stale' : undefined}
          title="Dernier `git fetch` — au-delà d'un jour, l'état du distant se discute">
          fetch {agoShort(repo.fetched_at)}
        </span>
      </div>

      {busy.length === 0 && calm.length > 0 ? (
        <GhEmpty>Rien à nettoyer — {calm.length} branche{calm.length > 1 ? 's' : ''} à jour</GhEmpty>
      ) : null}
      {busy.map((b) => (
        <BranchRow key={b.name} b={b} repo={repo} />
      ))}

      {calm.length > 0 && busy.length > 0 ? (
        <>
          <button className="gh-cleanup" onClick={() => setShowCalm((v) => !v)}>
            {showCalm
              ? '▾ masquer les branches sans rien à signaler'
              : `▸ ${calm.length} branche${calm.length > 1 ? 's' : ''} sans rien à signaler`}
          </button>
          {showCalm ? calm.map((b) => <BranchRow key={b.name} b={b} repo={repo} />) : null}
        </>
      ) : null}

      {repo.commands.length > 0 ? (
        <>
          <button className="gh-cleanup" onClick={() => setShowCmds((v) => !v)}>
            {showCmds ? '▾ masquer les commandes' : `▸ ${repo.commands.length} commande(s) à copier`}
          </button>
          {showCmds ? (
            <div className="loc-cmds">
              {repo.commands.map((c) => (
                <Command key={c.id} c={c} copied={copied} onCopy={onCopy} />
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </GhCard>
  )
}

/** Dossier affiché dans l'onglet Local, quand il y en a plusieurs. */
const ROOT_KEY = 'homedash:local-root'

export default function LocalRepos({ data, error, busy, onRefresh, onSettings, columns, cardWidth }: {
  data: LocalData | null
  error: string | null
  busy: boolean
  onRefresh: () => void
  /** Ouvre Réglages : c'est là que se choisissent les dossiers lus. */
  onSettings: () => void
  /** Réglages → Affichage, comme l'onglet GitHub. */
  columns: number
  cardWidth: number
}) {
  const [copied, setCopied] = useState<string | null>(null)
  const [copyError, setCopyError] = useState(false)
  const [onlyTodo, setOnlyTodo] = useState(() => {
    try {
      return localStorage.getItem(TODO_KEY) === 'on'
    } catch {
      return false
    }
  })

  const toggleOnlyTodo = useCallback(() => {
    setOnlyTodo((v) => {
      const next = !v
      try {
        localStorage.setItem(TODO_KEY, next ? 'on' : 'off')
      } catch {
        /* stockage indisponible */
      }
      return next
    })
  }, [])

  const onCopy = useCallback((cmd: string) => {
    // En http://<ip>:7777 depuis une autre machine, `navigator.clipboard` n'est
    // pas seulement refusé : il est absent, et l'appel jette avant de rendre une
    // promesse. La commande reste sélectionnable à la main (`user-select: all`).
    try {
      const done = navigator.clipboard?.writeText(cmd)
      if (!done) {
        setCopyError(true)
        return
      }
      void done
        .then(() => {
          setCopyError(false)
          setCopied(cmd)
          window.setTimeout(() => setCopied((c) => (c === cmd ? null : c)), 1600)
        })
        .catch(() => setCopyError(true))
    } catch {
      setCopyError(true)
    }
  }, [])

  // Plusieurs dossiers lus (boulot, perso…) : un onglet par dossier. Le choix
  // est une préférence d'affichage, gardée par navigateur.
  const [root, setRoot] = useState(() => {
    try {
      return localStorage.getItem(ROOT_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const roots = data?.roots ?? []
  const activeRoot = roots.includes(root) ? root : ''
  const pickRoot = (r: string) => {
    setRoot(r)
    try {
      localStorage.setItem(ROOT_KEY, r)
    } catch {
      /* stockage indisponible */
    }
  }
  const inRoot = (r: { display: string }, base: string) =>
    !base || r.display === base || r.display.startsWith(base + '/')

  const repos = useMemo(() => {
    if (!data) return []
    const here = data.repos.filter((r) => inRoot(r, activeRoot))
    return onlyTodo ? here.filter((r) => r.branches.some((b) => !isCalm(b)) || r.error) : here
  }, [data, onlyTodo, activeRoot])

  const tally = (base: string) => {
    const here = (data?.repos ?? []).filter((r) => inRoot(r, base))
    return {
      repos: here.length,
      todo: here.reduce((n, r) => n + (r.counts.deletable ?? 0) + (r.counts.squashed ?? 0), 0),
    }
  }

  if (data && !data.enabled) {
    return (
      <div className="card fatal">
        <h1>Onglet Local indisponible</h1>
        <p>{data.error ?? data.hint}</p>
        <p className="muted">
          Choisis le ou les dossiers qui contiennent tes clones git (boulot, perso…). Ils sont lus
          en lecture seule : le backend ne sait que lire, et le dossier personnel est monté{' '}
          <code>:ro</code>.
        </p>
        <p>
          <button className="gh-bar-btn" onClick={onSettings}>
            ⚙ choisir les dossiers
          </button>
        </p>
      </div>
    )
  }

  const t = data?.totals

  return (
    <>
      <div className="gh-bar">
        <div className="gh-bar-user">
          <span>Dépôts locaux</span>
          <strong>{t?.repos ?? '—'}</strong>
        </div>
        <div className="gh-bar-sep" />
        <div className="gh-bar-stats">
          {t ? (
            <>
              {t.branches} branches · <b className="loc-num is-ok">{t.deletable + t.squashed}</b>{' '}
              à supprimer ·{' '}
              {t.at_risk ? (
                <b className="loc-num is-danger" title="Branches contenant des commits qui n'existent nulle part ailleurs">
                  {t.at_risk} à garder
                </b>
              ) : (
                <b className="loc-num is-ok" title="Aucune branche locale ne contient de travail unique">
                  🛡 rien à perdre
                </b>
              )}
              {t.unpushed ? <> · {t.unpushed} à pousser</> : null}
              {t.dirty ? <> · {t.dirty} dépôt(s) modifié(s)</> : null}
            </>
          ) : (
            'lecture…'
          )}
        </div>
        {error ? <span className="gh-bar-err">⚠ {error}</span> : null}
        {data?.error ? <span className="gh-bar-err">⚠ {data.error}</span> : null}
        {copyError ? (
          <span className="gh-bar-err">
            presse-papier refusé — contexte non sécurisé, sélectionner la ligne à la main
          </span>
        ) : null}
        <div className="gh-bar-right">
          <span className="gh-bar-stats"
            title={
              (data?.watching
                ? `Les fichiers .git sont surveillés toutes les ${data.watch} s : un `
                  + `git fetch ou un git branch -d lancé dans un terminal rafraîchit `
                  + `cette page tout seul.`
                : 'Surveillance automatique désactivée dans tes réglages.') +
              ` Dernier scan en ${(data?.took ?? 0).toFixed(2)} s.`
            }>
            {data?.watching ? '👀 ' : ''}
            {agoShort(data?.updated_at ?? null)}
            {data?.trigger ? ` · ${data.trigger}` : ''}
          </span>
          <button className={`gh-bar-btn${onlyTodo ? ' is-auto is-on' : ''}`}
            onClick={toggleOnlyTodo}
            title="Filtre d'affichage : cache les dépôts dont toutes les branches sont à jour. Ne touche à rien.">
            {onlyTodo ? '👁 tout afficher' : '🧹 masquer les dépôts propres'}
          </button>
          <button className="gh-bar-btn" onClick={onRefresh} disabled={busy}
            title="Relit les fichiers .git sur le disque immédiatement, sans attendre le cycle automatique. Aucune commande git, aucun accès réseau.">
            {busy ? '⟳ lecture…' : '↻ relire le disque'}
          </button>
        </div>
      </div>
      {busy ? <div className="gh-progress" /> : null}

      {roots.length > 1 ? (
        <div className="loc-roots-tabs" role="tablist" aria-label="Dossier affiché">
          {['', ...roots].map((r) => {
            const t = tally(r)
            return (
              <button
                key={r || 'all'}
                role="tab"
                aria-selected={r === activeRoot}
                className={`gh-account${r === activeRoot ? ' is-active' : ''}`}
                onClick={() => pickRoot(r)}
                title={r ? `Dépôts sous ${r}` : 'Tous les dossiers lus'}
              >
                {r ? `📁 ${r}` : 'Tous'}
                <span className="loc-roots-count">{t.repos}</span>
                {t.todo ? <span className="loc-roots-todo">🧹 {t.todo}</span> : null}
              </button>
            )
          })}
        </div>
      ) : null}

      <p className="loc-warning">
        <span className="loc-lock">🔒 lecture seule</span>
        Le backend relit les fichiers <code>.git</code> lui-même : aucune commande git n'est
        lancée, aucun fichier n'est ouvert en écriture, et le dossier est monté{' '}
        <code>:ro</code> dans le conteneur. Les commandes ci-dessous sont du texte à copier —
        rien ne part d'ici.
        {data?.roots?.length ? (
          <span className="loc-roots">
            {' '}Dossiers lus : {data.roots.map((r, i) => (
              <span key={r}>
                {i ? ', ' : ''}
                <code>{r}</code>
              </span>
            ))}{' '}
            · <button className="loc-roots-edit" onClick={onSettings}>modifier</button>
          </span>
        ) : null}
      </p>

      {data?.global_commands?.length ? (
        <div className="loc-cmds is-global">
          {data.global_commands.map((c) => (
            <Command key={c.id} c={c} copied={copied} onCopy={onCopy} />
          ))}
        </div>
      ) : null}

      <Masonry
        className="gh-page"
        columns={columns}
        minWidth={cardWidth}
        items={repos.map((r) => ({
          key: r.path,
          node: (
            <RepoCardLocal repo={r} copied={copied} onCopy={onCopy} onRefresh={onRefresh} refreshing={busy} />
          ),
        }))}
      />
      {data && repos.length === 0 ? (
        <GhEmpty>
          {onlyTodo ? 'Rien à traiter — tout est propre.' : 'Aucun dépôt trouvé sous les racines configurées.'}
        </GhEmpty>
      ) : null}
    </>
  )
}
