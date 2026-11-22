import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs, cleanupIngredients, denverToday, makeD65Ingredient, makeD65Product, makeOffer, makeProduct, makeSupplier, openDialog, pick, setQuantityDisplay } from './helpers'

// D65 lead decisions 4 (DEV QA recheck 1, gap 7): before any line has an offer, New order and
// Edit order count in "packs" ("0 of 40 packs"), not "sacks"; a supplier whose offers are all
// sacks keeps D61's "sacks". Gap 8 is the API's (`d65_fix4_test.exs`). Every row is `[TEST-TEMP]`.

test.use({ storageState: authFile('brewer1') })
test.beforeEach(async () => setQuantityDisplay('brewer1', 'packs'))
test.afterAll(cleanupIngredients)

async function ok<T>(res: { status: () => number; text: () => Promise<string>; json: () => Promise<{ data: T }> }, status = 201): Promise<T> {
  expect(res.status(), await res.text()).toBe(status)
  return (await res.json()).data
}

test('gap 7: no offer picked yet reads "0 packs" and "0 of 40 packs" (no supplier, mixed supplier, Edit order); a sacks-only supplier keeps "sacks"', async ({ page }) => {
  const mixed = await makeSupplier('Empty mixed', 40)
  const api = await apiAs('brewer1')
  const puree = await makeD65Product((await makeD65Ingredient('Empty Mango', 'fruits')).id, 'Purée', 'gal')
  const pail = await ok<{ id: number }>(await api.post('/api/supplier_offers', { data: { product_id: puree.id, supplier_party_id: mixed.id, pack_name: 'pail', pack_size: '5' } }))
  await ok(await api.post(`/api/supplier_offers/${pail.id}/prices`, { data: { price_per_pack: '116.50', effective_on: '2020-01-01' } }))
  await makeOffer(await makeProduct('Empty Grain'), mixed.id)

  await page.goto('/ingredients/orders')
  const d = await openDialog(page, page.getByTestId('orders-new'), 'order-dialog')
  await expect(d.getByTestId('order-running-total')).toHaveText('0 packs · 0 lb · $0.00')
  await pick(page, d, 'Supplier', mixed.name)
  await expect(d.getByTestId('order-running-total')).toHaveText('0 packs · 0 lb · $0.00')
  await expect(d.getByTestId('order-target-progress')).toHaveText('0 of 40 packs')
  // A pick still counts the line's own pack (gap 6).
  await pick(page, d, 'Offer', /pail · 5 gal/)
  await expect(d.getByTestId('order-running-total')).toHaveText('0 pails · 0 gal · $0.00')
  await expect(d.getByTestId('order-target-progress')).toHaveText('0 of 40 pails')
  await d.getByRole('button', { name: 'Cancel' }).click()
  await expect(d).toHaveCount(0)

  // Edit order: add an empty line, remove the one with its offer.
  const order = await ok<{ id: number }>(await api.post('/api/purchase_orders', { data: { supplier_party_id: mixed.id, ordered_on: denverToday(), lines: [{ offer_id: pail.id, packs_ordered: 2 }] } }))
  await page.goto(`/ingredients/orders/${order.id}`)
  const e = await openDialog(page, page.getByTestId('order-edit'), 'order-dialog')
  await e.getByTestId('order-add-line').click()
  await e.getByTestId('order-line-0-remove').click()
  await expect(e.getByTestId('order-running-total')).toHaveText('0 packs · 0 lb · $0.00')
  await expect(e.getByTestId('order-target-progress')).toHaveText('0 of 40 packs')
  await e.getByRole('button', { name: 'Cancel' }).click()
  await expect(e).toHaveCount(0)

  // A supplier with sacks only: D61's words.
  const grain = await makeSupplier('Empty sacks', 40)
  await makeOffer(await makeProduct('Empty Sack Grain'), grain.id)
  await page.goto('/ingredients/orders')
  const g = await openDialog(page, page.getByTestId('orders-new'), 'order-dialog')
  await pick(page, g, 'Supplier', grain.name)
  await expect(g.getByTestId('order-running-total')).toHaveText('0 sacks · 0 lb · $0.00')
  await expect(g.getByTestId('order-target-progress')).toHaveText('0 of 40 sacks')
})
