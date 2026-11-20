import { test, expect, type Browser, type Page } from '@playwright/test'
import { authFile, type PersonaKey } from '../../config/test-env'
import { apiAs, cleanupIngredients, denverToday, getProduct, makeHopProduct, makePurchasing, makeSupplier, openDialog, pick, saveProduct, tempTag } from './helpers'

// D62 local QA recheck fix cycle (`d62_lead_decisions_2.md`) in the browser:
// "Other maltster/manufacturer…" opens the full list at once, with a mouse
// and by touch (gaps 13, 14); To order's offer reads "box · 11 lb" for hops
// and as D61 for grain (15); To order after someone else's product save
// (17); the contract's price-change line for a hop (18). Gap 16 is API only
// (`D62FixCycle1Test` gap 10). Every row a test makes is `[TEST-TEMP]`.

test.afterAll(cleanupIngredients)

const re = (s: string) => new RegExp(s.replace(/[[\]().*+?^$|{}\\]/g, '\\$&'))

async function as(browser: Browser, who: PersonaKey): Promise<Page> {
  const context = await browser.newContext({ storageState: authFile(who) })
  return context.newPage()
}

/** Gaps 13, 14: pick Rahr, then "Other maltster…" by `press` (click or tap): the full list is open at once, Rahr still chosen. */
async function otherMaltster(page: Page, press: 'click' | 'tap') {
  const hop = await makeHopProduct(`G13 ${press}`)
  await page.goto('/ingredients')
  await page.getByTestId('ingredients-add-button')[press]()
  await page.getByTestId('add-maltster-product')[press]()
  const d = page.getByTestId('product-dialog')
  const maltster = d.getByRole('combobox', { name: 'Maltster' })
  // The value as shown, read while the menu hides the dialog from roles.
  const shown = d.getByTestId('product-maltster').locator('.MuiSelect-select')
  await maltster[press]()
  await page.getByRole('option', { name: 'Rahr', exact: true })[press]()
  await expect(shown).toHaveText('Rahr')
  await maltster[press]()
  await expect(page.getByTestId('product-maltster-other')).toHaveText('Other maltster…')
  await page.getByTestId('product-maltster-other')[press]()
  // No second open: the menu stays open (not only fading out with the new
  // list in it), the hop grower is there and the value is unchanged.
  await expect(d.getByTestId('product-maltster').locator('[role="combobox"]')).toHaveAttribute('aria-expanded', 'true')
  await page.waitForTimeout(600)
  await expect(page.getByRole('listbox')).toBeVisible()
  await expect(page.getByRole('option', { name: re(hop.company.name) })).toBeVisible()
  await expect(page.getByTestId('product-maltster-other')).toHaveCount(0)
  await expect(shown).toHaveText('Rahr')
  await page.getByRole('option', { name: re(hop.company.name) })[press]()
  await expect(shown).toHaveText(hop.company.name)
  await expect(page.getByRole('listbox')).toHaveCount(0)
}

test.describe('brewer1', () => {
  test.use({ storageState: authFile('brewer1') })

  test('G13, G14: "Other maltster…" on grain opens every company at once (mouse); hops keep "Other manufacturer…"', async ({ page }) => {
    await otherMaltster(page, 'click')
    await page.getByTestId('product-dialog').getByRole('button', { name: 'Cancel' }).click()

    await pick(page, page.locator('body'), 'Category', /^Hops$/)
    await page.getByTestId('ingredients-add-button').click()
    await page.getByTestId('add-hop-product').click()
    await page.getByTestId('product-dialog').getByRole('combobox', { name: 'Manufacturer' }).click()
    await expect(page.getByTestId('product-maltster-other')).toHaveText('Other manufacturer…')
  })

  test('G15: To order reads a hop offer "box · 11 lb" and a grain offer as D61 ("55 lb")', async ({ page }) => {
    const hop = await makeHopProduct('G15')
    const grain = await makePurchasing('G15 grain')
    for (const id of [hop.id, grain.product.id]) expect((await saveProduct(id, { min_on_hand_packs: 2 })).status()).toBe(200)
    await page.goto('/ingredients/to-order')
    await expect(page.getByTestId(`to-order-${hop.id}-offer`).locator('.MuiSelect-select')).toHaveText(`${hop.company.name} · box · 11 lb`)
    await page.getByTestId(`to-order-${hop.id}-offer`).click()
    await expect(page.getByRole('option')).toHaveText([`${hop.company.name} · box · 11 lb`])
    await page.keyboard.press('Escape')
    // The grain product has the reference BSG offer (55 lb, milled) and its temp supplier's.
    await expect(page.getByTestId(`to-order-${grain.product.id}-offer`).locator('.MuiSelect-select')).toHaveText('BSG · 55 lb')
    await page.getByTestId(`to-order-${grain.product.id}-offer`).click()
    await expect(page.getByRole('option', { name: `${grain.supplier.name} · 55 lb`, exact: true })).toBeVisible()
  })
})

test('G17: To order after someone else saves the product: the 409 refreshes the list and the next pick saves', async ({ browser }) => {
  const hop = await makeHopProduct('G17')
  const other = await makeSupplier('G17 supplier')
  const offer = await (await apiAs('brewer1')).post('/api/supplier_offers', { data: { product_id: hop.id, supplier_party_id: other.id } })
  const otherOffer = (await offer.json()).data as { id: number }
  expect((await saveProduct(hop.id, { min_on_hand_packs: 2 })).status()).toBe(200)

  const a = await as(browser, 'brewer1')
  await a.goto('/ingredients/to-order')
  const picker = a.getByTestId(`to-order-${hop.id}-offer`).locator('.MuiSelect-select')
  await expect(picker).toHaveText(`${hop.company.name} · box · 11 lb`)

  expect((await saveProduct(hop.id, { origin: tempTag('Origin') }, 'brewer2')).status()).toBe(200)

  const put = () => a.waitForResponse((r) => r.request().method() === 'PUT' && r.url().endsWith(`/api/ingredient_products/${hop.id}`))
  let saved = put()
  await picker.click()
  await a.getByRole('option', { name: re(other.name) }).click()
  expect((await saved).status()).toBe(409)
  await expect(a.getByRole('alert')).toHaveText('Someone else changed this product. The list is up to date now; pick the offer again.')
  await expect(picker).toHaveText(`${hop.company.name} · box · 11 lb`)

  saved = put()
  await picker.click()
  await a.getByRole('option', { name: re(other.name) }).click()
  expect((await saved).status()).toBe(200)
  await expect(picker).toHaveText(`${other.name} · box · 11 lb`)
  expect((await getProduct(hop.id)) as unknown as { reorder_offer_id: number }).toMatchObject({ reorder_offer_id: otherOffer.id })
})

test.describe('breweryMgr', () => {
  test.use({ storageState: authFile('breweryMgr') })

  test("G18: a hop line's price change leaves the supplier off; a grain line keeps D61's", async ({ page }) => {
    const hop = await makeHopProduct('G18')
    const grain = await makePurchasing('G18 grain')
    const offer = await (await apiAs('brewer1')).post('/api/supplier_offers', { data: { product_id: hop.id, supplier_party_id: grain.supplier.id } })
    const hopOffer = (await offer.json()).data as { id: number }
    await (await apiAs('brewer1')).post(`/api/supplier_offers/${hopOffer.id}/prices`, { data: { price_per_pack: '165.00', effective_on: '2020-01-01' } })

    await page.goto('/ingredients/contracts')
    const d = await openDialog(page, page.getByTestId('contracts-new'), 'contract-dialog')
    await pick(page, d, 'Supplier', re(grain.supplier.name))
    await pick(page, d.getByTestId('contract-line-0'), 'Product', /G18 hop/)
    await d.getByTestId('contract-line-0-quantity').fill('440')
    await d.getByTestId('contract-line-0-price').fill('14.50')
    await d.getByTestId('contract-add-line').click()
    await pick(page, d.getByTestId('contract-line-1'), 'Product', re(grain.product.display_name))
    await d.getByTestId('contract-line-1-quantity').fill('10')
    await d.getByTestId('contract-line-1-price').fill('40')
    const today = denverToday()
    const changes = d.getByTestId('contract-price-changes')
    await expect(changes).toContainText(`${hop.ingredient!.name} T90 Pellet · ${hop.company.name} price becomes $159.50 from ${today}`)
    await expect(changes).not.toContainText(`${grain.supplier.name} ${hop.ingredient!.name}`)
    await expect(changes).toContainText(`${grain.supplier.name} ${grain.product.display_name} price becomes $40.00 from ${today}`)
  })
})

test.describe('360 px', () => {
  test.use({ storageState: authFile('brewer1'), viewport: { width: 360, height: 760 }, hasTouch: true, isMobile: true })

  test('G13: "Other maltster…" opens every company at once by touch', async ({ page }) => {
    await otherMaltster(page, 'tap')
  })
})
