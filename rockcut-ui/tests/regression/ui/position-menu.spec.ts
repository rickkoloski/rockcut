import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs } from '../scheduler/helpers'

// D43 §1.13, S166: in Add shift → Position, department headings are small
// caps with the department's color dot on a tinted band; positions sit
// indented with a square in their shift color. Checked in both themes.

test.use({ storageState: authFile('owner') })
test.describe.configure({ mode: 'serial' })

async function setOwnerMode(mode: string) {
  expect((await (await apiAs('owner')).put('/api/me/color_mode', { data: { color_mode: mode } })).status()).toBe(200)
}
test.afterAll(() => setOwnerMode('light'))

async function openPositionMenu(page: Page) {
  await page.goto('/scheduler')
  await page.getByRole('button', { name: 'Add shift', exact: true }).click()
  await page.getByRole('dialog').getByRole('combobox').first().click()
  await expect(page.getByRole('listbox')).toBeVisible()
}

for (const mode of ['light', 'dark'] as const) {
  test(`S166: headings and positions read as two levels (${mode})`, async ({ page }) => {
    await setOwnerMode(mode)
    await openPositionMenu(page)
    const listbox = page.getByRole('listbox')
    const heading = listbox.locator('.MuiListSubheader-root').filter({ hasText: /Brewery/i }).first()
    await expect(heading).toBeVisible()
    const paperBg = await listbox.evaluate((el) => getComputedStyle(el.closest('.MuiPaper-root')!).backgroundColor)
    const h = await heading.evaluate((el) => {
      const s = getComputedStyle(el)
      const dot = el.querySelector('span')
      return {
        transform: s.textTransform,
        bg: s.backgroundColor,
        dotRadius: dot ? getComputedStyle(dot).borderRadius : '',
      }
    })
    expect(h.transform).toBe('uppercase')
    expect(h.bg).not.toBe(paperBg) // a tinted band
    expect(h.dotRadius).toBe('50%') // a dot

    const brewer = listbox.getByRole('option', { name: 'Brewer', exact: true })
    const p = await brewer.evaluate((el) => {
      const swatch = el.querySelector('span')!
      return {
        pad: parseFloat(getComputedStyle(el).paddingLeft),
        radius: getComputedStyle(swatch).borderRadius,
        swatchBg: getComputedStyle(swatch).backgroundColor,
      }
    })
    expect(p.pad).toBeGreaterThanOrEqual(32) // indented
    expect(p.radius).toBe('3px') // a square, not a dot
    expect(p.swatchBg).not.toBe('rgba(0, 0, 0, 0)')
  })
}
