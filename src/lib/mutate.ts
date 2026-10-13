import type { Config, Group, Link } from '../types'

/** Un lien est repéré par son groupe et sa position dans ce groupe. */
export type LinkRef = { group: string; index: number }

const clone = (cfg: Config): Config => structuredClone(cfg)

const findGroup = (cfg: Config, name: string) => cfg.groups.find((g) => g.name === name)

/** Renvoie un nom libre : « Liens », « Liens 2 », … */
function uniqueName(existing: string[], base: string): string {
  if (!existing.includes(base)) return base
  let i = 2
  while (existing.includes(`${base} ${i}`)) i += 1
  return `${base} ${i}`
}

// ── liens ───────────────────────────────────────────────────────────────────

export function addLink(cfg: Config, groupName: string, link: Link): Config {
  const next = clone(cfg)
  const group = findGroup(next, groupName)
  if (!group) return cfg
  group.links.push(link)
  return next
}

/** Modifie un lien, et le déplace si `targetGroup` diffère de son groupe actuel. */
export function updateLink(
  cfg: Config,
  ref: LinkRef,
  values: Link,
  targetGroup = ref.group,
): Config {
  const next = clone(cfg)
  const from = findGroup(next, ref.group)
  if (!from || !from.links[ref.index]) return cfg

  if (targetGroup === ref.group) {
    from.links[ref.index] = values
    return next
  }
  const to = findGroup(next, targetGroup)
  if (!to) return cfg
  from.links.splice(ref.index, 1)
  to.links.push(values)
  return next
}

export function removeLink(cfg: Config, ref: LinkRef): Config {
  const next = clone(cfg)
  const group = findGroup(next, ref.group)
  if (!group || !group.links[ref.index]) return cfg
  group.links.splice(ref.index, 1)
  return next
}

export function duplicateLink(cfg: Config, ref: LinkRef): Config {
  const next = clone(cfg)
  const group = findGroup(next, ref.group)
  const link = group?.links[ref.index]
  if (!group || !link) return cfg
  group.links.splice(ref.index + 1, 0, { ...link, name: `${link.name} (copie)`, pinned: false })
  return next
}

/** Bascule un booléen (`pinned`, `check`) sans toucher au reste. */
export function toggleLinkFlag(cfg: Config, ref: LinkRef, flag: 'pinned' | 'check'): Config {
  const next = clone(cfg)
  const link = findGroup(next, ref.group)?.links[ref.index]
  if (!link) return cfg
  if (link[flag]) delete link[flag]
  else link[flag] = true
  return next
}

export function moveLink(cfg: Config, ref: LinkRef, dir: -1 | 1): Config {
  const next = clone(cfg)
  const group = findGroup(next, ref.group)
  if (!group) return cfg
  const target = ref.index + dir
  if (target < 0 || target >= group.links.length) return cfg
  const [item] = group.links.splice(ref.index, 1)
  group.links.splice(target, 0, item)
  return next
}

// ── groupes ─────────────────────────────────────────────────────────────────

export function addGroup(cfg: Config, group: Group): Config {
  const next = clone(cfg)
  next.groups.push({ ...group, name: uniqueName(next.groups.map((g) => g.name), group.name) })
  return next
}

/** Met aussi `layout` à jour si le groupe y est nommé explicitement. */
export function updateGroup(cfg: Config, name: string, patch: Partial<Group>): Config {
  const next = clone(cfg)
  const group = findGroup(next, name)
  if (!group) return cfg

  if (patch.name && patch.name !== name) {
    const taken = next.groups.filter((g) => g.name !== name).map((g) => g.name)
    patch = { ...patch, name: uniqueName(taken, patch.name) }
    if (next.layout) {
      next.layout = next.layout.map((entry) =>
        entry.toLowerCase() === name.toLowerCase() ? patch.name! : entry,
      )
    }
  }
  Object.assign(group, patch)
  if (!group.hidden) delete group.hidden
  if (!group.collapsed) delete group.collapsed
  return next
}

export function removeGroup(cfg: Config, name: string): Config {
  const next = clone(cfg)
  next.groups = next.groups.filter((g) => g.name !== name)
  if (next.layout) {
    next.layout = next.layout.filter((e) => e.toLowerCase() !== name.toLowerCase())
  }
  return next
}

/**
 * Déplace un groupe. Si `layout` le nomme explicitement, on déplace l'entrée du
 * layout (c'est elle qui décide de l'ordre) ; sinon on réordonne `groups`.
 */
export function moveGroup(cfg: Config, name: string, dir: -1 | 1): Config {
  const next = clone(cfg)
  const inLayout = next.layout?.findIndex((e) => e.toLowerCase() === name.toLowerCase()) ?? -1

  if (next.layout && inLayout >= 0) {
    const target = inLayout + dir
    if (target < 0 || target >= next.layout.length) return cfg
    const [entry] = next.layout.splice(inLayout, 1)
    next.layout.splice(target, 0, entry)
    return next
  }

  const index = next.groups.findIndex((g) => g.name === name)
  const target = index + dir
  if (index < 0 || target < 0 || target >= next.groups.length) return cfg
  const [group] = next.groups.splice(index, 1)
  next.groups.splice(target, 0, group)
  return next
}
