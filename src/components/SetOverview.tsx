import { useEffect, useState } from 'react'
import { listBackups, type BackupEntry } from '../lib/admin'
import { notifState, type NotifState } from '../lib/notifications'
import { featureOn, type Config, type Feature } from '../types'
import type { Bars } from './BarLayoutForm'

type Health = { github?: boolean; basecamp?: boolean; trello?: boolean; local?: boolean }

const SERVICES: { id: Feature; icon: string; label: string; section: string; off: string }[] = [
  { id: 'github', icon: '🐙', label: 'GitHub', section: 'set-github:account', off: 'pas de jeton' },
  { id: 'local', icon: '💻', label: 'Local', section: 'set-local', off: 'aucun dossier lu' },
  { id: 'basecamp', icon: '🏕', label: 'Basecamp', section: 'set-basecamp', off: 'non connecté' },
  { id: 'trello', icon: '📋', label: 'Trello', section: 'set-trello', off: 'non connecté' },
]

const ago = (ts: number) => {
  const min = Math.round((Date.now() / 1000 - ts) / 60)
  if (min < 2) return 'à l’instant'
  if (min < 60) return `il y a ${min} min`
  const h = Math.round(min / 60)
  if (h < 48) return `il y a ${h} h`
  return `il y a ${Math.round(h / 24)} jours`
}

/**
 * Réglages → Vue d'ensemble : ce qui est branché et ce qui manque, en un écran. Chaque ligne
 * mène à sa page ; on n'a plus à se souvenir où chaque chose est rangée.
 */
export default function SetOverview({ config, bars, onJump }: { config: Config; bars?: Bars; onJump: (section: string) => void }) {
  const [health, setHealth] = useState<Health | null>(null)
  const [last, setLast] = useState<BackupEntry | null | undefined>(undefined)
  const [bell] = useState<NotifState>(() => notifState())
  useEffect(() => {
    fetch('api/health', { cache: 'no-store' })
      .then((r) => r.json() as Promise<Health>)
      .then(setHealth)
      .catch(() => setHealth({}))
    listBackups()
      .then((list) => setLast(list.reduce<BackupEntry | null>((a, b) => (!a || b.created > a.created ? b : a), null)))
      .catch(() => setLast(null))
  }, [])

  const services = SERVICES.filter((s) => featureOn(config, s.id))
  const missing = services.filter((s) => health && !health[s.id]).length
  const row = (icon: string, label: string, state: React.ReactNode, ok: boolean | null, action: string, section: string) => (
    <li className={`set-ov-row${ok === false ? ' is-off' : ''}`} key={label}>
      <span className="set-ov-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="set-ov-label">{label}</span>
      <span className="set-ov-state">
        <i className={ok === null ? 'is-none' : ok ? 'is-ok' : 'is-todo'} aria-hidden="true" />
        {state}
      </span>
      <button type="button" className={ok === false ? 'set-ov-go is-primary' : 'set-ov-go'} onClick={() => onJump(section)}>
        {action}
      </button>
    </li>
  )
  return (
    <div className="set-ov">
      <p className="set-hint">
        {!health ? 'Lecture de l’état…' : missing ? `${missing} service${missing > 1 ? 's' : ''} à brancher.` : 'Tout est branché.'} Le
        reste se règle quand l’envie vient ; la recherche du haut trouve chaque réglage (tape « veille », « sauvegarde »…).
      </p>
      <h3>Services</h3>
      <ul className="set-ov-list">
        {services.map((s) =>
          row(
            s.icon,
            s.label,
            !health ? '…' : health[s.id] ? 'branché' : s.off,
            health ? !!health[s.id] : null,
            health && !health[s.id] ? 'Brancher' : 'Gérer',
            s.section,
          ),
        )}
        {services.length < SERVICES.length
          ? row('🧩', 'Fonctionnalités', `${SERVICES.length - services.length} coupée(s)`, null, 'Gérer', 'set-features')
          : null}
      </ul>
      <h3>Au quotidien</h3>
      <ul className="set-ov-list">
        {row(
          '🔔',
          'Notifications du bureau',
          bell === 'on' ? 'actives' : bell === 'muted' ? 'en sourdine' : bell === 'default' ? 'pas encore autorisées' : 'indisponibles',
          bell === 'on' || bell === 'muted' ? true : bell === 'default' ? false : null,
          bell === 'default' ? 'Activer' : 'Gérer',
          'set-notifs',
        )}
        {row(
          '💾',
          'Sauvegardes',
          last === undefined ? '…' : last ? `dernière ${ago(last.created)}` : 'aucune pour l’instant',
          last === undefined ? null : !!last,
          'Gérer',
          'set-backups',
        )}
        {row('🗂', 'Mes sites', `${config.tabs?.length ?? 0} site(s)`, null, 'Gérer', 'set-tabs')}
        {bars
          ? row('🧭', 'Barres et onglets', bars.top ? 'onglets en haut' : 'barre de gauche', null, 'Changer', 'set-bars')
          : null}
      </ul>
    </div>
  )
}
