import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'

// D58 §3.11 (4061): a shared device's header at phone width stays on one
// line: Sign out is an icon button with a label, the pill ellipsizes, and the
// logo keeps its gap. Unchanged at 412 px and above.

test.use({ storageState: authFile('taproomDevice') })

async function header(page: Page) {
  const box = async (testId: string) => (await page.getByTestId(testId).boundingBox())!
  const logo = (await page.locator('.phone-logo').boundingBox())!
  return { chip: await box('device-chip'), signOut: await box('device-signout'), logo }
}

for (const width of [320, 360, 384]) {
  test(`${width} px: the board's title stays on one line beside the pill`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 })
    await page.goto('/boards/bar')
    const title = page.getByTestId('board-title')
    await expect(title).toBeVisible({ timeout: 15_000 })
    const lineHeight = await title.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight))
    expect((await title.boundingBox())!.height).toBeLessThan(lineHeight * 1.5)
    const { chip, signOut: so } = await header(page)
    expect(chip.x + chip.width).toBeLessThanOrEqual(so.x)
  })

  test(`${width} px: one line, icon Sign out, ellipsized pill, the logo's gap kept`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 })
    await page.goto('/')
    await expect(page.getByTestId('device-chip')).toBeVisible({ timeout: 15_000 })
    const signOut = page.getByTestId('device-signout')
    await expect(signOut).toHaveAccessibleName('Sign out')
    await expect(signOut).not.toHaveText('Sign out')

    const { chip, signOut: so, logo } = await header(page)
    // One line: every piece on the same row, nothing past the right edge.
    const mid = (b: { y: number; height: number }) => b.y + b.height / 2
    expect(Math.abs(mid(chip) - mid(so))).toBeLessThan(4)
    expect(Math.abs(mid(logo) - mid(so))).toBeLessThan(4)
    expect(so.x + so.width).toBeLessThanOrEqual(width)
    expect(chip.x + chip.width).toBeLessThanOrEqual(so.x)
    // The logo keeps its gap (the toolbar's 8 px).
    expect(chip.x - (logo.x + logo.width)).toBeGreaterThanOrEqual(8)
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scroll).toBeLessThanOrEqual(width)
  })
}

test('412 px: the text Sign out and the "Shared device" pill, as before', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 })
  await page.goto('/')
  await expect(page.getByTestId('device-chip')).toBeVisible({ timeout: 15_000 })
  expect(await page.getByTestId('device-chip').innerText()).toBe('Shared device')
  await expect(page.getByTestId('device-signout')).toHaveText('Sign out')
})
