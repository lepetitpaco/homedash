import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export type MasonryItem = { key: string; node: ReactNode; wide?: boolean }

const GAP = 14
/** Un nouveau placement n'est adopté que s'il raccourcit la page d'au moins 15 %. */
const GAIN = 0.85

type Placement = { n: number; keys: string; col: Map<string, number> }

/**
 * Cartes en colonnes indépendantes : une carte courte ne laisse pas de trou à
 * côté d'une longue.
 *
 * Positionnement absolu dans un seul conteneur, hauteurs mesurées : une carte
 * ne change jamais de parent, donc jamais remontée (son état est conservé).
 *
 * Les cartes se remplissent en direct (GitHub toutes les 15 s) : réattribuer les
 * colonnes à chaque changement de hauteur les ferait sauter de l'une à l'autre.
 * Le placement est donc gardé tant que les cartes et le nombre de colonnes ne
 * changent pas, sauf si un nouveau raccourcit nettement la page. Les cartes
 * `wide` prennent toute la largeur, à leur place dans l'ordre.
 */
export default function Masonry({
  items,
  columns,
  minWidth,
  className,
}: {
  items: MasonryItem[]
  /** Nombre fixe de colonnes ; 0 = autant que la largeur en contient. */
  columns: number
  /** Largeur mini d'une colonne en mode auto, en px. */
  minWidth: number
  className?: string
}) {
  const [box, setBox] = useState<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  const heights = useRef(new Map<string, number>())
  const [version, setVersion] = useState(0)
  const placement = useRef<Placement | null>(null)

  useEffect(() => {
    if (!box) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(box)
    return () => ro.disconnect()
  }, [box])

  // Un seul observateur pour toutes les cartes ; chaque élément porte sa clé.
  const observer = useMemo(
    () =>
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver((entries) => {
            let changed = false
            for (const e of entries) {
              const key = (e.target as HTMLElement).dataset.key ?? ''
              const h = Math.round(e.borderBoxSize?.[0]?.blockSize ?? e.contentRect.height)
              if (heights.current.get(key) !== h) {
                heights.current.set(key, h)
                changed = true
              }
            }
            if (changed) setVersion((v) => v + 1)
          }),
    [],
  )
  useEffect(() => () => observer?.disconnect(), [observer])

  // React 19 : la fonction renvoyée est appelée au retrait de la carte, qui
  // n'est plus observée (sinon gardée en mémoire jusqu'au démontage du tout).
  const track = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el || !observer) return
      observer.observe(el)
      return () => observer.unobserve(el)
    },
    [observer],
  )

  const n = Math.max(1, columns > 0 ? columns : Math.floor((width + GAP) / (minWidth + GAP)))
  const colW = width ? (width - GAP * (n - 1)) / n : 0

  const layout = useMemo(() => {
    const h = (k: string) => heights.current.get(k) ?? 0
    const keys = items.map((i) => `${i.key}${i.wide ? '*' : ''}`).join('|')

    const greedy = (): Map<string, number> => {
      const cols = new Array<number>(n).fill(0)
      const out = new Map<string, number>()
      for (const it of items) {
        if (it.wide) {
          cols.fill(Math.max(...cols) + h(it.key) + GAP)
          continue
        }
        const c = cols.indexOf(Math.min(...cols))
        out.set(it.key, c)
        cols[c] += h(it.key) + GAP
      }
      return out
    }

    const place = (col: Map<string, number>) => {
      const cols = new Array<number>(n).fill(0)
      const pos = new Map<string, { top: number; c: number }>()
      for (const it of items) {
        const hh = h(it.key)
        if (it.wide) {
          const top = Math.max(...cols)
          pos.set(it.key, { top, c: -1 })
          cols.fill(top + (hh ? hh + GAP : 0))
          continue
        }
        const c = Math.min(col.get(it.key) ?? 0, n - 1)
        pos.set(it.key, { top: cols[c], c })
        if (hh) cols[c] += hh + GAP
      }
      return { pos, height: Math.max(0, Math.max(...cols) - GAP) }
    }

    const cur = placement.current
    if (!cur || cur.n !== n || cur.keys !== keys) {
      placement.current = { n, keys, col: greedy() }
    } else {
      const next = greedy()
      if (place(next).height < place(cur.col).height * GAIN) cur.col = next
    }
    return place(placement.current!.col)
    // `version` : une hauteur mesurée a changé.
  }, [items, n, version])

  // Une carte qui disparaît ne doit pas garder sa hauteur pour la suivante du même nom.
  useLayoutEffect(() => {
    const live = new Set(items.map((i) => i.key))
    for (const k of heights.current.keys()) if (!live.has(k)) heights.current.delete(k)
  }, [items])

  return (
    <div
      ref={setBox}
      className={`masonry${className ? ` ${className}` : ''}`}
      style={{ height: width ? layout.height : undefined }}
    >
      {items.map((it) => {
        const p = layout.pos.get(it.key)
        const style: React.CSSProperties = !width
          ? {} // avant la première mesure : dans le flux, rien ne clignote
          : {
              position: 'absolute',
              top: p?.top ?? 0,
              left: !p || p.c < 0 ? 0 : p.c * (colW + GAP),
              width: !p || p.c < 0 ? width : colW,
            }
        return (
          <div key={it.key} ref={track} data-key={it.key} className="masonry-item" style={style}>
            {it.node}
          </div>
        )
      })}
    </div>
  )
}
