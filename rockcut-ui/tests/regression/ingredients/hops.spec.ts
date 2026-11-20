import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import {
  BOX,
  adoptProduct,
  apiAs,
  cleanupIngredients,
  denverToday,
  expectLotOnHand,
  expectNoSidewaysScroll,
  expectOnHand,
  expectPhoneDialogClosed,
  getProduct,
  lotsOf,
  makeHopLot,
  makeHopProduct,
  makeHopVariety,
  makeOffer,
  makeOrder,
  makeProduct,
  makeSupplier,
  openDialog,
  pick,
  setQuantityDisplay,
  tempTag,
} from './helpers'

// D62 Stage 2 (spec §9 Hops): a hop product with typical ranges and the
// duplicate refused; a box-only offer; Add lot with crop year and alpha
// (refused without them, a value outside the range marked); Oldest first in
// lb; a mixed order (sacks + boxes) toward the target in packs; receiving
// hops into a new lot; a future-year contract with a hop line in lb; the
// hop pages at 360 px. Every row is `[TEST-TEMP]` (a temp variety from a
// temp company), never the seeded hops.

test.afterAll(cleanupIngredients)

const year = Number(denverToday().slice(0, 4))
const re = (s: string) => new RegExp(s.replace(/[[\]().*+?^$|{}\\]/g, '\\$&'))

/** The Ingredient Library on Hops. */
async function hopsList(page: Page) {
  await page.goto('/ingredients')
  await pick(page, page.locator('body'), 'Category', /^Hops$/)
}

test.describe('brewer1', () => {
  test.use({ storageState: authFile('brewer1') })
  test.beforeEach(async () => setQuantityDisplay('brewer1', 'packs'))

  test('H1: a hop product with form, origin and typical ranges; the same manufacturer + variety + form is refused', async ({ page }) => {
    const { hop, company } = await makeHopVariety('H1')
    await hopsList(page)
    await expect(page.getByTestId('quantity-toggle-packs')).toHaveText('Boxes + lb')
    await expect(page.getByTestId('quantity-toggle-lb')).toHaveText('lb')
    await page.getByTestId('ingredients-add-button').click()
    await page.getByTestId('add-hop-product').click()
    const d = page.getByTestId('product-dialog')
    await expect(d.getByRole('heading', { name: 'Add hop product' })).toBeVisible()
    await pick(page, d, 'Hop', re(hop.name))
    // D62 gap 5: a company with no hop products yet is under "Other manufacturer…".
    await d.getByRole('combobox', { name: 'Manufacturer' }).click()
    await expect(page.getByRole('option', { name: re(company.name) })).toHaveCount(0)
    await page.getByTestId('product-maltster-other').click()
    await page.getByRole('option', { name: re(company.name) }).click()
    await expect(d.getByRole('combobox', { name: 'Manufacturer' })).toHaveText(company.name)
    await expect(d.getByRole('combobox', { name: 'Form' })).toHaveText('T90 Pellet')
    await d.getByTestId('product-origin').fill('USA')
    await d.getByTestId('range-alpha_acid_pct-low').fill('13')
    await d.getByTestId('range-alpha_acid_pct-high').fill('11')
    await expect(d.getByTestId('range-alpha_acid_pct-error')).toHaveText('Alpha acid: low is above high')
    await expect(d.getByRole('button', { name: 'Save' })).toBeDisabled()
    await d.getByTestId('range-alpha_acid_pct-low').fill('11')
    await d.getByTestId('range-alpha_acid_pct-high').fill('13')
    await d.getByTestId('range-beta_acid_pct-low').fill('3.5')
    await d.getByTestId('range-beta_acid_pct-high').fill('4.5')
    await d.getByTestId('range-total_oil_ml_100g-low').fill('2.5')
    await d.getByTestId('range-total_oil_ml_100g-high').fill('3')

    const created = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/ingredient_products'))
    await d.getByRole('button', { name: 'Save' }).click()
    const product = (await (await created).json()).data as { id: number; display_name: string; unit: string }
    adoptProduct(product.id)
    expect(product.display_name).toBe(`${company.name} ${hop.name} T90 Pellet`)
    expect(product.unit).toBe('lb')
    await expect(page).toHaveURL(new RegExp(`/ingredients/products/${product.id}$`))
    await expect(page.getByTestId('product-item')).toHaveText(`${hop.name} · T90 Pellet · USA`)
    await expect(page.getByTestId('product-spec-alpha_acid_pct')).toHaveText('11–13 %')
    await expect(page.getByTestId('product-spec-total_oil_ml_100g')).toHaveText('2.5–3 mL/100 g')

    // The list: variety, manufacturer, form, origin, ranges.
    await hopsList(page)
    const row = page.getByTestId(`hop-row-${product.id}`)
    await expect(row).toContainText('T90 Pellet')
    await expect(row).toContainText('USA')
    await expect(row).toContainText('11–13')
    await expect(row).toContainText('3.5–4.5')

    // The same manufacturer, variety and form again: refused.
    await page.getByTestId('ingredients-add-button').click()
    await page.getByTestId('add-hop-product').click()
    await pick(page, d, 'Hop', re(hop.name))
    await pick(page, d, 'Manufacturer', re(company.name))
    await d.getByRole('button', { name: 'Save' }).click()
    // D62 gap 1: the API's sentence alone, no "ingredient id:".
    await expect(d.getByRole('alert')).toHaveText(`${company.name} already has T90 Pellet ${hop.name}.`)
    await d.getByRole('button', { name: 'Cancel' }).click()
  })

  test('H2: a hop offer is box · 11 lb, not editable; $165.00 a box is $15.00/lb', async ({ page }) => {
    const product = await makeHopProduct('H2')
    const supplier = await makeSupplier('H2 supplier')
    await page.goto(`/ingredients/products/${product.id}`)
    const d = await openDialog(page, page.getByTestId('product-add-offer'), 'offer-dialog')
    await pick(page, d, 'Supplier', re(supplier.name))
    await expect(d.getByTestId('offer-pack-fixed')).toHaveValue('box · 11 lb')
    await expect(d.getByTestId('offer-pack-fixed')).toBeDisabled()
    await expect(d.getByTestId('offer-pack-size')).toHaveCount(0)
    const created = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/supplier_offers'))
    await d.getByRole('button', { name: 'Save' }).click()
    const offer = (await (await created).json()).data as { id: number; pack_name: string; pack_size: string }
    expect([offer.pack_name, Number(offer.pack_size)]).toEqual(['box', BOX])
    await expect(d).toHaveCount(0)

    const api = await apiAs('brewer1')
    expect((await api.post(`/api/supplier_offers/${offer.id}/prices`, { data: { price_per_pack: '165.00', effective_on: '2020-01-01' } })).status()).toBe(201)
    // The API refuses any other pack.
    const res = await api.put(`/api/supplier_offers/${offer.id}`, { data: { pack_size: '22' } })
    expect(res.status()).toBe(422)
    expect((await res.json()).errors.base).toEqual(['Hop offers are 11 lb boxes'])

    await page.reload()
    await expect(page.getByTestId(`offer-pack-${offer.id}`)).toHaveText('box · 11 lb')
    await expect(page.getByTestId(`offer-price-${offer.id}`)).toHaveText('$165.00')
    await expect(page.getByTestId(`offer-row-${offer.id}`)).toContainText('$15.0000')
  })

  test('H4: Used in brewing, 6.5 lb Oldest first across two lots; Total reads 37.5 lb', async ({ page }) => {
    const product = await makeHopProduct('H4')
    const older = await makeHopLot(product, '4', 30)
    const newer = await makeHopLot(product, '40', 3)
    await page.goto(`/ingredients/products/${product.id}`)
    await expect(page.getByTestId('product-on-hand')).toHaveText('4 boxes')
    await page.getByTestId('product-record-movement').click()
    const d = page.getByTestId('movement-dialog')
    await d.getByTestId('movement-quantity-lb').fill('6.5')
    await d.getByRole('button', { name: 'Save' }).click()
    await expect(d).toHaveCount(0)
    await expectOnHand(product.id, 37.5)
    await expectLotOnHand(older.id, product.id, 0)
    await expectLotOnHand(newer.id, product.id, 37.5)
    await expect(page.getByTestId('product-on-hand')).toHaveText('3 boxes 4.5 lb')
    await page.getByTestId('quantity-toggle-lb').click()
    await expect(page.getByTestId('product-on-hand')).toHaveText('37.5 lb')
  })

  test('H5: a mixed order, 30 sacks + 6 boxes, reads "36 of 40 packs"; receiving hops into a new lot asks for crop year and alpha', async ({ page }) => {
    const supplier = await makeSupplier('H5 supplier')
    const grain = await makeProduct('H5 grain')
    await makeOffer(grain, supplier.id)
    const hops = await makeHopProduct('H5')
    const api = await apiAs('brewer1')
    const hopOffer = (await (await api.post('/api/supplier_offers', { data: { product_id: hops.id, supplier_party_id: supplier.id } })).json()).data as { id: number }
    await api.post(`/api/supplier_offers/${hopOffer.id}/prices`, { data: { price_per_pack: '165.00', effective_on: '2020-01-01' } })

    await page.goto('/ingredients/orders')
    const d = await openDialog(page, page.getByTestId('orders-new'), 'order-dialog')
    // The supplier's offers load after it's picked; the Offer menu re-renders when they land.
    const offersIn = page.waitForResponse((r) => r.url().includes('/api/supplier_offers') && r.url().includes(`supplier_id=${supplier.id}`))
    await pick(page, d, 'Supplier', re(supplier.name))
    await offersIn
    await pick(page, d.getByTestId('order-line-0'), 'Offer', /H5 grain/)
    await d.getByTestId('order-line-0-packs').fill('30')
    await expect(d.getByTestId('order-target-progress')).toHaveText('30 of 40 sacks')
    await d.getByTestId('order-add-line').click()
    await pick(page, d.getByTestId('order-line-1'), 'Offer', /H5 hop/)
    await d.getByTestId('order-line-1-packs').fill('6')
    await expect(d.getByTestId('order-target-progress')).toHaveText('36 of 40 packs')
    const created = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/purchase_orders'))
    await d.getByRole('button', { name: 'Save' }).click()
    const id = (await (await created).json()).data.id as number
    await expect(page.getByTestId('order-page-target')).toHaveText('36 of 40 packs')

    // Receive: the hop line goes to a new lot, which needs its crop year and alpha.
    const r = await openDialog(page, page.getByTestId('order-receive'), 'receive-dialog')
    const hopLine = r.getByTestId(/^receive-line-\d+$/).filter({ hasText: 'H5 hop' })
    const grainLine = r.getByTestId(/^receive-line-\d+$/).filter({ hasText: 'H5 grain' })
    await pick(page, grainLine, 'Goes to', 'New lot #')
    await grainLine.getByLabel('Lot #').fill(tempTag('H5 grain lot'))
    await pick(page, hopLine, 'Goes to', 'New lot #')
    const number = tempTag('H5 hop lot')
    await hopLine.getByLabel('Lot #').fill(number)
    await expect(hopLine.getByTestId(/crop-year$/)).toHaveValue(String(year))
    await expect(hopLine.getByTestId('feature-alpha_acid_pct')).toHaveValue('')
    await expect(r.getByRole('button', { name: 'Receive' })).toBeDisabled()
    await hopLine.getByTestId('feature-alpha_acid_pct').fill('12.25')
    await hopLine.getByTestId(/crop-year$/).fill('2025')
    await r.getByRole('button', { name: 'Receive' }).click()
    await expect(r).toHaveCount(0)

    const [lot] = await lotsOf(hops.id)
    expect(lot.lot_number).toBe(number)
    const full = (await (await api.get(`/api/ingredient_lots/${lot.id}`)).json()).data as { crop_year: number; pack_name: string; on_hand: string; features: Record<string, { value: string }> }
    expect([full.crop_year, full.pack_name, Number(full.on_hand), Number(full.features.alpha_acid_pct.value)]).toEqual([2025, 'box', 6 * BOX, 12.25])
    expect((await (await api.get(`/api/purchase_orders/${id}`)).json()).data.status).toBe('received')
  })
})

test.describe('brewer2', () => {
  test.use({ storageState: authFile('brewer2') })
  test.beforeEach(async () => setQuantityDisplay('brewer2', 'packs'))

  test('H3: Add lot needs crop year and alpha; 14.1 is outside 11–13 and is marked, not refused; 4 boxes are 44 lb', async ({ page }) => {
    const product = await makeHopProduct('H3')
    await page.goto(`/ingredients/products/${product.id}`)
    const d = await openDialog(page, page.getByTestId('product-add-lot'), 'add-lot-dialog')
    await expect(d.getByTestId('lot-pack-fixed')).toHaveValue('box · 11 lb')
    await expect(d.getByTestId('lot-crop-year')).toHaveValue(String(year))
    await d.getByTestId('lot-number').fill(tempTag('H3'))
    await d.getByTestId('lot-quantity-packs').fill('4')
    await expect(d.getByText('typical 11–13')).toBeVisible()

    // Without alpha, refused before it's sent; without a crop year, Save waits.
    const posts: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith('/api/ingredient_lots')) posts.push(r.url())
    })
    await d.getByRole('button', { name: 'Save' }).click()
    await expect(d.getByRole('alert')).toHaveText('Enter the alpha acid')
    await d.getByTestId('lot-crop-year').fill('')
    await expect(d.getByText('Enter the crop year')).toBeVisible()
    await expect(d.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(posts).toHaveLength(0)

    await d.getByTestId('lot-crop-year').fill('2025')
    await d.getByTestId('feature-alpha_acid_pct').fill('14.1')
    await expect(d.getByTestId('feature-alpha_acid_pct-outside')).toHaveText('outside typical 11–13')
    await d.getByRole('button', { name: 'Save' }).click()
    await expect(d).toHaveCount(0)

    const [lot] = await lotsOf(product.id)
    await expect(page.getByTestId(`lot-crop-year-${lot.id}`)).toHaveText('2025')
    await expect(page.getByTestId(`lot-${lot.id}-alpha_acid_pct-outside`)).toContainText('14.10')
    await expect(page.getByTestId(`lot-on-hand-${lot.id}`)).toHaveText('4 boxes')
    await expect(page.getByTestId('product-on-hand')).toHaveText('4 boxes')
    expect(Number((await getProduct(product.id)).on_hand)).toBe(44)
  })
})

test.describe('breweryMgr', () => {
  test.use({ storageState: authFile('breweryMgr') })

  test('H6: a future-year contract with a hop line in lb at $/lb; the offer price is × 11 from Jan 1', async ({ page }) => {
    const supplier = await makeSupplier('H6 supplier')
    const hops = await makeHopProduct('H6')
    const api = await apiAs('brewer1')
    const offer = (await (await api.post('/api/supplier_offers', { data: { product_id: hops.id, supplier_party_id: supplier.id } })).json()).data as { id: number }
    await api.post(`/api/supplier_offers/${offer.id}/prices`, { data: { price_per_pack: '165.00', effective_on: '2020-01-01' } })
    const next = year + 1

    await page.goto('/ingredients/contracts')
    const d = await openDialog(page, page.getByTestId('contracts-new'), 'contract-dialog')
    await pick(page, d, 'Supplier', re(supplier.name))
    await d.getByTestId('contract-year').fill(String(next))
    await pick(page, d.getByTestId('contract-line-0'), 'Product', /H6 hop/)
    // The box price ÷ 11 starts the $/lb.
    await expect(d.getByTestId('contract-line-0-price')).toHaveValue('15')
    await d.getByTestId('contract-line-0-quantity').fill('440')
    await d.getByTestId('contract-line-0-price').fill('14.50')
    await expect(d.getByTestId('contract-line-0')).toContainText('440 lb = 40 boxes')
    await expect(d.getByTestId('contract-line-0')).toContainText('$159.50 / box')
    await expect(d.getByTestId('contract-price-changes')).toContainText(`price becomes $159.50 from ${next}-01-01`)
    await d.getByRole('button', { name: 'Save' }).click()
    await expect(d).toHaveCount(0)

    const prices = (await (await api.get(`/api/supplier_offers/${offer.id}/prices`)).json()).data as { price_per_pack: string; effective_on: string; note: string }[]
    expect(prices.map((p) => [Number(p.price_per_pack), p.effective_on, p.note])).toContainEqual([159.5, `${next}-01-01`, `Contract ${next}`])

    await page.goto(`/ingredients/contracts?year=${next}`)
    const card = page.getByTestId(/^contract-\d+$/).filter({ hasText: supplier.name })
    await expect(card.getByTestId(`contract-line-${hops.id}-remaining`)).toHaveText('440 lb')
    await expect(card).toContainText('$14.50')
    // An order of 10 boxes is 110 lb on order.
    await makeOrder(supplier.id, [{ offerId: offer.id, packs: 10 }], { expected_on: `${next}-02-01` })
    await page.reload()
    await expect(card.getByTestId(`contract-line-${hops.id}-on-order`)).toHaveText('110 lb')
  })
})

test.describe('brewer1 at 360 px', () => {
  test.use({ storageState: authFile('brewer1'), viewport: { width: 360, height: 780 } })

  test('H7: the Hops list as cards, the hop product page and Add lot have no sideways scroll', async ({ page }) => {
    const product = await makeHopProduct('H7')
    await makeHopLot(product, '22', 2, '14.1')
    await hopsList(page)
    await expect(page.getByTestId(`hop-card-${product.id}`)).toContainText('α 11–13 %')
    await expectNoSidewaysScroll(page)
    await page.getByTestId(`hop-card-${product.id}`).click()
    await expect(page).toHaveURL(new RegExp(`/ingredients/products/${product.id}$`))
    await expect(page.getByTestId('product-on-hand')).toHaveText('2 boxes')
    await expectNoSidewaysScroll(page)
    const d = await openDialog(page, page.getByTestId('product-add-lot'), 'add-lot-dialog')
    await expect(d.getByTestId('lot-crop-year')).toBeVisible()
    await expectNoSidewaysScroll(page)
    await d.getByRole('button', { name: 'Cancel' }).click()
    await expectPhoneDialogClosed(page, d)
  })
})
