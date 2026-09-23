/// <reference lib="webworker" />
// Custom service worker (D21). Keeps the D19 app-shell precache and SPA
// navigation fallback (Workbox), and adds Web Push handlers.
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { clientsClaim } from 'workbox-core'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> }

// Precache the built app shell (injected at build time).
precacheAndRoute(self.__WB_MANIFEST)

// SPA fallback: serve index.html for navigations, except API/dev requests.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api/, /^\/dev/],
  }),
)

// autoUpdate: activate a new SW immediately and take control of open pages.
self.skipWaiting()
clientsClaim()

interface PushPayload {
  title?: string
  body?: string
  data?: { url?: string; shift_id?: number } & Record<string, unknown>
}

self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload = {}
  try {
    payload = event.data?.json() ?? {}
  } catch {
    payload = { title: event.data?.text() }
  }

  const title = payload.title || 'Rockcut'
  const options: NotificationOptions = {
    body: payload.body || '',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    data: payload.data || {},
    tag: payload.data?.shift_id ? `shift-${payload.data.shift_id}` : undefined,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const target = (event.notification.data && (event.notification.data as { url?: string }).url) || '/schedule'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          void (client as WindowClient).focus()
          if ('navigate' in client) void (client as WindowClient).navigate(target)
          return
        }
      }
      return self.clients.openWindow(target).then(() => undefined)
    }),
  )
})
