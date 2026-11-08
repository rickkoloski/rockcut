import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs, tempTag } from '../scheduler/helpers'

// D55 §2.5 (task 4981), T9: Recipe → Grain Bill → Add Ingredient with Sort
// Order empty saves at the end of the list. §2.6 (task 4993), T10: a category
// that doesn't exist says "Category not found" with a link back.
test.use({ storageState: authFile('breweryMgr') })

let cleanup: (() => Promise<void>) | null = null
test.afterEach(async () => {
  await cleanup?.()
  cleanup = null
})

test('T9: an ingredient with Sort Order empty is saved at the end of the grain bill', async ({ page }) => {
  const api = await apiAs('owner')
  const tag = tempTag('D55 T9')
  const post = async (path: string, data: Record<string, unknown>) => {
    const res = await api.post(path, { data })
    expect(res.status(), await res.text()).toBe(201)
    return (await res.json()).data as { id: number }
  }
  const brand = await post('/api/brands', { name: tag })
  const recipe = await post('/api/recipes', { brand_id: brand.id, batch_size: 15 })
  const category = await post('/api/ingredient_categories', { name: tag })
  const malt = await post('/api/ingredients', { name: `${tag} Pils`, category_id: category.id })
  const lot = await post('/api/ingredient_lots', { ingredient_id: malt.id, lot_number: 'T9-1' })
  await post('/api/recipe_ingredients', { recipe_id: recipe.id, lot_id: lot.id, amount: 5, unit: 'lb', sort_order: 4 })
  // Restricted foreign keys: the recipe (its ingredients go with it), then the
  // brand, the lot, the ingredient and the category.
  cleanup = async () => {
    await api.delete(`/api/recipes/${recipe.id}`)
    await api.delete(`/api/brands/${brand.id}`)
    await api.delete(`/api/ingredient_lots/${lot.id}`)
    await api.delete(`/api/ingredients/${malt.id}`)
    await api.delete(`/api/ingredient_categories/${category.id}`)
  }

  await page.goto(`/brands/${brand.id}/recipes/${recipe.id}`)
  await page.getByRole('tab', { name: 'Grain Bill' }).click()
  await page.getByRole('button', { name: 'Add Ingredient' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Category').click()
  await page.getByRole('option', { name: tag, exact: true }).click()
  await dialog.getByLabel('Ingredient').click()
  await page.getByRole('option', { name: `${tag} Pils` }).click()
  await dialog.getByLabel('Lot').click()
  await page.getByRole('option', { name: /T9-1/ }).click()
  await dialog.getByLabel('Amount').fill('10')
  await dialog.getByLabel('Unit').fill('lb')
  await expect(dialog.getByLabel('Sort Order')).toHaveValue('')

  const created = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/recipe_ingredients'))
  await dialog.getByRole('button', { name: 'Save' }).click()
  expect((await created).status()).toBe(201)
  await expect(dialog).toHaveCount(0)

  // Persist-verify: after a reload, the new one is after the first (4 → 5).
  await page.reload()
  const rows = (await (await api.get('/api/recipe_ingredients', { params: { recipe_id: recipe.id } })).json()).data as {
    amount: string | number
    sort_order: number
  }[]
  expect(rows.map((r) => [Number(r.amount), r.sort_order])).toEqual([
    [5, 4],
    [10, 5],
  ])
})

test('T10: a missing ingredient category says "Category not found" with a link back', async ({ page }) => {
  for (const path of ['/ingredients/categories/999999', '/settings/categories/999999']) {
    await page.goto(path)
    const box = page.getByTestId('category-not-found')
    await expect(box).toContainText('Category not found')
    await box.getByRole('link', { name: 'Back to Ingredient categories' }).click()
    await expect(page).toHaveURL(/\/ingredients\/categories$/)
  }
})
