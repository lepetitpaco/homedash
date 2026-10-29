/**
 * Appels de la page Réglages : connexion GitHub, listes du compte, dossiers
 * locaux, sauvegardes. Tout ce qui est immédiat (jeton, restauration) passe ici ;
 * ce qui se range dans config.json passe par le brouillon et « Enregistrer ».
 */

export type Auth = {
  ok: boolean
  source: 'ui' | 'env' | null
  login?: string
  name?: string | null
  avatar?: string | null
  scopes?: string | null
  error?: string | null
}

/** `label` : nom affiché à la place du login (pseudo-compte « Partagés avec toi »). */
export type Owner = { login: string; type: string; avatar?: string | null; label?: string }

/** Repos d'autres comptes perso où l'on est collaborateur (backend : `github.SHARED`). */
export const SHARED_OWNER = '@partages'

export type GhRepo = {
  name: string
  full_name: string
  owner: string
  private: boolean
  archived: boolean
  pushed_at: string | null
  description: string | null
}

export type Member = { login: string; avatar?: string | null; name?: string | null }

export type BrowseDir = { name: string; path: string; git: boolean }
export type Browse = {
  path: string
  parent: string | null
  dirs: BrowseDir[]
  /** Seulement avec `browse(path, true)`. */
  files?: { name: string; path: string }[]
  repos: { count: number; partial: boolean }
  /** Points de départ (dossier personnel, disque) ; absent avec `files`. */
  starts?: { label: string; path: string }[]
  error?: string
}

export type RootStatus = { as: string; ok: boolean }

export type BackupEntry = { name: string; size: number; created: number; reason: string }

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init })
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    /* réponse non JSON */
  }
  if (!res.ok) {
    throw new Error((body as { error?: string } | null)?.error ?? `HTTP ${res.status}`)
  }
  return body as T
}

const json = (method: string, payload: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
})

/** `?account=…` — chaque appel GitHub vise un compte précis. */
const acc = (account: string, sep = '?') => (account ? `${sep}account=${encodeURIComponent(account)}` : '')

export type AccountInfo = {
  id: string
  label: string
  login: string | null
  avatar: string | null
  ok: boolean
  source: 'ui' | 'env' | null
  enabled: boolean
}

export const listAccounts = () =>
  call<{ accounts: AccountInfo[] }>('api/github/accounts').then((r) => r.accounts)
export const addAccount = (label: string) => call<{ id: string }>('api/github/accounts', json('POST', { label }))
export const removeAccount = (id: string) =>
  call<{ ok: boolean }>(`api/github/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' })

export const getAuth = (account: string, fresh = false) =>
  call<Auth>(`api/github/auth${acc(account)}${fresh ? `${account ? '&' : '?'}fresh=1` : ''}`)
export const connect = (account: string, token: string) =>
  call<Auth>('api/github/token', json('PUT', { token, account }))
export const disconnect = (account: string) =>
  call<Auth>(`api/github/token${acc(account)}`, { method: 'DELETE' })

export const getOwners = (account: string) =>
  call<{ owners: Owner[] }>(`api/github/owners${acc(account)}`).then((r) => r.owners)

export async function getRepos(owner: string, account = ''): Promise<GhRepo[]> {
  const r = await call<{ repos?: GhRepo[]; error?: string }>(
    `api/github/repos/${encodeURIComponent(owner)}${acc(account)}`,
  )
  if (r.error) throw new Error(r.error)
  return r.repos ?? []
}

export async function getMembers(org: string, account = ''): Promise<Member[]> {
  const r = await call<{ members?: Member[]; error?: string }>(
    `api/github/members/${encodeURIComponent(org)}${acc(account)}`,
  )
  if (r.error) throw new Error(r.error)
  return r.members ?? []
}

export const lookupUser = (login: string, account = '') =>
  call<Member>(`api/github/users/${encodeURIComponent(login)}${acc(account)}`)

export const browse = (path: string, files = false) =>
  call<Browse>(`api/local/browse?path=${encodeURIComponent(path)}${files ? '&files=1' : ''}`)
export const getRoots = () => call<{ roots: RootStatus[]; home: string }>('api/local/roots')

export const listBackups = () => call<{ backups: BackupEntry[] }>('api/backups').then((r) => r.backups)
export const createBackup = () => call<{ name: string }>('api/backups', { method: 'POST' })
export const deleteBackup = (name: string) => call<{ ok: boolean }>(`api/backups/${name}`, { method: 'DELETE' })
export const restoreBackup = (name: string) =>
  call<{ before: string }>(`api/backups/${name}/restore`, { method: 'POST' })
export const restoreFile = (data: unknown) => call<{ before: string }>('api/backup/restore', json('POST', data))

/** Ce que contient un export complet, sans aucun secret (aperçu avant import). */
export type FullSummary = {
  created: number
  version: string
  title: string
  links: number
  tabs: number
  github_accounts: number
  github_tokens: number
  basecamp: boolean
  notes: number
  cookies: number
  cookie_sites: number
  sessions: number
}

/** Export complet (#61) : fichier chiffré par mot de passe, jetons et connexions des sites compris. */
export async function fullExport(password: string, cookies: unknown): Promise<Blob> {
  const res = await fetch('api/export/full', json('POST', { password, cookies }))
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `HTTP ${res.status}`)
  return res.blob()
}
export const fullPreview = (file: string, password: string) => call<FullSummary>('api/import/preview', json('POST', { file, password }))
export const fullImport = (file: string, password: string, include: { settings: boolean; secrets: boolean; cookies: boolean }) =>
  call<{ ok: boolean; before: string; cookies: Record<string, unknown[]> }>('api/import/apply', json('POST', { file, password, include }))
