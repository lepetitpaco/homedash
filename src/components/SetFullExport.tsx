import { useRef, useState } from 'react'
import { fullExport, fullImport, fullPreview, type FullSummary } from '../lib/admin'
import { desktop, partitionOf } from '../lib/desktop'
import { shown } from '../lib/errors'
import { confirmDialog } from './ConfirmHost'

const MIN = 8
const when = (ts: number) => new Date(ts * 1000).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
const hasCookies = !!desktop?.features?.includes('full-export')

/** Sessions d'onglets de la config : la commune, et une par compte (Réglages → Mes sites). */
async function partitions(): Promise<string[]> {
  try {
    const cfg = (await (await fetch('api/config', { cache: 'no-store' })).json()) as { tabSessions?: { id: string }[] }
    return [partitionOf(undefined), ...(cfg.tabSessions ?? []).map((s) => partitionOf(s.id))]
  } catch {
    return [partitionOf(undefined)]
  }
}

/**
 * Export complet (#61) : pour passer d'une machine à l'autre. Contrairement à
 * l'export simple, il emporte les jetons et les connexions des sites, donc il
 * n'existe que chiffré par un mot de passe. L'import montre d'abord ce que
 * contient le fichier ; rien n'est écrit avant « Importer ».
 */
export default function SetFullExport() {
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [file, setFile] = useState<{ name: string; text: string } | null>(null)
  const [inPass, setInPass] = useState('')
  const [summary, setSummary] = useState<FullSummary | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const doExport = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const cookies = hasCookies ? await desktop?.exportCookies?.(await partitions()) : null
      const blob = await fullExport(pass, cookies ?? {})
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `homedash-${new Date().toISOString().slice(0, 10)}.homedash`
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(a.href), 5000)
      setPass('')
      setMsg({ ok: true, text: hasCookies ? 'export complet téléchargé (connexions des sites comprises)' : "export complet téléchargé (sans les connexions des sites : seule l'appli de bureau les a)" })
    } catch (e) {
      setMsg({ ok: false, text: shown('export complet', e) })
    } finally {
      setBusy(false)
    }
  }

  const preview = async () => {
    if (!file) return
    setBusy(true)
    setMsg(null)
    try {
      setSummary(await fullPreview(file.text, inPass))
    } catch (e) {
      setSummary(null)
      setMsg({ ok: false, text: shown('import complet', e) })
    } finally {
      setBusy(false)
    }
  }

  const doImport = async () => {
    if (!file || !summary) return
    const ok = await confirmDialog({
      title: 'Importer cet export complet ?',
      body: [
        'Liens, infos, réglages, notes, compteurs et comptes connectés (GitHub, Basecamp) sont remplacés par ceux du fichier.',
        "L'état actuel est sauvegardé juste avant (Sauvegardes), et les jetons actuels sont gardés à part : tu peux revenir en arrière.",
        summary.cookies && hasCookies ? 'Connexions des sites : certains (Google, Microsoft…) redemanderont quand même la connexion sur cette machine.' : '',
      ].filter(Boolean),
      confirmLabel: 'Importer',
    })
    if (!ok) return
    setBusy(true)
    try {
      const done = await fullImport(file.text, inPass, { settings: true, secrets: true, cookies: hasCookies })
      let extra = ''
      if (hasCookies && Object.keys(done.cookies || {}).length) {
        const r = await desktop?.importCookies?.(done.cookies)
        if (r) extra = ` · ${r.ok} connexion(s) de sites reprise(s)${r.failed ? `, ${r.failed} refusée(s)` : ''}`
      }
      setMsg({ ok: true, text: `importé${extra} — rechargement…` })
      window.setTimeout(() => window.location.reload(), 1200)
    } catch (e) {
      setMsg({ ok: false, text: shown('import complet', e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="set-hint">
        Pour passer d'une machine à l'autre : tout homedash, <strong>jetons et connexions des sites compris</strong>, dans un
        fichier chiffré par un mot de passe. Garde-le pour toi : avec le mot de passe, il ouvre tes comptes.
      </p>
      <div className="set-add">
        <input
          type="password"
          placeholder={`mot de passe (${MIN} caractères au moins)`}
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          autoComplete="new-password"
          data-1p-ignore
          data-bwignore
          data-lpignore="true"
        />
        <button onClick={() => void doExport()} disabled={busy || pass.length < MIN}>
          🔐 export complet
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={busy}>
          ⬆ importer un export complet…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".homedash"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            setSummary(null)
            void f.text().then((text) => setFile({ name: f.name, text }))
          }}
        />
      </div>
      {file ? (
        <div className="set-add">
          <span className="set-hint">{file.name}</span>
          <input
            type="password"
            placeholder="mot de passe de l'export"
            value={inPass}
            onChange={(e) => setInPass(e.target.value)}
            autoComplete="off"
            data-1p-ignore
            data-bwignore
            data-lpignore="true"
          />
          <button onClick={() => void preview()} disabled={busy || !inPass}>
            aperçu
          </button>
          <button onClick={() => (setFile(null), setSummary(null), setInPass(''))} disabled={busy}>
            annuler
          </button>
        </div>
      ) : null}
      {summary ? (
        <div className="set-hint">
          <p>
            Export du {when(summary.created)} (homedash {summary.version}) : « {summary.title} », {summary.links} lien(s), {summary.tabs}{' '}
            site(s), {summary.notes} note(s), {summary.github_accounts} compte(s) GitHub ({summary.github_tokens} connecté(s))
            {summary.basecamp ? ', Basecamp connecté' : ''}, connexions de {summary.cookie_sites} site(s).
          </p>
          {summary.cookies && !hasCookies ? <p>Les connexions des sites ne se reprennent que dans l'appli de bureau.</p> : null}
          {summary.cookies && hasCookies ? <p>⚠ Certains sites redemanderont la connexion sur cette machine (Google, Microsoft…).</p> : null}
          <button onClick={() => void doImport()} disabled={busy}>
            importer
          </button>
        </div>
      ) : null}
      {msg ? <p className={`set-hint ${msg.ok ? 'set-ok' : 'set-bad'}`}>{msg.ok ? '✓' : '✗'} {msg.text}</p> : null}
    </>
  )
}
