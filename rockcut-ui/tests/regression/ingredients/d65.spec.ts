import { test, expect, type Locator, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import {
  adoptParty,
  adoptProduct,
  apiAs,
  categoriesList,
  categoryId,
  cleanupIngredients,
  denverToday,
  expectNoSidewaysScroll,
  makeD65Ingredient,
  makeD65Lot,
  makeD65Product,
  openDialog,
  pick,
  tempTag,
} from './helpers'

// D65 Stop 1 (spec §4.1–§4.3, §5 items 1–3, decision 8, A9): products in
// Fruits, Spices & Flavorings, Sugars and Extracts and Other Consumables
// (Water Salts, Finings), the None manufacturer, the tablets unit and the
// categories. As brewer1 (brewer2 for a salt). Every row a test makes is
// `[TEST-TEMP]`: its own ingredients and companies, never the seeded
// Whirlfloc or Dextrose; subcategories are deleted by id.

test.use({ storageState: authFile('brewer1') })
test.afterAll(cleanupIngredients)

const re = (s: string) => new RegExp(s.replace(/[[\]().*+?^$|{}\\]/g, '\\$&'))

async function manufacturer(label: string): Promise<{ id: number; name: string }> {
  const res = await (await apiAs('owner')).post('/api/parties', { data: { name: tempTag(label), roles: ['manufacturer'] } })
  expect(res.status()).toBe(201)
  const party = (await res.json()).data as { id: number; name: string }
  adoptParty(party.id)
  return party
}

/** Pick a manufacturer, through "Other manufacturer…" when it makes nothing here yet (D62 gap 5). */
async function pickManufacturer(page: Page, d: Locator, name: string) {
  await d.getByRole('combobox', { name: /Manufacturer/ }).click()
  const other = page.getByTestId('product-maltster-other')
  if (await other.isVisible()) await other.click()
  await page.getByRole('option', { name: re(name) }).click()
}

/** Open Add → Product on the library showing `keyOrChild`, and return the dialog. */
async function addProduct(page: Page, keyOrChild: string): Promise<Locator> {
  await page.goto(`/ingredients?category=${await categoryId(keyOrChild)}`)
  await page.getByTestId('ingredients-add-button').click()
  await page.getByTestId('add-d65-product').click()
  const d = page.getByTestId('product-dialog')
  await expect(d).toBeVisible()
  return d
}

/** Save the product dialog; the created product's id (adopted for clean-up), or the refusal. */
async function save(page: Page, d: Locator): Promise<{ status: number; id?: number }> {
  const res = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/ingredient_products'))
  await d.getByRole('button', { name: 'Save' }).click()
  const r = await res
  if (r.status() !== 201) return { status: r.status() }
  const id = (await r.json()).data.id as number
  adoptProduct(id)
  return { status: 201, id }
}

test.describe('products', () => {
  test('Strawberry: a Purée in gal and a Whole in lb, each with its own on hand; a second Purée from the maker is refused', async ({ page }) => {
    // Lead decisions 4: 14 s locally, about 1.5 times that on DEV.
    test.slow()
    const strawberry = await makeD65Ingredient('Strawberry', 'fruits')
    const oregon = await manufacturer('Oregon Fruit')

    let d = await addProduct(page, 'fruits')
    await pick(page, d, 'Ingredient', re(strawberry.name))
    await pickManufacturer(page, d, oregon.name)
    await pick(page, d, 'Form', 'Purée')
    await pick(page, d, 'Unit', 'gal')
    const puree = await save(page, d)
    expect(puree.status).toBe(201)
    await expect(page).toHaveURL(new RegExp(`/ingredients/products/${puree.id}$`))
    await expect(page.getByTestId('product-item')).toContainText('Purée · gal · Fruits')
    await expect(page.getByTestId('product-manufacturer')).toHaveText(oregon.name)

    const whole = await makeD65Product(strawberry.id, 'Whole', 'lb', { manufacturer_party_id: oregon.id })
    await makeD65Lot({ id: puree.id! }, '11.5')
    await makeD65Lot(whole, '20')

    await page.goto(`/ingredients?category=${await categoryId('fruits')}`)
    await expect(page.getByTestId(`product-unit-${puree.id}`)).toHaveText('gal')
    await expect(page.getByTestId(`product-unit-${whole.id}`)).toHaveText('lb')
    await expect(page.getByTestId(`product-on-hand-${puree.id}`)).toHaveText('11.5 gal')
    await expect(page.getByTestId(`product-on-hand-${whole.id}`)).toHaveText('20 lb')

    d = await addProduct(page, 'fruits')
    await pick(page, d, 'Ingredient', re(strawberry.name))
    await pickManufacturer(page, d, oregon.name)
    await pick(page, d, 'Form', 'Purée')
    await pick(page, d, 'Unit', 'gal')
    expect((await save(page, d)).status).toBe(422)
    await expect(d.getByRole('alert')).toHaveText(`${oregon.name} already has Purée ${strawberry.name}.`)
  })

  test('a None salt product, and a second None one refused with the sentence', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFile('brewer2') })
    const page = await context.newPage()
    const gypsum = await makeD65Ingredient('Calcium Sulfate (Gypsum)', 'Water Salts')

    for (const attempt of [201, 422]) {
      const d = await addProduct(page, 'Water Salts')
      await pick(page, d, 'Ingredient', re(gypsum.name))
      await expect(d.getByRole('combobox', { name: /Manufacturer/ })).toHaveText('None')
      await pick(page, d, 'Form', 'Powder')
      // Water Salts: lb is the only unit, set and locked.
      await expect(d.getByRole('combobox', { name: /Unit/ })).toHaveText('lb')
      const saved = await save(page, d)
      expect(saved.status).toBe(attempt)
      if (attempt === 201) {
        await expect(page.getByRole('heading', { name: `${gypsum.name} Powder · None` })).toBeVisible()
        await expect(page.getByTestId('product-manufacturer')).toHaveText('None')
      } else {
        await expect(d.getByRole('alert')).toHaveText(`There's already a ${gypsum.name} Powder with manufacturer None.`)
      }
    }
    await context.close()
  })

  test('sugars: a Liquid sugar in gal; the dialog locks Dry to lb and the API refuses Dry in gal', async ({ page }) => {
    const molasses = await makeD65Ingredient('Black Strap Molasses', 'sugars')
    const d = await addProduct(page, 'sugars')
    await pick(page, d, 'Ingredient', re(molasses.name))
    await pick(page, d, 'Form', 'Dry')
    await expect(d.getByRole('combobox', { name: /Unit/ })).toHaveText('lb')
    await expect(d.getByRole('combobox', { name: /Unit/ })).toHaveAttribute('aria-disabled', 'true')
    await pick(page, d, 'Form', 'Liquid')
    await pick(page, d, 'Unit', 'gal')
    const liquid = await save(page, d)
    expect(liquid.status).toBe(201)
    await expect(page.getByTestId('product-item')).toContainText('Liquid · gal')

    const dextrose = await makeD65Ingredient('Dextrose', 'sugars')
    const refused = await (await apiAs('brewer1')).post('/api/ingredient_products', { data: { ingredient_id: dextrose.id, form: 'Dry', unit: 'gal' } })
    expect(refused.status()).toBe(422)
    expect((await refused.json()).errors).toEqual({ unit: ['Dry sugars are in lb'] })
  })

  test('spices: Cinnamon (Ground, oz) and Vanilla Extract (Extract, fl oz); no feature fields', async ({ page }) => {
    const cinnamon = await makeD65Ingredient('Cinnamon', 'spices')
    const vanilla = await makeD65Ingredient('Vanilla Extract', 'spices')
    const d = await addProduct(page, 'spices')
    await pick(page, d, 'Ingredient', re(cinnamon.name))
    await pick(page, d, 'Form', 'Ground')
    await pick(page, d, 'Unit', /^oz$/)
    await expect(d.getByTestId(/^feature-/)).toHaveCount(0)
    const ground = await save(page, d)
    expect(ground.status).toBe(201)
    const extract = await makeD65Product(vanilla.id, 'Extract', 'fl oz')

    await page.goto(`/ingredients?category=${await categoryId('spices')}`)
    await expect(page.getByTestId(`product-unit-${ground.id}`)).toHaveText('oz')
    await expect(page.getByTestId(`product-unit-${extract.id}`)).toHaveText('fl oz')
    await expect(page.getByTestId(`product-row-${ground.id}`)).toContainText('None')
  })

  test('Whirlfloc T reads "tablets"; 2.5 tablets is refused in the dialog and by the API', async ({ page }) => {
    const whirlfloc = await makeD65Ingredient('Whirlfloc', 'Finings')
    const d = await addProduct(page, 'Finings')
    await pick(page, d, 'Ingredient', re(whirlfloc.name))
    await pick(page, d, 'Form', 'Tablet')
    await pick(page, d, 'Unit', 'tablets')
    await d.getByTestId('product-name').fill('T')
    const saved = await save(page, d)
    expect(saved.status).toBe(201)
    await expect(page.getByTestId('product-item')).toContainText('Tablet · tablets · Finings')
    await expect(page.getByRole('heading', { name: `${whirlfloc.name} T · None` })).toBeVisible()

    const lot = await openDialog(page, page.getByTestId('product-add-lot'), 'add-lot-dialog')
    // No offer or lot yet: no pack size, so one box in the unit (whole tablets only).
    await lot.getByTestId('lot-quantity-lb').fill('2.5')
    await expect(lot.getByRole('button', { name: 'Save' })).toBeDisabled()
    await lot.getByRole('button', { name: 'Cancel' }).click()

    const refused = await (await apiAs('brewer1')).post('/api/ingredient_lots', {
      data: { product_id: saved.id, received_date: denverToday(), initial_kind: 'opening', initial_quantity: '2.5' },
    })
    expect(refused.status()).toBe(422)
    expect((await refused.json()).errors.base).toEqual([`${whirlfloc.name} T is counted in whole tablets`])

    await makeD65Lot({ id: saved.id! }, '1272')
    await page.reload()
    await expect(page.getByTestId('product-on-hand')).toHaveText('1,272 tablets')
  })
})

test('Stop 0 LEAD note 4: while the categories load, the library shows a loading state, not "No ingredients found"', async ({ page }) => {
  let release: () => void = () => {}
  const held = new Promise<void>((r) => (release = r))
  await page.route((u) => u.pathname === '/api/ingredient_categories', async (route) => {
    await held
    await route.continue()
  })
  await page.goto('/ingredients')
  await expect(page.getByTestId('ingredients-loading')).toBeVisible()
  await expect(page.getByText('No ingredients found')).toHaveCount(0)
  release()
  await expect(page.getByTestId('ingredients-loading')).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: 'Category' })).toHaveText('Grains')
})

test('Stop 3: while the products load, a products view shows a loading state, not "No products" on every ingredient', async ({ page }) => {
  let release: () => void = () => {}
  const held = new Promise<void>((r) => (release = r))
  await page.route((u) => u.pathname === '/api/ingredient_products', async (route) => {
    await held
    await route.continue()
  })
  await page.goto(`/ingredients?category=${await categoryId('fruits')}`)
  // The categories are in (and the ingredients): only the products are held.
  await expect(page.getByRole('combobox', { name: 'Category' })).toHaveText('Fruits')
  await page.waitForTimeout(500)
  await expect(page.getByTestId('ingredients-loading')).toBeVisible()
  await expect(page.getByText('No products', { exact: true })).toHaveCount(0)
  release()
  await expect(page.getByTestId('ingredients-loading')).toHaveCount(0)
  await expect(page.getByTestId('products-table')).toBeVisible()
})

test('Stop 2 item 0: a Fruits category page never shows Add field, even while the category list loads', async ({ page }) => {
  let release: () => void = () => {}
  const held = new Promise<void>((r) => (release = r))
  await page.route((u) => u.pathname === '/api/ingredient_categories', async (route) => {
    await held
    await route.continue()
  })
  await page.goto(`/ingredients/categories/${await categoryId('fruits')}`)
  await expect(page.getByRole('heading', { name: 'Field Definitions' })).toBeVisible()
  await expect(page.getByTestId('category-grain-fields-note')).toBeVisible()
  await expect(page.getByTestId('category-add-field')).toHaveCount(0)
  release()
  await page.waitForResponse((r) => new URL(r.url()).pathname === '/api/ingredient_categories')
  await expect(page.getByTestId('category-add-field')).toHaveCount(0)
})

test.describe('categories', () => {
  test('Water Salts and Finings under Other Consumables; no Future Ingredients or Irish Moss; no Add field or subcategory on the three', async ({ page }) => {
    const all = await categoriesList()
    const consumables = all.find((c) => c.key === 'consumables')!
    expect(all.filter((c) => c.parent_id === consumables.id).map((c) => c.name)).toEqual(expect.arrayContaining(['Water Salts', 'Finings']))
    expect(all.some((c) => c.name === 'Future Ingredients' || c.key === 'future')).toBe(false)
    expect(all.some((c) => c.name === 'Acids')).toBe(false)
    const ingredients = (await (await (await apiAs('brewer1')).get('/api/ingredients')).json()).data as { name: string }[]
    expect(ingredients.some((i) => i.name === 'Irish Moss')).toBe(false)

    await page.goto('/ingredients/categories')
    await expect(page.getByText('Future Ingredients')).toHaveCount(0)

    for (const key of ['fruits', 'spices', 'sugars']) {
      await page.goto(`/ingredients/categories/${await categoryId(key)}`)
      await expect(page.getByTestId('category-grain-fields-note')).toContainText('use products (form and unit), not custom fields')
      await expect(page.getByTestId('category-add-field')).toHaveCount(0)
      await expect(page.getByTestId('category-add-child')).toHaveCount(0)
    }

    await page.goto(`/ingredients/categories/${consumables.id}`)
    await expect(page.getByTestId('category-children')).toContainText('Water Salts')
    await expect(page.getByTestId('category-children')).toContainText('Finings')
    const d = await openDialog(page, page.getByTestId('category-add-child'), 'category-dialog')
    const name = tempTag('Cleaning')
    await d.getByTestId('category-name').fill(name)
    const created = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/ingredient_categories'))
    await d.getByRole('button', { name: 'Save' }).click()
    const res = await created
    expect(res.status()).toBe(201)
    const child = (await res.json()).data as { id: number; catalog: { forms: string[] } }
    try {
      expect(child.catalog.forms).toEqual(['Powder', 'Flake', 'Liquid', 'Tablet'])
      await expect(page.getByTestId('category-children')).toContainText(name)
    } finally {
      expect((await (await apiAs('owner')).delete(`/api/ingredient_categories/${child.id}`)).status()).toBe(204)
    }
  })
})

test.describe('at 360 px', () => {
  test.use({ viewport: { width: 360, height: 780 } })

  test('the library and the product page for a fruit and Whirlfloc have no sideways scroll', async ({ page }) => {
    const plum = await makeD65Ingredient('Plum', 'fruits')
    const purée = await makeD65Product(plum.id, 'Purée', 'lb')
    await makeD65Lot(purée, '44')
    const whirlfloc = await makeD65Ingredient('Whirlfloc', 'Finings')
    const tabs = await makeD65Product(whirlfloc.id, 'Tablet', 'each', { name: 'T' })
    await makeD65Lot(tabs, '872')

    await page.goto(`/ingredients?category=${await categoryId('fruits')}`)
    await expect(page.getByTestId(`product-card-${purée.id}`)).toContainText('Purée · lb · None')
    await expectNoSidewaysScroll(page)
    await page.getByTestId(`product-card-${purée.id}`).click()
    await expect(page.getByTestId('product-name')).toHaveText(`${plum.name} Purée · None`)
    await expectNoSidewaysScroll(page)

    await page.goto(`/ingredients?category=${await categoryId('consumables')}`)
    await expect(page.getByTestId(`product-card-${tabs.id}`)).toContainText('Tablet · tablets · None')
    await expectNoSidewaysScroll(page)
    await page.goto(`/ingredients/products/${tabs.id}`)
    await expect(page.getByTestId('product-item')).toContainText('tablets')
    await expectNoSidewaysScroll(page)
  })
})
