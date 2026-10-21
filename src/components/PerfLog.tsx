import { useEffect, useState } from 'react'
import { shown } from '../lib/errors'

type Tab = { tab: string; mb: number; peak_mb: number; cpu: number; seen: number; load_s: number | null; loads: number }
type Spike = { at: string; reason: string; grew_mb: number; total_mb: number; cpu: number; tabs: { tab: string; mb: number }[]; before: string[] }
type Day = {
  day: string
  server: {
    samples: number
    mem_mb: number
    mem_peak_mb: number
    cpu: number
    github_calls: number
    github_304: number
    local_scans: number
    ops: { op: string; n: number; avg_s: number; max_s: number }[]
    slow: { at: string; op: string; took_s: number }[]
  }
  app: { samples: number; mem_mb: number; mem_peak_mb: number; cpu: number; cpu_peak: number; tabs: Tab[]; spikes: Spike[] }
}

const OPS: Record<string, string> = { github: 'GitHub', local: 'Dépôts locaux', basecamp: 'Basecamp', config: 'Réglages' }
const n = (x: number) => x.toLocaleString('fr-FR')
const dayLabel = (d: string) => new Date(`${d}T12:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

/**
 * Réglages → Aide → Journal de performance (si le journal a des mesures) : ce
 * que consomment le serveur, l'appli et chaque onglet, jour par jour, en clair.
 * Le même résumé que `scripts/perf-report.py`, et « Copier » pour une issue.
 */
export default function PerfLog() {
  const [days, setDays] = useState<Day[] | null>(null)
  const [text, setText] = useState('')
  const [pick, setPick] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('api/perf/report?days=14', { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ days: Day[]; text: string }>)
      .then((d) => {
        setDays(d.days)
        setText(d.text)
      })
      .catch((e: unknown) => setError(shown('journal de performance', e)))
  }, [])

  if (error) return <p className="set-bad">✗ {error}</p>
  if (!days) return <p className="set-hint">chargement…</p>
  if (!days.length) return <p className="set-hint">Aucune mesure sur les 14 derniers jours.</p>
  const d = days[Math.min(pick, days.length - 1)]
  const heavy = d.app.tabs.filter((t) => t.mb >= 150).slice(0, 4)

  const copy = () => {
    try {
      void navigator.clipboard?.writeText(`Journal de performance homedash\n\n${text}`).then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      })
    } catch {
      /* presse-papier absent hors localhost/HTTPS */
    }
  }

  return (
    <div className="perf">
      <div className="set-bk-bar">
        <span className="guide-parts perf-days">
          {days.map((x, i) => (
            <button key={x.day} className={`xs-btn${i === pick ? ' is-on' : ''}`} onClick={() => setPick(i)}>
              {i === 0 && x.day === new Date().toISOString().slice(0, 10) ? "aujourd'hui" : dayLabel(x.day)}
            </button>
          ))}
        </span>
        <span className="set-spacer" />
        <button className="btn" onClick={copy}>
          {copied ? '✓ copié' : 'Copier pour une issue'}
        </button>
      </div>

      <div className="perf-cards">
        <div className="perf-card">
          <strong>Appli de bureau</strong>
          {d.app.samples ? (
            <>
              <span className="perf-big">{n(d.app.mem_mb)} Mo</span>
              <small>
                de mémoire en moyenne (pic {n(d.app.mem_peak_mb)} Mo), CPU {d.app.cpu} %, {d.app.tabs.length} sites
              </small>
            </>
          ) : (
            <small>Pas de mesure ce jour-là (appli fermée, ou journal coupé).</small>
          )}
        </div>
        <div className="perf-card">
          <strong>Serveur</strong>
          {d.server.samples ? (
            <>
              <span className="perf-big">{n(d.server.mem_mb)} Mo</span>
              <small>
                CPU {d.server.cpu} % · GitHub {n(d.server.github_calls)} appels (+ {n(d.server.github_304)} « rien de
                neuf », gratuits) · {n(d.server.local_scans)} scans du disque
              </small>
            </>
          ) : (
            <small>Pas de mesure ce jour-là.</small>
          )}
        </div>
      </div>

      {heavy.length ? (
        <p className="set-hint">
          💡 Les plus gourmands : {heavy.map((t) => `${t.tab} (${t.mb} Mo)`).join(', ')}. Pour libérer de la mémoire, clic
          droit sur leur icône → <em>Mettre en veille si inutilisé</em>.
        </p>
      ) : null}

      {d.app.tabs.length ? (
        <>
          <h3 className="set-sub">Par site</h3>
          <div className="md perf-md">
          <table className="md-table perf-table">
            <thead>
              <tr>
                <th>Site</th>
                <th>Mémoire</th>
                <th>Pic</th>
                <th>CPU</th>
                <th>Chargement</th>
              </tr>
            </thead>
            <tbody>
              {d.app.tabs.map((t) => (
                <tr key={t.tab}>
                  <td>{t.tab}</td>
                  <td>{n(t.mb)} Mo</td>
                  <td>{n(t.peak_mb)} Mo</td>
                  <td>{t.cpu} %</td>
                  <td>{t.load_s !== null ? `${t.load_s} s` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      ) : null}

      {d.app.spikes.length ? (
        <>
          <h3 className="set-sub">Pics ({d.app.spikes.length})</h3>
          <ul className="perf-list">
            {d.app.spikes.map((s, i) => (
              <li key={i}>
                <strong>{s.at}</strong> · {n(s.total_mb)} Mo (+{n(s.grew_mb)}), CPU {s.cpu} % — surtout{' '}
                {s.tabs.map((t) => `${t.tab} ${t.mb} Mo`).join(', ')}
                {s.before.length ? <small> · juste avant : {s.before.slice(-5).join(', ')}</small> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {d.server.slow.length ? (
        <>
          <h3 className="set-sub">Opérations lentes ({d.server.slow.length})</h3>
          <ul className="perf-list">
            {d.server.slow.slice(0, 8).map((s, i) => (
              <li key={i}>
                <strong>{s.at}</strong> · {OPS[s.op] ?? s.op} : {s.took_s} s
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}
