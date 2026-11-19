import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs, cleanupIngredients, denverToday, makeOffer, makeOrder, makeProduct, makePurchasing, openDialog, pick, receiveOrder, setQuantityDisplay, tempTag } from './helpers'

// D61 spec §8 (contracts), as `breweryMgr` and `brewer1`: a manager makes a
// contract for this year on a `[TEST-TEMP]` supplier (so no real offer gets a
// price row); its prices go into the offer's history as "Contract <year>";
// on order, received and remaining follow an open order and a receipt, an
// off-contract receipt doesn't count, going over shows "over by"; the
// Shortfall lists what's short. A brewer reads it with no buttons, and the
// API refuses their writes.

test.afterAll(cleanupIngredients)

const year = Number(denverToday().slice(0, 4))

async function prices(offerId: number) {
  return (await (await (await apiAs('brewer1')).get(`/api/supplier_offers/${offerId}/prices`)).json()).data as { price_per_sack: string; effective_on: string; note: string | null }[]
}

async function setup() {
  const a = await makePurchasing('C1')
  const b = await makeProduct('C1 second')
  const bOffer = await makeOffer(b, a.supplier.id, '50.00')
  return { ...a, second: b, secondOffer: bOffer }
}

test.describe('breweryMgr', () => {
  test.use({ storageState: authFile('breweryMgr') })
  test.beforeEach(async () => setQuantityDisplay('breweryMgr', 'sacks'))

  test('C1: a contract for this year: prices into history, on order / received / over, off-contract excluded, Shortfall', async ({ page }) => {
    const { product, supplier, offer, second } = await setup()
    await page.goto('/ingredients/orders')
    await page.getByTestId('purchasing-tab-contracts').click()
    await expect(page).toHaveURL(/\/ingredients\/contracts$/)
    const d = await openDialog(page, page.getByTestId('contracts-new'), 'contract-dialog')
    await pick(page, d, 'Supplier', supplier.name)
    await expect(d.getByTestId('contract-year')).toHaveValue(String(year))
    await pick(page, d.getByTestId('contract-line-0'), 'Product', new RegExp(`${product.display_name.replace(/[[\]()]/g, '.')}$`))
    await expect(d.getByTestId('contract-line-0-price')).toHaveValue('42')
    await d.getByTestId('contract-line-0-sacks').fill('10')
    await d.getByTestId('contract-line-0-price').fill('40')
    await d.getByTestId('contract-add-line').click()
    await pick(page, d.getByTestId('contract-line-1'), 'Product', /C1 second/)
    await d.getByTestId('contract-line-1-sacks').fill('5')
    await expect(d.getByTestId('contract-price-changes')).toContainText(`${supplier.name} ${product.display_name} price becomes $40.00 from ${denverToday()}`)
    await expect(d.getByTestId('contract-price-changes')).toContainText(`${second.display_name} price becomes $50.00`)
    await d.getByRole('button', { name: 'Save' }).click()
    await expect(d).toHaveCount(0)

    const [row] = await prices(offer.id)
    expect([Number(row.price_per_sack), row.effective_on, row.note]).toEqual([40, denverToday(), `Contract ${year}`])

    // An open order counts as on order; a receipt as received; an off-contract one not at all.
    const open = await makeOrder(supplier.id, [{ offerId: offer.id, sacks: 6 }])
    const got = await makeOrder(supplier.id, [{ offerId: offer.id, sacks: 12 }])
    await receiveOrder(got, denverToday(), tempTag('C1 lot'))
    const off = await makeOrder(supplier.id, [{ offerId: offer.id, sacks: 3 }], { off_contract: true })
    await receiveOrder(off)
    expect(open.status).toBe('open')

    await page.reload()
    const card = page.getByTestId(/^contract-\d+$/).filter({ hasText: supplier.name })
    await expect(card.getByTestId(`contract-line-${product.id}-on-order`)).toHaveText('6')
    await expect(card.getByTestId(`contract-line-${product.id}-received`)).toHaveText('12')
    await expect(card.getByTestId(`contract-line-${product.id}-remaining`)).toHaveText('over by 2')
    await expect(card.getByTestId(`contract-line-${second.id}-remaining`)).toHaveText('5')

    await page.getByTestId('contracts-view-shortfall').click()
    await expect(page.getByTestId(`shortfall-${second.id}`)).toContainText('5')
    await expect(page.getByTestId(`shortfall-${product.id}`)).toHaveCount(0)
  })
})

test.describe('brewer1', () => {
  test.use({ storageState: authFile('brewer1') })

  test('C2: a brewer reads contracts with no New, Edit or Delete; the API refuses their writes', async ({ page }) => {
    const { product, supplier } = await makePurchasing('C2')
    const mgr = await apiAs('breweryMgr')
    const made = await mgr.post('/api/contracts', { data: { supplier_party_id: supplier.id, year: year + 1, lines: [{ product_id: product.id, sacks: 4, price_per_sack: '41.00' }] } })
    expect(made.status(), await made.text()).toBe(201)
    const id = (await made.json()).data.id as number

    await page.goto(`/ingredients/contracts?year=${year + 1}`)
    await expect(page.getByTestId(`contract-${id}`)).toContainText(supplier.name)
    await expect(page.getByTestId('contracts-new')).toHaveCount(0)
    await expect(page.getByTestId(`contract-${id}-edit`)).toHaveCount(0)
    await expect(page.getByTestId(`contract-${id}-delete`)).toHaveCount(0)

    const api = await apiAs('brewer1')
    expect((await api.post('/api/contracts', { data: { supplier_party_id: supplier.id, year: year + 2, lines: [] } })).status()).toBe(403)
    expect((await api.put(`/api/contracts/${id}`, { data: { notes: 'x' } })).status()).toBe(403)
    expect((await api.delete(`/api/contracts/${id}`)).status()).toBe(403)
  })
})

