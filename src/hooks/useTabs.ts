import { useCallback, useEffect, useRef, useState } from 'react'
import type { TabId } from '../components/Tabs'
import { initTitleCounter } from '../lib/notifications'

const TAB_KEY = 'homedash:tab'

/** Onglet ouvert, mémorisé d'une visite à l'autre, et titre de l'onglet du navigateur. */
export function useTabs(title: string | undefined) {
  const [tab, setTab] = useState<TabId>('links')

  useEffect(() => {
    try {
      const savedTab = localStorage.getItem(TAB_KEY)
      if (
        savedTab === 'links' ||
        savedTab === 'github' ||
        savedTab === 'local' ||
        savedTab === 'settings'
      )
        setTab(savedTab)
    } catch {
      /* stockage indisponible */
    }
  }, [])

  // Onglet d'où l'on vient, pour que « fermer » l'historique y ramène :
  // l'historique n'a plus d'onglet à lui dans la barre.
  const backTab = useRef<TabId>('links')
  const tabNow = useRef(tab)
  tabNow.current = tab
  const selectTab = useCallback((id: TabId) => {
    if (tabNow.current !== 'events') backTab.current = tabNow.current
    setTab(id)
    // L'historique ne se rouvre pas au rechargement : il n'a pas d'onglet.
    if (id === 'events') return
    try {
      localStorage.setItem(TAB_KEY, id)
    } catch {
      /* stockage indisponible */
    }
  }, [])

  const goBack = useCallback(() => selectTab(backTab.current), [selectTab])

  // Le titre de l'onglet nomme la page ouverte : « GitHub · homedash » plutôt
  // qu'un « homedash » indifférencié dans la barre d'onglets et l'historique.
  useEffect(() => {
    if (!title) return
    const label = {
      links: 'Raccourcis',
      github: 'GitHub',
      events: 'Activité',
      local: 'Local',
      settings: 'Réglages',
    }[tab]
    initTitleCounter(`${label} · ${title}`)
  }, [title, tab])

  return { tab, selectTab, goBack }
}
