import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En dev (Docker, :7778), l'API vit dans le serveur TypeScript à côté (:7779) :
// le `Host` d'origine est gardé, c'est lui que le serveur contrôle.
const api = process.env.HOMEDASH_API || 'http://127.0.0.1:7779'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    allowedHosts: ['homedash-dev.localhost', 'localhost'],
    proxy: { '/api': { target: api, changeOrigin: false } },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
