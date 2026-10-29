/**
 * Icônes des onglets perso, relayées par le serveur.
 *
 * La page recadre chaque icône ; pour lire ses pixels, elle doit venir de la
 * page elle-même. Le serveur la demande donc au service de favicons réglé
 * (`ui.faviconProvider`, Google par défaut) et la garde en mémoire.
 *
 * On ne reçoit qu'un nom d'hôte, jamais une adresse. Si le service ne connaît
 * pas le site, on demande `/favicon.ico` au site lui-même, mais seulement pour
 * un site d'un onglet perso de la config.
 */

export const DEFAULT_PROVIDER = 'https://www.google.com/s2/favicons?domain={host}&sz=64'
const TTL = 7 * 24 * 3600
const FAIL_TTL = 3600
const MAX_SIZE = 256 * 1024
const MAX_KEEP = 400

const HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/

type Hit = [number, Buffer | null, string]
const cache = new Map<string, Hit>()

/** Point de passage unique vers le réseau (remplacé dans les tests). */
export let open: (url: string) => Promise<Response> = (url) =>
  fetch(url, { headers: { 'User-Agent': 'homedash' }, signal: AbortSignal.timeout(6000) })

export function setOpen(fn: typeof open): void {
  open = fn
}

export function clearCache(): void {
  cache.clear()
}

export function validHost(host: string): boolean {
  return !!host && HOST.test(host)
}

async function download(url: string): Promise<[Buffer | null, string]> {
  let res: Response
  try {
    res = await open(url)
  } catch (e) {
    const host = (() => {
      try {
        return new URL(url).hostname
      } catch {
        return url
      }
    })()
    console.error(`⚠ favicon indisponible via ${host} : ${(e as Error).message}`)
    return [null, '']
  }
  if (!res.ok) return [null, ''] // le service ne connaît pas le site : normal
  const ctype = (res.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase()
  const body = Buffer.from(await res.arrayBuffer())
  if (!ctype.startsWith('image/') || !body.length || body.length > MAX_SIZE) return [null, '']
  return [body, ctype]
}

/** (octets, type) de l'icône de `host`, ou (null, "") ; `own` : hôtes des onglets perso. */
export async function get(host: string, provider?: unknown, own: Set<string> = new Set()): Promise<[Buffer | null, string]> {
  host = (host || '').trim().toLowerCase()
  if (!validHost(host)) throw new Error("nom d'hôte invalide")
  const prov = typeof provider === 'string' && /^https?:\/\//.test(provider) ? provider : DEFAULT_PROVIDER
  const now = Date.now() / 1000
  const hit = cache.get(host)
  if (hit && now - hit[0] < (hit[1] ? TTL : FAIL_TTL)) return [hit[1], hit[2]]
  let [body, ctype] = await download(
    prov.replace('{host}', encodeURIComponent(host)).replace('{url}', encodeURIComponent(`https://${host}`)),
  )
  if (!body && own.has(host)) [body, ctype] = await download(`https://${host}/favicon.ico`)
  cache.set(host, [now, body, ctype])
  if (cache.size > MAX_KEEP) {
    const old = [...cache].sort((a, b) => a[1][0] - b[1][0]).slice(0, cache.size - MAX_KEEP)
    for (const [h] of old) cache.delete(h)
  }
  return [body, ctype]
}
