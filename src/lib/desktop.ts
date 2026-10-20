/**
 * L'appli de bureau (desktop/, Electron) pose `window.homedashDesktop` avant
 * le chargement de la page. Absent = homedash ouvert dans un navigateur.
 */
export type Desktop = {
  version: string
  platform: string
  /** Nombre sur l'icône du Dock (0 = rien). */
  setBadge: (n: number) => void
  /** Adresse http(s) dans le navigateur par défaut. */
  openExternal: (url: string) => void
}

export const desktop: Desktop | undefined = (window as unknown as { homedashDesktop?: Desktop }).homedashDesktop

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
}
