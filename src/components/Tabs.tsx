import { useCallback, useRef, useState } from 'react'
import { useDismiss } from '../hooks/useDismiss'

/** `x:<id>` = onglet perso (`config.tabs`). */
export type TabId = 'links' | 'github' | 'basecamp' | 'trello' | 'events' | 'local' | 'settings' | `x:${string}`

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
  /** Dossier : une pastille qui déplie ses sites (`kids`) sous elle ; son compteur = la somme des leurs. */
  kids?: Tab[]
  /** Couleur du dossier (point devant son nom). */
  color?: string
}

/** Taille des pastilles (menu Disposition, quand les onglets sont en haut). */
export type StripSize = 'mini' | 'icons' | 'large'
/** Style des onglets du haut : pastilles (défaut) ou soulignés (le rendu d'avant les pastilles). */
export type TabLook = 'pills' | 'underline'

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

/** Un dossier : une pastille, ses sites dans une liste qui s'ouvre au clic. */
function FolderPill({ t, active, single }: { t: Tab; active: TabId; single: (t: Tab) => React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLSpanElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, wrap, close)
  const kids = t.kids ?? []
  const here = kids.find((k) => k.id === active)
  const sum = kids.reduce((n, k) => n + (k.badge ?? 0), 0)
  return (
    <span ref={wrap} className={`tab-wrap tab-folder${open ? ' is-open' : ''}`} style={t.color ? { ['--folder' as string]: t.color } : undefined}>
      <button
        type="button"
        className={`tab${here ? ' is-active' : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(!open)}
        onContextMenu={
          t.onContext
            ? (e) => {
                e.preventDefault()
                t.onContext!(e)
              }
            : undefined
        }
        title={`${t.label} · ${kids.length} site(s)${here ? ` · ${here.label} affiché` : ''}`}
      >
        <span aria-hidden="true">{t.icon}</span>
        {t.label}
        {here ? <span className="tab-folder-here">› {here.label}</span> : null}
        {sum ? (
          <span className="tab-badge is-alert" title={`${sum} non lu(s) dans le dossier`}>
            {sum > 99 ? '99+' : sum}
          </span>
        ) : null}
        <span className="tab-folder-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? (
        <span
          className="tab-folder-list"
          role="group"
          aria-label={t.label}
          // un site choisi : la liste se referme
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('.tab:not(.tab-close)')) setOpen(false)
          }}
        >
          {kids.length ? kids.map(single) : <span className="tab-folder-empty">Dossier vide</span>}
        </span>
      ) : null}
    </span>
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
  onMenu,
  size = 'icons',
  autoHide = false,
  look = 'pills',
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
  /** Clic droit sur la barre (hors onglet qui a son propre menu). */
  onMenu?: (e: React.MouseEvent) => void
  size?: StripSize
  /** Masquée : une fine bande à sa place, la barre apparaît par-dessus la page au survol. */
  autoHide?: boolean
  look?: TabLook
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
          <button className="tab-close" onClick={t.onClose} title="Fermer l'onglet">
            ✕
          </button>
        ) : null}
      </span>
    )
  }
  // Onglets voisins d'un même groupe rassemblés dans un seul bloc.
  const runs: Tab[][] = []
  for (const t of tabs) {
    if (t.kids) {
      runs.push([t])
      continue
    }
    const last = runs[runs.length - 1]
    if (t.group && last?.[0].group?.id === t.group.id) last.push(t)
    else runs.push([t])
  }
  const nav = (
    <nav
      id={autoHide ? undefined : id}
      className={`tabs is-${size}${look === 'underline' ? ' is-underline' : ''}`}
      role="tablist"
      onContextMenu={
        onMenu
          ? (e) => {
              if (e.defaultPrevented) return
              e.preventDefault()
              onMenu(e)
            }
          : undefined
      }
    >
      {runs.map((run) =>
        run[0].kids ? (
          <FolderPill key={run[0].id} t={run[0]} active={active} single={single} />
        ) : run.length > 1 && run[0].group ? (
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
        <button className="tab tab-add" onClick={onNewTemp} title="Nouvel onglet temporaire (fermé au redémarrage)">
          ⧉
        </button>
      ) : null}
    </nav>
  )
  if (!autoHide) return nav
  // La bande garde l'id : c'est elle que mesure `--strip-h` (un site dessous prend le reste).
  return (
    <div id={id} className="tabs-shell">
      {nav}
    </div>
  )
}
