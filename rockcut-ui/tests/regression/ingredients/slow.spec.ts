import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { SACK, cleanupIngredients, expectOnHand, lotsOf, makeLot, makeProduct, movementsOf, setQuantityDisplay, tempTag } from './helpers'

// D60 lead decisions 2 (gap 6), as `brewer1` on a throttled network: a
// desktop double-click on Save wrote two lots (Add lot) and two movement sets
// (Record movement). Save is disabled from the first click until the response,
// and a second submit in flight is dropped in code: exactly one POST, one lot,
// one movement.

test.use({ storageState: authFile('brewer1') })
test.beforeEach(async () => setQuantityDisplay('brewer1', 'sacks'))
test.afterAll(cleanupIngredients)

/** Chrome's network throttling (CDP): every request waits about 1.5 s. */
async function slow(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 1500, downloadThroughput: 50 * 1024, uploadThroughput: 50 * 1024 })
  return async () => cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
}

function countPosts(page: Page, path: string) {
  const posts: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith(path)) posts.push(r.url())
  })
  return posts
}

test('S1: a double-click on Save in Add lot writes one lot', async ({ page }) => {
  const product = await makeProduct('S1 slow lot')
  await page.goto(`/ingredients/products/${product.id}`)
  const posts = countPosts(page, '/api/ingredient_lots')
  await page.getByTestId('product-add-lot').click()
  const d = page.getByTestId('add-lot-dialog')
  await d.getByTestId('lot-number').fill(tempTag('S1'))
  await d.getByTestId('lot-quantity-sacks').fill('2')
  const fast = await slow(page)
  const save = d.getByRole('button', { name: 'Save' })
  await save.dblclick()
  await expect(save).toBeDisabled()
  await expect(d).toHaveCount(0, { timeout: 20_000 })
  await fast()
  expect(posts).toHaveLength(1)
  expect(await lotsOf(product.id)).toHaveLength(1)
  await expectOnHand(product.id, 2 * SACK)
})

test('S2: a double-click on Save in Record movement writes one movement set', async ({ page }) => {
  const product = await makeProduct('S2 slow use')
  await makeLot(product, 3, 10)
  await makeLot(product, 3, 5)
  await page.goto(`/ingredients/products/${product.id}`)
  const posts = countPosts(page, '/api/inventory_movements')
  await page.getByTestId('product-record-movement').click()
  const d = page.getByTestId('movement-dialog')
  // Oldest first, 4 sacks: one POST that touches both lots.
  await d.getByTestId('movement-quantity-sacks').fill('4')
  const fast = await slow(page)
  const save = d.getByRole('button', { name: 'Save' })
  await save.dblclick()
  await expect(save).toBeDisabled()
  await expect(d).toHaveCount(0, { timeout: 20_000 })
  await fast()
  expect(posts).toHaveLength(1)
  const used = (await movementsOf(product.id)).filter((m) => m.kind === 'used')
  expect(used.map((m) => Number(m.quantity_lb)).sort((a, b) => a - b)).toEqual([-3 * SACK, -1 * SACK])
  await expectOnHand(product.id, 2 * SACK)
})
