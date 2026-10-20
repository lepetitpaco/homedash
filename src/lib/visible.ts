import { useEffect, useState } from 'react'

/**
 * La page est-elle visible ? Onglet du navigateur en arrière-plan, fenêtre de
 * l'appli cachée ou réduite : non. Les sondages s'en servent pour s'arrêter
 * (ou ralentir) quand personne ne regarde, et repartir au retour.
 */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => !document.hidden)
  useEffect(() => {
    const on = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return visible
}

/**
 * `next` si son contenu diffère de `prev`, sinon `prev` (même objet) : un
 * sondage qui rapporte la même chose ne redessine pas toute la page.
 */
export function sameOr<T>(prev: T | null, next: T, cache: { current: string }): T {
  const text = JSON.stringify(next)
  if (prev !== null && text === cache.current) return prev
  cache.current = text
  return next
}
