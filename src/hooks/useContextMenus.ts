import { useCallback, useState } from 'react'
import { confirmDialog } from '../components/ConfirmHost'
import type { MenuItem, MenuState } from '../components/ContextMenu'
import type { Draft } from '../components/EditDialog'
import {
  addGroup,
  addLink,
  duplicateLink,
  moveGroup,
  moveLink,
  removeGroup,
  removeLink,
  toggleLinkFlag,
  updateGroup,
  updateLink,
  type LinkRef,
} from '../lib/mutate'
import type { Config, FlatLink, Link } from '../types'

/**
 * Édition au clic droit : menus d'un lien et d'une catégorie, et la modale
 * d'édition (`draft`) qu'ils ouvrent. Chaque action écrit config.json aussitôt.
 */
export function useContextMenus(
  raw: Config | null,
  persist: (next: Config) => void,
  copy: (key: string, value: string) => Promise<void>,
) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)

  // --- menus contextuels ---------------------------------------------------
  const linkMenu = useCallback(
    (e: React.MouseEvent, link: FlatLink) => {
      if (!raw) return
      e.preventDefault()
      // sans ça, l'événement remonte au conteneur de la catégorie dont le
      // handler écraserait ce menu par celui de la catégorie
      e.stopPropagation()
      const ref: LinkRef = { group: link.group, index: link.index }
      const groupSize = raw.groups.find((g) => g.name === link.group)?.links.length ?? 0
      const items: MenuItem[] = [
        {
          label: 'Modifier…',
          onSelect: () => setDraft({ kind: 'link', ref, group: link.group, values: { ...link } }),
        },
        {
          label: link.pinned ? 'Retirer des tuiles' : 'Épingler en tuile',
          onSelect: () => persist(toggleLinkFlag(raw, ref, 'pinned')),
        },
        {
          label: link.check ? 'Ne plus surveiller' : 'Surveiller (voyant)',
          onSelect: () => persist(toggleLinkFlag(raw, ref, 'check')),
        },
        { sep: true },
        { label: "Copier l'URL", onSelect: () => void copy(`ctx:${link.id}`, link.url) },
        { label: 'Dupliquer', onSelect: () => persist(duplicateLink(raw, ref)) },
        {
          label: 'Monter',
          disabled: link.index === 0,
          onSelect: () => persist(moveLink(raw, ref, -1)),
        },
        {
          label: 'Descendre',
          disabled: link.index >= groupSize - 1,
          onSelect: () => persist(moveLink(raw, ref, 1)),
        },
        { sep: true },
        {
          label: 'Supprimer',
          danger: true,
          onSelect: () => {
            void confirmDialog({
              title: `Supprimer « ${link.name} » ?`,
              body: [link.url, 'La version précédente reste dans config.prev.json et dans les sauvegardes.'],
              confirmLabel: 'Supprimer',
              danger: true,
            }).then((ok) => ok && persist(removeLink(raw, ref)))
          },
        },
      ]
      setMenu({ x: e.clientX, y: e.clientY, title: link.name, items })
    },
    [raw, persist, copy],
  )

  const groupMenu = useCallback(
    (e: React.MouseEvent, name: string) => {
      if (!raw) return
      e.preventDefault()
      const group = raw.groups.find((g) => g.name === name)
      if (!group) return
      const index = raw.groups.findIndex((g) => g.name === name)
      const items: MenuItem[] = [
        {
          label: 'Ajouter un lien…',
          onSelect: () =>
            setDraft({ kind: 'link', ref: null, group: name, values: { name: '', url: '' } }),
        },
        {
          label: 'Modifier la catégorie…',
          onSelect: () =>
            setDraft({
              kind: 'group',
              name,
              values: { name: group.name, icon: group.icon, color: group.color, hidden: group.hidden },
            }),
        },
        { sep: true },
        {
          label: 'Monter',
          disabled: index === 0,
          onSelect: () => persist(moveGroup(raw, name, -1)),
        },
        {
          label: 'Descendre',
          disabled: index >= raw.groups.length - 1,
          onSelect: () => persist(moveGroup(raw, name, 1)),
        },
        {
          label: 'Masquer',
          hint: 'gardée dans le JSON',
          onSelect: () => persist(updateGroup(raw, name, { hidden: true })),
        },
        { sep: true },
        {
          label: 'Nouvelle catégorie…',
          onSelect: () => setDraft({ kind: 'group', name: null, values: { name: '', icon: '📁' } }),
        },
        {
          label: 'Supprimer la catégorie',
          danger: true,
          onSelect: () => {
            void confirmDialog({
              title: `Supprimer la catégorie « ${name} » ?`,
              body: [
                `Ses ${group.links.length} lien(s) partent avec elle.`,
                'La version précédente reste dans config.prev.json et dans les sauvegardes.',
              ],
              confirmLabel: 'Supprimer la catégorie',
              danger: true,
            }).then((ok) => ok && persist(removeGroup(raw, name)))
          },
        },
      ]
      setMenu({ x: e.clientX, y: e.clientY, title: `${group.icon ?? ''} ${name}`.trim(), items })
    },
    [raw, persist],
  )

  const saveDraft = useCallback(
    (d: Draft) => {
      if (!raw) return
      if (d.kind === 'link') {
        persist(
          d.ref
            ? updateLink(raw, d.ref, cleanLink(d.values), d.group)
            : addLink(raw, d.group, cleanLink(d.values)),
        )
      } else {
        persist(
          d.name
            ? updateGroup(raw, d.name, d.values)
            : addGroup(raw, { ...d.values, links: [] }),
        )
      }
      setDraft(null)
    },
    [raw, persist],
  )

  const newGroup = useCallback(
    () => setDraft({ kind: 'group', name: null, values: { name: '', icon: '📁' } }),
    [],
  )

  return {
    menu,
    closeMenu: () => setMenu(null),
    draft,
    closeDraft: () => setDraft(null),
    linkMenu,
    groupMenu,
    saveDraft,
    newGroup,
  }
}

/**
 * Ne garde que les champs qui ont leur place dans config.json (les propriétés
 * dérivées de FlatLink — id, index, group, icon, color — sont écartées) et
 * omet les booléens faux pour garder un JSON lisible.
 */
function cleanLink(values: Link): Link {
  const link: Link = { name: values.name.trim(), url: values.url.trim() }
  if (values.note?.trim()) link.note = values.note.trim()
  if (values.pinned) link.pinned = true
  if (values.check) link.check = true
  if (values.tags?.trim()) link.tags = values.tags.trim()
  return link
}
