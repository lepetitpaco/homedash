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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
