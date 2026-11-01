import { useEffect, useRef, useState, type ReactNode } from 'react'
import { folderOf, moveTab, sessionOf, srcOf, tabKey } from '../lib/customTabs'
import { moveFolder, railEntries } from '../lib/railOrder'
import type { CustomTab, TabFolder, TabSession } from '../types'

/** Largeur de la barre : icônes + noms, icônes seules, petites icônes, ou cachée. */
export type RailMode = 'wide' | 'icons' | 'mini' | 'hidden'

const OPEN_KEY = 'homedash:rail-closed'

function readClosed(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(OPEN_KEY) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** Icône de dossier aux couleurs du dossier (un emoji ne se colore pas). */
function FolderGlyph({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path fill={color} d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6c.6 0 1.2.24 1.65.67L12.3 6.2H18.5A2.5 2.5 0 0 1 21 8.7v8.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />
    </svg>
  )
}

const badge = (n: number) => (n ? <span className="rail-badge">{n > 99 ? '99+' : n}</span> : null)

/** Où tomberait l'icône qu'on glisse : avant un onglet, sur lui (dossier), dans un dossier, à la fin. */
type Over = { id: string; zone: 'before' | 'merge' } | null

type Props = {
  tabs: CustomTab[]
  /** Onglets éphémères (lien ouvert au clic droit) : en bas, ni glissables ni rangés. */
  temps: CustomTab[]
  /** Onglets en veille (clés `x:…`) : grisés, 💤. */
  asleep: string[]
  /** Sites en cours de chargement au démarrage (clés `x:…`) : un anneau sur l'icône. */
  warming: string[]
  /** Son par onglet (clés `x:…`) : 🔊 joue, 🔇 coupé ; un clic sur l'icône bascule. */
  audible: Record<string, boolean>
  muted: Record<string, boolean>
  onToggleMute: (tab: CustomTab) => void
  onTempMenu: (e: React.MouseEvent, tab: CustomTab) => void
  onTempClose: (tab: CustomTab) => void
  folders: TabFolder[]
  sessions: TabSession[]
  /** Onglet perso ouvert (`x:…`), `settings`, ou null quand on est dans homedash. */
  active: string | null
  mode: RailMode
  icons: Record<string, ReactNode>
  counts: Record<string, number>
  /** Onglets ouverts dans chaque espace (`x:…`, `links` pour le dash) : visibles d'ici (issue #60). */
  kids: Record<string, number>
  onHome: () => void
  onSettings: () => void
  onSelect: (key: `x:${string}`) => void
  /** ＋ : nouvel onglet (une fenêtre, sans passer par Réglages). */
  onAdd: () => void
  /** Clic droit sur la barre hors d'une icône : ajouter, éphémère, largeur, cacher. */
  onMenu: (e: React.MouseEvent) => void
  /** Ordre ou dossier changé par glisser-déposer : écrit dans la config. */
  onTabs: (tabs: CustomTab[]) => void
  /** Un dossier glissé à une autre place : écrit dans la config. */
  onFolders: (folders: TabFolder[]) => void
  /** Une icône lâchée sur une autre hors dossier : nouveau dossier pour les deux. */
  onMerge: (dragged: CustomTab, target: CustomTab) => void
  onTabMenu: (e: React.MouseEvent, tab: CustomTab) => void
  onFolderMenu: (e: React.MouseEvent, folder: TabFolder) => void
}

/**
 * Barre de gauche, comme les serveurs Discord : ⚡ = homedash et ses onglets
 * natifs (barre du haut), puis une icône par onglet perso, avec sa pastille de
 * non-lus et le liseré de son compte, rangées dans des dossiers repliables.
 *
 * Glisser une icône : sur le haut d'une autre = la placer avant ; sur une
 * autre = les réunir dans un dossier (ou rejoindre le sien) ; sur un dossier =
 * y entrer ; tout en bas = sortir du dossier. Clic droit pour le reste.
 *
 * Glisser un dossier : sur un site ou un dossier = se placer devant ; tout en bas = à la fin.
 *
 * En bas, ＋ et ⚙ seuls : un éphémère, la largeur et « cacher » passent par
 * le clic droit sur la barre (`onMenu`).
 *
 * Replié ou non, un dossier est une préférence de l'écran (localStorage) ; les
 * dossiers eux-mêmes et l'ordre vivent dans la config.
 */
export default function Rail({
  tabs,
  temps,
  asleep,
  warming,
  audible,
  muted,
  onToggleMute,
  onTempMenu,
  onTempClose,
  folders,
  sessions,
  active,
  mode,
  icons,
  counts,
  kids,
  onHome,
  onSettings,
  onSelect,
  onAdd,
  onMenu,
  onTabs,
  onFolders,
  onMerge,
  onTabMenu,
  onFolderMenu,
}: Props) {
  const [closed, setClosed] = useState<string[]>(readClosed)
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<Over>(null)

  const toggle = (id: string) => {
    const next = closed.includes(id) ? closed.filter((x) => x !== id) : [...closed, id]
    setClosed(next)
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(next))
    } catch {
      /* stockage indisponible */
    }
  }

  const loose = tabs.filter((t) => !folderOf(t, folders))
  const inFolder = (f: TabFolder) => tabs.filter((t) => folderOf(t, folders) === f.id)
  const wide = mode === 'wide'
  // Notifications coupées (`notify: false`) : pas de pastille.
  /** « 2 » en haut à droite : des onglets sont ouverts en haut de cet espace. */
  const kidsBadge = (key: string, name: string) => {
    const n = kids[key] ?? 0
    return n ? (
      <span className="rail-open" title={`${n} onglet${n > 1 ? 's' : ''} ouvert${n > 1 ? 's' : ''} dans ${name}`}>
        {n}
      </span>
    ) : null
  }
  const unread = (t: CustomTab) => (t.embed && t.notify !== false ? (counts[tabKey(t)] ?? 0) : 0)
  /** Glissé : un dossier (clé `f:id`), sinon un site. */
  const draggedFolder = drag?.startsWith('f:') ? drag.slice(2) : null
  const endDrag = () => {
    setDrag(null)
    setOver(null)
  }

  /** Cible de dépôt simple (un dossier, la fin de la liste). */
  const dropZone = (id: string, apply: (dragged: string) => void) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!drag) return
      e.preventDefault()
      e.stopPropagation()
      setOver({ id, zone: 'merge' })
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (drag) apply(drag)
      endDrag()
    },
  })

  /** Compte d'un dossier : le sien, sinon celui que partagent tous ses sites. */
  const folderSession = (id?: string) => {
    const f = folders.find((x) => x.id === id)
    if (!f) return undefined
    if (f.session) return f.session
    const inside = tabs.filter((x) => x.folder === id)
    return inside.length && inside.every((x) => x.session === inside[0].session) ? inside[0].session : undefined
  }
  const item = (t: CustomTab) => {
    const key = tabKey(t)
    const own = sessionOf(t, sessions)
    // Le compte de tout son dossier : pas répété sur chaque icône (issue #60),
    // seulement l'exception. Le nom au survol le dit toujours.
    const session = own && own.id !== folderSession(t.folder) ? own : undefined
    const zone = over?.id === t.id ? over.zone : null
    const inner = (
      <>
        <span
          className={`rail-icon${session ? ' has-session' : ''}`}
          style={session ? { ['--session' as string]: session.color } : undefined}
        >
          {icons[t.id]}
          {/* Compte : sa lettre dans le coin, pour distinguer deux mêmes sites en icônes seules. */}
          {session ? (
            <span className="rail-session" aria-hidden="true">
              {session.name.trim().charAt(0).toUpperCase()}
            </span>
          ) : null}
          {badge(unread(t))}
          {kidsBadge(key, t.label)}
{audible[key] || muted[key] ? (
            <span
              className={`rail-audio${muted[key] ? ' is-muted' : ''}`}
              role="button"
              title={muted[key] ? 'Son coupé : clic pour le rétablir' : 'Joue du son : clic pour le couper'}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onToggleMute(t)
              }}
            >
              {muted[key] ? '🔇' : '🔊'}
            </span>
          ) : null}
          {asleep.includes(key) ? <span className="rail-zz" aria-hidden="true">💤</span> : null}
          {!t.embed ? <span className="rail-out" aria-hidden="true">↗</span> : null}
        </span>
        {wide ? (
          <span className="rail-label">
            {t.label}
            {session ? (
              <small className="rail-label-session" style={{ color: session.color }}>
                {session.name}
              </small>
            ) : null}
          </span>
        ) : null}
      </>
    )
    const title = `${t.label}${own ? ` · compte ${own.name}` : ''}${t.embed ? '' : ' ↗'}${
      asleep.includes(key) ? ' · 💤 en veille, se recharge au clic' : ''}${warming.includes(key) ? ' · chargement…' : ''}`
    return (
      <div
        key={t.id}
        className={`rail-item${active === key ? ' is-active' : ''}${zone ? ` is-${zone}` : ''}${drag === t.id ? ' is-dragging' : ''}${asleep.includes(key) ? ' is-asleep' : ''}${warming.includes(key) ? ' is-warming' : ''}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', t.label)
          setDrag(t.id)
        }}
        onDragEnd={endDrag}
        onContextMenu={(e) => {
          e.preventDefault()
          onTabMenu(e, t)
        }}
        onDragOver={(e) => {
          if (!drag || drag === t.id) return
          // Un dossier ne se range que dans la liste, pas dans un autre dossier.
          if (draggedFolder && folderOf(t, folders)) return
          e.preventDefault()
          e.stopPropagation()
          if (draggedFolder) return setOver({ id: t.id, zone: 'before' })
          // Haut de l'icône : placer avant ; le reste : réunir (comme Discord).
          const r = e.currentTarget.getBoundingClientRect()
          setOver({ id: t.id, zone: e.clientY - r.top < r.height * 0.3 ? 'before' : 'merge' })
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (draggedFolder) {
            onFolders(moveFolder(folders, draggedFolder, { tab: t.id }))
            return endDrag()
          }
          const dragged = tabs.find((x) => x.id === drag)
          if (dragged && dragged.id !== t.id) {
            const folder = folderOf(t, folders)
            if (zone === 'before') onTabs(moveTab(tabs, dragged.id, t.id, folder))
            else if (folder) onTabs(moveTab(tabs, dragged.id, null, folder))
            else onMerge(dragged, t)
          }
          endDrag()
        }}
      >
        <span className="rail-pill" aria-hidden="true" />
        {t.embed ? (
          <button className="rail-btn" onClick={() => onSelect(key)} title={title}>
            {inner}
          </button>
        ) : (
          <a className="rail-btn" href={srcOf(t.url)} target="_blank" rel="noreferrer" data-outside title={title}>
            {inner}
          </a>
        )}
      </div>
    )
  }

  // L'onglet affiché reste visible : un onglet ouvert en bas d'une longue barre
  // était créé hors de la partie visible (issue #53). Un nouveau clignote un instant.
  const navRef = useRef<HTMLElement>(null)
  const seen = useRef(new Set(temps.map((t) => t.id)))
  const [fresh, setFresh] = useState<string | null>(null)
  useEffect(() => {
    const added = temps.find((t) => !seen.current.has(t.id))
    seen.current = new Set(temps.map((t) => t.id))
    if (!added) return
    setFresh(added.id)
    const timer = window.setTimeout(() => setFresh(null), 1600)
    return () => window.clearTimeout(timer)
  }, [temps])
  useEffect(() => {
    navRef.current?.querySelector('.rail-list .is-active')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [active, temps.length])

  return (
    <nav
      ref={navRef}
      className={`rail is-${mode}`}
      aria-label="Mes sites"
      // Les icônes ont leur propre menu (elles l'ont déjà ouvert : defaultPrevented).
      onContextMenu={(e) => {
        if (e.defaultPrevented) return
        e.preventDefault()
        onMenu(e)
      }}
    >
      <div className={`rail-item rail-home${active ? '' : ' is-active'}`}>
        <span className="rail-pill" aria-hidden="true" />
        <button className="rail-btn" onClick={onHome} title="homedash : Raccourcis, GitHub, Local…">
          <span className="rail-icon">
            ⚡{kidsBadge('links', 'homedash')}
          </span>
          {wide ? <span className="rail-label">homedash</span> : null}
        </button>
      </div>
      <div className="rail-sep" />

      <div className="rail-list">
        {/* Aucun site encore : le premier à ajouter, en évidence sous ⚡. */}
        {!tabs.length && !temps.length ? (
          <div className="rail-item rail-first">
            <span className="rail-pill" aria-hidden="true" />
            <button className="rail-btn" onClick={onAdd} title="Ajouter ton premier site : Gmail, Chat, Claude…">
              <span className="rail-icon">＋</span>
              {wide ? <span className="rail-label">Ajouter un site</span> : null}
            </button>
          </div>
        ) : null}
        {railEntries(loose, folders).map((entry) => {
          if ('tab' in entry) return item(entry.tab)
          const f = entry.folder
          const kids = inFolder(f)
          const open = !closed.includes(f.id)
          const sum = kids.reduce((s, t) => s + unread(t), 0)
          const holds = kids.some((t) => active === tabKey(t))
          const color = f.color ?? '#60a5fa'
          return (
            <div
              key={f.id}
              className={`rail-folder${open ? ' is-open' : ''}${over?.id === `f:${f.id}` && over.zone === 'merge' ? ' is-over' : ''}`}
              style={{ ['--folder' as string]: color }}
            >
              <div
                className={`rail-item${!open && holds ? ' is-active' : ''}${over?.id === `f:${f.id}` && over.zone === 'before' ? ' is-before' : ''}${drag === `f:${f.id}` ? ' is-dragging' : ''}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', f.name)
                  setDrag(`f:${f.id}`)
                }}
                onDragEnd={endDrag}
              >
                <span className="rail-pill" aria-hidden="true" />
                <button
                  className="rail-btn rail-folder-btn"
                  onClick={() => toggle(f.id)}
                  title={`${f.name} · ${open ? 'replier' : 'déplier'}`}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    onFolderMenu(e, f)
                  }}
                  onDragOver={(e) => {
                    if (!drag || drag === `f:${f.id}`) return
                    e.preventDefault()
                    e.stopPropagation()
                    setOver({ id: `f:${f.id}`, zone: draggedFolder ? 'before' : 'merge' })
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (draggedFolder) onFolders(moveFolder(folders, draggedFolder, { folder: f.id }))
                    else if (drag) onTabs(moveTab(tabs, drag, null, f.id))
                    endDrag()
                  }}
                >
                  {open || !kids.length ? (
                    <span className="rail-icon rail-folder-icon">
                      {f.icon ? f.icon : <FolderGlyph color={color} />}
                    </span>
                  ) : (
                    // Replié : ses quatre premières icônes en miniature, comme Discord.
                    <span className="rail-icon rail-mini">
                      {kids.slice(0, 4).map((t) => (
                        <span key={t.id}>{icons[t.id]}</span>
                      ))}
                      {badge(sum)}
                    </span>
                  )}
                  {wide ? <span className="rail-label rail-folder-name">{f.name}</span> : null}
                </button>
              </div>
              {open ? <div className="rail-kids">{kids.map(item)}</div> : null}
            </div>
          )
        })}

        {temps.length ? (
          <div className="rail-temps" aria-label="Onglets temporaires">
            {temps.map((t) => {
              const key = tabKey(t)
              const session = sessionOf(t, sessions)
              return (
                <div
                  key={t.id}
                  className={`rail-item rail-temp${active === key ? ' is-active' : ''}${asleep.includes(key) ? ' is-asleep' : ''}${fresh === t.id ? ' is-fresh' : ''}`}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    onTempMenu(e, t)
                  }}
                >
                  <span className="rail-pill" aria-hidden="true" />
                  <button
                    className="rail-btn"
                    onClick={() => onSelect(key)}
                    title={`${t.label} · onglet temporaire${session ? ` · compte ${session.name}` : ''} — clic droit pour le garder`}
                  >
                    <span
                      className={`rail-icon${session ? ' has-session' : ''}`}
                      style={session ? { ['--session' as string]: session.color } : undefined}
                    >
                      {icons[t.id]}
                      {badge(unread(t))}
                      {asleep.includes(key) ? <span className="rail-zz" aria-hidden="true">💤</span> : null}
                      {audible[key] || muted[key] ? (
                        <span
                          className={`rail-audio${muted[key] ? ' is-muted' : ''}`}
                          role="button"
                          title={muted[key] ? 'Son coupé : clic pour le rétablir' : 'Joue du son : clic pour le couper'}
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            onToggleMute(t)
                          }}
                        >
                          {muted[key] ? '🔇' : '🔊'}
                        </span>
                      ) : null}
                    </span>
                    {wide ? <span className="rail-label">{t.label}</span> : null}
                  </button>
                  <button className="rail-temp-x" onClick={() => onTempClose(t)} title="Fermer l'onglet">
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
        ) : null}

        {/* Zone libre en bas : y déposer une icône la sort de son dossier. */}
        <div
          className={`rail-end${over?.id === 'end' ? ' is-over' : ''}`}
          {...dropZone('end', (id) =>
            draggedFolder ? onFolders(moveFolder(folders, draggedFolder, {})) : onTabs(moveTab(tabs, id, null)),
          )}
        />
      </div>

      <div className="rail-foot">
        <button className="rail-tool rail-add" onClick={onAdd} title="Ajouter un site">
          ＋{wide ? <span className="rail-label">Ajouter</span> : null}
        </button>
        <button
          className={`rail-tool rail-settings${active === 'settings' ? ' is-active' : ''}`}
          onClick={onSettings}
          title="Réglages · clic droit sur la barre : ajouter un site, onglet temporaire, largeur"
        >
          ⚙{wide ? <span className="rail-label">Réglages</span> : null}
        </button>
      </div>
    </nav>
  )
}
