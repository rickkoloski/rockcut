import { test, expect as baseExpect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { claimSpare } from '../auth/spares'

// D36-G (task 4050): activity in any tab keeps a "Sign in as me" session.
// D36-I (task 4052): an abandoned "Sign in as me" form returns to the shared screen.
const expect = baseExpect.configure({ timeout: 15_000 })
test.describe.configure({ timeout: 60_000 })
test.use({ storageState: authFile('taproomDevice') })

const MIN = 60 * 1000

test('G: activity recorded by another tab keeps this tab\'s session', async ({ page }) => {
  // Background-tab timers under the fake clock don't behave like a real tablet,
  // so another tab's activity is simulated: it writes the shared last-activity
  // time, which is all a second tab does.
  await page.clock.install()
  await page.goto('/')
  await page.getByTestId('personal-signin').click()
  // A spare session stands in for typing the person's password.
  await page.evaluate((t) => localStorage.setItem('rockcut_token', t), await claimSpare())
  await page.reload()
  await expect(page.getByTestId('personal-session-banner')).toBeVisible()

  // Deciding the tablet is idle starts by ending the person's session on the
  // server; watch for that rather than the screen (the return then waits on the
  // request, which the fake clock can hold up).
  let ended = false
  page.on('request', (r) => {
    if (r.method() === 'DELETE' && r.url().endsWith('/api/session')) ended = true
  })

  // This tab sees no input for 7 minutes; "another tab" is active every minute.
  for (let i = 0; i < 7; i++) {
    await page.clock.runFor(MIN)
    await page.evaluate(() => localStorage.setItem('rockcut_personal_last_activity', String(Date.now())))
  }
  expect(ended).toBe(false)
  await expect(page.getByTestId('personal-session-banner')).toBeVisible()

  // Then nobody anywhere: back to the shared screen.
  await page.clock.runFor(5 * MIN + 30_000)
  await expect.poll(() => ended).toBe(true)
  await expect(page.getByTestId('device-chip')).toBeVisible()
})

test('I: a "Sign in as me" form left alone returns to the shared screen; typing keeps it', async ({ page }) => {
  await page.clock.install()
  await page.goto('/')
  await page.getByTestId('personal-signin').click()
  const email = page.getByTestId('login-email').locator('input')
  await email.fill('someone@example.com')

  // Typing at 4 minutes restarts the timer: still on the form at 8.
  await page.clock.fastForward(4 * MIN)
  await email.press('End')
  await page.clock.fastForward(4 * MIN)
  await expect(page.getByTestId('back-to-shared')).toBeVisible()

  // Left alone past 5 minutes: back on the shared screen, the email gone.
  await page.clock.fastForward(5 * MIN + 30_000)
  await expect(page.getByTestId('device-chip')).toBeVisible()
  await expect(page.getByTestId('login-email')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('rockcut_device_token'))).toBeNull()
})
