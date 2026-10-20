import { useState } from 'react'
import { isLocal, refusesEmbed, srcOf } from '../lib/customTabs'
import type { CustomTab } from '../types'

/**
 * Onglet perso affiché dans la page : le site ou le fichier dans un cadre.
 *
 * Monté au premier affichage puis seulement masqué (`hidden`) : revenir sur
 * l'onglet ne recharge pas la page qu'il contient. Beaucoup de sites refusent
 * d'être affichés ainsi (page blanche) : le bandeau le dit et propose de
 * l'ouvrir à part.
 */
export default function CustomTabView({
  tab,
  hidden,
  onSettings,
}: {
  tab: CustomTab
  hidden: boolean
  onSettings: () => void
}) {
  // Changer `key` recrée le cadre : c'est le ↻ (un site tiers ne se laisse pas recharger d'ici).
  const [gen, setGen] = useState(0)
  const src = srcOf(tab.url)
  const local = isLocal(tab.url)
  const blocked = !local && refusesEmbed(tab.url)

  return (
    <section className="xtab" hidden={hidden}>
      <div className="xtab-bar">
        <span className="xtab-title">
          <span aria-hidden="true">{tab.icon || (local ? '📄' : '🌐')}</span> {tab.label}
        </span>
        <code className="xtab-url" title={tab.url}>
          {tab.url}
        </code>
        <span className="set-spacer" />
        {blocked ? (
          <span className="xtab-warn">Ce site refuse sans doute l'affichage ici : page blanche possible.</span>
        ) : (
          <span className="xtab-hint">Page blanche ? Le site refuse l'affichage intégré : ouvre-le à part.</span>
        )}
        <button className="xtab-btn" onClick={() => setGen((g) => g + 1)} title="Recharger le contenu de l'onglet">
          ↻
        </button>
        <a className="xtab-btn" href={src} target="_blank" rel="noreferrer" title="Ouvrir dans un onglet du navigateur">
          ↗ ouvrir à part
        </a>
        <button className="xtab-btn" onClick={onSettings} title="Modifier ou supprimer cet onglet">
          ⚙
        </button>
      </div>
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
    </section>
  )
}
