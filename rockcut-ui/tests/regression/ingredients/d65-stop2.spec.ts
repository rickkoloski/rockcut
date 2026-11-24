import { test, expect, type Browser, type Page } from '@playwright/test'
import { authFile, type PersonaKey } from '../../config/test-env'
import {
  apiAs,
  categoryId,
  cleanupIngredients,
  denverToday,
  expectNoSidewaysScroll,
  expectPhoneDialogClosed,
  makeD65Ingredient,
  makeD65Lot,
  makeD65Product,
  makeHopProduct,
  makeOffer,
  makeProduct,
  makeSupplier,
  openDialog,
  pick,
  saveProduct,
  setQuantityDisplay,
  tempTag,
} from './helpers'

// D65 Stop 2 (spec §10 scenarios not covered in Stop 1): fruit Brix, sugar
// extract and Liquid-only Brix, a Water Salts ingredient's ions, a mixed
// order and its Receive, To order, the contract dialog, Totals per unit and
// per pack name, and the edges (people, devices, two people on one record,
// slow network, 360 px). Every row is `[TEST-TEMP]`; Totals filter to the
// spec's own supplier, as the seeded hops are on every environment.

test.use({ storageState: authFile('brewer1') })
test.beforeEach(async () => setQuantityDisplay('brewer1', 'packs'))
test.afterAll(cleanupIngredients)

const re = (s: string) => new RegExp(s.replace(/[[\]().*+?^$|{}\\]/g, '\\$&'))

async function as(browser: Browser, who: PersonaKey): Promise<Page> {
  const context = await browser.newContext({ storageState: authFile(who) })
  return context.newPage()
}

/** An offer of a D65 product through the API, with a price from long ago. */
async function d65Offer(productId: number, supplierId: number, pack: string, size: string, price: string, note: string | null = null): Promise<{ id: number }> {
  const api = await apiAs('brewer1')
  const res = await api.post('/api/supplier_offers', { data: { product_id: productId, supplier_party_id: supplierId, pack_name: pack, pack_size: size, pack_note: note } })
  expect(res.status(), await res.text()).toBe(201)
  const offer = (await res.json()).data as { id: number }
  expect((await api.post(`/api/supplier_offers/${offer.id}/prices`, { data: { price_per_pack: price, effective_on: '2020-01-01' } })).status()).toBe(201)
  return offer
}

async function onHand(call: Record<string, number>) {
  const res = await (await apiAs('brewer1')).post('/api/formulas/execute', { data: { calls: [{ function: 'inventory_on_hand', args: call }] } })
  return ((await res.json()).results as { status: string; value?: number; unit?: string; message?: string }[])[0]
}

test.describe('fruit', () => {
  test('a pail · 5 gal offer; Add lot with Brix 8.5 (typical 6.5–9) and one without; 8.55 refused; a count of 2 pails 1.5 gal; inventory_on_hand', async ({ page }) => {
    const strawberry = await makeD65Ingredient('Strawberry', 'fruits')
    const puree = await makeD65Product(strawberry.id, 'Purée', 'gal', { features: { brix: { low: '6.5', high: '9' } } })
    await makeD65Product(strawberry.id, 'Whole', 'lb')
    const supplier = await makeSupplier('Fruit supplier', null)
    await page.goto(`/ingredients/products/${puree.id}`)
    await expect(page.getByTestId('product-item')).toContainText('6.5–9.0 °Bx')

    // The offer dialog starts gal at a pail; a note follows the pack.
    const o = await openDialog(page, page.getByTestId('product-add-offer'), 'offer-dialog')
    await pick(page, o, 'Supplier', re(supplier.name))
    await expect(o.getByRole('combobox', { name: /Pack/ })).toHaveText('pail')
    await o.getByTestId('offer-pack-size').fill('5')
    await o.getByRole('button', { name: 'Save' }).click()
    await expect(o).toHaveCount(0)
    await expect(page.getByTestId('product-offers')).toContainText('pail · 5 gal')

    // Add lot: Brix optional, the typical range beside it; 8.55 can't be typed; 8.5 saves.
    const d = await openDialog(page, page.getByTestId('product-add-lot'), 'add-lot-dialog')
    await pick(page, d, /Supplier offer/, /pail · 5 gal/)
    await expect(d.getByText('typical 6.5–9.0')).toBeVisible()
    await d.getByTestId('lot-number').fill(tempTag('S lot'))
    await d.getByTestId('lot-quantity-packs').fill('1')
    await d.getByTestId('feature-brix').fill('8.55')
    await expect(d.getByRole('button', { name: 'Save' })).toBeDisabled()
    await d.getByTestId('feature-brix').fill('8.5')
    await d.getByRole('button', { name: 'Save' }).click()
    await expect(d).toHaveCount(0)
    const api = await apiAs('brewer1')
    const refused = await api.post('/api/ingredient_lots', {
      data: { product_id: puree.id, supplier_party_id: supplier.id, received_date: denverToday(), initial_kind: 'opening', initial_quantity: '5', features: { brix: '8.55' } },
    })
    expect(refused.status()).toBe(422)
    // A lot with no Brix (with an offer, a lot needs its supplier, D65 Stop 0).
    const plain = await api.post('/api/ingredient_lots', {
      data: { product_id: puree.id, supplier_party_id: supplier.id, pack_name: 'pail', pack_size: '5', received_date: denverToday(), initial_kind: 'opening', initial_quantity: '5' },
    })
    expect(plain.status()).toBe(201)
    const lots = (await (await api.get('/api/ingredient_lots', { params: { product_id: puree.id } })).json()).data as { lot_number: string; features: Record<string, { value: string }> }[]
    expect(lots.map((l) => (l.features.brix ? Number(l.features.brix.value) : null)).sort()).toEqual([8.5, null])

    // Count "2 pails 1.5 gal" (11.5 gal).
    await page.reload()
    const c = await openDialog(page, page.getByTestId('product-count'), 'count-dialog')
    await c.getByTestId('count-total-packs').fill('2')
    await c.getByTestId('count-total-lb').fill('1.5')
    await c.getByRole('button', { name: 'Save' }).click()
    await expect(c).toHaveCount(0)
    await expect(page.getByTestId('product-on-hand')).toHaveText('2 pails 1.5 gal')

    // §5.1: the Fruits list shows the Brix range.
    await page.goto(`/ingredients?category=${await categoryId('fruits')}`)
    await expect(page.getByTestId(`product-brix-${puree.id}`)).toHaveText('6.5–9.0')

    expect(await onHand({ product_id: puree.id })).toMatchObject({ status: 'ok', value: 11.5, unit: 'gal' })
    expect(await onHand({ ingredient_id: strawberry.id })).toMatchObject({ status: 'error', message: `${strawberry.name}'s products are in different units; ask for one product.` })
  })
})

test.describe('sugars', () => {
  test('extract copied and editable; Brix only on Liquid; a Dry lot sent a Brix is refused', async ({ page }) => {
    const dextrose = await makeD65Ingredient('Dextrose', 'sugars')
    const molasses = await makeD65Ingredient('Molasses', 'sugars')
    const dry = await makeD65Product(dextrose.id, 'Dry', null, { features: { extract_fgdb: '91' } })
    const liquid = await makeD65Product(molasses.id, 'Liquid', 'lb', { features: { extract_fgdb: '81.95' } })

    await page.goto(`/ingredients/products/${dry.id}`)
    await expect(page.getByTestId('product-item')).toContainText('91.0 % FGDB')
    let d = await openDialog(page, page.getByTestId('product-add-lot'), 'add-lot-dialog')
    await expect(d.getByTestId('feature-extract_fgdb')).toHaveValue('91')
    await expect(d.getByTestId('feature-brix')).toHaveCount(0)
    await d.getByTestId('feature-extract_fgdb').fill('90.55')
    await d.getByTestId('lot-quantity-lb').fill('50')
    await d.getByRole('button', { name: 'Save' }).click()
    await expect(d).toHaveCount(0)
    const lots = (await (await (await apiAs('brewer1')).get('/api/ingredient_lots', { params: { product_id: dry.id } })).json()).data as { features: Record<string, { value: string }> }[]
    expect(Number(lots[0].features.extract_fgdb.value)).toBe(90.55)

    await page.goto(`/ingredients/products/${liquid.id}`)
    d = await openDialog(page, page.getByTestId('product-add-lot'), 'add-lot-dialog')
    await expect(d.getByTestId('feature-extract_fgdb')).toHaveValue('81.95')
    await expect(d.getByTestId('feature-brix')).toBeVisible()
    await d.getByRole('button', { name: 'Cancel' }).click()

    // §5.1: the Sugars list shows extract.
    await page.goto(`/ingredients?category=${await categoryId('sugars')}`)
    await expect(page.getByTestId(`product-extract_fgdb-${dry.id}`)).toHaveText('91.0')
    await expect(page.getByTestId(`product-extract_fgdb-${liquid.id}`)).toHaveText('81.95')

    const res = await (await apiAs('brewer1')).post('/api/ingredient_lots', {
      data: { product_id: dry.id, received_date: denverToday(), initial_kind: 'opening', initial_quantity: '50', features: { brix: '40' } },
    })
    expect(res.status()).toBe(422)
    expect((await res.json()).errors.features.brix).toEqual(['Brix is only for Liquid sugars'])
  })
})

test('Water Salts: ions and a formula on the ingredient; read-only on its product page', async ({ page }) => {
  const gypsum = await makeD65Ingredient('Gypsum', 'Water Salts')
  const product = await makeD65Product(gypsum.id, 'Powder', null)
  await page.goto(`/ingredients/${gypsum.id}`)
  await page.getByRole('button', { name: 'Edit Ingredient' }).click().catch(async () => page.getByLabel('Edit Ingredient').click())
  const d = page.getByTestId('ingredient-dialog')
  await expect(d.getByTestId('ingredient-ions')).toBeVisible()
  await d.getByTestId('ingredient-formula').fill('CaSO₄·2H₂O')
  await d.getByTestId('ion-ca_ppm_per_g_gal').fill('61.5')
  await d.getByTestId('ion-so4_ppm_per_g_gal').fill('147.4')
  // D65 Stop 3: the ions save with the ingredient, one request.
  const put = page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().endsWith(`/api/ingredients/${gypsum.id}`))
  await d.getByRole('button', { name: 'Save' }).click()
  expect((await put).status()).toBe(200)
  await expect(d).toHaveCount(0)
  await expect(page.getByTestId('ingredient-formula-shown')).toHaveText('CaSO₄·2H₂O')
  await expect(page.getByTestId('ingredient-ions-shown')).toHaveText('Ca 61.5 · SO₄ 147.4')
  await page.goto(`/ingredients/products/${product.id}`)
  await expect(page.getByTestId('product-ions')).toHaveText('Ca 61.5 · SO₄ 147.4')
  // Read-only here: the product dialog has no ion boxes.
  await page.getByTestId('product-edit').click()
  await expect(page.getByTestId('product-dialog').getByTestId(/^ion-/)).toHaveCount(0)
})

test.describe('purchasing', () => {
  test('a mixed order: 39 of 40 packs; Receive prefills extract and makes a whole Whirlfloc lot; To order; Totals per unit and per pack name', async ({ page, browser }) => {
    // Lead decisions 4: one long walk (21 s of 30 on DEV); slow, not split.
    test.slow()
    const supplier = await makeSupplier('D65 mixed', 40)
    const grain = await makeProduct('D65 mixed grain')
    const grainOffer = await makeOffer(grain, supplier.id, '48.00')
    const hop = await makeHopProduct('D65 mixed')
    const hopOffer = await d65Offer(hop.id, supplier.id, 'box', '11', '170.50')
    const dex = await makeD65Ingredient('Dextrose', 'sugars')
    const sugar = await makeD65Product(dex.id, 'Dry', null, { features: { extract_fgdb: '91' } })
    const sugarOffer = await d65Offer(sugar.id, supplier.id, 'bag', '50', '45.50')
    const wfIngredient = await makeD65Ingredient('Whirlfloc', 'Finings')
    const wf = await makeD65Product(wfIngredient.id, 'Tablet', 'each', { name: 'T' })
    const tub = await d65Offer(wf.id, supplier.id, 'tub', '872', '92.00', '5 lb')

    const api = await apiAs('brewer1')
    const res = await api.post('/api/purchase_orders', {
      data: {
        supplier_party_id: supplier.id,
        ordered_on: denverToday(),
        lines: [
          { offer_id: grainOffer.id, packs_ordered: 30 },
          { offer_id: hopOffer.id, packs_ordered: 6 },
          { offer_id: sugarOffer.id, packs_ordered: 2 },
          { offer_id: tub.id, packs_ordered: 1 },
        ],
      },
    })
    expect(res.status(), await res.text()).toBe(201)
    const order = (await res.json()).data as { id: number; lines: { offer_id: number }[] }
    await page.goto(`/ingredients/orders/${order.id}`)
    await expect(page.getByTestId('order-page-target')).toHaveText('39 of 40 packs')
    await expect(page.getByText('tub · 872 tablets (5 lb)')).toBeVisible()

    const r = await openDialog(page, page.getByTestId('order-receive'), 'receive-dialog')
    const line = (name: string) => r.getByTestId(/^receive-line-\d+$/).filter({ hasText: name })
    for (const [name, number] of [[grain.display_name, 'G'], [hop.display_name, 'H'], [`${dex.name} Dry · None`, 'D'], [`${wfIngredient.name} T · None`, 'W']] as const) {
      const l = line(name)
      await pick(page, l, 'Goes to', 'New lot #')
      await l.getByLabel('Lot #').fill(tempTag(`D65 ${number}`))
    }
    await expect(line(`${dex.name} Dry · None`).getByTestId('feature-extract_fgdb')).toHaveValue('91')
    await line(hop.display_name).getByTestId('feature-alpha_acid_pct').fill('12')
    await line(hop.display_name).getByTestId(/crop-year$/).fill('2025')
    const received = page.waitForResponse((x) => x.request().method() === 'POST' && x.url().endsWith(`/api/purchase_orders/${order.id}/receive`))
    await r.getByRole('button', { name: 'Receive' }).click()
    expect((await received).status()).toBe(200)
    await expect(r).toHaveCount(0)

    const wfLots = (await (await api.get('/api/ingredient_lots', { params: { product_id: wf.id } })).json()).data as { on_hand: string }[]
    expect(wfLots.map((l) => Number(l.on_hand))).toEqual([872])
    const dexLots = (await (await api.get('/api/ingredient_lots', { params: { product_id: sugar.id } })).json()).data as { features: Record<string, { value: string }> }[]
    expect(Number(dexLots[0].features.extract_fgdb.value)).toBe(91)

    // Use 272: 600 tablets left, under a minimum of 1 tub (872): To order shows 1 tub.
    expect((await api.post('/api/inventory_movements', { data: { kind: 'used', product_id: wf.id, allocation: 'oldest_first', quantity: '272', occurred_on: denverToday() } })).status()).toBe(201)
    expect((await saveProduct(wf.id, { min_on_hand_packs: 1 })).status()).toBe(200)
    await page.goto('/ingredients/to-order')
    await expect(page.getByTestId(`to-order-${wf.id}`)).toBeVisible()
    // On hand reads in packs (D62); the shortfall is 1 tub.
    await expect(page.getByTestId(`to-order-${wf.id}-on-hand`)).toHaveText('0.69 tubs')
    await expect(page.getByTestId(`to-order-${wf.id}`)).toContainText('tub · 872 tablets (5 lb)')
    // A product with no stock reads in its own unit: "0 tablets".
    const bare = await makeD65Product(wfIngredient.id, 'Tablet', 'each', { name: tempTag('T2') })
    await d65Offer(bare.id, supplier.id, 'tub', '872', '92.00')
    expect((await saveProduct(bare.id, { min_on_hand_packs: 1 })).status()).toBe(200)
    await page.reload()
    await expect(page.getByTestId(`to-order-${bare.id}-on-hand`)).toHaveText('0 tablets')

    // Totals as owner, filtered to this supplier.
    const owner = await as(browser, 'owner')
    await owner.goto('/ingredients/totals')
    await owner.getByTestId('totals-inventory-supplier').click()
    await owner.getByRole('option', { name: supplier.name }).click()
    await expect(owner.getByTestId(`totals-inventory-${wf.id}-lb`)).toHaveText('600 tablets')
    await expect(owner.getByTestId('totals-inventory-total-tablets')).toHaveText('600 tablets')
    await expect(owner.getByTestId('totals-inventory-total-lb')).toHaveText(`${(30 * 55 + 6 * 11 + 2 * 50).toLocaleString('en-US')} lb`)
    await expect(owner.getByTestId('totals-inventory-total')).toContainText('$')
    await owner.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await owner.getByTestId('totals-inventory-copy').click()
    const rows = (await owner.evaluate(() => navigator.clipboard.readText())).split('\n').map((l) => l.split('\t'))
    expect(rows[0]).toContain('Unit')
    const wfRow = rows.find((x) => x[2] === wf.display_name)!
    // D65 lead decisions 3 (gap 4): a Tablet product's Unit is its label, the count whole.
    expect(wfRow[rows[0].indexOf('Unit')]).toBe('tablets')
    expect(wfRow[rows[0].indexOf('On hand')]).toBe('600')
    // The Grains view reads as D61.
    await owner.getByTestId('totals-inventory-category').click()
    await owner.getByRole('option', { name: 'Grains', exact: true }).click()
    for (const h of ['Grain', 'Maltster', 'Sacks', '$/lb']) await expect(owner.getByTestId('totals-inventory-table').locator('thead')).toContainText(h)

    await owner.getByTestId('totals-tab-orders').click()
    await owner.getByTestId('totals-orders-supplier').click()
    await owner.getByRole('option', { name: supplier.name }).click()
    await expect(owner.getByTestId('totals-orders-total-received')).toHaveText('2 bags · 6 boxes · 30 sacks · 1 tub')
    await expect(owner.getByTestId('totals-orders-total-quantity')).toContainText('872 tablets')
    await owner.context().close()
  })

  test('the contract dialog never offers a D65 product', async ({ browser }) => {
    const supplier = await makeSupplier('D65 contract', null)
    const dex = await makeD65Ingredient('Dextrose', 'sugars')
    const sugar = await makeD65Product(dex.id, 'Dry', null)
    await d65Offer(sugar.id, supplier.id, 'bag', '50', '45.50')
    const grain = await makeProduct('D65 contract grain')
    await makeOffer(grain, supplier.id)
    const page = await as(browser, 'breweryMgr')
    await page.goto('/ingredients/contracts')
    const d = await openDialog(page, page.getByTestId('contracts-new'), 'contract-dialog')
    await pick(page, d, 'Supplier', supplier.name)
    await d.getByTestId('contract-line-0-product').click()
    await expect(page.getByRole('option', { name: re(grain.display_name) })).toBeVisible()
    await expect(page.getByRole('option', { name: re(dex.name) })).toHaveCount(0)
    await page.context().close()
  })
})

test.describe('§10 gaps closed in Stop 3', () => {
  test('brewer2: Calcium Chloride (Flake, lb) and a liquid fining in a jug · 128 fl oz; spice offers bag · 16 oz and bottle · 32 fl oz; fl oz in Totals', async ({ browser }) => {
    // Lead decisions 4: the longest D65 test (17 s locally).
    test.slow()
    const page = await as(browser, 'brewer2')
    const cacl = await makeD65Ingredient('Calcium Chloride', 'Water Salts')
    const fining = await makeD65Ingredient('Biofine', 'Finings')
    const supplier = await makeSupplier('D65 consumables', null)

    // Calcium Chloride: Flake, lb is the only unit.
    await page.goto(`/ingredients?category=${await categoryId('Water Salts')}`)
    await page.getByTestId('ingredients-add-button').click()
    await page.getByTestId('add-d65-product').click()
    let d = page.getByTestId('product-dialog')
    await pick(page, d, 'Ingredient', re(cacl.name))
    await pick(page, d, 'Form', 'Flake')
    await expect(d.getByRole('combobox', { name: /Unit/ })).toHaveText('lb')
    let created = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/ingredient_products'))
    await d.getByRole('button', { name: 'Save' }).click()
    expect((await created).status()).toBe(201)
    await expect(page.getByTestId('product-item')).toContainText('Flake · lb · Water Salts')

    // A liquid fining in fl oz; its offer starts as a jug.
    await page.goto(`/ingredients?category=${await categoryId('Finings')}`)
    await page.getByTestId('ingredients-add-button').click()
    await page.getByTestId('add-d65-product').click()
    d = page.getByTestId('product-dialog')
    await pick(page, d, 'Ingredient', re(fining.name))
    await pick(page, d, 'Form', 'Liquid')
    await pick(page, d, 'Unit', 'fl oz')
    created = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/ingredient_products'))
    await d.getByRole('button', { name: 'Save' }).click()
    const liquid = (await (await created).json()).data as { id: number }
    const o = await openDialog(page, page.getByTestId('product-add-offer'), 'offer-dialog')
    await pick(page, o, 'Supplier', re(supplier.name))
    await expect(o.getByRole('combobox', { name: /Pack/ })).toHaveText('jug')
    await o.getByTestId('offer-pack-size').fill('128')
    await o.getByRole('button', { name: 'Save' }).click()
    await expect(o).toHaveCount(0)
    await expect(page.getByTestId('product-offers')).toContainText('jug · 128 fl oz')

    // Spices: bag · 16 oz and bottle · 32 fl oz.
    const cinnamon = await makeD65Product((await makeD65Ingredient('Cinnamon', 'spices')).id, 'Ground', 'oz')
    const vanilla = await makeD65Product((await makeD65Ingredient('Vanilla Extract', 'spices')).id, 'Extract', 'fl oz')
    await d65Offer(cinnamon.id, supplier.id, 'bag', '16', '12.00')
    await d65Offer(vanilla.id, supplier.id, 'bottle', '32', '38.00')
    await page.goto(`/ingredients/products/${vanilla.id}`)
    await expect(page.getByTestId('product-offers')).toContainText('bottle · 32 fl oz')
    await page.goto(`/ingredients/products/${cinnamon.id}`)
    await expect(page.getByTestId('product-offers')).toContainText('bag · 16 oz')

    // fl oz in Totals: its own subtotal line.
    const api = await apiAs('brewer2')
    for (const [id, qty] of [[liquid.id, '256'], [vanilla.id, '64']] as const) {
      const res = await api.post('/api/ingredient_lots', { data: { product_id: id, supplier_party_id: supplier.id, received_date: denverToday(), initial_kind: 'opening', initial_quantity: qty } })
      expect(res.status(), await res.text()).toBe(201)
    }
    const owner = await as(browser, 'owner')
    await owner.goto('/ingredients/totals')
    await owner.getByTestId('totals-inventory-supplier').click()
    await owner.getByRole('option', { name: supplier.name }).click()
    await expect(owner.getByTestId('totals-inventory-total-fl-oz')).toHaveText('320 fl oz')
    for (const p of [page, owner]) await p.context().close()
  })

  test('Receive into an existing lot #: a purée lot with Brix 8.5 shows read-only; 9.0 sent is refused', async ({ page }) => {
    const plum = await makeD65Ingredient('Plum existing', 'fruits')
    const product = await makeD65Product(plum.id, 'Purée', 'lb')
    const supplier = await makeSupplier('Plum existing supplier', null)
    const offer = await d65Offer(product.id, supplier.id, 'pail', '44', '113.50')
    const api = await apiAs('brewer1')
    const number = tempTag('P-1')
    expect(
      (await api.post('/api/ingredient_lots', { data: { product_id: product.id, supplier_party_id: supplier.id, lot_number: number, pack_name: 'pail', pack_size: '44', received_date: denverToday(), initial_kind: 'opening', initial_quantity: '44', features: { brix: '8.5' } } })).status(),
    ).toBe(201)
    const order = (await (await api.post('/api/purchase_orders', { data: { supplier_party_id: supplier.id, ordered_on: denverToday(), lines: [{ offer_id: offer.id, packs_ordered: 1 }] } })).json()).data as { id: number; lines: { id: number }[] }
    await page.goto(`/ingredients/orders/${order.id}`)
    const r = await openDialog(page, page.getByTestId('order-receive'), 'receive-dialog')
    await pick(page, r.getByTestId('receive-line-0'), 'Goes to', 'New lot #')
    await r.getByTestId('receive-line-0-row-0-number').fill(number)
    await expect(r.getByTestId('receive-line-0-row-0-existing')).toContainText('8.5')
    await expect(r.getByTestId('feature-brix')).toHaveCount(0)
    await r.getByRole('button', { name: 'Cancel' }).click()

    const refused = await api.post(`/api/purchase_orders/${order.id}/receive`, {
      data: { received_on: denverToday(), lines: [{ id: order.lines[0].id, packs_received: 1, allocations: [{ lot_number: number, packs: 1, features: { brix: '9.0' } }] }] },
    })
    expect(refused.status()).toBe(422)
  })
})

test.describe('edges', () => {
  test('floater and splitRole use the new pages; bartender1 and breweryDevice get 403 on every D65 route', async ({ browser }) => {
    const plum = await makeD65Ingredient('Plum', 'fruits')
    const product = await makeD65Product(plum.id, 'Purée', 'lb')
    const salt = await makeD65Ingredient('Salt', 'Water Salts')
    for (const who of ['floater', 'splitRole'] as PersonaKey[]) {
      const page = await as(browser, who)
      await page.goto(`/ingredients?category=${await categoryId('fruits')}`)
      await expect(page.getByTestId(`product-row-${product.id}`)).toBeVisible()
      await page.goto(`/ingredients/products/${product.id}`)
      await expect(page.getByTestId('product-item')).toContainText('Purée')
      await page.context().close()
    }
    const calls: [string, string, Record<string, unknown>?][] = [
      ['GET', `/api/ingredient_products/${product.id}`],
      ['POST', '/api/ingredient_products', { ingredient_id: plum.id, form: 'Whole', unit: 'lb' }],
      ['GET', `/api/ingredients/${salt.id}/ions`],
      ['PUT', `/api/ingredients/${salt.id}/ions`, { ions: { ca_ppm_per_g_gal: '1' } }],
      ['POST', '/api/ingredient_lots', { product_id: product.id, initial_kind: 'opening', initial_quantity: '1' }],
      ['GET', '/api/ingredient_categories'],
    ]
    for (const who of ['bartender1', 'breweryDevice'] as PersonaKey[]) {
      const api = await apiAs(who)
      for (const [method, path, data] of calls) expect((await api.fetch(path, { method, data })).status(), `${who} ${method} ${path}`).toBe(403)
    }
  })

  test('two people, one record: the second save of the fruit product gets the 409 and writes nothing', async ({ browser }) => {
    const plum = await makeD65Ingredient('Plum two', 'fruits')
    const product = await makeD65Product(plum.id, 'Purée', 'lb')
    const a = await as(browser, 'brewer1')
    const b = await as(browser, 'brewer2')
    for (const p of [a, b]) await p.goto(`/ingredients/products/${product.id}`)
    const da = await openDialog(a, a.getByTestId('product-edit'), 'product-dialog')
    const db = await openDialog(b, b.getByTestId('product-edit'), 'product-dialog')
    await da.getByTestId('product-name').fill(tempTag('first'))
    await da.getByRole('button', { name: 'Save' }).click()
    await expect(da).toHaveCount(0)
    await db.getByTestId('product-name').fill(tempTag('second'))
    const saved = b.waitForResponse((r) => r.request().method() === 'PUT' && r.url().endsWith(`/api/ingredient_products/${product.id}`))
    await db.getByRole('button', { name: 'Save' }).click()
    expect((await saved).status()).toBe(409)
    await expect(db).toContainText('Someone else changed this product')
    const now = (await (await (await apiAs('brewer1')).get(`/api/ingredient_products/${product.id}`)).json()).data as { name: string }
    expect(now.name).toMatch(/first/)
    for (const p of [a, b]) await p.context().close()
  })

  test('slow network: a double-click on Receive receives once', async ({ page }) => {
    const plum = await makeD65Ingredient('Plum slow receive', 'fruits')
    const product = await makeD65Product(plum.id, 'Purée', 'lb')
    const supplier = await makeSupplier('Plum slow supplier', null)
    const offer = await d65Offer(product.id, supplier.id, 'pail', '44', '113.50')
    const res = await (await apiAs('brewer1')).post('/api/purchase_orders', { data: { supplier_party_id: supplier.id, ordered_on: denverToday(), lines: [{ offer_id: offer.id, packs_ordered: 2 }] } })
    const order = (await res.json()).data as { id: number }
    await page.goto(`/ingredients/orders/${order.id}`)
    const posts: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith(`/api/purchase_orders/${order.id}/receive`)) posts.push(r.url())
    })
    const d = await openDialog(page, page.getByTestId('order-receive'), 'receive-dialog')
    await d.getByTestId('receive-line-0-row-0-number').fill(tempTag('slow R'))
    await d.getByTestId('feature-brix').fill('18')
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 1500, downloadThroughput: 50 * 1024, uploadThroughput: 50 * 1024 })
    await d.getByRole('button', { name: 'Receive' }).dblclick()
    await expect(d).toHaveCount(0, { timeout: 20_000 })
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
    expect(posts).toHaveLength(1)
    const lots = (await (await (await apiAs('brewer1')).get('/api/ingredient_lots', { params: { product_id: product.id } })).json()).data as { on_hand: string }[]
    expect(lots.map((l) => Number(l.on_hand))).toEqual([88])
  })

  test('slow network: a double-click on Save in Add lot writes one lot', async ({ page }) => {
    const plum = await makeD65Ingredient('Plum slow', 'fruits')
    const product = await makeD65Product(plum.id, 'Purée', 'lb', { features: { brix: { low: '17', high: '20' } } })
    await page.goto(`/ingredients/products/${product.id}`)
    const posts: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith('/api/ingredient_lots')) posts.push(r.url())
    })
    const d = await openDialog(page, page.getByTestId('product-add-lot'), 'add-lot-dialog')
    await d.getByTestId('lot-quantity-lb').fill('44')
    await d.getByTestId('feature-brix').fill('18')
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 1500, downloadThroughput: 50 * 1024, uploadThroughput: 50 * 1024 })
    const save = d.getByRole('button', { name: 'Save' })
    await save.dblclick()
    await expect(d).toHaveCount(0, { timeout: 20_000 })
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
    expect(posts).toHaveLength(1)
  })

  test.describe('at 360 px', () => {
    test.use({ viewport: { width: 360, height: 780 } })

    test('the fruit product page, Add lot with Brix, the Whirlfloc count and Totals with mixed units have no sideways scroll', async ({ page, browser }) => {
      const plum = await makeD65Ingredient('Plum phone', 'fruits')
      const fruit = await makeD65Product(plum.id, 'Purée', 'lb', { features: { brix: { low: '17', high: '20' } } })
      await makeD65Lot(fruit, '44')
      const wfi = await makeD65Ingredient('Whirlfloc phone', 'Finings')
      const wf = await makeD65Product(wfi.id, 'Tablet', 'each', { name: 'T' })
      await makeD65Lot(wf, '1272')

      await page.goto(`/ingredients/products/${fruit.id}`)
      await expect(page.getByTestId('product-item')).toContainText('17.0–20.0 °Bx')
      await expectNoSidewaysScroll(page)
      const d = await openDialog(page, page.getByTestId('product-add-lot'), 'add-lot-dialog')
      await expect(d.getByTestId('feature-brix')).toBeVisible()
      await expectNoSidewaysScroll(page)
      await d.getByRole('button', { name: 'Cancel' }).click()
      // The dialog's history entry goes a tick after it closes; a goto before that is aborted.
      await expectPhoneDialogClosed(page, d)

      await page.goto(`/ingredients/products/${wf.id}`)
      const c = await openDialog(page, page.getByTestId('product-count'), 'count-dialog')
      await expect(c.getByTestId('count-on-hand')).toHaveText('1,272 tablets')
      await expectNoSidewaysScroll(page)
      await c.getByRole('button', { name: 'Cancel' }).click()

      const owner = await browser.newContext({ storageState: authFile('owner'), viewport: { width: 360, height: 780 } })
      const o = await owner.newPage()
      await o.goto('/ingredients/totals')
      await expect(o.getByTestId('totals-inventory-total')).toBeVisible()
      await expectNoSidewaysScroll(o)
      await owner.close()
    })
  })
})
