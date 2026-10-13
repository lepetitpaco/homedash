import { useEffect, useRef, useState } from 'react'
import type { LinkRef } from '../lib/mutate'
import type { Group, Link } from '../types'

export type Draft =
  | { kind: 'link'; ref: LinkRef | null; group: string; values: Link }
  | { kind: 'group'; name: string | null; values: Omit<Group, 'links'> }

type Props = {
  draft: Draft
  groups: Group[]
  onSave: (draft: Draft) => void
  onClose: () => void
}

const PRESET_COLORS = [
  '#4ade80',
  '#fbbf24',
  '#a78bfa',
  '#60a5fa',
  '#f472b6',
  '#f87171',
  '#34d399',
  '#fb923c',
  '#38bdf8',
  '#94a3b8',
]

export default function EditDialog({ draft, groups, onSave, onClose }: Props) {
  const [local, setLocal] = useState<Draft>(draft)
  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => setLocal(draft), [draft])
  useEffect(() => firstRef.current?.focus(), [])

  const invalid =
    local.kind === 'link'
      ? !local.values.name.trim() || !local.values.url.trim()
      : !local.values.name.trim()

  const submit = () => {
    if (invalid) return
    onSave(local)
  }

  const title =
    local.kind === 'link'
      ? local.ref
        ? 'Modifier le lien'
        : 'Nouveau lien'
      : local.name
        ? 'Modifier la catégorie'
        : 'Nouvelle catégorie'

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') onClose()
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
        }}
      >
        <div className="modal-head">{title}</div>

        {local.kind === 'link' ? (
          <div className="modal-body">
            <label className="field">
              <span>Nom</span>
              <input
                ref={firstRef}
                value={local.values.name}
                onChange={(e) => setLocal({ ...local, values: { ...local.values, name: e.target.value } })}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </label>
            <label className="field">
              <span>URL</span>
              <input
                value={local.values.url}
                placeholder="https://…  ou  http://localhost:8080/…"
                onChange={(e) => setLocal({ ...local, values: { ...local.values, url: e.target.value } })}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Note</span>
                <input
                  value={local.values.note ?? ''}
                  placeholder="affichée sous le nom"
                  onChange={(e) =>
                    setLocal({ ...local, values: { ...local.values, note: e.target.value || undefined } })
                  }
                />
              </label>
              <label className="field">
                <span>Catégorie</span>
                <select value={local.group} onChange={(e) => setLocal({ ...local, group: e.target.value })}>
                  {groups.map((g) => (
                    <option key={g.name} value={g.name}>
                      {g.icon ? `${g.icon} ` : ''}
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              <span>Mots-clés de recherche</span>
              <input
                value={local.values.tags ?? ''}
                placeholder="séparés par des espaces"
                onChange={(e) =>
                  setLocal({ ...local, values: { ...local.values, tags: e.target.value || undefined } })
                }
              />
            </label>
            <div className="field-checks">
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!local.values.pinned}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      values: { ...local.values, pinned: e.target.checked || undefined },
                    })
                  }
                />
                <span>
                  Épinglé <em>tuile en haut de page</em>
                </span>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!local.values.check}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      values: { ...local.values, check: e.target.checked || undefined },
                    })
                  }
                />
                <span>
                  Surveillé <em>voyant en ligne / injoignable</em>
                </span>
              </label>
            </div>
          </div>
        ) : (
          <div className="modal-body">
            <div className="field-row">
              <label className="field">
                <span>Nom</span>
                <input
                  ref={firstRef}
                  value={local.values.name}
                  onChange={(e) => setLocal({ ...local, values: { ...local.values, name: e.target.value } })}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                />
              </label>
              <label className="field field-narrow">
                <span>Icône</span>
                <input
                  value={local.values.icon ?? ''}
                  placeholder="🗂️"
                  onChange={(e) =>
                    setLocal({ ...local, values: { ...local.values, icon: e.target.value || undefined } })
                  }
                />
              </label>
            </div>
            <div className="field">
              <span>Couleur</span>
              <div className="swatches">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`swatch${local.values.color === c ? ' is-on' : ''}`}
                    style={{ background: c }}
                    aria-label={c}
                    onClick={() => setLocal({ ...local, values: { ...local.values, color: c } })}
                  />
                ))}
                <input
                  className="swatch-input"
                  type="color"
                  value={local.values.color ?? '#7c8698'}
                  onChange={(e) => setLocal({ ...local, values: { ...local.values, color: e.target.value } })}
                />
              </div>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={!!local.values.collapsed}
                onChange={(e) =>
                  setLocal({ ...local, values: { ...local.values, collapsed: e.target.checked || undefined } })
                }
              />
              <span>
                Repliée par défaut <em>ton choix dans le navigateur prime ensuite</em>
              </span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={!!local.values.hidden}
                onChange={(e) =>
                  setLocal({ ...local, values: { ...local.values, hidden: e.target.checked || undefined } })
                }
              />
              <span>
                Masquée <em>conservée dans le JSON, retirée de la page</em>
              </span>
            </label>
          </div>
        )}

        <div className="modal-foot">
          <span className="modal-hint">⌘↵ enregistrer · Échap annuler</span>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={invalid}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}
