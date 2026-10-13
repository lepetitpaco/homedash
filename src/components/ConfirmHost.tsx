import { useEffect, useRef, useState } from 'react'

/**
 * Remplace `window.confirm` : une modale au style de la page, qui ne gèle pas
 * l'onglet et sait dire ce qui va se passer en plusieurs lignes.
 *
 *   if (await confirmDialog({ title: 'Supprimer ?', danger: true })) …
 *
 * Un seul `<ConfirmHost />`, monté dans App, affiche les demandes.
 */
export type ConfirmOptions = {
  title: string
  /** Paragraphes d'explication : ce qui change, ce qui est conservé. */
  body?: string | string[]
  confirmLabel?: string
  cancelLabel?: string
  /** Action destructrice : bouton rouge, et le focus part sur « Annuler ». */
  danger?: boolean
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void }

let show: ((p: Pending) => void) | null = null

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    // Hôte absent (ne devrait pas arriver) : on refuse plutôt que d'agir sans accord.
    if (!show) return resolve(false)
    show({ ...opts, resolve })
  })
}

export default function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null)
  const okRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    show = (p) =>
      setPending((cur) => {
        cur?.resolve(false) // une nouvelle demande annule celle en cours
        return p
      })
    return () => {
      show = null
    }
  }, [])

  const close = (ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
  }

  useEffect(() => {
    if (!pending) return
    ;(pending.danger ? cancelRef : okRef).current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  if (!pending) return null
  const body = pending.body == null ? [] : Array.isArray(pending.body) ? pending.body : [pending.body]

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close(false)}>
      <div className="modal modal-confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className="modal-head" id="confirm-title">
          {pending.danger ? '⚠ ' : ''}
          {pending.title}
        </div>
        {body.length ? (
          <div className="modal-body">
            {body.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        ) : null}
        <div className="modal-foot">
          <span className="modal-hint">{pending.danger ? 'Échap annuler' : '↵ valider · Échap annuler'}</span>
          <button ref={cancelRef} className="btn" onClick={() => close(false)}>
            {pending.cancelLabel ?? 'Annuler'}
          </button>
          <button
            ref={okRef}
            className={`btn ${pending.danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => close(true)}
          >
            {pending.confirmLabel ?? 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  )
}
