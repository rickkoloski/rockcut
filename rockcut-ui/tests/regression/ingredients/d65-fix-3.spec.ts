import { test, expect, type Locator, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import {
  adoptParty,
  adoptProduct,
  apiAs,
  categoryId,
  cleanupIngredients,
  denverToday,
  expectNoSidewaysScroll,
  makeD65Ingredient,
  makeD65Lot,
  makeD65Product,
  makeProduct,
  makeSupplier,
  openDialog,
  pick,
  setQuantityDisplay,
  tempTag,
} from './helpers'

// D65 lead decisions 3 (DEV QA fix cycle): "Other manufacturer…" / "Other
// maltster…" keeps the product dialog and lets you search every manufacturer
// company (gap 2); Totals Copy puts the $ total on its own row (gap 3) with
// "tablets" and whole counts (gap 4); the Formula box only on Water Salts
// (gap 1); All Categories fits 360 px (gap 5); the order summary before a
// quantity counts the line's own pack (gap 6). Every row is `[TEST-TEMP]`.

test.use({ storageState: authFile('brewer1') })
test.beforeEach(async () => setQuantityDisplay('brewer1', 'packs'))
test.afterAll(cleanupIngredients)

const re = (s: string) => new RegExp(s.replace(/[[\]().*+?^$|{}\\]/g, '\\$&'))

async function ok<T>(res: { status: () => number; text: () => Promise<string>; json: () => Promise<{ data: T }> }, status = 201): Promise<T> {
  expect(res.status(), await res.text()).toBe(status)
  return (await res.json()).data
}

/** A `[TEST-TEMP]` company with the manufacturer role only: it makes nothing yet, so it's under "Other …". */
async function manufacturer(label: string): Promise<{ id: number; name: string }> {
  const party = await ok<{ id: number; name: string }>(await (await apiAs('owner')).post('/api/parties', { data: { name: tempTag(label), roles: ['manufacturer'] } }))
  adoptParty(party.id)
  return party
}

/**
 * Gap 2: open the maker picker, choose "Other …", find `maker` by searching,
 * and pick it. The product dialog stays and keeps `typedName`. On a phone,
 * Back first closes the open list only.
 */
async function pickOther(page: Page, d: Locator, maker: { name: string }, typedName: string, phone: boolean) {
  const shown = d.getByTestId('product-maltster').locator('.MuiSelect-select')
  await d.getByRole('combobox', { name: /Manufacturer|Maltster/ }).click()
  await page.getByTestId('product-maltster-other').click()
  // The full list is open at once, the dialog under it (hidden from roles while the menu is open, so by test id).
  await expect(page.getByTestId('product-dialog')).toBeVisible()
  const search = page.getByTestId('product-maltster-search')
  await expect(search).toBeFocused()
  await expect(page.getByRole('option', { name: maker.name })).toBeVisible()
  if (phone) {
    // Back closes the list only; the dialog and its input stay.
    await page.goBack()
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await expect(d).toBeVisible()
    await expect(d.getByTestId('product-name')).toHaveValue(typedName)
    await d.getByRole('combobox', { name: /Manufacturer|Maltster/ }).click()
    await expect(search).toBeFocused()
  }
  // Searching narrows the list to the matches, plus the value already chosen (None, Rahr, …).
  const before = await shown.textContent()
  const fragment = maker.name.slice(-10)
  await search.fill(fragment)
  await expect.poll(async () => (await page.getByRole('option').allTextContents()).filter((o) => !o.includes(fragment) && o !== before)).toEqual([])
  await expect(page.getByRole('option', { name: maker.name })).toBeVisible()
  if (phone) await page.getByRole('option', { name: maker.name }).click()
  else {
    // By keyboard: the arrows go from the search box into the list (past None on D65), Enter picks.
    for (let i = 0; i < 3 && (await page.evaluate(() => document.activeElement?.textContent)) !== maker.name; i++) await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
  }
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(shown).toHaveText(maker.name)
  await expect(d.getByTestId('product-name')).toHaveValue(typedName)
}

/** Save; the saved product's maker. */
async function save(page: Page, d: Locator, method: 'POST' | 'PUT'): Promise<{ id: number; manufacturer_party_id: number | null }> {
  const res = page.waitForResponse((r) => r.request().method() === method && /\/api\/ingredient_products(\/\d+)?$/.test(r.url()))
  await d.getByRole('button', { name: 'Save' }).click()
  const saved = await ok<{ id: number; manufacturer_party_id: number | null }>(await res, method === 'POST' ? 201 : 200)
  adoptProduct(saved.id)
  return saved
}

for (const size of [
  { name: 'desktop', width: 1366, height: 768, phone: false },
  { name: '360 px', width: 360, height: 740, phone: true },
]) {
  test(`gap 2 (${size.name}): a fruit product from a new manufacturer through "Other manufacturer…", on Add and Edit; the input survives`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height })
    const mango = await makeD65Ingredient('Other Mango', 'fruits')
    const maker = await manufacturer('Other Fruit Maker')
    await page.goto(`/ingredients?category=${await categoryId('fruits')}`)
    await page.getByTestId('ingredients-add-button').click()
    const d = await openDialog(page, page.getByTestId('add-d65-product'), 'product-dialog')
    await pick(page, d, 'Ingredient', re(mango.name))
    const name = tempTag('typed')
    await d.getByTestId('product-name').fill(name)
    await pickOther(page, d, maker, name, size.phone)
    await pick(page, d, 'Form', 'Purée')
    await pick(page, d, 'Unit', 'gal')
    const added = await save(page, d, 'POST')
    expect(added.manufacturer_party_id).toBe(maker.id)

    // Edit: another product of the ingredient moves to a second new maker.
    const other = await manufacturer('Other Fruit Maker 2')
    const whole = await makeD65Product(mango.id, 'Whole', 'lb', { name: tempTag('whole') })
    await page.goto(`/ingredients/products/${whole.id}`)
    const e = await openDialog(page, page.getByTestId('product-edit'), 'product-dialog')
    const kept = await e.getByTestId('product-name').inputValue()
    await pickOther(page, e, other, kept, size.phone)
    expect((await save(page, e, 'PUT')).manufacturer_party_id).toBe(other.id)
    if (size.phone) await expectNoSidewaysScroll(page)
  })

  test(`gap 2 (${size.name}): a grain product from a new maltster through "Other maltster…", on Add and Edit`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height })
    const maltster = await manufacturer('Other Maltster')
    await page.goto('/ingredients')
    await page.getByTestId('ingredients-add-button').click()
    const d = await openDialog(page, page.getByTestId('add-maltster-product'), 'product-dialog')
    await pick(page, d, 'Grain', '2-Row')
    const name = tempTag('new maltster 2-row')
    await d.getByTestId('product-name').fill(name)
    await pickOther(page, d, maltster, name, size.phone)
    const added = await save(page, d, 'POST')
    expect(added.manufacturer_party_id).toBe(maltster.id)

    const rahr = await makeProduct('Other maltster edit')
    const second = await manufacturer('Other Maltster 2')
    await page.goto(`/ingredients/products/${rahr.id}`)
    const e = await openDialog(page, page.getByTestId('product-edit'), 'product-dialog')
    await pickOther(page, e, second, rahr.name ?? '', size.phone)
    expect((await save(page, e, 'PUT')).manufacturer_party_id).toBe(second.id)
  })
}

test('gaps 3, 4: Totals Copy: per-unit Total rows carry no $, the $ total has its own row; a Tablet product copies "tablets" and whole counts', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  const supplier = await makeSupplier('Copy totals', null)
  const api = await apiAs('brewer1')
  const offer = async (productId: number, pack: string, size: string, price: string) => {
    const o = await ok<{ id: number }>(await api.post('/api/supplier_offers', { data: { product_id: productId, supplier_party_id: supplier.id, pack_name: pack, pack_size: size } }))
    await ok(await api.post(`/api/supplier_offers/${o.id}/prices`, { data: { price_per_pack: price, effective_on: '2020-01-01' } }))
    return o
  }
  const lot = (productId: number, pack: string, size: string, quantity: string) =>
    api.post('/api/ingredient_lots', {
      data: {
        product_id: productId,
        supplier_party_id: supplier.id,
        lot_number: tempTag('copy'),
        pack_name: pack,
        pack_size: size,
        received_date: denverToday(),
        initial_kind: 'opening',
        initial_quantity: quantity,
      },
    })
  const tabs = await makeD65Product((await makeD65Ingredient('Copy Tabs', 'Finings')).id, 'Tablet', 'each')
  const puree = await makeD65Product((await makeD65Ingredient('Copy Mango', 'fruits')).id, 'Purée', 'gal')
  const tub = await offer(tabs.id, 'tub', '500', '92.00')
  const pail = await offer(puree.id, 'pail', '5', '45.00')
  await ok(await lot(tabs.id, 'tub', '500', '750'))
  await ok(await lot(puree.id, 'pail', '5', '10'))
  await ok(
    await api.post('/api/purchase_orders', {
      data: {
        supplier_party_id: supplier.id,
        ordered_on: denverToday(),
        lines: [
          { offer_id: tub.id, packs_ordered: 1 },
          { offer_id: pail.id, packs_ordered: 2 },
        ],
      },
    }),
  )

  const copied = async (button: string) => {
    await page.getByTestId(button).click()
    return (await page.evaluate(() => navigator.clipboard.readText())).split('\n').map((l) => l.split('\t'))
  }

  await page.goto('/ingredients/totals')
  await pick(page, page.locator('body'), 'Supplier', supplier.name)
  await expect(page.getByTestId(`totals-inventory-${tabs.id}`)).toBeVisible()
  let rows = await copied('totals-inventory-copy')
  let col = (h: string) => rows[0].indexOf(h)
  const tabRow = rows.find((r) => r[2] === tabs.display_name)!
  expect([tabRow[col('On hand')], tabRow[col('Unit')]]).toEqual(['750', 'tablets'])
  let totals = rows.filter((r) => r[0] === 'Total')
  expect(totals.map((r) => [r[col('On hand')], r[col('Unit')], r[col('Value')]]).sort((a, b) => a[1].localeCompare(b[1]))).toEqual([
    ['10.00', 'gal', ''],
    ['750', 'tablets', ''],
  ])
  let value = rows.filter((r) => r[0] === 'Total value')
  expect(value).toHaveLength(1)
  expect(Number(value[0][col('Value')])).toBeGreaterThan(0)
  expect(value[0][col('On hand')]).toBe('')

  await page.getByTestId('totals-tab-orders').click()
  await pick(page, page.locator('body'), 'Supplier', supplier.name)
  await expect(page.getByTestId(`totals-orders-supplier-${supplier.id}`)).toBeVisible()
  rows = await copied('totals-orders-copy')
  col = (h: string) => rows[0].indexOf(h)
  for (const label of [`Total ${supplier.name}`, 'Total']) {
    totals = rows.filter((r) => r[0] === label)
    expect(totals.map((r) => [r[col('Quantity')], r[col('Unit')], r[col('$')]]).sort((a, b) => a[1].localeCompare(b[1]))).toEqual([
      ['10.00', 'gal', ''],
      ['500', 'tablets', ''],
    ])
    value = rows.filter((r) => r[0] === `${label} value`)
    expect(value).toHaveLength(1)
    expect(Number(value[0][col('$')])).toBe(92 + 2 * 45)
    expect(value[0][col('Quantity')]).toBe('')
  }
})

test('gap 1: the Formula box is on a Water Salts ingredient only', async ({ page }) => {
  await page.goto(`/ingredients?category=${await categoryId('fruits')}`)
  await page.getByTestId('ingredients-add-button').click()
  let d = await openDialog(page, page.getByTestId('add-d65-ingredient'), 'ingredient-dialog')
  await expect(d.getByTestId('ingredient-name')).toBeVisible()
  await expect(d.getByTestId('ingredient-formula')).toHaveCount(0)
  await d.getByRole('button', { name: 'Cancel' }).click()
  await expect(d).toHaveCount(0)

  await page.goto(`/ingredients?category=${await categoryId('Water Salts')}`)
  await page.getByTestId('ingredients-add-button').click()
  d = await openDialog(page, page.getByTestId('add-d65-ingredient'), 'ingredient-dialog')
  await expect(d.getByTestId('ingredient-formula')).toBeVisible()
})

test('gap 5: All Categories has no sideways scroll at 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  const product = await makeD65Product((await makeD65Ingredient('Wide Lot Mango', 'fruits')).id, 'Purée', 'gal')
  await makeD65Lot(product, '5')
  await page.goto('/ingredients?category=all')
  await expect(page.getByRole('cell', { name: re('Wide Lot Mango') })).toBeVisible()
  await expectNoSidewaysScroll(page)
})

test('gap 6: before a quantity is typed, the order summary counts the line own pack, in New order and Edit order', async ({ page }) => {
  const supplier = await makeSupplier('Summary pails', null)
  const puree = await makeD65Product((await makeD65Ingredient('Summary Mango', 'fruits')).id, 'Purée', 'gal')
  const api = await apiAs('brewer1')
  const pail = await ok<{ id: number }>(await api.post('/api/supplier_offers', { data: { product_id: puree.id, supplier_party_id: supplier.id, pack_name: 'pail', pack_size: '5' } }))
  await ok(await api.post(`/api/supplier_offers/${pail.id}/prices`, { data: { price_per_pack: '116.50', effective_on: '2020-01-01' } }))

  await page.goto('/ingredients/orders')
  const d = await openDialog(page, page.getByTestId('orders-new'), 'order-dialog')
  await pick(page, d, 'Supplier', supplier.name)
  await pick(page, d, 'Offer', /pail · 5 gal/)
  await expect(d.getByTestId('order-running-total')).toHaveText('0 pails · 0 gal · $0.00')
  await d.getByTestId('order-line-0-packs').fill('1')
  await expect(d.getByTestId('order-running-total')).toHaveText('1 pail · 5 gal · $116.50')
  await d.getByRole('button', { name: 'Cancel' }).click()
  await expect(d).toHaveCount(0)

  const order = await ok<{ id: number }>(
    await api.post('/api/purchase_orders', { data: { supplier_party_id: supplier.id, ordered_on: denverToday(), lines: [{ offer_id: pail.id, packs_ordered: 2 }] } }),
  )
  await page.goto(`/ingredients/orders/${order.id}`)
  const e = await openDialog(page, page.getByTestId('order-edit'), 'order-dialog')
  await expect(e.getByTestId('order-running-total')).toHaveText('2 pails · 10 gal · $233.00')
  await e.getByTestId('order-line-0-packs').fill('')
  await expect(e.getByTestId('order-running-total')).toHaveText('0 pails · 0 gal · $0.00')
})
