/**
 * Version installée, changelog, et « une mise à jour est disponible ».
 *
 * La version est celle du haut de `CHANGELOG.md`, embarqué avec l'appli. Une
 * nouvelle version = une Release GitHub `vX.Y.Z` : on lit la dernière, puis
 * son CHANGELOG pour annoncer ce qui arrive. L'installation, elle, est faite
 * par l'appli de bureau (desktop/updater.js).
 *
 * Deux protections pour les données :
 *  · `onStart()` prend un instantané de data/ quand la version installée
 *    change, AVANT que la migration de config ne tourne ;
 *  · ce module ne lit et n'écrit que `data/version.json` et le journal.
 */

import fs from 'node:fs'
import path from 'node:path'

import * as accounts from './accounts.ts'
import * as backup from './backup.ts'
import * as errlog from './errlog.ts'
import * as events from './events.ts'
import * as store from './store.ts'

const ROOT = process.env.HOMEDASH_ROOT || path.resolve(import.meta.dirname, '..')
const CHANGELOG = () => process.env.CHANGELOG || path.join(ROOT, 'CHANGELOG.md')
/** Mode d'emploi, affiché dans Réglages → Aide. */
const GUIDE = () => process.env.GUIDE || path.join(ROOT, 'GUIDE.md')
export const REPO = process.env.HOMEDASH_REPO || 'lepetitpaco/homedash'
const CHECK_EVERY = 10 * 60 // un appel à GitHub par 10 min
const VERSION = 'version.json'

const state = {
  latest: null as string | null,
  incoming: [] as Entry[],
  checkedAt: null as number | null,
  error: null as string | null,
  release: null as { tag: string; url: string } | null,
}

export type Entry = { version: string; date: string; items: string[]; desktop?: string }

// ── Changelog ───────────────────────────────────────────────────────────────────
const HEAD = /^##\s+(\d+\.\d+\.\d+)\s*(?:[—-]\s*(.+))?$/
/** Sous le titre d'une version : `Appli de bureau : 1.4.0` = elle demande cette version de l'appli. */
const DESKTOP = /^(?:💻\s*)?\**Appli de bureau\s*:?\**\s*:?\s*(\d+\.\d+\.\d+)/i

/** `## 1.2.0 — 2026-10-13` suivi de lignes `- …` → [{version, date, items, desktop?}]. */
export function parse(text: string | null | undefined): Entry[] {
  const out: Entry[] = []
  for (const line of (text || '').split(/\r?\n/)) {
    const m = HEAD.exec(line.trim())
    const last = out[out.length - 1]
    if (m) out.push({ version: m[1], date: (m[2] || '').trim(), items: [] })
    else if (last && !last.items.length && DESKTOP.test(line.trim())) last.desktop = (DESKTOP.exec(line.trim()) as RegExpExecArray)[1]
    else if (last && line.startsWith('- ')) last.items.push(line.slice(2).trim())
    else if (last && last.items.length && line.startsWith('  ') && line.trim()) last.items[last.items.length - 1] += ' ' + line.trim()
  }
  return out
}

export function key(version: string | null | undefined): number[] {
  return ((version || '0').match(/\d+/g) || []).slice(0, 3).map(Number)
}

export function newer(a: string, b: string): boolean {
  const x = key(a)
  const y = key(b)
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0)
  return false
}

export function entries(): Entry[] {
  try {
    return parse(fs.readFileSync(CHANGELOG(), 'utf-8'))
  } catch {
    return []
  }
}

/** Texte de GUIDE.md ; vide s'il manque (la page Aide le dit). */
export function guide(): string {
  try {
    return fs.readFileSync(GUIDE(), 'utf-8')
  } catch {
    return ''
  }
}

export function current(): string {
  const e = entries()
  return e.length ? e[0].version : '0.0.0'
}

function readState(): Record<string, any> {
  try {
    return store.read<Record<string, any>>(VERSION, {}) || {}
  } catch {
    return {}
  }
}

// ── Instantané avant mise à jour ────────────────────────────────────────────────
/** À appeler au démarrage, avant le chargement de la config. */
export function onStart(): void {
  const now = current()
  const before = readState().version
  if (before === now) return
  if (before && fs.existsSync(store.pathOf(store.CONFIG))) {
    const name = backup.snapshot(`avant-${now}`)
    console.log(`💾 mise à jour ${before} → ${now} : données sauvegardées (${name})`)
  }
  store.write(VERSION, { ...readState(), version: now })
}

// ── Version disponible sur GitHub ───────────────────────────────────────────────
/** Point de passage unique vers le réseau (remplacé dans les tests). */
let open: (url: string, init: RequestInit) => Promise<Response> = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(12000) })

export function setOpen(fn: typeof open): void {
  open = fn
}

/** GET de l'API GitHub, avec le jeton du premier compte connecté s'il y en a un (dépôt privé). */
async function api(p: string): Promise<[number, any]> {
  const tok = accounts.allMods().find((m) => m.token())?.token()
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'homedash/2.0' }
  if (tok) headers.Authorization = `Bearer ${tok}`
  try {
    const res = await open(`https://api.github.com${p}`, { headers })
    const text = await res.text()
    return [res.status, text ? JSON.parse(text) : null]
  } catch (e) {
    return [0, { message: String((e as Error).message || e) }]
  }
}

function setState(patch: Partial<typeof state>): void {
  Object.assign(state, patch, { checkedAt: Date.now() / 1000 })
}

export async function check(): Promise<void> {
  const [st, rel] = await api(`/repos/${REPO}/releases/latest`)
  if (st === 404) {
    // Pas encore de Release (ou dépôt privé sans jeton) : rien à annoncer.
    const why = accounts.allMods().some((m) => m.token()) ? 'aucune version publiée pour le moment' : 'connecte un compte GitHub (Réglages) pour que homedash vérifie les mises à jour'
    return setState({ error: why, latest: null, incoming: [], release: null })
  }
  if (st !== 200 || !rel || typeof rel !== 'object') {
    const why = st === 403 ? "ton compte GitHub n'a pas accès au dépôt homedash" : 'GitHub ne répond pas pour le moment'
    errlog.record('serveur', `vérification des mises à jour : ${why}`, `GitHub ${st} sur ${REPO}`)
    return setState({ error: `impossible de vérifier les mises à jour : ${why}` })
  }
  const tag: string = rel.tag_name || ''
  const latest = tag.replace(/^v/, '')
  const mine = current()
  let incoming: Entry[] = []
  if (newer(latest, mine)) {
    // Ce qui arrive : le CHANGELOG de la version publiée, au-dessus de la nôtre.
    const [cs, file] = await api(`/repos/${REPO}/contents/CHANGELOG.md?ref=${encodeURIComponent(tag)}`)
    if (cs === 200 && file?.content) {
      try {
        incoming = parse(Buffer.from(file.content, 'base64').toString('utf-8')).filter((e) => newer(e.version, mine))
      } catch (e) {
        errlog.record('serveur', 'vérification des mises à jour', `changelog distant illisible : ${e}`)
      }
    }
    if (!incoming.length) incoming = [{ version: latest, date: (rel.published_at || '').slice(0, 10), items: rel.body ? [String(rel.body).slice(0, 500)] : [] }]
  }
  setState({ latest, incoming, error: null, release: { tag, url: rel.html_url || `https://github.com/${REPO}/releases/tag/${tag}` } })
  if (incoming.length && readState().announced !== latest) {
    // Une seule annonce par version, même après un redémarrage.
    events.record([
      events.event('update', 'info', 'github', `⬆️ homedash ${latest} disponible`, {
        body: 'Aide → Mettre à jour, dans l\'appli.',
        url: state.release?.url || '',
        tag: `update:${latest}`,
        sticky: true,
      }),
    ])
    store.write(VERSION, { ...readState(), announced: latest })
  }
}

export function payload(): Record<string, unknown> {
  return {
    current: current(),
    entries: entries(),
    latest: state.latest,
    incoming: state.incoming,
    update: state.incoming.length > 0,
    // 2.0 : plus de commande à taper, l'appli se met à jour elle-même.
    command: '',
    command_windows: '',
    dir: '',
    repo: REPO,
    release: state.release,
    checked_at: state.checkedAt,
    error: state.error,
  }
}

export function start(): void {
  const loop = async () => {
    try {
      await check()
    } catch (e) {
      errlog.record('serveur', 'vérification des mises à jour', String(e))
      setState({ error: 'impossible de vérifier les mises à jour pour le moment' })
    }
  }
  // laisser les comptes se connecter
  setTimeout(() => {
    void loop()
    setInterval(() => void loop(), CHECK_EVERY * 1000).unref()
  }, 20_000).unref()
}
