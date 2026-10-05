import { test, expect } from '@playwright/test'
import { claimSpare } from './spares'
import { contextWith, meStatus } from './helpers'

// D36-H (task 4051): a Logout that can't reach the server still ends the
// session there: it's retried the next time the app starts or comes online.
test('Logout while offline: the session ends on the server once the app is back', async ({ browser }) => {
  const token = claimSpare()
  const { context, page } = await contextWith(browser, token)
  await page.goto('/')
  await expect(page.getByTestId('logout-button')).toBeVisible()

  // The network drops for the sign-out.
  await page.route('**/api/session', (route) =>
    route.request().method() === 'DELETE' ? route.abort('internetdisconnected') : route.continue(),
  )
  await page.getByTestId('logout-button').click()
  await expect(page.getByTestId('login-submit')).toBeVisible()
  expect(await meStatus(token)).toBe(200) // not ended yet

  // Back online, the app opens again: the sign-out goes through.
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  const sent = page.waitForResponse((r) => r.url().endsWith('/api/session') && r.request().method() === 'DELETE')
  await page.reload()
  expect((await sent).status()).toBe(200)
  expect(await meStatus(token)).toBe(401)
  expect(await page.evaluate(() => localStorage.getItem('rockcut_pending_signouts'))).toBeNull()
  await context.close()
})

test('Logout online still ends the session at once, with nothing left pending', async ({ browser }) => {
  const token = claimSpare()
  const { context, page } = await contextWith(browser, token)
  await page.goto('/')
  const sent = page.waitForResponse((r) => r.url().endsWith('/api/session') && r.request().method() === 'DELETE')
  await page.getByTestId('logout-button').click()
  expect((await sent).status()).toBe(200)
  expect(await meStatus(token)).toBe(401)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('rockcut_pending_signouts'))).toBeNull()
  await context.close()
})
