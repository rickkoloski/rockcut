import { test, expect, type Browser, type Page } from '@playwright/test'
import { authFile, type PersonaKey } from '../../config/test-env'
import {
  BOX,
  adoptProduct,
  apiAs,
  cleanupIngredients,
  expectNoSidewaysScroll,
  getProduct,
  lotsOf,
  makeHopLot,
  makeHopProduct,
  makeHopVariety,
  makeOffer,
  makeOrder,
  makeProduct,
  openDialog,
  pick,
  saveProduct,
  tempTag,
} from './helpers'

// D62 local QA fix cycle 1 (`d62_lead_decisions_1.md`) in the browser, with
// the seeded hops present: Totals → Inventory by category with each
// product's pack (gap 4); maltster pickers (5); hop offers "box · 11 lb"
// (3); the Orders list's packs (6); Totals → Orders per pack name (11); a
// stale product save (9); receiving into an existing lot # (10); To order
// "0 lb" (12); ranges (2); line pickers at 360 px (8); no Add subcategory on
// Hops. Gap 1 is in `hops.spec.ts` H1. Every row a test makes is
// `[TEST-TEMP]`; the seeded hops are only read.

test.afterAll(cleanupIngredients)

const re = (s: string) => new RegExp(s.replace(/[[\]().*+?^$|{}\\]/g, '\\$&'))

async function as(browser: Browser, who: PersonaKey): Promise<Page> {
  const context = await browser.newContext({ storageState: authFile(who) })
  return context.newPage()
}

/** A seeded reference product by display name (read only). */
async function seeded(name: string): Promise<{ id: number; display_name: string }> {
  const list = (await (await (await apiAs('brewer1')).get('/api/ingredient_products')).json()).data as { id: number; display_name: string }[]
  const p = list.find((x) => x.display_name === name)
  expect(p, name).toBeTruthy()
  return p!
}

/** A `[TEST-TEMP]` company that sells a hop product (box) and a grain product (sack), each priced. */
async function mixedSupplier(label: string) {
  const hop = await makeHopProduct(label)
  const api = await apiAs('brewer1')
  await api.post(`/api/supplier_offers/${hop.offers[0].id}/prices`, { data: { price_per_pack: '165.00', effective_on: '2020-01-01' } })
  const grain = await makeProduct(`${label} grain`)
  const grainOffer = await makeOffer(grain, hop.company.id, '42.00')
  return { hop, hopOffer: hop.offers[0], grain, grainOffer, company: hop.company }
}

test.describe('brewer1', () => {
  test.use({ storageState: authFile('brewer1') })

  test('G4: Totals → Inventory: All categories with general headings and each product\'s pack; Hops alone; Grains reads as D61; Copy has Unit', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const queen = await seeded('John Fearless African Queen T90 Pellet')
    await page.goto('/ingredients/totals')
    const table = page.getByTestId('totals-inventory-table')
    await page.getByTestId('totals-inventory-category').click()
    await expect(page.getByRole('option', { name: 'All categories' })).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Escape')
    for (const h of ['Ingredient', 'Manufacturer', 'Form', 'On hand', 'Packs', 'Value', '$/unit']) await expect(table.locator('thead')).toContainText(h)
    await expect(table.locator('thead')).not.toContainText('Maltster')
    const row = page.getByTestId(`totals-inventory-${queen.id}`)
    await expect(row).toContainText('T90 Pellet')
    await expect(page.getByTestId(`totals-inventory-${queen.id}-lb`)).toHaveText('3.5 lb')
    await expect(page.getByTestId(`totals-inventory-${queen.id}-packs`)).toHaveText('0.32 boxes')

    await page.getByTestId('totals-inventory-copy').click()
    const lines = (await page.evaluate(() => navigator.clipboard.readText())).split('\n').map((l) => l.split('\t'))
    expect(lines[0]).toEqual(['Ingredient', 'Manufacturer', 'Product', 'Form', 'On hand', 'Unit', 'Expired', 'Packs', 'Pack', 'Value', '$/unit', 'Estimated'])
    const q = lines.find((l) => l[2] === queen.display_name)!
    expect([q[3], Number(q[4]), q[5], Number(q[6]), Number(q[7]), q[8]]).toEqual(['T90 Pellet', 3.5, 'lb', 0, 0.32, 'box'])

    await pick(page, page.locator('body'), 'Category', /^Hops$/)
    await expect(row).toBeVisible()
    await expect(table.locator('tbody')).not.toContainText('2-Row')

    await page.getByTestId('totals-inventory-category').click()
    await page.getByRole('option', { name: 'Grains', exact: true }).click()
    for (const h of ['Grain', 'Maltster', 'Sacks', '$/lb']) await expect(table.locator('thead')).toContainText(h)
    await expect(row).toHaveCount(0)
  })

  test('G5: grain screens list maltsters; a hop grower is under "Other manufacturer…" in the grain dialog', async ({ page }) => {
    const hop = await makeHopProduct('G5')
    await page.goto('/ingredients')
    await page.getByTestId('ingredients-add-button').click()
    await page.getByTestId('add-maltster-product').click()
    const d = page.getByTestId('product-dialog')
    await d.getByRole('combobox', { name: 'Maltster' }).click()
    await expect(page.getByRole('option', { name: 'Rahr', exact: true })).toBeVisible()
    await expect(page.getByRole('option', { name: re(hop.company.name) })).toHaveCount(0)
    await expect(page.getByRole('option', { name: 'Yakima Chief Hops' })).toHaveCount(0)
    await page.getByTestId('product-maltster-other').click()
    await page.getByRole('option', { name: re(hop.company.name) }).click()
    await expect(d.getByRole('combobox', { name: 'Maltster' })).toHaveText(hop.company.name)
    await d.getByRole('button', { name: 'Cancel' }).click()
    await expect(d).toHaveCount(0)

    // The library's Maltster filter on Grains, and Totals on Grains.
    await page.getByRole('combobox', { name: 'Maltster' }).click()
    await expect(page.getByRole('option', { name: 'Rahr', exact: true })).toBeVisible()
    await expect(page.getByRole('option', { name: re(hop.company.name) })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await page.goto('/ingredients/totals')
    await page.getByTestId('totals-inventory-category').click()
    await page.getByRole('option', { name: 'Grains', exact: true }).click()
    await page.getByTestId('totals-inventory-maltster').click()
    await expect(page.getByRole('option', { name: 'Rahr', exact: true })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Yakima Chief Hops' })).toHaveCount(0)
  })

  test('G3, G6, G11: a mixed order: hop offers read box · 11 lb; the Orders list counts packs; Totals → Orders per pack name', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const { hop, hopOffer, grainOffer, company } = await mixedSupplier('G6')
    const mixed = await makeOrder(company.id, [
      { offerId: grainOffer.id, packs: 2 },
      { offerId: hopOffer.id, packs: 3 },
    ])
    const grainOnly = await makeOrder(company.id, [{ offerId: grainOffer.id, packs: 4 }])

    await page.goto('/ingredients/orders')
    await expect(page.getByTestId('orders-table').locator('thead')).toContainText('Packs')
    await expect(page.getByTestId(`order-${mixed.id}-packs`)).toHaveText('5 packs')
    await expect(page.getByTestId(`order-${grainOnly.id}-packs`)).toHaveText('4 sacks')

    // Gap 3: the hop offer has no form, in the API and the picker.
    expect((await getProduct(hop.id)).offers[0]).toMatchObject({ form: null })
    await page.goto(`/ingredients/orders/${mixed.id}`)
    const d = await openDialog(page, page.getByTestId('order-edit'), 'order-dialog')
    await d.getByTestId('order-line-1-offer').click()
    const option = page.getByRole('option', { name: re(hop.ingredient!.name) })
    await expect(option).toHaveText(`${hop.ingredient!.name} T90 Pellet · ${company.name} · box · 11 lb`)
    await page.keyboard.press('Escape')
    await d.getByRole('button', { name: 'Cancel' }).click()

    await page.goto('/ingredients/totals')
    await page.getByTestId('totals-tab-orders').click()
    await page.getByTestId('totals-orders-supplier').click()
    await page.getByRole('option', { name: company.name }).click()
    await expect(page.getByTestId('totals-orders-total-ordered')).toHaveText('3 boxes · 6 sacks')
    await expect(page.getByTestId(`totals-orders-supplier-${company.id}`)).toContainText('3 boxes · 6 sacks')
    await expect(page.getByTestId('totals-orders-note')).toHaveText('Open orders count the packs ordered; received ones the packs received.')
    await page.getByTestId('totals-orders-copy').click()
    const rows = (await page.evaluate(() => navigator.clipboard.readText())).split('\n').map((l) => l.split('\t'))
    expect(rows[0]).toEqual(['Order date', 'Supplier', 'Reference', 'Product', 'Status', 'Boxes ordered', 'Boxes received', 'Sacks ordered', 'Sacks received', 'lb', '$'])
    expect(rows.at(-1)!.slice(0, 1).concat(rows.at(-1)!.slice(5, 9))).toEqual(['Total', '3', '0', '6', '0'])
  })

  test('G10: receiving into a lot # the product already has shows its crop year and alpha read only and adds to it', async ({ page }) => {
    const hop = await makeHopProduct('G10')
    const api = await apiAs('brewer1')
    await api.post(`/api/supplier_offers/${hop.offers[0].id}/prices`, { data: { price_per_pack: '165.00', effective_on: '2020-01-01' } })
    const lot = await makeHopLot(hop, '22', 5, '14.1')
    const order = await makeOrder(hop.company.id, [{ offerId: hop.offers[0].id, packs: 1 }])

    await page.goto(`/ingredients/orders/${order.id}`)
    const d = await openDialog(page, page.getByTestId('order-receive'), 'receive-dialog')
    await pick(page, d.getByTestId('receive-line-0-row-0'), 'Goes to', 'New lot #')
    await d.getByTestId('receive-line-0-row-0-number').fill(` ${lot.lot_number!.toLowerCase()} `)
    await expect(d.getByText(`Adds to existing lot ${lot.lot_number}`)).toBeVisible()
    await expect(d.getByTestId('receive-line-0-row-0-existing')).toHaveText('Crop year 2025 · Alpha acid 14.10 %')
    await expect(d.getByTestId('receive-line-0-row-0-crop-year')).toHaveCount(0)
    const received = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith(`/api/purchase_orders/${order.id}/receive`))
    await d.getByRole('button', { name: 'Receive' }).click()
    expect((await received).status()).toBe(200)
    const lots = await lotsOf(hop.id)
    expect(lots.map((l) => [l.id, Number(l.on_hand)])).toEqual([[lot.id, 22 + BOX]])
  })

  test('G2: one-ended and equal ranges read ≥, ≤ and one number on the product page and the list', async ({ page }) => {
    const { hop, company } = await makeHopVariety('G2')
    const res = await (await apiAs('brewer1')).post('/api/ingredient_products', {
      data: {
        ingredient_id: hop.id,
        manufacturer_party_id: company.id,
        form: 'Cryo',
        features: { alpha_acid_pct: { low: '12', high: null }, beta_acid_pct: { low: null, high: '9' }, total_oil_ml_100g: { low: '2.5', high: '2.5' } },
      },
    })
    expect(res.status()).toBe(201)
    const product = (await res.json()).data as { id: number }
    adoptProduct(product.id)
    await page.goto(`/ingredients/products/${product.id}`)
    await expect(page.getByTestId('product-spec-alpha_acid_pct')).toHaveText('≥ 12 %')
    await expect(page.getByTestId('product-spec-beta_acid_pct')).toHaveText('≤ 9 %')
    await expect(page.getByTestId('product-spec-total_oil_ml_100g')).toHaveText('2.5 mL/100 g')
    await page.goto('/ingredients')
    await pick(page, page.locator('body'), 'Category', /^Hops$/)
    const row = page.getByTestId(`hop-row-${product.id}`)
    await expect(row).toContainText('≥ 12')
    await expect(row).toContainText('≤ 9')
    await expect(row).not.toContainText('12–')
  })

  test('G12: To order reads "0 lb" for a hop product with nothing on hand', async ({ page }) => {
    const hop = await makeHopProduct('G12')
    expect((await saveProduct(hop.id, { min_on_hand_packs: 2 })).status()).toBe(200)
    await page.goto('/ingredients/to-order')
    await expect(page.getByTestId(`to-order-${hop.id}-on-hand`)).toHaveText('0 lb')
  })
})

test('G9: two people edit one hop product: the second save is refused (409) and nothing is lost', async ({ browser }) => {
  const hop = await makeHopProduct('G9')
  const a = await as(browser, 'brewer1')
  const b = await as(browser, 'brewer2')
  for (const p of [a, b]) await p.goto(`/ingredients/products/${hop.id}`)
  const da = await openDialog(a, a.getByTestId('product-edit'), 'product-dialog')
  const db = await openDialog(b, b.getByTestId('product-edit'), 'product-dialog')

  await da.getByTestId('range-alpha_acid_pct-low').fill('10.5')
  await da.getByRole('button', { name: 'Save' }).click()
  await expect(da).toHaveCount(0)

  await db.getByTestId('product-origin').fill(tempTag('Origin'))
  const refused = b.waitForResponse((r) => r.request().method() === 'PUT' && r.url().endsWith(`/api/ingredient_products/${hop.id}`))
  await db.getByRole('button', { name: 'Save' }).click()
  expect((await refused).status()).toBe(409)
  await expect(db).toContainText('Someone else changed this product since you opened it. Close and reopen it to see their change.')

  const now = await getProduct(hop.id)
  expect([now.features?.alpha_acid_pct?.value, (now as unknown as { origin: string }).origin]).toEqual(['10.5', 'USA'])
  await db.getByRole('button', { name: 'Cancel' }).click()
  const again = await openDialog(b, b.getByTestId('product-edit'), 'product-dialog')
  await expect(again.getByTestId('range-alpha_acid_pct-low')).toHaveValue('10.5')
})

test.describe('360 px', () => {
  test.use({ storageState: authFile('brewer1'), viewport: { width: 360, height: 760 }, hasTouch: true, isMobile: true })

  test('G8: an order line picker shows the variety and form first, wrapped, not cut off', async ({ page }) => {
    const { hop, hopOffer, grainOffer, company } = await mixedSupplier('G8')
    const order = await makeOrder(company.id, [
      { offerId: grainOffer.id, packs: 1 },
      { offerId: hopOffer.id, packs: 1 },
    ])
    await page.goto(`/ingredients/orders/${order.id}`)
    const d = await openDialog(page, page.getByTestId('order-edit'), 'order-dialog')
    const picker = d.getByTestId('order-line-1-offer')
    await expect(picker.locator('.MuiSelect-select')).toHaveText(`${hop.ingredient!.name} T90 Pellet · ${company.name} · box · 11 lb`)
    // The whole label shows: it wraps rather than ending in "…".
    const cut = await picker.locator('.MuiSelect-select').evaluate((el) => el.scrollWidth > el.clientWidth + 1)
    expect(cut).toBe(false)
    await expectNoSidewaysScroll(page)
  })
})

test.describe('owner', () => {
  test.use({ storageState: authFile('owner') })

  test('Hops has no Add subcategory; Grains keeps it', async ({ page }) => {
    const categories = (await (await (await apiAs('owner')).get('/api/ingredient_categories')).json()).data as { id: number; key: string | null }[]
    await page.goto(`/ingredients/categories/${categories.find((c) => c.key === 'hops')!.id}`)
    await expect(page.getByRole('heading', { name: 'Hops' }).first()).toBeVisible()
    await expect(page.getByTestId('category-add-child')).toHaveCount(0)
    await page.goto(`/ingredients/categories/${categories.find((c) => c.key === 'grains')!.id}`)
    await expect(page.getByTestId('category-add-child')).toBeVisible()
  })
})
