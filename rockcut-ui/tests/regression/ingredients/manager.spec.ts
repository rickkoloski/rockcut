import { test, expect } from '@playwright/test'
import { authFile, type PersonaKey } from '../../config/test-env'
import { SACK, apiAs, cleanupIngredients, expectLotOnHand, expectOnHand, lotsOf, makeLot, makeProduct, movementsOf, setQuantityDisplay } from './helpers'

// D60 spec §9: `breweryMgr` counts (one total, then by lot); `floater` and
// `splitRole` (Brewery employees with a Taproom role) get the Ingredients
// pages.

test.afterAll(cleanupIngredients)

test.describe('breweryMgr (Brewery manager)', () => {
  test.use({ storageState: authFile('breweryMgr') })
  test.beforeEach(async () => setQuantityDisplay('breweryMgr', 'packs'))

  test('M1: a total 2 sacks under on-hand comes off the oldest lot; Count by lot (8 and 0) adjusts both, the empty lot is Depleted', async ({ page }) => {
    const product = await makeProduct('M1 count')
    const older = await makeLot(product, 3, 30)
    const newer = await makeLot(product, 10, 7)
    await page.goto(`/ingredients/products/${product.id}`)
    await expect(page.getByTestId('product-on-hand')).toHaveText('13 sacks')

    await page.getByTestId('product-count').click()
    let d = page.getByTestId('count-dialog')
    await d.getByTestId('count-total-packs').fill('11')
    await d.getByRole('button', { name: 'Save count' }).click()
    await expect(d).toHaveCount(0)
    await expect(page.getByTestId('product-on-hand')).toHaveText('11 sacks')
    await expect(page.getByTestId(`lot-on-hand-${older.id}`)).toHaveText('1 sack')
    await expect(page.getByTestId(`lot-on-hand-${newer.id}`)).toHaveText('10 sacks')
    await expectLotOnHand(older.id, product.id, SACK)
    await expectLotOnHand(newer.id, product.id, 10 * SACK)
    let counts = (await movementsOf(product.id)).filter((m) => m.kind === 'count')
    expect(counts.map((m) => [m.lot_id, Number(m.quantity)])).toEqual([[older.id, -2 * SACK]])

    await page.getByTestId('product-count').click()
    d = page.getByTestId('count-dialog')
    await d.getByTestId('count-by-lot').check()
    await expect(d.getByTestId(`count-lot-${older.id}`).first()).toContainText('On hand: 1 sack')
    await expect(d.getByTestId(`count-lot-${newer.id}`).first()).toContainText('On hand: 10 sacks')
    await d.getByTestId(`count-lot-${newer.id}-packs`).fill('8')
    await d.getByTestId(`count-lot-${older.id}-packs`).fill('0')
    await d.getByRole('button', { name: 'Save count' }).click()
    await expect(d).toHaveCount(0)

    await expect(page.getByTestId(`lot-status-${older.id}`)).toHaveText('Depleted')
    await expect(page.getByTestId(`lot-on-hand-${newer.id}`)).toHaveText('8 sacks')
    await expectLotOnHand(older.id, product.id, 0)
    await expectLotOnHand(newer.id, product.id, 8 * SACK)
    await expectOnHand(product.id, 8 * SACK)
    counts = (await movementsOf(product.id)).filter((m) => m.kind === 'count')
    expect(counts).toHaveLength(3)
    expect((await lotsOf(product.id)).find((l) => l.id === older.id)?.status).toBe('depleted')
    await expect(page.getByTestId('product-movements').getByText('Count adjustment')).toHaveCount(3)
  })
})

for (const persona of ['floater', 'splitRole'] as PersonaKey[]) {
  test.describe(`${persona} (Brewery employee with a Taproom role)`, () => {
    test.use({ storageState: authFile(persona) })

    test(`M2: ${persona} gets the Grains list, a product page and Companies`, async ({ page }) => {
      const list = (await (await (await apiAs(persona)).get('/api/ingredient_products')).json()).data as { id: number; display_name: string }[]
      const rahr = list.find((p) => p.display_name === 'Rahr 2-Row')
      expect(rahr, 'Rahr 2-Row').toBeTruthy()

      await page.goto('/ingredients')
      await expect(page.getByTestId('grains-table')).toBeVisible()
      await expect(page.getByTestId(`grain-row-${rahr!.id}`)).toBeVisible()
      await page.getByTestId(`grain-row-${rahr!.id}`).click()
      await expect(page).toHaveURL(new RegExp(`/ingredients/products/${rahr!.id}$`))
      await expect(page.getByRole('heading', { name: 'Rahr 2-Row' })).toBeVisible()
      await expect(page.getByTestId('product-lots')).toContainText('[SEED] Rahr 2-Row A')

      await page.goto('/ingredients/companies')
      await expect(page.getByTestId('companies-table')).toContainText('Rahr')
    })
  })
}
