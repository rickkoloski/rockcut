import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'

// D36-C (task 4002): a shared device's header fits at phone width.
test.use({ storageState: authFile('taproomDevice') })

for (const [w, h] of [
  [412, 915],
  [1280, 800],
] as const) {
  test(`${w}×${h}: one-line header, no overlap with the logo`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/')
    const chip = page.getByTestId('device-chip')
    const button = page.getByRole('button', { name: 'Sign in as me' })
    await expect(chip).toBeVisible()
    await expect(button).toBeVisible()

    const header = (await page.getByRole('banner').boundingBox())!
    const btn = (await button.boundingBox())!
    expect(header.height).toBeLessThanOrEqual(64)
    expect(btn.height).toBeLessThanOrEqual(36) // one line

    const logo = page.getByRole('img', { name: 'Rockcut Brewing Co' }).locator('visible=true').first()
    if (await logo.count()) {
      const l = (await logo.boundingBox())!
      const c = (await chip.boundingBox())!
      expect(c.x >= l.x + l.width || c.x + c.width <= l.x).toBe(true)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}
