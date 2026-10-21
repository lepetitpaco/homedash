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
import { shown } from '../lib/errors'

const REASON: Record<string, string> = {
  auto: 'automatique',
  manuelle: 'manuelle',
  'avant-restauration': 'avant restauration',
}

/** `auto-2` → automatique, `avant-1-18-0` → avant 1.18.0 (prise juste avant une mise à jour). */
const reasonOf = (r: string) => {
  const update = /^avant-(\d+)-(\d+)-(\d+)(?:-\d+)?$/.exec(r)
  if (update) return `avant ${update[1]}.${update[2]}.${update[3]}`
  return REASON[r.replace(/-\d+$/, '')] ?? r
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
  // Cochées pour « supprimer la sélection » (noms de fichier).
  const [picked, setPicked] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const load = () =>
    listBackups()
      .then((list) => {
        setItems(list)
        // une sauvegarde qui n'existe plus ne reste pas cochée
        setPicked((p) => p.filter((n) => list.some((b) => b.name === n)))
      })
      .catch(() => setItems([]))

  const toggle = (name: string) => setPicked((p) => (p.includes(name) ? p.filter((n) => n !== name) : [...p, name]))
  const removePicked = () => {
    const names = picked
    const keep = (items?.length ?? 0) - names.length
    void confirmDialog({
      title: `Supprimer ${names.length} sauvegarde${names.length > 1 ? 's' : ''} ?`,
      body: [
        'Elles sont effacées définitivement.',
        keep ? `Les ${keep} autre${keep > 1 ? 's' : ''} sont conservée${keep > 1 ? 's' : ''}.` : 'Il ne restera plus aucune sauvegarde : la prochaine automatique arrive dans la journée.',
      ],
      confirmLabel: 'Supprimer',
      danger: true,
    }).then(
      (ok) =>
        ok &&
        run(
          names.reduce<Promise<unknown>>((p, n) => p.then(() => deleteBackup(n)), Promise.resolve()),
          `${names.length} supprimée${names.length > 1 ? 's' : ''}`,
        ),
    )
  }

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
      .catch((e: unknown) => setMsg({ ok: false, text: shown('sauvegardes', e) }))
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
        <>
        <div className="set-bk-bar">
          <label className="set-bk-check">
            <input
              type="checkbox"
              checked={picked.length === items.length}
              ref={(el) => {
                if (el) el.indeterminate = picked.length > 0 && picked.length < items.length
              }}
              onChange={() => setPicked(picked.length === items.length ? [] : items.map((b) => b.name))}
            />
            tout
          </label>
          <button
            className="set-inline-btn"
            onClick={() => setPicked(items.filter((b) => b.reason.startsWith('auto')).map((b) => b.name))}
          >
            les automatiques
          </button>
          <button
            className="set-inline-btn"
            onClick={() => setPicked(items.filter((b) => Date.now() / 1000 - b.created > 7 * 86400).map((b) => b.name))}
          >
            plus de 7 jours
          </button>
          <span className="set-spacer" />
          {picked.length ? (
            <button className="set-del-many" onClick={removePicked} disabled={busy}>
              ✕ supprimer la sélection ({picked.length} ·{' '}
              {(items.filter((b) => picked.includes(b.name)).reduce((n, b) => n + b.size, 0) / 1024).toFixed(0)} ko)
            </button>
          ) : (
            <span className="set-hint">coche des sauvegardes pour les supprimer d'un coup</span>
          )}
        </div>
        <table className="set-table set-backups">
          <tbody>
            {items.map((b) => (
              <tr key={b.name} className={picked.includes(b.name) ? 'is-picked' : undefined}>
                <td className="set-bk-cell">
                  <input
                    type="checkbox"
                    checked={picked.includes(b.name)}
                    onChange={() => toggle(b.name)}
                    aria-label={`Sélectionner la sauvegarde du ${when(b.created)}`}
                  />
                </td>
                <td>{when(b.created)}</td>
                <td className="set-hint">{reasonOf(b.reason)}</td>
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
                        body: 'Elle est effacée définitivement ; les autres sont conservées.',
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
        </>
      )}
      <p className="set-hint">
        Contient liens, infos, réglages, notes et compteurs — pas le jeton GitHub ni le journal.
        Automatique une fois par jour et avant chaque mise à jour, {30} conservées.
      </p>
    </>
  )
}
