import { useCallback, useEffect, useMemo, useState } from 'react'
import { confirmDialog } from '../components/ConfirmHost'
import { bump, clear as clearUsage, load as loadUsage, topIds, type Usage } from '../lib/usage'
import type { FlatLink } from '../types'

/**
 * Compteurs d'ouverture des liens (data/usage.json) et les deux rangées de
 * tuiles qui en découlent.
 */
export function useUsage(links: FlatLink[], showTiles: boolean, maxTiles: number) {
  const [usage, setUsage] = useState<Usage>({})

  // compteurs côté serveur (data/usage.json), communs à tous les navigateurs
  useEffect(() => {
    void loadUsage().then(setUsage)
  }, [])

  const counts = useMemo(
    () => Object.fromEntries(Object.entries(usage).map(([id, u]) => [id, u.count])),
    [usage],
  )

  /** Rangée du haut : les liens explicitement épinglés, dans l'ordre du config. */
  const pinnedTiles = useMemo(() => (showTiles ? links.filter((l) => l.pinned) : []), [links, showTiles])

  /**
   * Rangée du bas : les liens les plus ouverts. Les épinglés en sont exclus,
   * ils ont déjà leur rangée au-dessus.
   */
  const usedTiles = useMemo(() => {
    if (!showTiles) return []
    return topIds(usage, maxTiles + pinnedTiles.length)
      .map((id) => links.find((l) => l.id === id))
      .filter((l): l is FlatLink => !!l && !l.pinned)
      .slice(0, maxTiles)
  }, [links, usage, showTiles, maxTiles, pinnedTiles])

  const track = useCallback((id: string) => {
    void bump(id).then((next) => {
      if (Object.keys(next).length > 0) setUsage(next)
    })
  }, [])

  const resetUsage = useCallback(() => {
    void confirmDialog({
      title: "Remettre à zéro les compteurs d'ouverture ?",
      body: "La rangée « les plus utilisés » repartira de zéro. Les liens eux-mêmes ne bougent pas.",
      confirmLabel: 'Remettre à zéro',
      danger: true,
    }).then((ok) => {
      if (ok) void clearUsage().then(() => setUsage({}))
    })
  }, [])

  return { usage, counts, pinnedTiles, usedTiles, track, resetUsage }
}
