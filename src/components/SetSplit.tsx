import Pick from './Pick'
import {
  FLAG_HELP,
  FOLLOW_OPTIONS,
  KEYBOARD_OPTIONS,
  MODE_LABELS,
  applyProfile,
  normalizeSplit,
  patchPrefs,
  type Follow,
  type KeyboardChoice,
  type SplitPrefs,
} from '../lib/splitView'

/**
 * Réglages → Vue scindée (issue #160) : le mode de départ (Classic / Scroll) et les cases à cocher qui le
 * définissent. Dans la vue elle-même, la barre change ces cases pour la durée de la vue seulement.
 */
export default function SetSplit({ value, onChange }: { value: unknown; onChange: (next: SplitPrefs) => void }) {
  const p = normalizeSplit(value)
  const flag = (f: (typeof FLAG_HELP)[number]) => (
    <label className="set-toggle" key={f.key}>
      <input type="checkbox" checked={p[f.key]} onChange={(e) => onChange(patchPrefs(p, { [f.key]: e.target.checked }))} />
      <span>
        {f.label}
        <em>{f.hint}</em>
      </span>
    </label>
  )
  return (
    <>
      <div className="split-group" role="group" aria-label="Mode de départ">
        {MODE_LABELS.map((m) => (
          <button
            key={m.id}
            type="button"
            className="split-chip"
            aria-pressed={p.mode === m.id}
            disabled={m.id === 'custom'}
            title={m.hint}
            onClick={() => m.id !== 'custom' && onChange(applyProfile(p, m.id))}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="set-hint">
        {p.mode === 'classic'
          ? 'Double écran (Instagram et Discord, par exemple) : tous les panneaux gardent leur son, aucune touche n’est interceptée.'
          : p.mode === 'scroll'
            ? 'Multi-scroll de flux (TikTok, X, Instagram…) : un seul panneau a le son, et le clavier pilote le panneau actif.'
            : 'Tes cases à cocher ne correspondent ni à Classic ni à Scroll : recliquer un mode les remet à son préréglage.'}
      </p>
      <div className="set-toggles">
        <div className="split-menu-row">
          <Pick
            value={p.follow}
            options={FOLLOW_OPTIONS}
            onChange={(v) => onChange(patchPrefs(p, { follow: v as Follow }))}
            title="Qui a le son"
          />
        </div>
        {FLAG_HELP.map(flag)}
        <div className="split-menu-row">
          <Pick
            value={p.keyboard}
            options={KEYBOARD_OPTIONS}
            onChange={(v) => onChange(patchPrefs(p, { keyboard: v as KeyboardChoice }))}
            title="Préréglage clavier"
          />
        </div>
      </div>
    </>
  )
}
