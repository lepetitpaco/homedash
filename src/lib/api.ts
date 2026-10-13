import type { Config } from '../types'

const ENDPOINT = 'api/config'

export async function fetchConfig(): Promise<Config> {
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
  return JSON.parse(text) as Config
}

/** Écrit config.json côté serveur. Lève une erreur avec le message du serveur. */
export async function saveConfig(config: Config): Promise<void> {
  const res = await fetch(ENDPOINT, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
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
}
