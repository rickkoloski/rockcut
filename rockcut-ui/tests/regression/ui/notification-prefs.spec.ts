import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'

// D43 §1.12, S165: the preferences table shows In-app and Push only. Email and
// SMS are hidden, not removed (stored email preferences are kept).

test.use({ storageState: authFile('brewer1') })

test('S165: columns In-app and Push only; no "SMS is coming soon"', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('notification-bell').click()
  await page.getByTestId('notification-preferences').click()
  const dialog = page.getByRole('dialog', { name: 'Notification preferences' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('columnheader')).toHaveText(['', 'In-app', 'Push'])
  await expect(dialog.getByText(/SMS/)).toHaveCount(0)
  await expect(dialog.getByText(/Email/i)).toHaveCount(0)
  const row = dialog.getByRole('row', { name: /You've been scheduled/ })
  await expect(row.locator('input[type="checkbox"]')).toHaveCount(2)
})
