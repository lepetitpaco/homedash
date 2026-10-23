import { useState } from 'react'

/** `x:<id>` = onglet perso (`config.tabs`). */
export type TabId = 'links' | 'github' | 'basecamp' | 'events' | 'local' | 'settings' | `x:${string}`

export type Tab = {
  id: TabId
  /** Emoji, ou une image (icône d'un site pour un onglet perso). */
  icon: React.ReactNode
  label: string
  /** Compteur d'actions en attente, affiché en pastille. 0 ou absent = rien. */
  badge?: number
  badgeTitle?: string
  /** Pastille rouge (non-lus) plutôt que verte (ménage à faire). */
  badgeAlert?: boolean
  /** Compte de connexion d'un onglet perso : trait et lettre à sa couleur. */
  session?: { name: string; color: string }
  /** Onglets voisins du même groupe = un « duo » : un seul bloc, deux moitiés cliquables. */
  group?: { id: string; title: string }
  /** Onglet perso « ouvrir à part » : un lien vers `href`, pas une vue de la page. */
  href?: string
  title?: string
  /** Onglet perso : clic droit (même menu que son icône dans la barre de gauche). */
  onContext?: (e: React.MouseEvent) => void
  /** Onglet éphémère : contour pointillé et ✕ pour le fermer. */
  onClose?: () => void
  /** Se réordonne par glisser-déposer (onglets perso enregistrés). */
  movable?: boolean
  /** En veille (déchargé) : grisé, 💤 ; un clic le recharge. */
  asleep?: boolean
  /** Son : 🔊 joue, 🔇 coupé ; un clic sur l'icône bascule. */
  audio?: 'on' | 'muted'
  onToggleMute?: () => void
}

function TabButton({ t, active, onSelect }: { t: Tab; active: boolean; onSelect: (id: TabId) => void }) {
  const inner = (
    <>
      <span aria-hidden="true">{t.icon}</span>
      {t.label}
      {t.audio ? (
        <span
          className={`tab-audio${t.audio === 'muted' ? ' is-muted' : ''}`}
          role="button"
          title={t.audio === 'muted' ? 'Son coupé : clic pour le rétablir' : 'Joue du son : clic pour le couper'}
          onClick={(e) => {
            e.stopPropagation()
            t.onToggleMute?.()
          }}
        >
          {t.audio === 'muted' ? '🔇' : '🔊'}
        </span>
      ) : null}
      {t.asleep ? (
        <span className="tab-zz" title="En veille : un clic le recharge">
          💤
        </span>
      ) : null}
      {t.session ? (
        <span className="tab-session" title={`compte ${t.session.name}`}>
          {t.session.name.trim().charAt(0).toUpperCase()}
        </span>
      ) : null}
      {t.href ? (
        <span className="tab-out" aria-hidden="true">
          ↗
        </span>
      ) : null}
      {t.badge ? (
        <span className={`tab-badge${t.badgeAlert ? ' is-alert' : ''}`} title={t.badgeTitle}>
          {t.badge > 99 ? '99+' : t.badge}
        </span>
      ) : null}
    </>
  )
  // Ouvert à part : un vrai lien (clic milieu, ⌘-clic, glisser fonctionnent).
  if (t.href) {
    return (
      <a
        className={`tab${t.session ? ' has-session' : ''}`}
        onContextMenu={
          t.onContext
            ? (e) => {
                e.preventDefault()
                t.onContext!(e)
              }
            : undefined
        }
        style={t.session ? { ['--session' as string]: t.session.color } : undefined}
        href={t.href}
        target="_blank"
        rel="noreferrer"
        data-outside
        title={t.title ?? t.href}
      >
        {inner}
      </a>
    )
  }
  return (
    <button
      role="tab"
      aria-selected={active}
      className={`tab${active ? ' is-active' : ''}${t.session ? ' has-session' : ''}${t.onClose ? ' is-temp' : ''}${t.asleep ? ' is-asleep' : ''}`}
      style={t.session ? { ['--session' as string]: t.session.color } : undefined}
      onClick={() => onSelect(t.id)}
      // clic molette : fermer, comme dans un navigateur
      onAuxClick={
        t.onClose
          ? (e) => {
              if (e.button !== 1) return
              e.preventDefault()
              t.onClose!()
            }
          : undefined
      }
      onContextMenu={
        t.onContext
          ? (e) => {
              e.preventDefault()
              t.onContext!(e)
            }
          : undefined
      }
      title={t.session ? `${t.title ?? t.label} · compte ${t.session.name}` : t.title}
    >
      {inner}
    </button>
  )
}

export default function Tabs({
  id,
  tabs,
  active,
  onSelect,
  onAdd,
  onNewTemp,
  onMove,
}: {
  id?: string
  tabs: Tab[]
  active: TabId
  onSelect: (id: TabId) => void
  /** ＋ en bout de barre : ajouter un onglet perso. */
  onAdd?: () => void
  /** ⧉ en bout de barre : nouvel onglet éphémère (comme dans la barre de gauche). */
  onNewTemp?: (e: React.MouseEvent) => void
  /** Onglet `id` glissé avant `before` (onglets `movable`). */
  onMove?: (id: TabId, before: TabId) => void
}) {
  const [drag, setDrag] = useState<TabId | null>(null)
  const [over, setOver] = useState<TabId | null>(null)
  /** Un onglet seul : glissable s'il le faut, avec son ✕ s'il est éphémère. */
  const single = (t: Tab) => {
    const button = <TabButton t={t} active={t.id === active} onSelect={onSelect} />
    if (!t.movable && !t.onClose) return <span key={t.id} className="tab-wrap">{button}</span>
    return (
      <span
        key={t.id}
        className={`tab-wrap${over === t.id ? ' is-over' : ''}${drag === t.id ? ' is-dragging' : ''}`}
        draggable={!!t.movable}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', t.label)
          setDrag(t.id)
        }}
        onDragEnd={() => {
          setDrag(null)
          setOver(null)
        }}
        onDragOver={(e) => {
          if (!drag || drag === t.id || !t.movable) return
          e.preventDefault()
          setOver(t.id)
        }}
        onDrop={(e) => {
          e.preventDefault()
          if (drag && drag !== t.id) onMove?.(drag, t.id)
          setDrag(null)
          setOver(null)
        }}
      >
        {button}
        {t.onClose ? (
          <button className="tab-close" onClick={t.onClose} title="Fermer l'onglet éphémère">
            ✕
          </button>
        ) : null}
      </span>
    )
  }
  // Onglets voisins d'un même groupe rassemblés dans un seul bloc.
  const runs: Tab[][] = []
  for (const t of tabs) {
    const last = runs[runs.length - 1]
    if (t.group && last?.[0].group?.id === t.group.id) last.push(t)
    else runs.push([t])
  }
  return (
    <nav id={id} className="tabs" role="tablist">
      {runs.map((run) =>
        run.length > 1 && run[0].group ? (
          <div
            key={run[0].group.id}
            className={`tab-duo${run.some((t) => t.id === active) ? ' is-active' : ''}`}
            title={run[0].group.title}
          >
            {run.map((t, i) => (
              <span key={t.id} className="tab-duo-part">
                {i ? (
                  <span className="tab-duo-link" aria-hidden="true">
                    ⇄
                  </span>
                ) : null}
                <TabButton t={t} active={t.id === active} onSelect={onSelect} />
              </span>
            ))}
          </div>
        ) : (
          single(run[0])
        ),
      )}
      {onAdd ? (
        <button className="tab tab-add" onClick={onAdd} title="Ajouter un site ou un fichier du disque">
          ＋
        </button>
      ) : null}
      {onNewTemp ? (
        <button className="tab tab-add" onClick={onNewTemp} title="Nouvel onglet éphémère (disparaît à la fermeture)">
          ⧉
        </button>
      ) : null}
    </nav>
  )
}
