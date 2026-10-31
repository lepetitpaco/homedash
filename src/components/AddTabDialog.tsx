import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CATALOG, catalogTab, type CatalogSite } from '../lib/catalog'
import { hostOf } from '../lib/customTabs'
import { withScheme } from '../lib/url'
import type { CustomTab, TabFolder, TabSession } from '../types'
import Pick from './Pick'


/** Nom proposé d'après l'adresse (même règle que Réglages → Onglets perso). */
const nameFrom = (url: string) =>
  hostOf(url).replace(/^www\./, '') || (url.split('/').pop() ?? '').replace(/\.[^.]+$/, '')

/**
 * ＋ de la barre de gauche : ajouter un onglet sans passer par Réglages.
 * L'essentiel (adresse, nom, où l'ouvrir, dossier, compte) et les sites
 * courants ; le reste (icône, veille, liens capturés…) dans Réglages, que
 * « Plus de réglages » ouvre sur ce même onglet à remplir.
 */
export default function AddTabDialog({
  folders,
  sessions,
  onAdd,
  onMore,
  onClose,
}: {
  folders: TabFolder[]
  /** Comptes de connexion (appli de bureau seulement, sinon vide). */
  sessions: TabSession[]
  onAdd: (tab: Omit<CustomTab, 'id'>) => void
  /** Avec ce qui est déjà saisi (une adresse valable), sinon rien : l'onglet est créé puis ouvert dans Réglages. */
  onMore: (draft?: Omit<CustomTab, 'id'>) => void
  onClose: () => void
}) {
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [domains, setDomains] = useState<string[] | undefined>(undefined)
  const [embed, setEmbed] = useState(true)
  const [folder, setFolder] = useState('')
  const [session, setSession] = useState('')
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => first.current?.focus(), [])

  const full = withScheme(url)
  const name = label.trim() || nameFrom(full)
  const ok = !!full && !!name

  const [picked, setPicked] = useState<CatalogSite | null>(null)
  const pickSite = (s: CatalogSite) => {
    setUrl(s.url)
    setLabel(s.label)
    setDomains(s.domains)
    setPicked(s)
  }
  const draft = (): Omit<CustomTab, 'id'> => ({
    // Réglage recommandé du site choisi, tant que son adresse n'a pas été changée.
    ...(picked?.url === full ? catalogTab(picked) : {}),
    label: name,
    url: full,
    embed,
    ...(domains ? { domains } : {}),
    ...(folder ? { folder } : {}),
    ...(session ? { session } : {}),
  })
  const submit = () => {
    if (!ok) return
    onAdd({
      label: name,
      url: full,
      embed,
      ...(domains ? { domains } : {}),
      ...(folder ? { folder } : {}),
      ...(session ? { session } : {}),
    })
  }

  return createPortal(
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal add-tab"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-tab-title"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <div className="modal-head" id="add-tab-title">
          Ajouter un site
        </div>
        <div className="modal-body add-tab-body">
          <label className="add-tab-field">
            <span>Adresse</span>
            <input
              ref={first}
              value={url}
              placeholder="mail.google.com, https://…, ~/Documents/fichier.pdf"
              onChange={(e) => {
                setUrl(e.target.value)
                setDomains(undefined)
              }}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              autoComplete="off"
              spellCheck={false}
              data-1p-ignore
              data-bwignore
              data-lpignore="true"
            />
          </label>
          <label className="add-tab-field">
            <span>Nom</span>
            <input
              value={label}
              placeholder={nameFrom(full) || 'Nom dans la barre'}
              maxLength={40}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              autoComplete="off"
              data-1p-ignore
              data-bwignore
              data-lpignore="true"
            />
          </label>

          <div className="add-tab-row">
            <span>S'ouvre</span>
            <span className="add-tab-chips">
              <button type="button" className={`xs-btn${embed ? ' is-on' : ''}`} onClick={() => setEmbed(true)}>
                ▣ dans homedash
              </button>
              <button type="button" className={`xs-btn${embed ? '' : ' is-on'}`} onClick={() => setEmbed(false)}>
                ↗ dans le navigateur
              </button>
            </span>
          </div>
          {folders.length ? (
            <div className="add-tab-row">
              <span>Dossier</span>
              <Pick
                value={folder}
                onChange={setFolder}
                options={[
                  { value: '', label: 'Aucun' },
                  ...folders.map((f) => ({ value: f.id, label: f.name, color: f.color })),
                ]}
              />
            </div>
          ) : null}
          {sessions.length && embed ? (
            <div className="add-tab-row">
              <span>Compte</span>
              <Pick
                value={session}
                onChange={setSession}
                options={[
                  { value: '', label: 'Compte principal' },
                  ...sessions.map((s) => ({ value: s.id, label: s.name, color: s.color })),
                ]}
              />
            </div>
          ) : null}

          <div className="add-tab-sites">
            <span className="add-tab-sites-title">Sites courants</span>
            <span className="add-tab-chips">
              {CATALOG.flatMap((g) => g.sites).map((s) => (
                <button
                  key={s.url}
                  type="button"
                  className={`xs-btn${full === s.url ? ' is-on' : ''}`}
                  onClick={() => pickSite(s)}
                >
                  {s.label}
                </button>
              ))}
            </span>
          </div>
        </div>
        <div className="modal-foot">
          <button
            className="btn add-tab-more"
            // Ce qui est tapé n'est plus perdu : le site est ajouté, puis ouvert dans Réglages (issue #58).
            onClick={() => onMore(ok ? draft() : undefined)}
            title="Ajoute le site et ouvre tous ses réglages : icône, veille, liens…"
          >
            Plus de réglages…
          </button>
          <span className="modal-hint">↵ ajouter · Échap annuler</span>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={!ok}>
            Ajouter
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
