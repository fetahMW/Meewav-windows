import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// Restart the auth walkthrough on document loads, while keeping client navigation free.
if (import.meta.env.DEV && import.meta.env.VITE_AUTH_ENTRY_PREVIEW === 'true') {
  window.history.replaceState(null, '', '/auth');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
