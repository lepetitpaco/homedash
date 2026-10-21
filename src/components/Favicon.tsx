import { useState } from 'react'
import { template } from '../lib/config'

type Props = {
  url: string
  name: string
  color: string
  enabled: boolean
  provider: string
}

function host(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

const isLocal = (h: string) =>
  !h ||
  h === 'localhost' ||
  h.startsWith('localhost-') ||
  h.endsWith('.local') ||
  /^\d+\.\d+\.\d+\.\d+$/.test(h)

/**
 * Favicon distante quand c'est possible, sinon monogramme coloré. Si le
 * service d'icônes ne répond pas au navigateur (bloqueur, proxy), homedash la
 * redemande lui-même (`api/favicon`, même service, mis en cache) avant de
 * renoncer.
 */
export default function Favicon({ url, name, color, enabled, provider }: Props) {
  // 0 : le service directement · 1 : relayé par homedash · 2 : monogramme
  const [attempt, setAttempt] = useState(0)
  const h = host(url)
  const remote = enabled && !!provider && attempt < 2 && !isLocal(h)

  if (remote) {
    return (
      <img
        className="favicon"
        src={
          attempt === 0
            ? template(provider, { host: encodeURIComponent(h), url: encodeURIComponent(url) })
            : `api/favicon?host=${encodeURIComponent(h)}`
        }
        alt=""
        loading="lazy"
        onError={() => setAttempt((a) => a + 1)}
      />
    )
  }

  return (
    <span className="favicon monogram" style={{ background: `${color}22`, color, borderColor: `${color}55` }}>
      {name.replace(/[^\p{L}\p{N}]/gu, '').charAt(0).toUpperCase() || '•'}
    </span>
  )
}
