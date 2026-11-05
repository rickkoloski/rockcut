import { readFileSync } from 'node:fs'
import { test, expect as baseExpect, type APIRequestContext } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { activeProfile } from '../../config/targets'
import { apiAs, tempTag } from '../scheduler/helpers'
import { anonApi, apiWith, contextWith, createTempPerson, logOut, meStatus, retireTempPerson, signIn, type TempPerson } from '../auth/helpers'
import { createDevice, deleteDevices, expectUnpaired, getDevice, pairingCode } from './helpers'

// D54: a paired tablet takes no personal logins (S244–S251), and a tablet left
// mid "Sign in as me" at the release goes back to its shared screen. People
// are [TEST-TEMP] (D34: never a persona's session); the shared taproomDevice
// token is only read, never revoked.
const expect = baseExpect.configure({ timeout: 15_000 })
// Several full page loads per test on the local dev server (see device_session.spec.ts).
test.describe.configure({ timeout: 60_000 })

const REFUSAL = 'This device is already set as a shared device. Personal logins not accepted.'

function taproomDeviceToken(): string {
  const state = JSON.parse(readFileSync(authFile('taproomDevice'), 'utf8'))
  return state.origins[0].localStorage.find((e: { name: string }) => e.name === 'rockcut_token').value
}

/** `POST /api/session` with an optional `X-Rockcut-Device`; returns status and body. */
async function postSession(email: string, password: string, deviceToken?: string) {
  const api = await anonApi()
  const res = await api.post('/api/session', {
    data: { email, password },
    headers: deviceToken ? { 'X-Rockcut-Device': deviceToken } : undefined,
  })
  const out = { status: res.status(), body: await res.json() }
  await api.dispose()
  return out
}

/** A `[TEST-TEMP]` Taproom device with one tablet paired through the API; its plain token. */
async function pairedTempTablet(owner: APIRequestContext, tag: string): Promise<{ deviceId: number; token: string }> {
  const device = await createDevice(owner, tag)
  const api = await anonApi()
  const res = await api.post('/api/device_tokens', { data: { code: await pairingCode(owner, device.id), name: `${tag} iPad` } })
  expect(res.status(), await res.text()).toBe(201)
  const token = (await res.json()).token as string
  await api.dispose()
  return { deviceId: device.id, token }
}

async function revokeTablet(owner: APIRequestContext, deviceId: number) {
  const row = (await getDevice(owner, deviceId))!.tokens[0]
  const res = await owner.delete(`/api/device_tokens/${row.id}`)
  expect([200, 204]).toContain(res.status())
}

let tag = ''
let person: TempPerson | null = null
test.afterEach(async () => {
  if (tag) await deleteDevices(await apiAs('owner'), tag)
  await retireTempPerson(person)
  tag = ''
  person = null
})

test.describe('taproomDevice', () => {
  test.use({ storageState: authFile('taproomDevice') })

  test('S244: the tablet header has no Sign in as me; the pill and Sign out stay', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('device-chip')).toContainText('Shared device · Taproom')
    await expect(page.getByTestId('device-signout')).toBeVisible()
    await expect(page.getByTestId('personal-signin')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Sign in/ })).toHaveCount(0)
    await expect(page.getByTestId('personal-session-banner')).toHaveCount(0)
  })

  test('S245: a typed /login shows the refusal and no form', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByTestId('shared-device-login-refused')).toHaveText(REFUSAL)
    await expect(page.getByTestId('login-email')).toHaveCount(0)
    await expect(page.getByTestId('login-password')).toHaveCount(0)
    await expect(page.getByTestId('login-submit')).toHaveCount(0)
    // Still the tablet, still paired.
    await expect(page.getByTestId('device-chip')).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('rockcut_token'))).toBe(taproomDeviceToken())
  })
})

test.describe('the API', () => {
  test('S246: a live tablet header is refused for the right and a wrong password; no session is made', async () => {
    person = await createTempPerson('D54 S246')
    const device = taproomDeviceToken()

    for (const password of [person.password, `${person.password}-wrong`]) {
      const res = await postSession(person.email, password, device)
      expect(res.status).toBe(403)
      expect(res.body).toEqual({ error: REFUSAL })
    }

    // Persist-verify: signed in normally, there's no other live session to sign out.
    const token = await signIn(person)
    const api = await apiWith(token)
    const others = await api.delete('/api/sessions/others')
    expect(others.status()).toBe(200)
    expect((await others.json()).revoked).toBe(0)
    await api.dispose()
    // The tablet is untouched.
    expect(await meStatus(device)).toBe(200)
  })

  test('S248: a revoked tablet token in the header is ignored: a normal login', async () => {
    tag = tempTag('D54 S248')
    person = await createTempPerson('D54 S248')
    const owner = await apiAs('owner')
    const { deviceId, token: device } = await pairedTempTablet(owner, tag)
    expect((await postSession(person.email, person.password, device)).status).toBe(403)

    await revokeTablet(owner, deviceId)
    const res = await postSession(person.email, person.password, device)
    expect(res.status).toBe(200)
    expect(await meStatus(res.body.token)).toBe(200)
  })
})

test.describe('a browser that was a tablet', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('S249: left mid "Sign in as me" at the release, it opens on the shared screen and the person is signed out', async ({ browser }) => {
    tag = tempTag('D54 S249')
    person = await createTempPerson('D54 S249')
    const owner = await apiAs('owner')
    const { token: device } = await pairedTempTablet(owner, tag)
    const personal = await signIn(person)

    // The pre-D54 state: the person's token in the slot, the tablet's set aside.
    const origin = new URL(activeProfile().uiUrl).origin
    const context = await browser.newContext({
      baseURL: activeProfile().uiUrl,
      storageState: {
        cookies: [],
        origins: [
          {
            origin,
            localStorage: [
              { name: 'rockcut_token', value: personal },
              { name: 'rockcut_device_token', value: device },
              { name: 'rockcut_personal_last_activity', value: String(Date.now()) },
              { name: 'rockcut_email', value: person.email },
            ],
          },
        ],
      },
    })
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.getByTestId('device-chip')).toBeVisible()
    await expect(page.getByTestId('login-email')).toHaveCount(0)
    expect(
      await page.evaluate(() => [
        localStorage.getItem('rockcut_token'),
        localStorage.getItem('rockcut_device_token'),
        localStorage.getItem('rockcut_personal_last_activity'),
        localStorage.getItem('rockcut_email'),
      ]),
    ).toEqual([device, null, null, null])

    // Persist-verify: the person's session is over on the server; the tablet's isn't.
    await expect.poll(() => meStatus(personal)).toBe(401)
    expect(await meStatus(device)).toBe(200)
    await page.reload()
    await expect(page.getByTestId('device-chip')).toBeVisible()
    await context.close()
  })

  test('S251 (4988): only a stale set-aside tablet token: "This tablet was unpaired" straight away', async ({ browser }) => {
    tag = tempTag('D54 S251')
    const owner = await apiAs('owner')
    const { deviceId, token: device } = await pairedTempTablet(owner, tag)
    await revokeTablet(owner, deviceId)

    const origin = new URL(activeProfile().uiUrl).origin
    const context = await browser.newContext({
      baseURL: activeProfile().uiUrl,
      storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: 'rockcut_device_token', value: device }] }] },
    })
    const page = await context.newPage()
    await page.goto('/')
    // The setup form with the notice, not a sign-in form (before D54 it stopped on "Sign in as yourself").
    await expectUnpaired(page)
    await expect(page.getByTestId('login-email')).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('rockcut_device_token'))).toBeNull()
    await context.close()
  })

  test('S251: a paired tablet revoked by the owner shows "This tablet was unpaired" on its next request', async ({ browser }) => {
    tag = tempTag('D54 S251 live')
    const owner = await apiAs('owner')
    const { deviceId, token: device } = await pairedTempTablet(owner, tag)
    const { context, page } = await contextWith(browser, device)
    await page.goto('/')
    await expect(page.getByTestId('device-chip')).toBeVisible()

    await revokeTablet(owner, deviceId)
    await page.reload()
    await expectUnpaired(page)
    await context.close()
  })

  test('the login form shows the refusal in place of the form when the API refuses (a race with pairing)', async ({ page }) => {
    await page.route('**/api/session', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: REFUSAL }) })
        : route.continue(),
    )
    await page.goto('/')
    await page.getByTestId('login-email').locator('input').fill('someone@rockcut-test.com')
    await page.getByTestId('login-password').locator('input').fill('not-a-real-password')
    await page.getByTestId('login-submit').click()
    await expect(page.getByTestId('shared-device-login-refused')).toHaveText(REFUSAL)
    await expect(page.getByTestId('login-email')).toHaveCount(0)
    await expect(page.getByTestId('login-submit')).toHaveCount(0)
  })
})

test.describe('D33 G3: other tabs follow a sign-out', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('a person signs out in tab A; tab B leaves the app for the sign-in page', async ({ browser }) => {
    person = await createTempPerson('D54 G3')
    const token = await signIn(person)
    const { context, page: a } = await contextWith(browser, token)
    await a.goto('/')
    await expect(a.getByTestId('account-menu')).toBeVisible()
    const b = await context.newPage()
    await b.goto('/schedule')
    await expect(b.getByTestId('account-menu')).toBeVisible()

    await logOut(a)
    await expect(a.getByTestId('login-email')).toBeVisible()

    // B reloads from / on the storage event: the sign-in page, nothing of the person left.
    await expect(b.getByTestId('login-email')).toBeVisible()
    await expect(b.getByTestId('account-menu')).toHaveCount(0)
    expect(await b.evaluate(() => localStorage.getItem('rockcut_token'))).toBeNull()
    await expect.poll(() => meStatus(token)).toBe(401)
    await context.close()
  })
})
