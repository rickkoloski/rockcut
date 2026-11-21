import { test, expect, type Browser, type Page } from '@playwright/test'
import { authFile, type PersonaKey } from '../../config/test-env'
import { apiAs, cleanupIngredients, getProduct, makeHopProduct, makeSupplier, openDialog, saveProduct, tempTag } from './helpers'

// D62 lead decisions 4 (DEV box-only findings), item 1: after a 409 the
// refetch is held 2 s, as DEV's latency could make it. Until it lands, To
// order's picker is disabled (G17) and the product dialog stays busy (gap 9),
// so the next save carries the current version and saves first time. Every
// row a test makes is `[TEST-TEMP]`.

test.afterAll(cleanupIngredients)

const re = (s: string) => new RegExp(s.replace(/[[\]().*+?^$|{}\\]/g, '\\$&'))

async function as(browser: Browser, who: PersonaKey): Promise<Page> {
  const context = await browser.newContext({ storageState: authFile(who) })
  return context.newPage()
}

/** Hold every later GET of the product list and of one product for 2 s; resolves when a held GET has landed. */
async function holdProductReads(page: Page, id: number) {
  const paths = ['/api/ingredient_products', `/api/ingredient_products/${id}`]
  const read = (u: URL) => paths.includes(u.pathname)
  await page.route(read, async (route) => {
    if (route.request().method() === 'GET') await new Promise((r) => setTimeout(r, 2000))
    await route.continue()
  })
  return () => page.waitForResponse((r) => r.request().method() === 'GET' && read(new URL(r.url())))
}

const put = (page: Page, id: number) => page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().endsWith(`/api/ingredient_products/${id}`))

test('G17 race: the picker is disabled until the refetch after the 409 lands; the next pick saves first time', async ({ browser }) => {
  const hop = await makeHopProduct('G17 race')
  const other = await makeSupplier('G17 race supplier')
  const offer = await (await apiAs('brewer1')).post('/api/supplier_offers', { data: { product_id: hop.id, supplier_party_id: other.id } })
  const otherOffer = (await offer.json()).data as { id: number }
  expect((await saveProduct(hop.id, { min_on_hand_packs: 2 })).status()).toBe(200)

  const a = await as(browser, 'brewer1')
  await a.goto('/ingredients/to-order')
  const select = a.getByTestId(`to-order-${hop.id}-offer`)
  const picker = select.locator('.MuiSelect-select')
  await expect(picker).toHaveText(`${hop.company.name} · box · 11 lb`)

  expect((await saveProduct(hop.id, { origin: tempTag('Origin') }, 'brewer2')).status()).toBe(200)
  const landed = (await holdProductReads(a, hop.id))()

  const refused = put(a, hop.id)
  await picker.click()
  await a.getByRole('option', { name: re(other.name) }).click()
  expect((await refused).status()).toBe(409)
  // During the held refetch: disabled, no menu on a press, no message yet.
  await expect(select.locator('[role="combobox"]')).toHaveAttribute('aria-disabled', 'true')
  await picker.click({ force: true })
  await expect(a.getByRole('listbox')).toHaveCount(0)
  await expect(a.getByRole('alert')).toHaveCount(0)

  await landed
  await expect(a.getByRole('alert')).toHaveText('Someone else changed this product. The list is up to date now; pick the offer again.')
  await expect(select.locator('[role="combobox"]')).not.toHaveAttribute('aria-disabled', 'true')
  await expect(picker).toHaveText(`${hop.company.name} · box · 11 lb`)

  const saved = put(a, hop.id)
  await picker.click()
  await a.getByRole('option', { name: re(other.name) }).click()
  expect((await saved).status()).toBe(200)
  await expect(picker).toHaveText(`${other.name} · box · 11 lb`)
  expect((await getProduct(hop.id)) as unknown as { reorder_offer_id: number }).toMatchObject({ reorder_offer_id: otherOffer.id })
})

test('gap 9 race: the product dialog stays busy until the refetch after the 409 lands; reopened, it saves first time', async ({ browser }) => {
  const hop = await makeHopProduct('G9 race')
  const a = await as(browser, 'brewer1')
  await a.goto(`/ingredients/products/${hop.id}`)
  const d = await openDialog(a, a.getByTestId('product-edit'), 'product-dialog')

  expect((await saveProduct(hop.id, { origin: tempTag('Origin') }, 'brewer2')).status()).toBe(200)
  const landed = (await holdProductReads(a, hop.id))()

  await d.getByTestId('range-alpha_acid_pct-low').fill('10.5')
  const refused = put(a, hop.id)
  await d.getByRole('button', { name: 'Save' }).click()
  expect((await refused).status()).toBe(409)
  // During the held refetch: Cancel can't close it yet and no message shows.
  await expect(d.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  await expect(d.getByRole('alert')).toHaveCount(0)

  await landed
  await expect(d).toContainText('Someone else changed this product since you opened it. Close and reopen it to see their change.')
  await d.getByRole('button', { name: 'Cancel' }).click()
  await expect(d).toHaveCount(0)

  const again = await openDialog(a, a.getByTestId('product-edit'), 'product-dialog')
  await again.getByTestId('range-alpha_acid_pct-low').fill('10.5')
  const saved = put(a, hop.id)
  await again.getByRole('button', { name: 'Save' }).click()
  expect((await saved).status()).toBe(200)
  await expect(again).toHaveCount(0)
  expect((await getProduct(hop.id)).features?.alpha_acid_pct?.value).toBe('10.5')
})
