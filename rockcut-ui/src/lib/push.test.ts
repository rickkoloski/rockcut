import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api', () => ({
  default: {
    get: vi.fn(async () => ({ data: { public_key: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U' } })),
    post: vi.fn(async () => ({ data: {} })),
  },
}))

import { PUSH_SUBSCRIBE_FAILED, PushSubscribeError, pushErrorMessage, subscribePush } from './push'

// A browser that has push but refuses the subscription, as a private window does.
function stubBrowser(subscribe: () => Promise<unknown>) {
  const reg = { pushManager: { getSubscription: async () => null, subscribe } }
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => reg } })
  vi.stubGlobal('window', { PushManager: class {}, Notification: class {} })
  vi.stubGlobal('Notification', { permission: 'default', requestPermission: async () => 'granted' })
}

describe('subscribePush (D58 §3.15)', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('a refused subscription throws PushSubscribeError with the message', async () => {
    stubBrowser(async () => {
      throw new DOMException('Registration failed - push service not available', 'AbortError')
    })
    const failed = subscribePush()
    await expect(failed).rejects.toBeInstanceOf(PushSubscribeError)
    await expect(subscribePush()).rejects.toThrow(PUSH_SUBSCRIBE_FAILED)
  })

  it('a subscription that works is saved and reported', async () => {
    stubBrowser(async () => ({ endpoint: 'https://push.example/1', toJSON: () => ({ keys: { p256dh: 'p', auth: 'a' } }) }))
    await expect(subscribePush()).resolves.toBe('subscribed')
  })
})

describe('pushErrorMessage', () => {
  it('says why for a refused subscription, and the API error otherwise', () => {
    expect(pushErrorMessage(new PushSubscribeError())).toBe(PUSH_SUBSCRIBE_FAILED)
    expect(pushErrorMessage({ response: { status: 500, data: { error: 'Server error' } } })).not.toBe(PUSH_SUBSCRIBE_FAILED)
  })
})
