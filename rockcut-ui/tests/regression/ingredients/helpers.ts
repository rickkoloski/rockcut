import { expect, type APIResponse, type Locator, type Page, type Request } from '@playwright/test'
import type { PersonaKey } from '../../config/test-env'
import { addDays, apiAs, denverToday, tempTag } from '../scheduler/helpers'

// D60: grain catalog and inventory specs. Everything a spec makes is
// `[TEST-TEMP]` (a product's name, a company's name, a lot's number) and is
// removed by id in `afterAll` (`cleanupIngredients`). The API refuses to
// delete a lot with more than its first movement, and so the product it
// belongs to: those products are made inactive, and the next
// `mix rockcut.synthetic.setup` deletes them with their lots and movements.
// The reference products (Rahr 2-Row and the rest) and the `[SEED]` lots are
// never written to: a spec that moves stock makes its own product.

export { addDays, apiAs, denverToday, tempTag }

export const SACK = 55

export interface FeatureValue {
  value: string
  entered_value: string | null
  entered_unit: string | null
}

export interface ApiProduct {
  id: number
  display_name: string
  on_hand: string
  expired: string
  features: Record<string, FeatureValue>
  offers: { id: number; supplier_party_id: number; current_price: { price_per_pack: string } | null }[]
}

export interface ApiLot {
  id: number
  lot_number: string | null
  status: 'available' | 'depleted' | 'expired'
  on_hand: string
  features: Record<string, FeatureValue>
}

export interface ApiMovement {
  id: number
  lot_id: number
  kind: string
  quantity: string
}

const made = { products: new Set<number>(), parties: new Set<number>(), ingredients: new Set<number>() }

async function ok<T>(res: APIResponse, status = 200): Promise<T> {
  expect(res.status(), await res.text()).toBe(status)
  return (await res.json()).data as T
}

/** The reference rows the specs build on, by name (read only). */
export async function reference() {
  const api = await apiAs('brewer1')
  const parties = await ok<{ id: number; name: string }[]>(await api.get('/api/parties'))
  const grains = await ok<{ id: number; name: string }[]>(await api.get('/api/ingredients'))
  const party = (name: string) => {
    const p = parties.find((x) => x.name === name)
    expect(p, `company ${name}`).toBeTruthy()
    return p!.id
  }
  const twoRow = grains.find((g) => g.name === '2-Row')
  expect(twoRow, 'grain 2-Row').toBeTruthy()
  return { twoRow: twoRow!.id, rahr: party('Rahr'), bsg: party('BSG'), mountain: party('[SEED] Mountain Brewing') }
}

/** Remember a product the UI made, for cleanup. */
export const adoptProduct = (id: number) => made.products.add(id)
export const adoptParty = (id: number) => made.parties.add(id)

/**
 * A `[TEST-TEMP]` Rahr product under 2-Row (standard color 2 °L, extract
 * 81.5, moisture 4.5) with a BSG offer of 55 lb sacks.
 */
export async function makeProduct(label: string, as: PersonaKey = 'brewer1'): Promise<ApiProduct> {
  const ref = await reference()
  const api = await apiAs(as)
  const product = await ok<ApiProduct>(
    await api.post('/api/ingredient_products', {
      data: {
        ingredient_id: ref.twoRow,
        manufacturer_party_id: ref.rahr,
        name: tempTag(label),
        features: { color_lovibond: { value: '2' }, extract_fgdb: { value: '81.5' }, moisture_pct: { value: '4.5' } },
      },
    }),
    201,
  )
  made.products.add(product.id)
  await ok(await api.post('/api/supplier_offers', { data: { product_id: product.id, supplier_party_id: ref.bsg, pack_size: '55', form: 'milled' } }), 201)
  return getProduct(product.id)
}

/** A lot of `product` with an opening amount of `packs` 55 lb sacks, received `daysAgo` days ago. */
export async function makeLot(product: ApiProduct, packs: number, daysAgo: number, number = tempTag('lot')): Promise<ApiLot> {
  const ref = await reference()
  const res = await (await apiAs('brewer1')).post('/api/ingredient_lots', {
    data: {
      product_id: product.id,
      supplier_party_id: ref.bsg,
      pack_size: '55',
      lot_number: number,
      received_date: addDays(denverToday(), -daysAgo),
      initial_kind: 'opening',
      initial_quantity: String(packs * SACK),
    },
  })
  return ok<ApiLot>(res, 201)
}

export async function getProduct(id: number): Promise<ApiProduct> {
  return ok<ApiProduct>(await (await apiAs('brewer1')).get(`/api/ingredient_products/${id}`))
}

/** A product's lots, oldest first. */
export async function lotsOf(productId: number): Promise<ApiLot[]> {
  const lots = await ok<(ApiLot & { received_date: string })[]>(await (await apiAs('brewer1')).get(`/api/ingredient_lots?product_id=${productId}`))
  return lots.sort((a, b) => a.received_date.localeCompare(b.received_date) || a.id - b.id)
}

export async function movementsOf(productId: number): Promise<ApiMovement[]> {
  return ok<ApiMovement[]>(await (await apiAs('brewer1')).get(`/api/inventory_movements?product_id=${productId}`))
}

/** Polls the API's on-hand for a product (lb, as a number). */
export async function expectOnHand(productId: number, lb: number) {
  await expect.poll(async () => Number((await getProduct(productId)).on_hand), { message: `product ${productId} on_hand` }).toBe(lb)
}

export async function expectLotOnHand(lotId: number, productId: number, lb: number) {
  await expect
    .poll(async () => Number((await lotsOf(productId)).find((l) => l.id === lotId)?.on_hand), { message: `lot ${lotId} on_hand` })
    .toBe(lb)
}

/** A persona's packs/total toggle (`board_settings.ingredients`). */
export async function setQuantityDisplay(persona: PersonaKey, mode: 'packs' | 'lb') {
  const res = await (await apiAs(persona)).put('/api/me/board_settings/ingredients', { data: { quantity_display: mode } })
  expect(res.status(), await res.text()).toBe(200)
}

export async function quantityDisplayOf(persona: PersonaKey): Promise<string | undefined> {
  const me = await (await (await apiAs(persona)).get('/api/me')).json()
  return me.board_settings?.ingredients?.quantity_display
}

/**
 * Remove, by id, what the specs made: each product's lots (a lot with only
 * its first movement), offers and the product; a product the API won't
 * delete (lots with movements) is made inactive for `setup` to delete. Then
 * the companies (an in-use one stays for `setup`).
 */
export async function cleanupIngredients() {
  const api = await apiAs('owner')
  for (const id of made.products) {
    const res = await api.get(`/api/ingredient_products/${id}`)
    if (res.status() === 404) continue
    const product = (await res.json()).data as ApiProduct & { name: string | null }
    if (!product.name?.startsWith('[TEST-TEMP]')) continue
    for (const lot of await lotsOf(id)) await api.delete(`/api/ingredient_lots/${lot.id}`)
    if ((await lotsOf(id)).length === 0) {
      for (const o of product.offers) await api.delete(`/api/supplier_offers/${o.id}`)
    }
    const del = await api.delete(`/api/ingredient_products/${id}`)
    if (del.status() !== 204) await api.put(`/api/ingredient_products/${id}`, { data: { active: false } })
  }
  made.products.clear()
  // D62: `[TEST-TEMP]` hop varieties, once their products are gone (else `setup` takes them).
  // Best effort, as the rest of this clean-up: anything left goes with the next `setup`.
  for (const id of made.ingredients) await api.delete(`/api/ingredients/${id}`).catch(() => null)
  made.ingredients.clear()
  for (const id of made.parties) {
    const res = await api.get(`/api/parties/${id}`)
    if (res.status() === 404) continue
    if (!((await res.json()).data.name as string).startsWith('[TEST-TEMP]')) continue
    await api.delete(`/api/parties/${id}`)
  }
  made.parties.clear()
}

// ── D61 purchasing ──
//
// Orders can't be deleted (only cancelled), so a [TEST-TEMP] supplier with
// orders, and the offers and products on them, stay until the next
// `mix rockcut.synthetic.setup`, which removes them with their orders and
// contracts. Specs only order from their own [TEST-TEMP] supplier.

export interface ApiOrder {
  id: number
  status: 'open' | 'received' | 'cancelled'
  received_on: string | null
  lines: { id: number; offer_id: number; packs_ordered: number; packs_received: number | null; price_per_pack: string }[]
  total_packs: number
  total_dollars: string
}

/** A `[TEST-TEMP]` supplier, with an order target when given. */
export async function makeSupplier(label: string, target: number | null = 40): Promise<{ id: number; name: string }> {
  const party = await ok<{ id: number; name: string }>(
    await (await apiAs('owner')).post('/api/parties', { data: { name: tempTag(label), roles: ['supplier'], order_target_packs: target } }),
    201,
  )
  made.parties.add(party.id)
  return party
}

/** An offer of `product` by `supplierId` in 55 lb sacks at `price` a sack from long ago. */
export async function makeOffer(product: ApiProduct, supplierId: number, price = '42.00', orderName: string | null = null, size = '55'): Promise<{ id: number }> {
  const api = await apiAs('brewer1')
  const offer = await ok<{ id: number }>(
    await api.post('/api/supplier_offers', { data: { product_id: product.id, supplier_party_id: supplierId, pack_size: size, form: 'whole', order_name: orderName } }),
    201,
  )
  await ok(await api.post(`/api/supplier_offers/${offer.id}/prices`, { data: { price_per_pack: price, effective_on: '2020-01-01' } }), 201)
  return offer
}

/** A temp product with a temp supplier (target 40) and its $42.00 offer: what an order needs. */
export async function makePurchasing(label: string) {
  const product = await makeProduct(label)
  const supplier = await makeSupplier(`${label} supplier`)
  const offer = await makeOffer(product, supplier.id)
  return { product, supplier, offer }
}

/** An open order (placed by `brewer1`) of `packs` of each offer. */
export async function makeOrder(supplierId: number, lines: { offerId: number; packs: number }[], extra: Record<string, unknown> = {}): Promise<ApiOrder> {
  return ok<ApiOrder>(
    await (await apiAs('brewer1')).post('/api/purchase_orders', {
      data: { supplier_party_id: supplierId, ordered_on: denverToday(), lines: lines.map((l) => ({ offer_id: l.offerId, packs_ordered: l.packs })), ...extra },
    }),
    201,
  )
}

/** Receive an order in full (into the previous lot, else a new `[TEST-TEMP]` lot) on `on`. */
export async function receiveOrder(order: ApiOrder, on = denverToday(), lotNumber: string | null = null): Promise<ApiOrder> {
  const lines = order.lines.map((l) => ({ id: l.id, packs_received: l.packs_ordered, ...(lotNumber ? { allocations: [{ lot_number: lotNumber, packs: l.packs_ordered }] } : {}) }))
  return ok<ApiOrder>(await (await apiAs('brewer1')).post(`/api/purchase_orders/${order.id}/receive`, { data: { received_on: on, lines } }))
}

/** A lot of `product` from `supplierId` (55 lb sacks) with an opening amount, received `daysAgo`. */
export async function makeSupplierLot(product: ApiProduct, supplierId: number, packs: number, daysAgo: number): Promise<ApiLot> {
  return ok<ApiLot>(
    await (await apiAs('brewer1')).post('/api/ingredient_lots', {
      data: {
        product_id: product.id,
        supplier_party_id: supplierId,
        pack_size: '55',
        lot_number: tempTag('lot'),
        received_date: addDays(denverToday(), -daysAgo),
        initial_kind: 'opening',
        initial_quantity: String(packs * SACK),
      },
    }),
    201,
  )
}

export async function getOrder(id: number): Promise<ApiOrder> {
  return ok<ApiOrder>(await (await apiAs('brewer1')).get(`/api/purchase_orders/${id}`))
}

/**
 * A phone dialog closed and its back-button history entry released: closing
 * takes the entry off with `history.back()` a tick later (`useBackCloses`),
 * which aborts a `page.goto` sent in between (lead decisions 1, item 19).
 */
export async function expectPhoneDialogClosed(page: Page, dialog: Locator) {
  await expect(dialog).toHaveCount(0)
  await page.waitForFunction(() => window.history.state?.rockcutBackCloses == null)
}

/**
 * Click `trigger` and return the dialog `testId` once it has settled: its
 * enter transition finished and the API reads it started answered (lead
 * decisions 1, item 22). Until a dialog's lists are in, its required selects
 * are empty, and the browser's form check drops a Save clicked then without
 * a word (PO7 on the release build at DEV's latency).
 */
export async function openDialog(page: Page, trigger: Locator, testId: string): Promise<Locator> {
  const reads = new Set<Request>()
  const started = (r: Request) => {
    if (r.method() === 'GET' && new URL(r.url()).pathname.startsWith('/api/')) reads.add(r)
  }
  const ended = (r: Request) => reads.delete(r)
  page.on('request', started)
  page.on('requestfinished', ended)
  page.on('requestfailed', ended)
  const d = page.getByTestId(testId)
  try {
    await trigger.click()
    await expect(d).toBeVisible()
    await expect.poll(() => reads.size, { message: `${testId}: its API reads answered` }).toBe(0)
    // The enter transition (spinners never finish, so they're left out).
    await d.evaluate((el) =>
      Promise.allSettled(
        el
          .getAnimations({ subtree: true })
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished),
      ),
    )
  } finally {
    page.off('request', started)
    page.off('requestfinished', ended)
    page.off('requestfailed', ended)
  }
  // The render with the answers, painted.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null)))))
  return d
}

/** No sideways scroll on the page. */
export async function expectNoSidewaysScroll(page: Page) {
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  expect(scroll, 'page scrollWidth vs clientWidth').toBeLessThanOrEqual(client)
}

/** Pick `option` from the MUI select labelled `label` inside `scope`. */
export async function pick(page: Page, scope: Locator, label: string | RegExp, option: string | RegExp) {
  await scope.getByRole('combobox', { name: label }).click()
  await page.getByRole('option', { name: option }).click()
}

// ── D62 hops ──
//
// A spec's hops are a `[TEST-TEMP]` variety from a `[TEST-TEMP]` company
// (manufacturer and supplier), never the seeded reference hops.

export const BOX = 11

/** A `[TEST-TEMP]` hop variety (in Hops) and a company that makes and sells it. */
export async function makeHopVariety(label: string): Promise<{ hop: { id: number; name: string }; company: { id: number; name: string } }> {
  const api = await apiAs('owner')
  const categories = await ok<{ id: number; key: string | null }[]>(await api.get('/api/ingredient_categories'))
  const hops = categories.find((c) => c.key === 'hops')
  expect(hops, 'the Hops category').toBeTruthy()
  const hop = await ok<{ id: number; name: string }>(await api.post('/api/ingredients', { data: { name: tempTag(`${label} hop`), category_id: hops!.id } }), 201)
  made.ingredients.add(hop.id)
  const company = await ok<{ id: number; name: string }>(
    await api.post('/api/parties', { data: { name: tempTag(`${label} hop co`), roles: ['manufacturer', 'supplier'] } }),
    201,
  )
  made.parties.add(company.id)
  return { hop, company }
}

/**
 * A `[TEST-TEMP]` hop product (T90 Pellet, alpha 11–13, beta 3.5–4.5, oil
 * 2.5–3) with an offer of 11 lb boxes from its company.
 */
export async function makeHopProduct(label: string): Promise<ApiProduct & { company: { id: number; name: string } }> {
  const { hop, company } = await makeHopVariety(label)
  const api = await apiAs('brewer1')
  const product = await ok<ApiProduct>(
    await api.post('/api/ingredient_products', {
      data: {
        ingredient_id: hop.id,
        manufacturer_party_id: company.id,
        form: 'T90 Pellet',
        origin: 'USA',
        features: { alpha_acid_pct: { low: '11', high: '13' }, beta_acid_pct: { low: '3.5', high: '4.5' }, total_oil_ml_100g: { low: '2.5', high: '3' } },
      },
    }),
    201,
  )
  made.products.add(product.id)
  await ok(await api.post('/api/supplier_offers', { data: { product_id: product.id, supplier_party_id: company.id } }), 201)
  return { ...(await getProduct(product.id)), company }
}

/** A hop lot of `product` with an opening amount of `lb`, alpha `alpha`, crop year 2025, received `daysAgo`. */
export async function makeHopLot(product: ApiProduct, lb: string, daysAgo: number, alpha = '12'): Promise<ApiLot> {
  return ok<ApiLot>(
    await (await apiAs('brewer1')).post('/api/ingredient_lots', {
      data: {
        product_id: product.id,
        lot_number: tempTag('hop lot'),
        crop_year: 2025,
        received_date: addDays(denverToday(), -daysAgo),
        initial_kind: 'opening',
        initial_quantity: lb,
        features: { alpha_acid_pct: alpha },
      },
    }),
    201,
  )
}
