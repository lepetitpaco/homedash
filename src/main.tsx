import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/index.css'

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
