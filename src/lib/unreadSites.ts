/**
 * Sites à lire, montrés à gauche de la cloche quand les barres sont masquées (issue #130) : leurs
 * compteurs n'étaient alors visibles nulle part, sauf en somme sur l'icône du Dock.
 */

export type UnreadSite<T> = { tab: T; key: string; n: number }

/**
 * Sites intégrés avec des non-lus, le plus chargé d'abord (à égalité, l'ordre de la barre).
 * Exclus : notifications coupées (`notify: false`), sites ouverts dans le navigateur, le site affiché.
 */
export function unreadSites<T extends { embed?: boolean; notify?: boolean }>(
  tabs: T[],
  counts: Record<string, number>,
  keyOf: (t: T) => string,
  current: string | null,
): UnreadSite<T>[] {
  const out: (UnreadSite<T> & { i: number })[] = []
  tabs.forEach((tab, i) => {
    const key = keyOf(tab)
    const n = counts[key] ?? 0
    if (!tab.embed || tab.notify === false || key === current || !(n > 0)) return
    out.push({ tab, key, n, i })
  })
  return out.sort((a, b) => b.n - a.n || a.i - b.i).map(({ tab, key, n }) => ({ tab, key, n }))
}

/** Combien d'icônes avant « +N » : au-delà, la barre du haut reprendrait la place gagnée (#129). */
export const UNREAD_SHOWN = 3
