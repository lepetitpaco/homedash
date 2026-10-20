import type { Config } from '../types'

const ENDPOINT = 'api/config'

/** La config a changé sur le serveur depuis qu'on l'a chargée (409). */
export class ConfigConflict extends Error {}

/**
 * Lit config.json et sa version. La version est renvoyée à l'écriture : le
 * serveur refuse d'écraser un fichier qui a changé entre-temps.
 */
export async function fetchConfig(): Promise<{ config: Config; version: string | null }> {
  const res = await fetch(`${ENDPOINT}?t=${Date.now()}`, { cache: 'no-store' })
  const text = await res.text()
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      message = (JSON.parse(text) as { error?: string }).error ?? message
    } catch {
      /* réponse non JSON */
    }
    throw new Error(message)
  }
  return { config: JSON.parse(text) as Config, version: res.headers.get('X-Config-Version') }
}

/**
 * Écrit config.json côté serveur, sur la base de `version`. Renvoie la nouvelle
 * version. Lève `ConfigConflict` si le fichier a changé depuis, une erreur avec
 * le message du serveur sinon.
 */
export async function saveConfig(config: Config, version: string | null): Promise<string | null> {
  const res = await fetch(ENDPOINT, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(version !== null ? { 'X-Config-Version': version } : {}) },
    body: JSON.stringify(config),
  })
  if (res.status === 409) throw new ConfigConflict('config modifiée ailleurs')
  if (!res.ok) {
    const text = await res.text()
    let message = `HTTP ${res.status}`
    try {
      message = (JSON.parse(text) as { error?: string }).error ?? message
    } catch {
      /* réponse non JSON */
    }
    throw new Error(message)
  }
  return res.headers.get('X-Config-Version')
}
