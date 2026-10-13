import { useCallback, useEffect, useState } from 'react'

const COLLAPSE_KEY = 'homedash:collapsed'
const THEME_KEY = 'homedash:theme'

export type Theme = 'dark' | 'light'

/**
 * Préférences d'affichage propres au navigateur (localStorage) : thème et
 * catégories repliées. Ce sont des préférences, pas des données — elles n'ont
 * rien à faire dans config.json.
 */
export function usePrefs(configTheme: Theme | undefined) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => {
    try {
      setCollapsed(JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '{}') as Record<string, boolean>)
      const saved = localStorage.getItem(THEME_KEY)
      if (saved === 'light' || saved === 'dark') setTheme(saved)
    } catch {
      /* stockage indisponible */
    }
  }, [])

  // Le thème du config.json ne s'applique que si l'utilisateur n'a rien choisi.
  const effectiveTheme: Theme = theme ?? configTheme ?? 'dark'

  useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme
  }, [effectiveTheme])

  // Le pliage choisi dans le navigateur (localStorage) prime sur le `collapsed`
  // du config, qui ne sert que d'état initial.
  const toggleGroup = useCallback((name: string, current: boolean) => {
    setCollapsed((prev) => {
      const next = { ...prev, [name]: !current }
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const switchTheme = useCallback(() => {
    setTheme(() => {
      const next: Theme = effectiveTheme === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem(THEME_KEY, next)
      } catch {
        /* ignore */
      }
      return next
    })
  }, [effectiveTheme])

  return { collapsed, toggleGroup, effectiveTheme, switchTheme }
}
