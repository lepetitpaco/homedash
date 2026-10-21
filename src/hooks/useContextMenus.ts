import { useCallback, useState } from 'react'
import { confirmDialog } from '../components/ConfirmHost'
import type { MenuItem, MenuState } from '../components/ContextMenu'
import type { Draft } from '../components/EditDialog'
import {
  addGroup,
  addInfo,
  addInfoGroup,
  addLink,
  duplicateLink,
  moveGroup,
  moveInfo,
  moveInfoGroup,
  moveLink,
  removeGroup,
  removeInfo,
  removeInfoGroup,
  removeLink,
  toggleLinkFlag,
  updateGroup,
  updateInfo,
  updateInfoGroup,
  updateLink,
  type InfoRef,
  type LinkRef,
} from '../lib/mutate'
import type { Config, FlatLink, InfoGroup, InfoItem, Link } from '../types'
import { withScheme } from '../lib/url'

const infoGroupsOf = (raw: Config): InfoGroup[] =>
  (Array.isArray(raw.infos) ? raw.infos : raw.infos?.groups) ?? []

/**
 * Édition au clic droit : menus d'un lien et d'une catégorie, et la modale
 * d'édition (`draft`) qu'ils ouvrent. Chaque action écrit config.json aussitôt.
 */
export function useContextMenus(
  raw: Config | null,
  persist: (next: Config) => void,
  copy: (key: string, value: string) => Promise<void>,
  /** Section « Ouvrir » d'un lien (appli de bureau : onglet, éphémère, navigateur) ; vide sinon. */
  openItems: (url: string) => MenuItem[] = () => [],
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
      const open = openItems(link.url)
      setMenu({
        x: e.clientX,
        y: e.clientY,
        title: link.name,
        items: open.length ? [{ heading: 'Ouvrir' }, ...open, { sep: true }, { heading: 'Lien' }, ...items] : items,
      })
    },
    [raw, persist, copy, openItems],
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
        // Le panneau Infos n'existe qu'une fois créé : c'est ici qu'on le crée.
        ...(infoGroupsOf(raw).length
          ? []
          : [
              {
                label: 'Ajouter un panneau Infos…',
                hint: 'valeurs à copier',
                onSelect: () =>
                  setDraft({ kind: 'infoGroup', index: null, values: { title: '', icon: '📌' } }),
              },
            ]),
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

  // --- panneau Infos ------------------------------------------------------
  const removeInfoAsk = useCallback(
    (ref: InfoRef, item: InfoItem) => {
      if (!raw) return
      void confirmDialog({
        title: `Supprimer « ${item.label} » ?`,
        body: 'La version précédente reste dans config.prev.json et dans les sauvegardes.',
        confirmLabel: 'Supprimer',
        danger: true,
      }).then((ok) => ok && persist(removeInfo(raw, ref)))
    },
    [raw, persist],
  )

  const infoMenu = useCallback(
    (e: React.MouseEvent, ref: InfoRef) => {
      if (!raw) return
      e.preventDefault()
      e.stopPropagation()
      const group = infoGroupsOf(raw)[ref.group]
      const item = group?.items?.[ref.index]
      if (!item) return
      const items: MenuItem[] = [
        {
          label: 'Modifier…',
          onSelect: () => setDraft({ kind: 'info', ref, group: ref.group, values: { ...item } }),
        },
        { label: 'Copier la valeur', onSelect: () => void copy(`info:${ref.group}:${ref.index}`, item.value) },
        {
          label: item.secret ? 'Ne plus masquer' : 'Masquer (secret)',
          onSelect: () =>
            persist(updateInfo(raw, ref, { ...item, secret: item.secret ? undefined : true })),
        },
        { sep: true },
        {
          label: 'Ajouter une info…',
          onSelect: () =>
            setDraft({ kind: 'info', ref: null, group: ref.group, values: { label: '', value: '' } }),
        },
        { label: 'Monter', disabled: ref.index === 0, onSelect: () => persist(moveInfo(raw, ref, -1)) },
        {
          label: 'Descendre',
          disabled: ref.index >= group.items.length - 1,
          onSelect: () => persist(moveInfo(raw, ref, 1)),
        },
        { sep: true },
        { label: 'Supprimer', danger: true, onSelect: () => removeInfoAsk(ref, item) },
      ]
      setMenu({ x: e.clientX, y: e.clientY, title: item.label, items })
    },
    [raw, persist, copy, removeInfoAsk],
  )

  const infoGroupMenu = useCallback(
    (e: React.MouseEvent, index: number) => {
      if (!raw) return
      e.preventDefault()
      e.stopPropagation()
      const groups = infoGroupsOf(raw)
      const group = groups[index]
      if (!group) return
      const { items: list = [], ...meta } = group
      const items: MenuItem[] = [
        {
          label: 'Ajouter une info…',
          onSelect: () =>
            setDraft({ kind: 'info', ref: null, group: index, values: { label: '', value: '' } }),
        },
        { label: 'Modifier le groupe…', onSelect: () => setDraft({ kind: 'infoGroup', index, values: meta }) },
        { sep: true },
        { label: 'Monter', disabled: index === 0, onSelect: () => persist(moveInfoGroup(raw, index, -1)) },
        {
          label: 'Descendre',
          disabled: index >= groups.length - 1,
          onSelect: () => persist(moveInfoGroup(raw, index, 1)),
        },
        {
          label: 'Nouveau groupe…',
          onSelect: () => setDraft({ kind: 'infoGroup', index: null, values: { title: '', icon: '📌' } }),
        },
        { sep: true },
        {
          label: 'Supprimer le groupe',
          danger: true,
          onSelect: () => {
            void confirmDialog({
              title: `Supprimer le groupe « ${group.title} » ?`,
              body: [
                `Ses ${list.length} info(s) partent avec lui.`,
                'La version précédente reste dans config.prev.json et dans les sauvegardes.',
              ],
              confirmLabel: 'Supprimer le groupe',
              danger: true,
            }).then((ok) => ok && persist(removeInfoGroup(raw, index)))
          },
        },
      ]
      setMenu({ x: e.clientX, y: e.clientY, title: `${group.icon ?? ''} ${group.title}`.trim(), items })
    },
    [raw, persist],
  )

  /** En-tête du panneau (clic droit ou bouton ＋). */
  const infoPanelMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!raw) return
      e.preventDefault()
      e.stopPropagation()
      const groups = infoGroupsOf(raw)
      const items: MenuItem[] = [
        ...groups.map((g, i) => ({
          label: `Ajouter une info dans ${g.icon ?? ''} ${g.title}…`.replace('  ', ' '),
          onSelect: () =>
            setDraft({ kind: 'info', ref: null, group: i, values: { label: '', value: '' } }),
        })),
        { sep: true },
        {
          label: 'Nouveau groupe…',
          onSelect: () => setDraft({ kind: 'infoGroup', index: null, values: { title: '', icon: '📌' } }),
        },
      ]
      setMenu({ x: e.clientX, y: e.clientY, title: 'Infos & accès', items })
    },
    [raw],
  )

  const saveDraft = useCallback(
    (d: Draft) => {
      if (!raw) return
      if (d.kind === 'info') {
        const item = cleanInfo(d.values)
        persist(d.ref ? updateInfo(raw, d.ref, item, d.group) : addInfo(raw, d.group, item))
        setDraft(null)
        return
      }
      if (d.kind === 'infoGroup') {
        const meta = { ...d.values, title: d.values.title.trim() }
        persist(d.index !== null ? updateInfoGroup(raw, d.index, meta) : addInfoGroup(raw, meta))
        setDraft(null)
        return
      }
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
    openMenu: setMenu,
    draft,
    closeDraft: () => setDraft(null),
    linkMenu,
    groupMenu,
    infoMenu,
    infoGroupMenu,
    infoPanelMenu,
    saveDraft,
    newGroup,
  }
}

function cleanInfo(values: InfoItem): InfoItem {
  const item: InfoItem = { label: values.label.trim(), value: values.value.trim() }
  if (values.note?.trim()) item.note = values.note.trim()
  if (values.secret) item.secret = true
  return item
}

/**
 * Ne garde que les champs qui ont leur place dans config.json (les propriétés
 * dérivées de FlatLink — id, index, group, icon, color — sont écartées) et
 * omet les booléens faux pour garder un JSON lisible.
 */
function cleanLink(values: Link): Link {
  // `notion.so` → `https://notion.so` : sinon lien cassé et pas de favicon
  const link: Link = { name: values.name.trim(), url: withScheme(values.url) }
  if (values.note?.trim()) link.note = values.note.trim()
  if (values.pinned) link.pinned = true
  if (values.check) link.check = true
  if (values.tags?.trim()) link.tags = values.tags.trim()
  return link
}
