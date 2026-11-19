import Pick from './Pick'
import {
  PRESETS,
  SITE_ACTIONS,
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
  const flag = (key: 'keys' | 'actions' | 'mixer' | 'sync' | 'keep', label: string, hint: string) => (
    <label className="set-toggle">
      <input type="checkbox" checked={p[key]} onChange={(e) => onChange(patchPrefs(p, { [key]: e.target.checked }))} />
      <span>
        {label}
        <em>{hint}</em>
      </span>
    </label>
  )
  return (
    <>
      <div className="split-group" role="group" aria-label="Mode de départ">
        {(
          [
            ['classic', 'Classic', 'double écran : tous les sons, aucune touche interceptée'],
            ['scroll', 'Scroll', 'défiler des flux : le son suit la souris, raccourcis et actions par site'],
          ] as const
        ).map(([id, label, hint]) => (
          <button key={id} type="button" className="split-chip" aria-pressed={p.mode === id} title={hint} onClick={() => onChange(applyProfile(p, id))}>
            {label}
          </button>
        ))}
        <button type="button" className="split-chip" aria-pressed={p.mode === 'custom'} disabled>
          Personnalisé
        </button>
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
            options={[
              { value: 'all', label: 'Tous les sons' },
              { value: 'hover', label: 'Le son suit la souris' },
              { value: 'keyboard', label: 'Le son suit le clavier' },
            ]}
            onChange={(v) => onChange(patchPrefs(p, { follow: v as Follow }))}
            title="Qui a le son"
          />
        </div>
        {flag('keys', 'Raccourcis clavier', 'Alt + chiffre pour changer de panneau, J K ou ↓ ↑ pour défiler, N P pour une page, Z pour agrandir, Échap pour quitter')}
        {flag('actions', 'Actions par site', `${SITE_ACTIONS.map((a) => `${a.key.toUpperCase()} ${a.label.toLowerCase()}`).join(', ')} (X, TikTok, Instagram) ; coche aussi les raccourcis`)}
        {flag('mixer', 'Table de mixage', 'une paire de touches par panneau pour le défiler d’une main ; coche aussi les raccourcis')}
        {flag('sync', 'Scroll synchronisé', 'une molette pour tous les panneaux')}
        {flag('keep', 'Garder le son à la sortie', 'le dernier panneau garde le son quand la souris sort de la grille')}
        <div className="split-menu-row">
          <Pick
            value={p.keyboard}
            options={[
              { value: 'auto', label: 'Clavier : automatique' },
              { value: 'azerty', label: `Clavier : ${PRESETS.azerty.name}` },
              { value: 'qwerty', label: `Clavier : ${PRESETS.qwerty.name}` },
            ]}
            onChange={(v) => onChange(patchPrefs(p, { keyboard: v as KeyboardChoice }))}
            title="Préréglage clavier"
          />
        </div>
      </div>
    </>
  )
}
