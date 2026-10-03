import { test, expect as baseExpect, type Page } from '@playwright/test'
import { contextWith, createTempPerson, retireTempPerson, signIn, type TempPerson } from './helpers'

// D34 S21: every typed password starts hidden; its eye button shows and hides
// that field only, never submits, and is reachable by keyboard.
const expect = baseExpect.configure({ timeout: 15_000 })
test.describe.configure({ timeout: 60_000 })
test.use({ storageState: { cookies: [], origins: [] } })

async function expectToggles(page: Page, testIds: string[]) {
  for (const id of testIds) {
    await expect(page.getByTestId(id).locator('input')).toHaveAttribute('type', 'password')
  }
  const [first, ...rest] = testIds
  const input = page.getByTestId(first).locator('input')
  await input.fill('visible-check')
  await page.getByTestId(`${first}-toggle`).click()
  await expect(input).toHaveAttribute('type', 'text')
  await expect(page.getByTestId(`${first}-toggle`)).toHaveAccessibleName('Hide password')
  for (const id of rest) await expect(page.getByTestId(id).locator('input')).toHaveAttribute('type', 'password')
  await page.getByTestId(`${first}-toggle`).click()
  await expect(input).toHaveAttribute('type', 'password')
  await expect(input).toHaveValue('visible-check')
}

test('sign-in form: hidden by default, toggles, doesn’t submit, keyboard reachable', async ({ page }) => {
  let posted = false
  page.on('request', (r) => {
    if (r.url().endsWith('/api/session') && r.method() === 'POST') posted = true
  })
  await page.goto('/')
  await expectToggles(page, ['login-password'])
  expect(posted).toBe(false)

  // Keyboard: Tab from the password field reaches the toggle; Enter on it toggles.
  await page.getByTestId('login-password').locator('input').focus()
  await page.keyboard.press('Tab')
  await expect(page.getByTestId('login-password-toggle')).toBeFocused()
  await expect(page.getByTestId('login-password-toggle')).toHaveAccessibleName('Show password')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('login-password').locator('input')).toHaveAttribute('type', 'text')
  expect(posted).toBe(false)
})

test.describe('with a temp person', () => {
  let person: TempPerson | null = null
  test.afterEach(async () => {
    await retireTempPerson(person)
    person = null
  })

  test('forced reset: all three fields', async ({ browser }) => {
    person = await createTempPerson('S21 forced', { ready: false })
    const { context, page } = await contextWith(browser, await signIn(person))
    await page.goto('/')
    await expect(page.getByText('Set a new password')).toBeVisible()
    await expectToggles(page, ['current-password', 'new-password', 'confirm-password'])
    await context.close()
  })

  test('profile: all three fields', async ({ browser }) => {
    person = await createTempPerson('S21 profile')
    const { context, page } = await contextWith(browser, await signIn(person))
    await page.goto('/profile')
    await expectToggles(page, ['current-password', 'new-password', 'confirm-password'])
    await context.close()
  })
})
