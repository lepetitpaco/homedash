import Pick from './Pick'
import {
  ACTIONS_OFF_HINT,
  FLAG_HELP,
  KEYBOARD_OPTIONS,
  MODE_LABELS,
  MODIFIERS_HELP,
  normalizeKeyboard,
  normalizeSplit,
  withMode,
  type KeyboardChoice,
  type SplitPrefs,
} from '../lib/splitView'

type SplitSettings = SplitPrefs & { keyboard: KeyboardChoice }

/**
 * Réglages → Vue scindée (issue #160) : le mode de départ d'une nouvelle vue (Flux / Messagerie), ses deux cases, et
 * le clavier (ici seulement, #177 : la détection automatique suffit presque toujours, et il ne change que les étiquettes).
 */
export default function SetSplit({ value, onChange }: { value: unknown; onChange: (next: SplitSettings) => void }) {
  const p = normalizeSplit(value)
  const keyboard = normalizeKeyboard(value)
  const write = (next: SplitPrefs, kb: KeyboardChoice = keyboard) => onChange({ ...next, keyboard: kb })
  const flag = (f: (typeof FLAG_HELP)[number]) => {
    const off = f.key === 'actions' && p.mode !== 'scroll'
    return (
      <label className="set-toggle" key={f.key} aria-disabled={off || undefined}>
        <input type="checkbox" checked={p[f.key]} disabled={off} onChange={(e) => write({ ...p, [f.key]: e.target.checked })} />
        <span>
          {f.label}
          <em>{off ? ACTIONS_OFF_HINT : f.hint}</em>
        </span>
      </label>
    )
  }
  return (
    <>
      <div className="split-group" role="group" aria-label="Mode de départ">
        {MODE_LABELS.map((m) => (
          <button key={m.id} type="button" className="split-chip" aria-pressed={p.mode === m.id} title={m.hint} onClick={() => write(withMode(p, m.id))}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="set-hint">
        {p.mode === 'classic'
          ? 'Messagerie (Instagram et Discord, par exemple) : tous les panneaux gardent leur son, jamais de pause, aucune touche n’est interceptée.'
          : 'Flux (TikTok, X, Instagram…) : le panneau où tu agis (survol, molette, touche, clic) a le son, les vidéos des autres sont en pause ; table de mixage et raccourcis clavier.'}
      </p>
      <p className="set-hint">{MODIFIERS_HELP}</p>
      <div className="set-toggles">
        {FLAG_HELP.map(flag)}
        <div className="split-menu-row">
          <Pick value={keyboard} options={KEYBOARD_OPTIONS} onChange={(v) => write(p, v as KeyboardChoice)} title="Clavier" />
          <span className="split-menu-note">Les touches sont lues à leur place : ce choix ne change que les lettres affichées.</span>
        </div>
      </div>
    </>
  )
}
