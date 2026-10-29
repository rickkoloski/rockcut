import { test, expect } from '@playwright/test'
import { contextWith } from './helpers'

// D51 (task 4058, scenario 2): pre-D34 sign-in tokens (signed `Phoenix.Token`s,
// not `ses_` sessions) are no longer accepted. A browser still holding one lands
// on the sign-in page with the token cleared. Any bearer that isn't `ses_` or
// `dev_` gets this treatment, so the spec doesn't need the server's secret to
// make a correctly signed one; this string just has the old token's shape.
const STALE_TOKEN = 'SFMyNTY.g2gDYgAAAAduBgBA2Yt-mQFiACeNAA.q3Xv8b0zJQm1uY2Lr5sWcN7dHfK4pTgAoE9iV6yRxMw'

test('S2: a pre-D34 token in localStorage lands on the sign-in page and is cleared', async ({ browser }) => {
  const { context, page } = await contextWith(browser, STALE_TOKEN)

  const me = page.waitForResponse((r) => r.url().endsWith('/api/me'))
  await page.goto('/')
  expect((await me).status()).toBe(401)

  await expect(page.getByTestId('login-submit')).toBeVisible()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('rockcut_token'))).toBeNull()

  // Still signed out after a reload: nothing brings the old token back.
  await page.reload()
  await expect(page.getByTestId('login-submit')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('rockcut_token'))).toBeNull()
  await context.close()
})
