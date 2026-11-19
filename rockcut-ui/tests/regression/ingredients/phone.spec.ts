import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs, cleanupIngredients, expectNoSidewaysScroll, lotsOf, makeLot, makeOrder, makeProduct, makePurchasing, setQuantityDisplay, tempTag } from './helpers'

// D60 spec §9, as `brewer1` at 360 px: the Grains list is cards, the
// product page and Companies don't scroll sideways, Add lot is full screen,
// `5,2` typed in moisture is refused and `1,234` lb saves 1234 (gap 3).

test.use({ storageState: authFile('brewer1'), viewport: { width: 360, height: 780 } })
test.beforeEach(async () => setQuantityDisplay('brewer1', 'sacks'))
test.afterAll(cleanupIngredients)

async function rahr2Row(): Promise<number> {
  const list = (await (await (await apiAs('brewer1')).get('/api/ingredient_products')).json()).data as { id: number; display_name: string }[]
  return list.find((p) => p.display_name === 'Rahr 2-Row')!.id
}

test('P1: the Grains list shows cards (product, on hand, color, extract) with no sideways scroll', async ({ page }) => {
  const id = await rahr2Row()
  await page.goto('/ingredients')
  await expect(page.getByTestId('grains-cards')).toBeVisible()
  await expect(page.getByTestId('grains-table')).toHaveCount(0)
  const card = page.getByTestId(`grain-card-${id}`)
  await expect(card).toContainText('Rahr 2-Row')
  await expect(card).toContainText(/\d+ sacks/)
  await expect(card).toContainText('°L')
  await expect(card).toContainText('% FGDB')
  await expectNoSidewaysScroll(page)
})

test('P2: the product page (with lots and movements) and Companies don’t scroll sideways', async ({ page }) => {
  await page.goto(`/ingredients/products/${await rahr2Row()}`)
  // Gap 5: the top bar cuts a long name; the whole name is on the page.
  await expect(page.getByTestId('product-name')).toHaveText('Rahr 2-Row')
  await expect(page.getByTestId('product-lots')).toContainText('[SEED] Rahr 2-Row A')
  await expect(page.getByTestId('product-movements')).toContainText('Opening amount')
  await expectNoSidewaysScroll(page)

  await page.goto('/ingredients/companies')
  await expect(page.getByTestId('companies-add')).toBeVisible()
  await expect(page.locator('[data-testid^="company-"]').first()).toBeVisible()
  await expectNoSidewaysScroll(page)
})

test('P3: Add lot is full screen; 5,2 in moisture is refused, 1,234 lb saves 1234 (gap 3)', async ({ page }) => {
  const product = await makeProduct('P3 phone')
  await page.goto(`/ingredients/products/${product.id}`)
  await page.getByTestId('product-add-lot').click()
  const d = page.getByTestId('add-lot-dialog')
  const paper = d.locator('.MuiDialog-paper')
  await expect(paper).toHaveClass(/MuiDialog-paperFullScreen/)
  const box = await paper.boundingBox()
  expect(box?.width).toBe(360)
  await d.getByTestId('lot-number').fill(tempTag('P3'))
  await d.getByTestId('lot-quantity-lb').fill('1,234')
  await d.getByTestId('feature-moisture_pct').fill('5,2')
  await expect(d.getByText('Use . for the decimal point')).toBeVisible()
  await expect(d.getByRole('button', { name: 'Save' })).toBeDisabled()
  await d.getByTestId('feature-moisture_pct').fill('5.2')
  await expect(d.getByText('Use . for the decimal point')).toHaveCount(0)
  await expectNoSidewaysScroll(page)
  const created = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/ingredient_lots'))
  await d.getByRole('button', { name: 'Save' }).click()
  const body = (await created).request().postDataJSON()
  expect(body.features.moisture_pct.value).toBe('5.2')
  expect(Number(body.initial_quantity_lb)).toBe(1234)
  await expect(d).toHaveCount(0)
  const [lot] = await lotsOf(product.id)
  expect(lot.features.moisture_pct.value).toBe('5.2')
})

// D61 §4.7: Purchasing at 360 px: the orders list is cards, the order page,
// a product page with open orders and lot values, and the New order and
// Receive dialogs (full screen) don't scroll sideways.
test('P4: Purchasing at 360 px: cards, the order page, New order and Receive full screen, no sideways scroll', async ({ page }) => {
  const { product, supplier, offer } = await makePurchasing('P4 phone')
  await makeLot(product, 2, 10)
  const order = await makeOrder(supplier.id, [{ offerId: offer.id, sacks: 36 }], { reference: tempTag('P4 a long reference number') })

  await page.goto('/ingredients/orders')
  await expect(page.getByTestId('orders-cards')).toBeVisible()
  await expect(page.getByTestId('orders-table')).toHaveCount(0)
  await expect(page.getByTestId(`order-${order.id}`)).toContainText('36 sacks')
  await expectNoSidewaysScroll(page)

  await page.getByTestId('orders-new').click()
  const n = page.getByTestId('order-dialog')
  await expect(n.locator('.MuiDialog-paper')).toHaveClass(/MuiDialog-paperFullScreen/)
  await expectNoSidewaysScroll(page)
  await n.getByRole('button', { name: 'Cancel' }).click()

  await page.goto(`/ingredients/orders/${order.id}`)
  await expect(page.getByTestId('order-lines')).toBeVisible()
  await expectNoSidewaysScroll(page)
  await page.getByTestId('order-receive').click()
  const r = page.getByTestId('receive-dialog')
  await expect(r.locator('.MuiDialog-paper')).toHaveClass(/MuiDialog-paperFullScreen/)
  await r.getByTestId('receive-line-0-add-lot').click()
  await expect(r.getByTestId('receive-line-0-row-1-number')).toBeVisible()
  await expectNoSidewaysScroll(page)
  await r.getByRole('button', { name: 'Cancel' }).click()

  await page.goto(`/ingredients/products/${product.id}`)
  await expect(page.getByTestId(`product-open-order-${order.id}`)).toBeVisible()
  await expectNoSidewaysScroll(page)
})

// D61 §4.7: Contracts, To order and Totals at 360 px: the Purchasing tabs
// scroll, the tables scroll inside their box, never the page.
test('P5: Contracts, To order and Totals at 360 px: no sideways scroll', async ({ page }) => {
  const { product, supplier } = await makePurchasing('P5 phone')
  await makeLot(product, 1, 10)
  const mgr = await apiAs('breweryMgr')
  const year = Number(new Date().getFullYear()) + 1
  expect((await mgr.post('/api/contracts', { data: { supplier_party_id: supplier.id, year, lines: [{ product_id: product.id, sacks: 40, price_per_sack: '41.00' }] } })).status()).toBe(201)
  expect((await (await apiAs('brewer1')).put(`/api/ingredient_products/${product.id}`, { data: { min_on_hand_sacks: 3 } })).status()).toBe(200)

  await page.goto(`/ingredients/contracts?year=${year}`)
  await expect(page.getByTestId('purchasing-tabs')).toBeVisible()
  await expect(page.getByTestId(/^contract-\d+$/).filter({ hasText: supplier.name })).toBeVisible()
  await expectNoSidewaysScroll(page)
  await page.getByTestId('contracts-view-shortfall').click()
  await expect(page.getByTestId('contracts-shortfall')).toBeVisible()
  await expectNoSidewaysScroll(page)

  await page.goto('/ingredients/to-order')
  await expect(page.getByTestId(`to-order-${product.id}`)).toBeVisible()
  await expectNoSidewaysScroll(page)

  await page.goto('/ingredients/totals')
  await expect(page.getByTestId('totals-inventory-table')).toBeVisible()
  await expectNoSidewaysScroll(page)
  await page.getByTestId('totals-tab-orders').click()
  await expect(page.getByTestId('totals-orders-table')).toBeVisible()
  await expectNoSidewaysScroll(page)
})

