import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { csvFile, openUser, previewImport } from '../taproom/helpers'

// D58 §3.12 (4118 items 2–4, 6). Preview and Cancel only: nothing is written.
// Item 5 (Redeem after the entry was removed) is D37's S17 in
// regression/taproom/beer-board-staff.spec.ts.

test.use({ storageState: authFile('barMgr') })

test('import: a blank header is "(blank)", a repeated one is listed once, a long one wraps', async ({ page }) => {
  const long = 'X'.repeat(600)
  await previewImport(page, csvFile(['[TEST-TEMP] Pat,Lee,1,a,,b,c,d'], `For,Bought by,Beers,Notes,,Notes,${long},`))
  const ignored = page.getByTestId('import-ignored-columns')
  await expect(ignored).toHaveText(`Ignored columns: Notes, (blank), ${long}`)
  const box = (await ignored.boundingBox())!
  const frame = (await page.locator('.MuiDialog-paper').filter({ has: ignored }).boundingBox())!
  expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width)
  await page.keyboard.press('Escape')
})

test('Users & Roles: Taproom "— None —" shows as such, and the staff code note says it is cleared', async ({ page }) => {
  await openUser(page, 'Sam Pour')
  const taproom = page.getByTestId('user-role-bar')
  await page.getByTestId('staff-code-input').fill('4321')
  await expect(page.getByTestId('staff-code-section')).toContainText('Saved when you press Save.')
  await taproom.getByRole('combobox').click()
  await page.getByRole('option', { name: '— None —' }).click()
  await expect(taproom.getByRole('combobox')).toHaveText('— None —')
  await expect(page.getByTestId('staff-code-section')).toContainText('The staff code is cleared when you press Save.')
  await page.getByRole('button', { name: 'Cancel' }).click()
})
