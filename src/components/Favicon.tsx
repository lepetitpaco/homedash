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

/** Favicon distante quand c'est possible, sinon monogramme coloré. */
export default function Favicon({ url, name, color, enabled, provider }: Props) {
  const [failed, setFailed] = useState(false)
  const h = host(url)
  const remote = enabled && !!provider && !failed && !isLocal(h)

  if (remote) {
    return (
      <img
        className="favicon"
        src={template(provider, { host: encodeURIComponent(h), url: encodeURIComponent(url) })}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <span className="favicon monogram" style={{ background: `${color}22`, color, borderColor: `${color}55` }}>
      {name.replace(/[^\p{L}\p{N}]/gu, '').charAt(0).toUpperCase() || '•'}
    </span>
  )
}
