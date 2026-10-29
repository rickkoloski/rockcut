import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs, tempTag } from '../scheduler/helpers'

// D51 (QA G1/G5): brewing numbers have ranges. As breweryMgr, editing a
// [TEST-TEMP] brand's Target ABV to 1000: the browser refuses it first
// (max 100), and if the browser doesn't check (an older page, another
// browser), the API answers 422 and the dialog names the range. Nothing is
// saved either way.
test.use({ storageState: authFile('breweryMgr') })

let brandId: number | null = null
test.afterEach(async () => {
  if (!brandId) return
  const owner = await apiAs('owner')
  await owner.delete(`/api/brands/${brandId}`)
  brandId = null
})

test('D51 G5: Target ABV 1000 is refused, by the browser and by the API, and nothing is saved', async ({ page }) => {
  const api = await apiAs('breweryMgr')
  const res = await api.post('/api/brands', { data: { name: tempTag('D51 ABV'), target_abv: 5.25 } })
  expect(res.status(), await res.text()).toBe(201)
  brandId = (await res.json()).data.id as number

  const puts: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'PUT' && new URL(r.url()).pathname === `/api/brands/${brandId}`) puts.push(r.url())
  })

  await page.goto(`/brands/${brandId}`)
  await page.getByTestId('brand-edit-button').click()
  const dialog = page.getByTestId('brand-form-dialog')
  const abv = dialog.getByLabel('Target ABV')
  await abv.fill('1000')

  // The browser refuses first: the field is out of range and nothing is sent.
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect.poll(() => abv.evaluate((e) => (e as HTMLInputElement).validity.rangeOverflow)).toBe(true)
  await expect(dialog).toBeVisible()
  expect(puts).toHaveLength(0)

  // Without the browser's check, the API refuses and the dialog shows the range.
  await dialog.locator('form').evaluate((f) => {
    ;(f as HTMLFormElement).noValidate = true
  })
  const refused = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/brands/${brandId}`,
  )
  await dialog.getByRole('button', { name: 'Save' }).click()
  expect((await refused).status()).toBe(422)
  await expect(dialog.getByRole('alert')).toContainText('must be between 0 and 100')

  // Persist-verify: still 5.25 after a reload, on the page and in the API.
  await page.reload()
  await expect(page.getByText('5.25', { exact: true })).toBeVisible()
  const saved = (await (await api.get(`/api/brands/${brandId}`)).json()).data
  expect(Number(saved.target_abv)).toBe(5.25)
})
