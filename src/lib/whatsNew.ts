/**
 * « Quoi de neuf » : les nouveautés présentées une fois, après une mise à jour.
 *
 * Le CHANGELOG dit tout ; cette fenêtre montre l'essentiel, une carte par nouveauté, avec un bouton qui mène au bon
 * endroit. Écrite à chaque version mineure ou majeure par `/version` (RELEASE.md) ; une version sans entrée ici
 * (correctifs) n'ouvre rien. Sans React, pour être testé.
 */
import type { Feature } from '../types'

export type WhatsNewCard = {
  id: string
  icon: string
  title: string
  /** Une ou deux phrases, au tutoiement, pour l'utilisateur. */
  text: string
  /** Une capture du guide (`docs/screenshots/x.jpg`, servie sous `guide/x.jpg`). */
  image?: string
  /** Zone de la capture à montrer, en retraits haut, droite, bas, gauche (`object-view-box: inset(…)`). */
  imageCrop?: string
  /** Où mène « Essayer » : un onglet, ou une partie de Réglages (`set-…`, `set-tabs:extensions`…). */
  go?: { tab: 'links' | 'github' | 'local' | 'basecamp' | 'trello' } | { section: string }
  /** Masquée quand cette fonctionnalité est coupée. */
  feature?: Feature
  /** Seulement dans l'appli de bureau qui a ce mot dans `features`. */
  desktop?: string
}

/** `{focus}` devient le raccourci du mode focus de la machine (`withKeys`). */
export const WHATS_NEW: Record<string, WhatsNewCard[]> = {
  '2.5.0': [
    {
      id: 'bell',
      icon: '🔕',
      title: 'Une cloche moins bavarde',
      text: 'Une version Renovate publiée sur six dépôts ne fait plus qu’une ligne « ×6 ». Et pour chaque type : Compter, Discret (dans la liste, sans compteur) ou Masqué.',
      image: 'guide/cloche.jpg',
      imageCrop: '5% 13% 46% 54%',
      go: { section: 'set-notifs' },
    },
    {
      id: 'open-all',
      icon: '↗',
      title: 'Toutes les PR d’une branche d’un coup',
      text: 'Une branche présente dans plusieurs repos a son bouton ↗ ouvrir les N. Et les dates GitHub se lisent enfin : « 14:12 », « hier », à ton heure.',
      image: 'guide/github.jpg',
      imageCrop: '9% 47% 46% 10%',
      go: { tab: 'github' },
      feature: 'github',
    },
    {
      id: 'focus',
      icon: '⤢',
      title: 'Mode focus, sites bord à bord',
      text: 'Un site affiché prend toute la place. ⤢ en haut à droite, ou {focus} même en tapant dans le site : il occupe toute la fenêtre, les barres reviennent quand la souris touche leur bord.',
    },
    {
      id: 'stats',
      icon: '📊',
      title: 'Stats Basecamp',
      text: 'Qui a créé combien de tâches et de cartes, et combien sont faites, par personne ou par projet, mois par mois.',
      go: { tab: 'basecamp' },
      feature: 'basecamp',
    },
    {
      id: 'settings',
      icon: '🔎',
      title: 'Des Réglages plus clairs',
      text: 'La recherche trouve les réglages (« veille », « jeton »…), une Vue d’ensemble dit ce qui est branché, et l’affichage se choisit sur des miniatures.',
      go: { section: 'set-home' },
    },
    {
      id: 'bars',
      icon: '🧭',
      title: 'Onglets en pastilles, barres masquées',
      text: 'Les onglets du haut en pastilles, qui passent à la ligne. Barres masquées, les sites qui ont des non-lus restent visibles à côté de la cloche.',
      go: { section: 'set-bars' },
    },
    {
      id: 'issue',
      icon: '🐙',
      title: 'Des issues plus propres',
      text: 'Depuis une tâche ou une carte : une section par source, d’autres repos concernés à cocher, et plus aucun @ qui prévenait un inconnu sur GitHub.',
      go: { tab: 'basecamp' },
      feature: 'basecamp',
    },
    {
      id: 'extensions',
      icon: '🧩',
      title: 'Extensions dans tes sites',
      text: 'Le dossier d’une extension non empaquetée, et elle tourne dans tous tes sites. N’ajoute que celles que tu connais : elles voient ce que tes sites affichent.',
      go: { section: 'set-tabs:extensions' },
      desktop: 'extensions',
    },
  ],
}

/** `2.10.0` > `2.9.3` (comme `newerThan` de changelog.ts, qui dépend du DOM : celui-ci se teste sans). */
function newerThan(a: string, b: string): boolean {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0)
  return false
}

export type WhatsNewVersion = { version: string; cards: WhatsNewCard[] }

/**
 * Les nouveautés à présenter en passant de `from` à `current` (bornes : après `from`, jusqu'à `current` compris), la
 * plus récente d'abord, sans les cartes des fonctionnalités coupées ni celles d'une appli qui ne les a pas.
 */
export function whatsNewSince(
  from: string | null | undefined,
  current: string,
  on: Partial<Record<Feature, boolean>> = {},
  desktopFeatures: string[] | null = null,
  table: Record<string, WhatsNewCard[]> = WHATS_NEW,
): WhatsNewVersion[] {
  return Object.keys(table)
    .filter((v) => (!from || newerThan(v, from)) && !newerThan(v, current))
    .sort((a, b) => (newerThan(a, b) ? -1 : 1))
    .map((version) => ({
      version,
      cards: table[version].filter(
        (c) => (!c.feature || on[c.feature] !== false) && (!c.desktop || !!desktopFeatures?.includes(c.desktop)),
      ),
    }))
    .filter((v) => v.cards.length > 0)
}

/** Dernière version dont les nouveautés ont été montrées (par navigateur / appli). */
export const WHATS_NEW_SEEN = 'homedash:whats-new-seen'
/** Ouvre la fenêtre depuis n'importe où (bouton de version, page Nouveautés). */
export const WHATS_NEW_EVENT = 'homedash:whats-new'

/** À ouvrir toute seule : une vraie mise à jour, des nouveautés à montrer, pas encore vues pour cette version. */
export function shouldShowWhatsNew(
  upgradedFrom: string | null | undefined,
  current: string,
  seen: string | null,
  versions: WhatsNewVersion[],
): boolean {
  return !!upgradedFrom && versions.length > 0 && seen !== current
}

/** Les raccourcis écrits pour la machine (Mac ou Windows). */
export const withKeys = (text: string, mac: boolean) => text.replaceAll('{focus}', mac ? '⌘⇧F' : 'Ctrl+Maj+F')
