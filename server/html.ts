/**
 * Lecture d'HTML sans dépendance : une suite d'événements balise ouvrante,
 * balise fermante, texte (entités décodées). Assez pour le HTML de Basecamp
 * (éditeur Trix) et celui que rend GitHub ; pas un navigateur.
 */

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', copy: '©', reg: '®', trade: '™',
  eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', ucirc: 'û', ugrave: 'ù',
  icirc: 'î', iuml: 'ï', euml: 'ë', Eacute: 'É', Egrave: 'È', Agrave: 'À', Ccedil: 'Ç', middot: '·', bull: '•',
  times: '×', euro: '€', deg: '°', shy: '­', zwj: '‍', zwnj: '‌',
}

export function unescape(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi, (m, ent: string) => {
    if (ent[0] === '#') {
      const code = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10)
      try {
        return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : m
      } catch {
        return m
      }
    }
    return NAMED[ent] ?? m
  })
}

export function escape(s: string, quote = true): string {
  let out = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  if (quote) out = out.replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
  return out
}

export type Handler = {
  start(tag: string, attrs: Record<string, string>): void
  end(tag: string): void
  data(text: string): void
}

const RAW = new Set(['script', 'style'])
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g

export function parse(html: string, h: Handler): void {
  let i = 0
  const n = html.length
  while (i < n) {
    const lt = html.indexOf('<', i)
    if (lt < 0) {
      h.data(unescape(html.slice(i)))
      break
    }
    if (lt > i) h.data(unescape(html.slice(i, lt)))
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4)
      i = end < 0 ? n : end + 3
      continue
    }
    if (html[lt + 1] === '!' || html[lt + 1] === '?') {
      const end = html.indexOf('>', lt)
      i = end < 0 ? n : end + 1
      continue
    }
    const m = /^<(\/)?([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/.exec(html.slice(lt, lt + 4096))
    if (!m) {
      h.data('<')
      i = lt + 1
      continue
    }
    const tag = m[2].toLowerCase()
    i = lt + m[0].length
    if (m[1]) {
      h.end(tag)
      continue
    }
    const attrs: Record<string, string> = {}
    for (const a of m[3].matchAll(ATTR)) {
      const name = a[1].toLowerCase()
      if (!(name in attrs)) attrs[name] = unescape(a[2] ?? a[3] ?? a[4] ?? '')
    }
    h.start(tag, attrs)
    if (/\/\s*$/.test(m[3])) h.end(tag)
    if (RAW.has(tag)) {
      const close = html.toLowerCase().indexOf(`</${tag}`, i)
      const stop = close < 0 ? n : close
      if (stop > i) h.data(html.slice(i, stop))
      i = stop
    }
  }
}
