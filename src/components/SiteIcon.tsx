import { useEffect, useState } from 'react'
import { DEFAULT_UI, template } from '../lib/config'
import { hostOf } from '../lib/customTabs'

/** Icônes déjà recadrées, par hôte ou adresse d'image : une seule fois par page. */
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
function trimmed(key: string, url: string, external = false): Promise<string | null> {
  const known = done.get(key)
  if (known !== undefined) return Promise.resolve(known)
  const running = pending.get(key)
  if (running) return running
  const p = new Promise<string | null>((resolve) => {
    const img = new Image()
    // Image d'un autre site : lisible par le canvas seulement s'il l'autorise (CORS).
    if (external) img.crossOrigin = 'anonymous'
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
    img.src = url
  }).then((r) => {
    done.set(key, r)
    pending.delete(key)
    return r
  })
  pending.set(key, p)
  return p
}

/**
 * Service de favicons de la config (`ui.faviconProvider`), posé par App : le
 * repli quand le serveur n'obtient pas l'icône (réseau du container filtré,
 * proxy d'entreprise). Le navigateur la demande alors lui-même ; elle n'est pas
 * recadrée (le canvas ne lit pas une image d'un autre site), mais elle est là.
 */
let provider = DEFAULT_UI.faviconProvider
export function setIconProvider(p: string | undefined) {
  provider = p || DEFAULT_UI.faviconProvider
}

/** Icône choisie par lien (`https://…/logo.png`) plutôt qu'un emoji. */
export const isImageIcon = (icon?: string) => !!icon && /^https?:\/\/\S+$/i.test(icon.trim())

/**
 * Icône d'un onglet perso ; monogramme si le site n'en a pas. `image` : lien
 * vers une image choisie, chargée par le navigateur (jamais par le serveur) ;
 * recadrée si son site l'autorise, sinon affichée telle quelle, contenue dans le carré.
 */
export default function SiteIcon({
  url,
  name,
  enabled = true,
  image,
}: {
  url: string
  name: string
  enabled?: boolean
  image?: string
}) {
  const own = image?.trim() ?? ''
  // Favicons coupées dans Réglages → Affichage : le monogramme, sans appel réseau.
  const host = own ? '' : enabled ? hostOf(url) : ''
  const key = own || host
  const [src, setSrc] = useState<string | null | undefined>(() => (key ? done.get(key) : null))
  // Image choisie que le canvas ne peut pas lire (CORS) ou introuvable.
  const [raw, setRaw] = useState(false)
  // Repli direct (service de favicons depuis le navigateur) en échec lui aussi.
  const [directFailed, setDirectFailed] = useState(false)

  useEffect(() => {
    setRaw(false)
    setDirectFailed(false)
    if (!key) return setSrc(null)
    let alive = true
    void trimmed(key, own || `api/favicon?host=${encodeURIComponent(host)}`, !!own).then((r) => alive && setSrc(r))
    return () => {
      alive = false
    }
  }, [key, own, host])

  if (src) return <img className="favicon site-icon" src={src} alt="" />
  if (own && src === null && !raw)
    return <img className="favicon site-icon" src={own} alt="" referrerPolicy="no-referrer" onError={() => setRaw(true)} />
  // En chargement : la place est gardée, rien ne saute à l'arrivée.
  if (src === undefined) return <span className="favicon site-icon" />
  if (host && !own && !directFailed)
    return (
      <img
        className="favicon site-icon"
        src={template(provider, { host: encodeURIComponent(host), url: encodeURIComponent(url) })}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setDirectFailed(true)}
      />
    )
  return (
    <span className="favicon monogram site-icon">
      {name.replace(/[^\p{L}\p{N}]/gu, '').charAt(0).toUpperCase() || '•'}
    </span>
  )
}
