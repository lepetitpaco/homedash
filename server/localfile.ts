/**
 * Onglets perso : un fichier ou un dossier du disque, servi en lecture seule.
 *
 * La page ne peut pas ouvrir un lien `file://` : le fichier passe par
 * `GET /api/file?path=…`. Périmètre : le dossier personnel, après `realpath`,
 * sans dossier ni fichier caché (`.ssh`, `.env`…), ni dossier de données
 * homedash. Rien n'est écrit, rien n'est exécuté.
 */

import fs from 'node:fs'
import path from 'node:path'

import * as paths from './paths.ts'
import * as store from './store.ts'

/** Types qu'un navigateur exécute : servis dans une origine opaque (`CSP: sandbox`). */
const ACTIVE = new Set(['text/html', 'application/xhtml+xml', 'image/svg+xml', 'text/xml', 'application/xml'])
const SANDBOX = 'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms'
/** Sources, scripts, configs… : affichés comme du texte plutôt que téléchargés. */
const TEXTLIKE = new Set(['.md', '.txt', '.log', '.csv', '.tsv', '.json', '.yml', '.yaml', '.toml', '.ini', '.py', '.ts', '.tsx', '.js', '.jsx', '.sh', '.sql', '.css', '.env.example'])

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.xhtml': 'application/xhtml+xml',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/vnd.microsoft.icon',
  '.bmp': 'image/bmp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/x-wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.zip': 'application/zip',
  '.htmlx': 'text/html',
  '.rtf': 'application/rtf',
  '.xls': 'application/vnd.ms-excel',
  '.doc': 'application/msword',
}

/** Chemin affiché (`~/…`, absolu, ou `file://…`) → chemin réel ; lève hors du dossier personnel ou caché. */
export function locate(shown: string | null | undefined): string {
  let p = (shown || '').trim()
  if (p.startsWith('file://')) {
    try {
      p = decodeURIComponent(new URL(p).pathname)
      if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1)
    } catch {
      p = ''
    }
  }
  if (!p) throw new Error('chemin vide')
  const base = paths.real(paths.homeBase())
  const target = paths.real(paths.resolve(p))
  const fold = process.platform === 'win32'
  if (!paths.under(target, base, fold)) throw new Error('hors du dossier personnel')
  if (target.slice(base.length).split('/').some((part) => part.startsWith('.'))) throw new Error('fichier ou dossier caché : non servi')
  if (!fs.existsSync(target)) throw new Error(`${p} introuvable`)
  if (inDataDir(target, base)) throw new Error('dossier de données homedash : non servi')
  // Profil de l'appli de bureau (cookies et stockage des sites, sous ~/Library ou %APPDATA%).
  const profile = process.env.HOMEDASH_PROFILE_DIR
  if (profile && paths.under(target, paths.real(profile), process.platform === 'win32')) throw new Error("dossier de l'appli homedash : non servi")
  return target
}

/**
 * Le `data/` d'une instance homedash vit souvent dans le dossier personnel :
 * jetons, mots de passe des Infos, sauvegardes. Reconnu à son `secrets.json`.
 */
function inDataDir(target: string, base: string): boolean {
  let d = paths.isDir(target) ? target : paths.dirname(target)
  while (paths.under(d, base, process.platform === 'win32')) {
    if (fs.existsSync(path.join(d, store.SECRETS))) return true
    if (d === base) break
    const up = paths.dirname(d)
    if (up === d) break
    d = up
  }
  return false
}

export function contentType(target: string): string {
  const name = path.basename(target).toLowerCase()
  const ext = name.endsWith('.env.example') ? '.env.example' : path.extname(name)
  if (TEXTLIKE.has(ext)) return 'text/plain; charset=utf-8'
  let ctype = MIME[ext] || 'application/octet-stream'
  if (ext === '.css') ctype = 'text/css'
  if (ctype.startsWith('text/') || ACTIVE.has(ctype)) ctype += '; charset=utf-8'
  return ctype
}

/** En-têtes de la réponse : le sandbox pour ce qui peut exécuter du code. */
export function headers(target: string): Record<string, string> {
  const ctype = contentType(target)
  const out: Record<string, string> = {
    'Content-Type': ctype,
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': "inline; filename*=UTF-8''" + encodeURIComponent(path.basename(target)),
  }
  if (ACTIVE.has(ctype.split(';')[0])) out['Content-Security-Policy'] = SANDBOX
  return out
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
const q = (s: string) => encodeURIComponent(s).replace(/%2F/g, '/').replace(/%7E/g, '~')

/** Un dossier : la liste de son contenu, chaque entrée renvoyant ici. Page sans script. */
export function listing(target: string): Buffer {
  const shown = paths.display(target)
  const rows: string[] = []
  let entries: fs.Dirent[] = []
  try {
    entries = fs.readdirSync(target, { withFileTypes: true })
  } catch (e) {
    rows.push(`<li>✗ ${esc(String((e as Error).message))}</li>`)
  }
  const isDirEnt = (e: fs.Dirent) => {
    try {
      return e.isDirectory() || (e.isSymbolicLink() && fs.statSync(path.join(target, e.name)).isDirectory())
    } catch {
      return false
    }
  }
  entries.sort((a, b) => Number(!isDirEnt(a)) - Number(!isDirEnt(b)) || (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1))
  const base = paths.real(paths.homeBase())
  if (target !== base) rows.push(`<li><a href='?path=${q(paths.display(paths.dirname(target)))}'>↰ ..</a></li>`)
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const href = '?path=' + q(paths.display(paths.join(target, e.name)))
    rows.push(`<li><a href='${href}'>${isDirEnt(e) ? '📁' : '📄'} ${esc(e.name)}</a></li>`)
  }
  return Buffer.from(
    "<!doctype html><meta charset=utf-8><meta name=color-scheme content='light dark'>" +
      `<title>${esc(shown)}</title>` +
      '<style>body{font:14px system-ui;margin:1.5rem}ul{list-style:none;padding:0}' +
      'li{padding:.2rem 0}a{text-decoration:none}a:hover{text-decoration:underline}</style>' +
      `<h3><code>${esc(shown)}</code></h3><ul>${rows.join('')}</ul>`,
  )
}
