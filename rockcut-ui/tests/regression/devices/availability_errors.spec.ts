import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'

// DEV G3 (person-facing): a refused availability load used to be swallowed,
// showing "Available" every day. It must show an error instead.
test.use({ storageState: authFile('bartender1') })

test('G3: a refused availability load shows an error, not "Available" every day', async ({ page }) => {
  await page.route('**/api/availability?*', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Forbidden' }) })
      : route.continue(),
  )
  await page.goto('/availability')
  await expect(page.getByTestId('availability-load-error')).toContainText("Couldn't load availability")
  await expect(page.getByText('Available', { exact: true })).toHaveCount(0)
})
