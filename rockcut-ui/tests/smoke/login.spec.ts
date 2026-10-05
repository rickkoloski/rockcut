import { test, expect } from '@playwright/test'
import { personas, seedPassword } from '../config/test-env'

// The only specs that use the seed password (D30 policy). Skipped unless
// SEED_PASSWORD is set (rockcut-ui/.env.test.local, gitignored).
test.describe('login form', () => {
  test.skip(!seedPassword, 'SEED_PASSWORD not set — login-flow specs skipped')

  test('a persona can sign in', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Email').fill(personas.brewer1.email)
    await page.getByTestId('login-password').locator('input').fill(seedPassword!)
    await page.getByTestId('login-submit').click()
    await expect(page.getByText('View Schedule').first()).toBeVisible()
  })

  test('an inactive persona is refused', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Email').fill(personas.inactive.email)
    await page.getByTestId('login-password').locator('input').fill(seedPassword!)
    await page.getByTestId('login-submit').click()
    // Argon2 on DEV's one vCPU can take several seconds under the full suite (D34 run 12).
    await expect(page.getByText('Account disabled')).toBeVisible({ timeout: 20_000 })
  })
})
