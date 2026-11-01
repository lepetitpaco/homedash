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
  /** Effacer les données d'un site ou d'un compte (`clear-data` dans features, ≥ 1.5.2). */
  clearData?: (partition: string, host?: string) => Promise<boolean>
  tabMemory?: () => Promise<{ total_mb: number; tabs: Record<string, { mb: number; pid: number }> } | null>
  /** Réglages de notifications du système (`notif-settings` dans features, ≥ 1.5.1). */
  openNotificationSettings?: () => void
  /** Connexion à Basecamp dans une fenêtre de l'appli (`basecamp-connect`, 2.0). */
  basecampConnect?: () => Promise<{ ok: boolean; reason?: string }>
  /** Cookies des sessions d'onglets, pour l'export complet (`full-export`, 2.0). */
  exportCookies?: (partitions: string[]) => Promise<Record<string, unknown[]> | null>
  importCookies?: (jar: Record<string, unknown[]>) => Promise<{ ok: number; failed: number }>
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
  /** Ctrl+Tab (`site-switch` dans features) ; un nombre = ouvrir la tuile de ce rang ; renvoie de quoi se désabonner. */
  onSiteSwitch?: (cb: (step: 'next' | 'prev' | 'open' | 'cancel' | number) => void) => () => void
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

/**
 * ⌘R recharge l'onglet ouvert, ⇧⌘R tout homedash (appli ≥ 2.0, issue #63) ;
 * avant, c'était l'inverse : les libellés suivent l'appli qui tourne.
 */
export const reloadSwap = !!desktop?.features?.includes('reload-swap')

/** Événement de la page : relire tout de suite les données (⌘R sur un onglet natif). */
export const REFRESH_DATA = 'homedash:refresh-data'

/** L'appli sait-elle donner sa propre connexion à un onglet ? (appli ≥ 1.1.0) */
export const hasSessions = !!desktop?.features?.includes('sessions')

/** L'appli dit-elle si un lien de site a été ⌘cliqué (⇧cliqué) ? (appli ≥ 1.5.6) */
export const hasLinkFlip = !!desktop?.features?.includes('link-flip')
/** L'appli sait donner la mémoire de chaque site. */
export const hasTabMemory = !!desktop?.features?.includes('tab-memory')

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

/**
 * Onglets sur le point d'être mis en veille (détail : leurs clés) : leur site
 * passe sur une page vide, ce qui le ferme proprement (Discord y enregistre sa
 * connexion), avant que la webview soit retirée.
 */
export const UNLOAD_TAB = 'homedash:unload-tab'

/** Mettre un onglet en veille tout de suite (détail : sa clé), sans attendre le délai. */
export const SLEEP_TAB = 'homedash:sleep-tab'

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
