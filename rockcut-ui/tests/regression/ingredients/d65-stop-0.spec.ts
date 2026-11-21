import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs, cleanupIngredients, getProduct, makeHopProduct, makeOrder, makeProduct, openDialog, pick, tempTag } from './helpers'

// D65 Stop 0: the D62 DEV QA gaps carried into D65 (`prompts/d62_lead_decisions_5.md`),
// as brewer1. Gap 3 (a Receive split of 0), gap 4 (the Library's Category in the
// URL, desktop and 360 px) and Add lot's supplier (default and refusal). Gap 1 is
// in `orders.spec.ts` PO1. Every row a test makes is `[TEST-TEMP]`.

test.use({ storageState: authFile('brewer1') })
test.afterAll(cleanupIngredients)

test('gap 3: a split of 0 says why Receive waits, its row is marked with a remove button; removing it receives', async ({ page }) => {
  const hop = await makeHopProduct('S0 gap 3')
  expect((await (await apiAs('brewer1')).post(`/api/supplier_offers/${hop.offers[0].id}/prices`, { data: { price_per_pack: '170.50', effective_on: '2020-01-01' } })).status()).toBe(201)
  const order = await makeOrder(hop.company.id, [{ offerId: hop.offers[0].id, packs: 2 }])
  await page.goto(`/ingredients/orders/${order.id}`)
  const r = await openDialog(page, page.getByTestId('order-receive'), 'receive-dialog')
  const line = r.getByTestId('receive-line-0')
  await line.getByTestId('receive-line-0-add-lot').click()
  // Row 0 is the default (a new lot, as the product has none); row 1 a new lot #.
  for (const i of [0, 1]) {
    await line.getByTestId(`receive-line-0-row-${i}-number`).fill(tempTag(`S0 gap 3 lot ${i}`))
    await line.getByTestId(`receive-line-0-row-${i}-crop-year`).fill('2025')
    await line.getByTestId(`receive-line-0-row-${i}`).getByTestId('feature-alpha_acid_pct').fill('12')
  }
  await line.getByTestId('receive-line-0-row-0-packs').fill('0')
  await line.getByTestId('receive-line-0-row-1-packs').fill('2')
  await expect(line.getByTestId('receive-line-0-split')).toHaveText('0 + 2 = 2 of 2')
  await expect(line.getByTestId('receive-line-0-split-empty')).toHaveText('Each lot needs at least 1 box. Remove the empty one.')
  await expect(line.getByTestId('receive-line-0-row-0-packs')).toHaveAttribute('aria-invalid', 'true')
  await expect(line.getByTestId('receive-line-0-row-0-remove')).toBeVisible()
  await expect(r.getByRole('button', { name: 'Receive' })).toBeDisabled()

  // Changed to 1 of 3: the message goes, the sum still holds Receive.
  await line.getByTestId('receive-line-0-row-0-packs').fill('1')
  await expect(line.getByTestId('receive-line-0-split-empty')).toHaveCount(0)
  await line.getByTestId('receive-line-0-row-0-packs').fill('0')
  await expect(line.getByTestId('receive-line-0-split-empty')).toBeVisible()

  await line.getByTestId('receive-line-0-row-0-remove').click()
  await expect(line.getByTestId('receive-line-0-split-empty')).toHaveCount(0)
  await expect(r.getByRole('button', { name: 'Receive' })).toBeEnabled()
  const received = page.waitForResponse((res) => res.request().method() === 'POST' && res.url().endsWith(`/api/purchase_orders/${order.id}/receive`))
  await r.getByRole('button', { name: 'Receive' }).click()
  expect((await received).status()).toBe(200)
  await expect(r).toHaveCount(0)
  expect(Number((await getProduct(hop.id)).on_hand)).toBe(22)
})

async function categoryId(name: string): Promise<number> {
  const all = (await (await (await apiAs('brewer1')).get('/api/ingredient_categories')).json()).data as { id: number; name: string }[]
  return all.find((c) => c.name === name)!.id
}

/** Pick `name` in the Library's Category, open `rowTestId`, and come back by Back, then by the "Ingredients" link. */
async function roundTrip(page: Page, name: string, rowTestId: string) {
  const id = await categoryId(name)
  const category = page.getByRole('combobox', { name: 'Category' })
  await page.goto('/ingredients')
  await expect(category).toHaveText('Grains')
  await expect(page).toHaveURL(/\/ingredients$/)
  await pick(page, page.locator('body'), 'Category', new RegExp(`^${name}$`))
  await expect(page).toHaveURL(new RegExp(`/ingredients\\?category=${id}$`))

  await page.getByTestId(rowTestId).click()
  await expect(page).toHaveURL(/\/ingredients\/products\/\d+$/)
  await page.goBack()
  await expect(page).toHaveURL(new RegExp(`/ingredients\\?category=${id}$`))
  await expect(category).toHaveText(name)
  await expect(page.getByTestId(rowTestId)).toBeVisible()

  await page.getByTestId(rowTestId).click()
  await page.getByRole('link', { name: 'Ingredients', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/ingredients\\?category=${id}$`))
  await expect(category).toHaveText(name)

  // A fresh visit with no parameter is the default view.
  await page.goto('/ingredients')
  await expect(category).toHaveText('Grains')
}

for (const phone of [false, true]) {
  test.describe(phone ? 'at 360 px' : 'desktop', () => {
    if (phone) test.use({ viewport: { width: 360, height: 780 } })
    const row = (kind: 'hop' | 'grain', id: number) => `${kind}-${phone ? 'card' : 'row'}-${id}`

    test('gap 4: Back and the "Ingredients" link return to the chosen Category (Hops)', async ({ page }) => {
      const hop = await makeHopProduct(`S0 gap 4 ${phone ? 'phone' : 'desk'}`)
      await roundTrip(page, 'Hops', row('hop', hop.id))
    })

    test('gap 4: a grain child (Base) is kept too', async ({ page }) => {
      const grain = await makeProduct(`S0 gap 4 base ${phone ? 'phone' : 'desk'}`)
      await roundTrip(page, 'Base', row('grain', grain.id))
    })
  })
}
