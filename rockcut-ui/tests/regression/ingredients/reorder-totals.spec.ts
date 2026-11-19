import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import {
  SACK,
  addDays,
  apiAs,
  cleanupIngredients,
  denverToday,
  makeLot,
  makeOrder,
  makePurchasing,
  makeSupplierLot,
  openDialog,
  receiveOrder,
  setQuantityDisplay,
} from './helpers'

// D61 spec §8 (reorder, totals), as `brewer1` and `owner`: To order follows
// the minimum, what's on hand and on order; the row's offer can be changed;
// Start an order opens New order prefilled, one per supplier. Inventory
// totals as of a date before and after a receipt, the estimated mark and the
// supplier filter; order totals by supplier; Copy puts plain TSV on the
// clipboard. Every row is `[TEST-TEMP]`.

test.afterAll(cleanupIngredients)

async function setMinimum(productId: number, sacks: number) {
  const res = await (await apiAs('brewer1')).put(`/api/ingredient_products/${productId}`, { data: { min_on_hand_sacks: sacks } })
  expect(res.status(), await res.text()).toBe(200)
}

test.describe('brewer1', () => {
  test.use({ storageState: authFile('brewer1') })
  test.beforeEach(async () => setQuantityDisplay('brewer1', 'sacks'))

  test('T1: To order: minimum − on hand − on order; the offer can change; Start an order opens New order prefilled, one supplier at a time', async ({ page }) => {
    const a = await makePurchasing('T1 a')
    const b = await makePurchasing('T1 b')
    await makeLot(a.product, 2, 10)
    await setMinimum(a.product.id, 3)
    await setMinimum(b.product.id, 5)

    await page.goto('/ingredients/to-order')
    const rowA = page.getByTestId(`to-order-${a.product.id}`)
    const rowB = page.getByTestId(`to-order-${b.product.id}`)
    await expect(rowA.getByTestId(`to-order-${a.product.id}-on-hand`)).toHaveText('2 sacks')
    await expect(rowA.getByTestId(`to-order-${a.product.id}-to-order`)).toHaveText('1')
    await expect(rowB.getByTestId(`to-order-${b.product.id}-to-order`)).toHaveText('5')
    // Each product's first active offer is the reference BSG one; pick the temp supplier's.
    for (const x of [a, b]) {
      await page.getByTestId(`to-order-${x.product.id}-offer`).click()
      await page.getByRole('option', { name: new RegExp(x.supplier.name.replace(/[[\]]/g, '.')) }).click()
    }

    // An open order for 4 sacks leaves nothing to order for A.
    const open = await makeOrder(a.supplier.id, [{ offerId: a.offer.id, sacks: 4 }])
    await page.reload()
    await expect(rowA.getByTestId(`to-order-${a.product.id}-on-order`)).toHaveText('4')
    await expect(rowA.getByTestId(`to-order-${a.product.id}-to-order`)).toHaveText('0')
    await expect(rowA.getByTestId(`to-order-${a.product.id}-pick`)).toHaveCount(0)
    expect((await (await apiAs('brewer1')).post(`/api/purchase_orders/${open.id}/cancel`)).status()).toBe(200)
    await page.reload()
    await expect(rowA.getByTestId(`to-order-${a.product.id}-to-order`)).toHaveText('1')

    for (const x of [a, b]) {
      await page.getByTestId(`to-order-${x.product.id}-offer`).click()
      await page.getByRole('option', { name: new RegExp(x.supplier.name.replace(/[[\]]/g, '.')) }).click()
      await page.getByTestId(`to-order-${x.product.id}-pick`).check()
    }
    const d = await openDialog(page, page.getByTestId('to-order-start'), 'order-dialog')
    await expect(d).toContainText('New order · 1 of 2')
    const supplierBox = d.getByRole('combobox', { name: 'Supplier' })
    await expect(supplierBox).toHaveText(/T1 (a|b) supplier/)
    const firstSupplier = (await supplierBox.textContent()) ?? ''
    const first = firstSupplier.includes(a.supplier.name) ? a : b
    await expect(d.getByTestId('order-line-0-sacks')).toHaveValue(first === a ? '1' : '5')
    await expect(d.getByTestId('order-line-0-price')).toHaveValue('42')
    const created = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/purchase_orders'))
    await d.getByRole('button', { name: 'Save' }).click()
    expect((await created).status()).toBe(201)
    await expect(page.getByTestId('order-dialog')).toContainText('New order · 2 of 2')
    await page.getByTestId('order-dialog').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByTestId('order-dialog')).toHaveCount(0)

    const orders = (await (await (await apiAs('brewer1')).get(`/api/purchase_orders?supplier_id=${first.supplier.id}&status=open`)).json()).data as { lines: { sacks_ordered: number }[] }[]
    expect(orders.map((o) => o.lines[0].sacks_ordered)).toEqual([first === a ? 1 : 5])
  })

  test('T2: Totals → Inventory: as of before and after a receipt; estimated marked; supplier filter; Copy as plain TSV', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const { product, supplier, offer } = await makePurchasing('T2')
    await makeSupplierLot(product, supplier.id, 2, 10)
    const order = await makeOrder(supplier.id, [{ offerId: offer.id, sacks: 4 }], { ordered_on: addDays(denverToday(), -3) })
    await receiveOrder(order, addDays(denverToday(), -2), `[TEST-TEMP] T2 ${order.id}`)

    await page.goto('/ingredients/totals')
    await page.getByTestId('totals-inventory-supplier').click()
    await page.getByRole('option', { name: supplier.name }).click()
    const row = page.getByTestId(`totals-inventory-${product.id}`)
    // 2 sacks estimated at $42/55 lb ($84.00) + 4 received at $42 ($168.00).
    await expect(row.getByTestId(`totals-inventory-${product.id}-lb`)).toHaveText('330')
    await expect(row.getByTestId(`totals-inventory-${product.id}-value`)).toHaveText('$252.00 est.')
    await expect(page.getByTestId('totals-inventory-total')).toContainText('$252.00')

    await page.getByTestId('totals-as-of').fill(addDays(denverToday(), -3))
    await expect(row.getByTestId(`totals-inventory-${product.id}-lb`)).toHaveText('110')
    await expect(row.getByTestId(`totals-inventory-${product.id}-value`)).toHaveText('$84.00 est.')

    await page.getByTestId('totals-inventory-copy').click()
    await expect(page.getByTestId('totals-inventory-copy-note')).toHaveText('Copied')
    const text = await page.evaluate(() => navigator.clipboard.readText())
    const lines = text.split('\n').map((l) => l.split('\t'))
    expect(lines[0]).toEqual(['Grain', 'Maltster', 'Product', 'Category', 'lb', 'Expired lb', 'Sacks', '$/lb', 'Value', 'Estimated'])
    expect(lines).toHaveLength(3)
    expect(lines[1].slice(0, 3)).toEqual(['2-Row', 'Rahr', product.display_name])
    expect([Number(lines[1][4]), Number(lines[1][8]), lines[1][9]]).toEqual([110, 84, 'yes'])
    expect(lines[2][0]).toBe('Total')
    // Data rows are plain: no $, thousands separators or units.
    expect(text.split('\n').slice(1).join('\n')).not.toMatch(/\$|,|\d lb/)
  })

  test('T3: Totals → Orders: open counts ordered, received counts received; per supplier and total; Copy', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const { supplier, offer } = await makePurchasing('T3')
    await makeOrder(supplier.id, [{ offerId: offer.id, sacks: 3 }], { reference: 'PO-T3' })
    const got = await makeOrder(supplier.id, [{ offerId: offer.id, sacks: 10 }])
    const lines = got.lines.map((l) => ({ id: l.id, sacks_received: 8, allocations: [{ lot_number: `[TEST-TEMP] T3 ${got.id}`, sacks: 8 }] }))
    expect((await (await apiAs('brewer1')).post(`/api/purchase_orders/${got.id}/receive`, { data: { lines } })).status()).toBe(200)

    await page.goto('/ingredients/totals')
    await page.getByTestId('totals-tab-orders').click()
    await page.getByTestId('totals-orders-supplier').click()
    await page.getByRole('option', { name: supplier.name }).click()
    const sub = page.getByTestId(`totals-orders-supplier-${supplier.id}`)
    // 3 × 55 + 8 × 55 = 605 lb; 11 × $42 = $462.00.
    await expect(sub).toContainText('605')
    await expect(sub).toContainText('$462.00')
    await expect(sub.locator('td').nth(1)).toHaveText('13')
    await expect(sub.locator('td').nth(2)).toHaveText('8')
    await expect(page.getByTestId('totals-orders-total')).toContainText('$462.00')

    await page.getByTestId('totals-orders-copy').click()
    const text = await page.evaluate(() => navigator.clipboard.readText())
    const rows = text.split('\n').map((l) => l.split('\t'))
    expect(rows[0]).toEqual(['Order date', 'Supplier', 'Reference', 'Product', 'Status', 'Sacks ordered', 'Sacks received', 'lb', '$'])
    expect(rows).toHaveLength(5)
    expect(rows[1][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(rows.slice(1, 3).map((r) => [r[4], r[5], r[6], Number(r[7]), Number(r[8])]).sort()).toEqual(
      [
        ['open', '3', '', 3 * SACK, 126],
        ['received', '10', '8', 8 * SACK, 336],
      ].sort(),
    )
    // Lead decisions 1, gap 8: the subtotal and total rows carry sacks ordered and received.
    expect([rows[3][0], rows[3][5], rows[3][6]]).toEqual([`Total ${supplier.name}`, '13', '8'])
    expect([rows[4][0], rows[4][5], rows[4][6], Number(rows[4][8])]).toEqual(['Total', '13', '8', 462])
  })
})
