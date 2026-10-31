import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Markdown } from '../lib/markdown'
import Pick from './Pick'
import Thread from './Thread'

type Repo = { account: string; repo: string }
export type ComposerComment = { id: string | number; who: string; date: string; text: string }

const repoId = (r: Repo) => `${r.account} ${r.repo}`
type Props = {
  /** « la tâche » ou « la carte », et le service, dans les phrases. */
  noun: string
  service: string
  sourceTitle: string
  repos: Repo[]
  repo: Repo | null
  onRepo: (r: Repo) => void
  title: string
  onTitle: (v: string) => void
  need: string
  onNeed: (v: string) => void
  reading: boolean
  comments: ComposerComment[]
  isPicked: (id: ComposerComment['id']) => boolean
  onToggle: (id: ComposerComment['id']) => void
  /** Retenir ces échanges (tous, aucun, les plus récents). */
  onPick: (ids: ComposerComment['id'][]) => void
  recent: number
  /** L'échange d'où part l'issue, s'il y en a un. */
  from?: ComposerComment['id']
  existing: { repo: string; number: number; url: string; title: string }[]
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
  onClose: () => void
}

/**
 * Fenêtre « nouvelle issue », la même pour Basecamp et Trello : à gauche la
 * conversation, où l'on choisit ce qui compte ; à droite l'issue, à rédiger ou
 * à relire telle qu'elle partira. Ne fait rien elle-même : IssueHost et
 * TrIssueHost lisent la source et créent l'issue.
 */
export default function IssueComposer(p: Props) {
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const titleRef = useRef<HTMLInputElement>(null)
  const thread = useRef<HTMLDivElement>(null)
  const kept = p.comments.filter((c) => p.isPicked(c.id)).length

  useEffect(() => {
    titleRef.current?.select()
  }, [])
  // La conversation se lit de haut en bas ; on arrive sur le dernier message.
  useEffect(() => {
    if (thread.current) thread.current.scrollTop = thread.current.scrollHeight
  }, [p.comments.length])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') p.onClose()
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !p.made) {
      e.preventDefault()
      p.onCreate()
    }
  }

  return createPortal(
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div
        className={`modal ic${p.comments.length && !p.made ? ' has-thread' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Nouvelle issue GitHub"
        onKeyDown={onKey}
      >
        <header className="ic-head">
          <div className="ic-head-text">
            <strong>{p.made ? `Issue #${p.made.number} créée` : 'Nouvelle issue GitHub'}</strong>
            <span title={p.sourceTitle}>depuis {p.noun} « {p.sourceTitle} »</span>
          </div>
          <button className="icon-btn" aria-label="Fermer" title="Fermer (Échap)" onClick={p.onClose}>
            ✕
          </button>
        </header>

        {p.made ? (
          <div className="ic-done">
            <p>
              Elle garde le lien vers {p.noun} : son rapport apparaîtra dans l'onglet {p.service} et dans la cloche.{' '}
              {p.copied === 'command'
                ? 'Cette commande est copiée : colle-la dans un terminal, Claude Code démarre dans le repo avec l’issue.'
                : p.copied === 'prompt'
                  ? 'Ce prompt est copié : colle-le dans Claude Code.'
                  : 'Pour la confier à Claude Code :'}
            </p>
            <pre className="issue-prompt">{p.command || p.prompt}</pre>
          </div>
        ) : (
          <div className="ic-panes">
            {p.comments.length ? (
              <section className="ic-thread-pane" aria-label="Conversation">
                <div className="ic-pane-head">
                  <strong>Conversation</strong>
                  <span className="ic-count">{kept} sur {p.comments.length} dans l'issue</span>
                  <span className="set-spacer" />
                  <button className="ic-link" onClick={() => p.onPick(p.comments.slice(-p.recent).map((c) => c.id))}>récents</button>
                  <button className="ic-link" onClick={() => p.onPick(p.comments.map((c) => c.id))}>tout</button>
                  <button className="ic-link" onClick={() => p.onPick([])}>aucun</button>
                </div>
                <div className="ic-thread" ref={thread}>
                  <Thread messages={p.comments} focus={p.from} picked={p.isPicked} onToggle={p.onToggle} />
                </div>
              </section>
            ) : null}

            <section className="ic-form" aria-label="L'issue">
              {p.existing.length ? (
                <p className="issue-existing">
                  Déjà liée à :{' '}
                  {p.existing.map((i, n) => (
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
                  <input
                    ref={titleRef}
                    className="nc-name"
                    value={p.title}
                    maxLength={256}
                    onChange={(e) => p.onTitle(e.target.value)}
                    autoComplete="off"
                    data-1p-ignore
                  />
                </label>
              </div>
              <div className="ic-tabs" role="tablist">
                <button role="tab" aria-selected={tab === 'write'} className={tab === 'write' ? 'is-on' : ''} onClick={() => setTab('write')}>Besoin</button>
                <button role="tab" aria-selected={tab === 'preview'} className={tab === 'preview' ? 'is-on' : ''} onClick={() => setTab('preview')}>Aperçu de l'issue</button>
              </div>
              {tab === 'write' ? (
                <textarea
                  className="issue-need ic-need"
                  aria-label="Besoin"
                  value={p.need}
                  placeholder={p.reading ? `Lecture de ${p.noun} dans ${p.service}…` : "Ce qu'il faut faire, pour qui, ce qui compte…"}
                  onChange={(e) => p.onNeed(e.target.value)}
                />
              ) : (
                <div className="ic-preview"><Markdown text={p.body()} /></div>
              )}
              <p className="set-hint">
                {kept ? `${kept} échange${kept > 1 ? 's' : ''} ajouté${kept > 1 ? 's' : ''} sous le besoin. ` : ''}
                Le lien vers {p.noun} et la consigne de rapport s'ajoutent tout seuls.
              </p>
              {p.error ? <p className="issue-error">{p.error}</p> : null}
            </section>
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
          ) : (
            <>
              <button className="btn" onClick={p.onClose}>Annuler</button>
              <span className="set-spacer" />
              <button className="btn" disabled={!p.repo} onClick={() => p.onForm(false)} title="Formulaire GitHub pré-rempli (il faut y être connecté)">Ouvrir le formulaire</button>
              {p.hasOutside ? <button className="btn" disabled={!p.repo} onClick={() => p.onForm(true)} title="Dans le navigateur, où tu es connecté à GitHub">↗ navigateur</button> : null}
              <button className="btn btn-primary" onClick={p.onCreate} disabled={!p.repo || !p.title.trim() || p.busy} title="⌘ Entrée">
                {p.busy ? 'Création…' : 'Créer sur GitHub'}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  )
}
