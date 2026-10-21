import { useEffect, useState } from 'react'
import { perfClear, perfUsage, type PerfUsage } from '../lib/perf'
import { confirmDialog } from './ConfirmHost'

/**
 * Réglages → Affichage → Journal de performance : ce que homedash consomme,
 * jour par jour (data/perf/). Désactivé par défaut ; on y voit la place prise,
 * avec un avertissement au-delà du seuil, et on peut le vider.
 */
export default function SetPerf({ enabled, onEnabled }: { enabled: boolean; onEnabled: (on: boolean) => void }) {
  const [u, setU] = useState<PerfUsage | null>(null)
  useEffect(() => {
    perfUsage().then(setU).catch(() => setU(null))
  }, [enabled])

  const clear = () =>
    void confirmDialog({
      title: 'Vider le journal de performance ?',
      body: [`Les ${u?.files ?? 0} jour(s) de mesures sont supprimés.`, 'Tes réglages, notes et sauvegardes ne bougent pas.'],
      confirmLabel: 'Vider',
      danger: true,
    }).then((ok) => {
      if (ok) void perfClear().then(setU)
    })

  const heavy = !!u && u.mb >= u.warn_mb
  return (
    <>
      <label className="set-toggle">
        <input type="checkbox" checked={enabled} onChange={(e) => onEnabled(e.target.checked)} />
        Journal de performance{' '}
        <em>
          mémoire et CPU du serveur, de l'appli et de chaque onglet, actions lourdes ; gardé {u?.keep_days ?? 30} jours
        </em>
      </label>
      {u ? (
        <p className={`set-hint${heavy ? ' set-bad' : ''}`}>
          {heavy ? '⚠ ' : ''}
          {u.files ? (
            <>
              {u.mb < 0.1 ? `${Math.max(1, Math.round(u.bytes / 1024))} Ko` : `${u.mb} Mo`} sur le disque, {u.files} fichier(s)
              {u.since ? ` depuis le ${new Date(u.since).toLocaleDateString('fr-FR')}` : ''}.
              {heavy ? ` C'est beaucoup (seuil : ${u.warn_mb} Mo) : vide-le, ou coupe le journal.` : ''}{' '}
              <button className="set-danger-link" onClick={clear}>
                Vider
              </button>
            </>
          ) : (
            'Rien d’enregistré pour l’instant.'
          )}
          {!enabled && u.files ? ' Journal coupé : plus rien ne s’y ajoute.' : ''}
        </p>
      ) : null}
      {enabled ? (
        <p className="set-hint">
          Pense à <strong>Enregistrer</strong> pour l'activer. Pour le résumé : <code>python3 scripts/perf-report.py</code>.
        </p>
      ) : null}
    </>
  )
}
