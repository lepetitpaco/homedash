import { Fragment, type ReactNode } from 'react'

/**
 * Le Markdown de CHANGELOG.md et GUIDE.md, en éléments React (jamais de HTML
 * injecté) : rien de plus que ce que ces deux fichiers utilisent.
 *
 * En ligne : `**gras**` (qui peut contenir du code), `*italique*`, `![image](…)`,
 * `` `code` `` et `[lien](…)` (avec ou sans titre après l'adresse) : http(s) ouvert dans le navigateur, une adresse relative
 * (`README.md`) reste du texte.
 */
export function inline(text: string): ReactNode[] {
  return text.split(/(!\[[^\]]*\]\([^)\s]+\)|\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+(?:\s+"[^"]*")?\)|\*[^*\s][^*]*\*)/g).map((part, i) => {
    // image dans le texte (une case de tableau) : même règle d'adresse que les figures
    const img = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(part)
    if (img) return <img key={i} className="md-img" src={imageSrc(img[2])} alt={img[1]} loading="lazy" />
    if (part.length > 4 && part.startsWith('**') && part.endsWith('**'))
      return <strong key={i}>{inline(part.slice(2, -2))}</strong>
    if (part.length > 1 && part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>
    const link = /^\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/.exec(part)
    if (link)
      return /^https?:\/\//.test(link[2]) ? (
        // data-outside : toujours dans le navigateur (doc, issue GitHub…), jamais un onglet perso
        <a key={i} href={link[2]} target="_blank" rel="noreferrer" data-outside>
          {inline(link[1])}
        </a>
      ) : (
        <Fragment key={i}>{inline(link[1])}</Fragment>
      )
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) return <em key={i}>{inline(part.slice(1, -1))}</em>
    return part
  })
}

/** `docs/screenshots/x.jpg` (chemin du dépôt, lisible sur GitHub) → `guide/x.jpg` (servi par homedash). */
const imageSrc = (path: string) => (/^https?:\/\//.test(path) ? path : path.replace(/^(\.\.\/)?docs\/screenshots\//, 'guide/'))

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())

/**
 * Blocs : intertitres `###` / `####`, paragraphes, listes `-` et `1.` (une
 * ligne en retrait continue l'élément), tableaux `|…|`, blocs de code ```,
 * images seules sur leur ligne `![légende](docs/screenshots/x.jpg)`.
 */
export function Markdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const out: ReactNode[] = []
  let i = 0
  const k = () => out.length
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    if (line.startsWith('```')) {
      const code: string[] = []
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) code.push(lines[i])
      i++
      out.push(
        <pre key={k()} className="md-code">
          <code>{code.join('\n')}</code>
        </pre>,
      )
      continue
    }
    // Image seule sur sa ligne : les captures de docs/screenshots/, servies sous guide/.
    const img = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(line)
    if (img) {
      out.push(
        <figure key={k()} className="md-figure">
          <img src={imageSrc(img[2])} alt={img[1]} loading="lazy" />
          {img[1] ? <figcaption>{img[1]}</figcaption> : null}
        </figure>,
      )
      i++
      continue
    }
    const h = /^(#{2,4})\s+(.*)$/.exec(line)
    if (h) {
      out.push(
        h[1].length <= 3 ? (
          <h3 key={k()} className="md-h3">
            {inline(h[2])}
          </h3>
        ) : (
          <h4 key={k()} className="md-h4">
            {inline(h[2])}
          </h4>
        ),
      )
      i++
      continue
    }
    if (line.trimStart().startsWith('|')) {
      const rows: string[][] = []
      for (; i < lines.length && lines[i].trimStart().startsWith('|'); i++)
        if (!/^\s*\|[\s|:-]+\|\s*$/.test(lines[i])) rows.push(cells(lines[i]))
      const [head, ...body] = rows
      out.push(
        <table key={k()} className="md-table">
          <thead>
            <tr>
              {head.map((c, j) => (
                <th key={j}>{inline(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((r, n) => (
              <tr key={n}>
                {r.map((c, j) => (
                  <td key={j}>{inline(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      )
      continue
    }
    const item = /^(-|\d+\.)\s+/
    if (item.test(line)) {
      const ordered = /^\d/.test(line)
      const items: string[] = []
      while (i < lines.length && (item.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        if (item.test(lines[i])) items.push(lines[i].replace(item, ''))
        else items[items.length - 1] += ' ' + lines[i].trim()
        i++
      }
      const lis = items.map((t, n) => <li key={n}>{inline(t)}</li>)
      out.push(ordered ? <ol key={k()}>{lis}</ol> : <ul key={k()}>{lis}</ul>)
      continue
    }
    const para: string[] = []
    for (; i < lines.length && lines[i].trim() && !/^(#{2,4}\s|```|\s*\||-\s|\d+\.\s|!\[)/.test(lines[i]); i++)
      para.push(lines[i].trim())
    out.push(<p key={k()}>{inline(para.join(' '))}</p>)
  }
  return <div className="md">{out}</div>
}

export type GuidePart = { id: string; icon: string; title: string; body: string }

/**
 * GUIDE.md découpé en pages : une par `## Titre` (l'emoji du titre devient son
 * icône) ; ce qui précède le premier (titre, lien d'installation) est ignoré.
 */
export function guideParts(text: string): GuidePart[] {
  const parts: GuidePart[] = []
  for (const block of text.split(/^## /m).slice(1)) {
    const nl = block.indexOf('\n')
    const head = (nl < 0 ? block : block.slice(0, nl)).trim()
    const m = /^(\p{Extended_Pictographic}️?)\s*(.*)$/u.exec(head)
    const title = m ? m[2] : head
    const id =
      'help-' +
      title
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    parts.push({ id, icon: m ? m[1] : '📖', title, body: nl < 0 ? '' : block.slice(nl + 1) })
  }
  return parts
}
