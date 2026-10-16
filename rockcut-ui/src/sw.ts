/// <reference lib="webworker" />
// Custom service worker (D21). Keeps the D19 app-shell precache and SPA
// navigation fallback (Workbox), and adds Web Push handlers.
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { clientsClaim } from 'workbox-core'
import { SW_NAVIGATION_DENYLIST } from './lib/swNavigation'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> }

// Precache the built app shell (injected at build time).
precacheAndRoute(self.__WB_MANIFEST)

// SPA fallback: serve index.html for navigations, except API/dev requests.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: SW_NAVIGATION_DENYLIST,
  }),
)

// D45: prompt mode. A new worker waits until the page asks it to take over
// ("New version available · Reload" sends SKIP_WAITING), so nobody's open page
// is swapped out from under them.
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})

// Pages served by a worker from before D45 have no prompt to send that, and a
// plain reload doesn't let a waiting worker in. So the first D45 worker on a
// device takes over at once, as every worker did before; it leaves this mark
// so the ones after it wait.
const PROMPT_MARK = 'rockcut-sw-prompt-v1'
self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(caches.has(PROMPT_MARK).then((promptAware) => (promptAware ? undefined : self.skipWaiting())))
})
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(caches.open(PROMPT_MARK).then(() => undefined))
})

// The new worker controls open pages once it takes over (their reload follows).
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
