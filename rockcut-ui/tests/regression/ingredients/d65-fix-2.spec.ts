import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import {
  apiAs,
  categoryId,
  cleanupIngredients,
  denverToday,
  expectNoSidewaysScroll,
  expectPhoneDialogClosed,
  makeD65Ingredient,
  makeD65Product,
  makeSupplier,
  openDialog,
  pick,
  setQuantityDisplay,
} from './helpers'

// D65 lead decisions 2 (QA recheck 1 leftovers): the order line's pack reads
// "tubs of 872 tablets (5 lb)" (gap 8); a disabled Delete keeps its name and
// is described by its reason (gap 14); a negative or 0 tablet count says
// "Enter at least 1 tablet" as it's typed (gap 16). Gap 15 is the API's
// (`d65_fix2_test.exs`). Every row is `[TEST-TEMP]`.

test.use({ storageState: authFile('brewer1') })
test.beforeEach(async () => setQuantityDisplay('brewer1', 'packs'))
test.afterAll(cleanupIngredients)

async function ok<T>(res: { status: () => number; text: () => Promise<string>; json: () => Promise<{ data: T }> }, status = 201): Promise<T> {
  expect(res.status(), await res.text()).toBe(status)
  return (await res.json()).data
}

/** An offer through the API, with a price from long ago. */
async function offer(productId: number, supplierId: number, pack: string, size: string, packNote: string | null = null): Promise<{ id: number }> {
  const api = await apiAs('brewer1')
  const o = await ok<{ id: number }>(await api.post('/api/supplier_offers', { data: { product_id: productId, supplier_party_id: supplierId, pack_name: pack, pack_size: size, pack_note: packNote } }))
  await ok(await api.post(`/api/supplier_offers/${o.id}/prices`, { data: { price_per_pack: '50.00', effective_on: '2020-01-01' } }))
  return o
}

async function tabletProduct(label: string) {
  const ingredient = await makeD65Ingredient(label, 'Process Aids')
  const product = await makeD65Product(ingredient.id, 'Tablet', 'each')
  const supplier = await makeSupplier(`${label} supplier`, null)
  return { ingredient, product, supplier }
}

test('gap 8: the order line reads "tubs of 872 tablets (5 lb)" in New order and in the order edit dialog', async ({ page }) => {
  const { product, supplier } = await tabletProduct('Order Tabs')
  const tub = await offer(product.id, supplier.id, 'tub', '872', '5 lb')
  await page.goto('/ingredients/orders')
  const d = await openDialog(page, page.getByTestId('orders-new'), 'order-dialog')
  await pick(page, d, 'Supplier', supplier.name)
  await pick(page, d, 'Offer', /tub · 872/)
  await expect(d.getByTestId('order-line-0')).toContainText('tubs of 872 tablets (5 lb)')
  await expect(d.getByTestId('order-line-0')).not.toContainText('872 tablets tubs')
  await d.getByRole('button', { name: 'Cancel' }).click()
  await expectPhoneDialogClosed(page, d)

  const order = await ok<{ id: number }>(
    await (await apiAs('brewer1')).post('/api/purchase_orders', { data: { supplier_party_id: supplier.id, ordered_on: denverToday(), lines: [{ offer_id: tub.id, packs_ordered: 2 }] } }),
  )
  await page.goto(`/ingredients/orders/${order.id}`)
  const edit = await openDialog(page, page.getByTestId('order-edit'), 'order-dialog')
  await expect(edit.getByTestId('order-line-0')).toContainText('tubs of 872 tablets (5 lb)')
})

test('gap 14: a disabled Delete keeps its name and is described by its reason, on an ingredient and on a category', async ({ page }) => {
  const { ingredient } = await tabletProduct('Named Delete')
  await page.goto(`/ingredients/${ingredient.id}`)
  const del = page.getByRole('button', { name: 'Delete Ingredient' })
  await expect(del).toBeDisabled()
  await expect(del).toHaveAccessibleDescription(`${ingredient.name} has products; deactivate them instead`)
  // The tooltip says the reason too.
  await page.getByTestId('ingredient-delete').locator('..').hover()
  await expect(page.getByRole('tooltip')).toHaveText(`${ingredient.name} has products; deactivate them instead`)

  // The seeded Process Aids category has ingredients, so its Delete is disabled the same way (read only).
  await page.goto(`/ingredients/categories/${await categoryId('Process Aids')}`)
  const delCategory = page.getByRole('button', { name: 'Delete Category' })
  await expect(delCategory).toBeDisabled()
  const reason = await page.getByTestId('category-delete-reason').textContent()
  expect(reason).toBeTruthy()
  await expect(delCategory).toHaveAccessibleDescription(reason!)
})

for (const size of [
  { name: 'desktop', width: 1366, height: 768 },
  { name: '360 px', width: 360, height: 740 },
]) {
  test(`gap 16 (${size.name}): −1 or 0 tablets says "Enter at least 1 tablet" as it's typed in Add lot and Record movement; Count and gal keep "Enter 0 or more"`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height })
    const { product, supplier } = await tabletProduct('Minus Tabs')
    await offer(product.id, supplier.id, 'tub', '333')
    await page.goto(`/ingredients/products/${product.id}`)

    const d = await openDialog(page, page.getByTestId('product-add-lot'), 'add-lot-dialog')
    await pick(page, d, /Supplier offer/, /tub · 333/)
    const save = d.getByRole('button', { name: 'Save' })
    for (const [box, typed] of [
      ['lot-quantity-lb', '-1'],
      ['lot-quantity-lb', '0'],
      ['lot-quantity-packs', '-1'],
      ['lot-quantity-packs', '0'],
    ]) {
      await d.getByTestId(box).fill(typed)
      await expect(d.getByText('Enter at least 1 tablet'), `${box} ${typed}`).toBeVisible()
      await expect(d.getByText('Enter 0 or more')).toHaveCount(0)
      await expect(save).toBeDisabled()
      await d.getByTestId(box).fill('')
    }
    if (size.width === 360) await expectNoSidewaysScroll(page)
    await d.getByRole('button', { name: 'Cancel' }).click()
    await expectPhoneDialogClosed(page, d)

    // A lot to move from, then Record movement.
    await ok(
      await (
        await apiAs('brewer1')
      ).post('/api/ingredient_lots', {
        data: { product_id: product.id, supplier_party_id: supplier.id, pack_name: 'tub', pack_size: '333', received_date: denverToday(), initial_kind: 'opening', initial_quantity: '333' },
      }),
    )
    await page.reload()
    const move = await openDialog(page, page.getByTestId('product-record-movement'), 'movement-dialog')
    await move.getByTestId('movement-quantity-lb').fill('-1')
    await expect(move.getByText('Enter at least 1 tablet')).toBeVisible()
    await expect(move.getByRole('button', { name: 'Save' })).toBeDisabled()
    await move.getByTestId('movement-quantity-lb').fill('0')
    await expect(move.getByText('Enter at least 1 tablet')).toBeVisible()
    await expect(move.getByRole('button', { name: 'Save' })).toBeDisabled()
    await move.getByRole('button', { name: 'Cancel' }).click()
    await expectPhoneDialogClosed(page, move)

    // Count takes 0 (counted none), so a minus keeps "Enter 0 or more" and 0 is no refusal.
    const count = await openDialog(page, page.getByTestId('product-count'), 'count-dialog')
    await count.getByTestId('count-total-lb').fill('-1')
    await expect(count.getByText('Enter 0 or more')).toBeVisible()
    await count.getByTestId('count-total-lb').fill('0')
    await expect(count.getByText('Enter 0 or more')).toHaveCount(0)
    await expect(count.getByText('Enter at least 1 tablet')).toHaveCount(0)
    await expect(count.getByRole('button', { name: 'Save' })).toBeEnabled()
    await count.getByRole('button', { name: 'Cancel' }).click()
    await expectPhoneDialogClosed(page, count)

    // A decimal unit keeps its words for a minus.
    const fruit = await makeD65Ingredient('Minus Mango', 'fruits')
    const puree = await makeD65Product(fruit.id, 'Purée', 'gal')
    await page.goto(`/ingredients/products/${puree.id}`)
    const gal = await openDialog(page, page.getByTestId('product-add-lot'), 'add-lot-dialog')
    await gal.getByTestId('lot-quantity-lb').fill('-1')
    await expect(gal.getByText('Enter 0 or more')).toBeVisible()
    await expect(gal.getByText(/Enter at least/)).toHaveCount(0)
  })
}
