/**
 * Notes stockées côté serveur (data/notes.json).
 *
 * Elles vivaient dans le localStorage : invisibles d'un navigateur à l'autre, et
 * perdues avec le profil. `migrate()` récupère une fois l'ancien contenu local.
 */
const LEGACY_NOTES_KEY = 'homedash:notes'
const LEGACY_SCRATCH_KEY = 'homedash:scratch'
const ENDPOINT = 'api/notes'

export type Note = {
  id: string
  text: string
  created: number
  updated: number
}

export function newNote(text = ''): Note {
  const now = Date.now()
  return {
    id: `n${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    text,
    created: now,
    updated: now,
  }
}

/** Titre affiché dans la liste : première ligne non vide. */
export function noteTitle(text: string): string {
  const line = text.split('\n').find((l) => l.trim().length > 0)
  return line ? line.trim().slice(0, 80) : 'Note vide'
}

/** Aperçu : la suite du contenu, aplatie sur une ligne. */
export function notePreview(text: string): string {
  const lines = text.split('\n')
  const firstIndex = lines.findIndex((l) => l.trim().length > 0)
  return lines
    .slice(firstIndex + 1)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90)
}

function sanitize(parsed: unknown): Note[] {
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter((n): n is Partial<Note> => !!n && typeof (n as Note).text === 'string')
    .map((n) => ({
      id: typeof n.id === 'string' ? n.id : newNote().id,
      text: n.text ?? '',
      created: typeof n.created === 'number' ? n.created : Date.now(),
      updated: typeof n.updated === 'number' ? n.updated : (n.created ?? Date.now()),
    }))
}

/** Reprend les notes du localStorage (v1/v2) puis vide la clé locale. */
function localLegacy(): Note[] {
  try {
    const raw = localStorage.getItem(LEGACY_NOTES_KEY)
    const scratch = localStorage.getItem(LEGACY_SCRATCH_KEY)
    const notes = raw ? sanitize(JSON.parse(raw)) : []
    const all = scratch?.trim() ? [newNote(scratch), ...notes] : notes
    return all
  } catch {
    return []
  }
}

function dropLegacy() {
  try {
    localStorage.removeItem(LEGACY_NOTES_KEY)
    localStorage.removeItem(LEGACY_SCRATCH_KEY)
  } catch {
    /* stockage indisponible */
  }
}

export async function loadNotes(): Promise<Note[]> {
  let server: Note[] = []
  try {
    const res = await fetch(`${ENDPOINT}?t=${Date.now()}`, { cache: 'no-store' })
    if (res.ok) server = sanitize(await res.json())
  } catch {
    /* serveur injoignable : on retombe sur le local */
  }
  const legacy = localLegacy()
  if (legacy.length === 0) return server
  // migration : le serveur gagne en cas de doublon d'id
  const known = new Set(server.map((n) => n.id))
  const merged = [...server, ...legacy.filter((n) => !known.has(n.id))]
  if (merged.length > server.length) {
    await saveNotes(merged)
    dropLegacy()
  }
  return merged
}

export async function saveNotes(notes: Note[]): Promise<void> {
  try {
    await fetch(ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(notes),
    })
  } catch {
    /* hors ligne : la prochaine écriture réessaiera */
  }
}
