import { test, expect, type Locator, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import {
  adoptIngredient,
  adoptParty,
  adoptProduct,
  apiAs,
  categoryId,
  cleanupIngredients,
  denverToday,
  expectNoSidewaysScroll,
  makeD65Ingredient,
  makeD65Product,
  makeOffer,
  makeProduct,
  makeSupplier,
  openDialog,
  pick,
  setQuantityDisplay,
  tempTag,
} from './helpers'

// D64 Stop 1 (spec §4.1–§4.3, §4.6, §6.1–§6.2, §6.4, §9, A13; plan Stop 1):
// yeast in the library (the seeded reference products are read, never
// written), a yeast product and lots of a spec's own `[TEST-TEMP]` strain and
// lab, pitch size on a Liquid lot, a Pitch into a batch, the Strain Type
// settings (managers edit, brewers read), and D65 DEV QA gap 9 (an order line
// with no offer reads "Packs" / "$ / pack", "Sacks" for a sacks-only supplier).

test.use({ storageState: authFile('brewer1') })
test.beforeEach(async () => setQuantityDisplay('brewer1', 'packs'))

const madeTypes = new Set<number>()
test.afterAll(async () => {
  await cleanupIngredients()
  const mgr = await apiAs('breweryMgr')
  for (const id of madeTypes) await mgr.delete(`/api/yeast/strain_types/${id}`).catch(() => null)
})

async function ok<T>(res: { status: () => number; text: () => Promise<string>; json: () => Promise<{ data: T }> }, status = 201): Promise<T> {
  expect(res.status(), await res.text()).toBe(status)
  return (await res.json()).data
}

/** A `[TEST-TEMP]` lab (manufacturer and supplier) and strain. */
async function makeLabAndStrain(label: string) {
  const owner = await apiAs('owner')
  const lab = await ok<{ id: number; name: string }>(await owner.post('/api/parties', { data: { name: tempTag(`${label} Labs`), roles: ['manufacturer', 'supplier'] } }))
  adoptParty(lab.id)
  const strain = await makeD65Ingredient(`${label} Ale`, 'yeast')
  return { lab, strain }
}

/** Click Save (or Pitch) with a required field empty: the form stops it and nothing is sent. */
async function refusedBeforeSending(page: Page, d: Locator, button: string, path: RegExp) {
  let sent = 0
  const count = (r: { method: () => string; url: () => string }) => {
    if (r.method() === 'POST' && path.test(r.url())) sent += 1
  }
  page.on('request', count)
  await d.getByRole('button', { name: button }).click()
  await page.waitForTimeout(300)
  page.off('request', count)
  expect(sent).toBe(0)
  await expect(d).toBeVisible()
}

async function yeastLibrary(page: Page) {
  await page.goto(`/ingredients?category=${await categoryId('yeast')}`)
}

test('the seeded strains read "Chico Ale US-05 · Fermentis" in bricks, with Lab, Code and Type; the filters narrow them', async ({ page }) => {
  await yeastLibrary(page)
  const table = page.getByTestId('products-table')
  await expect(table.locator('thead')).toContainText('Strain')
  await expect(table.locator('thead')).toContainText('Lab')
  await expect(table.locator('thead')).toContainText('Code')
  await expect(table.locator('thead')).toContainText('Type')
  await expect(table.locator('thead')).toContainText('Temp °F')

  const us05 = table.locator('tr', { hasText: 'US-05' })
  await expect(us05).toContainText('Chico Ale')
  await expect(us05).toContainText('Fermentis')
  await expect(us05).toContainText('Dry')
  await expect(us05).toContainText('Ale')
  await expect(us05).toContainText('BSG $76.99/brick')

  // The Lab filter is labelled Lab; Form and Type narrow the list.
  await expect(page.getByRole('combobox', { name: 'Lab' })).toBeVisible()
  await pick(page, page.locator('body'), 'Form', 'Liquid')
  await expect(table.locator('tr', { hasText: 'US-05' })).toHaveCount(0)
  await expect(table.locator('tr', { hasText: 'II-711' })).toContainText('German Monk Lager')
  await pick(page, page.locator('body'), 'Type', 'Lacto')
  await expect(table.locator('tr', { hasText: 'II-991' })).toContainText('Lactobacillus brevis')
  await expect(table.locator('tr', { hasText: 'II-711' })).toHaveCount(0)

  // The product page: the display name, bricks, the Lab.
  await page.goto(`/ingredients?category=${await categoryId('yeast')}`)
  await page.getByTestId('products-table').locator('tr', { hasText: 'US-05' }).click()
  await expect(page.getByRole('heading', { name: 'Chico Ale US-05 · Fermentis' })).toBeVisible()
  await expect(page.getByText('Lab', { exact: true })).toBeVisible()
  await expect(page.getByTestId('product-item')).toContainText('bricks')
})

test('a yeast product needs its lab and code; a Liquid lot needs its pitch size (copied and editable); 1.5 bricks is refused', async ({ page }) => {
  const { lab, strain } = await makeLabAndStrain('Pitchy')
  await yeastLibrary(page)
  await page.getByTestId('ingredients-add-button').click()
  await page.getByTestId('add-d65-product').click()
  const d = page.getByTestId('product-dialog')
  await expect(d).toBeVisible()
  await expect(d.getByText('Add yeast product')).toBeVisible()
  await pick(page, d, 'Strain', strain.name)
  await pick(page, d, 'Form', 'Liquid')
  // No lab: refused before it's sent (no "None" on yeast).
  await refusedBeforeSending(page, d, 'Save', /\/api\/ingredient_products$/)
  await d.getByRole('combobox', { name: /Lab/ }).click()
  await expect(page.getByTestId('product-maltster-none')).toHaveCount(0)
  const other = page.getByTestId('product-maltster-other')
  if (await other.isVisible()) await other.click()
  await page.getByRole('option', { name: lab.name }).click()
  // No code: refused too.
  await refusedBeforeSending(page, d, 'Save', /\/api\/ingredient_products$/)
  await d.getByTestId('product-name').fill('TT-001')
  await d.getByLabel('Pitch size').fill('7')
  const res = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/ingredient_products'))
  await d.getByRole('button', { name: 'Save' }).click()
  const product = (await (await res).json()).data as { id: number; display_name: string; unit_label: string }
  adoptProduct(product.id)
  expect(product.display_name).toBe(`${strain.name} TT-001 · ${lab.name}`)
  expect(product.unit_label).toBe('pitchables')
  await expect(page).toHaveURL(new RegExp(`/ingredients/products/${product.id}$`))

  // Add lot: the pitch size starts at 7, is required, and the lot keeps 10.
  const lot = await openDialog(page, page.getByTestId('product-add-lot'), 'add-lot-dialog')
  await expect(lot.getByLabel(/Pitch size/)).toHaveValue('7')
  await lot.getByLabel(/Pitch size/).fill('')
  await lot.getByTestId('lot-quantity-lb').fill('2')
  await lot.getByRole('button', { name: 'Save' }).click()
  await expect(lot.getByText('Enter the pitch size')).toBeVisible()
  await lot.getByLabel(/Pitch size/).fill('10')
  await lot.getByTestId('lot-quantity-lb').fill('1.5')
  await expect(lot.getByText(/TT-001 is counted in whole pitchables/)).toBeVisible()
  await lot.getByTestId('lot-quantity-lb').fill('2')
  await lot.getByRole('button', { name: 'Save' }).click()
  await expect(lot).toHaveCount(0)
  await expect(page.getByTestId('product-on-hand')).toHaveText('2 pitchables')

  const api = await apiAs('brewer1')
  const lots = await ok<{ features: Record<string, { value: string }> }[]>(await api.get(`/api/ingredient_lots?product_id=${product.id}`), 200)
  expect(lots[0].features.pitch_bbl.value).toBe('10')
  const saved = await ok<{ features: Record<string, { value: string }> }>(await api.get(`/api/ingredient_products/${product.id}`), 200)
  expect(saved.features.pitch_bbl.value).toBe('7')
})

test('Pitch 1 brick into a batch: a used movement naming the batch; Oldest first; on hand goes down', async ({ page }) => {
  const { lab, strain } = await makeLabAndStrain('Brick')
  const product = await makeD65Product(strain.id, 'Dry', null, { manufacturer_party_id: lab.id, name: 'TT-B1' })
  expect(product.unit_label).toBe('bricks')
  const api = await apiAs('brewer1')
  await ok(await api.post('/api/ingredient_lots', { data: { product_id: product.id, lot_number: tempTag('brick lot'), received_date: denverToday(), initial_kind: 'opening', initial_quantity: '3' } }))

  // An open batch to name (the local and DEV data have some; else one is made).
  let batches = await ok<{ id: number; label: string; open: boolean }[]>(await api.get('/api/yeast/batches'), 200)
  if (!batches.some((b) => b.open)) {
    const brands = await ok<{ id: number }[]>(await api.get('/api/brands'), 200)
    await ok(await api.post('/api/batches', { data: { brand_id: brands[0].id, batch_number: tempTag('b'), status: 'fermenting' } }))
    batches = await ok(await api.get('/api/yeast/batches'), 200)
  }
  const batch = batches.find((b) => b.open)!

  await page.goto(`/ingredients/products/${product.id}`)
  await expect(page.getByTestId('product-on-hand')).toHaveText('3 bricks')
  const d = await openDialog(page, page.getByTestId('product-pitch'), 'pitch-dialog')
  // No batch: refused before it's sent.
  await refusedBeforeSending(page, d, 'Pitch', /\/pitch$/)
  await pick(page, d, 'Batch', batch.label)
  await d.getByTestId('pitch-quantity-lb').fill('1')
  await d.getByTestId('pitch-note').fill('brew day')
  const res = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith(`/api/ingredient_products/${product.id}/pitch`))
  await d.getByRole('button', { name: 'Pitch' }).click()
  expect((await res).status()).toBe(201)
  await expect(d).toHaveCount(0)
  await expect(page.getByTestId('product-on-hand')).toHaveText('2 bricks')
  await expect(page.getByTestId('product-movements')).toContainText(`→ ${batch.label} · brew day`)
})

test('strain types: a manager adds, renames and deletes one; a brewer sees them read-only', async ({ browser }) => {
  const mgrContext = await browser.newContext({ storageState: authFile('breweryMgr') })
  const mgr = await mgrContext.newPage()
  await mgr.goto(`/ingredients?category=${await categoryId('yeast')}`)
  await mgr.getByTestId('ingredients-settings').click()
  await mgr.getByTestId('ingredients-settings-yeast').click()
  const settings = mgr.getByTestId('yeast-settings')
  await expect(settings.getByTestId('strain-types')).toContainText('Lacto')
  await expect(settings.getByTestId('strain-types-read-only')).toHaveCount(0)

  const name = tempTag('Kveik')
  await settings.getByTestId('strain-type-add').click()
  const add = mgr.getByTestId('strain-type-dialog')
  await add.getByTestId('strain-type-name').fill(name)
  const created = mgr.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/yeast/strain_types'))
  await add.getByRole('button', { name: 'Save' }).click()
  const type = (await (await created).json()).data as { id: number }
  madeTypes.add(type.id)
  await expect(settings.getByTestId(`strain-type-${type.id}`)).toContainText(name)

  await settings.getByTestId(`strain-type-${type.id}-edit`).click()
  const rename = mgr.getByTestId('strain-type-dialog')
  await rename.getByTestId('strain-type-name').fill(`${name} (Voss)`)
  await rename.getByRole('button', { name: 'Save' }).click()
  await expect(settings.getByTestId(`strain-type-${type.id}`)).toContainText(`${name} (Voss)`)

  // Ale is in use: Delete is disabled.
  const ale = settings.locator('tr', { hasText: /^Ale/ }).first()
  await expect(ale.getByRole('button', { name: 'Delete Ale' })).toBeDisabled()

  await settings.getByTestId(`strain-type-${type.id}-delete`).click()
  await mgr.getByRole('button', { name: 'Confirm' }).or(mgr.getByRole('button', { name: 'Delete' })).last().click()
  await expect(settings.getByTestId(`strain-type-${type.id}`)).toHaveCount(0)
  madeTypes.delete(type.id)
  await mgrContext.close()
})

test('strain types are read-only for a brewer (no add, rename or delete)', async ({ page }) => {
  await yeastLibrary(page)
  await page.getByTestId('ingredients-settings').click()
  await page.getByTestId('ingredients-settings-yeast').click()
  const settings = page.getByTestId('yeast-settings')
  await expect(settings.getByTestId('strain-types')).toContainText('Ale')
  await expect(settings.getByTestId('strain-types-read-only')).toHaveText('Only Brewery managers and owners change these.')
  await expect(settings.getByTestId('strain-type-add')).toHaveCount(0)
  await expect(settings.getByRole('button', { name: /^Rename|^Delete/ })).toHaveCount(0)
})

test('gap 9: an order line with no offer reads "Packs" / "$ / pack" (no supplier, mixed, Edit order → Add line); a sacks-only supplier "Sacks"', async ({ page }) => {
  const mixed = await makeSupplier('Gap9 mixed', 40)
  const api = await apiAs('brewer1')
  const puree = await makeD65Product((await makeD65Ingredient('Gap9 Mango', 'fruits')).id, 'Purée', 'gal')
  const pail = await ok<{ id: number }>(await api.post('/api/supplier_offers', { data: { product_id: puree.id, supplier_party_id: mixed.id, pack_name: 'pail', pack_size: '5' } }))
  await ok(await api.post(`/api/supplier_offers/${pail.id}/prices`, { data: { price_per_pack: '116.50', effective_on: '2020-01-01' } }))
  await makeOffer(await makeProduct('Gap9 Grain'), mixed.id)

  const line = (d: Locator) => ({ packs: d.getByLabel('Packs', { exact: true }), price: d.getByLabel('$ / pack', { exact: true }) })

  await page.goto('/ingredients/orders')
  const d = await openDialog(page, page.getByTestId('orders-new'), 'order-dialog')
  await expect(line(d).packs).toBeVisible()
  await expect(line(d).price).toBeVisible()
  await pick(page, d, 'Supplier', mixed.name)
  await expect(line(d).packs).toBeVisible()
  await expect(line(d).price).toBeVisible()
  await expect(d.getByLabel('Sacks', { exact: true })).toHaveCount(0)
  // A number typed before the pick is kept: packs, which is what it becomes.
  await d.getByTestId('order-line-0-packs').fill('3')
  await pick(page, d, 'Offer', /pail · 5 gal/)
  await expect(d.getByLabel('Pails', { exact: true })).toHaveValue('3')
  await expect(d.getByLabel('$ / pail', { exact: true })).toBeVisible()
  await d.getByRole('button', { name: 'Cancel' }).click()
  await expect(d).toHaveCount(0)

  // Edit order → Add line.
  const order = await ok<{ id: number }>(await api.post('/api/purchase_orders', { data: { supplier_party_id: mixed.id, ordered_on: denverToday(), lines: [{ offer_id: pail.id, packs_ordered: 2 }] } }))
  await page.goto(`/ingredients/orders/${order.id}`)
  const e = await openDialog(page, page.getByTestId('order-edit'), 'order-dialog')
  await e.getByTestId('order-add-line').click()
  await expect(line(e).packs).toBeVisible()
  await expect(line(e).price).toBeVisible()
  await e.getByRole('button', { name: 'Cancel' }).click()
  await expect(e).toHaveCount(0)

  // A sacks-only supplier: D61's words.
  const grain = await makeSupplier('Gap9 sacks', 40)
  await makeOffer(await makeProduct('Gap9 Sack Grain'), grain.id)
  await page.goto('/ingredients/orders')
  const g = await openDialog(page, page.getByTestId('orders-new'), 'order-dialog')
  await pick(page, g, 'Supplier', grain.name)
  await expect(g.getByLabel('Sacks', { exact: true })).toBeVisible()
  await expect(g.getByLabel('$ / sack', { exact: true })).toBeVisible()
})

test.describe('at 360 px', () => {
  test.use({ viewport: { width: 360, height: 780 } })

  test('the yeast library, a yeast product page, Pitch and the New order line have no sideways scroll', async ({ page }) => {
    await yeastLibrary(page)
    await expect(page.getByTestId('grains-cards')).toContainText('Chico Ale US-05 · Fermentis')
    await expectNoSidewaysScroll(page)

    const { lab, strain } = await makeLabAndStrain('Narrow')
    const product = await makeD65Product(strain.id, 'Dry', null, { manufacturer_party_id: lab.id, name: 'TT-N1' })
    adoptIngredient(strain.id)
    const api = await apiAs('brewer1')
    await ok(await api.post('/api/ingredient_lots', { data: { product_id: product.id, lot_number: tempTag('narrow'), received_date: denverToday(), initial_kind: 'opening', initial_quantity: '1' } }))
    await page.goto(`/ingredients/products/${product.id}`)
    await expect(page.getByTestId('product-on-hand')).toHaveText('1 brick')
    await expectNoSidewaysScroll(page)
    const d = await openDialog(page, page.getByTestId('product-pitch'), 'pitch-dialog')
    await expect(d.getByTestId('pitch-batch')).toBeVisible()
    await expectNoSidewaysScroll(page)
    await d.getByRole('button', { name: 'Cancel' }).click()

    await page.goto('/ingredients/orders')
    const o = await openDialog(page, page.getByTestId('orders-new'), 'order-dialog')
    await expect(o.getByLabel('Packs', { exact: true })).toBeVisible()
    await expectNoSidewaysScroll(page)
  })
})
