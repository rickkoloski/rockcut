import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import {
  SACK,
  addDays,
  apiAs,
  cleanupIngredients,
  denverToday,
  getProduct,
  makeLot,
  makeOffer,
  makeOrder,
  makeProduct,
  makePurchasing,
  makeSupplierLot,
  openDialog,
  pickGrainTotals,
  pick,
  receiveOrder,
  saveProduct,
  setQuantityDisplay,
  tempTag,
} from './helpers'

// D61 local QA fix cycle 1 (`d61_lead_decisions_1.md`, spec Amendments) on
// the screens: a contract line counts every offer by weight (half sacks),
// its total remaining doesn't net the over, Delete is disabled with the
// reason once grain is received (gaps 17, 3, 18); sacks boxes take 1,234 and
// the received date can't be before the order date (10, 12); the reorder
// offer is kept (4); inventory totals: no value is "—", expired lb totalled,
// the As of note, one "All grains" (5, 6, 7, item 18); a receipt names its
// order in History and the duplicate lot # message has no field prefix
// (item 18, gap 1). Every row is `[TEST-TEMP]`.

test.afterAll(cleanupIngredients)

const year = Number(denverToday().slice(0, 4))

test.describe('breweryMgr', () => {
  test.use({ storageState: authFile('breweryMgr') })

  test('F1: a contract line counts both sack sizes by weight; Over apart from what is owed; Delete disabled with the reason; a contract with nothing received deletes', async ({ page }) => {
    const { product, supplier, offer } = await makePurchasing('F1')
    const offer50 = await makeOffer(product, supplier.id, '40.00', null, '50')
    const second = await makeProduct('F1 second')
    await makeOffer(second, supplier.id, '50.00')
    const mgr = await apiAs('breweryMgr')
    const made = await mgr.post('/api/contracts', {
      data: {
        supplier_party_id: supplier.id,
        year,
        lines: [
          { product_id: product.id, offer_id: offer50.id, quantity: 10, price: '40.00' },
          { product_id: second.id, quantity: 5, price: '50.00' },
        ],
      },
    })
    expect(made.status(), await made.text()).toBe(201)
    const id = (await made.json()).data.id as number
    // 5 × 50 lb + 5 × 55 lb = 525 lb = 10.5 of the line's 50 lb sacks.
    await receiveOrder(await makeOrder(supplier.id, [{ offerId: offer50.id, packs: 5 }]), denverToday(), tempTag('F1 50'))
    await receiveOrder(await makeOrder(supplier.id, [{ offerId: offer.id, packs: 5 }]), denverToday(), tempTag('F1 55'))

    await page.goto(`/ingredients/contracts?year=${year}`)
    const card = page.getByTestId(`contract-${id}`)
    await expect(card.getByTestId(`contract-line-${product.id}-received`)).toHaveText('10.5')
    await expect(card.getByTestId(`contract-line-${product.id}-remaining`)).toHaveText('over by 0.5')
    await expect(card.getByTestId(`contract-line-${second.id}-remaining`)).toHaveText('5')
    await expect(card.getByTestId(`contract-${id}-remaining`)).toHaveText('5')
    await expect(card.getByTestId(`contract-${id}-over`)).toHaveText('Over: 0.5 sacks')

    const del = card.getByTestId(`contract-${id}-delete`)
    await expect(del).toBeDisabled()
    await del.locator('..').hover()
    await expect(page.getByRole('tooltip')).toHaveText("Grain has been received against this contract, so it can't be deleted")

    // Next year's has nothing received: Delete asks, then it's gone.
    const next = await mgr.post('/api/contracts', { data: { supplier_party_id: supplier.id, year: year + 1, lines: [{ product_id: second.id, quantity: 3, price: '50.00' }] } })
    expect(next.status()).toBe(201)
    const nextId = (await next.json()).data.id as number
    await page.goto(`/ingredients/contracts?year=${year + 1}`)
    await page.getByTestId(`contract-${nextId}-delete`).click()
    const confirm = page.getByTestId('contract-delete-confirm')
    const deleted = page.waitForResponse((r) => r.request().method() === 'DELETE' && r.url().endsWith(`/api/contracts/${nextId}`))
    await confirm.getByRole('button', { name: 'Delete' }).click()
    expect((await deleted).status()).toBe(204)
    await expect(page.getByTestId(`contract-${nextId}`)).toHaveCount(0)
  })
})

test.describe('brewer1', () => {
  test.use({ storageState: authFile('brewer1') })
  test.beforeEach(async () => setQuantityDisplay('brewer1', 'packs'))

  test('F2: sacks boxes take 1,234; Receive refuses a date before the order date', async ({ page }) => {
    const { supplier } = await makePurchasing('F2')
    await page.goto('/ingredients/orders')
    const d = await openDialog(page, page.getByTestId('orders-new'), 'order-dialog')
    await pick(page, d, 'Supplier', supplier.name)
    await pick(page, d, 'Offer', /F2/)
    await d.getByTestId('order-line-0-packs').fill('1,234')
    await expect(d.getByTestId('order-running-total')).toHaveText('1,234 sacks · 67,870 lb · $51,828.00')
    await d.getByTestId('order-date').fill(addDays(denverToday(), -3))
    const created = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/purchase_orders'))
    await d.getByRole('button', { name: 'Save' }).click()
    const res = await created
    expect(res.status()).toBe(201)
    const order = (await res.json()).data as { id: number; lines: { packs_ordered: number }[] }
    expect(order.lines[0].packs_ordered).toBe(1234)

    await page.goto(`/ingredients/orders/${order.id}`)
    const r = await openDialog(page, page.getByTestId('order-receive'), 'receive-dialog')
    await expect(r.getByTestId('receive-date')).toHaveAttribute('min', addDays(denverToday(), -3))
    await r.getByTestId('receive-line-0-packs').fill('1,234')
    await expect(r.getByText('Received in full')).toBeVisible()
    await r.getByTestId('receive-line-0-row-0-number').fill(tempTag('F2 lot'))
    await r.getByTestId('receive-date').fill(addDays(denverToday(), -4))
    await expect(r.getByText("The received date can't be before the order date")).toBeVisible()
    await expect(r.getByRole('button', { name: 'Receive' })).toBeDisabled()
    await r.getByTestId('receive-date').fill(addDays(denverToday(), -3))
    await expect(r.getByRole('button', { name: 'Receive' })).toBeEnabled()
  })

  test('F3: the reorder offer picked on To order is saved on the product', async ({ page }) => {
    const { product, supplier, offer } = await makePurchasing('F3')
    expect((await saveProduct(product.id, { min_on_hand_packs: 3 })).status()).toBe(200)
    await page.goto('/ingredients/to-order')
    const select = page.getByTestId(`to-order-${product.id}-offer`)
    // The default is the first active offer: the reference BSG one.
    await expect(select).not.toContainText(supplier.name)
    const saved = page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().endsWith(`/api/ingredient_products/${product.id}`))
    await select.click()
    await page.getByRole('option', { name: new RegExp(supplier.name.replace(/[[\]]/g, '.')) }).click()
    expect((await saved).status()).toBe(200)
    expect((await getProduct(product.id)) as unknown as { reorder_offer_id: number }).toMatchObject({ reorder_offer_id: offer.id })
    await page.reload()
    await expect(page.getByTestId(`to-order-${product.id}-offer`)).toContainText(`${supplier.name} · 55 lb`)
  })

  test('F4: inventory totals: no value is "—" and empty in Copy; expired lb totalled; the As of note; one "All categories"', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const { product, supplier } = await makePurchasing('F4')
    await makeSupplierLot(product, supplier.id, 2, 10)
    const old = await makeSupplierLot(product, supplier.id, 1, 10)
    expect((await (await apiAs('brewer1')).put(`/api/ingredient_lots/${old.id}`, { data: { status: 'expired' } })).status()).toBe(200)
    // The reference BSG offer has no price: nothing to value it at.
    const unpriced = await makeProduct('F4 unpriced')
    await makeLot(unpriced, 1, 5)

    await page.goto('/ingredients/totals')
    // D62 gap 4: one "All categories" (the default) and no option twice.
    await page.getByTestId('totals-inventory-category').click()
    const options = await page.getByRole('option').allTextContents()
    expect(options.filter((o) => /^all (categories|grains)$/i.test(o))).toEqual(['All categories'])
    expect(new Set(options).size).toBe(options.length)
    await page.keyboard.press('Escape')
    await pickGrainTotals(page)
    await expect(page.getByTestId(`totals-inventory-${unpriced.id}-value`)).toHaveText('—')
    await expect(page.getByTestId('totals-inventory-expired-note')).toHaveCount(0)
    await page.getByTestId('totals-inventory-copy').click()
    await expect(page.getByTestId('totals-inventory-copy-note')).toHaveText('Copied')
    const lines = (await page.evaluate(() => navigator.clipboard.readText())).split('\n').map((l) => l.split('\t'))
    const row = lines.find((l) => l[2] === unpriced.display_name)!
    expect([Number(row[4]), row[8], row[9]]).toEqual([SACK, '', ''])


    await page.getByTestId('totals-inventory-supplier').click()
    await page.getByRole('option', { name: supplier.name }).click()
    const total = page.getByTestId('totals-inventory-total')
    await expect(total.getByTestId('totals-inventory-total-expired')).toHaveText(String(SACK))
    await expect(total).toContainText(String(3 * SACK))

    await page.getByTestId('totals-as-of').fill(addDays(denverToday(), -1))
    await expect(page.getByTestId('totals-inventory-expired-note')).toHaveText("Expired shows each lot's status today.")
  })

  test('F5: a receipt from an order names the order in History; a duplicate lot # says so without a field name', async ({ page }) => {
    const { product, supplier, offer } = await makePurchasing('F5')
    const reference = tempTag('PO-F5')
    const lotNumber = tempTag('F5 lot')
    const withRef = await makeOrder(supplier.id, [{ offerId: offer.id, packs: 1 }], { reference })
    await receiveOrder(withRef, denverToday(), lotNumber)
    const plain = await makeOrder(supplier.id, [{ offerId: offer.id, packs: 1 }])
    await receiveOrder(plain)

    await page.goto(`/ingredients/products/${product.id}`)
    const history = page.getByTestId('product-movements')
    await expect(history).toContainText(reference)
    await expect(history).toContainText(`Order #${plain.id}`)

    const d = await openDialog(page, page.getByTestId('product-add-lot'), 'add-lot-dialog')
    await pick(page, d, 'Supplier offer', /F5 supplier/)
    await d.getByTestId('lot-number').fill(` ${lotNumber.toLowerCase()} `)
    await d.getByTestId('lot-quantity-packs').fill('1')
    await d.getByRole('button', { name: 'Save' }).click()
    await expect(d).toContainText(`This product already has lot ${lotNumber}`)
    await expect(d).not.toContainText('lot number:')
  })
})
