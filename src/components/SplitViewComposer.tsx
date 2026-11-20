import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Pick from './Pick'
import { Mini, type PaneSite } from './SplitView'
import { DEFAULT_SPLIT_LAYOUT, LAYOUTS, assignSites, layoutOf } from '../lib/splitView'

/**
 * « Ajouter une vue scindée » (menu Ajouter) : le nom, la disposition et le site de chaque panneau (avec le nom de
 * son compte). Crée une vue enregistrée dans la barre, comme un site : il n'y a pas de vue jetable.
 */
export default function SplitViewComposer({
  sites,
  names,
  recent,
  onCreate,
  onClose,
}: {
  sites: PaneSite[]
  /** Nom de chaque site (clé d'onglet) avec son compte : « X · pro ». */
  names: Record<string, string>
  /** Clés des sites les plus récents : ils remplissent les panneaux au départ. */
  recent: string[]
  onCreate: (v: { name: string; layout: string; slots: (string | null)[]; copies: boolean[]; kind: 'flux' | 'messagerie' }) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [layout, setLayout] = useState(DEFAULT_SPLIT_LAYOUT)
  const [slots, setSlots] = useState<(string | null)[]>(() => assignSites([], layoutOf(DEFAULT_SPLIT_LAYOUT).n, recent.filter((k) => sites.some((s) => s.key === k))))
  // Flux (doomscroll) : des copies des sites, une page à part. Messagerie : les vrais sites (notifications, appels).
  const [kind, setKind] = useState<'flux' | 'messagerie'>('flux')
  const input = useRef<HTMLInputElement>(null)
  const n = layoutOf(layout).n
  useEffect(() => input.current?.focus(), [])
  // Échap ferme cette fenêtre seule.
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', esc, true)
    return () => window.removeEventListener('keydown', esc, true)
  }, [onClose])
  const filled = slots.slice(0, n).filter(Boolean).length
  const ok = name.trim().length > 0 && filled >= 2
  const submit = () => ok && onCreate({ name: name.trim(), layout, slots, copies: Array.from({ length: 4 }, () => kind === 'flux'), kind })

  return createPortal(
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-confirm svc" role="dialog" aria-modal="true" aria-labelledby="svc-title">
        <div className="modal-head" id="svc-title">
          Ajouter une vue scindée
        </div>
        <div className="modal-body nc-body">
          <input
            ref={input}
            className="nc-name"
            value={name}
            placeholder="Nom de la vue"
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            autoComplete="off"
            data-1p-ignore
          />
          <div className="split-group" role="group" aria-label="Type de vue">
            {([
              ['flux', 'Flux', 'Pour défiler TikTok, X, Instagram : chaque panneau est une copie du site (ta connexion, mais une page à part : son propre historique, sans toucher au site de la barre)'],
              ['messagerie', 'Messagerie', 'Pour suivre Instagram, Discord… : chaque panneau est le vrai site, avec ses notifications et ses compteurs'],
            ] as const).map(([id, label, hint]) => (
              <button key={id} type="button" className="split-chip" aria-pressed={kind === id} title={hint} onClick={() => setKind(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="split-group" role="group" aria-label="Disposition">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                type="button"
                className="split-chip split-lay"
                aria-pressed={layout === l.id}
                title={l.label}
                aria-label={l.label}
                onClick={() => {
                  setLayout(l.id)
                  setSlots((cur) => assignSites(cur, l.n, recent.filter((k) => sites.some((s) => s.key === k))))
                }}
              >
                <Mini node={l.tree} />
              </button>
            ))}
          </div>
          <div className="svc-slots">
            {Array.from({ length: n }, (_, i) => (
              <div className="svc-slot" key={i}>
                <span className="split-num" aria-hidden="true">
                  {i + 1}
                </span>
                <Pick
                  value={slots[i] ?? ''}
                  title={`Site du panneau ${i + 1}`}
                  options={[
                    { value: '', label: '— aucun —' },
                    ...sites.map((s) => {
                      const used = slots.some((k, j) => k === s.key && j !== i && j < n)
                      return { value: s.key, label: names[s.key] ?? s.label, icon: s.icon, color: s.color, disabled: used, hint: used ? 'déjà dans cette vue' : undefined }
                    }),
                  ]}
                  onChange={(v) => setSlots((cur) => cur.map((k, j) => (j === i ? v || null : k)))}
                />
              </div>
            ))}
          </div>
          <p className="set-hint">Flux : des copies, une page à part. Messagerie : les vrais sites. Elle apparaît dans la barre de gauche, comme un site ; un clic l'ouvre, le clic droit la modifie ou la supprime. Deux sites au moins.</p>
        </div>
        <div className="modal-foot">
          <span className="modal-hint">↵ ajouter · Échap annuler</span>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={!ok}>
            Ajouter
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
