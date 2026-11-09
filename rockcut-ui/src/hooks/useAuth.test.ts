import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// D55 §2.1 (task 5120): start-up's own GET /api/me. A 401 the recheck doesn't
// confirm keeps the token and retries ("Can't reach the server"); a confirmed
// one ends it as before.
describe('useAuth.loadMe after a 401', () => {
  const store = new Map<string, string>()
  const reload = vi.fn()
  let meStatus = 200
  const fetchMock = vi.fn(async () => ({ ok: meStatus < 400, status: meStatus }))

  beforeEach(() => {
    vi.resetModules()
    store.clear()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    })
    vi.stubGlobal('window', { location: { reload }, dispatchEvent: vi.fn(), addEventListener: vi.fn() })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockClear()
    reload.mockClear()
  })

  const load = async (token: string) => {
    store.set('rockcut_token', token)
    const api = (await import('../lib/api')).default
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      const response = { data: {}, status: 401, statusText: '', headers: {}, config }
      throw new AxiosError('failed', 'ERR_BAD_REQUEST', config, null, response)
    }
    const useAuth = (await import('./useAuth')).default
    await useAuth.getState().loadMe()
    return useAuth.getState()
  }

  for (const token of ['dev_tablet', 'ses_person']) {
    it(`${token}: recheck 200 keeps the token and retries`, async () => {
      meStatus = 200
      const state = await load(token)
      expect(store.get('rockcut_token')).toBe(token)
      expect(store.has('rockcut_device_unpaired')).toBe(false)
      expect(state.unreachable).toBe(true)
      expect(state.bootstrapped).toBe(false)
      expect(reload).not.toHaveBeenCalled()
    })
  }

  // Lead decisions 1, item 5: a session that really ended ends on the first
  // try: one /api/me recheck, one reload, no "retrying" state.
  it('a revoked tablet: recheck 401 unpairs on the first try', async () => {
    meStatus = 401
    const state = await load('dev_tablet')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(state.unreachable).toBe(false)
    expect(store.has('rockcut_token')).toBe(false)
    expect(store.get('rockcut_device_unpaired')).toBe('1')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('a deactivated person: recheck 401 signs out on the first try', async () => {
    meStatus = 401
    const state = await load('ses_person')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(state.unreachable).toBe(false)
    expect(store.has('rockcut_token')).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
