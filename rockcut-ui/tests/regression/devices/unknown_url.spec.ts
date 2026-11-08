import { test, expect as baseExpect } from '@playwright/test'
import { authFile } from '../../config/test-env'

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

  // Lead decisions 1, item 2: D53 Part 2 adds Idea Boards, which a tablet can
  // open (view only). After merging develop, `/boards`, `/boards/:board` and
  // `/boards/:board/cards/:id` must be in both the person routes and the
  // tablet's routes. Un-fixme this then, with a real board and card id.
  test.fixme('after the D53 merge: a tablet opens Idea Boards, not "Page not found"', async ({ page }) => {
    for (const path of ['/boards', '/boards/1', '/boards/1/cards/1']) {
      await page.goto(path)
      await expect(page.getByTestId('page-not-found')).toHaveCount(0)
      await expect(page.getByTestId('device-not-available')).toHaveCount(0)
    }
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
