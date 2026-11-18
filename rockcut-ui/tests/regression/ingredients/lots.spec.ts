import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { SACK, cleanupIngredients, expectOnHand, getProduct, lotsOf, makeProduct, pick, setQuantityDisplay, tempTag } from './helpers'

// D60 spec §9, as `brewer2` (Brewery employee): Add lot with an opening
// amount, specs prefilled from the standard, a changed value marked on the
// lot and not on the product; extract entered as PPG, and as-is needing the
// moisture first.

test.use({ storageState: authFile('brewer2') })
test.beforeEach(async () => setQuantityDisplay('brewer2', 'sacks'))
test.afterAll(cleanupIngredients)

test('L1: a lot with an opening amount of 12 sacks; extract shows the standard; a changed moisture is marked on the lot only', async ({ page }) => {
  const product = await makeProduct('L1 lot', 'brewer2')
  const number = tempTag('L1')
  await page.goto(`/ingredients/products/${product.id}`)
  await page.getByTestId('product-add-lot').click()
  const d = page.getByTestId('add-lot-dialog')
  // The one offer is picked: BSG, 55 lb sacks.
  await expect(d.getByTestId('lot-sack-size')).toHaveValue('55')
  await d.getByTestId('lot-number').fill(number)
  await expect(d.getByLabel('Opening amount (already here)')).toBeChecked()
  await d.getByTestId('lot-quantity-sacks').fill('12')
  await expect(d.getByTestId('feature-extract_fgdb')).toHaveValue('81.5')
  await expect(d.getByTestId('feature-moisture_pct')).toHaveValue('4.5')
  await d.getByTestId('feature-moisture_pct').fill('5.1')
  await expect(d.getByText('changed from standard (4.50)')).toBeVisible()
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(d).toHaveCount(0)

  const [lot] = await lotsOf(product.id)
  expect(lot.lot_number).toBe(number)
  expect(Number(lot.on_hand_lb)).toBe(12 * SACK)
  expect(Number(lot.features.moisture_pct.value)).toBe(5.1)
  expect(Number(lot.features.extract_fgdb.value)).toBe(81.5)
  await expectOnHand(product.id, 12 * SACK)
  await expect(page.getByTestId('product-on-hand')).toHaveText('12 sacks')
  await expect(page.getByTestId(`lot-on-hand-${lot.id}`)).toHaveText('12 sacks')
  await expect(page.getByTestId(`lot-${lot.id}-changed-moisture_pct`)).toHaveText('Moisture 5.10')
  await expect(page.getByTestId(`lot-${lot.id}-changed-extract_fgdb`)).toHaveCount(0)
  await expect(page.getByTestId('product-movements')).toContainText('Opening amount')

  // The product's standard is unchanged.
  expect(Number((await getProduct(product.id)).features.moisture_pct.value)).toBe(4.5)
  await expect(page.getByTestId('product-spec-moisture_pct')).toHaveText('4.50 %')
})

test('L2: extract entered as 37.0 PPG stores 80.1 % FGDB; as-is with no moisture asks for the moisture first', async ({ page }) => {
  const product = await makeProduct('L2 ppg', 'brewer2')
  await page.goto(`/ingredients/products/${product.id}`)
  await page.getByTestId('product-add-lot').click()
  const d = page.getByTestId('add-lot-dialog')
  await d.getByTestId('lot-number').fill(tempTag('L2'))
  await d.getByTestId('lot-quantity-sacks').fill('1')

  // As-is with the moisture box empty: the popup asks for it and won't Use.
  await d.getByTestId('feature-moisture_pct').fill('')
  await d.getByTestId('convert-extract_fgdb').click()
  const convert = page.getByTestId('convert-dialog-extract_fgdb')
  await pick(page, convert, 'Unit', /as-is/)
  await convert.getByTestId('convert-value').fill('77')
  await expect(convert.getByTestId('convert-needs-moisture')).toBeVisible()
  await expect(convert.getByTestId('convert-use')).toBeDisabled()

  await pick(page, convert, 'Unit', /^PPG$/)
  // Gap 10: a result outside 0–100 % FGDB is shown but can't be used; a negative value is refused.
  await convert.getByTestId('convert-value').fill('50')
  await expect(convert.getByTestId('convert-out-of-range')).toHaveText('108.2 % FGDB is out of range: Extract must be between 0 and 100')
  await expect(convert.getByTestId('convert-use')).toBeDisabled()
  await convert.getByTestId('convert-value').fill('-1')
  await expect(convert.getByText('Enter 0 or more')).toBeVisible()
  await expect(convert.getByTestId('convert-use')).toBeDisabled()
  await convert.getByTestId('convert-value').fill('37.0')
  await expect(convert.getByTestId('convert-stored')).toHaveText('Stored as: 80.1 % FGDB')
  await convert.getByTestId('convert-use').click()
  await expect(convert).toHaveCount(0)
  await expect(d.getByTestId('feature-extract_fgdb')).toHaveValue('80.1')
  await expect(d.getByText('entered as 37.0 PPG')).toBeVisible()
  // Gap 11: moisture over 100 is refused on the form, not only by the server.
  await d.getByTestId('feature-moisture_pct').fill('150')
  await expect(d.getByText('Moisture must be between 0 and 100')).toBeVisible()
  await expect(d.getByRole('button', { name: 'Save' })).toBeDisabled()
  await d.getByTestId('feature-moisture_pct').fill('4.5')
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(d).toHaveCount(0)

  const [lot] = await lotsOf(product.id)
  const extract = lot.features.extract_fgdb
  expect(Number(extract.value)).toBe(80.1)
  expect([Number(extract.entered_value), extract.entered_unit]).toEqual([37, 'ppg'])
  await expect(page.getByTestId(`lot-${lot.id}-changed-extract_fgdb`)).toHaveText('Extract 80.1')
})
