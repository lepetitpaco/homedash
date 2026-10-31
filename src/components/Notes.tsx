import { useEffect, useRef, useState } from 'react'
import { newNote, noteTitle, notePreview, saveNotes, type Note } from '../lib/notes'
import type { NotesConfig } from '../types'
import { confirmDialog } from './ConfirmHost'

type Props = {
  config: NotesConfig
  notes: Note[]
  setNotes: (notes: Note[]) => void
  /** Note ouverte dans l'éditeur — piloté par App (la recherche peut l'ouvrir aussi). */
  openId: string | null
  setOpenId: (id: string | null) => void
  collapsed: boolean
  onToggle: () => void
}

const dateFmt = (ts: number) =>
  new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })

export default function Notes({ config, notes, setNotes, openId, setOpenId, collapsed, onToggle }: Props) {
  const [saved, setSaved] = useState(false)
  const timer = useRef<number | null>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const open = notes.find((n) => n.id === openId) ?? null
  // Une note ouverte (recherche, « + nouvelle ») se montre même si le bloc est replié.
  const folded = collapsed && !open

  // Autosave 400 ms après la dernière frappe.
  const scheduleSave = (next: Note[]) => {
    setNotes(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      saveNotes(next)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1200)
    }, 400)
  }

  // Sauvegarde immédiate si on quitte la page avec une frappe en attente.
  useEffect(() => {
    const flush = () => {
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
        saveNotes(notes)
      }
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [notes])

  useEffect(() => {
    if (open) editorRef.current?.focus()
  }, [open?.id])

  const create = () => {
    const note = newNote()
    const next = [note, ...notes]
    setNotes(next)
    saveNotes(next)
    setOpenId(note.id)
  }

  const edit = (text: string) => {
    if (!open) return
    scheduleSave(notes.map((n) => (n.id === open.id ? { ...n, text, updated: Date.now() } : n)))
  }

  const remove = (id: string) => {
    const next = notes.filter((n) => n.id !== id)
    setNotes(next)
    saveNotes(next)
    if (openId === id) setOpenId(null)
  }

  return (
    <section className={`card notes-card${folded ? ' is-collapsed' : ''}`} style={{ ['--accent' as string]: config.color ?? '#facc15' }}>
      <header className="group-head">
        <div className="group-toggle static">
          <span className="group-icon" aria-hidden="true">
            {config.icon}
          </span>
          <h2 className="group-title">{config.title}</h2>
          <span className="group-count">{notes.length}</span>
          <button className="reveal-btn" onClick={create}>
            + nouvelle
          </button>
          <button className="reveal-btn fold-btn" onClick={onToggle} aria-expanded={!folded} title={folded ? 'Déplier' : 'Replier'}>
            {folded ? '▸' : '▾'}
          </button>
        </div>
      </header>

      {folded ? null : (
        <div className="notes-body">
          {notes.length === 0 ? (
            <p className="notes-empty">{config.emptyLabel}</p>
          ) : (
            <ul className="note-list">
              {notes.map((note) => {
                const isOpen = note.id === openId
                return (
                  <li key={note.id} className={`note${isOpen ? ' is-open' : ''}`}>
                    <button
                      className="note-open"
                      onClick={() => setOpenId(isOpen ? null : note.id)}
                      aria-expanded={isOpen}
                    >
                      <span className="note-caret" aria-hidden="true">
                        {isOpen ? '▾' : '▸'}
                      </span>
                      <span className="note-main">
                        <span className="note-title">{noteTitle(note.text)}</span>
                        {!isOpen && notePreview(note.text) ? (
                          <span className="note-preview">{notePreview(note.text)}</span>
                        ) : null}
                      </span>
                      <time className="note-date" title={`modifiée le ${dateFmt(note.updated)}`}>
                        {dateFmt(note.updated)}
                      </time>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {open ? (
            <div className="note-editor">
              <div className="note-editor-head">
                <span className="note-editor-label">
                  ✏️ édition — <strong>{noteTitle(open.text)}</strong>
                </span>
                <span className={`note-saved${saved ? ' is-on' : ''}`}>enregistré</span>
              </div>
              <textarea
                ref={editorRef}
                className="note-textarea"
                value={open.text}
                placeholder={config.placeholder}
                spellCheck={false}
                onChange={(e) => edit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setOpenId(null)
                  }
                  e.stopPropagation()
                }}
              />
              <div className="note-editor-foot">
                <button
                  className="note-danger"
                  // Comme partout ailleurs : on confirme avant d'effacer (issue #58).
                  onClick={() =>
                    void confirmDialog({
                      title: 'Supprimer cette note ?',
                      body: `« ${noteTitle(open.text)} » sera effacée pour de bon. Les autres notes ne changent pas.`,
                      confirmLabel: 'Supprimer',
                      danger: true,
                    }).then((ok) => ok && remove(open.id))
                  }
                >
                  supprimer
                </button>
                <span className="note-hint">autosave · Échap pour fermer</span>
                <button className="reveal-btn" onClick={() => setOpenId(null)}>
                  fermer
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
