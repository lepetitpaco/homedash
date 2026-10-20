/**
 * L'appli de bureau (desktop/, Electron) pose `window.homedashDesktop` avant
 * le chargement de la page. Absent = homedash ouvert dans un navigateur.
 */
export type Desktop = {
  version: string
  platform: string
  /** Absent sur l'appli 1.0.0. `sessions` = un compte de connexion par onglet. */
  features?: string[]
  /** Nombre sur l'icône du Dock (0 = rien). */
  setBadge: (n: number) => void
  /** Adresse http(s) dans le navigateur par défaut. */
  openExternal: (url: string) => void
  /** Action du clic droit d'un site sur sa webview `id` (≥ 1.1.0). */
  guestAction?: (id: number, action: GuestAction, extra?: { text?: string; x?: number; y?: number }) => void
  /** Clic ou Échap dans un site (≥ 1.1.0) ; renvoie de quoi se désabonner. */
  onGuestDown?: (cb: (kind: 'click' | 'escape') => void) => () => void
  /** ⇧⌘R du menu de l'appli (≥ 1.1.0) ; renvoie de quoi se désabonner. */
  onReloadTab?: (cb: () => void) => () => void
}

export const desktop: Desktop | undefined = (window as unknown as { homedashDesktop?: Desktop }).homedashDesktop

export type GuestAction =
  | 'copy'
  | 'cut'
  | 'paste'
  | 'selectAll'
  | 'back'
  | 'forward'
  | 'reload'
  | 'copyImage'
  | 'copyText'

/** Ce que main.js envoie à `window.__homedashMenu` sur un clic droit dans un site. */
export type GuestMenu = {
  id: number
  x: number
  y: number
  link: string
  image: string
  text: string
  editable: boolean
  canBack: boolean
  canForward: boolean
}

/** Événement de la page : ouvrir `url` dans l'onglet perso `key` (`x:…`). */
export const OPEN_IN_TAB = 'homedash:open-in-tab'
export type OpenInTab = { key: string; url: string }

/** Événement de la page : recharger la webview de l'onglet perso `detail` (`x:…`). */
export const RELOAD_TAB = 'homedash:reload-tab'

/** L'appli sait-elle donner sa propre connexion à un onglet ? (appli ≥ 1.1.0) */
export const hasSessions = !!desktop?.features?.includes('sessions')

/** `Pro Été` → `persist:homedash-tabs-pro-ete` ; vide = la session commune. */
export function partitionOf(name: string | undefined): string {
  const slug = (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug ? `persist:homedash-tabs-${slug}` : 'persist:homedash-tabs'
}

/**
 * Non-lus d'un site d'après le titre de sa page : « Boîte de réception (3) »,
 * « (12) WhatsApp », « Chat (2) »… La convention de presque tous les sites qui
 * comptent quelque chose ; 0 si le titre n'en porte pas.
 */
export function countInTitle(title: string): number {
  const m = /\((\d{1,4})\+?\)/.exec(title)
  return m ? Number(m[1]) : 0
}

/** `<webview>` d'Electron : ce dont la page se sert. */
export type WebviewEl = HTMLElement & {
  reload: () => void
  goBack: () => void
  canGoBack: () => boolean
  getURL: () => string
  getTitle: () => string
  loadURL: (url: string) => Promise<void>
  getWebContentsId: () => number
}
