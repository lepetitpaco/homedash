import { describe, expect, it } from 'vitest'
// bcIssues / trIssues importent des types du front (DOM) : on teste ici ce qu'ils assemblent.
import { exchangesMarkdown, foldDescription, forGitHub, issueSections, otherRepos, reposPrompt, reposRule, reposSection, sectionsOf, sectionsRule, type IssueParts } from '../src/lib/issueText'

const order = (lines: string[]) => lines.filter((l) => l.startsWith('## ')).map((l) => l.slice(3))
const bc = (p: IssueParts) => issueSections('Basecamp', '🏕', p)
/** Comme `issueBody` : lien, sections, puis le marqueur et la consigne. */
const body = (p: IssueParts) => ['> 🏕 **Tâche Basecamp** : [X](https://x)', '', ...bc(p), '---', '<!-- homedash:bc https://x -->', 'consigne'].join('\n')

describe('sections du corps', () => {
  it('une section par source, dans un ordre fixe', () => {
    expect(order(bc({ need: 'Il reste la gamme Y.', card: 'La demande', exchanges: 'Oui' }))).toEqual(['🎯 Mon besoin', '🏕 Carte Basecamp', '💬 Échanges Basecamp'])
    expect(order(issueSections('Trello', '📋', { need: 'n', card: 'd', exchanges: 'e' }))).toEqual(['🎯 Mon besoin', '📋 Carte Trello', '💬 Échanges Trello'])
  })

  it('une source vide = section omise', () => {
    expect(order(bc({ need: '', card: 'La demande', exchanges: '' }))).toEqual(['🏕 Carte Basecamp'])
    expect(order(bc({ need: 'à moi', card: '', exchanges: 'x' }))).toEqual(['🎯 Mon besoin', '💬 Échanges Basecamp'])
  })

  it('rien du tout : Mon besoin à compléter', () => {
    const out = bc({ need: ' ', card: '', exchanges: '' })
    expect(order(out)).toEqual(['🎯 Mon besoin'])
    expect(out).toContain('_À compléter._')
  })

  it("l'aperçu ne garde que les sections, même si le texte contient un trait", () => {
    const shown = sectionsOf(body({ need: 'a', card: 'avant\n\n---\n\naprès', exchanges: '' }))
    expect(shown.startsWith('## 🎯 Mon besoin')).toBe(true)
    expect(shown).toContain('après')
    expect(shown).not.toContain('homedash:bc')
    expect(shown).not.toContain('Tâche Basecamp')
  })
})

describe('texte rendu pour GitHub', () => {
  it('aucun @ devant un mot : les mentions ne notifient personne', () => {
    const out = forGitHub('Hello **@Julian Boissy** et **@quelqu’un**, cc @paco')
    expect(out).toBe('Hello **Julian Boissy** et **quelqu’un**, cc paco')
    expect(out).not.toMatch(/@\w/)
  })

  it('les e-mails et les adresses web gardent leur @', () => {
    expect(forGitHub('écrire à a.b@x.fr ou voir https://x.com/@team et <https://y.fr/@a>')).toBe(
      'écrire à a.b@x.fr ou voir https://x.com/@team et <https://y.fr/@a>',
    )
  })

  it("une ligne indentée n'est plus un bloc de code, une liste imbriquée reste", () => {
    expect(forGitHub('Gammes :\n    Gamme A\n    Gamme B')).toBe('Gammes :  \nGamme A  \nGamme B')
    expect(forGitHub('- a\n    - b')).toBe('- a  \n    - b')
  })

  it('les sauts de ligne restent, les paragraphes aussi', () => {
    expect(forGitHub('l1\nl2\n\np2')).toBe('l1  \nl2\n\np2')
  })

  it('un bloc de code est laissé tel quel', () => {
    expect(forGitHub('```\n    @x\nb\n```')).toBe('```\n    @x\nb\n```')
  })

  it('séparateur : la suite est repliée, les étapes restent visibles', () => {
    const out = foldDescription('Demande\n----------\nMerci\n\n### Étapes\n\n- [ ] a', '### Étapes')
    expect(out).toBe(
      'Demande\n\n<details><summary>Suite de la description (après le séparateur)</summary>\n\nMerci\n\n</details>\n\n### Étapes\n\n- [ ] a',
    )
    expect(foldDescription('pas de séparateur\n---')).toBe('pas de séparateur\n---')
  })

  it('une carte passe par tout ça', () => {
    const out = forGitHub(foldDescription('Hello **@Ana**\n    Gamme A\n----------\nsuite'))
    expect(out).not.toMatch(/@\w/)
    expect(out).toContain('<details>')
    expect(out).not.toMatch(/^ {4}/m)
  })

  it('échanges : auteur et date, puis le texte, sans @', () => {
    expect(exchangesMarkdown([{ who: 'Ana B', date: '2026-10-21T09:00:00Z', text: 'merci **@Paul**' }])).toBe(
      '**Ana B** (2026-10-21) :  \nmerci **Paul**',
    )
    expect(exchangesMarkdown([])).toBe('')
  })
})

describe('consigne pour Claude Code', () => {
  it('nomme les trois sections et la priorité de Mon besoin, sans apostrophe droite', () => {
    for (const service of ['Basecamp', 'Trello']) {
      const text = sectionsRule(service)
      expect(text).toContain(`« Carte ${service} »`)
      expect(text).toContain(`« Échanges ${service} »`)
      expect(text).toContain('« Mon besoin »')
      expect(text).toContain('prioritaires')
      expect(text).not.toContain("'")
    }
  })
})

describe('plusieurs repos', () => {
  it('« Repos concernés » en tête, seulement s’il y a un autre repo', () => {
    expect(order(bc({ need: 'n', card: '', exchanges: '', repo: 'o/api', others: ['o/web'] }))).toEqual(['🔗 Repos concernés', '🎯 Mon besoin'])
    expect(order(bc({ need: 'n', card: '', exchanges: '', repo: 'o/api', others: [] }))).toEqual(['🎯 Mon besoin'])
    expect(reposSection('o/api', ['o/web'])).toEqual(['## 🔗 Repos concernés', '', '- **o/api** (cette issue)', '- [o/web](https://github.com/o/web)', ''])
  })

  it('sans doublon ni le repo de l’issue, dans l’ordre choisi', () => {
    expect(otherRepos('o/API', ['o/web', 'o/api', 'O/Web', 'nom-court', 'o/docs'])).toEqual(['o/web', 'o/docs'])
  })

  it('consigne et prompt : une PR par repo, un seul rapport ; sans apostrophe droite', () => {
    expect(reposRule()).toContain('un seul')
    const p = reposPrompt([{ repo: 'o/web', dir: '~/dev/web' }, { repo: 'o/docs', dir: null }])
    expect(p).toContain('o/web (clone : ~/dev/web)')
    expect(p).toContain('o/docs')
    expect(p + reposRule()).not.toContain("'")
    expect(reposPrompt([])).toBe('')
  })
})
