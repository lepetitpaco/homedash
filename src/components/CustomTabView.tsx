import { useEffect, useRef, useState } from 'react'
import { isLocal, refusesEmbed, srcOf } from '../lib/customTabs'
import { countInTitle, desktop, type WebviewEl } from '../lib/desktop'
import type { CustomTab } from '../types'

/**
 * Onglet perso affiché dans la page : le site ou le fichier dans un cadre.
 *
 * Monté une fois puis seulement masqué (`hidden`) : revenir sur l'onglet ne
 * recharge pas la page qu'il contient.
 *
 * Dans un navigateur, le cadre est une iframe, et beaucoup de sites la
 * refusent (page blanche) : le bandeau le dit et propose de l'ouvrir à part.
 * Dans l'appli de bureau (desktop/), c'est une <webview> : un affichage du
 * navigateur lui-même, que rien ne refuse. Elle remonte aussi les non-lus lus
 * dans le titre de la page (`onCount`).
 */
export default function CustomTabView({
  tab,
  hidden,
  onSettings,
  onCount,
  onFavicon,
}: {
  tab: CustomTab
  hidden: boolean
  onSettings: () => void
  onCount?: (n: number) => void
  /** Icône que le site affiche en ce moment (appli de bureau seulement). */
  onFavicon?: (url: string) => void
}) {
  // Changer `key` recrée l'iframe : c'est son ↻ (un site tiers ne se laisse pas recharger d'ici).
  const [gen, setGen] = useState(0)
  const [failed, setFailed] = useState<string | null>(null)
  const view = useRef<WebviewEl | null>(null)
  const local = isLocal(tab.url)
  // Une webview ne résout pas une adresse relative : `api/file?…` devient absolue.
  const src = new URL(srcOf(tab.url), window.location.href).href
  const blocked = !desktop && !local && refusesEmbed(tab.url)

  const countRef = useRef(onCount)
  countRef.current = onCount
  const faviconRef = useRef(onFavicon)
  faviconRef.current = onFavicon

  useEffect(() => {
    const el = view.current
    if (!desktop || !el) return
    const onTitle = (e: Event) => countRef.current?.(countInTitle((e as Event & { title: string }).title))
    const onFail = (e: Event) => {
      const { errorCode, errorDescription, isMainFrame } = e as Event & {
        errorCode: number
        errorDescription: string
        isMainFrame: boolean
      }
      // -3 = navigation annulée (une redirection qui en remplace une autre)
      if (isMainFrame && errorCode !== -3) setFailed(errorDescription || `erreur ${errorCode}`)
    }
    const onLoad = () => setFailed(null)
    const onIcon = (e: Event) => {
      const url = (e as Event & { favicons: string[] }).favicons?.[0]
      if (url && /^https?:\/\//.test(url)) faviconRef.current?.(url)
    }
    el.addEventListener('page-title-updated', onTitle)
    el.addEventListener('page-favicon-updated', onIcon)
    el.addEventListener('did-fail-load', onFail)
    el.addEventListener('did-finish-load', onLoad)
    return () => {
      el.removeEventListener('page-title-updated', onTitle)
      el.removeEventListener('page-favicon-updated', onIcon)
      el.removeEventListener('did-fail-load', onFail)
      el.removeEventListener('did-finish-load', onLoad)
    }
  }, [])

  const reload = () => {
    if (desktop) view.current?.reload()
    else setGen((g) => g + 1)
  }
  // Dans l'appli : l'adresse où l'on est arrivé, pas celle de départ.
  const openOutside = () => desktop?.openExternal(view.current?.getURL() || src)

  return (
    // Dans l'appli, une webview masquée (display: none) cesse de suivre sa page :
    // on la gare hors de l'écran, pour que les pastilles continuent d'arriver.
    <section className={`xtab${desktop && hidden ? ' is-parked' : ''}`} hidden={!desktop && hidden} aria-hidden={hidden}>
      <div className="xtab-bar">
        <span className="xtab-title">
          <span aria-hidden="true">{tab.icon || (local ? '📄' : '🌐')}</span> {tab.label}
        </span>
        <code className="xtab-url" title={tab.url}>
          {tab.url}
        </code>
        <span className="set-spacer" />
        {desktop ? null : blocked ? (
          <span className="xtab-warn">
            Ce site refuse l'affichage dans une page : il s'affiche dans l'appli de bureau homedash, ou ↗ à part.
          </span>
        ) : (
          <span className="xtab-hint">Page blanche ? Le site refuse l'affichage intégré : ouvre-le à part.</span>
        )}
        {desktop ? (
          <button
            className="xtab-btn"
            onClick={() => view.current?.canGoBack() && view.current.goBack()}
            title="Page précédente dans cet onglet"
          >
            ←
          </button>
        ) : null}
        <button className="xtab-btn" onClick={reload} title="Recharger le contenu de l'onglet">
          ↻
        </button>
        {desktop ? (
          <button className="xtab-btn" onClick={openOutside} title="Ouvrir dans le navigateur par défaut">
            ↗ ouvrir à part
          </button>
        ) : (
          <a className="xtab-btn" href={src} target="_blank" rel="noreferrer" title="Ouvrir dans un onglet du navigateur">
            ↗ ouvrir à part
          </a>
        )}
        <button className="xtab-btn" onClick={onSettings} title="Modifier ou supprimer cet onglet">
          ⚙
        </button>
      </div>
      {failed ? (
        <p className="xtab-warn">
          ✗ {failed} — <button className="bell-link" onClick={reload}>réessayer</button>
        </p>
      ) : null}
      {desktop ? (
        // Session partagée par toutes les webviews (main.js) : se connecter à
        // Google une fois vaut pour Gmail et Chat.
        <webview
          ref={(el) => {
            view.current = el as WebviewEl | null
          }}
          className="xtab-frame"
          src={src}
          partition="persist:homedash-tabs"
          // attribut à valeur texte : un booléen React ne serait pas écrit dans le DOM
          {...{ allowpopups: 'true' as unknown as boolean }}
        />
      ) : (
        <iframe
          key={gen}
          className="xtab-frame"
          src={src}
          title={tab.label}
          // Fichier local : pas d'attribut sandbox, Chrome n'affiche pas un PDF
          // sandboxé ; le serveur isole lui-même ce qui peut exécuter du code
          // (CSP sandbox sur HTML / SVG). Site tiers : tout sauf naviguer la page entière.
          {...(local
            ? {}
            : {
                sandbox:
                  'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals',
              })}
          referrerPolicy="no-referrer"
          allow="clipboard-read; clipboard-write; fullscreen"
        />
      )}
    </section>
  )
}
