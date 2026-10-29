/**
 * Journal d'erreurs : ce qui a raté, côté serveur comme côté page.
 *
 * Une ligne JSON par erreur dans `data/logs/errors-AAAA-MM-JJ.jsonl`, gardé
 * KEEP_DAYS jours. Chaque entrée garde ce que l'utilisateur a lu (`shown`) et
 * le détail technique (`detail`). Affiché dans Réglages → Aide.
 *
 * Jamais de secret : les jetons reconnaissables sont masqués avant écriture,
 * et les textes sont tronqués.
 */

import fs from 'node:fs'
import path from 'node:path'

import * as store from './store.ts'

export const KEEP_DAYS = 30
const MAX_TEXT = 600
const MAX_LIST = 200
/** Page qui boucle sur une erreur : au plus N entrées identiques par minute. */
const BURST = 3

const recent = new Map<string, number[]>()

// Jetons GitHub, Basecamp (Bearer), secrets d'URL : remplacés par « *** ».
const SECRETS =
  /(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|(?:token|secret|password|code)=[^&\s"']+)/gi

function dir(): string {
  return path.join(store.DATA_DIR(), 'logs')
}

export function clean(text: unknown): string | null {
  if (text === undefined || text === null) return null
  const t = String(text).replace(SECRETS, '***')
  return t.length <= MAX_TEXT ? t : t.slice(0, MAX_TEXT) + '…'
}

export type ErrorEntry = { ts: number; source: string; where: string | null; shown: string | null; detail: string | null }

/** Note une erreur. `source` : serveur, page, appli… */
export function record(source: string, shown: unknown, detail?: unknown, where?: unknown): void {
  const entry: ErrorEntry = {
    ts: Date.now() / 1000,
    source: String(source).slice(0, 20),
    where: clean(where),
    shown: clean(shown),
    detail: clean(detail),
  }
  const key = JSON.stringify([entry.source, entry.where, entry.detail || entry.shown])
  const now = entry.ts
  const hits = (recent.get(key) || []).filter((t) => now - t < 60)
  if (hits.length >= BURST) return
  recent.set(key, [...hits, now])
  if (recent.size > 500) recent.clear()
  try {
    fs.mkdirSync(dir(), { recursive: true })
    fs.appendFileSync(path.join(dir(), `errors-${store.today()}.jsonl`), JSON.stringify(entry) + '\n')
    prune()
  } catch {
    /* disque plein : l'erreur d'origine compte plus que son journal */
  }
}

function files(): string[] {
  try {
    return fs.readdirSync(dir()).filter((n) => /^errors-.*\.jsonl$/.test(n)).sort()
  } catch {
    return []
  }
}

function prune(): void {
  const limit = store.today(new Date(Date.now() - KEEP_DAYS * 86400 * 1000))
  for (const n of files()) {
    if (n.slice('errors-'.length, -'.jsonl'.length) < limit) fs.rmSync(path.join(dir(), n), { force: true })
  }
}

/** Les erreurs les plus récentes d'abord. */
export function listing(limit = MAX_LIST): ErrorEntry[] {
  const out: ErrorEntry[] = []
  for (const n of files().reverse()) {
    let lines: string[]
    try {
      lines = fs.readFileSync(path.join(dir(), n), 'utf-8').split('\n').filter(Boolean)
    } catch {
      continue
    }
    for (const line of lines.reverse()) {
      try {
        out.push(JSON.parse(line))
      } catch {
        continue
      }
      if (out.length >= limit) return out
    }
  }
  return out
}

export function clear(): void {
  for (const n of files()) fs.rmSync(path.join(dir(), n), { force: true })
}

/** Tests : oublie l'anti-rafale. */
export function resetBurst(): void {
  recent.clear()
}
