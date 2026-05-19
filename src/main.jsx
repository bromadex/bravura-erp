import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { registerServiceWorker } from './lib/pushNotifications'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Register service worker for PWA + push notifications (production only;
// avoid noisy dev-time SW caching during HMR).
if (import.meta.env.PROD) {
  window.addEventListener('load', () => {
    registerServiceWorker().catch(() => { /* silent */ })
  })
}
