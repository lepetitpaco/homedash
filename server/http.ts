/**
 * Transport HTTP de `app.handle()` : serveur de dev (Docker, :7778) et option
 * « accès depuis le navigateur » de l'appli (127.0.0.1:7777).
 */

import fs from 'node:fs'
import http from 'node:http'

import { MAX_BODY, handle, type Req, type Transport } from './app.ts'

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      // au-delà, on garde juste de quoi faire répondre « trop volumineux »
      if (size <= MAX_BODY + 1) chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export function createServer(t: Transport): http.Server {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost')
      const headers: Record<string, string | undefined> = {}
      for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v
      const r: Req = { method: req.method || 'GET', path: url.pathname, query: url.searchParams, headers, body: await readBody(req) }
      const out = await handle(r, t)
      const head = req.method === 'HEAD'
      if (out.file) {
        const size = fs.statSync(out.file).size
        res.writeHead(out.status, { ...out.headers, 'Content-Length': String(size) })
        if (head) return res.end()
        fs.createReadStream(out.file).pipe(res)
        return
      }
      const body = typeof out.body === 'string' ? Buffer.from(out.body) : out.body
      res.writeHead(out.status, { ...out.headers, 'Content-Length': String(body.length) })
      res.end(head ? undefined : body)
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: String((e as Error).message || e) }))
    }
  })
}
