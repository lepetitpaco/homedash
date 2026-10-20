/**
 * Pages visitées dans les onglets perso (appli de bureau), pour la recherche :
 * comme l'historique d'un navigateur. Dans ce navigateur seulement
 * (localStorage), jamais dans la config ni envoyé au serveur.
 */
const KEY = 'homedash:visits'
const MAX = 400

export type Visit = {
  /** Adresse sans le `#…` : une messagerie en change à chaque clic. */
  url: string
  title: string
  /** Nom de l'onglet où la page a été vue. */
  tab: string
  /** Nombre de visites. */
  n: number
  ts: number
}

let cache: Visit[] | null = null

export function visits(): Visit[] {
  if (cache) return cache
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    cache = Array.isArray(raw) ? raw.filter((v) => v && typeof v.url === 'string') : []
  } catch {
    cache = []
  }
  return cache
}

let timer: ReturnType<typeof setTimeout> | undefined
function save() {
  // Un site peut changer de titre ou d'adresse plusieurs fois par seconde.
  clearTimeout(timer)
  timer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(visits()))
    } catch {
      /* stockage indisponible ou plein */
    }
  }, 1000)
}

/** Une page vue (`title` absent : on garde l'ancien) ; nouvelle visite si elle change. */
export function recordVisit(url: string, tab: string, title?: string) {
  if (!/^https?:/i.test(url)) return
  const clean = url.split('#')[0]
  const list = visits()
  const i = list.findIndex((v) => v.url === clean)
  const prev = i >= 0 ? list[i] : null
  // Simple mise à jour du titre : pas une visite de plus.
  const again = !prev || title === undefined
  const next: Visit = {
    url: clean,
    tab,
    // « (3) Boîte de réception » : le compteur de non-lus n'est pas le titre
    title: title?.replace(/^\(\d+\+?\)\s*/, '').trim() || prev?.title || '',
    n: (prev?.n ?? 0) + (again ? 1 : 0),
    ts: Date.now(),
  }
  if (prev && prev.title === next.title && !again) return
  cache = [next, ...list.filter((_, j) => j !== i)].slice(0, MAX)
  save()
}

export function clearVisits() {
  cache = []
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* stockage indisponible */
  }
}

/** Raccourcis de recherche : `gh homedash`, `yt lofi`… Le premier mot choisit le site. */
export const ENGINES: { key: string; name: string; icon: string; url: string }[] = [
  { key: 'g', name: 'Google', icon: '🔎', url: 'https://www.google.com/search?q=' },
  { key: 'gh', name: 'GitHub', icon: '🐙', url: 'https://github.com/search?type=repositories&q=' },
  { key: 'yt', name: 'YouTube', icon: '▶️', url: 'https://www.youtube.com/results?search_query=' },
  { key: 'w', name: 'Wikipédia', icon: '📚', url: 'https://fr.wikipedia.org/w/index.php?search=' },
  { key: 'maps', name: 'Google Maps', icon: '🗺', url: 'https://www.google.com/maps/search/' },
  { key: 'tr', name: 'Google Traduction', icon: '🌐', url: 'https://translate.google.com/?sl=auto&tl=fr&text=' },
  { key: 'mdn', name: 'MDN', icon: '📘', url: 'https://developer.mozilla.org/fr/search?q=' },
]

/** `exemple.com/x`, `localhost:3000`, `https://…` → l'adresse à ouvrir ; sinon null. */
export function asUrl(q: string): string | null {
  const s = q.trim()
  if (!s || /\s/.test(s)) return null
  if (/^https?:\/\/\S+$/i.test(s)) return s
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/\S*)?$/i.test(s)) return `http://${s}`
  // un nom de domaine : au moins un point, une extension en lettres
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}(:\d+)?(\/\S*)?$/i.test(s)) return `https://${s}`
  return null
}
