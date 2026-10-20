import { useEffect, useRef, useState } from 'react'
import { COLORS } from '../lib/customTabs'

/**
 * Petite fenêtre « nom + couleur » : nouveau dossier (glisser une icône sur
 * une autre, comme Discord), nouveau compte de connexion (comme un conteneur
 * Firefox), ou leur modification.
 *
 *   const r = await askNameColor({ title: 'Nouveau dossier', name: 'Dossier' })
 *   if (r) … r.name, r.color
 *
 * Un seul `<NameColorHost />`, monté dans App, affiche les demandes.
 */
export type NameColorOptions = {
  title: string
  name?: string
  color?: string
  /** Une phrase sous le champ : ce que ça fait. */
  hint?: string
  okLabel?: string
}

export type NameColor = { name: string; color: string }

type Pending = NameColorOptions & { resolve: (r: NameColor | null) => void }

let show: ((p: Pending) => void) | null = null

export function askNameColor(opts: NameColorOptions): Promise<NameColor | null> {
  return new Promise((resolve) => {
    if (!show) return resolve(null)
    show({ ...opts, resolve })
  })
}

/** Pastilles de couleur à choisir. */
export function ColorSwatches({ value, onChange }: { value?: string; onChange: (c: string) => void }) {
  return (
    <span className="swatches" role="radiogroup" aria-label="Couleur">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          className={`swatch${value === c ? ' is-on' : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
          title={c}
        />
      ))}
    </span>
  )
}

export default function NameColorHost() {
  const [pending, setPending] = useState<Pending | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    show = (p) => {
      setName(p.name ?? '')
      setColor(p.color ?? COLORS[Math.floor(Math.random() * COLORS.length)])
      setPending((cur) => {
        cur?.resolve(null) // une nouvelle demande annule celle en cours
        return p
      })
    }
    return () => {
      show = null
    }
  }, [])

  useEffect(() => {
    if (pending) setTimeout(() => input.current?.select(), 0)
  }, [pending])

  const close = (ok: boolean) => {
    pending?.resolve(ok && name.trim() ? { name: name.trim(), color } : null)
    setPending(null)
  }

  if (!pending) return null
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close(false)}>
      <div className="modal modal-confirm" role="dialog" aria-modal="true" aria-labelledby="nc-title">
        <div className="modal-head" id="nc-title">
          {pending.title}
        </div>
        <div className="modal-body nc-body">
          <input
            ref={input}
            className="nc-name"
            value={name}
            placeholder="Nom"
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') close(true)
              if (e.key === 'Escape') close(false)
            }}
            style={{ borderColor: color }}
            autoComplete="off"
            data-1p-ignore
          />
          <ColorSwatches value={color} onChange={setColor} />
          {pending.hint ? <p className="set-hint">{pending.hint}</p> : null}
        </div>
        <div className="modal-foot">
          <span className="modal-hint">↵ valider · Échap annuler</span>
          <button className="btn" onClick={() => close(false)}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={() => close(true)} disabled={!name.trim()}>
            {pending.okLabel ?? 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}
