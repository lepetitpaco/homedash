import { isValidElement, type ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { inline } from '../src/lib/markdown.tsx'

describe('liens Markdown', () => {
  it('un titre après l\'adresse (Trello) reste un lien', () => {
    const [, link] = inline('voir [ici](https://a.test/x "smartCard-embed")')
    expect(isValidElement(link)).toBe(true)
    expect((link as ReactElement<{ href: string }>).props.href).toBe('https://a.test/x')
  })

  it('sans titre, rien ne change', () => {
    const [, link] = inline('voir [ici](https://a.test/x)')
    expect((link as ReactElement<{ href: string }>).props.href).toBe('https://a.test/x')
  })
})
