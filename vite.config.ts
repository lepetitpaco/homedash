import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// En dev (Docker, :7778), l'API vit dans le serveur TypeScript à côté (:7779) :
// le `Host` d'origine est gardé, c'est lui que le serveur contrôle.
const api = process.env.HOMEDASH_API || 'http://127.0.0.1:7779'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      // En dev, les captures du guide : l'appli les embarque sous guide/ (desktop/assemble.sh).
      name: 'guide-captures',
      configureServer(server) {
        server.middlewares.use('/guide', (req, res, next) => {
          const name = path.basename(decodeURIComponent((req.url ?? '').split('?')[0]))
          const file = path.resolve('docs/screenshots', name)
          if (!name || !fs.existsSync(file)) return next()
          res.setHeader('content-type', 'image/jpeg')
          fs.createReadStream(file).pipe(res)
        })
      },
    },
  ],
  server: {
    allowedHosts: ['homedash-dev.localhost', 'localhost'],
    proxy: { '/api': { target: api, changeOrigin: false } },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
