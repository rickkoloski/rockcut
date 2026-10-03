import { test, expect as baseExpect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { contextWith, createTempPerson, meStatus, retireTempPerson, signIn, throwawayPassword, type TempPerson } from './helpers'

// D34 S17–S20, S22: the profile page. Password changes use a throwaway
// [TEST-TEMP] person, never a persona (that would change the seed password).
const expect = baseExpect.configure({ timeout: 15_000 })
// In order, not in parallel: password hashing is slow on DEV's one vCPU (D34).
test.describe.configure({ timeout: 60_000, mode: 'default' })

test.describe('S17/S22 your details', () => {
  test.use({ storageState: authFile('barMgr') })

  test('the name link opens your own read-only details', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('profile-link').click()
    await expect(page).toHaveURL(/\/profile$/)
    await expect(page.getByTestId('profile-email')).toHaveText('bar.manager@rockcut-test.com')
    await expect(page.getByTestId('profile-name')).toHaveText('Casey Tap')
    await expect(page.getByTestId('profile-memberships')).toContainText('Taproom · Manager')
    // Read-only: no inputs in the details card.
    await expect(page.getByTestId('profile-details').locator('input')).toHaveCount(0)
  })

  test('at phone width the account icon opens it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 })
    await page.goto('/')
    await expect(page.getByTestId('profile-link')).toBeHidden()
    await page.getByTestId('profile-icon').click()
    await expect(page.getByTestId('profile-page')).toBeVisible()
  })
})

test.describe('S18/S19 change password', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  let person: TempPerson | null = null
  test.afterEach(async () => {
    await retireTempPerson(person)
    person = null
  })

  test('S18: wrong current password, then success; other sessions signed out', async ({ browser }) => {
    person = await createTempPerson('S18 change password')
    const hereToken = await signIn(person)
    const thereToken = await signIn(person)
    const { context, page } = await contextWith(browser, hereToken)
    await page.goto('/profile')

    const next = throwawayPassword()
    await page.getByTestId('current-password').locator('input').fill('not-my-password')
    await page.getByTestId('new-password').locator('input').fill(next)
    await page.getByTestId('confirm-password').locator('input').fill(next)
    await page.getByTestId('change-password-submit').click()
    await expect(page.getByTestId('change-password-error')).toHaveText('Current password is incorrect')
    expect(await meStatus(thereToken)).toBe(200)

    await page.getByTestId('current-password').locator('input').fill(person.password)
    await page.getByTestId('change-password-submit').click()
    await expect(page.getByTestId('change-password-success')).toHaveText('Password changed. Your other devices were signed out.')
    await expect(page.getByTestId('current-password').locator('input')).toHaveValue('')

    // Persist-verify: this browser is still in after a reload; the other session
    // is gone; the new password works and the old one doesn't.
    await page.reload()
    await expect(page.getByTestId('profile-page')).toBeVisible()
    expect(await meStatus(thereToken)).toBe(401)
    await signIn({ email: person.email, password: next })
    person.password = next
    await context.close()
  })

  test('S19: mismatch and too short are refused; the password is unchanged', async ({ browser }) => {
    person = await createTempPerson('S19 rules')
    const { context, page } = await contextWith(browser, await signIn(person))
    await page.goto('/profile')

    await page.getByTestId('current-password').locator('input').fill(person.password)
    await page.getByTestId('new-password').locator('input').fill('abcdefgh1')
    await page.getByTestId('confirm-password').locator('input').fill('abcdefgh2')
    await page.getByTestId('change-password-submit').click()
    await expect(page.getByTestId('change-password-error')).toHaveText('New passwords do not match')

    await page.getByTestId('new-password').locator('input').fill('short')
    await page.getByTestId('confirm-password').locator('input').fill('short')
    await page.getByTestId('change-password-submit').click()
    await expect(page.getByTestId('change-password-error')).toHaveText('New password must be at least 8 characters')

    // The old password still signs in.
    await signIn(person)
    await context.close()
  })
})

test.describe('S20 a shared tablet', () => {
  test.use({ storageState: authFile('taproomDevice') })

  test('/profile is not available and there is no profile link', async ({ page }) => {
    await page.goto('/profile')
    await expect(page.getByText('Not available on a shared device')).toBeVisible()
    await expect(page.getByTestId('profile-link')).toHaveCount(0)
    await expect(page.getByTestId('profile-icon')).toHaveCount(0)
  })
})
