/**
 * L'appli de bureau (desktop/, Electron) pose `window.homedashDesktop` avant
 * le chargement de la page. Absent = homedash ouvert dans un navigateur.
 */
export type Desktop = {
  version: string
  platform: string
  /** Absent sur l'appli 1.0.0. `sessions` = un compte de connexion par onglet. */
  features?: string[]
  /** Version de l'appli (≥ 1.4.0 ; absente avant). */
  appVersion?: string
  /** Menu de l'appli → une page (`settings`, `help-news`, `help-guide`) ; `menu` dans features. */
  onMenu?: (cb: (target: string) => void) => () => void
  /** Mise à jour depuis l'appli (`update` dans features). */
  update?: () => Promise<{ ok: boolean; reason?: string; relaunch?: boolean }>
  onUpdateLog?: (cb: (msg: { line: string; kind: 'cmd' | 'out' | 'error' | 'done' }) => void) => () => void
  /** Nombre sur l'icône du Dock (0 = rien). */
  setBadge: (n: number) => void
  /** Adresse http(s) dans le navigateur par défaut. */
  openExternal: (url: string) => void
  /** Action du clic droit d'un site sur sa webview `id` (≥ 1.1.0). */
  guestAction?: (id: number, action: GuestAction, extra?: { text?: string; x?: number; y?: number }) => void
  /** Un site émet du son ou s'arrête (≥ 1.1.0) ; renvoie de quoi se désabonner. */
  onAudio?: (cb: (state: { id: number; audible: boolean }) => void) => () => void
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
 * Précédent / suivant au clavier, comme un navigateur : ⌘[ ⌘], et ⌘← ⌘→ hors
 * d'un champ de saisie (où ils déplacent le curseur). Même règle dans
 * desktop/guest-preload.js, pour les sites.
 */
export function navKey(e: KeyboardEvent): 'back' | 'forward' | null {
  if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return null
  if (e.key === '[') return 'back'
  if (e.key === ']') return 'forward'
  const el = e.target as HTMLElement | null
  if (el?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return null
  if (e.key === 'ArrowLeft') return 'back'
  if (e.key === 'ArrowRight') return 'forward'
  return null
}

/** `<webview>` d'Electron : ce dont la page se sert. */
export type WebviewEl = HTMLElement & {
  reload: () => void
  goBack: () => void
  canGoBack: () => boolean
  goForward: () => void
  canGoForward: () => boolean
  getURL: () => string
  getTitle: () => string
  loadURL: (url: string) => Promise<void>
  setAudioMuted: (muted: boolean) => void
  getWebContentsId: () => number
  executeJavaScript: (code: string) => Promise<unknown>
}
