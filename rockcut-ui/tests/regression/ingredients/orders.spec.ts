import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import {
  SACK,
  addDays,
  apiAs,
  cleanupIngredients,
  denverToday,
  expectLotOnHand,
  getOrder,
  lotsOf,
  makeLot,
  makeOrder,
  makePurchasing,
  makeSupplier,
  openDialog,
  pick,
  setQuantityDisplay,
  tempTag,
} from './helpers'

// D61 spec §8 (orders and receiving), as `brewer1`: a new order with its
// running total and target progress, editing and cancelling an open order,
// and receiving one in full into the previous lot, short, split across lots,
// into a new lot, and refused into an expired lot; a received order is
// read-only. Then the product page (minimum, Below minimum, open orders,
// lot value), the Grains list mark, and a supplier's order target on
// Companies. Every row is `[TEST-TEMP]` and ordered from a temp supplier.

test.use({ storageState: authFile('brewer1') })
test.beforeEach(async () => setQuantityDisplay('brewer1', 'packs'))
test.afterAll(cleanupIngredients)

test('PO1: New order: running total and "36 of 40 sacks", 40 of 40, 44 of 80; Save places it and opens it', async ({ page }) => {
  const { supplier } = await makePurchasing('PO1')
  await page.goto('/ingredients')
  await page.getByTestId('ingredients-purchasing').click()
  await expect(page).toHaveURL(/\/ingredients\/orders$/)
  const d = await openDialog(page, page.getByTestId('orders-new'), 'order-dialog')
  await expect(d.getByTestId('order-date')).toHaveValue(denverToday())
  await expect(d.getByTestId('order-date')).toHaveAttribute('max', denverToday())
  await pick(page, d, 'Supplier', supplier.name)
  await pick(page, d, 'Offer', /PO1/)
  await expect(d.getByTestId('order-line-0-price')).toHaveValue('42')
  const packs = d.getByTestId('order-line-0-packs')
  await packs.fill('36')
  await expect(d.getByTestId('order-running-total')).toHaveText('36 sacks · 1,980 lb · $1,512.00')
  await expect(d.getByTestId('order-target-progress')).toHaveText('36 of 40 sacks')
  await packs.fill('40')
  await expect(d.getByTestId('order-target-progress')).toHaveText('40 of 40 sacks')
  await packs.fill('44')
  await expect(d.getByTestId('order-target-progress')).toHaveText('44 of 80 sacks')
  await packs.fill('1.5')
  await expect(d.getByText('Whole sacks, 1 or more')).toBeVisible()
  await expect(d.getByRole('button', { name: 'Save' })).toBeDisabled()
  await packs.fill('36')
  await d.getByTestId('order-reference').fill('PO-77')

  const created = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/purchase_orders'))
  await d.getByRole('button', { name: 'Save' }).click()
  const id = (await (await created).json()).data.id as number
  await expect(page).toHaveURL(new RegExp(`/ingredients/orders/${id}$`))
  await expect(page.getByTestId('order-status')).toHaveText('Open')
  await expect(page.getByTestId('order-totals')).toHaveText('36 sacks · 1,980 lb · $1,512.00')
  await expect(page.getByTestId('order-page-target')).toHaveText('36 of 40 sacks')
  const order = await getOrder(id)
  expect([order.status, order.total_packs, Number(order.lines[0].price_per_pack)]).toEqual(['open', 36, 42])

  await page.goto('/ingredients/orders')
  await expect(page.getByTestId(`order-${id}`)).toContainText('PO-77')
})

test('PO2: Edit an open order (6 → 8 sacks), then Cancel asks first; a cancelled order is read-only', async ({ page }) => {
  const { supplier, offer } = await makePurchasing('PO2')
  const order = await makeOrder(supplier.id, [{ offerId: offer.id, packs: 6 }])
  await page.goto(`/ingredients/orders/${order.id}`)
  const d = await openDialog(page, page.getByTestId('order-edit'), 'order-dialog')
  await d.getByTestId('order-line-0-packs').fill('8')
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(d).toHaveCount(0)
  await expect(page.getByTestId('order-totals')).toHaveText('8 sacks · 440 lb · $336.00')
  expect((await getOrder(order.id)).lines[0].packs_ordered).toBe(8)

  await page.getByTestId('order-cancel').click()
  const confirm = page.getByTestId('order-cancel-confirm')
  await expect(confirm).toContainText('Cancel this order? Nothing has been received.')
  await confirm.getByRole('button', { name: 'Keep it' }).click()
  await expect(page.getByTestId('order-status')).toHaveText('Open')
  await page.getByTestId('order-cancel').click()
  await confirm.getByRole('button', { name: 'Cancel order' }).click()
  await expect(page.getByTestId('order-status')).toHaveText('Cancelled')
  await expect(page.getByTestId('order-history')).toContainText('cancelled by')
  for (const b of ['order-edit', 'order-cancel', 'order-receive']) await expect(page.getByTestId(b)).toHaveCount(0)
  expect((await getOrder(order.id)).status).toBe('cancelled')
})

test('PO3: Receive in full: the previous lot is preselected and topped up (received date kept); the order is read-only after', async ({ page }) => {
  const { product, supplier, offer } = await makePurchasing('PO3')
  const old = await makeLot(product, 2, 30)
  const prev = await makeLot(product, 8, 10)
  const order = await makeOrder(supplier.id, [{ offerId: offer.id, packs: 4 }])
  await page.goto(`/ingredients/orders/${order.id}`)
  const d = await openDialog(page, page.getByTestId('order-receive'), 'receive-dialog')
  await expect(d.getByTestId('receive-date')).toHaveValue(denverToday())
  await expect(d.getByTestId('receive-line-0-packs')).toHaveValue('4')
  await expect(d.getByText('Received in full')).toBeVisible()
  await expect(d.getByTestId('receive-line-0-row-0').getByRole('combobox')).toHaveText(`Lot ${prev.lot_number} · received ${addDays(denverToday(), -10)} · 8 sacks on hand`)
  await d.getByRole('button', { name: 'Receive' }).click()
  await expect(d).toHaveCount(0)

  await expect(page.getByTestId('order-status')).toHaveText('Received')
  await expect(page.getByTestId(`order-line-received-${order.lines[0].id}`)).toHaveText('4')
  await expect(page.getByTestId('order-history')).toContainText(`received ${denverToday()}`)
  for (const b of ['order-edit', 'order-cancel', 'order-receive']) await expect(page.getByTestId(b)).toHaveCount(0)
  await expectLotOnHand(prev.id, product.id, 12 * SACK)
  await expectLotOnHand(old.id, product.id, 2 * SACK)
  const lots = (await (await apiAs('brewer1')).get(`/api/ingredient_lots?product_id=${product.id}`)).json()
  const topped = ((await lots).data as { id: number; received_date: string; unit_cost: string; estimated: boolean }[]).find((l) => l.id === prev.id)!
  expect(topped.received_date).toBe(addDays(denverToday(), -10))
  expect([Number(topped.unit_cost), topped.estimated]).toEqual([0.763636, false])

  // The product page: the lot's $/lb and value, at the price paid.
  await page.goto(`/ingredients/products/${product.id}`)
  await expect(page.getByTestId(`lot-cost-${prev.id}`)).toHaveText('$0.7636')
  await expect(page.getByTestId(`lot-value-${prev.id}`)).toHaveText('$504.00')
  // The older lot has no costed receipt and its BSG offer no price: no value.
  await expect(page.getByTestId(`lot-value-${old.id}`)).toHaveText('—')
})

test('PO4: Receive short and split: 8 of 10, 5 into the previous lot and 3 into a new lot #; the rows must add up', async ({ page }) => {
  const { product, supplier, offer } = await makePurchasing('PO4')
  const prev = await makeLot(product, 1, 10)
  const order = await makeOrder(supplier.id, [{ offerId: offer.id, packs: 10 }])
  const number = tempTag('PO4 new')
  await page.goto(`/ingredients/orders/${order.id}`)
  const d = await openDialog(page, page.getByTestId('order-receive'), 'receive-dialog')
  await d.getByTestId('receive-line-0-packs').fill('8')
  await d.getByTestId('receive-line-0-add-lot').click()
  await expect(d.getByTestId('receive-line-0-split')).toHaveText('8 + 0 = 8 of 8')
  await d.getByTestId('receive-line-0-row-0-packs').fill('5')
  await d.getByTestId('receive-line-0-row-1-packs').fill('2')
  await d.getByTestId('receive-line-0-row-1-number').fill(number)
  await expect(d.getByTestId('receive-line-0-split')).toHaveText('5 + 2 = 7 of 8')
  await expect(d.getByRole('button', { name: 'Receive' })).toBeDisabled()
  await d.getByTestId('receive-line-0-row-1-packs').fill('3')
  await expect(d.getByTestId('receive-line-0-split')).toHaveText('5 + 3 = 8 of 8')
  await d.getByRole('button', { name: 'Receive' }).click()
  await expect(d).toHaveCount(0)

  await expect(page.getByTestId(`order-line-received-${order.lines[0].id}`)).toHaveText('8')
  const after = await getOrder(order.id)
  expect([after.status, after.lines[0].packs_ordered, after.lines[0].packs_received]).toEqual(['received', 10, 8])
  await expectLotOnHand(prev.id, product.id, 6 * SACK)
  const made = (await lotsOf(product.id)).find((l) => l.lot_number === number)!
  expect(Number(made.on_hand)).toBe(3 * SACK)
})

test('PO5: first delivery: the line starts on New lot # with the standard specs under Specs; the lot gets them', async ({ page }) => {
  const { product, supplier, offer } = await makePurchasing('PO5')
  const order = await makeOrder(supplier.id, [{ offerId: offer.id, packs: 2 }])
  const number = tempTag('PO5')
  await page.goto(`/ingredients/orders/${order.id}`)
  const d = await openDialog(page, page.getByTestId('order-receive'), 'receive-dialog')
  await expect(d.getByTestId('receive-line-0-row-0').getByRole('combobox')).toHaveText('New lot #')
  await expect(d.getByRole('button', { name: 'Receive' })).toBeDisabled()
  await d.getByTestId('receive-line-0-row-0-number').fill(number)
  await d.getByTestId('receive-line-0-row-0-specs').click()
  await expect(d.getByTestId('feature-extract_fgdb')).toHaveValue('81.5')
  await d.getByTestId('feature-moisture_pct').fill('4.2')
  await d.getByRole('button', { name: 'Receive' }).click()
  await expect(d).toHaveCount(0)

  const [lot] = await lotsOf(product.id)
  expect(lot.lot_number).toBe(number)
  expect(Number(lot.on_hand)).toBe(2 * SACK)
  expect(Number(lot.features.extract_fgdb.value)).toBe(81.5)
  expect(Number(lot.features.moisture_pct.value)).toBe(4.2)
})

test('PO6: an expired lot number is refused on the line; a new number receives', async ({ page }) => {
  const { product, supplier, offer } = await makePurchasing('PO6')
  const expired = await makeLot(product, 1, 30, tempTag('PO6 X'))
  expect((await (await apiAs('brewer1')).put(`/api/ingredient_lots/${expired.id}`, { data: { status: 'expired' } })).status()).toBe(200)
  const order = await makeOrder(supplier.id, [{ offerId: offer.id, packs: 1 }])
  await page.goto(`/ingredients/orders/${order.id}`)
  const d = await openDialog(page, page.getByTestId('order-receive'), 'receive-dialog')
  // An expired lot isn't offered; a number it has, in another case, is refused by the API.
  await expect(d.getByTestId('receive-line-0-row-0').getByRole('combobox')).toHaveText('New lot #')
  await d.getByTestId('receive-line-0-row-0-number').fill(expired.lot_number!.toLowerCase())
  await d.getByRole('button', { name: 'Receive' }).click()
  await expect(d.getByTestId('receive-line-0-error')).toHaveText(`Lot ${expired.lot_number} is expired; use a new lot number`)
  expect((await getOrder(order.id)).status).toBe('open')
  await d.getByTestId('receive-line-0-row-0-number').fill(tempTag('PO6 new'))
  await d.getByRole('button', { name: 'Receive' }).click()
  await expect(d).toHaveCount(0)
  expect((await getOrder(order.id)).status).toBe('received')
})

test('PO7: product page: minimum on hand, Below minimum (page and Grains list), open orders', async ({ page }) => {
  const { product, supplier, offer } = await makePurchasing('PO7')
  await makeLot(product, 2, 10)
  await page.goto(`/ingredients/products/${product.id}`)
  await expect(page.getByTestId('product-minimum-text')).toHaveText('Minimum: none')
  await expect(page.getByTestId('product-below-minimum')).toHaveCount(0)
  const d = await openDialog(page, page.getByTestId('product-minimum-edit'), 'product-dialog')
  await d.getByTestId('product-minimum').fill('1.5')
  await expect(d.getByRole('button', { name: 'Save' })).toBeDisabled()
  await d.getByTestId('product-minimum').fill('3')
  // Lead decisions 1, item 19: wait for the save itself, not a fixed time.
  const saved = page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().endsWith(`/api/ingredient_products/${product.id}`))
  await d.getByRole('button', { name: 'Save' }).click()
  expect((await saved).status()).toBe(200)
  await expect(d).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByTestId('product-minimum-text')).toHaveText('Minimum: 3 sacks')
  await expect(page.getByTestId('product-below-minimum')).toHaveText('Below minimum')
  await expect(page.getByTestId('product-open-orders')).toContainText('None on order')

  const order = await makeOrder(supplier.id, [{ offerId: offer.id, packs: 4 }])
  await page.reload()
  await expect(page.getByTestId(`product-open-order-${order.id}`)).toContainText(supplier.name)
  await expect(page.getByTestId(`product-open-order-${order.id}`)).toContainText('4')
  await page.getByTestId(`product-open-order-${order.id}`).getByRole('link').click()
  await expect(page).toHaveURL(new RegExp(`/ingredients/orders/${order.id}$`))

  await page.goto('/ingredients')
  await expect(page.getByTestId(`grain-below-minimum-${product.id}`)).toBeVisible()
})

test('PO8: Companies: a supplier gets an order target; the column shows it', async ({ page }) => {
  const supplier = await makeSupplier('PO8', null)
  await page.goto('/ingredients/companies')
  const d = await openDialog(page, page.getByTestId(`company-${supplier.id}`).first(), 'party-dialog')
  await d.getByTestId('party-order-target').fill('0')
  await expect(d.getByRole('button', { name: 'Save' })).toBeDisabled()
  await d.getByTestId('party-order-target').fill('40')
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(d).toHaveCount(0)
  await expect(page.getByTestId(`company-target-${supplier.id}`)).toHaveText('40 packs')
  const party = (await (await (await apiAs('brewer1')).get(`/api/parties/${supplier.id}`)).json()).data
  expect(party.order_target_packs).toBe(40)
})
