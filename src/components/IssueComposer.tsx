import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Markdown } from '../lib/markdown'
import Pick from './Pick'
import Thread, { hue, initials } from './Thread'

type Repo = { account: string; repo: string }
export type ComposerComment = { id: string | number; who: string; date: string; text: string }

const repoId = (r: Repo) => `${r.account} ${r.repo}`

/** Pour l'aperçu : ce qu'on a choisi, sans le lien ni la consigne ajoutés autour. */
const needOf = (body: string) => /## Besoin\n+([\s\S]*?)\n+---\n/.exec(body)?.[1] ?? body
/** « Créée par » : avatar et nom dans la couleur de la personne (comme ses messages), puis la date. */
function Author({ who, date }: { who: string; date: string }) {
  const d = new Date(date)
  const day = Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <div className="ic-author" style={{ '--hue': hue(who) } as CSSProperties}>
      <span className="th-avatar" aria-hidden="true">{initials(who)}</span>
      <span>Créée par <strong>{who}</strong></span>
      {day ? <time>{day}</time> : null}
    </div>
  )
}

type Props = {
  /** « la tâche » ou « la carte », et le service, dans les phrases. */
  noun: string
  service: string
  sourceTitle: string
  where?: string
  /** Lire (la fiche) ou préparer l'issue, à l'ouverture. */
  start: 'read' | 'issue'
  /** La description, telle qu'elle s'affiche. */
  description: string
  /** Qui a créé la source, et quand (ISO) : en tête de la description. */
  author?: { who: string; date: string } | null
  /** Ce qui l'accompagne : images, étapes. */
  extra?: ReactNode
  /** La description et ses étapes partent dans l'issue. */
  descPicked: boolean
  onDescPicked: (on: boolean) => void
  repos: Repo[]
  repo: Repo | null
  onRepo: (r: Repo) => void
  title: string
  onTitle: (v: string) => void
  need: string
  onNeed: (v: string) => void
  reading: boolean
  comments: ComposerComment[]
  renderText?: (text: string) => string
  isPicked: (id: ComposerComment['id']) => boolean
  onToggle: (id: ComposerComment['id']) => void
  /** Retenir ces échanges, et seulement eux. */
  onPick: (ids: ComposerComment['id'][]) => void
  /** Le message d'où l'on vient. */
  from?: ComposerComment['id']
  /** Issues déjà liées. */
  issues: { repo: string; number: number; url: string; title: string; state: string; report?: unknown }[]
  /** Le texte complet de l'issue, pour l'aperçu. */
  body: () => string
  busy: boolean
  error: string
  made: { number: number; url: string } | null
  copied: string
  prompt: string
  command: string
  onCopy: (what: 'command' | 'prompt', text: string) => void
  onCreate: () => void
  onForm: (outside: boolean) => void
  onSee: (outside: boolean) => void
  hasOutside: boolean
  onOpenSource: () => void
  onClose: () => void
}

/**
 * La fenêtre d'une tâche Basecamp ou d'une carte Trello, une seule : on y lit la
 * description et la conversation ; « Créer une issue » ouvre le formulaire à
 * côté, et chaque élément se coche pour partir, ou non, dans l'issue. Ne lit
 * ni ne crée rien : IssueHost et TrIssueHost s'en chargent.
 */
export default function IssueComposer(p: Props) {
  const [composing, setComposing] = useState(p.start === 'issue')
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const titleRef = useRef<HTMLInputElement>(null)
  const source = useRef<HTMLDivElement>(null)
  const canIssue = p.repos.length > 0
  const kept = p.comments.filter((c) => p.isPicked(c.id)).length + (p.description || p.extra ? (p.descPicked ? 1 : 0) : 0)
  const total = p.comments.length + (p.description || p.extra ? 1 : 0)
  const open = p.issues.filter((i) => i.state === 'open')

  useEffect(() => {
    if (composing) titleRef.current?.select()
  }, [composing])
  // Ouverte sur un échange : il vient à l'écran une fois la source lue.
  useEffect(() => {
    if (p.from === undefined || p.reading) return
    source.current?.querySelector(`[data-comment="${p.from}"]`)?.scrollIntoView({ block: 'center' })
  }, [p.from, p.reading])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) p.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const issueFrom = (id: ComposerComment['id']) => {
    p.onPick([id])
    p.onDescPicked(false)
    setComposing(true)
  }
  const all = (on: boolean) => {
    p.onPick(on ? p.comments.map((c) => c.id) : [])
    p.onDescPicked(on)
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (composing && e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !p.made) {
      e.preventDefault()
      p.onCreate()
    }
  }
  const picking = composing && !p.made

  return createPortal(
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div className={`modal ic${picking ? ' is-composing' : ''}`} role="dialog" aria-modal="true" aria-label={p.sourceTitle} onKeyDown={onKey}>
        <header className="ic-head">
          <div className="ic-head-text">
            <strong>{p.made ? `Issue #${p.made.number} créée` : p.sourceTitle}</strong>
            <span>{p.made ? `depuis ${p.noun} « ${p.sourceTitle} »` : p.where}</span>
          </div>
          <button className="icon-btn" aria-label="Fermer" title="Fermer (Échap)" onClick={p.onClose}>✕</button>
        </header>

        {p.made ? (
          <div className="ic-done">
            <p>
              Elle garde le lien vers {p.noun} : son rapport apparaîtra dans l'onglet {p.service} et dans la cloche.{' '}
              {p.copied === 'command'
                ? 'Cette commande est copiée : colle-la dans un terminal, Claude Code démarre dans le repo avec l’issue.'
                : p.copied === 'prompt'
                  ? 'Ce prompt est copié : colle-le dans Claude Code.'
                  : p.copied === 'failed'
                    ? 'La copie a échoué : sélectionne le texte ci-dessous pour le copier.'
                  : 'Pour la confier à Claude Code :'}
            </p>
            <pre className="issue-prompt">{p.command || p.prompt}</pre>
          </div>
        ) : (
          <div className="ic-panes">
            <section className="ic-source-pane" aria-label={p.sourceTitle}>
              {picking ? (
                <div className="ic-pane-head">
                  <strong>Dans l'issue</strong>
                  <span className="ic-count">{kept} sur {total}</span>
                  <span className="set-spacer" />
                  <button className="ic-link" onClick={() => all(true)}>Tout inclure</button>
                  <button className="ic-link" onClick={() => all(false)}>Rien inclure</button>
                </div>
              ) : null}
              <div className="ic-source" ref={source}>
                {!picking && p.issues.length ? (
                  <div className="task-issues">
                    {p.issues.map((i) => (
                      <a key={`${i.repo}#${i.number}`} href={i.url} target="_blank" rel="noreferrer" data-outside>
                        {i.state === 'closed' ? '✓' : '●'} {i.repo} #{i.number} — {i.title}
                        {i.report ? ' · rapport prêt' : ''}
                      </a>
                    ))}
                  </div>
                ) : null}
                {p.reading ? <p className="set-hint ic-pad">Lecture dans {p.service}…</p> : null}
                {!p.reading && (p.description || p.extra) ? (
                  <div
                    className={`ic-desc${picking ? ' is-picking' : ''}${picking && p.descPicked ? ' is-on' : ''}`}
                    onClick={picking ? (e) => !(e.target as HTMLElement).closest('a') && p.onDescPicked(!p.descPicked) : undefined}
                    role={picking ? 'checkbox' : undefined}
                    aria-checked={picking ? p.descPicked : undefined}
                    tabIndex={picking ? 0 : undefined}
                    onKeyDown={picking ? (e) => e.key === ' ' && (e.preventDefault(), p.onDescPicked(!p.descPicked)) : undefined}
                  >
                    <div className="ic-desc-top">
                      <strong>Description</strong>
                      {picking ? <span className="th-tick" aria-hidden="true">{p.descPicked ? '✓' : ''}</span> : null}
                    </div>
                    {p.author ? <Author {...p.author} /> : null}
                    {p.description ? <div className="th-text"><Markdown text={p.description} /></div> : null}
                    {p.extra}
                  </div>
                ) : null}
                {!p.reading && !p.description && !p.extra && !picking ? (
                  <div className="ic-pad">
                    {p.author ? <Author {...p.author} /> : null}
                    <p className="set-hint">Pas de description.</p>
                  </div>
                ) : null}
                {p.comments.length ? (
                  <Thread
                    messages={p.comments}
                    focus={p.from}
                    render={p.renderText}
                    picked={picking ? p.isPicked : undefined}
                    onToggle={picking ? p.onToggle : undefined}
                    action={
                      !picking && canIssue
                        ? (m) => (
                            <button className="th-issue" title="Créer une issue à partir de ce seul message" onClick={() => issueFrom(m.id)}>
                              🐙 issue
                            </button>
                          )
                        : undefined
                    }
                  />
                ) : !p.reading ? (
                  <p className="set-hint ic-pad">Aucun échange.</p>
                ) : null}
              </div>
            </section>

            {picking ? (
              <section className="ic-form" aria-label="L'issue">
                {open.length ? (
                  <p className="issue-existing">
                    Déjà liée à :{' '}
                    {open.map((i, n) => (
                      <span key={`${i.repo}#${i.number}`}>
                        {n ? ', ' : ''}
                        <a href={i.url} target="_blank" rel="noreferrer" title={i.title}>{i.repo} #{i.number}</a>
                      </span>
                    ))}
                    . En créer une autre ?
                  </p>
                ) : null}
                <div className="ic-row">
                  <div className="issue-label ic-repo">
                    Repo
                    {p.repos.length > 1 ? (
                      <Pick
                        value={p.repo ? repoId(p.repo) : ''}
                        options={p.repos.map((r) => ({ value: repoId(r), label: r.repo }))}
                        onChange={(v) => {
                          const r = p.repos.find((x) => repoId(x) === v)
                          if (r) p.onRepo(r)
                        }}
                        title="Repo où créer l'issue, retenu pour la prochaine fois"
                      />
                    ) : (
                      <span className="ic-repo-one">{p.repo?.repo ?? 'Aucun repo'}</span>
                    )}
                  </div>
                  <label className="issue-label ic-title">
                    Titre
                    <input ref={titleRef} className="nc-name" value={p.title} maxLength={256} onChange={(e) => p.onTitle(e.target.value)} autoComplete="off" data-1p-ignore />
                  </label>
                </div>
                <div className="ic-tabs" role="tablist">
                  <button role="tab" aria-selected={tab === 'write'} className={tab === 'write' ? 'is-on' : ''} onClick={() => setTab('write')}>Tes précisions</button>
                  <button role="tab" aria-selected={tab === 'preview'} className={tab === 'preview' ? 'is-on' : ''} onClick={() => setTab('preview')}>Aperçu de l'issue</button>
                </div>
                {tab === 'write' ? (
                  <textarea
                    className="issue-need ic-need"
                    aria-label="Tes précisions"
                    value={p.need}
                    placeholder="Facultatif : ce qu'il reste vraiment à faire, ce qui compte, ce qui est déjà réglé…"
                    onChange={(e) => p.onNeed(e.target.value)}
                  />
                ) : (
                  <div className="ic-preview"><Markdown text={needOf(p.body())} /></div>
                )}
                <p className="set-hint">
                  Coche à gauche ce qui part dans l'issue. Le lien vers {p.noun} et la consigne de rapport s'ajoutent tout seuls.
                </p>
                {p.error ? <p className="issue-error">{p.error}</p> : null}
              </section>
            ) : p.error ? (
              <p className="issue-error ic-pad">{p.error}</p>
            ) : null}
          </div>
        )}

        <footer className="ic-foot">
          {p.made ? (
            <>
              <button className="btn" onClick={() => p.onSee(false)}>Voir sur GitHub</button>
              {p.hasOutside ? <button className="btn" onClick={() => p.onSee(true)}>↗ navigateur</button> : null}
              <span className="set-spacer" />
              {navigator.clipboard && p.command ? (
                <button className="btn" onClick={() => p.onCopy('command', p.command)}>{p.copied === 'command' ? '✓ Commande copiée' : 'Copier la commande'}</button>
              ) : null}
              {navigator.clipboard ? (
                <button className="btn" onClick={() => p.onCopy('prompt', p.prompt)}>{p.copied === 'prompt' ? '✓ Prompt copié' : 'Copier le prompt'}</button>
              ) : null}
              <button className="btn btn-primary" onClick={p.onClose}>Fermer</button>
            </>
          ) : picking ? (
            <>
              <button className="btn" onClick={() => setComposing(false)}>← Revenir à la lecture</button>
              <span className="set-spacer" />
              <button className="btn" disabled={!p.repo} onClick={() => p.onForm(false)} title="Formulaire GitHub pré-rempli (il faut y être connecté)">Ouvrir le formulaire</button>
              {p.hasOutside ? <button className="btn" disabled={!p.repo} onClick={() => p.onForm(true)} title="Dans le navigateur, où tu es connecté à GitHub">↗ navigateur</button> : null}
              <button className="btn btn-primary" onClick={p.onCreate} disabled={!p.repo || !p.title.trim() || p.busy} title="⌘ Entrée">
                {p.busy ? 'Création…' : 'Créer sur GitHub'}
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={p.onOpenSource}>Ouvrir dans {p.service}</button>
              <span className="set-spacer" />
              {canIssue ? (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    all(true)
                    setComposing(true)
                  }}
                >
                  🐙 Créer une issue
                </button>
              ) : null}
              <button className="btn" onClick={p.onClose}>Fermer</button>
            </>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  )
}
