import { useEffect, useRef, useState } from 'react'
import { browse, type Browse } from '../lib/admin'
import {
  domainsOf,
  folderOf,
  hostOf,
  isLocal,
  newFolderId,
  newSessionId,
  newTabId,
  refusesEmbed,
  sessionOf,
} from '../lib/customTabs'
import { desktop, hasSessions } from '../lib/desktop'
import { NEW_TAB_EVENT, NEW_TAB_KEY } from '../lib/settingsNav'
import type { CustomTab, TabFolder, TabSession } from '../types'
import { confirmDialog } from './ConfirmHost'
import SiteIcon from './SiteIcon'
import { askNameColor } from './NameColorHost'
import Pick from './Pick'

type Props = {
  tabs: CustomTab[]
  folders: TabFolder[]
  sessions: TabSession[]
  /** Onglets, et dossiers / comptes quand ils changent aussi. */
  onChange: (tabs: CustomTab[], folders?: TabFolder[], sessions?: TabSession[]) => void
}

/** Nom proposé d'après l'adresse : `mail.google.com` → `mail.google.com`, `~/doc/a.pdf` → `a`. */
const nameFrom = (url: string) =>
  hostOf(url).replace(/^www\./, '') || (url.split('/').pop() ?? '').replace(/\.[^.]+$/, '')

/**
 * Réglages → Onglets perso. Une liste compacte (un onglet par ligne, ses
 * étiquettes dossier / compte), un éditeur à la fois sous la ligne choisie, et
 * les dossiers et comptes en étiquettes. L'ordre se règle en glissant les
 * icônes dans la barre de gauche. Écrit dans config.json avec « Enregistrer ».
 */
export default function SetTabs({ tabs, folders, sessions, onChange }: Props) {
  const [open, setOpen] = useState<string | null>(null)
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

  const remove = (t: CustomTab) => {
    onChange(tabs.filter((x) => x.id !== t.id))
    setOpen(null)
  }

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
        'Ses onglets repassent sur la connexion commune, comme les autres onglets.',
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
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }
  const startBrowse = (t: CustomTab) => {
    setBrowsing(true)
    go(isLocal(t.url) && t.url.includes('/') ? t.url.slice(0, t.url.lastIndexOf('/')) || '~' : '~')
  }
  const choose = (t: CustomTab, path: string) => {
    patch(t.id, { url: path, embed: true, ...(t.label ? {} : { label: nameFrom(path) }) })
    setBrowsing(false)
  }

  const iconOf = (t: CustomTab) =>
    t.icon ? (
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
          <input
            value={t.icon ?? ''}
            placeholder="auto"
            maxLength={4}
            title="Un emoji, ou vide pour l'icône du site"
            onChange={(e) => patch(t.id, { icon: e.target.value })}
            autoComplete="off"
            data-1p-ignore
          />
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
                Captés : {domainsOf(t).join(', ')}.{' '}
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
                { value: '', label: 'Connexion commune' },
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

  return (
    <div className="xs">
      <div className="xs-head">
        <p className="set-hint">Des sites ou des fichiers de ton disque, en icônes dans la barre de gauche.</p>
        <button type="button" className="xs-primary" onClick={add}>
          ＋ Ajouter un onglet
        </button>
      </div>

      {tabs.length ? (
        <ul className="xs-list">
          {tabs.map((t) => {
            const f = folders.find((x) => x.id === folderOf(t, folders))
            const s = sessionOf(t, sessions)
            const isOpen = open === t.id
            return (
              <li key={t.id} className={`xs-item${isOpen ? ' is-open' : ''}`}>
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
                  {!t.embed ? <span className="xs-tag xs-tag-plain">↗ navigateur</span> : null}
                  <span className="xs-chevron" aria-hidden="true">
                    {isOpen ? '▴' : '▾'}
                  </span>
                </button>
                {isOpen ? editor(t) : null}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="xs-empty">Aucun onglet pour l'instant : « ＋ Ajouter un onglet », puis colle une adresse.</p>
      )}

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
            Comme les conteneurs de Firefox : une connexion à part par compte (« pro », « perso »…).{' '}
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
