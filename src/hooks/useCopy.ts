import { useCallback, useState } from 'react'

/** Copie dans le presse-papier, et la clé de ce qui vient d'être copié (témoin ✓). */
export function useCopy() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const copy = useCallback(async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1400)
    } catch {
      /* presse-papier refusé (contexte non sécurisé) */
    }
  }, [])

  return { copiedKey, copy }
}
