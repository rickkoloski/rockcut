import { test, expect, type Browser, type Page } from '@playwright/test'
import { authFile, type PersonaKey } from '../../config/test-env'
import { apiAs, cleanupIngredients, getOrder, makeLot, makeOrder, makeProduct, makePurchasing, movementsOf, openDialog, pick } from './helpers'

// D61 DEV QA fix cycle (`d61_lead_decisions_2.md`): an Edit opened before
// someone else's save is refused with the message and keeps its input, and
// reopening shows their change (gaps 1, 2); a double tap on Cancel order's
// confirm sends one cancel and shows no error (gap 5); the Year picker lists
// every year with a contract and the Year box checks itself (gap 3), and a
// past year says it changes no offer prices (item 5); Save waits for a
// dialog's lists (items 4, 7), and Record movement's partner field says it's
// loading, not "none", until its list is in (item 8). Every row is `[TEST-TEMP]`.

test.afterAll(cleanupIngredients)

const year = Number(new Date().getFullYear())

async function as(browser: Browser, who: PersonaKey): Promise<Page> {
  const context = await browser.newContext({ storageState: authFile(who) })
  return context.newPage()
}

/** Chrome's network throttling (CDP): every request waits about 1.5 s. */
async function slow(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 1500, downloadThroughput: 50 * 1024, uploadThroughput: 50 * 1024 })
}

test('D1: two people edit one order: the second save is refused with the message, keeps its input, and reopening shows the first change', async ({ browser }) => {
  const { supplier, offer } = await makePurchasing('D1')
  const order = await makeOrder(supplier.id, [{ offerId: offer.id, packs: 5 }])
  const a = await as(browser, 'brewer1')
  const b = await as(browser, 'brewer2')
  for (const p of [a, b]) await p.goto(`/ingredients/orders/${order.id}`)
  const da = await openDialog(a, a.getByTestId('order-edit'), 'order-dialog')
  const db = await openDialog(b, b.getByTestId('order-edit'), 'order-dialog')

  await da.getByTestId('order-line-0-packs').fill('9')
  await da.getByRole('button', { name: 'Save' }).click()
  await expect(da).toHaveCount(0)

  await db.getByTestId('order-reference').fill('PO-STALE')
  const refused = b.waitForResponse((r) => r.request().method() === 'PUT' && r.url().endsWith(`/api/purchase_orders/${order.id}`))
  await db.getByRole('button', { name: 'Save' }).click()
  expect((await refused).status()).toBe(409)
  await expect(db).toContainText('Someone else changed this order since you opened it. Close and reopen it to see their change.')
  await expect(db.getByTestId('order-reference')).toHaveValue('PO-STALE')
  // Save again from the same dialog: still refused (it keeps the version it opened).
  await db.getByRole('button', { name: 'Save' }).click()
  await expect(db).toContainText('Someone else changed this order')

  const now = await getOrder(order.id)
  expect([now.lines[0].packs_ordered, now.reference]).toEqual([9, null])

  await db.getByRole('button', { name: 'Cancel' }).click()
  await expect(db).toHaveCount(0)
  const again = await openDialog(b, b.getByTestId('order-edit'), 'order-dialog')
  await expect(again.getByTestId('order-line-0-packs')).toHaveValue('9')
  await again.getByTestId('order-reference').fill('PO-FRESH')
  const saved = b.waitForResponse((r) => r.request().method() === 'PUT' && r.url().endsWith(`/api/purchase_orders/${order.id}`))
  await again.getByRole('button', { name: 'Save' }).click()
  expect((await saved).status()).toBe(200)
  await expect(again).toHaveCount(0)
  const after = await getOrder(order.id)
  expect([after.lines[0].packs_ordered, after.reference]).toEqual([9, 'PO-FRESH'])
})

test('D2: two people edit one contract: the second save is refused, keeps its input, and reopening shows the first change', async ({ browser }) => {
  const { product, supplier } = await makePurchasing('D2')
  const made = await (await apiAs('breweryMgr')).post('/api/contracts', {
    data: { supplier_party_id: supplier.id, year: year + 1, lines: [{ product_id: product.id, quantity: 5, price: '41.00' }] },
  })
  expect(made.status()).toBe(201)
  const id = (await made.json()).data.id as number
  const a = await as(browser, 'owner')
  const b = await as(browser, 'breweryMgr')
  for (const p of [a, b]) await p.goto(`/ingredients/contracts?year=${year + 1}`)
  const da = await openDialog(a, a.getByTestId(`contract-${id}-edit`), 'contract-dialog')
  const db = await openDialog(b, b.getByTestId(`contract-${id}-edit`), 'contract-dialog')

  await da.getByTestId('contract-line-0-quantity').fill('8')
  await da.getByRole('button', { name: 'Save' }).click()
  await expect(da).toHaveCount(0)

  await db.getByRole('textbox', { name: 'Notes' }).fill('stale notes')
  const refused = b.waitForResponse((r) => r.request().method() === 'PUT' && r.url().endsWith(`/api/contracts/${id}`))
  await db.getByRole('button', { name: 'Save' }).click()
  expect((await refused).status()).toBe(409)
  await expect(db).toContainText('Someone else changed this contract since you opened it. Close and reopen it to see their change.')
  await expect(db.getByRole('textbox', { name: 'Notes' })).toHaveValue('stale notes')

  const read = async () => (await (await (await apiAs('breweryMgr')).get(`/api/contracts/${id}`)).json()).data
  const now = await read()
  expect([now.lines[0].quantity, now.notes]).toEqual([8, null])

  await db.getByRole('button', { name: 'Cancel' }).click()
  await expect(db).toHaveCount(0)
  await expect(b.getByTestId(`contract-line-${product.id}`)).toContainText('8')
  const again = await openDialog(b, b.getByTestId(`contract-${id}-edit`), 'contract-dialog')
  await expect(again.getByTestId('contract-line-0-quantity')).toHaveValue('8')
})

test.describe('brewer1', () => {
  test.use({ storageState: authFile('brewer1') })

  test('D3: a slow double tap on Cancel order sends one cancel and shows no error', async ({ page }) => {
    const { supplier, offer } = await makePurchasing('D3')
    const order = await makeOrder(supplier.id, [{ offerId: offer.id, packs: 1 }])
    await page.goto(`/ingredients/orders/${order.id}`)
    const posts: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith(`/api/purchase_orders/${order.id}/cancel`)) posts.push(r.url())
    })
    const confirm = await openDialog(page, page.getByTestId('order-cancel'), 'order-cancel-confirm')
    await slow(page)
    await confirm.getByRole('button', { name: 'Cancel order' }).dblclick()
    await expect(confirm).toHaveCount(0, { timeout: 15_000 })
    await expect(page.getByText('cancelled by', { exact: false })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('This order has already been cancelled')).toHaveCount(0)
    expect(posts).toHaveLength(1)
    expect((await getOrder(order.id)).status).toBe('cancelled')
  })

  test('D4: Save in Edit maltster product waits for the lists, then saves once', async ({ page }) => {
    const product = await makeProduct('D4')
    await page.goto(`/ingredients/products/${product.id}`)
    await expect(page.getByTestId('product-minimum-text')).toHaveText('Minimum: none')
    // The dialog's lists answer only when released.
    let release!: () => void
    const held = new Promise<void>((done) => (release = done))
    await page.route(/\/api\/(feature_types|parties|ingredient_categories|ingredients)(\?|$)/, async (route) => {
      await held
      await route.continue()
    })
    const puts: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'PUT' && r.url().endsWith(`/api/ingredient_products/${product.id}`)) puts.push(r.url())
    })
    // Cached lists would answer at once: start from a fresh page.
    await page.reload()
    await page.getByTestId('product-minimum-edit').click()
    const d = page.getByTestId('product-dialog')
    await d.getByTestId('product-minimum').fill('3')
    const save = d.getByRole('button', { name: 'Save' })
    await expect(save).toBeDisabled()
    release()
    await expect(save).toBeEnabled()
    await save.click()
    await expect(d).toHaveCount(0)
    await expect(page.getByTestId('product-minimum-text')).toHaveText('Minimum: 3 sacks')
    expect(puts).toHaveLength(1)
  })

  test('D6 (item 8): Record movement says the partner breweries are loading, not "none", and a loan waits for them', async ({ page }) => {
    const product = await makeProduct('D6')
    await makeLot(product, 4, 10)
    await page.goto(`/ingredients/products/${product.id}`)
    await expect(page.getByTestId('product-on-hand')).toHaveText('4 sacks')
    let release!: () => void
    const held = new Promise<void>((done) => (release = done))
    await page.route(/\/api\/parties(\?|$)/, async (route) => {
      await held
      await route.continue()
    })
    const posts: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith('/api/inventory_movements')) posts.push(r.url())
    })
    // Cached parties would answer at once: start from a fresh page.
    await page.reload()
    await page.getByTestId('product-record-movement').click()
    const d = page.getByTestId('movement-dialog')
    await pick(page, d, 'Kind', 'Loaned out')
    await d.getByTestId('movement-quantity-packs').fill('1')
    await expect(d.getByTestId('movement-partner-loading')).toHaveText('Loading partner breweries…')
    await expect(d.getByTestId('movement-partner-none')).toHaveCount(0)
    await expect(d.getByRole('combobox', { name: 'Partner brewery' })).toHaveAttribute('aria-disabled', 'true')
    const save = d.getByRole('button', { name: 'Save' })
    await expect(save).toBeDisabled()

    release()
    await expect(d.getByTestId('movement-partner-loading')).toHaveCount(0)
    await expect(d.getByTestId('movement-partner-none')).toHaveCount(0)
    await expect(save).toBeEnabled()
    await pick(page, d, 'Partner brewery', '[SEED] Mountain Brewing')
    await save.click()
    await expect(d).toHaveCount(0)
    expect(posts).toHaveLength(1)
    expect((await movementsOf(product.id)).filter((m) => m.kind === 'loaned_out')).toHaveLength(1)
  })
})

test.describe('breweryMgr', () => {
  test.use({ storageState: authFile('breweryMgr') })

  test('D5: the Year picker lists every year with a contract; the Year box checks itself; the past-year line; a double tap on Delete sends one', async ({ page }) => {
    const { product, supplier } = await makePurchasing('D5')
    const far = year + 7
    const made = await (await apiAs('breweryMgr')).post('/api/contracts', {
      data: { supplier_party_id: supplier.id, year: far, lines: [{ product_id: product.id, quantity: 2, price: '41.00' }] },
    })
    expect(made.status()).toBe(201)
    const id = (await made.json()).data.id as number

    await page.goto('/ingredients/contracts')
    await page.getByTestId('contracts-year').click()
    await page.getByRole('option', { name: String(far), exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`year=${far}$`))
    await expect(page.getByTestId(`contract-${id}`)).toContainText(supplier.name)

    const d = await openDialog(page, page.getByTestId('contracts-new'), 'contract-dialog')
    const box = d.getByTestId('contract-year')
    const save = d.getByRole('button', { name: 'Save' })
    for (const bad of ['1999', '20271', '2101']) {
      await box.fill(bad)
      await expect(d).toContainText('A whole year, 2000–2100')
      await expect(save).toBeDisabled()
    }
    await box.fill(String(far + 1))
    await expect(d).not.toContainText('A whole year, 2000–2100')
    await expect(d).toContainText('Runs Jan–Dec')
    // Item 5 (Matt 4a): a past year says it changes no offer prices; this year doesn't.
    await expect(d.getByTestId('contract-past-year')).toHaveCount(0)
    await box.fill(String(year - 1))
    await expect(d.getByTestId('contract-past-year')).toHaveText(`${year - 1} is over: saving changes no offer prices.`)
    await box.fill(String(year))
    await expect(d.getByTestId('contract-past-year')).toHaveCount(0)
    await d.getByRole('button', { name: 'Cancel' }).click()

    const deletes: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'DELETE' && r.url().endsWith(`/api/contracts/${id}`)) deletes.push(r.url())
    })
    const confirm = await openDialog(page, page.getByTestId(`contract-${id}-delete`), 'contract-delete-confirm')
    await slow(page)
    await confirm.getByRole('button', { name: 'Delete' }).dblclick()
    await expect(page.getByTestId(`contract-${id}`)).toHaveCount(0, { timeout: 15_000 })
    expect(deletes).toHaveLength(1)
  })

  test('D4 (item 7): Save in Edit contract waits for the lists, then saves once', async ({ page }) => {
    const { product, supplier } = await makePurchasing('D4c')
    const made = await (await apiAs('breweryMgr')).post('/api/contracts', {
      data: { supplier_party_id: supplier.id, year: year + 1, lines: [{ product_id: product.id, quantity: 5, price: '41.00' }] },
    })
    expect(made.status()).toBe(201)
    const id = (await made.json()).data.id as number
    // The dialog's lists answer only when released (not the page's own all-offers list).
    let release!: () => void
    const held = new Promise<void>((done) => (release = done))
    await page.route(/\/api\/(parties|ingredient_products)(\?|$)|\/api\/supplier_offers\?supplier_id=/, async (route) => {
      await held
      await route.continue()
    })
    const puts: number[] = []
    page.on('response', (r) => {
      if (r.request().method() === 'PUT' && r.url().endsWith(`/api/contracts/${id}`)) puts.push(r.status())
    })
    await page.goto(`/ingredients/contracts?year=${year + 1}`)
    await page.getByTestId(`contract-${id}-edit`).click()
    const d = page.getByTestId('contract-dialog')
    await d.getByRole('textbox', { name: 'Notes' }).fill('lists held')
    const save = d.getByRole('button', { name: 'Save' })
    await expect(save).toBeDisabled()
    release()
    await expect(save).toBeEnabled()
    await save.click()
    await expect(d).toHaveCount(0)
    expect(puts).toEqual([200])
    const now = (await (await (await apiAs('breweryMgr')).get(`/api/contracts/${id}`)).json()).data
    expect([now.notes, now.lines[0].quantity]).toEqual(['lists held', 5])
  })
})
