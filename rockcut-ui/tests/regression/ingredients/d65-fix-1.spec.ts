import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import {
  apiAs,
  categoryId,
  cleanupIngredients,
  denverToday,
  expectNoSidewaysScroll,
  expectPhoneDialogClosed,
  makeD65Ingredient,
  makeD65Product,
  makeSupplier,
  openDialog,
  pick,
  setQuantityDisplay,
  tempTag,
} from './helpers'

// D65 lead decisions 1 (local QA fix cycle): a fractional tablet count is
// refused, never rounded (gaps 5, 7); Delete Ingredient with products is
// disabled with the reason (gap 13); a refusal is scrolled into view (gaps
// 1, 10); the spice fl oz pack (gap 3); one place for ions and Brix (gap 4);
// "1 tablet" and "tablets" on sums (gaps 6, 8); Totals' None (gap 9); the
// form fixed once there are lots; the recipe lot picker on a D65 lot (Q13).
// Every row is `[TEST-TEMP]`; Totals filter to the spec's own supplier.

test.use({ storageState: authFile('brewer1') })
test.beforeEach(async () => setQuantityDisplay('brewer1', 'packs'))
test.afterAll(cleanupIngredients)

const re = (s: string) => new RegExp(s.replace(/[[\]().*+?^$|{}\\]/g, '\\$&'))

async function ok<T>(res: { status: () => number; text: () => Promise<string>; json: () => Promise<{ data: T }> }, status = 201): Promise<T> {
  expect(res.status(), await res.text()).toBe(status)
  return (await res.json()).data
}

/** An offer through the API, with a price from long ago. */
async function offer(productId: number, supplierId: number, pack: string, size: string, price = '92.00'): Promise<{ id: number }> {
  const api = await apiAs('brewer1')
  const o = await ok<{ id: number }>(await api.post('/api/supplier_offers', { data: { product_id: productId, supplier_party_id: supplierId, pack_name: pack, pack_size: size } }))
  await ok(await api.post(`/api/supplier_offers/${o.id}/prices`, { data: { price_per_pack: price, effective_on: '2020-01-01' } }))
  return o
}

/** A lot through the API: `quantity` in the product's unit, in the offer's pack. */
async function lot(productId: number, supplierId: number, pack: string, size: string, quantity: string, features: Record<string, string> = {}) {
  return ok<{ id: number; lot_number: string }>(
    await (await apiAs('brewer1')).post('/api/ingredient_lots', {
      data: { product_id: productId, supplier_party_id: supplierId, lot_number: tempTag('fix1 lot'), pack_name: pack, pack_size: size, received_date: denverToday(), initial_kind: 'opening', initial_quantity: quantity, features },
    }),
  )
}

async function tabletProduct(label: string) {
  const ingredient = await makeD65Ingredient(label, 'Finings')
  const product = await makeD65Product(ingredient.id, 'Tablet', 'each')
  const supplier = await makeSupplier(`${label} supplier`, null)
  return { ingredient, product, supplier }
}

for (const size of [
  { name: 'desktop', width: 1366, height: 768 },
  { name: '360 px', width: 360, height: 740 },
]) {
  test(`gaps 5, 7 (${size.name}): Add lot 0.5 tub of 333 says "counted in whole tablets", Save stays disabled and nothing is sent; 0 says at least 1 tablet`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height })
    const { ingredient, product, supplier } = await tabletProduct('Kettle Tabs')
    await offer(product.id, supplier.id, 'tub', '333')
    const posts: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith('/api/ingredient_lots')) posts.push(r.postData() ?? '')
    })
    await page.goto(`/ingredients/products/${product.id}`)
    const d = await openDialog(page, page.getByTestId('product-add-lot'), 'add-lot-dialog')
    await pick(page, d, /Supplier offer/, /tub · 333/)
    // Gap 8: the header reads naturally.
    await expect(d.getByText('Quantity · tubs of 333 tablets')).toBeVisible()
    await d.getByTestId('lot-number').fill(tempTag('ODD'))
    await d.getByTestId('lot-quantity-packs').fill('0.5')
    await expect(d.getByText(`${ingredient.name} Tablet is counted in whole tablets`)).toBeVisible()
    const save = d.getByRole('button', { name: 'Save' })
    await expect(save).toBeDisabled()
    // A loose 2.5 says the same (not "Use a whole number").
    await d.getByTestId('lot-quantity-packs').fill('')
    await d.getByTestId('lot-quantity-lb').fill('2.5')
    await expect(d.getByText(`${ingredient.name} Tablet is counted in whole tablets`)).toBeVisible()
    await expect(d.getByText('Use a whole number')).toHaveCount(0)
    await expect(save).toBeDisabled()
    // 0: the API's smallest, in tablets.
    await d.getByTestId('lot-quantity-lb').fill('0')
    await save.click()
    await expect(d.getByRole('alert')).toHaveText('Enter at least 1 tablet')
    await expect(d.getByRole('alert')).toBeInViewport()
    expect(posts).toEqual([])
    if (size.width === 360) await expectNoSidewaysScroll(page)
    // A whole number of tablets saves as typed: 1 tub (333).
    await d.getByTestId('lot-quantity-lb').fill('')
    await d.getByTestId('lot-quantity-packs').fill('1')
    const saved = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/ingredient_lots'))
    await save.click()
    expect((await saved).status()).toBe(201)
    expect(JSON.parse(posts[0]).initial_quantity).toBe('333')
  })
}

test('gaps 5, 7: Count and Record movement refuse a fractional tablet count the same way; grain-style 0.5 gal pail stays fine', async ({ page }) => {
  const { ingredient, product, supplier } = await tabletProduct('Count Tabs')
  await offer(product.id, supplier.id, 'tub', '333')
  await lot(product.id, supplier.id, 'tub', '333', '333')
  await page.goto(`/ingredients/products/${product.id}`)

  const count = await openDialog(page, page.getByTestId('product-count'), 'count-dialog')
  await count.getByTestId('count-total-packs').fill('0.5')
  await expect(count.getByText(`${ingredient.name} Tablet is counted in whole tablets`)).toBeVisible()
  await expect(count.getByRole('button', { name: 'Save' })).toBeDisabled()
  await count.getByRole('button', { name: 'Cancel' }).click()

  const move = await openDialog(page, page.getByTestId('product-record-movement'), 'movement-dialog')
  await move.getByTestId('movement-quantity-packs').fill('0.25')
  await expect(move.getByText(`${ingredient.name} Tablet is counted in whole tablets`)).toBeVisible()
  await expect(move.getByRole('button', { name: 'Save' })).toBeDisabled()
  await move.getByRole('button', { name: 'Cancel' }).click()

  // A decimal unit takes a part pack: 0.5 pail of 5 gal is 2.5 gal.
  const mango = await makeD65Ingredient('Mango', 'fruits')
  const puree = await makeD65Product(mango.id, 'Purée', 'gal')
  await offer(puree.id, supplier.id, 'pail', '5', '45.00')
  await page.goto(`/ingredients/products/${puree.id}`)
  const d = await openDialog(page, page.getByTestId('product-add-lot'), 'add-lot-dialog')
  await pick(page, d, /Supplier offer/, /pail · 5 gal/)
  await d.getByTestId('lot-number').fill(tempTag('half pail'))
  await d.getByTestId('lot-quantity-packs').fill('0.5')
  const saved = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/ingredient_lots'))
  await d.getByRole('button', { name: 'Save' }).click()
  const res = await saved
  expect(res.status()).toBe(201)
  expect(JSON.parse(res.request().postData()!).initial_quantity).toBe('2.5')
})

test('gap 13: Delete Ingredient is disabled with the reason while it has a product; the API says so (422); one without products deletes', async ({ page }) => {
  const clarifier = await makeD65Ingredient('Clarifier A', 'Finings')
  await makeD65Product(clarifier.id, 'Liquid', 'fl oz')
  await page.goto(`/ingredients/${clarifier.id}`)
  await expect(page.getByTestId('ingredient-delete')).toBeDisabled()
  await expect(page.getByTestId('ingredient-delete-reason')).toHaveText(`${clarifier.name} has products; deactivate them instead`)
  const res = await (await apiAs('brewer1')).delete(`/api/ingredients/${clarifier.id}`)
  expect(res.status()).toBe(422)
  expect((await res.json()).errors.base).toEqual([`${clarifier.name} has products; deactivate them instead`])

  const bare = await makeD65Ingredient('Clarifier B', 'Finings')
  await page.goto(`/ingredients/${bare.id}`)
  await expect(page.getByTestId('ingredient-delete-reason')).toHaveCount(0)
  await page.getByTestId('ingredient-delete').click()
  const deleted = page.waitForResponse((r) => r.request().method() === 'DELETE' && r.url().endsWith(`/api/ingredients/${bare.id}`))
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  expect((await deleted).status()).toBe(204)
})

test('gaps 1, 10: at 1366×768 the duplicate-product refusal is scrolled into view after Save', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  const mango = await makeD65Ingredient('Mango', 'fruits')
  await makeD65Product(mango.id, 'Whole', 'lb')
  await page.goto(`/ingredients?category=${await categoryId('fruits')}`)
  await page.getByTestId('ingredients-add-button').click()
  await page.getByTestId('add-d65-product').click()
  const d = page.getByTestId('product-dialog')
  await pick(page, d, 'Ingredient', re(mango.name))
  await pick(page, d, 'Form', 'Whole')
  await pick(page, d, 'Unit', 'lb')
  // Save is at the bottom of the tall dialog; the alert goes at the top.
  await d.getByRole('button', { name: 'Save' }).scrollIntoViewIfNeeded()
  const refused = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/ingredient_products'))
  await d.getByRole('button', { name: 'Save' }).click()
  expect((await refused).status()).toBe(422)
  const alert = d.getByTestId('product-dialog-error')
  await expect(alert).toHaveText(`There's already a ${mango.name} Whole with manufacturer None.`)
  await expect(alert).toBeInViewport()
  await expect(alert).toBeFocused()
})

test('gap 3: a fl oz spice offer starts as a bottle (Spices have no jug)', async ({ page }) => {
  const vanilla = await makeD65Ingredient('Vanilla', 'spices')
  const extract = await makeD65Product(vanilla.id, 'Extract', 'fl oz')
  await page.goto(`/ingredients/products/${extract.id}`)
  const o = await openDialog(page, page.getByTestId('product-add-offer'), 'offer-dialog')
  await expect(o.getByRole('combobox', { name: /Pack/ })).toHaveText('bottle')
})

test('gap 4: ions read with one place on the ingredient, its product and the reopened dialog; Brix "14.0" on the lot and its label', async ({ page }) => {
  const salt = await makeD65Ingredient('Hydrous CaCl2', 'Water Salts')
  const api = await apiAs('brewer1')
  await ok(await api.put(`/api/ingredients/${salt.id}`, { data: { ions: { ca_ppm_per_g_gal: '72.0', cl_ppm_per_g_gal: '127.4' } } }), 200)
  const product = await makeD65Product(salt.id, 'Flake', 'lb')
  await page.goto(`/ingredients/${salt.id}`)
  await expect(page.getByTestId('ingredient-ions-shown')).toHaveText('Ca 72.0 · Cl 127.4')
  await page.getByRole('button', { name: 'Edit Ingredient' }).click()
  await expect(page.getByTestId('ion-ca_ppm_per_g_gal')).toHaveValue('72.0')
  const edit = page.getByTestId('ingredient-dialog')
  await edit.getByRole('button', { name: 'Cancel' }).click()
  await expectPhoneDialogClosed(page, edit)
  await page.goto(`/ingredients/products/${product.id}`)
  await expect(page.getByTestId('product-ions')).toHaveText('Ca 72.0 · Cl 127.4')

  const mango = await makeD65Ingredient('Mango', 'fruits')
  const puree = await makeD65Product(mango.id, 'Purée', 'gal', { features: { brix: { low: '12', high: '16' } } })
  const supplier = await makeSupplier('Brix supplier', null)
  const l = await lot(puree.id, supplier.id, 'pail', '5', '5', { brix: '14.0' })
  await page.goto(`/ingredients/products/${puree.id}`)
  await expect(page.getByTestId('product-item')).toContainText('12.0–16.0 °Bx')
  await expect(page.getByTestId(`lot-${l.id}-brix`)).toHaveText('14.0')
  const shown = await ok<{ label: string }>(await api.get(`/api/ingredient_lots/${l.id}`), 200)
  expect(shown.label).toMatch(/ · 14\.0 °Bx$/)
})

test('gaps 6, 8: "1 tablet" on a lot; "tablets" on the order total, the Receive picker and the Totals line', async ({ page }) => {
  const { product, supplier } = await tabletProduct('Single Tabs')
  const tub = await offer(product.id, supplier.id, 'tub', '500')
  const one = await lot(product.id, supplier.id, 'tub', '500', '1')
  await page.goto(`/ingredients/products/${product.id}`)
  await expect(page.getByTestId(`lot-on-hand-${one.id}`)).toHaveText('1 tablet')

  const order = await ok<{ id: number }>(await (await apiAs('brewer1')).post('/api/purchase_orders', { data: { supplier_party_id: supplier.id, ordered_on: denverToday(), lines: [{ offer_id: tub.id, packs_ordered: 1 }] } }))
  await page.goto(`/ingredients/orders/${order.id}`)
  await expect(page.getByTestId('order-totals')).toContainText('1 tub · 500 tablets · $92.00')
  const r = await openDialog(page, page.getByTestId('order-receive'), 'receive-dialog')
  await r.getByTestId('receive-line-0-row-0-lot').click()
  await expect(page.getByRole('option', { name: re(`${one.lot_number} · received ${denverToday()} · 1 tablet on hand`) })).toBeVisible()
  await page.keyboard.press('Escape')
  await r.getByRole('button', { name: 'Cancel' }).click()
  // The dialog's history entry goes a tick later; a goto before then is aborted (Stop 3, G3).
  await expectPhoneDialogClosed(page, r)

  await page.goto('/ingredients/totals')
  await page.getByTestId('totals-inventory-supplier').click()
  await page.getByRole('option', { name: supplier.name }).click()
  await expect(page.getByTestId('totals-inventory-total-each')).toHaveText('1 tablet')
})

test('gap 9: the Totals Manufacturer filter has None, which shows only the products with no manufacturer', async ({ page }) => {
  const { product, supplier } = await tabletProduct('None Tabs')
  await offer(product.id, supplier.id, 'tub', '500')
  await lot(product.id, supplier.id, 'tub', '500', '500')
  await page.goto('/ingredients/totals')
  await page.getByTestId('totals-inventory-maltster').click()
  const totals = page.waitForResponse((r) => r.url().includes('/api/ingredient_totals/inventory') && r.url().includes('manufacturer=none'))
  await page.getByRole('option', { name: 'None', exact: true }).click()
  const rows = (await (await totals).json()).data.rows as { product_id: number; manufacturer: string }[]
  expect(rows.map((x) => x.product_id)).toContain(product.id)
  expect(rows.every((x) => x.manufacturer === 'None')).toBe(true)
})

test('the form is fixed once a product has a lot, as the unit is', async ({ page }) => {
  const { product, supplier } = await tabletProduct('Locked Tabs')
  await page.goto(`/ingredients/products/${product.id}`)
  let d = await openDialog(page, page.getByTestId('product-edit'), 'product-dialog')
  await expect(d.getByRole('combobox', { name: /Form/ })).not.toHaveAttribute('aria-disabled', 'true')
  await d.getByRole('button', { name: 'Cancel' }).click()
  await expectPhoneDialogClosed(page, d)
  await lot(product.id, supplier.id, 'tub', '500', '500')
  await page.reload()
  d = await openDialog(page, page.getByTestId('product-edit'), 'product-dialog')
  await expect(d.getByRole('combobox', { name: /Form/ })).toHaveAttribute('aria-disabled', 'true')
  await expect(d.getByText('This product has lots, so its form stays Tablet')).toBeVisible()
})

async function recipeFor(page: Page) {
  const owner = await apiAs('owner')
  const brand = await ok<{ id: number }>(await owner.post('/api/brands', { data: { name: tempTag('Q13 brand') } }))
  const recipe = await ok<{ id: number }>(await owner.post('/api/recipes', { data: { brand_id: brand.id, batch_size: 10, batch_size_unit: 'bbls' } }))
  await page.goto(`/brands/${brand.id}/recipes/${recipe.id}`)
  return async () => {
    await owner.delete(`/api/recipes/${recipe.id}`)
    await owner.delete(`/api/brands/${brand.id}`)
  }
}

test('Q13: the recipe lot picker labels a fruit lot "… · lot # · 8.5 °Bx"', async ({ page }) => {
  const mango = await makeD65Ingredient('Mango', 'fruits')
  const puree = await makeD65Product(mango.id, 'Purée', 'gal')
  const supplier = await makeSupplier('Q13 supplier', null)
  const brix = await lot(puree.id, supplier.id, 'pail', '5', '10', { brix: '8.5' })
  const cleanup = await recipeFor(page)
  try {
    await page.getByRole('tab', { name: 'Grain Bill' }).click()
    await page.getByRole('button', { name: 'Add Ingredient' }).click()
    const d = page.getByRole('dialog')
    await pick(page, d, 'Category', /^Fruits$/)
    await pick(page, d, 'Ingredient', re(mango.name))
    await d.getByLabel('Lot').click()
    await expect(page.getByRole('option', { name: re(`${mango.name} Purée · None · ${brix.lot_number} · 8.5 °Bx · 2 pails · Available`) })).toBeVisible()
  } finally {
    await cleanup()
  }
})
