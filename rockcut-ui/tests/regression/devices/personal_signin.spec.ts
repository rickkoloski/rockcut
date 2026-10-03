import { readFileSync } from 'node:fs'
import { test, expect as baseExpect } from '@playwright/test'

// Returning to the tablet session is a full page load (location.assign) plus
// /api/me, and the local API has one DB connection: under the full parallel
// suite that can take several seconds. Assertions wait for up to 15 s.
const expect = baseExpect.configure({ timeout: 15_000 })
// Several full page loads per test on the local dev server (see device_session.spec.ts).
test.describe.configure({ timeout: 60_000 })
import { authFile } from '../../config/test-env'
import { addDays, apiAs, tempTag, weekMonday } from '../scheduler/helpers'
import { blankTablet, createDevice, deleteDevices, getDevice, pairingCode, setUpTablet } from './helpers'
import { apiWith, createTempPerson, retireTempPerson, signIn, type TempPerson } from '../auth/helpers'

// D33 S13: a staff member signs in as themself on a paired tablet, requests
// time off, and the tablet returns to the shared session after 5 idle minutes
// without re-pairing. The person "signs in" by token injection into the
// personal slot. D34: signing out now revokes that token on the server, so it
// is a fresh session of a throwaway [TEST-TEMP] person, never a shared
// persona's token (see ../auth/helpers.ts).

test.use({ storageState: authFile('taproomDevice') })

let person: TempPerson | null = null
test.beforeAll(async () => {
  person = await createTempPerson('tablet sign-in')
})
test.afterAll(async () => {
  await retireTempPerson(person)
})

/** A new session for the temp person, for injection into the personal slot. */
async function freshToken(): Promise<string> {
  return signIn(person!)
}

function tokenOf(persona: 'taproomDevice'): string {
  const state = JSON.parse(readFileSync(authFile(persona), 'utf8'))
  return state.origins[0].localStorage.find((e: { name: string }) => e.name === 'rockcut_token').value
}

let tag = ''
test.afterEach(async () => {
  if (!tag) return
  const api = await apiWith(await freshToken())
  const mine = (await (await api.get('/api/time_off')).json()).data as { id: number; note: string | null; status: string }[]
  for (const r of mine.filter((x) => x.note?.startsWith(tag) && x.status !== 'cancelled')) await api.post(`/api/time_off/${r.id}/cancel`)
  tag = ''
})

test('S13: personal sign-in on the tablet, time off persists, idle returns to the shared screen', async ({ page }) => {
  tag = tempTag('S13 time off')
  const day = addDays(weekMonday(12), 3)
  await page.clock.install()

  await page.goto('/')
  await expect(page.getByTestId('device-chip')).toBeVisible()
  const deviceToken = tokenOf('taproomDevice')

  // "Sign in as me" sets the tablet token aside and opens the normal login form.
  await page.getByTestId('personal-signin').click()
  await expect(page.getByTestId('login-email')).toBeVisible()
  await expect(page.getByTestId('back-to-shared')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('rockcut_device_token'))).toBe(deviceToken)

  // Token injection stands in for typing the person's password.
  await page.evaluate((t) => localStorage.setItem('rockcut_token', t), await freshToken())
  await page.reload()
  await expect(page.getByTestId('personal-session-banner')).toContainText(person!.name)
  await expect(page.getByTestId('device-chip')).toHaveCount(0)

  // Request time off as themself; persist-verify after a reload.
  await page.goto('/time_off')
  await page.getByLabel('Start').fill(day)
  await page.getByLabel('End').fill(day)
  await page.getByLabel('Note (optional)').fill(tag)
  const created = page.waitForResponse((r) => r.url().endsWith('/api/time_off') && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Submit request' }).click()
  expect((await created).status()).toBe(201)
  const reloaded = page.waitForResponse((r) => r.url().endsWith('/api/time_off') && r.request().method() === 'GET')
  await page.reload()
  expect((await reloaded).status()).toBe(200)
  await expect(page.getByText(tag)).toBeVisible()
  await expect(page.getByTestId('personal-session-banner')).toBeVisible()

  // 5 idle minutes later the tablet is back on its own session, same token, no re-pairing.
  await page.clock.fastForward(5 * 60 * 1000 + 1000)
  await expect(page.getByTestId('device-chip')).toBeVisible()
  await expect(page.getByTestId('personal-session-banner')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('rockcut_token'))).toBe(deviceToken)
  expect(await page.evaluate(() => localStorage.getItem('rockcut_device_token'))).toBeNull()
})

test('S13: activity keeps the personal session; Cancel on the form goes straight back', async ({ page }) => {
  await page.clock.install()
  await page.goto('/')
  await page.getByTestId('personal-signin').click()
  await page.getByTestId('back-to-shared').click()
  await expect(page.getByTestId('device-chip')).toBeVisible()

  await page.getByTestId('personal-signin').click()
  await page.evaluate((t) => localStorage.setItem('rockcut_token', t), await freshToken())
  await page.reload()
  await expect(page.getByTestId('personal-session-banner')).toBeVisible()

  // 4 minutes, a tap, 4 more minutes: still the person (the timer restarted).
  await page.clock.fastForward(4 * 60 * 1000)
  await page.mouse.click(5, 300)
  await page.clock.fastForward(4 * 60 * 1000)
  await expect(page.getByTestId('personal-session-banner')).toBeVisible()

  // Their Sign out also returns to the tablet session.
  await page.getByTestId('logout-button').click()
  await expect(page.getByTestId('device-chip')).toBeVisible()
})

test('S13: a request still in flight when "Sign in as me" is tapped doesn’t bounce the login form', async ({ page }) => {
  await page.clock.install()
  await page.goto('/')
  await expect(page.getByTestId('device-chip')).toBeVisible()

  // Hold the next channel-list poll (sent with the tablet token) until the
  // person is on the login form, then answer it with a 401.
  let release: () => void = () => {}
  const held = new Promise<void>((r) => (release = r))
  let caught: () => void = () => {}
  const holding = new Promise<void>((r) => (caught = r))
  await page.route('**/api/channels', async (route) => {
    caught()
    await held
    await route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Unauthorized"}' })
  })
  await page.clock.fastForward(21_000)
  await holding

  await page.getByTestId('personal-signin').click()
  await expect(page.getByTestId('login-email')).toBeVisible()

  let navigations = 0
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) navigations++
  })
  const answered = page.waitForResponse((r) => r.url().endsWith('/api/channels') && r.status() === 401)
  release()
  await answered
  // Let the axios interceptor run (it would reload synchronously on a bug).
  await page.evaluate(() => Promise.resolve())
  await page.evaluate(() => Promise.resolve())

  expect(navigations).toBe(0)
  await expect(page.getByTestId('login-email')).toBeVisible()
  await expect(page.getByTestId('back-to-shared')).toBeVisible()
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})


test('S13: a late /api/me answer for the tablet doesn’t replace the login form', async ({ page }) => {
  // The dev build loads /api/me twice on start (React StrictMode). Let the first
  // through and hold the rest until the person is on the login form.
  let seen = 0
  let release: () => void = () => {}
  const held = new Promise<void>((r) => (release = r))
  const late: Promise<unknown>[] = []
  await page.route('**/api/me', async (route) => {
    seen++
    if (seen === 1) return route.continue()
    late.push(page.waitForResponse((r) => r.url().endsWith('/api/me')).then((r) => r.finished()))
    await held
    await route.continue()
  })

  await page.goto('/')
  await expect(page.getByTestId('device-chip')).toBeVisible()
  await page.getByTestId('personal-signin').click()
  await expect(page.getByTestId('login-email')).toBeVisible()

  release()
  await Promise.all(late)
  test.info().annotations.push({ type: 'held /api/me', description: String(late.length) })
  // Negative check: the tablet session must NOT come back. Before the fix it
  // did, within about a second of the late answer; allow 3 s for it to show.
  const cameBack = await page
    .getByTestId('device-chip')
    .waitFor({ state: 'visible', timeout: 3000 })
    .then(() => true, () => false)
  expect(cameBack).toBe(false)
  await expect(page.getByTestId('login-email')).toBeVisible()
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})

// Review item 3: an iPad that sleeps pauses timers. "Sleep" = move the wall
// clock forward without running any timers (setSystemTime), then wake the page.
test.describe('S13: the idle return survives the tablet sleeping', () => {
  async function personalSession(page: import('@playwright/test').Page) {
    await page.clock.install()
    await page.goto('/')
    await page.getByTestId('personal-signin').click()
    await expect(page.getByTestId('login-email')).toBeVisible()
    await page.evaluate((t) => localStorage.setItem('rockcut_token', t), await freshToken())
    await page.reload()
    await expect(page.getByTestId('personal-session-banner')).toBeVisible()
  }

  async function sleep(page: import('@playwright/test').Page, ms: number) {
    const now = await page.evaluate(() => Date.now())
    await page.clock.setSystemTime(now + ms)
  }

  test('woken by visibilitychange after 20 minutes asleep → back to the shared screen at once', async ({ page }) => {
    await personalSession(page)
    await sleep(page, 20 * 60 * 1000)
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await expect(page.getByTestId('device-chip')).toBeVisible()
  })

  test('a tap after sleeping doesn’t extend the personal session', async ({ page }) => {
    await personalSession(page)
    await sleep(page, 20 * 60 * 1000)
    await page.mouse.click(5, 300)
    await expect(page.getByTestId('device-chip')).toBeVisible()
  })

  test('a reload after sleeping (the browser discarded the page) still returns', async ({ page }) => {
    await personalSession(page)
    await sleep(page, 20 * 60 * 1000)
    await page.reload()
    await expect(page.getByTestId('device-chip')).toBeVisible()
  })

  test('a short sleep keeps the session', async ({ page }) => {
    await personalSession(page)
    await sleep(page, 60 * 1000)
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await page.mouse.click(5, 300)
    await expect(page.getByTestId('personal-session-banner')).toBeVisible()
    await expect(page.getByTestId('device-chip')).toHaveCount(0)
  })
})

// DEV G2: a personal session on a tablet whose pairing ended (revoked or
// deactivated) must end too, on the next navigation, not at idle return.
test.describe('S11/S12: a personal session ends with its tablet', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  let deviceTag = ''
  test.afterEach(async () => {
    if (deviceTag) await deleteDevices(await apiAs('owner'), deviceTag)
    deviceTag = ''
  })

  for (const how of ['revoke', 'deactivate'] as const) {
    test(`${how} while someone is signed in on the tablet → setup screen on the next navigation`, async ({ browser }) => {
      deviceTag = tempTag(`G2 ${how}`)
      const owner = await apiAs('owner')
      const device = await createDevice(owner, deviceTag)
      const tablet = await blankTablet(browser)
      await setUpTablet(tablet.page, await pairingCode(owner, device.id), `${deviceTag} iPad`)

      await tablet.page.getByTestId('personal-signin').click()
      await expect(tablet.page.getByTestId('login-email')).toBeVisible()
      await tablet.page.evaluate((t) => localStorage.setItem('rockcut_token', t), await freshToken())
      await tablet.page.reload()
      await expect(tablet.page.getByTestId('personal-session-banner')).toBeVisible()

      if (how === 'revoke') {
        const tokenId = (await getDevice(owner, device.id))!.tokens[0].id
        expect((await owner.delete(`/api/device_tokens/${tokenId}`)).status()).toBe(204)
      } else {
        expect((await owner.patch(`/api/devices/${device.id}`, { data: { active: false } })).status()).toBe(200)
      }

      // An in-app navigation (no reload) — the person's own token still works.
      await tablet.page.getByRole('button', { name: 'Time off', exact: true }).click()
      await expect(tablet.page.getByTestId('device-unpaired-notice')).toContainText('This tablet was unpaired')
      await expect(tablet.page.getByTestId('personal-session-banner')).toHaveCount(0)
      expect(await tablet.page.evaluate(() => [localStorage.getItem('rockcut_token'), localStorage.getItem('rockcut_device_token')])).toEqual([
        null,
        null,
      ])
      await tablet.context.close()
    })
  }
})

// DEV G3: two tabs on one tablet. Signing out in one must re-sync the other,
// so the next person doesn't see the last person's name, nav or data.
test('G3: a second tab follows a personal sign-out without a reload', async ({ context }) => {
  const a = await context.newPage()
  await a.goto('/')
  await expect(a.getByTestId('device-chip')).toBeVisible()
  await a.getByTestId('personal-signin').click()
  await a.evaluate((t) => localStorage.setItem('rockcut_token', t), await freshToken())
  await a.reload()
  await expect(a.getByTestId('personal-session-banner')).toBeVisible()

  const b = await context.newPage()
  await b.goto('/time_off')
  await expect(b.getByTestId('personal-session-banner')).toContainText(person!.name)
  await expect(b.getByText('My requests')).toBeVisible()

  await a.getByTestId('logout-button').click()
  await expect(a.getByTestId('device-chip')).toBeVisible()

  // Tab B, untouched: back to the shared screen, nothing personal left.
  await expect(b.getByTestId('device-chip')).toBeVisible()
  await expect(b.getByTestId('personal-session-banner')).toHaveCount(0)
  await expect(b.getByText('My requests')).toHaveCount(0)
  await expect(b.getByText(person!.name)).toHaveCount(0)
})
