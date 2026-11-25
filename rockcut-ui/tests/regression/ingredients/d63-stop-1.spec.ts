import { test, expect, type Browser, type Page } from '@playwright/test'
import { authFile, type PersonaKey } from '../../config/test-env'
import {
  apiAs,
  categoryId,
  categoriesList,
  cleanupIngredients,
  expectNoSidewaysScroll,
  makeD65Ingredient,
  makeD65Lot,
  makeD65Product,
  makeOrder,
  makeSupplier,
  openDialog,
  pick,
  setQuantityDisplay,
  tempTag,
} from './helpers'

// D63 Stop 1 (spec §5, §12 "Catalog"): Process Aids with g and mL, and the
// catalog's new and corrected rows. The seeded rows are read only; every row
// a test writes to is its own [TEST-TEMP] one.

test.use({ storageState: authFile('brewer2') })
test.beforeAll(() => setQuantityDisplay('brewer2', 'packs'))
test.afterAll(cleanupIngredients)

interface Listed {
  id: number
  display_name: string
  form: string | null
  unit: string
  ingredient: { id: number; name: string }
  ions?: Record<string, string>
  features: Record<string, { value: string | null; value_high: string | null }>
}

const products = async () => (await (await (await apiAs('brewer2')).get('/api/ingredient_products')).json()).data as Listed[]
const lots = async (id: number) =>
  (await (await (await apiAs('brewer2')).get('/api/ingredient_lots', { params: { product_id: id } })).json()).data as { lot_number: string; crop_year: number; notes: string | null; features: Record<string, { value: string }> }[]
async function product(name: string): Promise<Listed> {
  const found = (await products()).filter((p) => p.display_name === name)
  expect(found, name).toHaveLength(1)
  return found[0]
}

async function offer(productId: number, supplierId: number, pack: string, size: string, price: string): Promise<number> {
  const api = await apiAs('brewer2')
  const res = await api.post('/api/supplier_offers', { data: { product_id: productId, supplier_party_id: supplierId, pack_name: pack, pack_size: size } })
  expect(res.status(), await res.text()).toBe(201)
  const id = (await res.json()).data.id as number
  expect((await api.post(`/api/supplier_offers/${id}/prices`, { data: { price_per_pack: price, effective_on: '2020-01-01' } })).status()).toBe(201)
  return id
}

async function as(browser: Browser, persona: PersonaKey): Promise<Page> {
  return (await browser.newContext({ storageState: authFile(persona) })).newPage()
}

test.describe('Process Aids', () => {
  test('lists Whirlfloc T and the four new products with their packs; Finings is gone', async ({ page }) => {
    const all = await categoriesList()
    expect(all.filter((c) => c.name.toLowerCase() === 'finings')).toEqual([])
    await page.goto(`/ingredients?category=${await categoryId('Process Aids')}`)
    for (const name of ['Whirlfloc', 'Zinc Sulfate Heptahydrate', 'Amylo300', 'Clarity Ferm', 'Ultra-Ferm']) await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
    for (const [name, item, pack] of [
      ['BSG Zinc Sulfate Heptahydrate Powder', 'Powder · g · Process Aids', 'bag · 250 g'],
      ['Kerry Amylo300 Liquid', 'Liquid · g · Process Aids', 'bottle · 1,000 g'],
      ['White Labs Clarity Ferm Liquid', 'Liquid · mL · Process Aids', 'jug · 10,000 mL'],
      ['White Labs Ultra-Ferm Liquid', 'Liquid · mL · Process Aids', 'bottle · 1,000 mL'],
    ]) {
      await page.goto(`/ingredients/products/${(await product(name)).id}`)
      await expect(page.getByTestId('product-item')).toContainText(item)
      await expect(page.getByTestId('product-offers')).toContainText(pack)
    }
  })

  test('a g product made on the screens: its offer starts as a bag; mL offers take 10,000 and refuse 10,000.01', async ({ page }) => {
    const zinc = await makeD65Ingredient('Zinc', 'Process Aids')
    const supplier = await makeSupplier('D63 aids', null)
    await page.goto(`/ingredients?category=${await categoryId('Process Aids')}`)
    await page.getByTestId('ingredients-add-button').click()
    await page.getByTestId('add-d65-product').click()
    const d = page.getByTestId('product-dialog')
    await pick(page, d, 'Ingredient', zinc.name)
    await pick(page, d, 'Form', 'Powder')
    await d.getByRole('combobox', { name: /Unit/ }).click()
    expect(await page.getByRole('option').allTextContents()).toEqual(['fl oz', 'lb', 'each', 'g', 'mL'])
    await page.getByRole('option', { name: 'g', exact: true }).click()
    await d.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByTestId('product-item')).toContainText('Powder · g · Process Aids')

    const o = await openDialog(page, page.getByTestId('product-add-offer'), 'offer-dialog')
    await pick(page, o, 'Supplier', supplier.name)
    await expect(o.getByRole('combobox', { name: /Pack/ })).toHaveText('bag')
    await expect(o.getByText('Bag size (g)').first()).toBeVisible()
    await o.getByTestId('offer-pack-size').fill('250')
    await o.getByRole('button', { name: 'Save' }).click()
    await expect(o).toHaveCount(0)
    await expect(page.getByTestId('product-offers')).toContainText('bag · 250 g')

    const ml = await makeD65Product(zinc.id, 'Liquid', 'mL')
    await page.goto(`/ingredients/products/${ml.id}`)
    const m = await openDialog(page, page.getByTestId('product-add-offer'), 'offer-dialog')
    await pick(page, m, 'Supplier', supplier.name)
    await expect(m.getByRole('combobox', { name: /Pack/ })).toHaveText('bottle')
    await m.getByTestId('offer-pack-size').fill('10000.01')
    await m.getByRole('button', { name: 'Save' }).click()
    await expect(m).toContainText('must be more than 0 and at most 10,000')
    await m.getByTestId('offer-pack-size').fill('10000')
    await m.getByRole('button', { name: 'Save' }).click()
    await expect(m).toHaveCount(0)
    await expect(page.getByTestId('product-offers')).toContainText('bottle · 10,000 mL')
  })

  test('2 bags of zinc ordered and received are "2 bags" (500 g); counted 480 g; To order; Totals has g and mL apart', async ({ page, browser }) => {
    test.slow()
    const supplier = await makeSupplier('D63 zinc', null)
    const zinc = await makeD65Product((await makeD65Ingredient('Zinc', 'Process Aids')).id, 'Powder', 'g')
    const ferm = await makeD65Product((await makeD65Ingredient('Ferm', 'Process Aids')).id, 'Liquid', 'mL')
    const bag = await offer(zinc.id, supplier.id, 'bag', '250', '18.50')
    const jug = await offer(ferm.id, supplier.id, 'jug', '10000', '355.00')
    const order = await makeOrder(supplier.id, [{ offerId: bag, packs: 2 }, { offerId: jug, packs: 1 }])
    await page.goto(`/ingredients/orders/${order.id}`)
    await expect(page.getByTestId('order-totals')).toContainText('500 g · 10,000 mL')
    await expect(page.getByTestId('order-lines')).toContainText('bag · 250 g')

    const r = await openDialog(page, page.getByTestId('order-receive'), 'receive-dialog')
    for (const [i, number] of [[0, 'Z'], [1, 'F']] as const) {
      const l = r.getByTestId(`receive-line-${i}`)
      await pick(page, l, 'Goes to', 'New lot #')
      await l.getByLabel('Lot #').fill(tempTag(`D63 ${number}`))
    }
    const received = page.waitForResponse((x) => x.request().method() === 'POST' && x.url().endsWith(`/api/purchase_orders/${order.id}/receive`))
    await r.getByRole('button', { name: 'Receive' }).click()
    expect((await received).status()).toBe(200)
    await expect(r).toHaveCount(0)

    await page.goto(`/ingredients/products/${zinc.id}`)
    await expect(page.getByTestId('product-on-hand')).toContainText('2 bags')
    expect(Number((await product(zinc.display_name) as unknown as { on_hand: string }).on_hand)).toBe(500)
    await expect(page.getByTestId('product-lots')).toContainText('$0.074')

    const c = await openDialog(page, page.getByTestId('product-count'), 'count-dialog')
    await c.getByTestId('count-total-packs').fill('1')
    await c.getByTestId('count-total-lb').fill('230')
    await c.getByRole('button', { name: 'Save' }).click()
    await expect(c).toHaveCount(0)
    await expect(page.getByTestId('product-on-hand')).toContainText('1 bag 230 g')

    // Record movement says bags and g, never lb.
    const m = await openDialog(page, page.getByTestId('product-record-movement'), 'movement-dialog')
    await expect(m).not.toContainText(' lb')
    await m.getByRole('button', { name: 'Cancel' }).click()

    // A minimum of 3 bags: To order says so in g.
    const now = (await (await (await apiAs('brewer2')).get(`/api/ingredient_products/${zinc.id}`)).json()).data as { lock_version: number }
    expect((await (await apiAs('brewer2')).put(`/api/ingredient_products/${zinc.id}`, { data: { min_on_hand_packs: 3, lock_version: now.lock_version } })).status()).toBe(200)
    await page.goto('/ingredients/to-order')
    await expect(page.getByTestId(`to-order-${zinc.id}-on-hand`)).toHaveText('1.92 bags')
    await expect(page.getByTestId(`to-order-${zinc.id}`)).toContainText('bag · 250 g')

    const owner = await as(browser, 'owner')
    await owner.goto('/ingredients/totals')
    await owner.getByTestId('totals-inventory-supplier').click()
    await owner.getByRole('option', { name: supplier.name }).click()
    await expect(owner.getByTestId('totals-inventory-total-g')).toHaveText('480 g')
    await expect(owner.getByTestId('totals-inventory-total-mL')).toHaveText('10,000 mL')
    // 480 g at $0.074 and 10,000 mL at $0.0355.
    await expect(owner.getByTestId('totals-inventory-total')).toContainText('$390.52')
    await owner.getByTestId('totals-tab-orders').click()
    await owner.getByTestId('totals-orders-supplier').click()
    await owner.getByRole('option', { name: supplier.name }).click()
    await expect(owner.getByTestId('totals-orders-total-quantity')).toHaveText('500 g10,000 mL')
    await owner.context().close()
  })
})

test.describe('seeded rows (read only)', () => {
  test('the spices: Ground for cinnamon, allspice and clove, Whole for the rest; oz, None', async () => {
    const all = await products()
    for (const [name, form] of [
      ['Juniper Berries', 'Whole'],
      ['Timut Pepper', 'Whole'],
      ['Lemongrass', 'Whole'],
      ['Chamomile', 'Whole'],
      ['Cinnamon', 'Ground'],
      ['Allspice', 'Ground'],
      ['Clove', 'Ground'],
    ]) {
      const p = all.find((x) => x.display_name === `${name} ${form} · None`)
      expect(p?.unit, name).toBe('oz')
    }
  })

  test('EKG has its lot: crop 2025, 5.9 %, the placeholder note', async ({ page }) => {
    const ekg = await product('Lupulin Exchange EKG T90 Pellet')
    const lot = (await lots(ekg.id)).find((l) => l.lot_number === 'EKG-2025')!
    expect(lot.crop_year).toBe(2025)
    expect(Number(lot.features.alpha_acid_pct.value)).toBe(5.9)
    expect(lot.notes).toContain('Placeholder: check the lot number, alpha and weight')
    await page.goto(`/ingredients/products/${ekg.id}`)
    await expect(page.getByTestId('product-lots')).toContainText('EKG-2025')
    await expect(page.getByTestId('product-offers')).toContainText('box · 11 lb')
    await expect(page.getByTestId('product-movements')).toContainText('Placeholder: check the lot number, alpha and weight')
  })

  test("calcium chloride's product is Anhydrous's, with its offer and ions; Hydrous has none", async ({ page }) => {
    const cacl = await product('Calcium Chloride (Anhydrous) Flake · None')
    expect((await products()).filter((p) => p.ingredient.name === 'Calcium Chloride (Hydrous)')).toEqual([])
    await page.goto(`/ingredients/products/${cacl.id}`)
    await expect(page.getByTestId('product-ions')).toContainText('95.4')
    await expect(page.getByTestId('product-ions')).toContainText('168.8')
    await expect(page.getByTestId('product-offers')).toContainText('bag · 50 lb')
  })

  test("Pink Boots '23 and '24 have a lot each; no Pink Boots Blend", async ({ page }) => {
    for (const [year, number] of [["'23", 'P92-IUPBB3182'], ["'24", 'P92-JUPBB4199']]) {
      const p = await product(`Yakima Chief Hops Pink Boots ${year} T90 Pellet`)
      expect((await lots(p.id)).map((l) => l.lot_number)).toContain(number)
      await page.goto(`/ingredients/products/${p.id}`)
      await expect(page.getByTestId('product-lots')).toContainText(number)
      await expect(page.getByTestId('product-offers')).toContainText('box · 11 lb')
    }
    expect((await products()).filter((p) => p.ingredient.name === 'Pink Boots Blend')).toEqual([])
  })
})

test.describe('at 360 px', () => {
  test.use({ viewport: { width: 360, height: 780 } })

  test('Process Aids, a jug of 10,000 mL and its product page have no sideways scroll', async ({ page }) => {
    const supplier = await makeSupplier('D63 phone', null)
    const ferm = await makeD65Product((await makeD65Ingredient('Ferm phone', 'Process Aids')).id, 'Liquid', 'mL')
    await offer(ferm.id, supplier.id, 'jug', '10000', '355.00')
    await makeD65Lot(ferm, '12500.5')
    await page.goto(`/ingredients?category=${await categoryId('Process Aids')}`)
    await expect(page.getByTestId(`product-card-${ferm.id}`)).toContainText('Liquid · mL · None')
    await expectNoSidewaysScroll(page)
    await page.goto(`/ingredients/products/${ferm.id}`)
    await expect(page.getByTestId('product-on-hand')).toContainText('mL')
    await expectNoSidewaysScroll(page)
  })
})
