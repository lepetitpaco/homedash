/**
 * Stats Basecamp préparées en arrière-plan (#118) : le panneau 📊 Stats s'ouvre
 * alors sans attendre. Désactivé par défaut : sinon, chaque installation lirait
 * Basecamp sans qu'on l'ait demandé.
 */
export default function SetBcStats({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <details className="set-section">
      <summary>
        <span>Stats en arrière-plan</span>
        <em>{on ? 'activé' : 'désactivé'}</em>
      </summary>
      <p className="set-hint">
        Prépare les stats (onglet Basecamp → 📊 Stats) sans attendre qu’on les ouvre. La première fois, homedash lit
        un an de tâches petit à petit, une tranche par minute (une dizaine de minutes en tout) ; ensuite, seulement ce
        qui a changé, toutes les 15 minutes. Rien n’est modifié dans Basecamp.
      </p>
      <label className={`set-toggle${on ? ' is-on' : ''}`}>
        <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} /> Préparer les stats en arrière-plan
      </label>
    </details>
  )
}
