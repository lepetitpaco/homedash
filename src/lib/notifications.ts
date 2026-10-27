/**
 * Notifications système : le RENDU du journal d'événements, rien de plus.
 *
 * Le diff — quelles transitions méritent d'être signalées — appartient
 * désormais au backend (`server/events.ts` et ses appelants). Ce module ne
 * décide plus de rien : il reçoit des événements déjà qualifiés et les affiche.
 * Tant que les deux vivaient séparément, la cloche et la page pouvaient raconter
 * deux histoires différentes du même cycle.
 *
 * Ce qui reste ici, et qui est bien une affaire de rendu :
 *  · un `tag` par événement → le navigateur remplace au lieu d'empiler, donc pas
 *    de doublon quand deux onglets homedash sont ouverts ;
 *  · au-delà de GROUP_MIN événements de même nature dans un lot, une seule
 *    notification groupée (une release base-site ouvre 8 PRs d'un coup) ;
 *  · les non-lus dans le titre et l'icône de l'onglet, qui ne dépendent pas des
 *    notifications système (en sourdine par défaut).
 */
import type { HdEvent, InApp } from './events'
import { shown } from './errors'

// Sourdine par défaut : la cloche de la barre du haut est le canal principal, une
// notification système ne part que si on l'a activée explicitement. Clé
// renommée (ex-`homedash:notif`) pour que tout le monde reparte en sourdine.
const MUTE_KEY = 'homedash:notif-v2'

function optedIn(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === 'on'
  } catch {
    return false
  }
}
const GROUP_MIN = 3

// L'API Notification n'existe qu'en contexte sécurisé : en http://<ip>:7777 depuis
// une autre machine elle est absente, on le signale au lieu de planter.
export const NOTIF_OK = typeof Notification !== 'undefined' && window.isSecureContext

export type NotifState = 'unsupported' | 'insecure' | 'default' | 'denied' | 'muted' | 'on'

export function notifState(): NotifState {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (!window.isSecureContext) return 'insecure'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission === 'default') return 'default'
  return optedIn() ? 'on' : 'muted'
}

function enabled(): boolean {
  return notifState() === 'on'
}

function send(title: string, body: string, tag: string, url?: string, sticky?: boolean,
              act?: () => void) {
  if (!enabled()) return
  try {
    // requireInteraction : reste à l'écran jusqu'au clic (Chrome/Edge ; Firefox
    // l'ignore, là c'est le réglage macOS « Alertes » qui décide).
    const n = new Notification(title, { body, tag, requireInteraction: !!sticky })
    n.onclick = () => {
      window.focus()
      // `act` ramène dans l'application (onglet Local) ; `url` part vers GitHub.
      if (act) act()
      else if (url) window.open(url, '_blank', 'noopener')
      n.close()
    }
  } catch {
    /* le navigateur peut refuser (quota, contexte) */
  }
}

/** Bascule : demande la permission, puis alterne actif / sourdine. */
export async function toggleNotifications(): Promise<NotifState> {
  const state = notifState()
  if (state === 'unsupported' || state === 'insecure' || state === 'denied') return state
  if (state === 'default') {
    const res = await Notification.requestPermission()
    if (res === 'granted') {
      localStorage.setItem(MUTE_KEY, 'on')
      testNotification()
    }
    return notifState()
  }
  localStorage.setItem(MUTE_KEY, state === 'muted' ? 'on' : 'off')
  if (state === 'muted') testNotification()
  return notifState()
}

/**
 * Test diagnostiqué : « je ne vois rien » ne dit pas si le navigateur a refusé ou
 * si c'est l'OS qui avale la notification. `onshow` tranche — s'il se déclenche,
 * le navigateur l'a bien affichée et le problème est côté réglages système.
 */
export function testNotification(report?: (line: string) => void): void {
  const say = report ?? (() => undefined)
  const state = notifState()
  if (state !== 'on') {
    say(`✗ impossible : ${state}`)
    return
  }
  try {
    const n = new Notification('🔔 Test homedash', {
      body: "Si tu vois ceci, tout fonctionne. Sinon c'est macOS qui la retient.",
      tag: 'hd-test',
    })
    say('notification créée, en attente de confirmation du navigateur…')
    n.onshow = () => say('✓ affichée par le navigateur — si tu ne la vois pas, va voir macOS')
    n.onerror = () => say('✗ le navigateur a refusé de l’afficher')
    n.onclick = () => {
      say('✓ tu as cliqué la notification : la chaîne complète fonctionne')
      window.focus()
      n.close()
    }
    // `onshow` n'est pas garanti partout : au bout de 2 s sans signal, on le dit
    // plutôt que de laisser le message en attente.
    window.setTimeout(
      () =>
        say(
          '⏱ aucune confirmation du navigateur en 2 s — onshow non implémenté ici, ' +
            'vérifie directement macOS',
        ),
      2000,
    )
  } catch (e) {
    say(`✗ ${shown('notifications', e)}`)
  }
}

// ── Non-lus dans l'onglet du navigateur ───────────────────────────────────────
// Titre « (3) GitHub · homedash » et pastille rouge sur l'icône : visible depuis
// n'importe quel autre onglet, sans dépendre des notifications système. Même
// compteur que la cloche — les deux s'effacent quand on ouvre le panneau.
let baseTitle = ''
let unread = 0
let baseIcon: string | null = null

function render() {
  if (baseTitle) document.title = unread > 0 ? `(${unread}) ${baseTitle}` : baseTitle
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) return
  if (baseIcon === null) baseIcon = link.href
  link.href = unread > 0 ? badgeIcon(unread) : baseIcon
}

function badgeIcon(n: number): string {
  const label = n > 9 ? '9+' : String(n)
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>` +
    `<text y='.9em' font-size='90'>⚡</text>` +
    `<circle cx='70' cy='30' r='30' fill='#ef4444'/>` +
    `<text x='70' y='42' font-size='${label.length > 1 ? 30 : 38}' font-family='sans-serif' ` +
    `font-weight='700' fill='#fff' text-anchor='middle'>${label}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export function initTitleCounter(title: string) {
  baseTitle = title
  render()
}

export function setUnread(n: number) {
  if (n === unread) return
  unread = n
  render()
}

// ── Rendu d'un lot d'événements ───────────────────────────────────────────────
/** Titres groupés, par nature. Un `kind` inconnu retombe sur un décompte nu. */
const GROUP_TITLE: Record<string, (n: number) => [string, string]> = {
  'pr-fail': (n) => [`✗ CI fail sur ${n} de mes PRs`, ''],
  'pr-pass': (n) => [`✓ CI verte sur ${n} de mes PRs`, ''],
  'pr-merged': (n) => [`🎉 ${n} de mes PRs sont mergées`, ''],
  'branch-merged': (n) => [`🌿 ${n} de mes branches sont mergées`, ''],
  'ren-new': (n) => [`🤖 ${n} PRs Renovate disponibles`, ''],
  'ren-fail': (n) => [`🤖 CI fail sur ${n} PRs Renovate`, ''],
  'rm-new': (n) => [`✅ ${n} PRs Renovate mergées`, ''],
  'rm-pass': (n) => [`🟢 ${n} projets validés`, 'CI verte : tu peux merger les autres.'],
  'rm-fail': (n) => [`⛔ ${n} projets KO après merge`, 'Ne pas propager.'],
  'bc-report': (n) => [`📤 ${n} rapports prêts à publier sur Basecamp`, ''],
  'tr-report': (n) => [`📤 ${n} rapports prêts à publier sur Trello`, ''],
  'local-cleanup': (n) => [
    `🧹 ${n} branches locales sont mergées`,
    'Leurs copies locales ne servent plus à rien.',
  ],
}

function groupTitle(kind: string, n: number): [string, string] {
  return GROUP_TITLE[kind]?.(n) ?? [`${n} événements`, '']
}

/**
 * Affiche un lot d'événements fraîchement apparus dans le journal.
 *
 * `inApp` ramène dans homedash les événements qui n'ont rien d'utile dehors :
 * ménage local (l'onglet Local et ses commandes à copier), rapport prêt (la vue
 * Issues de Basecamp, d'où on le publie).
 */
export function notifyEvents(list: HdEvent[], inApp?: InApp): void {
  const groups = new Map<string, HdEvent[]>()
  for (const e of list) groups.set(e.kind, [...(groups.get(e.kind) ?? []), e])

  for (const [kind, items] of groups) {
    const target = (e: HdEvent) => inApp?.(e)
    if (items.length < GROUP_MIN) {
      for (const e of items) send(e.title, e.body, e.tag, e.url, e.sticky, target(e))
      continue
    }
    const [title, body] = groupTitle(kind, items.length)
    const repos = [...new Set(items.map((e) => e.repo).filter(Boolean))].join(', ')
    send(
      title,
      body ? `${body} ${repos}` : repos,
      `grp:${kind}`,
      items[0].url,
      items.some((e) => e.sticky),
      target(items[0]),
    )
  }
}
