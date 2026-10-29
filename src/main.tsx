import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { watchCrashes } from './lib/errors'
import './styles/index.css'

// Plantages non rattrapés : au journal d'erreurs (Réglages → Aide).
watchCrashes()

// PWA : installable et ouvrable serveur arrêté. Le service worker n'existe
// qu'en contexte sûr (localhost, HTTPS) : ailleurs (accès réseau en http), on
// s'en passe.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => undefined)
  })
}

// Dev (Docker :7778) : favicon orange, pour ne pas confondre avec homedash de tous les jours (bleu).
if (import.meta.env.DEV) {
  const img = new Image()
  img.onload = () => {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')
    if (!g) return
    g.filter = 'hue-rotate(185deg) saturate(1.6)'
    g.drawImage(img, 0, 0, 64, 64)
    document.querySelector('link[rel="icon"]')?.setAttribute('href', c.toDataURL('image/png'))
  }
  img.src = 'icon-192.png'
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
