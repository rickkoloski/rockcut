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

// Pages served by a worker from before D45 have no prompt to send that, never
// check for a new build, and a plain reload doesn't let a waiting worker in.
// So the first D45 worker on a device takes over at once, as every worker did
// before, and reloads the open pages itself, once (Q5). It leaves PROMPT_MARK
// so every worker after it waits for the prompt.
const PROMPT_MARK = 'rockcut-sw-prompt-v1'
// Set at install when a pre-D45 worker was in charge: activate then reloads
// the pages. Kept in a cache, not a variable: the browser may stop the worker
// between install and activate.
const TAKEOVER = 'rockcut-sw-takeover'

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      if (await caches.has(PROMPT_MARK)) return
      // A first visit has no worker in charge and no pages to reload.
      if (self.registration.active) await caches.open(TAKEOVER)
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event: ExtendableEvent) => {
  const takeover = (async () => {
    const takeover = await caches.has(TAKEOVER)
    // Marked before any reload, so a reloaded page (or a later activation)
    // never reloads again.
    await caches.open(PROMPT_MARK)
    await caches.delete(TAKEOVER)
    if (takeover) await self.clients.claim()
    return takeover
  })()
  event.waitUntil(takeover)
  // Not inside waitUntil: a page's reload waits for this worker to finish
  // activating, so waiting on the reload here would never end.
  void takeover.then(async (reload) => {
    if (!reload) return
    const pages = await self.clients.matchAll({ type: 'window' })
    await Promise.all(pages.map((page) => page.navigate(page.url).catch(() => null)))
  })
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
