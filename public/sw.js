/* homedash — service worker.
 *
 * But : rendre la page installable (PWA) et l'ouvrir même serveur arrêté, sans
 * jamais servir de données périmées.
 *   · /api/*      → jamais touché : les données sont toujours celles du serveur ;
 *   · /assets/*   → cache d'abord (noms hachés par Vite : un fichier = une version) ;
 *   · le reste    → réseau d'abord, cache en secours (la page, le manifest, les icônes).
 * Une nouvelle version déployée est donc servie dès qu'elle est en ligne.
 */
const CACHE = 'homedash-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) return

  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
    return
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone()
          // toutes les navigations partagent une seule entrée : la page
          caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? './' : req, copy))
        }
        return res
      })
      .catch(() => caches.match(req.mode === 'navigate' ? './' : req).then((hit) => hit || Response.error())),
  )
})
