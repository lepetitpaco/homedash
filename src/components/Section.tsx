import type { Dispatch, SetStateAction } from 'react'
import { repoTabs } from '../types'
import type { InfoRef } from '../lib/mutate'
import type { Normalized, ResolvedSection } from '../lib/config'
import type { useGithub } from '../lib/ghboard'
import type { useHealth } from '../lib/health'
import type { useLocal } from '../lib/local'
import type { Note } from '../lib/notes'
import type { Usage } from '../lib/usage'
import type { FlatLink } from '../types'
import GhBranches from './GhBranches'
import GhMerged from './GhMerged'
import GhPrs from './GhPrs'
import GhRenovate from './GhRenovate'
import GroupCard from './GroupCard'
import InfoPanel from './InfoPanel'
import Notes from './Notes'
import RepoCard from './RepoCard'
import Stats from './Stats'

/** Tout ce dont un bloc a besoin, commun à tous les blocs d'une page. */
export type SectionCtx = {
  cfg: Normalized
  gh: ReturnType<typeof useGithub>
  local: ReturnType<typeof useLocal>
  links: FlatLink[]
  health: ReturnType<typeof useHealth>['health']
  usage: Usage
  notes: Note[]
  setNotes: Dispatch<SetStateAction<Note[]>>
  openNoteId: string | null
  setOpenNoteId: (id: string | null) => void
  collapsed: Record<string, boolean>
  toggleGroup: (name: string, current: boolean) => void
  track: (id: string) => void
  resetUsage: () => void
  openLocal: () => void
  linkMenu: (e: React.MouseEvent, link: FlatLink) => void
  groupMenu: (e: React.MouseEvent, name: string) => void
  infoMenu: (e: React.MouseEvent, ref: InfoRef) => void
  infoGroupMenu: (e: React.MouseEvent, index: number) => void
  infoPanelMenu: (e: React.MouseEvent) => void
}

/** Un bloc de page : carte GitHub, infos, repos, notes, stats ou catégorie de liens. */
export default function Section({ section, ctx }: { section: ResolvedSection; ctx: SectionCtx }) {
  const { cfg, gh, local, links, health, track } = ctx
  const { ui } = cfg
  // Les cartes GitHub n'apparaissent que si le backend a un token et une config.
  const ghData = gh.data?.enabled ? gh.data : null
  const busy = (name: string) => gh.busyScope === 'all' || gh.busyScope === name
  if (section.kind === 'gh:branches') {
    return ghData ? (
      <GhBranches
        data={ghData}
        color="#34d399"
        onRefresh={() => gh.refresh('branches')}
        building={busy('branches')}
      />
    ) : null
  }
  if (section.kind === 'gh:prs') {
    return ghData ? (
      <GhPrs data={ghData} color="#60a5fa" onRefresh={() => gh.refresh('prs')} building={busy('prs')} />
    ) : null
  }
  if (section.kind === 'gh:renovate') {
    return ghData ? (
      <GhRenovate
        data={ghData}
        color="#a78bfa"
        onRefresh={() => gh.refresh('renovate')}
        building={busy('renovate')}
      />
    ) : null
  }
  if (section.kind === 'gh:merged') {
    return ghData ? (
      <GhMerged
        data={ghData}
        color={ui.defaultColor}
        onRefresh={() => gh.refresh('merged')}
        building={busy('merged')}
        removable={local.removable}
        onCleanup={ctx.openLocal}
      />
    ) : null
  }
  if (section.kind === 'infos') {
    return cfg.infos ? (
      <InfoPanel
        infos={cfg.infos}
        onContextItem={ctx.infoMenu}
        onContextGroup={ctx.infoGroupMenu}
        onAdd={ctx.infoPanelMenu}
      />
    ) : null
  }
  if (section.kind === 'repos') {
    if (!cfg.repos) return null
    const tab = section.tab ?? 'github'
    const items = cfg.repos.items.filter((i) => repoTabs(i).includes(tab))
    return items.length ? <RepoCard repos={{ ...cfg.repos, items }} onOpen={track} gh={gh.data} /> : null
  }
  if (section.kind === 'notes') {
    return (
      <Notes
        config={cfg.notes}
        notes={ctx.notes}
        setNotes={ctx.setNotes}
        openId={ctx.openNoteId}
        setOpenId={ctx.setOpenNoteId}
      />
    )
  }
  if (section.kind === 'stats') {
    // Les tuiles « les plus utilisés » disent déjà la même chose : la carte ne
    // revient que si elles sont coupées (Réglages → Affichage), issue #56.
    if (cfg.ui.showTiles !== false) return null
    return (
      <Stats
        config={cfg.stats}
        links={links}
        usage={ctx.usage}
        onOpen={(l) => track(l.id)}
        onReset={ctx.resetUsage}
      />
    )
  }
  const { group } = section
  const isCollapsed = ctx.collapsed[group.name] ?? group.collapsed ?? false
  return (
    <GroupCard
      name={group.name}
      icon={group.icon}
      color={group.color ?? ui.defaultColor}
      links={links.filter((l) => l.group === group.name)}
      health={health}
      favicons={ui.favicons}
      faviconProvider={ui.faviconProvider}
      collapsed={isCollapsed}
      onToggle={() => ctx.toggleGroup(group.name, isCollapsed)}
      onOpen={(l) => track(l.id)}
      onContextGroup={ctx.groupMenu}
      onContextLink={ctx.linkMenu}
    />
  )
}
