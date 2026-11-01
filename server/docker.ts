/**
 * Liens vers les containers Docker de la machine, pour les développeurs.
 *
 * Le socket Docker donne le contrôle total de la machine : ce fichier n'y envoie
 * qu'une requête, `GET /containers/json`, écrite en dur ci-dessous. Aucune adresse
 * ne vient de la page, et rien n'est démarré, arrêté ni modifié. Testé.
 */

import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

export type DockerLink = {
  /** `nom-port`, stable : sert de clé pour masquer ce lien. */
  id: string
  label: string
  url: string
  container: string
  image: string
  port: number
}

const REQUEST_PATH = '/containers/json'
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

/** Les liens web d'une réponse de Docker : un par port TCP publié. */
export function linksOf(list: unknown): DockerLink[] {
  if (!Array.isArray(list)) return []
  const links: DockerLink[] = []
  for (const c of list as Record<string, unknown>[]) {
    const names = Array.isArray(c?.Names) ? (c.Names as unknown[]) : []
    const container = String(names[0] ?? '').replace(/^\//, '')
    if (!/^[\w.-]+$/.test(container)) continue
    const ports = new Map<number, string>()
    for (const p of (Array.isArray(c.Ports) ? c.Ports : []) as Record<string, unknown>[]) {
      const pub = Number(p?.PublicPort)
      if (p?.Type !== 'tcp' || !Number.isInteger(pub) || pub < 1 || pub > 65535) continue
      if (NOT_WEB.has(pub) || NOT_WEB.has(Number(p.PrivatePort))) continue
      const ip = String(p.IP ?? '')
      const host = ['', '0.0.0.0', '::', '127.0.0.1', '::1'].includes(ip) ? 'localhost' : /^[\d.]+$/.test(ip) ? ip : null
      if (host && !ports.has(pub)) ports.set(pub, host)
    }
    const many = ports.size > 1
    for (const [port, host] of [...ports].sort((a, b) => a[0] - b[0])) {
      links.push({
        id: `${container}-${port}`,
        label: many ? `${container} :${port}` : container,
        url: `http://${host}:${port}/`,
        container,
        image: typeof c.Image === 'string' ? c.Image : '',
        port,
      })
    }
  }
  return links.sort((a, b) => a.label.localeCompare(b.label))
}

/** Docker répond-il, et quels liens ? Sans Docker : `available: false`, sans erreur. */
export async function read(candidates = sockets()): Promise<{ available: boolean; links: DockerLink[] }> {
  for (const socket of candidates) {
    if (!socket.startsWith('\\\\') && !fs.existsSync(socket)) continue
    try {
      return { available: true, links: linksOf(await ask(socket)) }
    } catch {
      /* ce socket ne répond pas : le suivant */
    }
  }
  return { available: false, links: [] }
}
