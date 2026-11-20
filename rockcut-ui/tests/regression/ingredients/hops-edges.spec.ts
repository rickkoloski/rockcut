import { test, expect, type Browser, type Page } from '@playwright/test'
import { authFile, type PersonaKey } from '../../config/test-env'
import {
  BOX,
  apiAs,
  cleanupIngredients,
  expectOnHand,
  getOrder,
  lotsOf,
  makeHopLot,
  makeHopProduct,
  makeOrder,
  makeSupplier,
  movementsOf,
  openDialog,
  pick,
  reference,
  setQuantityDisplay,
  tempTag,
} from './helpers'

// D62 Stage 4 (spec §9 Stage 1, Hops, and People, devices, edges), what
// `hops.spec.ts` and the D60/D61 specs don't cover: the reference hops on
// screen (read only); Rahr's Manufacturer chip with "Maltster" kept on grain
// screens; no custom fields on Hops; two people on one order with hop lines
// and on one contract with a hop line (409); a double-click on Save in hop
// Add lot and on Receive with a new hop lot, on a slow network (one write);
// floater and splitRole on the hop pages; bartender1 and breweryDevice
// refused on every hop route. Every row a test makes is `[TEST-TEMP]`; the
// seeded hops are only read.

test.afterAll(cleanupIngredients)

const year = Number(new Date().getFullYear())
const re = (s: string) => new RegExp(s.replace(/[[\]().*+?^$|{}\\]/g, '\\$&'))

async function as(browser: Browser, who: PersonaKey): Promise<Page> {
  const context = await browser.newContext({ storageState: authFile(who) })
  return context.newPage()
}

/** Chrome's network throttling (CDP): every request waits about 1.5 s. */
async function slow(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 1500, downloadThroughput: 50 * 1024, uploadThroughput: 50 * 1024 })
  return async () => cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
}

function countPosts(page: Page, path: string) {
  const posts: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith(path)) posts.push(r.url())
  })
  return posts
}

/** The Ingredient Library on Hops. */
async function hopsList(page: Page) {
  await page.goto('/ingredients')
  await pick(page, page.locator('body'), 'Category', /^Hops$/)
  await expect(page.getByTestId('hops-table')).toBeVisible()
}

interface SeededProduct {
  id: number
  display_name: string
  on_hand: string
  category_key: string | null
}

/** A seeded reference hop product by display name (read only). */
async function seeded(name: string): Promise<SeededProduct> {
  const list = (await (await (await apiAs('brewer1')).get('/api/ingredient_products')).json()).data as SeededProduct[]
  const p = list.find((x) => x.display_name === name)
  expect(p, name).toBeTruthy()
  return p!
}

/** A hop order from the product's company: `packs` boxes on its offer. */
async function hopOrder(label: string, packs: number) {
  const product = await makeHopProduct(label)
  const offer = product.offers[0]
  const api = await apiAs('brewer1')
  expect((await api.put(`/api/parties/${product.company.id}`, { data: { order_target_packs: 40 } })).status()).toBe(200)
  await api.post(`/api/supplier_offers/${offer.id}/prices`, { data: { price_per_pack: '165.00', effective_on: '2020-01-01' } })
  const order = await makeOrder(product.company.id, [{ offerId: offer.id, packs }])
  return { product, offer, order }
}

test.describe('owner', () => {
  test.use({ storageState: authFile('owner') })

  test('E1: the reference hops on the Hops list (Galaxy 71 lb, 17.6 %); Rahr is a Manufacturer, grain screens still say Maltster; Hops takes no custom fields', async ({ page }) => {
    await setQuantityDisplay('owner', 'lb')
    const galaxy = await seeded('Lupulin Exchange Galaxy T90 Pellet')
    expect([galaxy.category_key, Number(galaxy.on_hand)]).toEqual(['hops', 71])
    const lots = (await (await (await apiAs('owner')).get(`/api/ingredient_lots?product_id=${galaxy.id}`)).json()).data as { lot_number: string; crop_year: number; features: Record<string, { value: string }> }[]
    expect(lots.map((l) => [l.lot_number, l.crop_year, Number(l.features.alpha_acid_pct.value)])).toContainEqual(['MB030', 2025, 17.6])

    await hopsList(page)
    const table = page.getByTestId('hops-table')
    await expect(table.locator('thead')).toContainText('Manufacturer')
    await expect(page.getByTestId(`hop-row-${galaxy.id}`)).toContainText('Lupulin Exchange')
    await expect(page.getByTestId(`hop-row-${galaxy.id}`)).toContainText('Australia')
    await expect(page.getByTestId(`hop-on-hand-${galaxy.id}`)).toHaveText('71 lb')

    // Stage 1: grain screens say Maltster; the company is a Manufacturer.
    await pick(page, page.locator('body'), 'Category', /^Grains$/)
    await expect(page.getByTestId('grains-table').locator('thead')).toContainText('Maltster')
    const { rahr } = await reference()
    await page.goto('/ingredients/companies')
    await expect(page.getByTestId(`party-${rahr}-role-manufacturer`)).toHaveText('Manufacturer')

    // Settings → Categories → Hops: features, no custom fields; the API refuses one (split Amendment).
    const categories = (await (await (await apiAs('owner')).get('/api/ingredient_categories')).json()).data as { id: number; key: string | null }[]
    const hops = categories.find((c) => c.key === 'hops')!
    await page.goto(`/ingredients/categories/${hops.id}`)
    await expect(page.getByRole('heading', { name: 'Field Definitions' })).toBeVisible()
    await expect(page.getByTestId('category-add-field')).toHaveCount(0)
    const res = await (await apiAs('owner')).post('/api/category_field_definitions', { data: { category_id: hops.id, field_name: tempTag('E1'), field_type: 'text' } })
    if (res.status() === 201) await (await apiAs('owner')).delete(`/api/category_field_definitions/${(await res.json()).data.id}`)
    expect(res.status()).toBe(422)
    expect((await res.json()).errors).toEqual({ category_id: ['Hops use features, not custom fields'] })
  })
})

test('E2: two people edit one order with hop lines: the second save is refused (409) and keeps its input', async ({ browser }) => {
  const { order } = await hopOrder('E2', 4)
  const a = await as(browser, 'brewer1')
  const b = await as(browser, 'brewer2')
  for (const p of [a, b]) await p.goto(`/ingredients/orders/${order.id}`)
  const da = await openDialog(a, a.getByTestId('order-edit'), 'order-dialog')
  const db = await openDialog(b, b.getByTestId('order-edit'), 'order-dialog')

  await da.getByTestId('order-line-0-packs').fill('6')
  await da.getByRole('button', { name: 'Save' }).click()
  await expect(da).toHaveCount(0)

  await db.getByTestId('order-reference').fill('PO-HOP-STALE')
  const refused = b.waitForResponse((r) => r.request().method() === 'PUT' && r.url().endsWith(`/api/purchase_orders/${order.id}`))
  await db.getByRole('button', { name: 'Save' }).click()
  expect((await refused).status()).toBe(409)
  await expect(db).toContainText('Someone else changed this order since you opened it. Close and reopen it to see their change.')
  await expect(db.getByTestId('order-reference')).toHaveValue('PO-HOP-STALE')

  const now = await getOrder(order.id)
  expect([now.lines[0].packs_ordered, now.reference]).toEqual([6, null])
  await db.getByRole('button', { name: 'Cancel' }).click()
  await expect(db).toHaveCount(0)
  const again = await openDialog(b, b.getByTestId('order-edit'), 'order-dialog')
  await expect(again.getByTestId('order-line-0-packs')).toHaveValue('6')
  await expect(again.getByTestId('order-target-progress')).toHaveText('6 of 40 boxes')
})

// A [TEST-TEMP] supplier's contract for this year, so a receipt (never after
// today) counts toward it; no real supplier gets a current-year contract.
test('E3: two people edit one contract with a hop line: the second save is refused (409); 10 boxes received; a brewer can\'t edit it', async ({ browser }) => {
  const supplier = await makeSupplier('E3 supplier')
  const product = await makeHopProduct('E3')
  const brewer = await apiAs('brewer1')
  const offer = (await (await brewer.post('/api/supplier_offers', { data: { product_id: product.id, supplier_party_id: supplier.id } })).json()).data as { id: number }
  const made = await (await apiAs('breweryMgr')).post('/api/contracts', {
    data: { supplier_party_id: supplier.id, year, lines: [{ product_id: product.id, offer_id: offer.id, quantity: '440', price: '14.50' }] },
  })
  expect(made.status(), await made.text()).toBe(201)
  const id = (await made.json()).data.id as number

  const a = await as(browser, 'owner')
  const b = await as(browser, 'breweryMgr')
  for (const p of [a, b]) await p.goto(`/ingredients/contracts?year=${year}`)
  const da = await openDialog(a, a.getByTestId(`contract-${id}-edit`), 'contract-dialog')
  const db = await openDialog(b, b.getByTestId(`contract-${id}-edit`), 'contract-dialog')

  await da.getByTestId('contract-line-0-quantity').fill('330')
  await da.getByRole('button', { name: 'Save' }).click()
  await expect(da).toHaveCount(0)

  await db.getByRole('textbox', { name: 'Notes' }).fill('stale notes')
  const refused = b.waitForResponse((r) => r.request().method() === 'PUT' && r.url().endsWith(`/api/contracts/${id}`))
  await db.getByRole('button', { name: 'Save' }).click()
  expect((await refused).status()).toBe(409)
  await expect(db).toContainText('Someone else changed this contract since you opened it. Close and reopen it to see their change.')
  await expect(db.getByRole('textbox', { name: 'Notes' })).toHaveValue('stale notes')
  const now = (await (await (await apiAs('breweryMgr')).get(`/api/contracts/${id}`)).json()).data
  expect([Number(now.lines[0].quantity), now.notes]).toEqual([330, null])
  await db.getByRole('button', { name: 'Cancel' }).click()
  await expect(db).toHaveCount(0)
  await expect(b.getByTestId(`contract-line-${product.id}-remaining`)).toHaveText('330 lb')

  // 10 boxes received: 110 lb received, 220 lb remaining. brewer1 reads it and can't edit it.
  const order = await makeOrder(supplier.id, [{ offerId: offer.id, packs: 10 }])
  const lines = order.lines.map((l) => ({ id: l.id, packs_received: 10, allocations: [{ lot_number: tempTag(`E3 ${order.id}`), packs: 10, crop_year: 2025, features: { alpha_acid_pct: '12.5' } }] }))
  expect((await brewer.post(`/api/purchase_orders/${order.id}/receive`, { data: { lines } })).status()).toBe(200)
  const c = await as(browser, 'brewer1')
  await c.goto(`/ingredients/contracts?year=${year}`)
  const card = c.getByTestId(`contract-${id}`)
  await expect(card.getByTestId(`contract-line-${product.id}-received`)).toHaveText('110 lb')
  await expect(card.getByTestId(`contract-line-${product.id}-remaining`)).toHaveText('220 lb')
  await expect(c.getByTestId(`contract-${id}-edit`)).toHaveCount(0)
  expect((await brewer.put(`/api/contracts/${id}`, { data: { notes: 'brewer' } })).status()).toBe(403)
})

test.describe('brewer1 on a slow network', () => {
  test.use({ storageState: authFile('brewer1') })
  test.beforeEach(async () => setQuantityDisplay('brewer1', 'packs'))

  test('E4: a double-click on Save in hop Add lot writes one lot', async ({ page }) => {
    const product = await makeHopProduct('E4')
    await page.goto(`/ingredients/products/${product.id}`)
    const posts = countPosts(page, '/api/ingredient_lots')
    const d = await openDialog(page, page.getByTestId('product-add-lot'), 'add-lot-dialog')
    await d.getByTestId('lot-number').fill(tempTag('E4'))
    await d.getByTestId('lot-quantity-packs').fill('2')
    await d.getByTestId('lot-crop-year').fill('2025')
    await d.getByTestId('feature-alpha_acid_pct').fill('12.4')
    const fast = await slow(page)
    const save = d.getByRole('button', { name: 'Save' })
    await save.dblclick()
    await expect(save).toBeDisabled()
    await expect(d).toHaveCount(0, { timeout: 20_000 })
    await fast()
    expect(posts).toHaveLength(1)
    expect(await lotsOf(product.id)).toHaveLength(1)
    await expectOnHand(product.id, 2 * BOX)
  })

  test('E5: a double-click on Receive with a new hop lot receives once', async ({ page }) => {
    const { product, order } = await hopOrder('E5', 3)
    await page.goto(`/ingredients/orders/${order.id}`)
    const posts = countPosts(page, `/api/purchase_orders/${order.id}/receive`)
    const d = await openDialog(page, page.getByTestId('order-receive'), 'receive-dialog')
    const line = d.getByTestId('receive-line-0')
    // No earlier lot: the line starts on a new lot #, which needs its crop year and alpha.
    await line.getByTestId('receive-line-0-row-0-number').fill(tempTag('E5'))
    await line.getByTestId('receive-line-0-row-0-crop-year').fill('2025')
    await line.getByTestId('feature-alpha_acid_pct').fill('12.4')
    const fast = await slow(page)
    const save = d.getByRole('button', { name: 'Receive' })
    await save.dblclick()
    await expect(save).toBeDisabled()
    await expect(d).toHaveCount(0, { timeout: 20_000 })
    await fast()
    expect(posts).toHaveLength(1)
    expect((await getOrder(order.id)).status).toBe('received')
    expect((await movementsOf(product.id)).filter((m) => m.kind === 'received')).toHaveLength(1)
    await expectOnHand(product.id, 3 * BOX)
  })
})

for (const persona of ['floater', 'splitRole'] as PersonaKey[]) {
  test.describe(`${persona} (Brewery employee with a Taproom role)`, () => {
    test.use({ storageState: authFile(persona) })

    test(`E6: ${persona} gets the Hops list and a hop product page with its lots`, async ({ page }) => {
      const product = await makeHopProduct(`E6 ${persona}`)
      await makeHopLot(product, '22', 2, '12.4')
      await hopsList(page)
      await expect(page.getByTestId(`hop-row-${product.id}`)).toBeVisible()
      await page.getByTestId(`hop-row-${product.id}`).click()
      await expect(page).toHaveURL(new RegExp(`/ingredients/products/${product.id}$`))
      await expect(page.getByRole('heading', { name: re(product.display_name) })).toBeVisible()
      await expect(page.getByTestId('product-lots')).toContainText('12.40')
    })
  })
}

test.describe('bartender1 (Taproom employee)', () => {
  test.use({ storageState: authFile('bartender1') })

  test('E7: a hop product page goes Home; every hop read is 403', async ({ page }) => {
    const galaxy = await seeded('Lupulin Exchange Galaxy T90 Pellet')
    await page.goto(`/ingredients/products/${galaxy.id}`)
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByTestId('product-on-hand')).toHaveCount(0)
    const lots = (await (await (await apiAs('brewer1')).get(`/api/ingredient_lots?product_id=${galaxy.id}`)).json()).data as { id: number }[]
    const api = await apiAs('bartender1')
    for (const path of [`/api/ingredient_products/${galaxy.id}`, `/api/ingredient_lots?product_id=${galaxy.id}`, `/api/ingredient_lots/${lots[0].id}`, `/api/inventory_movements?product_id=${galaxy.id}`]) {
      expect((await api.get(path)).status(), path).toBe(403)
    }
  })
})

test('E8: breweryDevice and bartender1 get 403 on every hop route, reads and writes', async () => {
  // Reads name a seeded hop (Galaxy); writes name a [TEST-TEMP] one, so a
  // gate that let one through could never change the real cooler data.
  const galaxy = await seeded('Lupulin Exchange Galaxy T90 Pellet')
  const brewer = await apiAs('brewer1')
  const seededLots = (await (await brewer.get(`/api/ingredient_lots?product_id=${galaxy.id}`)).json()).data as { id: number }[]
  const seededOffer = ((await (await brewer.get(`/api/ingredient_products/${galaxy.id}`)).json()).data as { offers: { id: number }[] }).offers[0].id
  const temp = await makeHopProduct('E8')
  const tempLot = await makeHopLot(temp, '22', 1)
  const tempOffer = temp.offers[0].id
  const hopProduct = { ingredient_id: temp.ingredient_id, manufacturer_party_id: temp.company.id, form: 'Cryo' }
  const hopLot = { product_id: temp.id, lot_number: tempTag('E8 lot'), crop_year: 2025, initial_kind: 'opening', initial_quantity: '11', features: { alpha_acid_pct: '12' } }
  const calls: [string, string, unknown?][] = [
    ['GET', `/api/ingredient_products/${galaxy.id}`],
    ['GET', `/api/supplier_offers/${seededOffer}`],
    ['GET', `/api/supplier_offers/${seededOffer}/prices`],
    ['GET', `/api/ingredient_lots?product_id=${galaxy.id}`],
    ['GET', `/api/ingredient_lots/${seededLots[0].id}`],
    ['GET', `/api/inventory_movements?product_id=${galaxy.id}`],
    ['GET', '/api/ingredient_totals/inventory'],
    ['POST', '/api/ingredient_products', hopProduct],
    ['PUT', `/api/ingredient_products/${temp.id}`, { origin: 'Nowhere' }],
    ['POST', `/api/ingredient_products/${temp.id}/count`, { quantity: '0' }],
    ['PUT', `/api/supplier_offers/${tempOffer}`, { order_name: 'x' }],
    ['POST', `/api/supplier_offers/${tempOffer}/prices`, { price_per_pack: '1', effective_on: '2020-01-01' }],
    ['POST', '/api/ingredient_lots', hopLot],
    ['PUT', `/api/ingredient_lots/${tempLot.id}`, { crop_year: 2020 }],
    ['POST', '/api/inventory_movements', { product_id: temp.id, kind: 'used', quantity: '-1', allocation: 'oldest_first' }],
  ]
  for (const who of ['breweryDevice', 'bartender1'] as PersonaKey[]) {
    const api = await apiAs(who)
    for (const [method, path, data] of calls) {
      const res = await api.fetch(path, { method, data })
      expect(res.status(), `${who} ${method} ${path}`).toBe(403)
    }
  }
  const after = (await (await brewer.get(`/api/ingredient_products/${temp.id}`)).json()).data as { on_hand: string; origin: string }
  expect([Number(after.on_hand), after.origin]).toEqual([22, 'USA'])
  expect(await lotsOf(temp.id)).toHaveLength(1)
})
