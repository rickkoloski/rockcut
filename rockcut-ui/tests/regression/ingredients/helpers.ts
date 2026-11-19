import { expect, type APIResponse, type Locator, type Page } from '@playwright/test'
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
  on_hand_lb: string
  expired_lb: string
  features: Record<string, FeatureValue>
  offers: { id: number; supplier_party_id: number; current_price: { price_per_sack: string } | null }[]
}

export interface ApiLot {
  id: number
  lot_number: string | null
  status: 'available' | 'depleted' | 'expired'
  on_hand_lb: string
  features: Record<string, FeatureValue>
}

export interface ApiMovement {
  id: number
  lot_id: number
  kind: string
  quantity_lb: string
}

const made = { products: new Set<number>(), parties: new Set<number>() }

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
        maltster_party_id: ref.rahr,
        name: tempTag(label),
        features: { color_lovibond: { value: '2' }, extract_fgdb: { value: '81.5' }, moisture_pct: { value: '4.5' } },
      },
    }),
    201,
  )
  made.products.add(product.id)
  await ok(await api.post('/api/supplier_offers', { data: { product_id: product.id, supplier_party_id: ref.bsg, sack_size_lb: '55', form: 'milled' } }), 201)
  return getProduct(product.id)
}

/** A lot of `product` with an opening amount of `sacks` 55 lb sacks, received `daysAgo` days ago. */
export async function makeLot(product: ApiProduct, sacks: number, daysAgo: number, number = tempTag('lot')): Promise<ApiLot> {
  const ref = await reference()
  const res = await (await apiAs('brewer1')).post('/api/ingredient_lots', {
    data: {
      product_id: product.id,
      supplier_party_id: ref.bsg,
      sack_size_lb: '55',
      lot_number: number,
      received_date: addDays(denverToday(), -daysAgo),
      initial_kind: 'opening',
      initial_quantity_lb: String(sacks * SACK),
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
  await expect.poll(async () => Number((await getProduct(productId)).on_hand_lb), { message: `product ${productId} on_hand_lb` }).toBe(lb)
}

export async function expectLotOnHand(lotId: number, productId: number, lb: number) {
  await expect
    .poll(async () => Number((await lotsOf(productId)).find((l) => l.id === lotId)?.on_hand_lb), { message: `lot ${lotId} on_hand_lb` })
    .toBe(lb)
}

/** A persona's sacks/lb toggle (`board_settings.ingredients`). */
export async function setQuantityDisplay(persona: PersonaKey, mode: 'sacks' | 'lb') {
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
  lines: { id: number; offer_id: number; sacks_ordered: number; sacks_received: number | null; price_per_sack: string }[]
  total_sacks: number
  total_dollars: string
}

/** A `[TEST-TEMP]` supplier, with an order target when given. */
export async function makeSupplier(label: string, target: number | null = 40): Promise<{ id: number; name: string }> {
  const party = await ok<{ id: number; name: string }>(
    await (await apiAs('owner')).post('/api/parties', { data: { name: tempTag(label), roles: ['supplier'], order_target_sacks: target } }),
    201,
  )
  made.parties.add(party.id)
  return party
}

/** An offer of `product` by `supplierId` in 55 lb sacks at `price` a sack from long ago. */
export async function makeOffer(product: ApiProduct, supplierId: number, price = '42.00', orderName: string | null = null, size = '55'): Promise<{ id: number }> {
  const api = await apiAs('brewer1')
  const offer = await ok<{ id: number }>(
    await api.post('/api/supplier_offers', { data: { product_id: product.id, supplier_party_id: supplierId, sack_size_lb: size, form: 'whole', order_name: orderName } }),
    201,
  )
  await ok(await api.post(`/api/supplier_offers/${offer.id}/prices`, { data: { price_per_sack: price, effective_on: '2020-01-01' } }), 201)
  return offer
}

/** A temp product with a temp supplier (target 40) and its $42.00 offer: what an order needs. */
export async function makePurchasing(label: string) {
  const product = await makeProduct(label)
  const supplier = await makeSupplier(`${label} supplier`)
  const offer = await makeOffer(product, supplier.id)
  return { product, supplier, offer }
}

/** An open order (placed by `brewer1`) of `sacks` of each offer. */
export async function makeOrder(supplierId: number, lines: { offerId: number; sacks: number }[], extra: Record<string, unknown> = {}): Promise<ApiOrder> {
  return ok<ApiOrder>(
    await (await apiAs('brewer1')).post('/api/purchase_orders', {
      data: { supplier_party_id: supplierId, ordered_on: denverToday(), lines: lines.map((l) => ({ offer_id: l.offerId, sacks_ordered: l.sacks })), ...extra },
    }),
    201,
  )
}

/** Receive an order in full (into the previous lot, else a new `[TEST-TEMP]` lot) on `on`. */
export async function receiveOrder(order: ApiOrder, on = denverToday(), lotNumber: string | null = null): Promise<ApiOrder> {
  const lines = order.lines.map((l) => ({ id: l.id, sacks_received: l.sacks_ordered, ...(lotNumber ? { allocations: [{ lot_number: lotNumber, sacks: l.sacks_ordered }] } : {}) }))
  return ok<ApiOrder>(await (await apiAs('brewer1')).post(`/api/purchase_orders/${order.id}/receive`, { data: { received_on: on, lines } }))
}

/** A lot of `product` from `supplierId` (55 lb sacks) with an opening amount, received `daysAgo`. */
export async function makeSupplierLot(product: ApiProduct, supplierId: number, sacks: number, daysAgo: number): Promise<ApiLot> {
  return ok<ApiLot>(
    await (await apiAs('brewer1')).post('/api/ingredient_lots', {
      data: {
        product_id: product.id,
        supplier_party_id: supplierId,
        sack_size_lb: '55',
        lot_number: tempTag('lot'),
        received_date: addDays(denverToday(), -daysAgo),
        initial_kind: 'opening',
        initial_quantity_lb: String(sacks * SACK),
      },
    }),
    201,
  )
}

export async function getOrder(id: number): Promise<ApiOrder> {
  return ok<ApiOrder>(await (await apiAs('brewer1')).get(`/api/purchase_orders/${id}`))
}

/** No sideways scroll on the page. */
/**
 * A phone dialog closed and its back-button history entry released: closing
 * takes the entry off with `history.back()` a tick later (`useBackCloses`),
 * which aborts a `page.goto` sent in between (lead decisions 1, item 19).
 */
export async function expectPhoneDialogClosed(page: Page, dialog: Locator) {
  await expect(dialog).toHaveCount(0)
  await page.waitForFunction(() => window.history.state?.rockcutBackCloses == null)
}

export async function expectNoSidewaysScroll(page: Page) {
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  expect(scroll, 'page scrollWidth vs clientWidth').toBeLessThanOrEqual(client)
}

/** Pick `option` from the MUI select labelled `label` inside `scope`. */
export async function pick(page: Page, scope: Locator, label: string | RegExp, option: string | RegExp) {
  await scope.getByRole('combobox', { name: label }).click()
  await page.getByRole('option', { name: option }).click()
}
