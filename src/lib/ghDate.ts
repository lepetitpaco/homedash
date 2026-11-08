/**
 * Dates des cartes GitHub (branches, PRs, Renovate), issue #140. GitHub les donne en ISO UTC
 * (`2026-11-05T14:12:00Z`) : on les montre en heure locale et courtes, la date complète en bulle.
 */

const pad = (n: number) => String(n).padStart(2, '0')
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

/** « 14:12 » aujourd'hui, « hier 14:12 », « 5 nov. 14:12 », « 5 nov. 2025 » une autre année. Vide si illisible. */
export function ghDate(iso: string | null | undefined, now = new Date()): string {
  const d = iso ? new Date(iso) : null
  if (!d || Number.isNaN(d.getTime())) return ''
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (sameDay(d, now)) return time
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (sameDay(d, yesterday)) return `hier ${time}`
  const day = `${d.getDate()} ${MONTHS[d.getMonth()]}`
  return d.getFullYear() === now.getFullYear() ? `${day} ${time}` : `${day} ${d.getFullYear()}`
}

/** La date complète, pour la bulle : « jeudi 5 novembre 2026 à 14:12 ». */
export function ghDateFull(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null
  if (!d || Number.isNaN(d.getTime())) return ''
  const day = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return `${day} à ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
