import { expect, request, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { activeProfile } from '../../config/targets'
import { apiAs } from '../scheduler/helpers'

// D34: sessions are revocable, so a spec that signs out, changes a password or
// signs out other devices must not use a shared persona's token (that would
// sign the persona out for every later spec). These helpers make a throwaway
// `[TEST-TEMP]` person instead, with a password the spec generates itself:
// never the seed password (test-credentials-policy.md). `setup` deletes them.

export interface TempPerson {
  id: number
  email: string
  name: string
  password: string
}

function randomSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** A throwaway password, never reused: long enough for the 8-character rule. */
export function throwawayPassword(): string {
  return `tmp-${randomSuffix()}-${Math.random().toString(36).slice(2, 8)}`
}

/** A fresh API context with no token (sign-in calls). */
export async function anonApi(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: activeProfile().apiUrl })
}

/** Sign in through the API; resolves to the new `ses_` token. */
export async function signIn(person: Pick<TempPerson, 'email' | 'password'>, deviceToken?: string): Promise<string> {
  const api = await anonApi()
  const res = await api.post('/api/session', {
    data: { email: person.email, password: person.password },
    headers: deviceToken ? { 'X-Rockcut-Device': deviceToken } : undefined,
  })
  expect(res.status(), await res.text()).toBe(200)
  const token = (await res.json()).token as string
  await api.dispose()
  return token
}

/** An API context authenticated with `token`. */
export async function apiWith(token: string): Promise<APIRequestContext> {
  return request.newContext({ baseURL: activeProfile().apiUrl, extraHTTPHeaders: { Authorization: `Bearer ${token}` } })
}

/** HTTP status of `GET /api/me` with `token`: 200 while the session lives, 401 once revoked. */
export async function meStatus(token: string): Promise<number> {
  const api = await apiWith(token)
  const status = (await api.get('/api/me')).status()
  await api.dispose()
  return status
}

/**
 * Create a `[TEST-TEMP]` person as the owner (a Taproom employee by default).
 * `ready: true` (the default) also sets their own password through the API,
 * so they don't land on the forced reset; `ready: false` leaves the temporary
 * password and `must_reset_password` in place.
 */
export async function createTempPerson(
  label: string,
  opts: { ready?: boolean; memberships?: { department: string; role: 'employee' | 'manager' }[] } = {},
): Promise<TempPerson> {
  const owner = await apiAs('owner')
  const suffix = randomSuffix()
  const temp = throwawayPassword()
  const res = await owner.post('/api/users', {
    data: {
      email: `temp-${suffix}@rockcut-test.com`,
      name: `[TEST-TEMP] ${label} ${suffix}`,
      password: temp,
      memberships: opts.memberships ?? [{ department: 'bar', role: 'employee' }],
    },
  })
  expect(res.status(), await res.text()).toBe(201)
  const user = (await res.json()).data as { id: number; email: string; name: string }
  const person: TempPerson = { id: user.id, email: user.email, name: user.name, password: temp }

  if (opts.ready ?? true) {
    const token = await signIn(person)
    const api = await apiWith(token)
    const password = throwawayPassword()
    const changed = await api.post('/api/session/password', { data: { current_password: temp, new_password: password } })
    expect(changed.status(), await changed.text()).toBe(200)
    await api.delete('/api/session')
    await api.dispose()
    person.password = password
  }
  return person
}

/** Deactivate a temp person at the end of a spec (`setup` deletes the row later). */
export async function retireTempPerson(person: TempPerson | null) {
  if (!person) return
  const owner = await apiAs('owner')
  await owner.patch(`/api/users/${person.id}`, { data: { active: false } })
}

/** A new browser context signed in with `token` (no UI login). */
export async function contextWith(browser: Browser, token: string): Promise<{ context: BrowserContext; page: Page }> {
  const { uiUrl } = activeProfile()
  const context = await browser.newContext({
    baseURL: uiUrl,
    storageState: { cookies: [], origins: [{ origin: new URL(uiUrl).origin, localStorage: [{ name: 'rockcut_token', value: token }] }] },
  })
  return { context, page: await context.newPage() }
}
