import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { adoptParty, apiAs, cleanupIngredients, reference, tempTag } from './helpers'

// D60 spec §9, as `owner`: a company with two roles on the Companies page; a
// company in use can't be deleted ("deactivate instead"); Settings →
// Categories: Grains' five children and no Origin/Maltster fields.

test.use({ storageState: authFile('owner') })
test.afterAll(cleanupIngredients)

test('O1: add a maltster + supplier company; Rahr (in use) can’t be deleted; an unused company can', async ({ page }) => {
  const name = tempTag('Weyermann')
  await page.goto('/ingredients/companies')
  await page.getByTestId('companies-add').click()
  const d = page.getByTestId('party-dialog')
  await d.getByTestId('party-name').fill(name)
  await d.getByTestId('party-role-maltster').check()
  await d.getByTestId('party-role-supplier').check()
  const created = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/parties'))
  await d.getByRole('button', { name: 'Save' }).click()
  const id = (await (await created).json()).data.id as number
  adoptParty(id)
  await expect(d).toHaveCount(0)
  await expect(page.getByTestId(`party-${id}-role-maltster`)).toHaveText('Maltster')
  await expect(page.getByTestId(`party-${id}-role-supplier`)).toHaveText('Supplier')
  const party = (await (await (await apiAs('owner')).get(`/api/parties/${id}`)).json()).data
  expect([...party.roles].sort()).toEqual(['maltster', 'supplier'])

  const { rahr } = await reference()
  await page.getByTestId(`company-${rahr}`).first().click()
  await page.getByTestId('party-delete').click()
  await expect(d.getByRole('alert')).toContainText('This company is in use; deactivate it instead')
  await d.getByRole('button', { name: 'Cancel' }).click()
  expect((await (await apiAs('owner')).get(`/api/parties/${rahr}`)).status()).toBe(200)

  await page.getByTestId(`company-${id}`).first().click()
  await page.getByTestId('party-delete').click()
  await expect(d).toHaveCount(0)
  await expect(page.getByTestId(`company-${id}`)).toHaveCount(0)
  expect((await (await apiAs('owner')).get(`/api/parties/${id}`)).status()).toBe(404)
})

test('O2: Settings → Categories: Grains shows its five children; no Origin or Maltster field', async ({ page }) => {
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
})
