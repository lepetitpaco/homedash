import { Offline } from './errors'
import type { Config } from '../types'

const ENDPOINT = 'api/config'

/** La config a changé sur le serveur depuis qu'on l'a chargée (409). */
export class ConfigConflict extends Error {}

/** config.json ne se relit plus (édité à la main) : où, et la sauvegarde qui le remplacerait. */
export class BrokenConfig extends Error {
  constructor(
    readonly line: number | null,
    readonly backup: { name: string; created: number } | null,
    readonly detail: string,
  ) {
    super('réglages illisibles')
  }
}

/**
 * Lit config.json et sa version. La version est renvoyée à l'écriture : le
 * serveur refuse d'écraser un fichier qui a changé entre-temps.
 *
 * `Offline` : le serveur ne répond pas, ou pas encore (container qui démarre :
 * la réponse n'est alors pas du JSON). C'est passager, la page réessaie seule.
 * `BrokenConfig` : le fichier lui-même est abîmé.
 */
export async function fetchConfig(): Promise<{ config: Config; version: string | null }> {
  let res: Response
  let text: string
  try {
    res = await fetch(`${ENDPOINT}?t=${Date.now()}`, { cache: 'no-store' })
    text = await res.text()
  } catch (e) {
    throw new Offline(String(e))
  }
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new Offline(`réponse non JSON (${res.status})`)
  }
  if (!res.ok) {
    const b = body as { error?: string; broken?: boolean; line?: number; backup?: BrokenConfig['backup']; detail?: string }
    if (b?.broken) throw new BrokenConfig(b.line ?? null, b.backup ?? null, b.detail ?? '')
    if (res.status >= 500) throw new Offline(b?.error ?? `HTTP ${res.status}`)
    throw new Error(b?.error ?? `HTTP ${res.status}`)
  }
  return { config: body as Config, version: res.headers.get('X-Config-Version') }
}

/** Remplace la config abîmée par la dernière sauvegarde valide (l'abîmée est gardée à côté). */
export async function repairConfig(): Promise<{ restored: string; created: number }> {
  const res = await fetch(`${ENDPOINT}/repair`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  const body = (await res.json().catch(() => ({}))) as { error?: string; restored?: string; created?: number }
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return { restored: body.restored ?? '', created: body.created ?? 0 }
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
