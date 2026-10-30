import { useCallback, useEffect, useRef, useState } from 'react'
import type { TabId } from '../components/Tabs'
import type { CustomTab } from '../types'
import { initTitleCounter } from '../lib/notifications'
import { draftSaver } from '../lib/settingsNav'
import { confirmDialog } from '../components/ConfirmHost'

const TAB_KEY = 'homedash:tab'
const TABS = ['links', 'github', 'basecamp', 'trello', 'local', 'settings'] as const

/** Onglet connu, ou onglet perso (`x:…`) : son existence se vérifie à l'affichage. */
const known = (id: string) => (TABS as readonly string[]).includes(id) || id.startsWith('x:')

/** Onglet ouvert, mémorisé d'une visite à l'autre, et titre de l'onglet du navigateur. */
export function useTabs(title: string | undefined, custom: CustomTab[] = []) {
  const [tab, setTab] = useState<TabId>('links')

  useEffect(() => {
    // `?tab=github` : raccourcis de l'appli installée (manifest). Vaut pour
    // cette ouverture, puis l'adresse redevient propre.
    const asked = new URLSearchParams(window.location.search).get('tab')
    if (asked && known(asked)) {
      setTab(asked as TabId)
      const url = new URL(window.location.href)
      url.searchParams.delete('tab')
      window.history.replaceState(null, '', url)
      return
    }
    try {
      const savedTab = localStorage.getItem(TAB_KEY)
      if (savedTab && known(savedTab)) setTab(savedTab as TabId)
    } catch {
      /* stockage indisponible */
    }
  }, [])

  // Onglet d'où l'on vient, pour que « fermer » l'historique y ramène :
  // l'historique n'a plus d'onglet à lui dans la barre.
  const backTab = useRef<TabId>('links')
  const tabNow = useRef(tab)
  tabNow.current = tab
  // Onglets visités, pour précédent / suivant (boutons de la souris, ⌘[ ⌘]).
  const past = useRef<TabId[]>([])
  const future = useRef<TabId[]>([])
  const show = useCallback((id: TabId) => {
    // Réglages quitté avec des modifications : le brouillon est gardé (retrouvé
    // au retour), et on propose de l'enregistrer tout de suite.
    const save = tabNow.current === 'settings' && id !== 'settings' ? draftSaver() : null
    if (save) {
      void confirmDialog({
        title: 'Enregistrer tes réglages ?',
        body: [
          'Tu as quitté Réglages sans enregistrer tes modifications.',
          '« Plus tard » les garde en brouillon : elles t’attendent dans Réglages, sans être appliquées.',
        ],
        confirmLabel: 'Enregistrer',
        cancelLabel: 'Plus tard',
      }).then((ok) => ok && save())
    }
    if (tabNow.current !== 'events') backTab.current = tabNow.current
    tabNow.current = id
    setTab(id)
    // L'historique ne se rouvre pas au rechargement : il n'a pas d'onglet.
    if (id === 'events') return
    try {
      localStorage.setItem(TAB_KEY, id)
    } catch {
      /* stockage indisponible */
    }
  }, [])
  const selectTab = useCallback(
    (id: TabId) => {
      if (id !== tabNow.current) {
        past.current = [...past.current.slice(-49), tabNow.current]
        future.current = []
      }
      show(id)
    },
    [show],
  )
  /** Onglet précédent / suivant ; `false` s'il n'y en a pas. */
  const stepTab = useCallback(
    (dir: 'back' | 'forward') => {
      const [from, to] = dir === 'back' ? [past, future] : [future, past]
      const id = from.current.at(-1)
      if (id === undefined) return false
      from.current = from.current.slice(0, -1)
      to.current = [...to.current, tabNow.current]
      show(id)
      return true
    },
    [show],
  )

  const goBack = useCallback(() => selectTab(backTab.current), [selectTab])

  // Le titre de l'onglet nomme la page ouverte : « GitHub · homedash » plutôt
  // qu'un « homedash » indifférencié dans la barre d'onglets et l'historique.
  useEffect(() => {
    if (!title) return
    const label = tab.startsWith('x:')
      ? (custom.find((t) => `x:${t.id}` === tab)?.label ?? 'Onglet')
      : {
          links: 'Raccourcis',
          github: 'GitHub',
          basecamp: 'Basecamp',
          trello: 'Trello',
          events: 'Activité',
          local: 'Local',
          settings: 'Réglages',
        }[tab as Exclude<TabId, `x:${string}`>]
    initTitleCounter(`${label} · ${title}`)
  }, [title, tab, custom])

  return { tab, selectTab, goBack, stepTab }
}
