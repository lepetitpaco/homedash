/** GUIDE.md (`GET /api/guide`), découpé en pages pour Réglages → Aide. */
import { useEffect, useState } from 'react'
import { guideParts, type GuidePart } from './markdown'

/** Lu une fois : le guide ne change qu'avec une nouvelle version du container. */
export function useGuide(): GuidePart[] | null {
  const [parts, setParts] = useState<GuidePart[] | null>(null)
  useEffect(() => {
    fetch('api/guide', { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<{ text: string }>) : { text: '' }))
      .then((d) => setParts(guideParts(d.text || '')))
      .catch(() => setParts([]))
  }, [])
  return parts
}
