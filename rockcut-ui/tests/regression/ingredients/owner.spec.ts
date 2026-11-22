import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { adoptParty, apiAs, cleanupIngredients, reference, tempTag } from './helpers'

// D60 spec §9, as `owner`: a company with two roles on the Companies page; a
// company in use can't be deleted ("deactivate instead"); Settings →
// Categories: Grains' five children and no Origin/Maltster fields. D61
// carry-over 2 and 5: Delete disabled with the reason for a company or
// category in use; no Add field on Grains and its children.

test.use({ storageState: authFile('owner') })
test.afterAll(cleanupIngredients)

test('O1: add a maltster + supplier company; Rahr (in use) has Delete disabled with the reason; an unused company can be deleted', async ({ page }) => {
  const name = tempTag('Weyermann')
  const { rahr } = await reference()
  await page.goto('/ingredients/companies')
  // The first list has loaded, so the next GET is the refetch after the save.
  await expect(page.getByTestId(`company-${rahr}`).first()).toBeVisible()
  await page.getByTestId('companies-add').click()
  const d = page.getByTestId('party-dialog')
  await d.getByTestId('party-name').fill(name)
  await d.getByTestId('party-role-manufacturer').check()
  await d.getByTestId('party-role-supplier').check()
  const created = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/parties'))
  // DEV decisions 4 (O1): the new row shows once the list refetch lands, which
  // can take over 5 s on DEV under the full run; wait on that response, not a timer.
  const listed = page.waitForResponse((r) => r.request().method() === 'GET' && r.url().endsWith('/api/parties'), { timeout: 30_000 })
  await d.getByRole('button', { name: 'Save' }).click()
  const id = (await (await created).json()).data.id as number
  adoptParty(id)
  await expect(d).toHaveCount(0)
  await listed
  await expect(page.getByTestId(`party-${id}-role-manufacturer`)).toHaveText('Manufacturer')
  await expect(page.getByTestId(`party-${id}-role-supplier`)).toHaveText('Supplier')
  const party = (await (await (await apiAs('owner')).get(`/api/parties/${id}`)).json()).data
  expect([...party.roles].sort()).toEqual(['manufacturer', 'supplier'])

  const blocked = (await (await (await apiAs('owner')).get(`/api/parties/${rahr}`)).json()).data.delete_blocked as string
  expect(blocked).toMatch(/^This company has products.*; deactivate it instead$/)
  await page.getByTestId(`company-${rahr}`).first().click()
  await expect(d.getByTestId('party-delete')).toBeDisabled()
  await expect(d.getByTestId('party-delete-reason')).toHaveText(blocked)
  await d.getByRole('button', { name: 'Cancel' }).click()
  await expect(d).toHaveCount(0)
  // The API still refuses.
  expect((await (await apiAs('owner')).delete(`/api/parties/${rahr}`)).status()).toBe(422)

  await page.getByTestId(`company-${id}`).first().click()
  await expect(d.getByTestId('party-delete-reason')).toHaveCount(0)
  await page.getByTestId('party-delete').click()
  // Gap 2: Delete asks first; Cancel there leaves the company alone.
  const confirm = page.getByTestId('party-delete-confirm')
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(confirm).toHaveCount(0)
  await page.getByTestId('party-delete').click()
  await confirm.getByRole('button', { name: 'Delete' }).click()
  await expect(d).toHaveCount(0)
  await expect(page.getByTestId(`company-${id}`)).toHaveCount(0)
  expect((await (await apiAs('owner')).get(`/api/parties/${id}`)).status()).toBe(404)
})

test('O2: Settings → Categories: Grains shows its five children; no Origin or Maltster field; no Add field on Grains or a child', async ({ page }) => {
  const categories = (await (await (await apiAs('owner')).get('/api/ingredient_categories')).json()).data as { id: number; name: string }[]
  const grains = categories.find((c) => c.name === 'Grains')!
  await page.goto('/ingredients/categories')
  await page.getByText('Grains', { exact: true }).first().click()
  await expect(page).toHaveURL(new RegExp(`/ingredients/categories/${grains.id}$`))
  const children = page.getByTestId('category-children').getByRole('button')
  await expect(children).toHaveText(['Base', 'Crystal/Caramel', 'Kilned', 'Specialty', 'Roasted'])
  await expect(page.getByRole('heading', { name: 'Field Definitions' })).toBeVisible()
  const grid = page.getByRole('grid')
  await expect(grid).toBeVisible()
  await expect(grid.getByText('Origin', { exact: true })).toHaveCount(0)
  await expect(grid.getByText('Maltster', { exact: true })).toHaveCount(0)
  await expect(page.getByTestId('category-add-field')).toHaveCount(0)
  await expect(page.getByTestId('category-grain-fields-note')).toBeVisible()
  // Grains has children: Delete is disabled with the reason.
  await expect(page.getByTestId('category-delete')).toBeDisabled()
  await expect(page.getByTestId('category-delete-reason')).toHaveText('This category has sub-categories; move or delete them first')

  const base = categories.find((c) => c.name === 'Base')!
  await page.goto(`/ingredients/categories/${base.id}`)
  await expect(page.getByRole('heading', { name: 'Field Definitions' })).toBeVisible()
  await expect(page.getByTestId('category-add-field')).toHaveCount(0)
  // The API refuses one too.
  const res = await (await apiAs('owner')).post('/api/category_field_definitions', { data: { category_id: base.id, field_name: tempTag('O2'), field_type: 'text' } })
  expect(res.status()).toBe(422)

  // D62 §3.1: Hops has features now, no custom fields; a category still on the old screens has Add field.
  const hops = categories.find((c) => c.name === 'Hops')
  if (hops) {
    await page.goto(`/ingredients/categories/${hops.id}`)
    await expect(page.getByRole('heading', { name: 'Field Definitions' })).toBeVisible()
    await expect(page.getByTestId('category-add-field')).toHaveCount(0)
  }
  // D65 A9: Fruits takes none either now; D64 §4.1: nor does Yeast Strains. Other Consumables still does.
  const yeast = categories.find((c) => c.name === 'Yeast Strains')!
  await page.goto(`/ingredients/categories/${yeast.id}`)
  await expect(page.getByTestId('category-grain-fields-note')).toBeVisible()
  await expect(page.getByTestId('category-add-field')).toHaveCount(0)
  const consumables = categories.find((c) => c.name === 'Other Consumables')!
  await page.goto(`/ingredients/categories/${consumables.id}`)
  await expect(page.getByTestId('category-add-field')).toBeVisible()
  const fruits = categories.find((c) => c.name === 'Fruits')!
  await page.goto(`/ingredients/categories/${fruits.id}`)
  await expect(page.getByTestId('category-grain-fields-note')).toBeVisible()
  await expect(page.getByTestId('category-add-field')).toHaveCount(0)
})

test('O3: a category that has a grain has Delete disabled with the reason (gap 12, D61 carry-over 2); empty, it deletes', async ({ page }) => {
  const api = await apiAs('owner')
  const categories = (await (await api.get('/api/ingredient_categories')).json()).data as { id: number; name: string }[]
  const grains = categories.find((c) => c.name === 'Grains')!
  const made = await api.post('/api/ingredient_categories', { data: { name: tempTag('O3 smoked'), parent_id: grains.id } })
  expect(made.status(), await made.text()).toBe(201)
  const category = (await made.json()).data as { id: number; sort_order: number }
  const grain = await api.post('/api/ingredients', { data: { name: tempTag('O3 grain'), category_id: category.id } })
  expect(grain.status(), await grain.text()).toBe(201)
  const grainId = (await grain.json()).data.id as number
  try {
    // A new child goes after Grains' five (sort order 5, not after every category).
    expect(category.sort_order).toBe(5)
    await page.goto(`/ingredients/categories/${category.id}`)
    await expect(page.getByTestId('category-delete')).toBeDisabled()
    await expect(page.getByTestId('category-delete-reason')).toHaveText('This category has grains; move them first')
    expect((await api.delete(`/api/ingredient_categories/${category.id}`)).status()).toBe(422)

    expect((await api.delete(`/api/ingredients/${grainId}`)).status()).toBe(204)
    await page.reload()
    await expect(page.getByTestId('category-delete-reason')).toHaveCount(0)
    await page.getByTestId('category-delete').click()
    await page.getByTestId('category-delete-confirm').getByRole('button', { name: 'Delete' }).click()
    await expect(page).toHaveURL(/\/ingredients\/categories$/)
  } finally {
    await api.delete(`/api/ingredients/${grainId}`)
    await api.delete(`/api/ingredient_categories/${category.id}`)
  }
  expect((await api.get(`/api/ingredient_categories/${category.id}`)).status()).toBe(404)
})
