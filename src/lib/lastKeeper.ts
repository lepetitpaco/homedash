/**
 * Vue Flux (#180) : les dernières adresses des copies, en attente d'écriture. Sans React, pour être testé : la page lui
 * donne de quoi lire la vue enregistrée (`stored`, dans la config la plus récente, écritures en cours comprises) et de quoi
 * écrire (`write`). Règles :
 *  - une seule vue suivie à la fois ; en ouvrir une autre écrit d'abord ce qui attend ;
 *  - écriture regroupée : 5 s après la dernière navigation, **au plus tard 60 s après la première navigation pas encore
 *    écrite**, et jamais plus d'une fois par 30 s pendant qu'on navigue ; tout de suite à la fermeture (`close`) ou sur
 *    demande (`flush` : avant d'ajouter une vue, page cachée ou quittée) ;
 *  - rien n'est écrit si les adresses n'ont pas changé, ni pour une vue disparue.
 */
import { sameLast } from './splitViews'

const SLOTS = 4
const nulls = () => Array.from({ length: SLOTS }, (): string | null => null)

export const QUIET_MS = 5000
export const MAX_WAIT_MS = 60000
export const MIN_GAP_MS = 30000

export type Clock = { now: () => number; set: (fn: () => void, ms: number) => number; clear: (id: number) => void }

export type LastKeeperIO = {
  /** Les adresses enregistrées d'une vue (`[]` si aucune), ou `null` si la vue n'existe plus. */
  stored: (viewId: string) => (string | null)[] | null
  /** Écrit les adresses d'une vue (dans la config la plus récente). */
  write: (viewId: string, last: (string | null)[]) => void
}

export function createLastKeeper(io: LastKeeperIO, clock: Clock) {
  let pending: { viewId: string; last: (string | null)[] } | null = null
  let dirtySince: number | null = null // première navigation pas encore écrite
  let lastNav = 0
  let lastWrite = -Infinity
  let timer = 0

  const stop = () => {
    if (timer) clock.clear(timer)
    timer = 0
  }

  const flush = () => {
    stop()
    if (!pending || dirtySince === null) return
    dirtySince = null
    const stored = io.stored(pending.viewId)
    if (stored === null || sameLast(stored, pending.last)) return
    lastWrite = clock.now()
    io.write(pending.viewId, [...pending.last])
  }

  const schedule = () => {
    stop()
    const at = Math.max(lastWrite + MIN_GAP_MS, Math.min(lastNav + QUIET_MS, (dirtySince ?? lastNav) + MAX_WAIT_MS))
    timer = clock.set(flush, Math.max(0, at - clock.now()))
  }

  return {
    /**
     * La vue s'ouvre : ses adresses de départ. Même vue déjà suivie : on garde ce qui attend (plus récent que la config),
     * sauf `reset` (annuler « Modifier la vue » : on repart de l'enregistré).
     */
    open(viewId: string, opts: { reset?: boolean } = {}): (string | null)[] {
      if (pending && pending.viewId !== viewId) flush()
      if (!pending || pending.viewId !== viewId || opts.reset) {
        if (opts.reset) stop()
        dirtySince = null
        const stored = io.stored(viewId) ?? []
        pending = { viewId, last: Array.from({ length: SLOTS }, (_, i) => stored[i] ?? null) }
      }
      return [...pending.last]
    },
    /** Une copie de la vue suivie a navigué : son adresse à noter (`null` = repartir de l'accueil). */
    note(viewId: string, slot: number, url: string | null) {
      if (!pending || pending.viewId !== viewId || slot < 0 || slot >= SLOTS || pending.last[slot] === url) return
      pending.last[slot] = url
      const now = clock.now()
      if (dirtySince === null) dirtySince = now
      lastNav = now
      schedule()
    },
    flush,
    /** La vue se ferme : ce qui attend est écrit tout de suite, et la vue n'est plus suivie. */
    close(viewId: string) {
      if (pending?.viewId !== viewId) return
      flush()
      pending = null
    },
    /**
     * Les adresses viennent d'être écrites par la page elle-même (« Repartir du début », « Modifier la vue ») : on les
     * adopte, rien n'attend plus.
     */
    adopt(viewId: string, last: (string | null)[]) {
      if (pending?.viewId !== viewId) return
      stop()
      dirtySince = null
      pending.last = Array.from({ length: SLOTS }, (_, i) => last[i] ?? null)
    },
    /** Ce qui attend pour cette vue (ou `null`). */
    pendingOf(viewId: string): (string | null)[] | null {
      return pending?.viewId === viewId ? [...pending.last] : null
    },
  }
}

export { nulls as emptyLast }
