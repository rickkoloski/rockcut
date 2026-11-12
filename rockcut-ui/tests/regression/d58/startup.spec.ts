import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'

// D58 §3.10 (5205): while GET /api/me is pending at start-up, the loading
// screen shows at once; after 4 s it adds "Still connecting…" with Retry.

test.use({ storageState: authFile('brewer1') })

test('a slow /api/me: loading screen at once, Still connecting at 4 s, Retry loads the app', async ({ page }) => {
  let hold = true
  await page.route('**/api/me', (route) => (hold ? undefined : route.continue()))
  const started = Date.now()
  await page.goto('/')
  await expect(page.getByTestId('loading-screen')).toBeVisible({ timeout: 2_000 })
  await expect(page.getByTestId('still-connecting')).toBeHidden()

  await expect(page.getByTestId('still-connecting')).toBeVisible({ timeout: 6_000 })
  expect(Date.now() - started).toBeGreaterThanOrEqual(4_000)
  await expect(page.getByTestId('server-unreachable')).toBeHidden()

  hold = false
  await page.getByTestId('still-connecting-retry').click()
  await expect(page.getByTestId('loading-screen')).toBeHidden({ timeout: 10_000 })
})
