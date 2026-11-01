/**
 * Liens vers les containers Docker de la machine, pour les développeurs.
 *
 * Le socket Docker donne le contrôle total de la machine : ce fichier n'y envoie
 * qu'une requête, `GET /containers/json?all=1`, écrite en dur ci-dessous. Aucune adresse
 * ne vient de la page, et rien n'est démarré, arrêté ni modifié. Testé.
 */

import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

export type DockerPort = { port: number; url: string }

/** Une ligne de la liste : un projet Docker Compose, ou un container seul. */
export type DockerEntry = {
  /** Nom du projet ou du container, stable : sert de clé pour masquer cette ligne. */
  id: string
  label: string
  image: string
  /** En marche avec une page web. Sinon : éteint, affiché mais pas cliquable. */
  running: boolean
  /** Ports web, du plus petit au plus grand : le premier est celui qu'on ouvre. */
  ports: DockerPort[]
}

const REQUEST_PATH = '/containers/json?all=1'
const TIMEOUT_MS = 2000
const MAX_BYTES = 2 * 1024 * 1024
/** Ports qui ne servent pas de page web : bases de données, files de messages, SSH… */
const NOT_WEB = new Set([22, 25, 1433, 3306, 5432, 5672, 6379, 9042, 11211, 27017])

/** Où chercher Docker, dans l'ordre. Un `DOCKER_HOST` réseau est ignoré : seule la machine compte. */
export function sockets(env: NodeJS.ProcessEnv = process.env, home = os.homedir(), platform = process.platform): string[] {
  const asked = env.DOCKER_HOST ?? ''
  const fromEnv = asked.startsWith('unix://') ? [asked.slice('unix://'.length)] : asked.startsWith('npipe://') ? [asked.slice('npipe:'.length).replace(/\//g, '\\')] : []
  if (platform === 'win32') return [...fromEnv, '\\\\.\\pipe\\docker_engine']
  return [
    ...fromEnv,
    '/var/run/docker.sock',
    path.join(home, '.docker/run/docker.sock'),
    path.join(home, '.colima/default/docker.sock'),
    path.join(home, '.orbstack/run/docker.sock'),
  ]
}

function ask(socketPath: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath, path: REQUEST_PATH, method: 'GET', timeout: TIMEOUT_MS }, (res) => {
      const chunks: Buffer[] = []
      let size = 0
      res.on('data', (c: Buffer) => {
        size += c.length
        if (size > MAX_BYTES) return req.destroy(new Error('réponse trop longue'))
        chunks.push(c)
      })
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`réponse ${res.statusCode}`))
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()))
        } catch (e) {
          reject(e as Error)
        }
      })
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('délai dépassé')))
    req.on('error', reject)
    req.end()
  })
}

type Group = { id: string; image: string; compose: boolean; up: boolean; ports: Map<number, string> }

/**
 * Les lignes à afficher, d'après une réponse de Docker : une par projet Compose, sinon une par
 * container. Éteints : seulement ceux d'un projet Compose. Les autres sont le plus souvent des
 * restes de `docker run`, sans intérêt. En marche sans page web : rien à ouvrir, pas de ligne.
 */
export function entriesOf(list: unknown): DockerEntry[] {
  if (!Array.isArray(list)) return []
  const groups = new Map<string, Group>()
  for (const c of list as Record<string, unknown>[]) {
    const names = Array.isArray(c?.Names) ? (c.Names as unknown[]) : []
    const container = String(names[0] ?? '').replace(/^\//, '')
    if (!/^[\w.-]+$/.test(container)) continue
    const labels = (c.Labels && typeof c.Labels === 'object' ? c.Labels : {}) as Record<string, unknown>
    if (labels['com.docker.compose.oneoff'] === 'True') continue
    const project = labels['com.docker.compose.project']
    const compose = typeof project === 'string' && /^[\w.-]+$/.test(project)
    const id = compose ? project : container
    const group = groups.get(id) ?? { id, image: typeof c.Image === 'string' ? c.Image : '', compose, up: false, ports: new Map() }
    groups.set(id, group)
    if (c.State !== 'running') continue
    group.up = true
    for (const p of (Array.isArray(c.Ports) ? c.Ports : []) as Record<string, unknown>[]) {
      const pub = Number(p?.PublicPort)
      if (p?.Type !== 'tcp' || !Number.isInteger(pub) || pub < 1 || pub > 65535) continue
      if (NOT_WEB.has(pub) || NOT_WEB.has(Number(p.PrivatePort))) continue
      const ip = String(p.IP ?? '')
      const host = ['', '0.0.0.0', '::', '127.0.0.1', '::1'].includes(ip) ? 'localhost' : /^[\d.]+$/.test(ip) ? ip : null
      if (host && !group.ports.has(pub)) group.ports.set(pub, host)
    }
  }
  const entries: DockerEntry[] = []
  for (const g of groups.values()) {
    const running = g.ports.size > 0
    if (!running && (g.up || !g.compose)) continue
    const ports = [...g.ports].sort((a, b) => a[0] - b[0]).map(([port, host]) => ({ port, url: `http://${host}:${port}/` }))
    entries.push({ id: g.id, label: g.id, image: g.image, running, ports })
  }
  return entries.sort((a, b) => Number(b.running) - Number(a.running) || a.label.localeCompare(b.label))
}

/** Docker répond-il, et quels liens ? Sans Docker : `available: false`, sans erreur. */
export async function read(candidates = sockets()): Promise<{ available: boolean; entries: DockerEntry[] }> {
  for (const socket of candidates) {
    if (!socket.startsWith('\\\\') && !fs.existsSync(socket)) continue
    try {
      return { available: true, entries: entriesOf(await ask(socket)) }
    } catch {
      /* ce socket ne répond pas : le suivant */
    }
  }
  return { available: false, entries: [] }
}
