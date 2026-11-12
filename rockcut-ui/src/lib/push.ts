// Web Push subscribe/unsubscribe on this device (D21).
// The service worker only runs in the built app (vite preview / deploy), not the
// dev server, so these calls no-op gracefully when no SW registration exists.
import api from './api'
import parseApiError from './parseApiError'

export type PushState = 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed'

export function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  )
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!pushSupported()) return undefined
  // getRegistration resolves immediately (undefined if no SW — e.g. dev server),
  // avoiding the hang that navigator.serviceWorker.ready would cause there.
  return navigator.serviceWorker.getRegistration()
}

/** Current push state on this device (does not prompt). */
export async function currentPushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await registration()
  if (!reg) return 'unsupported'
  const sub = await reg.pushManager.getSubscription()
  return sub ? 'subscribed' : 'unsubscribed'
}

/** D58 §3.15 (4319): what a browser that refuses the subscription (e.g. a private window) shows. */
export const PUSH_SUBSCRIBE_FAILED = 'Push can’t be turned on in this browser (private windows don’t support it).'

/** The browser refused `pushManager.subscribe`. */
export class PushSubscribeError extends Error {
  constructor() {
    super(PUSH_SUBSCRIBE_FAILED)
    this.name = 'PushSubscribeError'
  }
}

/** What Enable push says when it fails: the browser's refusal, or the API's error. */
export const pushErrorMessage = (err: unknown) => (err instanceof PushSubscribeError ? err.message : parseApiError(err))

/**
 * Prompt for permission (if needed) and subscribe this device. Throws
 * `PushSubscribeError` when the browser refuses the subscription.
 */
export async function subscribePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  const reg = await registration()
  if (!reg) return 'unsupported'

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'unsubscribed'

  const { data } = await api.get<{ public_key: string }>('/api/push/public_key')
  if (!data.public_key) return 'unsupported'

  const existing = await reg.pushManager.getSubscription()
  let sub = existing
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.public_key),
      })
    } catch {
      throw new PushSubscribeError()
    }
  }

  const json = sub.toJSON()
  await api.post('/api/push/subscriptions', { endpoint: sub.endpoint, keys: json.keys })
  return 'subscribed'
}

/** Remove this device's subscription (server + browser). */
export async function unsubscribePush(): Promise<PushState> {
  const reg = await registration()
  if (!reg) return 'unsupported'
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    await api.delete('/api/push/subscriptions', { data: { endpoint: sub.endpoint } })
    await sub.unsubscribe()
  }
  return 'unsubscribed'
}
