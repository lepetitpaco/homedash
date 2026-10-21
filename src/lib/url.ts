/**
 * Adresse tapée à la main → adresse complète : `notion.so` → `https://notion.so`,
 * `localhost:3000` → `http://localhost:3000`. Sans schéma, le navigateur la
 * prendrait pour un chemin de homedash (lien cassé, pas de favicon). Une
 * adresse qui a déjà son schéma, un chemin (`/…`, `~/…`) ou un vide restent
 * tels quels. Même règle côté serveur : `accounts._full_url()`.
 */
export function withScheme(url: string): string {
  const u = url.trim()
  if (!u || /^[a-z][a-z0-9+.-]*:\/\//i.test(u) || /^(mailto|tel|file|data|javascript):/i.test(u) || /^[/~.]/.test(u))
    return u
  const host = u.split(/[/?#]/)[0].replace(/:\d+$/, '').toLowerCase()
  const local = host === 'localhost' || host.endsWith('.localhost') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
  return `${local ? 'http' : 'https'}://${u}`
}
