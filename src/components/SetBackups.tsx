import { useEffect, useRef, useState } from 'react'
import {
  createBackup,
  deleteBackup,
  listBackups,
  restoreBackup,
  restoreFile,
  type BackupEntry,
} from '../lib/admin'
import { confirmDialog } from './ConfirmHost'

const REASON: Record<string, string> = {
  auto: 'automatique',
  manuelle: 'manuelle',
  'avant-restauration': 'avant restauration',
}

const when = (ts: number) =>
  new Date(ts * 1000).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

/**
 * Instantanés de data/ (liens, infos, réglages, notes, compteurs). Une
 * restauration en prend d'abord un de l'état courant, puis recharge la page :
 * notes et compteurs vivent aussi dans l'état de l'App, pas seulement la config.
 */
export default function SetBackups() {
  const [items, setItems] = useState<BackupEntry[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = () =>
    listBackups()
      .then(setItems)
      .catch(() => setItems([]))

  useEffect(() => {
    void load()
  }, [])

  const run = (p: Promise<unknown>, ok: string, reload = false) => {
    setBusy(true)
    setMsg(null)
    p.then(() => {
      setMsg({ ok: true, text: ok })
      if (reload) window.setTimeout(() => window.location.reload(), 700)
      else void load()
    })
      .catch((e: unknown) => setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }))
      .finally(() => setBusy(false))
  }

  const restore = (name: string) => {
    void confirmDialog({
      title: `Restaurer la sauvegarde du ${name.slice(6, 8)}/${name.slice(4, 6)} à ${name.slice(9, 11)}h${name.slice(11, 13)} ?`,
      body: [
        'Liens, infos, réglages, notes et compteurs reprennent leur état de ce moment-là.',
        "L'état actuel est sauvegardé juste avant : rien n'est perdu, tu pourras revenir en arrière.",
      ],
      confirmLabel: 'Restaurer',
    }).then((ok) => ok && run(restoreBackup(name), 'restauré — rechargement…', true))
  }

  const fromFile = (file: File) => {
    file
      .text()
      .then((text) => {
        const data: unknown = JSON.parse(text)
        void confirmDialog({
          title: `Restaurer « ${file.name} » ?`,
          body: [
            'Liens, infos, réglages, notes et compteurs sont remplacés par ceux du fichier.',
            "L'état actuel est sauvegardé juste avant : rien n'est perdu.",
          ],
          confirmLabel: 'Restaurer',
        }).then((ok) => ok && run(restoreFile(data), 'restauré — rechargement…', true))
      })
      .catch(() => setMsg({ ok: false, text: "fichier illisible — ce n'est pas du JSON" }))
  }

  return (
    <>
      <div className="set-add">
        <button onClick={() => run(createBackup(), 'sauvegarde créée')} disabled={busy}>
          💾 sauvegarder maintenant
        </button>
        <a className="set-button" href="api/backup" download>
          ⬇ télécharger
        </a>
        <button onClick={() => fileRef.current?.click()} disabled={busy}>
          ⬆ restaurer un fichier…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) fromFile(f)
            e.target.value = ''
          }}
        />
      </div>
      {msg ? <p className={`set-hint ${msg.ok ? 'set-ok' : 'set-bad'}`}>{msg.ok ? '✓' : '✗'} {msg.text}</p> : null}

      {items === null ? (
        <p className="set-hint">chargement…</p>
      ) : items.length === 0 ? (
        <p className="set-hint">Aucune sauvegarde pour l'instant — la première automatique arrive au démarrage.</p>
      ) : (
        <table className="set-table set-backups">
          <tbody>
            {items.map((b) => (
              <tr key={b.name}>
                <td>{when(b.created)}</td>
                <td className="set-hint">{REASON[b.reason.replace(/-\d+$/, '')] ?? b.reason}</td>
                <td className="set-hint">{(b.size / 1024).toFixed(0)} ko</td>
                <td className="set-row-actions">
                  <button onClick={() => restore(b.name)} disabled={busy}>
                    restaurer
                  </button>
                  <a href={`api/backups/${b.name}`} download title="Télécharger">
                    ⬇
                  </a>
                  <button
                    className="set-del"
                    onClick={() => {
                      void confirmDialog({
                        title: `Supprimer la sauvegarde du ${when(b.created)} ?`,
                        body: 'Elle est effacée de data/backups/ — les autres sont conservées.',
                        confirmLabel: 'Supprimer',
                        danger: true,
                      }).then((ok) => ok && run(deleteBackup(b.name), 'supprimée'))
                    }}
                    title="Supprimer"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="set-hint">
        Contient liens, infos, réglages, notes et compteurs — pas le jeton GitHub ni le journal.
        Automatique une fois par jour, {30} conservées, dans <code>data/backups/</code>.
      </p>
    </>
  )
}
