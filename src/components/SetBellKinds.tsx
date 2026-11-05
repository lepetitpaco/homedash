import { BELL_FAMILIES, BELL_LEVELS, levelOf, type BellLevel, type BellPrefs } from '../lib/bellPrefs'

/**
 * Réglages → Notifications → « Ce qui compte dans la cloche » (issue #131) : un choix par type,
 * comme les réglages par canal de Slack. Défaut : tout compte, comme avant.
 */
export default function SetBellKinds({ prefs, onChange }: { prefs: BellPrefs; onChange: (next: BellPrefs) => void }) {
  const set = (fam: string, level: BellLevel) => {
    const next: Record<string, BellLevel> = { ...prefs }
    if (level === 'notify') delete next[fam]
    else next[fam] = level
    onChange(next as BellPrefs)
  }
  return (
    <div className="set-bell-kinds">
      {BELL_FAMILIES.map((f) => {
        const cur = levelOf(prefs, f.kinds[0])
        return [
          <span key={`${f.id}-l`}>
            <span className="set-bell-icon" aria-hidden="true">{f.icon}</span>
            {f.label}
          </span>,
          <span key={`${f.id}-c`} className="xs-seg" role="radiogroup" aria-label={f.label}>
            {BELL_LEVELS.map((l) => (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={cur === l.id}
                className={cur === l.id ? 'is-on' : ''}
                title={l.title}
                onClick={() => set(f.id, l.id)}
              >
                {l.label}
              </button>
            ))}
          </span>,
        ]
      })}
    </div>
  )
}
