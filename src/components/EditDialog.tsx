import { useEffect, useRef, useState } from 'react'
import type { InfoRef, LinkRef } from '../lib/mutate'
import type { Group, InfoGroup, InfoItem, Link } from '../types'
import { keys } from '../lib/keys'

export type Draft =
  | { kind: 'link'; ref: LinkRef | null; group: string; values: Link }
  | { kind: 'group'; name: string | null; values: Omit<Group, 'links'> }
  | { kind: 'info'; ref: InfoRef | null; group: number; values: InfoItem }
  | { kind: 'infoGroup'; index: number | null; values: Omit<InfoGroup, 'items'> }

type Props = {
  draft: Draft
  groups: Group[]
  infoGroups: InfoGroup[]
  onSave: (draft: Draft) => void
  onClose: () => void
}

/** Champs qu'un gestionnaire de mots de passe prendrait pour un identifiant. */
const NO_PWM = {
  autoComplete: 'off',
  'data-1p-ignore': true,
  'data-bwignore': true,
  'data-lpignore': 'true',
} as const

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

export default function EditDialog({ draft, groups, infoGroups, onSave, onClose }: Props) {
  const [local, setLocal] = useState<Draft>(draft)
  // Une valeur secrète s'édite masquée ; on la révèle à la demande.
  const [showValue, setShowValue] = useState(false)
  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => setLocal(draft), [draft])
  useEffect(() => firstRef.current?.focus(), [])

  const invalid =
    local.kind === 'link'
      ? !local.values.name.trim() || !local.values.url.trim()
      : local.kind === 'group'
        ? !local.values.name.trim()
        : local.kind === 'info'
          ? !local.values.label.trim() || !local.values.value.trim()
          : !local.values.title.trim()

  const submit = () => {
    if (invalid) return
    onSave(local)
  }

  const title = {
    link: local.kind === 'link' && local.ref ? 'Modifier le lien' : 'Nouveau lien',
    group: local.kind === 'group' && local.name ? 'Modifier la catégorie' : 'Nouvelle catégorie',
    info: local.kind === 'info' && local.ref ? "Modifier l'info" : 'Nouvelle info',
    infoGroup: local.kind === 'infoGroup' && local.index !== null ? 'Modifier le groupe' : 'Nouveau groupe d’infos',
  }[local.kind]

  const swatches = (color: string | undefined, set: (c: string) => void) => (
    <div className="field">
      <span>Couleur</span>
      <div className="swatches">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`swatch${color === c ? ' is-on' : ''}`}
            style={{ background: c }}
            aria-label={c}
            onClick={() => set(c)}
          />
        ))}
        <input
          className="swatch-input"
          type="color"
          value={color ?? '#7c8698'}
          onChange={(e) => set(e.target.value)}
        />
      </div>
    </div>
  )

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
        ) : local.kind === 'info' ? (
          <div className="modal-body">
            <div className="field-row">
              <label className="field">
                <span>Libellé</span>
                <input
                  ref={firstRef}
                  value={local.values.label}
                  placeholder="WiFi bureau, IP serveur…"
                  onChange={(e) => setLocal({ ...local, values: { ...local.values, label: e.target.value } })}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  {...NO_PWM}
                />
              </label>
              <label className="field">
                <span>Groupe</span>
                <select value={local.group} onChange={(e) => setLocal({ ...local, group: Number(e.target.value) })}>
                  {infoGroups.map((g, i) => (
                    <option key={i} value={i}>
                      {g.icon ? `${g.icon} ` : ''}
                      {g.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              <span>
                Valeur{' '}
                {local.values.secret ? (
                  <button type="button" className="field-reveal" onClick={() => setShowValue((v) => !v)}>
                    {showValue ? '🙈 masquer' : '👁 afficher'}
                  </button>
                ) : null}
              </span>
              <input
                type={local.values.secret && !showValue ? 'password' : 'text'}
                value={local.values.value}
                placeholder="ce qui sera copié au clic"
                onChange={(e) => setLocal({ ...local, values: { ...local.values, value: e.target.value } })}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                {...NO_PWM}
              />
            </label>
            <label className="field">
              <span>Note</span>
              <input
                value={local.values.note ?? ''}
                placeholder="affichée sous le libellé"
                onChange={(e) =>
                  setLocal({ ...local, values: { ...local.values, note: e.target.value || undefined } })
                }
                {...NO_PWM}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={!!local.values.secret}
                onChange={(e) =>
                  setLocal({ ...local, values: { ...local.values, secret: e.target.checked || undefined } })
                }
              />
              <span>
                Secret <em>masqué à l'écran, copié sans être affiché, absent de la recherche</em>
              </span>
            </label>
          </div>
        ) : local.kind === 'infoGroup' ? (
          <div className="modal-body">
            <div className="field-row">
              <label className="field">
                <span>Titre</span>
                <input
                  ref={firstRef}
                  value={local.values.title}
                  placeholder="WiFi, Réseau, Serveurs…"
                  onChange={(e) => setLocal({ ...local, values: { ...local.values, title: e.target.value } })}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                />
              </label>
              <label className="field field-narrow">
                <span>Icône</span>
                <input
                  value={local.values.icon ?? ''}
                  placeholder="📶"
                  onChange={(e) =>
                    setLocal({ ...local, values: { ...local.values, icon: e.target.value || undefined } })
                  }
                />
              </label>
            </div>
            {swatches(local.values.color, (color) => setLocal({ ...local, values: { ...local.values, color } }))}
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
          <span className="modal-hint">{keys('↵')} enregistrer · Échap annuler</span>
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
