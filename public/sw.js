// Bravura ERP — Service Worker
// Handles web push notifications and provides minimal offline shell.

const CACHE_VERSION = 'bravura-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  )
})

// ── Push event ─────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch (e) {
    payload = { title: 'Bravura ERP', body: event.data ? event.data.text() : 'You have a new notification' }
  }

  const title = payload.title || 'Bravura ERP'
  const options = {
    body:    payload.body    || payload.message || '',
    icon:    payload.icon    || '/icon-192.svg',
    badge:   payload.badge   || '/icon-192.svg',
    tag:     payload.tag     || `bravura-${Date.now()}`,
    data: {
      link:       payload.link || '/',
      event_type: payload.event_type,
      timestamp:  Date.now(),
    },
    requireInteraction: payload.requireInteraction || false,
    silent:             payload.silent || false,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// ── Click event — open or focus the right tab ──────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification?.data?.link || '/'

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    // Try to focus existing tab and navigate it
    for (const client of allClients) {
      if ('focus' in client) {
        await client.focus()
        if ('navigate' in client) {
          try { await client.navigate(target) } catch (e) { /* cross-origin fallback */ }
        }
        return
      }
    }
    // No open tab — open a new one
    if (self.clients.openWindow) {
      await self.clients.openWindow(target)
    }
  })())
})

// ── Push subscription change ───────────────────────────────────
self.addEventListener('pushsubscriptionchange', (event) => {
  // The subscription has expired/changed. The app will re-subscribe on next load.
  // We just close the old subscription and let the client handle re-registration.
  event.waitUntil(self.registration.pushManager.getSubscription().then(sub => sub && sub.unsubscribe()))
})
