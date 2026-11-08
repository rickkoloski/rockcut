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

// D55 §2.10, T12: Ingredient categories → a category → Add Field with Sort
// Order empty saves at the end of the category's fields.
test('T12: a field definition with Sort Order empty is saved at the end', async ({ page }) => {
  const api = await apiAs('owner')
  const tag = tempTag('D55 T12')
  const res = await api.post('/api/ingredient_categories', { data: { name: tag } })
  expect(res.status(), await res.text()).toBe(201)
  const category = (await res.json()).data as { id: number }
  // Deleting the category takes its field definitions with it, or they go first.
  cleanup = async () => {
    const defs = (await (await api.get(`/api/ingredient_categories/${category.id}`)).json()).data?.field_definitions ?? []
    for (const d of defs as { id: number }[]) await api.delete(`/api/category_field_definitions/${d.id}`)
    await api.delete(`/api/ingredient_categories/${category.id}`)
  }
  const first = await api.post('/api/category_field_definitions', {
    data: { category_id: category.id, field_name: 'Attenuation', field_type: 'text', sort_order: 3 },
  })
  expect(first.status(), await first.text()).toBe(201)

  await page.goto(`/ingredients/categories/${category.id}`)
  await page.getByRole('button', { name: 'Add Field' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Field Name').fill('Flocculation')
  await expect(dialog.getByLabel('Sort Order')).toHaveValue('')
  const created = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/api/category_field_definitions'),
  )
  await dialog.getByRole('button', { name: 'Save' }).click()
  expect((await created).status()).toBe(201)
  await expect(dialog).toHaveCount(0)

  // Persist-verify: after a reload it's listed, and stored after the first (3 → 4).
  await page.reload()
  await expect(page.getByText('Flocculation')).toBeVisible()
  const defs = (await (await api.get(`/api/ingredient_categories/${category.id}`)).json()).data.field_definitions as {
    field_name: string
    sort_order: number
  }[]
  expect(defs.map((d) => [d.field_name, d.sort_order])).toEqual([
    ['Attenuation', 3],
    ['Flocculation', 4],
  ])
})

// D55 lead decisions 6, gap 8: Add Category with Sort Order empty (the dialog
// sends null) was a 500. It saves at the end of the categories; clearing Sort
// Order on an existing category moves it to the end too.
test('gap 8: a category with Sort Order empty is saved at the end, on add and on edit', async ({ page }) => {
  const api = await apiAs('owner')
  const tag = tempTag('D55 gap8')
  const made: number[] = []
  cleanup = async () => {
    for (const id of made) await api.delete(`/api/ingredient_categories/${id}`)
  }
  type Cat = { id: number; name: string; sort_order: number }
  const all = async () => (await (await api.get('/api/ingredient_categories')).json()).data as Cat[]

  await page.goto('/ingredients/categories')
  await page.getByTestId('settings-add-button').click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(tag)
  await expect(dialog.getByLabel('Sort Order')).toHaveValue('')
  const created = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/api/ingredient_categories'),
  )
  await dialog.getByRole('button', { name: 'Save' }).click()
  const res = await created
  expect(res.status()).toBe(201)
  const cat = (await res.json()).data as Cat
  made.push(cat.id)
  await expect(dialog).toHaveCount(0)

  // Persist-verify: after a reload it's listed, stored after every other category.
  await page.reload()
  await expect(page.getByText(tag, { exact: true })).toBeVisible()
  let cats = await all()
  let mine = cats.find((c) => c.id === cat.id)!
  for (const c of cats) if (c.id !== cat.id) expect(c.sort_order).toBeLessThan(mine.sort_order)

  // Edit: put it at 0, then clear Sort Order: back to the end.
  expect((await api.put(`/api/ingredient_categories/${cat.id}`, { data: { sort_order: 0 } })).status()).toBe(200)
  await page.goto(`/ingredients/categories/${cat.id}`)
  await page.getByRole('button', { name: 'Edit Category' }).click()
  dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('Sort Order')).toHaveValue('0')
  await dialog.getByLabel('Sort Order').fill('')
  const updated = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && r.url().endsWith(`/api/ingredient_categories/${cat.id}`),
  )
  await dialog.getByRole('button', { name: 'Save' }).click()
  expect((await updated).status()).toBe(200)
  await expect(dialog).toHaveCount(0)

  await page.reload()
  cats = await all()
  mine = cats.find((c) => c.id === cat.id)!
  for (const c of cats) if (c.id !== cat.id) expect(c.sort_order).toBeLessThan(mine.sort_order)
})

// D55 lead decisions 6, gap 10: a brand, recipe, ingredient or batch URL that
// names nothing says "<thing> not found" with a link back, as T10 does for
// categories (it spun forever).
test('gap 10: a missing brand, recipe, ingredient or batch says "not found" with a link back', async ({ page }) => {
  const api = await apiAs('owner')
  const tag = tempTag('D55 gap10')
  const res = await api.post('/api/brands', { data: { name: tag } })
  expect(res.status(), await res.text()).toBe(201)
  const brand = (await res.json()).data as { id: number }
  cleanup = async () => {
    await api.delete(`/api/brands/${brand.id}`)
  }

  for (const [path, testId, text, link, back] of [
    ['/brands/999999', 'brand-not-found', 'Brand not found', 'Back to Brands', /\/brands$/],
    ['/brands/99999999999999999999', 'brand-not-found', 'Brand not found', 'Back to Brands', /\/brands$/],
    ['/brands/abc', 'brand-not-found', 'Brand not found', 'Back to Brands', /\/brands$/],
    [
      `/brands/${brand.id}/recipes/999999`,
      'recipe-not-found',
      'Recipe not found',
      'Back to the brand',
      new RegExp(`/brands/${brand.id}$`),
    ],
    ['/ingredients/999999', 'ingredient-not-found', 'Ingredient not found', 'Back to Ingredients', /\/ingredients$/],
    ['/batches/999999', 'batch-not-found', 'Batch not found', 'Back to Batches', /\/batches$/],
  ] as const) {
    await page.goto(path)
    const box = page.getByTestId(testId)
    await expect(box, path).toContainText(text)
    await box.getByRole('link', { name: link }).click()
    await expect(page).toHaveURL(back)
  }
})
