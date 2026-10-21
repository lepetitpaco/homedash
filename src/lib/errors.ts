/**
 * Erreurs montrées à l'utilisateur : en français courant, jamais un nom de
 * fichier, un code HTTP ou un message de bibliothèque. Le détail technique
 * part au journal d'erreurs (Réglages → Aide → Journal d'erreurs), avec ce qui
 * a été affiché : de quoi comprendre une issue sans redemander.
 */

/** Le serveur n'a pas répondu (container arrêté ou en train de redémarrer). */
export class Offline extends Error {}

const technical = (e: unknown) => (e instanceof Error ? e.message : String(e ?? ''))

/** Messages du serveur ou du navigateur → ce qu'on dit à l'utilisateur. */
const RULES: [RegExp, string][] = [
  [/failed to fetch|networkerror|load failed|network request failed|ECONNREFUSED/i, 'homedash ne répond pas. Docker Desktop est-il lancé ?'],
  [/modifiée ailleurs|409/i, 'Modifié ailleurs entre-temps (autre fenêtre) : recharge la page puis refais ta modification.'],
  [/hôte non autorisé|origine non autorisée|intersite|Content-Type/i, 'Action refusée par sécurité. Recharge la page puis réessaie.'],
  [/jeton|token|401|bad credentials/i, 'La connexion a été refusée : le jeton est peut-être expiré ou révoqué. Reconnecte-toi dans Réglages.'],
  [/rate limit|403/i, 'GitHub limite les appels pour le moment. Réessaie dans quelques minutes.'],
  [/illisible|JSON|Unexpected token|Expecting/i, 'Une réponse illisible est arrivée. Recharge la page.'],
  [/timed? ?out|délai/i, "Le service met trop de temps à répondre. Réessaie dans un instant."],
  [/HTTP 5\d\d|500|502|503|504/i, 'homedash a rencontré un problème. Réessaie ; si ça continue, le journal d’erreurs en dit plus.'],
  [/\b4\d\d\b|introuvable|not found/i, "Cette action n'a pas abouti. Réessaie, ou recharge la page."],
]

/** Un texte déjà lisible (pas de jargon) passe tel quel ; sinon une phrase simple. */
export function humanize(e: unknown): string {
  if (e instanceof Offline) return 'homedash ne répond pas. Docker Desktop est-il lancé ?'
  const raw = technical(e).trim()
  for (const [re, text] of RULES) if (re.test(raw)) return text
  const jargon = /\.(json|py|ts|js)\b|\bdata\/|\b[A-Z][a-z]+Error\b|\bat \w+ \(|\[\d+\]|undefined|null|stack/i
  return raw && !jargon.test(raw) && raw.length < 160 ? raw : 'Quelque chose a raté. Réessaie ; le journal d’erreurs en dit plus.'
}

const sent = new Map<string, number>()

/** Au journal du serveur (sans attendre, sans boucler : une fois par minute et par message). */
export function report(where: string, e: unknown, shown?: string) {
  const detail = e instanceof Error ? `${e.name}: ${e.message}` : technical(e)
  const key = `${where}|${detail}`
  if (Date.now() - (sent.get(key) ?? 0) < 60_000) return
  sent.set(key, Date.now())
  void fetch('api/errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ where, shown: shown ?? humanize(e), detail: detail.slice(0, 600) }),
  }).catch(() => undefined)
}

/** humanize + report : le message à afficher, l'erreur notée au passage. */
export function shown(where: string, e: unknown): string {
  const text = humanize(e)
  report(where, e, text)
  return text
}

/** Avertissements du navigateur sans conséquence : pas au journal. */
const HARMLESS = /ResizeObserver loop/i

/** Plantages non rattrapés de la page : notés, sans rien afficher de plus. */
export function watchCrashes() {
  window.addEventListener('error', (ev) => {
    if (!HARMLESS.test(String(ev.message))) report('page', ev.error ?? ev.message)
  })
  window.addEventListener('unhandledrejection', (ev) => report('page (promesse)', ev.reason))
}
