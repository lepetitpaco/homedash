/**
 * Raccourcis affichés selon le système : `⌘K` sur Mac, `Ctrl+K` ailleurs
 * (Windows, Linux). Les gestionnaires de touches acceptent déjà les deux
 * (`metaKey || ctrlKey`) : seul l'affichage change.
 */
export const isMac = /Mac|iPhone|iPad/.test(typeof navigator === 'undefined' ? 'Mac' : navigator.platform)

/** `keys('K')` → ⌘K / Ctrl+K ; `keys('R', true)` (avec Maj) → ⇧⌘R / Ctrl+Maj+R. */
export function keys(key: string, shift = false): string {
  return isMac ? `${shift ? '⇧' : ''}⌘${key}` : `Ctrl+${shift ? 'Maj+' : ''}${key}`
}
