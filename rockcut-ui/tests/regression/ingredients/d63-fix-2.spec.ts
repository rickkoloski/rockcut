import { test, expect, type Locator, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { adoptIngredient, adoptParty, adoptProduct, apiAs, categoryId, cleanupIngredients, denverToday, tempTag } from './helpers'

// D63 fix cycle 2 (local QA recheck 1): saving a row someone else deleted says
// so in the edit dialog, which stays open with what was typed. [TEST-TEMP] only.

test.use({ storageState: authFile('breweryMgr') })
test.afterEach(cleanupIngredients)

const MISSING = 999_999_999

async function post<T = { id: number }>(path: string, data: Record<string, unknown>, as: 'owner' | 'breweryMgr' = 'breweryMgr'): Promise<T> {
  const res = await (await apiAs(as)).post(path, { data })
  expect(res.status(), await res.text()).toBe(201)
  return (await res.json()).data
}

/** A yeast strain, its Dry product, an offer and (with `lot`) a lot: all its own. */
async function bricks(lot = false) {
  const ingredient = await post('/api/ingredients', { name: tempTag('D63 save'), category_id: await categoryId('yeast') })
  adoptIngredient(ingredient.id)
  const lab = await post('/api/parties', { name: tempTag('D63 Labs'), roles: ['manufacturer', 'supplier'] }, 'owner')
  adoptParty(lab.id)
  const product = await post('/api/ingredient_products', { ingredient_id: ingredient.id, manufacturer_party_id: lab.id, name: tempTag('D63 save'), form: 'Dry', unit: 'each' })
  adoptProduct(product.id)
  const offer = await post('/api/supplier_offers', { product_id: product.id, supplier_party_id: lab.id, pack_name: 'brick', pack_size: '1' })
  if (!lot) return { ingredient, lab, product, offer, lot: null }
  const made = await post<{ id: number; lot_number: string }>('/api/ingredient_lots', {
    product_id: product.id, supplier_party_id: lab.id, pack_name: 'brick', pack_size: '1', lot_number: tempTag('lot'),
    received_date: denverToday(), initial_kind: 'opening', initial_quantity: '6',
  })
  return { ingredient, lab, product, offer, lot: made }
}

const remove = async (path: string) => expect((await (await apiAs('owner')).delete(path)).status(), path).toBe(204)

/** Types a note, deletes the row elsewhere, saves: the sentence, the dialog and the typing. */
async function savesDeleted(page: Page, d: Locator, api: string, noun: string) {
  await expect(d).toBeVisible()
  const notes = d.getByLabel('Notes')
  await notes.fill('typed here')
  await remove(api)
  const put = page.waitForResponse((r) => r.request().method() === 'PUT')
  await d.getByRole('button', { name: /^(Save|Update)/ }).click()
  expect((await put).status()).toBe(404)
  await expect(d).toContainText(`This ${noun} was deleted, so it can't be saved.`)
  await expect(d).not.toContainText('status code')
  await expect(notes).toHaveValue('typed here')
}

for (const [size, use] of [
  ['1366 px', { viewport: { width: 1366, height: 768 } }],
  ['360 px', { viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true }],
] as const) {
  test.describe(size, () => {
    test.use(use)
    test('a product', async ({ page }) => {
      const b = await bricks()
      await remove(`/api/supplier_offers/${b.offer.id}`)
      await page.goto(`/ingredients/products/${b.product.id}`)
      await page.getByTestId('product-edit').click()
      await savesDeleted(page, page.getByRole('dialog'), `/api/ingredient_products/${b.product.id}`, 'product')
    })
  })
}

test('an ingredient', async ({ page }) => {
  const ing = await post('/api/ingredients', { name: tempTag('D63 save'), category_id: await categoryId('yeast') })
  adoptIngredient(ing.id)
  await page.goto(`/ingredients/${ing.id}`)
  await page.getByRole('button', { name: 'Edit Ingredient' }).click()
  await savesDeleted(page, page.getByTestId('ingredient-dialog'), `/api/ingredients/${ing.id}`, 'ingredient')
})

test('an offer', async ({ page }) => {
  const b = await bricks()
  await page.goto(`/ingredients/products/${b.product.id}`)
  await page.getByTestId(`offer-row-${b.offer.id}`).getByRole('button', { name: 'Edit offer' }).click()
  await savesDeleted(page, page.getByTestId('offer-dialog'), `/api/supplier_offers/${b.offer.id}`, 'offer')
})

test("a product's lot", async ({ page }) => {
  const b = await bricks(true)
  await page.goto(`/ingredients/products/${b.product.id}`)
  await page.getByTestId('product-lots').getByText(b.lot!.lot_number).click()
  await savesDeleted(page, page.getByTestId('grain-lot-dialog'), `/api/ingredient_lots/${b.lot!.id}`, 'lot')
})

test('a lot of an ingredient with no products', async ({ page }) => {
  const owner = await apiAs('owner')
  const cat = await post('/api/ingredient_categories', { name: tempTag('D63 cat') }, 'owner')
  try {
    const ing = await post('/api/ingredients', { name: tempTag('D63 save'), category_id: cat.id })
    const lot = await post('/api/ingredient_lots', { ingredient_id: ing.id, lot_number: tempTag('lot'), received_date: denverToday(), status: 'available' })
    await page.goto(`/ingredients/${ing.id}`)
    await page.getByRole('row').filter({ hasText: '[TEST-TEMP] lot' }).click()
    await savesDeleted(page, page.getByTestId('ingredient-lot-dialog'), `/api/ingredient_lots/${lot.id}`, 'lot')
    await remove(`/api/ingredients/${ing.id}`)
  } finally {
    await owner.delete(`/api/ingredient_categories/${cat.id}`)
  }
})

test('a missing supplier, maker, ingredient, category or product named in a save is a 422, never the 404', async () => {
  const b = await bricks(true)
  const api = await apiAs('breweryMgr')
  const product = (await (await api.get(`/api/ingredient_products/${b.product.id}`)).json()).data as { lock_version: number }
  const version = { lock_version: product.lock_version }
  for (const [path, data] of [
    [`/api/ingredient_products/${b.product.id}`, { ...version, manufacturer_party_id: MISSING }],
    [`/api/ingredient_products/${b.product.id}`, { ...version, ingredient_id: MISSING }],
    [`/api/ingredients/${b.ingredient.id}`, { category_id: MISSING }],
    [`/api/ingredients/${b.ingredient.id}`, { yeast_strain_type_id: MISSING }],
    [`/api/supplier_offers/${b.offer.id}`, { supplier_party_id: MISSING }],
    [`/api/supplier_offers/${b.offer.id}`, { product_id: MISSING }],
    [`/api/ingredient_lots/${b.lot!.id}`, { supplier_party_id: MISSING }],
    [`/api/ingredient_lots/${b.lot!.id}`, { product_id: MISSING }],
    [`/api/ingredient_lots/${b.lot!.id}`, { ingredient_id: MISSING }],
  ] as [string, Record<string, unknown>][]) {
    const res = await api.put(path, { data })
    expect.soft(res.status(), `${path} ${JSON.stringify(data)}`).toBe(422)
  }
})
