import { describe, expect, it } from 'vitest'

import { keepFolderPlaces, moveFolder, railEntries } from '../src/lib/railOrder.ts'
import type { CustomTab, TabFolder } from '../src/types.ts'

const tab = (id: string, folder?: string) => ({ id, label: id, url: 'https://x.test', ...(folder ? { folder } : {}) }) as CustomTab
const f = (id: string, before?: string) => ({ id, name: id, ...(before ? { before } : {}) }) as TabFolder
const names = (l: ReturnType<typeof railEntries>) => l.map((e) => ('tab' in e ? e.tab.id : `F${e.folder.id}`))
const all = [tab('a'), tab('b'), tab('c')]

describe('place des dossiers', () => {
  it('garde l’ordre d’avant sans réglage : sites, puis dossiers', () => {
    expect(names(railEntries(all, [f('1'), f('2')]))).toEqual(['a', 'b', 'c', 'F1', 'F2'])
  })

  it('met un dossier devant son site', () => {
    expect(names(railEntries(all, [f('1', 'b'), f('2')]))).toEqual(['a', 'F1', 'b', 'c', 'F2'])
  })

  it('renvoie en bas un dossier dont le site a disparu', () => {
    expect(names(railEntries(all, [f('1', 'parti')]))).toEqual(['a', 'b', 'c', 'F1'])
  })

  it('n’oublie ni ne double aucune entrée', () => {
    const r = names(railEntries(all, [f('1', 'a'), f('2', 'a'), f('3', 'c'), f('4')]))
    expect(r).toEqual(['F1', 'F2', 'a', 'b', 'F3', 'c', 'F4'])
  })
})

describe('déplacer un dossier', () => {
  it('devant un site', () => {
    expect(names(railEntries(all, moveFolder([f('1'), f('2')], '2', { tab: 'a' })))).toEqual(['F2', 'a', 'b', 'c', 'F1'])
  })

  it('devant un autre dossier, au même endroit que lui', () => {
    expect(names(railEntries(all, moveFolder([f('1', 'b'), f('2')], '2', { folder: '1' })))).toEqual(['a', 'F2', 'F1', 'b', 'c'])
  })

  it('devant un dossier en bas', () => {
    expect(names(railEntries(all, moveFolder([f('1'), f('2', 'a')], '2', { folder: '1' })))).toEqual(['a', 'b', 'c', 'F2', 'F1'])
  })

  it('tout en bas', () => {
    expect(names(railEntries(all, moveFolder([f('1', 'a'), f('2')], '1', {})))).toEqual(['a', 'b', 'c', 'F2', 'F1'])
  })

  it('ne fait rien sur lui-même ou inconnu', () => {
    const list = [f('1', 'a')]
    expect(moveFolder(list, '1', { folder: '1' })).toBe(list)
    expect(moveFolder(list, 'x', { tab: 'a' })).toBe(list)
  })
})

describe('un site bouge, les dossiers restent', () => {
  const loose = (t: CustomTab) => !t.folder

  it('le dossier reste à sa place quand son site part plus bas', () => {
    const next = keepFolderPlaces(all, [tab('b'), tab('c'), tab('a')], [f('1', 'a')], loose)
    expect(next[0].before).toBe('b')
  })

  it('le dossier reste quand son site entre dans un dossier', () => {
    const next = keepFolderPlaces(all, [tab('a'), tab('b', '2'), tab('c')], [f('1', 'b')], loose)
    expect(next[0].before).toBe('c')
  })

  it('passe en bas s’il n’y a plus de site après', () => {
    const next = keepFolderPlaces(all, [tab('c'), tab('a'), tab('b')], [f('1', 'c')], loose)
    expect(next[0].before).toBeUndefined()
  })

  it('ne change rien si le site visé ne bouge pas', () => {
    const list = [f('1', 'c')]
    expect(keepFolderPlaces(all, [tab('b'), tab('a'), tab('c')], list, loose)).toBe(list)
  })
})
