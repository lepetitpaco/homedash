import { useEffect, useState } from 'react'
import { hostOf } from '../lib/customTabs'

/** Icônes déjà recadrées, par hôte : une seule fois par page. */
const done = new Map<string, string | null>()
const pending = new Map<string, Promise<string | null>>()

const SIZE = 64
/** Marge laissée autour du dessin, en px sur 64 : toutes les icônes ont la même. */
const PAD = 4

/**
 * Icône du site recadrée : marges transparentes retirées, puis remise à la même
 * échelle, centrée dans un carré. Les services de favicons renvoient des
 * images de 16 à 64 px dont le dessin occupe plus ou moins de place ; sans ça,
 * côte à côte, elles paraissent décalées.
 */
function trimmed(host: string): Promise<string | null> {
  const known = done.get(host)
  if (known !== undefined) return Promise.resolve(known)
  const running = pending.get(host)
  if (running) return running
  const p = new Promise<string | null>((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const w = img.naturalWidth || SIZE
        const h = img.naturalHeight || SIZE
        const src = document.createElement('canvas')
        src.width = w
        src.height = h
        const sctx = src.getContext('2d')!
        sctx.drawImage(img, 0, 0)
        const px = sctx.getImageData(0, 0, w, h).data
        // Boîte du dessin : les pixels un peu opaques.
        let x0 = w, y0 = h, x1 = -1, y1 = -1
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++)
            if (px[(y * w + x) * 4 + 3] > 24) {
              if (x < x0) x0 = x
              if (x > x1) x1 = x
              if (y < y0) y0 = y
              if (y > y1) y1 = y
            }
        if (x1 < 0) return resolve(null)
        const bw = x1 - x0 + 1
        const bh = y1 - y0 + 1
        const scale = (SIZE - PAD * 2) / Math.max(bw, bh)
        const out = document.createElement('canvas')
        out.width = SIZE
        out.height = SIZE
        const ctx = out.getContext('2d')!
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(src, x0, y0, bw, bh, (SIZE - bw * scale) / 2, (SIZE - bh * scale) / 2, bw * scale, bh * scale)
        resolve(out.toDataURL('image/png'))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = `api/favicon?host=${encodeURIComponent(host)}`
  }).then((r) => {
    done.set(host, r)
    pending.delete(host)
    return r
  })
  pending.set(host, p)
  return p
}

/** Icône d'un onglet perso ; monogramme si le site n'en a pas. */
export default function SiteIcon({ url, name, enabled = true }: { url: string; name: string; enabled?: boolean }) {
  // Favicons coupées dans Réglages → Affichage : le monogramme, sans appel réseau.
  const host = enabled ? hostOf(url) : ''
  const [src, setSrc] = useState<string | null | undefined>(() => (host ? done.get(host) : null))

  useEffect(() => {
    if (!host) return setSrc(null)
    let alive = true
    void trimmed(host).then((r) => alive && setSrc(r))
    return () => {
      alive = false
    }
  }, [host])

  if (src) return <img className="favicon site-icon" src={src} alt="" />
  // En chargement : la place est gardée, rien ne saute à l'arrivée.
  if (src === undefined) return <span className="favicon site-icon" />
  return (
    <span className="favicon monogram site-icon">
      {name.replace(/[^\p{L}\p{N}]/gu, '').charAt(0).toUpperCase() || '•'}
    </span>
  )
}
