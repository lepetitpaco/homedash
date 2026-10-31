import { useEffect, useState } from 'react'
import { desktop, hasTabMemory } from '../lib/desktop'
import { readMemory, type TabMemory } from '../lib/tabMemory'
import { usePageVisible } from '../lib/visible'

/** Relecture pendant que la page des réglages est ouverte. */
const POLL_MS = 5_000

/** Mémoire de l'appli et de ses sites ; null dans un navigateur ou une appli ancienne. */
export function useTabMemory(): TabMemory | null {
  const [memory, setMemory] = useState<TabMemory | null>(null)
  const visible = usePageVisible()
  useEffect(() => {
    if (!hasTabMemory || !visible) return
    const read = () => {
      void desktop?.tabMemory?.().then((raw) => {
        if (!raw) return
        const w = window as unknown as { __homedashTabs?: () => Record<string, { id: string }> }
        const names = w.__homedashTabs?.() ?? {}
        setMemory(readMemory(raw, (guest) => names[guest]?.id))
      })
    }
    read()
    const id = window.setInterval(read, POLL_MS)
    return () => window.clearInterval(id)
  }, [visible])
  return memory
}
