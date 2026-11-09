import { afterEach, describe, expect, it, vi } from 'vitest'
import { settleLeftoverTabletSession } from './leftoverTabletSession'

// D54 S249: a tablet mid "Sign in as me" when the release went out.
describe('settleLeftoverTabletSession', () => {
  const store = new Map<string, string>()
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }))

  const stub = (entries: Record<string, string>) => {
    store.clear()
    for (const [k, v] of Object.entries(entries)) store.set(k, v)
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    })
    vi.stubGlobal('fetch', fetchMock)
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockClear()
  })

  it('puts the tablet token back, drops the personal state and signs the person out', () => {
    stub({
      rockcut_token: 'ses_person',
      rockcut_device_token: 'dev_tablet',
      rockcut_personal_last_activity: '123',
      rockcut_email: 'bartender1@rockcut-test.com',
    })
    settleLeftoverTabletSession()
    expect(Object.fromEntries(store)).toEqual({
      rockcut_token: 'dev_tablet',
      rockcut_pending_signouts: '["ses_person"]',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]).toMatchObject([
      '/api/session',
      { method: 'DELETE', headers: { Authorization: 'Bearer ses_person' } },
    ])
  })

  it('an abandoned sign-in form (no personal token): the tablet token goes back (4988)', () => {
    stub({ rockcut_device_token: 'dev_tablet' })
    settleLeftoverTabletSession()
    expect(Object.fromEntries(store)).toEqual({ rockcut_token: 'dev_tablet' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('leaves an ordinary browser alone', () => {
    stub({ rockcut_token: 'ses_person', rockcut_email: 'a@rockcut-test.com' })
    settleLeftoverTabletSession()
    expect(Object.fromEntries(store)).toEqual({ rockcut_token: 'ses_person', rockcut_email: 'a@rockcut-test.com' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('leaves a paired tablet alone', () => {
    stub({ rockcut_token: 'dev_tablet' })
    settleLeftoverTabletSession()
    expect(Object.fromEntries(store)).toEqual({ rockcut_token: 'dev_tablet' })
  })
})
