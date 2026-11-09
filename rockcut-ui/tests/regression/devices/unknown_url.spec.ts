import { test, expect as baseExpect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs, board } from '../ideas/helpers'

// D55 §2.2 (task 5119), T5/T6: on a tablet an unknown URL is "Page not found";
// a real page it can't use keeps "Not available on a shared device". A
// person's unknown URL still goes Home (D31).
const expect = baseExpect.configure({ timeout: 15_000 })
test.describe.configure({ timeout: 60_000 })

test.describe('taproomDevice', () => {
  test.use({ storageState: authFile('taproomDevice') })

  for (const path of ['/nonexistent-xyz', '/brands/1/nope', '/settingsx']) {
    test(`T5: ${path} says "Page not found" with Go to Home`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByTestId('page-not-found')).toContainText('Page not found')
      await expect(page.getByTestId('device-not-available')).toHaveCount(0)
      await page.getByRole('button', { name: 'Go to Home' }).click()
      await expect(page).toHaveURL(/\/$/)
      await expect(page.getByTestId('device-chip')).toBeVisible()
    })
  }

  // Gated pages a person may have, and pages with parameters.
  for (const path of ['/profile', '/brewery/production', '/ingredients/categories/1', '/settings/categories/1', '/activity']) {
    test(`T6: ${path} keeps "Not available on a shared device"`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByTestId('device-not-available')).toBeVisible()
      await expect(page.getByTestId('page-not-found')).toHaveCount(0)
    })
  }

  // Lead decisions 6, gap 4: an unknown channel is "Page not found"; a real
  // channel the Taproom tablet can't open stays "Not available".
  test('gap 4: /messages/nope is "Page not found"; /messages/dept:brewery is "Not available"', async ({ page }) => {
    await page.goto('/messages/nope')
    await expect(page.getByTestId('page-not-found')).toContainText('Page not found')
    await expect(page.getByTestId('device-not-available')).toHaveCount(0)

    await page.goto('/messages/dept:brewery')
    await expect(page.getByTestId('device-not-available')).toBeVisible()
    await expect(page.getByTestId('page-not-found')).toHaveCount(0)
  })

  // Lead decisions 1, item 2: D53's Boards are in the tablet's routes (view
  // only: its home board and Company). A seeded card, read with the tablet's
  // own token, so nothing is written.
  test('a tablet opens Boards, not "Page not found"', async ({ page }) => {
    const { lists } = await board(await apiAs('taproomDevice'), 'bar')
    const card = lists.flatMap((l) => l.cards ?? [])[0]
    expect(card, 'the Taproom board has a seeded card').toBeTruthy()
    for (const path of ['/boards', '/boards/bar', '/boards/company', `/boards/bar/cards/${card.id}`]) {
      await page.goto(path)
      await expect(page.getByTestId('idea-board')).toBeVisible()
      await expect(page.getByTestId('page-not-found')).toHaveCount(0)
      await expect(page.getByTestId('device-not-available')).toHaveCount(0)
    }
    await expect(page.getByTestId('idea-card-dialog')).toBeVisible()
  })
})

test.describe('bartender1', () => {
  test.use({ storageState: authFile('bartender1') })

  test("a person's unknown URL still goes Home", async ({ page }) => {
    await page.goto('/nonexistent-xyz')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByTestId('page-not-found')).toHaveCount(0)
  })
})
