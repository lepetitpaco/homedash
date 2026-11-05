/**
 * Ouvrir d'un clic tous les liens d'un groupe de branche (cartes PRs ouvertes et Branches, issue #127).
 * Règles pures : l'ouverture elle-même (onglet de l'appli ou navigateur) est fournie par l'appelant.
 */

/** Liens à ouvrir : http(s) seulement, sans doublon, dans l'ordre d'affichage. */
export function linksToOpen(urls: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const url of urls) {
    if (!url || !/^https?:\/\//i.test(url) || seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

/**
 * Ouvre chaque lien avec `open`, qui renvoie `false` quand le navigateur l'a bloqué (fenêtre surgissante).
 * Un lien bloqué n'arrête pas les suivants.
 */
export function openAll(
  urls: readonly (string | null | undefined)[],
  open: (url: string) => boolean,
): { opened: number; blocked: string[] } {
  const blocked: string[] = []
  let opened = 0
  for (const url of linksToOpen(urls)) {
    if (open(url)) opened++
    else blocked.push(url)
  }
  return { opened, blocked }
}

/**
 * Ouverture d'un groupe dans l'appli, posée par `App` (qui connaît les onglets et le réglage des liens) :
 * `flip` = ⌘clic / Ctrl+clic / ⇧clic, l'inverse du réglage, comme les autres liens. `null` hors appli.
 */
type GroupOpener = (urls: string[], flip: boolean) => void
let groupOpener: GroupOpener | null = null
export function setGroupOpener(fn: GroupOpener | null): void {
  groupOpener = fn
}
export function getGroupOpener(): GroupOpener | null {
  return groupOpener
}
