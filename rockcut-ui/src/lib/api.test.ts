import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import api from './api'

// D55 §2.1 (task 5120): a 401 on one route asks GET /api/me once before a tablet
// unpairs or a person is signed out.
describe('401 handling', () => {
  const store = new Map<string, string>()
  const reload = vi.fn()
  let meStatus: number | 'network' = 200
  const fetchMock = vi.fn(async () => {
    if (meStatus === 'network') throw new TypeError('Failed to fetch')
    return { ok: meStatus < 400, status: meStatus }
  })

  // Every `api` request answers with `status`.
  const answer = (status: number) => {
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      const response = { data: {}, status, statusText: '', headers: {}, config }
      if (status < 400) return response
      throw new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, response)
    }
  }

  const start = (token: string) => {
    store.clear()
    store.set('rockcut_token', token)
    store.set('rockcut_email', 'someone@rockcut-test.com')
  }

  beforeEach(() => {
    meStatus = 200
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    })
    vi.stubGlobal('window', { location: { reload }, dispatchEvent: vi.fn() })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockClear()
    reload.mockClear()
  })

  const meCalls = () => fetchMock.mock.calls as unknown as [string, RequestInit][]

  for (const [who, token] of [
    ['a tablet', 'dev_tablet'],
    ['a person', 'ses_person'],
  ] as const) {
    it(`${who}: a 401 on another route with /api/me 200 keeps the token (T1/T2)`, async () => {
      start(token)
      answer(401)
      await expect(api.get('/api/channels')).rejects.toMatchObject({ response: { status: 401 } })
      expect(meCalls()).toHaveLength(1)
      expect(meCalls()[0][0]).toBe('/api/me')
      expect(new Headers(meCalls()[0][1].headers).get('Authorization')).toBe(`Bearer ${token}`)
      expect(store.get('rockcut_token')).toBe(token)
      expect(store.has('rockcut_device_unpaired')).toBe(false)
      expect(reload).not.toHaveBeenCalled()
    })

    for (const other of ['network', 500] as const) {
      it(`${who}: /api/me ${other} keeps the token; the next request checks again`, async () => {
        start(token)
        answer(401)
        meStatus = other
        await expect(api.get('/api/channels')).rejects.toBeInstanceOf(AxiosError)
        expect(store.get('rockcut_token')).toBe(token)
        expect(reload).not.toHaveBeenCalled()
        await expect(api.get('/api/channels')).rejects.toBeInstanceOf(AxiosError)
        expect(meCalls()).toHaveLength(2)
      })
    }
  }

  it('a revoked tablet still unpairs (T3)', async () => {
    start('dev_tablet')
    answer(401)
    meStatus = 401
    await expect(api.get('/api/channels')).rejects.toBeInstanceOf(AxiosError)
    expect(store.has('rockcut_token')).toBe(false)
    expect(store.get('rockcut_device_unpaired')).toBe('1')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('a deactivated person is still signed out (T4)', async () => {
    start('ses_person')
    answer(401)
    meStatus = 401
    await expect(api.get('/api/channels')).rejects.toBeInstanceOf(AxiosError)
    expect(store.has('rockcut_token')).toBe(false)
    expect(store.has('rockcut_email')).toBe(false)
    expect(store.has('rockcut_device_unpaired')).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('a burst of 401s makes one /api/me call and one reload', async () => {
    start('dev_tablet')
    answer(401)
    meStatus = 401
    const results = await Promise.allSettled([
      api.get('/api/channels'),
      api.get('/api/boards/brewery'),
      api.get('/api/notifications'),
    ])
    expect(results.every((r) => r.status === 'rejected')).toBe(true)
    expect(meCalls()).toHaveLength(1)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('a 401 for an older token, or no token, is ignored: no check (D33)', async () => {
    start('ses_old')
    // Signed in again while the request was out: the 401 is for the older token.
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      store.set('rockcut_token', 'ses_new')
      const response = { data: {}, status: 401, statusText: '', headers: {}, config }
      throw new AxiosError('failed', 'ERR_BAD_REQUEST', config, null, response)
    }
    await expect(api.get('/api/channels')).rejects.toBeInstanceOf(AxiosError)
    store.delete('rockcut_token')
    answer(401)
    await expect(api.get('/api/channels')).rejects.toBeInstanceOf(AxiosError)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('a failed sign-in (POST /api/session 401) makes no check', async () => {
    start('dev_tablet')
    answer(401)
    await expect(api.post('/api/session', {})).rejects.toBeInstanceOf(AxiosError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a token changed during the check stands', async () => {
    start('ses_person')
    answer(401)
    fetchMock.mockImplementationOnce(async () => {
      store.set('rockcut_token', 'ses_other')
      return { ok: false, status: 401 }
    })
    await expect(api.get('/api/channels')).rejects.toBeInstanceOf(AxiosError)
    expect(store.get('rockcut_token')).toBe('ses_other')
    expect(reload).not.toHaveBeenCalled()
  })

  it('403 password_reset_required still dispatches the event (D42)', async () => {
    start('ses_person')
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      const response = { data: { error: 'password_reset_required' }, status: 403, statusText: '', headers: {}, config }
      throw new AxiosError('failed', 'ERR_BAD_REQUEST', config, null, response)
    }
    await expect(api.get('/api/channels')).rejects.toBeInstanceOf(AxiosError)
    expect(window.dispatchEvent).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
