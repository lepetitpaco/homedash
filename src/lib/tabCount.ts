/**
 * Non-lus des onglets perso (appli de bureau) : d'où vient le nombre, et
 * quand le croire. Rien ici ne touche à la webview ni à la page : la logique
 * se simule seule (CustomTabView ne fait que brancher les événements).
 */

/**
 * Non-lus d'un site d'après le titre de sa page : « Boîte de réception (3) »,
 * « (12) WhatsApp », « Chat (2) »… La convention de presque tous les sites qui
 * comptent quelque chose ; 0 si le titre n'en porte pas.
 */
export function countInTitle(title: string): number {
  const m = /\((\d{1,4})\+?\)/.exec(title)
  return m ? Number(m[1]) : 0
}

/**
 * Sites dont le titre ne compte rien : les non-lus sont lus dans la page même
 * (`executeJavaScript` de la webview, lecture seule, rien d'exposé au site).
 * Google Chat : titre « Chat » ou nom du salon ouvert ; le total est sur le
 * raccourci Accueil (« Raccourci vers Accueil, 2 messages non lus », sans
 * nombre à 0), et l'icône prend un point (`…_dot_…`, `…_no_dot_…` sans
 * non-lu) : compté 1 si le raccourci est introuvable.
 */
const PAGE_COUNTERS: { host: string; code: string }[] = [
  {
    host: 'chat.google.com',
    code: `(() => {
      for (const e of document.querySelectorAll('[aria-label^="Raccourci"], [aria-label^="Shortcut"]')) {
        const m = /^(?:Raccourci vers Accueil|Shortcut to Home)\\D*(\\d+)/i.exec(e.getAttribute('aria-label') || '')
        if (m) return Number(m[1])
      }
      return [...document.querySelectorAll('link[rel*="icon"]')].some((l) => /_dot_/.test(l.href) && !/_no_dot_/.test(l.href)) ? 1 : 0
    })()`,
  },
  {
    // Telegram Web (K et A) : titre fixe « Telegram Web ». Le premier dossier
    // (« All 1 ») donne le total des conversations non lues ; sans dossiers, on
    // compte les conversations non lues hors sourdine (`is-muted` sur la ligne).
    // Sélecteurs à surveiller : Telegram les change sans prévenir (issue #1).
    host: 'web.telegram.org',
    code: `(() => {
      const n = (e) => parseInt((e.textContent || '').replace(/\\D/g, ''), 10) || 0
      const folder = document.querySelector('.menu-horizontal-div-item .badge, #folders-tabs .badge, .ChatFolders .Tab .badge')
      if (folder) return n(folder)
      // comme Telegram : une conversation non lue = 1, celles en sourdine exclues
      const unread = new Set()
      for (const e of document.querySelectorAll(
        '.chatlist-chat:not(.is-muted) .dialog-subtitle-badge-unread.is-visible, .Chat:not(.muted) .ChatBadge.unread',
      ))
        unread.add(e.closest('[data-peer-id], .chatlist-chat, .Chat'))
      if (unread.size) return unread.size
      const m = /\\((\\d+)\\)/.exec(document.title)
      return m ? Number(m[1]) : 0
    })()`,
  },
]

/** Code qui lit les non-lus dans la page de ce site, s'il en faut un. */
export function pageCounter(url: string): string | undefined {
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    return undefined
  }
  return PAGE_COUNTERS.find((c) => host === c.host || host.endsWith('.' + c.host))?.code
}

/**
 * Notifications coupées pour un onglet (`notify: false`) : la page du site ne
 * peut plus en créer, ni elle-même ni en passant par son service worker.
 * Exécuté dans la page à chaque chargement. Une notification que le service
 * worker affiche seul (push reçu page fermée) passe encore : seule la coquille
 * de l'appli (permissions de la session) pourrait l'arrêter.
 */
export const MUTE_SITE_NOTIFICATIONS = `(() => {
  const Off = function () { return { close() {}, addEventListener() {}, removeEventListener() {} } }
  Off.permission = 'denied'
  Off.requestPermission = () => Promise.resolve('denied')
  try { Object.defineProperty(window, 'Notification', { value: Off, configurable: true, writable: true }) } catch {}
  if (window.ServiceWorkerRegistration)
    ServiceWorkerRegistration.prototype.showNotification = () => Promise.resolve()
  return true
})()`

/** « Tout actualiser » (barre du haut) : chaque site chargé relit ses non-lus. */
export const RECOUNT_TABS = 'homedash:recount-tabs'

/** Délai avant de croire un « 0 non-lu » après un chargement (onglet caché seulement). */
export const SETTLE_MS = 20_000

/**
 * Ce qu'un onglet remonte (`emit`). Le site compte par son titre, ou par sa
 * page s'il a un `pageCounter` (alors son titre est ignoré : un nom de salon
 * « (2) » ne doit rien compter).
 *
 * Pendant un chargement, le titre n'a pas encore son compteur (« Gmail ») :
 * onglet caché, un 0 n'est remonté qu'après `SETTLE_MS`, sinon la pastille
 * gardée (App, localStorage) clignoterait à chaque démarrage ou réveil. Un
 * nombre passe toujours aussitôt, et tout passe aussitôt dans l'onglet affiché :
 * c'est là qu'on lit ses messages.
 *
 * `loading()` = chargement de la page elle-même, pas de ses cadres (Gmail en
 * charge sans cesse : le 0 n'arriverait jamais).
 */
export function tabCounter({
  emit,
  hidden,
  byPage,
  settleMs = SETTLE_MS,
}: {
  emit: (n: number) => void
  hidden: () => boolean
  byPage: boolean
  settleMs?: number
}) {
  let titleCount = 0
  let pageCount = 0
  let settled = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const report = () => {
    const n = byPage ? pageCount : titleCount
    if (n || settled || !hidden()) emit(n)
  }
  const loading = () => {
    settled = false
    clearTimeout(timer)
    timer = setTimeout(() => {
      settled = true
      report()
    }, settleMs)
  }
  loading()
  return {
    title: (title: string) => {
      titleCount = countInTitle(title)
      report()
    },
    page: (n: unknown) => {
      pageCount = typeof n === 'number' && n > 0 ? Math.floor(n) : 0
      report()
    },
    loading,
    /** L'onglet s'affiche : un 0 retenu passe. */
    report,
    stop: () => clearTimeout(timer),
  }
}
