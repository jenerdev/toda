// Service-worker push handlers for MotoQueue ride-offer notifications.
// This file is imported into the generated Workbox service worker via
// `workbox.importScripts` (see vite.config.ts), so it runs in the SW scope and
// works even when the app is fully closed / the phone is locked.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (_e) {
    /* non-JSON payload — fall back to defaults */
  }

  const title = data.title || 'MotoQueue'
  const options = {
    body: data.body || 'You have a new ride offer.',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: data.tag || 'ride-offer',
    requireInteraction: true, // keep it on screen until the driver acts
    data: { url: data.url || '/driver' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/driver'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus an existing tab if one is open, else open a new one.
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
    }),
  )
})
