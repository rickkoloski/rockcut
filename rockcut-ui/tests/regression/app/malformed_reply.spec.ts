import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'

// D36-J (task 4053): a malformed API reply never leaves a blank white page.
test.use({ storageState: authFile('bartender1') })

test('a null channels or departments list renders the app as if empty', async ({ page }) => {
  await page.route('**/api/channels', (route) => route.fulfill({ json: { data: null } }))
  await page.route('**/api/departments', (route) => route.fulfill({ json: { data: null } }))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible()
  await expect(page.getByTestId('app-error')).toHaveCount(0)
})

test('a reply that crashes rendering shows "Something went wrong" with Reload', async ({ page }) => {
  await page.route('**/api/channels', (route) => route.fulfill({ json: { data: [null] } }))
  await page.goto('/')
  const error = page.getByTestId('app-error')
  await expect(error).toContainText('Something went wrong')
  await expect(error.getByRole('button', { name: 'Reload' })).toBeVisible()
})
