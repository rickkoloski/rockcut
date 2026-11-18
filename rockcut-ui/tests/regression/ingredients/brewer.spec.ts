import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import {
  SACK,
  adoptProduct,
  apiAs,
  cleanupIngredients,
  denverToday,
  expectLotOnHand,
  expectOnHand,
  getProduct,
  lotsOf,
  makeLot,
  makeProduct,
  movementsOf,
  pick,
  quantityDisplayOf,
  setQuantityDisplay,
  tempTag,
} from './helpers'

// D60 spec §9, as `brewer1` (Brewery employee): conversions on a new
// product, offers and prices, movements with the sacks/lb toggle, loans,
// over on-hand, oldest first (and expired lots), and the recipe lot picker.

test.use({ storageState: authFile('brewer1') })
test.beforeEach(async () => setQuantityDisplay('brewer1', 'sacks'))
test.afterAll(async () => {
  await setQuantityDisplay('brewer1', 'sacks')
  await cleanupIngredients()
})

const dialog = (page: Page, id: string) => page.getByTestId(id)

async function recordMovement(page: Page, opts: { kind?: string; lot?: RegExp; sacks?: string; lb?: string; partner?: string }) {
  await page.getByTestId('product-record-movement').click()
  const d = dialog(page, 'movement-dialog')
  if (opts.kind) await pick(page, d, 'Kind', opts.kind)
  if (opts.lot) await pick(page, d, 'Lot', opts.lot)
  if (opts.partner) await pick(page, d, 'Partner brewery', opts.partner)
  if (opts.sacks) await d.getByTestId('movement-quantity-sacks').fill(opts.sacks)
  if (opts.lb) await d.getByTestId('movement-quantity-lb').fill(opts.lb)
  return d
}

test('B1: a new maltster product with color entered as 3.0 SRM shows 2.78 °L "entered as 3.0 SRM"', async ({ page }) => {
  const name = tempTag('B1 SRM')
  await page.goto('/ingredients')
  await page.getByTestId('ingredients-add-button').click()
  await page.getByTestId('add-maltster-product').click()
  const d = dialog(page, 'product-dialog')
  await pick(page, d, 'Grain', /^2-Row$/)
  await pick(page, d, 'Maltster', /^Rahr$/)
  await d.getByTestId('product-name').fill(name)
  await d.getByTestId('convert-color_lovibond').click()
  const convert = page.getByTestId('convert-dialog-color_lovibond')
  await pick(page, convert, 'Unit', /^SRM$/)
  await convert.getByTestId('convert-value').fill('3.0')
  await expect(convert.getByTestId('convert-stored')).toHaveText('Stored as: 2.78 °L')
  await convert.getByTestId('convert-use').click()
  await expect(convert).toHaveCount(0)
  await expect(d.getByTestId('feature-color_lovibond')).toHaveValue('2.78')

  const created = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/ingredient_products'))
  await d.getByRole('button', { name: 'Save' }).click()
  const res = await created
  expect(res.status()).toBe(201)
  const id = (await res.json()).data.id as number
  adoptProduct(id)

  await expect(page).toHaveURL(new RegExp(`/ingredients/products/${id}$`))
  await expect(page.getByTestId('product-spec-color_lovibond')).toHaveText('2.78 °L')
  await expect(page.getByTestId('product-spec-color_lovibond-entered')).toHaveText('entered as 3.0 SRM')
  const color = (await getProduct(id)).features.color_lovibond
  expect(Number(color.value)).toBe(2.78)
  expect([Number(color.entered_value), color.entered_unit]).toEqual([3, 'srm'])
})

test('B2: a BSG offer at $48.50/sack; $51.00 from next month leaves today at $48.50, both in the history', async ({ page }) => {
  const product = await makeProduct('B2 offers')
  // makeProduct's offer is BSG already; this one is added on screen.
  await page.goto(`/ingredients/products/${product.id}`)
  await page.getByTestId('product-add-offer').click()
  const d = dialog(page, 'offer-dialog')
  await pick(page, d, 'Supplier', /^BSG$/)
  await d.getByLabel('Order name').fill('[TEST-TEMP] Rahr - Standard 2-row (milled)')
  await d.getByTestId('offer-sack-size').fill('55')
  await pick(page, d, 'We order it', /^Milled$/)
  const created = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/supplier_offers'))
  await d.getByRole('button', { name: 'Save' }).click()
  const offerId = (await (await created).json()).data.id as number
  await expect(d).toHaveCount(0)

  const addPrice = async (price: string, on: string) => {
    await page.getByTestId(`offer-add-price-${offerId}`).click()
    const p = dialog(page, 'price-dialog')
    await p.getByTestId('price-per-sack').fill(price)
    await p.getByTestId('price-effective-on').fill(on)
    await p.getByRole('button', { name: 'Save' }).click()
    await expect(p).toHaveCount(0)
  }
  const today = new Date()
  const nextMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)).toISOString().slice(0, 10)
  await addPrice('48.50', '2026-01-01')
  await expect(page.getByTestId(`offer-price-${offerId}`)).toHaveText('$48.50')
  await addPrice('51.00', nextMonth)
  await expect(page.getByTestId(`offer-price-${offerId}`)).toHaveText('$48.50')

  await page.getByTestId(`offer-history-${offerId}`).click()
  const rows = page.getByTestId(`price-history-${offerId}`).getByTestId('price-history-row')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText(`${nextMonth}: $51.00/sack`)
  await expect(rows.nth(1)).toContainText('2026-01-01: $48.50/sack')
  await expect(rows.nth(1)).toContainText('(current)')
  const offer = (await getProduct(product.id)).offers.find((o) => o.id === offerId)!
  expect(Number(offer.current_price?.price_per_sack)).toBe(48.5)
})

test('B3: "Used in brewing" 2 sacks 10 lb leaves 9 sacks 45 lb; total lb shows 540 lb; brewer2’s toggle is unchanged', async ({ page }) => {
  await setQuantityDisplay('brewer2', 'sacks')
  const product = await makeProduct('B3 toggle')
  await makeLot(product, 12, 10)
  await page.goto(`/ingredients/products/${product.id}`)
  await expect(page.getByTestId('product-on-hand')).toHaveText('12 sacks')

  const d = await recordMovement(page, { sacks: '2', lb: '10' })
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(d).toHaveCount(0)
  await expect(page.getByTestId('product-on-hand')).toHaveText('9 sacks 45 lb')
  await expectOnHand(product.id, 540)

  await page.getByTestId('quantity-toggle-lb').click()
  await expect(page.getByTestId('product-on-hand')).toHaveText('540 lb')
  await expect.poll(() => quantityDisplayOf('brewer1')).toBe('lb')
  expect(await quantityDisplayOf('brewer2')).toBe('sacks')
  // Saved on the account: a reload keeps it.
  await page.reload()
  await expect(page.getByTestId('product-on-hand')).toHaveText('540 lb')
})

test('B4: "Loaned out" needs a partner brewery; a use larger than on hand is refused with the on-hand', async ({ page }) => {
  const product = await makeProduct('B4 loan')
  await makeLot(product, 12, 10)
  await page.goto(`/ingredients/products/${product.id}`)

  const posts: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/inventory_movements')) posts.push(r.url())
  })
  let d = await recordMovement(page, { kind: 'Loaned out', sacks: '3' })
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(d.getByRole('alert')).toHaveText('Pick the partner brewery for a trade or loan')
  await expect(d.getByText('Required for trades and loans')).toBeVisible()
  expect(posts).toHaveLength(0)
  await pick(page, d, 'Partner brewery', '[SEED] Mountain Brewing')
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(d).toHaveCount(0)
  await expect(page.getByTestId('product-on-hand')).toHaveText('9 sacks')
  await expectOnHand(product.id, 9 * SACK)
  const loan = (await movementsOf(product.id)).find((m) => m.kind === 'loaned_out')
  expect(Number(loan?.quantity_lb)).toBe(-3 * SACK)
  await expect(page.getByTestId('product-movements')).toContainText('[SEED] Mountain Brewing')

  d = await recordMovement(page, { sacks: '20' })
  await expect(d.getByText('On hand: 9 sacks')).toBeVisible()
  await d.getByRole('button', { name: 'Save' }).click()
  // Gap 1: plain words in the person's sacks/lb, no field name.
  await expect(d.getByRole('alert')).toHaveText("That's more than the 9 sacks on hand")
  await d.getByRole('button', { name: 'Cancel' }).click()
  await expectOnHand(product.id, 9 * SACK)
})

test('B5: oldest first empties the older lot (Depleted) and takes the rest from the newer, as two movements; then 1 sack from the newer by choice', async ({ page }) => {
  const product = await makeProduct('B5 oldest')
  const older = await makeLot(product, 3, 30)
  const newer = await makeLot(product, 10, 7)
  await page.goto(`/ingredients/products/${product.id}`)

  let d = await recordMovement(page, { sacks: '5' })
  await expect(d.getByLabel('Lot')).toHaveText('Oldest first')
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(d).toHaveCount(0)
  await expect(page.getByTestId(`lot-status-${older.id}`)).toHaveText('Depleted')
  await expect(page.getByTestId(`lot-on-hand-${older.id}`)).toHaveText('0 lb')
  await expect(page.getByTestId(`lot-on-hand-${newer.id}`)).toHaveText('8 sacks')
  await expectLotOnHand(older.id, product.id, 0)
  await expectLotOnHand(newer.id, product.id, 8 * SACK)
  const used = (await movementsOf(product.id)).filter((m) => m.kind === 'used')
  expect(used.map((m) => [m.lot_id, Number(m.quantity_lb)]).sort()).toEqual(
    [
      [older.id, -3 * SACK],
      [newer.id, -2 * SACK],
    ].sort(),
  )

  d = await recordMovement(page, { lot: new RegExp(escape(newer.lot_number!)), sacks: '1' })
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(d).toHaveCount(0)
  await expect(page.getByTestId(`lot-on-hand-${newer.id}`)).toHaveText('7 sacks')
  await expectLotOnHand(newer.id, product.id, 7 * SACK)
  await expectOnHand(product.id, 7 * SACK)
})

test('B6: oldest first skips an expired lot; the expired lot picked by hand works', async ({ page }) => {
  const product = await makeProduct('B6 expired')
  const older = await makeLot(product, 3, 30)
  const newer = await makeLot(product, 10, 7)
  await page.goto(`/ingredients/products/${product.id}`)

  // Mark the older lot Expired on its dialog.
  await page.getByTestId(`lot-row-${older.id}`).click()
  const lotDialog = dialog(page, 'grain-lot-dialog')
  await lotDialog.getByTestId('lot-expired').check()
  await lotDialog.getByRole('button', { name: 'Save' }).click()
  await expect(lotDialog).toHaveCount(0)
  await expect(page.getByTestId(`lot-status-${older.id}`)).toHaveText('Expired')
  await expect(page.getByTestId('product-on-hand')).toHaveText('13 sacks · 3 sacks expired')

  let d = await recordMovement(page, { sacks: '2' })
  // Gap 1: Oldest first can take only what isn't expired; the expired stock is noted.
  await expect(d.getByText('On hand: 10 sacks · 3 sacks expired (pick that lot to use it)')).toBeVisible()
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(d).toHaveCount(0)
  await expectLotOnHand(older.id, product.id, 3 * SACK)
  await expectLotOnHand(newer.id, product.id, 8 * SACK)
  await expect(page.getByTestId(`lot-on-hand-${newer.id}`)).toHaveText('8 sacks')

  d = await recordMovement(page, { lot: new RegExp(`${escape(older.lot_number!)}.*Expired`), sacks: '1' })
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(d).toHaveCount(0)
  await expect(page.getByTestId(`lot-on-hand-${older.id}`)).toHaveText('2 sacks')
  await expectLotOnHand(older.id, product.id, 2 * SACK)
  expect((await getProduct(product.id)).expired_lb).toBe(String(2 * SACK))
})

test('B7: Recipe Grain Bill: a grain lot is labelled "Rahr · lot # · on hand · status" and can be added; depleted lots are left out; Est. OG shows', async ({ page }) => {
  const owner = await apiAs('owner')
  const tag = tempTag('B7 recipe')
  const post = async (path: string, data: Record<string, unknown>) => {
    const res = await owner.post(path, { data })
    expect(res.status(), await res.text()).toBe(201)
    return (await res.json()).data as { id: number }
  }
  const brand = await post('/api/brands', { name: tag })
  // Gap 7: 10 bbl at 75 %, 500 lb at 81.5 % FGDB → 1.0456.
  const recipe = await post('/api/recipes', { brand_id: brand.id, batch_size: 10, batch_size_unit: 'bbls', efficiency_target: 75 })
  const product = await makeProduct('B7 lot')
  const lot = await makeLot(product, 2, 3)
  const empty = await makeLot(product, 1, 10)
  const use = await (await apiAs('brewer1')).post('/api/inventory_movements', { data: { kind: 'used', quantity_lb: String(SACK), occurred_on: denverToday(), lot_id: empty.id } })
  expect(use.status(), await use.text()).toBe(201)
  try {
    await page.goto(`/brands/${brand.id}/recipes/${recipe.id}`)
    await page.getByRole('tab', { name: 'Grain Bill' }).click()
    await page.getByRole('button', { name: 'Add Ingredient' }).click()
    const d = page.getByRole('dialog')
    // The dialog opens on Grains, which lists its children's grains (2-Row is Base, Special B Crystal/Caramel).
    await expect(d.getByRole('combobox', { name: 'Category' })).toHaveText('Grains')
    await d.getByRole('combobox', { name: 'Ingredient' }).click()
    await expect(page.getByRole('option', { name: 'Special B', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    // Picking Base narrows it to Base's grains.
    await pick(page, d, 'Category', /^Base$/)
    await d.getByRole('combobox', { name: 'Ingredient' }).click()
    await expect(page.getByRole('option', { name: '2-Row', exact: true })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Special B', exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await pick(page, d, 'Category', /^Grains$/)
    await pick(page, d, 'Ingredient', /^2-Row$/)
    await d.getByLabel('Lot').click()
    const option = page.getByRole('option', { name: `Rahr · ${lot.lot_number} · 2 sacks · Available`, exact: true })
    await expect(option).toBeVisible()
    // Gap 8: the depleted lot isn't offered.
    await expect(page.getByRole('option', { name: new RegExp(escape(empty.lot_number!)) })).toHaveCount(0)
    await option.click()
    await d.getByLabel('Amount').fill('500')
    await d.getByLabel('Unit').fill('lb')
    const created = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/recipe_ingredients'))
    await d.getByRole('button', { name: 'Save' }).click()
    expect((await created).status()).toBe(201)
    await expect(d).toHaveCount(0)
    await expect(page.getByTestId('recipe-est-og')).toHaveText('Est. OG: 1.046')
    await page.goto(`/brands/${brand.id}`)
    await expect(page.getByRole('row').filter({ hasText: '1.046' })).toHaveCount(1)
  } finally {
    // The recipe (its lines go with it) and the brand; the lot goes with the product.
    await owner.delete(`/api/recipes/${recipe.id}`)
    await owner.delete(`/api/brands/${brand.id}`)
  }
  expect((await lotsOf(product.id)).map((l) => l.id).sort()).toEqual([lot.id, empty.id].sort())
})

test('B8: Delete on a lot asks first, naming its stock; Cancel keeps it. The sack size is fixed after its first movement', async ({ page }) => {
  const product = await makeProduct('B8 delete')
  const keep = await makeLot(product, 4, 5)
  const gone = await makeLot(product, 2, 3)
  await page.goto(`/ingredients/products/${product.id}`)

  await page.getByTestId(`lot-row-${gone.id}`).click()
  const lotDialog = dialog(page, 'grain-lot-dialog')
  await expect(lotDialog.getByTestId('grain-lot-sack-size')).toBeEnabled()
  await lotDialog.getByTestId('lot-delete').click()
  const confirm = page.getByTestId('lot-delete-confirm')
  await expect(confirm).toContainText(`Delete lot ${gone.lot_number}? Its Opening amount 2 sacks (110 lb) goes too.`)
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(confirm).toHaveCount(0)
  await expect(lotDialog).toBeVisible()
  expect((await lotsOf(product.id)).map((l) => l.id)).toContain(gone.id)
  await lotDialog.getByTestId('lot-delete').click()
  await confirm.getByRole('button', { name: 'Delete' }).click()
  await expect(lotDialog).toHaveCount(0)
  expect((await lotsOf(product.id)).map((l) => l.id)).toEqual([keep.id])
  await expectOnHand(product.id, 4 * SACK)

  // Gap 14: after a movement past its first, the sack size can't change.
  const d = await recordMovement(page, { sacks: '1' })
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(d).toHaveCount(0)
  await page.getByTestId(`lot-row-${keep.id}`).click()
  await expect(lotDialog.getByTestId('grain-lot-sack-size')).toBeDisabled()
  await expect(lotDialog.getByText('Fixed: the lot has movements after its first')).toBeVisible()
  await lotDialog.getByRole('button', { name: 'Cancel' }).click()
})

test('B9: a count that matches on-hand is recorded as "Counted, no change"; dates stop at today', async ({ page }) => {
  const product = await makeProduct('B9 count')
  await makeLot(product, 3, 4)
  await page.goto(`/ingredients/products/${product.id}`)
  const today = denverToday()

  await page.getByTestId('product-count').click()
  const d = dialog(page, 'count-dialog')
  await expect(d.getByTestId('count-date')).toHaveAttribute('max', today)
  await d.getByTestId('count-total-sacks').fill('3')
  await d.getByRole('button', { name: 'Save count' }).click()
  await expect(d).toHaveCount(0)
  const [count] = (await movementsOf(product.id)).filter((m) => m.kind === 'count')
  expect(Number(count.quantity_lb)).toBe(0)
  await expect(page.getByTestId(`movement-kind-${count.id}`)).toHaveText('Counted, no change')
  await expect(page.getByTestId(`movement-row-${count.id}`)).toContainText('Jake Brewer')
  await expectOnHand(product.id, 3 * SACK)

  const m = await recordMovement(page, { sacks: '1' })
  await expect(m.getByTestId('movement-date')).toHaveAttribute('max', today)
  await m.getByRole('button', { name: 'Cancel' }).click()
})

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
