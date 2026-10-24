import { useEffect, useRef, useState } from 'react'
import { browse, type Browse } from '../lib/admin'
import {
  tabKey,
  domainsOf,
  folderOf,
  hostOf,
  isLocal,
  newFolderId,
  newSessionId,
  newTabId,
  preloads,
  refusesEmbed,
  sessionOf,
} from '../lib/customTabs'
import { desktop, hasLinkFlip, hasSessions, partitionOf, RELOAD_TAB } from '../lib/desktop'
import { EDIT_TAB_EVENT, EDIT_TAB_KEY, NEW_TAB_EVENT, NEW_TAB_KEY } from '../lib/settingsNav'
import type { CustomTab, TabFolder, TabSession } from '../types'
import { confirmDialog } from './ConfirmHost'
import SiteIcon, { isImageIcon } from './SiteIcon'
import { askNameColor } from './NameColorHost'
import Pick from './Pick'
import { CATALOG, type CatalogSite } from '../lib/catalog'
import { keys } from '../lib/keys'
import { shown } from '../lib/errors'

type Props = {
  tabs: CustomTab[]
  folders: TabFolder[]
  sessions: TabSession[]
  /** Onglets, et dossiers / comptes quand ils changent aussi. */
  onChange: (tabs: CustomTab[], folders?: TabFolder[], sessions?: TabSession[]) => void
  /** Délai de mise en veille (Réglages → `ui.tabSleepMinutes`). */
  sleepMinutes: number
  onSleepMinutes: (n: number) => void
  /** Liens de homedash dans l'appli (Réglages → `ui.openLinks`). */
  openLinks: 'app' | 'browser'
  onOpenLinks: (v: 'app' | 'browser') => void
  /** Quelle partie de Réglages → Mes sites : les sites (dossiers, comptes), ou les liens et la veille. */
  part?: 'sites' | 'links'
}

/** Délais proposés en un clic à côté du champ de mise en veille. */
const SLEEP_PRESETS = [5, 15, 30, 60]

/** Nom proposé d'après l'adresse : `mail.google.com` → `mail.google.com`, `~/doc/a.pdf` → `a`. */
const nameFrom = (url: string) =>
  hostOf(url).replace(/^www\./, '') || (url.split('/').pop() ?? '').replace(/\.[^.]+$/, '')

/**
 * Réglages → Mes sites. Une liste compacte (un onglet par ligne, ses
 * étiquettes dossier / compte), un éditeur à la fois sous la ligne choisie, et
 * les dossiers et comptes en étiquettes. L'ordre se règle en glissant les
 * icônes dans la barre de gauche. Écrit dans config.json avec « Enregistrer ».
 * `part="links"` : Réglages → Mes sites, partie « Liens, onglets et veille ».
 */
export default function SetTabs({
  tabs,
  folders,
  sessions,
  onChange,
  sleepMinutes,
  onSleepMinutes,
  openLinks,
  onOpenLinks,
  part = 'sites',
}: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const editing = useRef<{ id: string | null; label: string }>({ id: null, label: '' })
  // Explorateur de fichiers de l'éditeur ouvert.
  const [view, setView] = useState<Browse | null>(null)
  const [browsing, setBrowsing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const patch = (id: string, p: Partial<CustomTab>) => onChange(tabs.map((t) => (t.id === id ? { ...t, ...p } : t)))

  const add = () => {
    const id = newTabId(tabs.map((t) => t.id))
    // Dans homedash par défaut : c'est ce qu'on veut presque toujours.
    onChange([...tabs, { id, icon: '', label: '', url: '', embed: true }])
    setOpen(id)
    setBrowsing(false)
  }

  // Arrivé par le ＋ de la barre de gauche : un nouvel onglet, prêt à remplir.
  const addRef = useRef(add)
  addRef.current = add
  useEffect(() => {
    const take = () => {
      try {
        if (!sessionStorage.getItem(NEW_TAB_KEY)) return
        sessionStorage.removeItem(NEW_TAB_KEY)
      } catch {
        return
      }
      addRef.current()
    }
    take()
    window.addEventListener(NEW_TAB_EVENT, take)
    return () => window.removeEventListener(NEW_TAB_EVENT, take)
  }, [])

  // « Modifier… » d'un onglet (clic droit, ✎ de l'en-tête) : son éditeur ouvert, à l'écran.
  useEffect(() => {
    const edit = (id: string) => {
      setOpen(id)
      setBrowsing(false)
      window.setTimeout(() => document.getElementById(`xs-${id}`)?.scrollIntoView({ block: 'center' }), 50)
    }
    try {
      const id = sessionStorage.getItem(EDIT_TAB_KEY)
      sessionStorage.removeItem(EDIT_TAB_KEY)
      if (id) edit(id)
    } catch {
      /* stockage indisponible */
    }
    const on = (e: Event) => {
      try {
        sessionStorage.removeItem(EDIT_TAB_KEY)
      } catch {
        /* stockage indisponible */
      }
      edit((e as CustomEvent<string>).detail)
    }
    window.addEventListener(EDIT_TAB_EVENT, on)
    return () => window.removeEventListener(EDIT_TAB_EVENT, on)
  }, [])

  /** Un site du catalogue : ajouté, affiché dans homedash, son éditeur ouvert. */
  const addSite = (site: CatalogSite) => {
    const id = newTabId(tabs.map((t) => t.id))
    onChange([...tabs, { id, label: site.label, url: site.url, embed: true }])
    setOpen(id)
    setBrowsing(false)
  }
  const [catalog, setCatalog] = useState(false)

  const remove = (t: CustomTab) => {
    onChange(tabs.filter((x) => x.id !== t.id))
    setOpen(null)
  }

  /** Toutes les données d'un compte (ou de la connexion commune) : déconnecte de tous ses sites. */
  const clearAccount = (id: string | undefined, name: string) =>
    void confirmDialog({
      title: `Effacer toutes les données ${id ? `de « ${name} »` : 'du compte principal'} ?`,
      body: [
        `Cookies, sessions et cache de tous les sites ${id ? `de ce compte` : 'du compte principal'} sont effacés : tu en seras déconnecté partout.`,
        "Tes onglets, leurs réglages et les autres comptes ne bougent pas. Pour un seul site : clic droit sur son icône → Effacer les données de ce site.",
      ],
      confirmLabel: 'Tout effacer',
      danger: true,
    }).then((ok) => {
      if (!ok) return
      void desktop?.clearData?.(partitionOf(id)).then(() =>
        tabs.filter((t) => t.embed && (t.session ?? '') === (id ?? '')).forEach((t) =>
          window.dispatchEvent(new CustomEvent(RELOAD_TAB, { detail: tabKey(t) })),
        ),
      )
    })

  const addFolder = async (tid?: string) => {
    const r = await askNameColor({ title: 'Nouveau dossier', name: `Dossier ${folders.length + 1}` })
    if (!r) return
    const id = newFolderId(folders.map((f) => f.id))
    onChange(
      tid ? tabs.map((t) => (t.id === tid ? { ...t, folder: id } : t)) : tabs,
      [...folders, { id, name: r.name, color: r.color }],
    )
  }
  const editFolder = async (f: TabFolder) => {
    const r = await askNameColor({ title: 'Dossier', name: f.name, color: f.color, okLabel: 'Enregistrer' })
    if (r) onChange(tabs, folders.map((x) => (x.id === f.id ? { ...x, name: r.name, color: r.color } : x)))
  }
  const removeFolder = (f: TabFolder) =>
    onChange(
      tabs.map((t) => (t.folder === f.id ? { ...t, folder: undefined } : t)),
      folders.filter((x) => x.id !== f.id),
    )

  const addSession = async (tid?: string) => {
    const r = await askNameColor({
      title: 'Nouveau compte',
      hint: 'Ses onglets partagent leur propre connexion, à part des autres : un compte « pro » et un « perso » pour le même site.',
    })
    if (!r) return
    const id = newSessionId(sessions.map((x) => x.id))
    onChange(
      tid ? tabs.map((t) => (t.id === tid ? { ...t, session: id } : t)) : tabs,
      folders,
      [...sessions, { id, name: r.name, color: r.color }],
    )
  }
  const editSession = async (x: TabSession) => {
    const r = await askNameColor({ title: 'Compte', name: x.name, color: x.color, okLabel: 'Enregistrer' })
    if (r) onChange(tabs, folders, sessions.map((y) => (y.id === x.id ? { ...y, name: r.name, color: r.color } : y)))
  }
  const removeSession = (x: TabSession) =>
    void confirmDialog({
      title: `Supprimer le compte « ${x.name} » ?`,
      body: [
        'Ses onglets repassent sur le compte principal, comme les autres onglets.',
        "Sa connexion reste enregistrée dans l'appli mais ne sert plus : un nouveau compte repart de zéro.",
      ],
      confirmLabel: 'Supprimer',
      danger: true,
    }).then(
      (ok) =>
        ok &&
        onChange(
          tabs.map((t) => (t.session === x.id ? { ...t, session: undefined } : t)),
          folders,
          sessions.filter((s) => s.id !== x.id),
        ),
    )

  // ── explorateur de fichiers ──────────────────────────────────────────────
  const go = (path: string) => {
    setError(null)
    browse(path, true)
      .then((b) => (b.error ? setError(b.error) : setView(b)))
      .catch((e: unknown) => setError(shown('mes sites', e)))
  }
  const startBrowse = (t: CustomTab) => {
    setBrowsing(true)
    go(isLocal(t.url) && t.url.includes('/') ? t.url.slice(0, t.url.lastIndexOf('/')) || '~' : '~')
  }
  const choose = (t: CustomTab, path: string) => {
    patch(t.id, { url: path, embed: true, ...(t.label ? {} : { label: nameFrom(path) }) })
    setBrowsing(false)
  }

  const isWeb = (t: CustomTab) => !!t.url && !isLocal(t.url)
  /** Pastille d'un réglage sur la ligne : allumée ou non, un clic bascule. */
  const opt = (on: boolean, label: string, title: string, toggle: () => void) => (
    <button type="button" className={`xs-opt${on ? ' is-on' : ''}`} aria-pressed={on} title={title} onClick={toggle}>
      {label}
    </button>
  )

  const iconOf = (t: CustomTab) =>
    isImageIcon(t.icon) ? (
      <SiteIcon url={t.url} name={t.label} image={t.icon} />
    ) : t.icon ? (
      <span className="xs-emoji">{t.icon}</span>
    ) : isLocal(t.url) ? (
      <span className="xs-emoji">📄</span>
    ) : t.url ? (
      <SiteIcon url={t.url} name={t.label} />
    ) : (
      <span className="xs-emoji">🌐</span>
    )

  const editor = (t: CustomTab) => {
    const web = !!t.url && !isLocal(t.url)
    const blocked = !desktop && t.embed && web && refusesEmbed(t.url)
    return (
      <div className="xs-editor">
        <label className="xs-field xs-wide">
          <span>Adresse</span>
          <span className="xs-inline">
            <input
              autoFocus={!t.url}
              value={t.url}
              placeholder="https://… ou ~/Documents/fichier.pdf"
              onChange={(e) => patch(t.id, { url: e.target.value })}
              onBlur={() => !t.label.trim() && t.url.trim() && patch(t.id, { label: nameFrom(t.url.trim()) })}
              autoComplete="off"
              data-1p-ignore
            />
            <button type="button" className="xs-btn" onClick={() => (browsing ? setBrowsing(false) : startBrowse(t))}>
              📁 {browsing ? 'Fermer' : 'Parcourir'}
            </button>
          </span>
        </label>

        {browsing ? (
          <div className="set-browser xs-wide">
            <div className="set-browser-head">
              <code>{view?.path ?? '~'}</code>
              <span className="set-spacer" />
              {view && view.path !== '~' ? <button onClick={() => choose(t, view.path)}>✓ ce dossier</button> : null}
            </div>
            {error ? <p className="set-hint set-bad">✗ {error}</p> : null}
            <ul className="set-dirs">
              {view?.parent ? (
                <li>
                  <button onClick={() => go(view.parent!)}>↰ ..</button>
                </li>
              ) : null}
              {view?.dirs.map((d) => (
                <li key={d.path}>
                  <button onClick={() => go(d.path)}>📁 {d.name}</button>
                </li>
              ))}
              {view?.files?.map((f) => (
                <li key={f.path}>
                  <button onClick={() => choose(t, f.path)} title="Choisir ce fichier">
                    📄 {f.name}
                  </button>
                </li>
              ))}
              {view && !view.dirs.length && !view.files?.length ? <li className="set-hint">dossier vide</li> : null}
            </ul>
          </div>
        ) : null}

        <label className="xs-field">
          <span>Nom</span>
          <input
            value={t.label}
            placeholder={nameFrom(t.url) || 'Nom de l’onglet'}
            onChange={(e) => patch(t.id, { label: e.target.value })}
            autoComplete="off"
            data-1p-ignore
          />
        </label>
        <label className="xs-field xs-narrow">
          <span>Icône</span>
          <span className="xs-inline">
          <span className="xs-icon">{iconOf(t)}</span>
          <input
            value={t.icon ?? ''}
            placeholder="emoji, lien .png ou vide"
            title="Un emoji, le lien d'une image (https://…/logo.png), ou vide pour l'icône du site"
            onChange={(e) => patch(t.id, { icon: e.target.value })}
            autoComplete="off"
            data-1p-ignore
          />
          </span>
        </label>

        <div className="xs-field xs-wide">
          <span>Au clic</span>
          <span className="xs-seg" role="radiogroup">
            <button
              type="button"
              role="radio"
              aria-checked={!!t.embed}
              className={t.embed ? 'is-on' : ''}
              onClick={() => patch(t.id, { embed: true })}
            >
              Afficher dans homedash
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!t.embed}
              className={t.embed ? '' : 'is-on'}
              onClick={() => patch(t.id, { embed: false })}
            >
              Ouvrir dans le navigateur ↗
            </button>
          </span>
          {blocked ? (
            <em className="xs-warn">
              Dans un navigateur, ce site refuse de s'afficher dans une page (page blanche) ; il s'affiche dans l'appli
              de bureau.
            </em>
          ) : null}
        </div>

        {t.embed ? (
          <div className="xs-field xs-wide">
            <span>Mise en veille</span>
            <span className="xs-seg" role="radiogroup">
              <button
                type="button"
                role="radio"
                aria-checked={!t.sleep}
                className={t.sleep ? '' : 'is-on'}
                onClick={() => patch(t.id, { sleep: undefined })}
              >
                Jamais
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={!!t.sleep}
                className={t.sleep ? 'is-on' : ''}
                onClick={() => patch(t.id, { sleep: true })}
              >
                Après {sleepMinutes} min sans y aller
              </button>
            </span>
            <em className="xs-note">
              En veille, l'onglet est déchargé (mémoire libérée) et rechargé quand tu cliques dessus ; il ne reçoit
              plus de notifications ni de non-lus entre-temps.
            </em>
          </div>
        ) : null}

        {web && t.embed && desktop ? (
          <div className="xs-field xs-wide">
            <span>Au démarrage de l'appli</span>
            <span className="xs-seg" role="radiogroup">
              <button
                type="button"
                role="radio"
                aria-checked={preloads(t)}
                className={preloads(t) ? 'is-on' : ''}
                onClick={() => patch(t.id, { preload: true })}
              >
                Charger tout de suite
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={!preloads(t)}
                className={preloads(t) ? '' : 'is-on'}
                onClick={() => patch(t.id, { preload: false })}
              >
                Au premier clic
              </button>
            </span>
            <em className="xs-note">
              Chargé tout de suite, ses non-lus arrivent sans l'ouvrir ; au premier clic, il ne prend pas de
              mémoire avant. Par défaut : tout de suite pour les mails, messageries et réseaux sociaux.
            </em>
          </div>
        ) : null}

        {web && t.embed ? (
          <div className="xs-field xs-wide">
            <span>Notifications</span>
            <span className="xs-seg" role="radiogroup">
              <button
                type="button"
                role="radio"
                aria-checked={t.notify !== false}
                className={t.notify !== false ? 'is-on' : ''}
                onClick={() => patch(t.id, { notify: undefined })}
              >
                🔔 Actives
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={t.notify === false}
                className={t.notify === false ? 'is-on' : ''}
                onClick={() => patch(t.id, { notify: false })}
              >
                🔕 Coupées
              </button>
            </span>
            <em className="xs-note">
              Coupées : pas de pastille de non-lus (ni dans le total du Dock), et le site ne peut plus afficher
              de notification depuis sa page. Aussi au clic droit sur l'icône.
            </em>
          </div>
        ) : null}

        {web && t.embed ? (
          <div className="xs-field xs-wide">
            <span>Liens vers ce site, cliqués dans un autre onglet</span>
            <span className="xs-inline xs-capture">
              <span className="xs-seg" role="radiogroup">
                <button
                  type="button"
                  role="radio"
                  aria-checked={t.capture !== false}
                  className={t.capture !== false ? 'is-on' : ''}
                  onClick={() => patch(t.id, { capture: undefined })}
                >
                  S'ouvrent ici
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={t.capture === false}
                  className={t.capture === false ? 'is-on' : ''}
                  onClick={() => patch(t.id, { capture: false })}
                >
                  Dans le navigateur
                </button>
              </span>
              {t.capture !== false ? (
                <input
                  // lu à la sortie du champ : en direct, la virgule tapée disparaîtrait
                  key={(t.domains ?? []).join(',')}
                  defaultValue={(t.domains ?? []).join(', ')}
                  placeholder="autres domaines : twitter.com, …"
                  title="Liens vers ces domaines aussi ouverts dans cet onglet, séparés par des virgules"
                  onBlur={(e) => {
                    const domains = e.target.value
                      .split(/[,\s]+/)
                      .map((d) => d.trim())
                      .filter(Boolean)
                    patch(t.id, { domains: domains.length ? domains : undefined })
                  }}
                  autoComplete="off"
                  data-1p-ignore
                />
              ) : null}
            </span>
            {t.capture !== false ? (
              <em className="xs-note">
                Liens qui ouvrent ce site : {domainsOf(t).join(', ')}.{' '}
                {desktop ? '' : "(Dans l'appli de bureau seulement.)"}
              </em>
            ) : null}
          </div>
        ) : null}

        <div className="xs-wide xs-pair">
        <div className="xs-field">
          <span>Dossier</span>
          <Pick
            value={folderOf(t, folders) ?? ''}
            onChange={(v) => patch(t.id, { folder: v || undefined })}
            options={[
              { value: '', label: 'Aucun' },
              ...folders.map((f) => ({ value: f.id, label: `${f.icon ? f.icon + ' ' : ''}${f.name}`, color: f.color })),
            ]}
            action={{ label: '＋ Nouveau dossier…', onSelect: () => void addFolder(t.id) }}
          />
        </div>
        {web && t.embed ? (
          <div className="xs-field">
            <span>Compte de connexion</span>
            <Pick
              value={sessionOf(t, sessions)?.id ?? ''}
              onChange={(v) => patch(t.id, { session: v || undefined })}
              options={[
                { value: '', label: 'Compte principal' },
                ...sessions.map((x) => ({ value: x.id, label: x.name, color: x.color })),
              ]}
              action={{ label: '＋ Nouveau compte…', onSelect: () => void addSession(t.id) }}
            />
          </div>
        ) : null}
        </div>

        <div className="xs-actions xs-wide">
          <button type="button" className="set-danger-link" onClick={() => remove(t)}>
            Supprimer l'onglet
          </button>
          <span className="set-spacer" />
          <button type="button" className="xs-btn" onClick={() => setOpen(null)}>
            Fermer
          </button>
        </div>
      </div>
    )
  }

  // Ordre alphabétique (celui de la barre se règle en glissant les icônes).
  // L'onglet ouvert garde la place de son nom d'avant l'édition : sa ligne ne
  // saute pas pendant qu'on tape ; un nouvel onglet (sans nom) reste en tête.
  if (editing.current.id !== open)
    editing.current = { id: open, label: tabs.find((t) => t.id === open)?.label ?? '' }
  const nameOf = (t: CustomTab) => (t.id === editing.current.id ? editing.current.label : t.label)
  // Les éphémères gardés vivent dans la config mais sont listés à part.
  const mine = tabs
    .filter((t) => !t.kept)
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'fr', { sensitivity: 'base', numeric: true }))
  const kept = tabs.filter((t) => t.kept)

  if (part === 'links')
    return (
      <div className="xs">
        <p className="set-hint">Ce que fait un clic sur un lien, et combien de temps les sites restent chargés.</p>
        {desktop ? (
          <div className="xs-sleep">
            <span>🔗 Liens qui ouvrent un nouvel onglet</span>
            <span className="xs-seg" role="radiogroup">
              <button
                type="button"
                role="radio"
                aria-checked={openLinks === 'app'}
                className={openLinks === 'app' ? 'is-on' : ''}
                onClick={() => onOpenLinks('app')}
              >
                Dans homedash
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={openLinks === 'browser'}
                className={openLinks === 'browser' ? 'is-on' : ''}
                onClick={() => onOpenLinks('browser')}
              >
                Dans le navigateur
              </button>
            </span>
            <em className="xs-note">
              Ceux de homedash (raccourcis, GitHub, recherche…) et ceux d'un site qui demandent un nouvel onglet.
              Dans homedash : un lien vers un de tes sites l'ouvre dans ce site (une page déjà ouverte est
              simplement réaffichée) ; vers un autre site, un onglet temporaire en haut, là où tu es.{' '}
              {keys('clic')} (ou ⇧clic) : l'inverse, au cas par cas ; le clic droit sur un lien propose tous les choix.
              {hasLinkFlip ? null : ` Dans un site, ${keys('clic')} demande l’appli de bureau à jour (menu Aide → Mettre à jour maintenant).`}
            </em>
          </div>
        ) : null}

        {desktop ? (
          <p className="xs-note">
            ◫ Un onglet ouvert par un lien est <strong>temporaire</strong> : fermé au redémarrage, ou après 3 h
            sans y aller. Pour le garder : clic droit dessus → <em>Garder dans Mes sites</em>.
          </p>
        ) : null}

        <label className="xs-sleep">
          <span>💤 Mise en veille des onglets qui l'autorisent, après</span>
          <input
            type="number"
            min={1}
            max={1440}
            value={sleepMinutes}
            onChange={(e) => onSleepMinutes(Math.min(1440, Math.max(1, Number.parseInt(e.target.value, 10) || 5)))}
          />
          <span>min sans y aller.</span>
          <span className="xs-seg">
            {SLEEP_PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                className={sleepMinutes === n ? 'is-on' : ''}
                onClick={() => onSleepMinutes(n)}
              >
                {n < 60 ? `${n} min` : `${n / 60} h`}
              </button>
            ))}
          </span>
          <em className="xs-note">
            {mine.filter((t) => t.embed && t.sleep).length} onglet(s) concerné(s) — à régler site par site dans Mes sites (💤).
          </em>
        </label>
      </div>
    )

  return (
    <div className="xs">
      <div className="xs-head">
        <p className="set-hint">
          Des sites ou des fichiers de ton disque, à côté des onglets de homedash. Sur chaque ligne, seuls les
          réglages inhabituels apparaissent ; ▾ pour tout régler.
        </p>
        <button type="button" className={`xs-btn${catalog ? ' is-on' : ''}`} onClick={() => setCatalog(!catalog)}>
          ☰ Catalogue
        </button>
        <button type="button" className="xs-primary" onClick={add}>
          ＋ Ajouter un site
        </button>
      </div>

      {catalog ? (
        <div className="xs-catalog">
          {CATALOG.map((g) => (
            <div key={g.title} className="xs-catalog-group">
              <h4>{g.title}</h4>
              <div className="xs-chips">
                {g.sites.map((site) => {
                  const has = tabs.some((t) => hostOf(t.url) === hostOf(site.url))
                  return (
                    <button
                      key={site.url}
                      type="button"
                      className={`xs-site${has ? ' is-on' : ''}`}
                      onClick={() => addSite(site)}
                      title={has ? `${site.label} est déjà là : un clic en ajoute un autre (un autre compte, par exemple)` : site.url}
                    >
                      <SiteIcon url={site.url} name={site.label} />
                      {site.label}
                      {has ? <em>✓</em> : null}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {mine.length ? (
        <ul className="xs-list">
          {mine.map((t) => {
            const f = folders.find((x) => x.id === folderOf(t, folders))
            const s = sessionOf(t, sessions)
            const isOpen = open === t.id
            return (
              <li key={t.id} id={`xs-${t.id}`} className={`xs-item${isOpen ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="xs-row"
                  onClick={() => {
                    setOpen(isOpen ? null : t.id)
                    setBrowsing(false)
                  }}
                  aria-expanded={isOpen}
                >
                  <span className="xs-icon">{iconOf(t)}</span>
                  <span className="xs-name">{t.label || nameFrom(t.url) || 'Nouvel onglet'}</span>
                  <span className="xs-url">{t.url || 'adresse à renseigner'}</span>
                  {f ? (
                    <span className="xs-tag" style={{ ['--c' as string]: f.color ?? '#60a5fa' }}>
                      {f.icon ?? '📁'} {f.name}
                    </span>
                  ) : null}
                  {s ? (
                    <span className="xs-tag" style={{ ['--c' as string]: s.color }}>
                      ● {s.name}
                    </span>
                  ) : null}
                </button>
                {/* Hors du bouton de la ligne (pas de bouton dans un bouton). Seuls les
                    réglages qui sortent de l'ordinaire s'affichent (issue #59) : cinq
                    interrupteurs à leur valeur par défaut sur chaque ligne noyaient
                    l'exception. Tous sont dans l'éditeur (▾). */}
                <span className="xs-opts">
                  {t.embed ? null : opt(
                    !!t.embed,
                    t.embed ? '▣ homedash' : '↗ navigateur',
                    t.embed ? 'Affiché dans homedash : clic pour l’ouvrir dans le navigateur' : 'Ouvert dans le navigateur : clic pour l’afficher dans homedash',
                    () => patch(t.id, { embed: !t.embed }),
                  )}
                  {t.embed && t.sleep
                    ? opt(
                        !!t.sleep,
                        `💤 ${t.sleep ? `${sleepMinutes} min` : 'jamais'}`,
                        t.sleep ? 'En veille après ' + sleepMinutes + ' min sans y aller : clic pour ne plus la mettre' : 'Jamais en veille : clic pour la mettre après ' + sleepMinutes + ' min sans y aller',
                        () => patch(t.id, { sleep: t.sleep ? undefined : true }),
                      )
                    : null}
                  {isWeb(t) && t.embed && t.notify === false
                    ? opt(
                        t.notify !== false,
                        t.notify !== false ? '🔔 notifs' : '🔕 coupées',
                        t.notify !== false
                          ? 'Pastille de non-lus et notifications du site : clic pour les couper'
                          : 'Ni pastille ni notifications : clic pour les rétablir',
                        () => patch(t.id, { notify: t.notify === false ? undefined : false }),
                      )
                    : null}
                  {isWeb(t) && t.embed && desktop && t.preload !== undefined && t.preload !== preloads({ ...t, preload: undefined })
                    ? opt(
                        preloads(t),
                        preloads(t) ? '⚡ au démarrage' : '⚡ au 1er clic',
                        preloads(t) ? 'Chargé au démarrage de l’appli : clic pour attendre le premier clic' : 'Chargé au premier clic : clic pour le charger au démarrage',
                        () => patch(t.id, { preload: !preloads(t) }),
                      )
                    : null}
                  {isWeb(t) && t.embed && t.capture === false
                    ? opt(
                        t.capture !== false,
                        t.capture !== false ? '🔗 ses liens ici' : '🔗 ses liens au navigateur',
                        t.capture !== false
                          ? `Les liens vers ${domainsOf(t).join(', ')} s’ouvrent ici : clic pour les envoyer au navigateur`
                          : 'Les liens vers ce site s’ouvrent dans le navigateur : clic pour les ouvrir ici',
                        () => patch(t.id, { capture: t.capture !== false ? false : undefined }),
                      )
                    : null}
                </span>
                <button
                  type="button"
                  className="xs-chevron"
                  onClick={() => {
                    setOpen(isOpen ? null : t.id)
                    setBrowsing(false)
                  }}
                  aria-label={isOpen ? 'Fermer' : 'Modifier'}
                  tabIndex={-1}
                >
                  {isOpen ? '▴' : '▾'}
                </button>
                {isOpen ? editor(t) : null}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="xs-empty">Aucun site pour l'instant : « ＋ Ajouter un site », puis colle une adresse.</p>
      )}

      {kept.length ? (
        <section className="xs-group">
          <header>
            <h3 className="set-sub">Onglets gardés</h3>
          </header>
          <p className="set-hint">
            Ouverts depuis un lien, puis clic droit → « Garder ouvert » : ils sont rouverts au redémarrage, rangés avec les
            onglets temporaires, sans capter les liens des autres onglets.
          </p>
          <ul className="xs-kept">
            {kept.map((t) => (
              <li key={t.id}>
                <span className="xs-icon">{iconOf(t)}</span>
                <span className="xs-name">{t.label}</span>
                <span className="xs-url">{t.url}</span>
                <button type="button" className="xs-btn" onClick={() => patch(t.id, { kept: undefined })}>
                  ＋ Ajouter à mes sites
                </button>
                <button type="button" className="set-del" onClick={() => remove(t)} title="Fermer et oublier">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="xs-groups">
        <section className="xs-group">
          <header>
            <h3 className="set-sub">Dossiers</h3>
            <button type="button" className="xs-btn" onClick={() => void addFolder()}>
              ＋ Nouveau
            </button>
          </header>
          <p className="set-hint">Rangent les icônes de la barre. Astuce : glisse une icône sur une autre.</p>
          <div className="xs-chips">
            {folders.map((f) => (
              <span key={f.id} className="xs-chip" style={{ ['--c' as string]: f.color ?? '#60a5fa' }}>
                <button type="button" onClick={() => void editFolder(f)} title="Nom et couleur">
                  {f.icon ?? '📁'} {f.name}
                  <em>{tabs.filter((t) => folderOf(t, folders) === f.id).length}</em>
                </button>
                <button type="button" className="xs-chip-x" onClick={() => removeFolder(f)} title="Supprimer (ses onglets restent)">
                  ✕
                </button>
              </span>
            ))}
            {!folders.length ? <span className="set-hint">Aucun dossier.</span> : null}
          </div>
        </section>

        <section className="xs-group">
          <header>
            <h3 className="set-sub">Comptes de connexion</h3>
            <button type="button" className="xs-btn" onClick={() => void addSession()}>
              ＋ Nouveau
            </button>
          </header>
          <p className="set-hint">
            Pour être connecté à deux comptes d'un même site (pro et perso) : chaque compte a sa propre connexion.{' '}
            {desktop
              ? hasSessions
                ? null
                : 'Ton appli de bureau est trop ancienne pour ça : installe la dernière.'
              : "Effet dans l'appli de bureau seulement."}
          </p>
          <div className="xs-chips">
            {sessions.map((x) => (
              <span key={x.id} className="xs-chip" style={{ ['--c' as string]: x.color }}>
                <button type="button" onClick={() => void editSession(x)} title="Nom et couleur">
                  ● {x.name}
                  <em>{tabs.filter((t) => t.session === x.id).length}</em>
                </button>
                <button type="button" className="xs-chip-x" onClick={() => removeSession(x)} title="Supprimer le compte">
                  ✕
                </button>
              </span>
            ))}
            {!sessions.length ? <span className="set-hint">Aucun : tous les onglets partagent la même connexion.</span> : null}
          </div>
          {desktop?.clearData ? (
            <p className="set-hint xs-clear">
              🧹 Effacer toutes les données (cookies, sessions, cache) d'un compte :{' '}
              {[{ id: undefined as string | undefined, name: 'compte principal', color: undefined as string | undefined }, ...sessions].map((x) => (
                <button
                  key={x.id ?? 'commun'}
                  type="button"
                  className="xs-btn"
                  style={x.color ? { ['--c' as string]: x.color } : undefined}
                  onClick={() => clearAccount(x.id, x.name)}
                >
                  {x.name}
                </button>
              ))}
            </p>
          ) : null}
        </section>
      </div>

      <details className="set-howto">
        <summary>Comment ça marche ?</summary>
        <ul>
          <li>
            <strong>Afficher dans homedash</strong> : le site ou le fichier s'ouvre sous la barre d'onglets, et reste
            chargé quand tu changes d'onglet. Dans l'appli de bureau, tous les sites s'affichent, avec leurs non-lus en
            pastille. Dans un navigateur, Gmail, Google Chat, GitHub et beaucoup d'autres refusent (page blanche).
          </li>
          <li>
            <strong>Ouvrir dans le navigateur</strong> : l'icône est un simple raccourci.
          </li>
          <li>
            <strong>Fichiers</strong> : PDF, images, texte, HTML ou dossier, lus sans jamais être modifiés, limités à ton
            dossier personnel (ni fichiers cachés, ni données homedash).
          </li>
          <li>
            <strong>Barre de gauche</strong> : glisse une icône pour la déplacer, sur une autre pour créer un dossier ;
            clic droit pour le reste (dossier, compte, recharger).
          </li>
        </ul>
      </details>
    </div>
  )
}
