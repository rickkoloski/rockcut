import { test, expect as baseExpect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs, tempTag } from '../scheduler/helpers'
import { blankTablet, createDevice, deleteDevices, getDevice, pairingCode, setUpTablet } from './helpers'
import { createTempPerson, meStatus, retireTempPerson, signIn, type TempPerson } from '../auth/helpers'

// D34 S4–S7, S15: ending a personal sign-in on a tablet revokes it on the
// server. The person really types their (throwaway) password into the tablet's
// form, so the sign-in also carries X-Rockcut-Device.
const expect = baseExpect.configure({ timeout: 15_000 })
// In order, in one worker: one throwaway person for the file, and password
// hashing is slow on DEV's one vCPU.
test.describe.configure({ timeout: 60_000, mode: 'default' })

let person: TempPerson | null = null
test.beforeAll(async () => {
  person = await createTempPerson('D34 tablet')
})
test.afterAll(async () => {
  await retireTempPerson(person)
})

function deviceTokenOf(page: Page) {
  return page.evaluate(() => localStorage.getItem('rockcut_token'))
}

/** "Sign in as me" with a typed password; resolves to the person's new token. */
async function signInAsMe(page: Page): Promise<string> {
  const deviceToken = await deviceTokenOf(page)
  await page.getByTestId('personal-signin').click()
  await page.getByTestId('login-email').locator('input').fill(person!.email)
  await page.getByTestId('login-password').locator('input').fill(person!.password)
  const posted = page.waitForRequest((r) => r.url().endsWith('/api/session') && r.method() === 'POST')
  await page.getByTestId('login-submit').click()
  // The sign-in says it's on this tablet.
  expect((await posted).headers()['x-rockcut-device']).toBe(deviceToken)
  await expect(page.getByTestId('personal-session-banner')).toContainText(person!.name)
  const token = await deviceTokenOf(page)
  expect(token).toMatch(/^ses_/)
  return token!
}

test.describe('on the shared taproomDevice tablet', () => {
  test.use({ storageState: authFile('taproomDevice') })

  test('S4: Sign out revokes the personal token; the tablet keeps its own', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('device-chip')).toBeVisible()
    const deviceToken = await deviceTokenOf(page)
    const personal = await signInAsMe(page)

    const revoked = page.waitForRequest((r) => r.url().endsWith('/api/session') && r.method() === 'DELETE')
    await page.getByTestId('logout-button').click()
    expect((await revoked).headers()['authorization']).toBe(`Bearer ${personal}`)
    await expect(page.getByTestId('device-chip')).toBeVisible()

    expect(await meStatus(personal)).toBe(401)
    expect(await deviceTokenOf(page)).toBe(deviceToken)
  })

  test('S5: the 5-minute idle return revokes it too', async ({ page }) => {
    await page.clock.install()
    await page.goto('/')
    const personal = await signInAsMe(page)

    const revoked = page.waitForResponse((r) => r.url().endsWith('/api/session') && r.request().method() === 'DELETE')
    await page.clock.fastForward(5 * 60 * 1000 + 1000)
    expect((await revoked).status()).toBe(200)
    await expect(page.getByTestId('device-chip')).toBeVisible()
    expect(await meStatus(personal)).toBe(401)
  })

  test('S6: if the revoke can’t reach the server, the tablet still returns', async ({ page }) => {
    await page.clock.install()
    await page.goto('/')
    const personal = await signInAsMe(page)

    // The network drops for the revoke only (a dev-server page can't load offline).
    await page.route('**/api/session', (route) =>
      route.request().method() === 'DELETE' ? route.abort('internetdisconnected') : route.continue(),
    )
    await page.clock.fastForward(5 * 60 * 1000 + 1000)
    await expect(page.getByTestId('device-chip')).toBeVisible()
    await expect(page.getByTestId('personal-session-banner')).toHaveCount(0)
    // Not revoked: the server's 15-minute idle limit is what ends it (ExUnit covers the timing).
    expect(await meStatus(personal)).toBe(200)
    await page.unrouteAll({ behavior: 'ignoreErrors' })
  })

  test('G1: offline across the idle return and a reload, the tablet keeps its pairing', async ({ page }) => {
    await page.clock.install()
    await page.goto('/')
    const deviceToken = await deviceTokenOf(page)
    await signInAsMe(page)

    // Every API call fails, as on a dropped Wi-Fi (the page itself still loads,
    // as it would from the installed PWA's cache).
    await page.route('**/api/**', (route) => route.abort('internetdisconnected'))
    await page.clock.fastForward(5 * 60 * 1000 + 1000)
    await expect(page.getByTestId('server-unreachable')).toBeVisible()
    expect(await deviceTokenOf(page)).toBe(deviceToken)

    await page.reload()
    await expect(page.getByTestId('server-unreachable')).toBeVisible()
    expect(await deviceTokenOf(page)).toBe(deviceToken)
    await expect(page.getByTestId('login-submit')).toHaveCount(0)

    // Back online: the next retry restores the tablet's own session.
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await page.clock.fastForward(10_000)
    await expect(page.getByTestId('device-chip')).toBeVisible()
    await expect(page.getByTestId('personal-session-banner')).toHaveCount(0)
    expect(await deviceTokenOf(page)).toBe(deviceToken)
  })

  // DEV pass 2 G1/G4: only a 401 unpairs a tablet. A proxy's 4xx, a server
  // error, a captive Wi-Fi page or a request that never answers all keep the
  // pairing, show "Can't reach the server" and recover on their own.
  for (const [name, answer] of [
    ['404', { status: 404, body: 'Not found' }],
    ['408', { status: 408 }],
    ['429', { status: 429 }],
    ['503', { status: 503 }],
    ['a captive Wi-Fi page', { status: 200, contentType: 'text/html', body: '<html>Sign in to Wi-Fi</html>' }],
    ['no answer', null],
  ] as const) {
    test(`G1/G4: ${name} from /api/me at start-up keeps the pairing`, async ({ page }) => {
      await page.clock.install()
      await page.goto('/')
      await expect(page.getByTestId('device-chip')).toBeVisible()
      const deviceToken = await deviceTokenOf(page)

      await page.route('**/api/me', (route) => (answer ? route.fulfill(answer) : undefined))
      await page.reload()
      // No answer: the request's own 15 s timeout (a native XHR timer the fake clock can't move).
      await expect(page.getByTestId('server-unreachable')).toBeVisible({ timeout: answer ? undefined : 25_000 })
      expect(await deviceTokenOf(page)).toBe(deviceToken)
      await expect(page.getByTestId('login-submit')).toHaveCount(0)

      await page.unrouteAll({ behavior: 'ignoreErrors' })
      await page.clock.fastForward(10_000)
      await expect(page.getByTestId('device-chip')).toBeVisible()
      expect(await deviceTokenOf(page)).toBe(deviceToken)
    })
  }

  test('S15: no profile during a personal sign-in on the tablet', async ({ page }) => {
    await page.goto('/')
    await signInAsMe(page)
    await expect(page.getByTestId('profile-link')).toHaveCount(0)
    await expect(page.getByTestId('profile-icon')).toHaveCount(0)
    await page.goto('/profile')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByTestId('profile-page')).toHaveCount(0)
    await page.getByTestId('logout-button').click()
    await expect(page.getByTestId('device-chip')).toBeVisible()
  })
})

test.describe('S7: revoking a [TEST-TEMP] tablet', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  let tag = ''
  test.afterEach(async () => {
    if (tag) await deleteDevices(await apiAs('owner'), tag)
    tag = ''
  })

  test('ends the session started on it, not the person’s phone', async ({ browser }) => {
    tag = tempTag('D34 S7')
    const owner = await apiAs('owner')
    const device = await createDevice(owner, tag)
    const tablet = await blankTablet(browser)
    await setUpTablet(tablet.page, await pairingCode(owner, device.id), `${tag} iPad`)
    const onTablet = await signInAsMe(tablet.page)
    const onPhone = await signIn(person!)

    const barMgr = await apiAs('barMgr')
    const tokenId = (await getDevice(barMgr, device.id))!.tokens[0].id
    expect((await barMgr.delete(`/api/device_tokens/${tokenId}`)).status()).toBe(204)

    expect(await meStatus(onTablet)).toBe(401)
    expect(await meStatus(onPhone)).toBe(200)
    await tablet.context.close()
  })
})

