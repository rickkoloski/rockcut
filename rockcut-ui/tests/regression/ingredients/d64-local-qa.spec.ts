import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { adoptParty, adoptProduct, apiAs, cleanupIngredients, denverToday, makeD65Ingredient, tempTag } from './helpers'
import { addDays, stepOf, type SBatch } from '../production/schedule'
import { brink, history, Yeast, yeastProduct } from '../production/yeast'

// D64 lead decisions 3–5 (local QA) on the screens: History's direction and
// Remove (gaps 2, 9), the date of a pitch or count (gap 3), a lot pitch taken
// back from the product page and the batch page (gap 5), the brand delete's
// refusal (gap 13) and the yeast product's labels (gap 1). Lean; [TEST-TEMP] only.

test.use({ storageState: authFile('brewer1') })

const yeast = new Yeast({ lean: true })
test.afterEach(async () => {
  await yeast.cleanup()
  await cleanupIngredients()
})

async function harvest(b: SBatch, step: string, brinkId: number, lb: string, extra: Record<string, unknown> = {}) {
  const s = stepOf(b, step)
  const us05 = await yeastProduct('US-05')
  const res = await (await apiAs('brewer1')).post(`/api/production/steps/${s.id}/complete`, {
    data: { done_on: s.due_on, yeast_outcome: 'harvested', yeast_brink_id: brinkId, yeast_lb: lb, yeast_product_ids: [us05.id], yeast_generation: 1, ...extra },
  })
  expect(res.status(), await res.text()).toBe(200)
  return s
}

const stock = async (id: number, action: string, data: Record<string, unknown>) =>
  expect((await (await apiAs('brewer1')).post(`/api/yeast/brinks/${id}/${action}`, { data: { occurred_on: denverToday(), ...data } })).status()).toBe(200)

async function action(page: Page, id: number, which: string, dialog: string) {
  await page.goto('/ingredients/brinks')
  await page.getByTestId(`brink-actions-${id}`).click()
  await page.getByTestId(`brink-action-${which}`).click()
  return page.getByTestId(dialog)
}

/** A [TEST-TEMP] Dry yeast with a brick offer and 6 bricks. */
async function bricks() {
  const api = await apiAs('brewer1')
  const post = async (path: string, data: Record<string, unknown>, as = api) => {
    const res = await as.post(path, { data })
    expect(res.status(), await res.text()).toBe(201)
    return (await res.json()).data
  }
  const lab = await post('/api/parties', { name: tempTag('QA Labs'), roles: ['manufacturer', 'supplier'] }, await apiAs('owner'))
  adoptParty(lab.id)
  const strain = await makeD65Ingredient('QA Ale', 'yeast')
  const product = await post('/api/ingredient_products', { ingredient_id: strain.id, manufacturer_party_id: lab.id, name: tempTag('QA'), form: 'Dry', unit: 'each' })
  adoptProduct(product.id)
  const offer = await post('/api/supplier_offers', { product_id: product.id, supplier_party_id: lab.id, pack_name: 'brick', pack_size: '1' })
  await post(`/api/supplier_offers/${offer.id}/prices`, { price_per_pack: '76.99', effective_on: '2020-01-01' })
  await post('/api/ingredient_lots', { product_id: product.id, supplier_party_id: lab.id, pack_name: 'brick', pack_size: '1', lot_number: tempTag('lot'), received_date: denverToday(), initial_kind: 'opening', initial_quantity: '6' })
  return { product, offer }
}

test('gaps 2 and 9: an adjustment reads its direction; no Remove on a dump once the brink was filled again', async ({ page }) => {
  const tb = await yeast.brink('YB-dir')
  const [a, b] = [await yeast.brewed('Galactic'), await yeast.brewed('Enos')]
  await harvest(a, 'Yeast harvest', tb.id, '40')
  await stock(tb.id, 'adjust', { weight_lb: '33' })
  let h = await action(page, tb.id, 'history', 'brink-history-dialog')
  await expect(h).toContainText('Adjusted −7 lb (40 → 33)')
  await stock(tb.id, 'dump', {})
  h = await action(page, tb.id, 'history', 'brink-history-dialog')
  await expect(h.locator('[data-testid^="brink-history-remove-"]')).toHaveCount(1)
  await harvest(b, 'Yeast harvest', tb.id, '5', { yeast_dirty_ok: true })
  h = await action(page, tb.id, 'history', 'brink-history-dialog')
  await expect(h.locator('[data-testid^="brink-history-entry-"]')).toHaveCount(4)
  await expect(h.locator('[data-testid^="brink-history-remove-"]')).toHaveCount(0)
})

test('gap 3: Pitch and Add count say the first harvest day and wait; the day itself is fine', async ({ page }) => {
  const tb = await yeast.brink('YB-date')
  const a = await yeast.brewed('Galactic')
  const first = (await harvest(a, 'Yeast harvest', tb.id, '20')).due_on
  const says = `${tb.name}'s yeast was harvested ${Number(first.slice(5, 7))}/${Number(first.slice(8))}. Pick that day or later.`
  for (const [which, dialog, button] of [
    ['pitch', 'brink-pitch-dialog', 'Pitch'],
    ['count', 'brink-count-dialog', 'Save'],
  ]) {
    const d = await action(page, tb.id, which, dialog)
    const date = d.getByTestId(`brink-${which}-date`)
    await expect(date).toHaveAttribute('min', first)
    await date.fill(addDays(first, -1))
    await expect(d).toContainText(says)
    await expect(d.getByRole('button', { name: button })).toBeDisabled()
    await date.fill(first)
    await expect(d).not.toContainText(says)
  }
  expect((await brink(tb.id))!.yeast?.on_hand_lb).toBe('20')
})

test('gap 5: a lot pitch is taken back from the product page and from the batch page; gap 1: one price column and no toggle', async ({ page }) => {
  const { product, offer } = await bricks()
  const a = await yeast.brewed('Galactic')
  const api = await apiAs('brewer1')
  const pitch = async () =>
    (await (await api.post(`/api/ingredient_products/${product.id}/pitch`, { data: { batch_id: a.id, quantity: '2', occurred_on: denverToday() } })).json()).data[0].id as number

  const first = await pitch()
  await page.goto(`/ingredients/products/${product.id}`)
  await expect(page.getByTestId('product-on-hand')).toHaveText('4 bricks')
  await expect(page.getByTestId('quantity-toggle')).toHaveCount(0)
  await expect(page.getByRole('columnheader', { name: '$/brick' })).toHaveCount(2) // the offers' one and the lots' one
  await page.getByTestId(`offer-row-${offer.id}`).getByRole('button', { name: 'Edit offer' }).click()
  await expect(page.getByRole('dialog')).toContainText('"brick · 1 brick (5 lb)"')
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()

  await page.getByTestId(`movement-remove-${first}`).click()
  const confirm = page.getByTestId('remove-pitch-confirm')
  await expect(confirm).toContainText(`Remove the pitch of 2 bricks into ${a.label}?`)
  await confirm.getByRole('button', { name: 'Remove' }).click()
  await expect(confirm).toHaveCount(0)
  await expect(page.getByTestId('product-on-hand')).toHaveText('6 bricks')

  const second = await pitch()
  await page.goto(`/batches/${a.id}`)
  await page.getByTestId(`batch-yeast-remove-${second}`).click()
  await page.getByTestId('remove-pitch-confirm').getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByTestId('batch-yeast-none')).toBeVisible()
})

test('gap 5: a count since: the refusal shows in the confirm of a page opened before it', async ({ page }) => {
  const { product } = await bricks()
  const a = await yeast.brewed('Galactic')
  const api = await apiAs('brewer1')
  const id = (await (await api.post(`/api/ingredient_products/${product.id}/pitch`, { data: { batch_id: a.id, quantity: '2', occurred_on: denverToday() } })).json()).data[0].id
  // The counted pitch can't be removed, so it holds the batch: left for setup.
  yeast.keep(a)
  await page.goto(`/batches/${a.id}`)
  await page.getByTestId(`batch-yeast-remove-${id}`).click()
  expect((await api.post(`/api/ingredient_products/${product.id}/count`, { data: { mode: 'total', counted: '4', counted_on: denverToday() } })).ok()).toBe(true)
  await page.getByTestId('remove-pitch-confirm').getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByTestId('remove-pitch-error')).toContainText("has been counted since, so this pitch can't be removed.")
})

test('gap 13: deleting a brand that has a batch says why, in the dialog', async ({ page }) => {
  const a = await yeast.brewed('Galactic')
  const brand = (await (await (await apiAs('brewer1')).get(`/api/brands/${a.brand_id}`)).json()).data as { name: string }
  await page.goto(`/brands/${a.brand_id}`)
  await page.getByRole('button', { name: 'Delete Brand' }).click()
  const d = page.getByTestId('brand-delete-confirm')
  await d.getByRole('button', { name: 'Delete' }).click()
  await expect(d.getByTestId('brand-delete-error')).toHaveText(`${brand.name} has 1 batch, so it can't be deleted.`)
})

test('gap 7 (Matt): a History after "This brink is empty" and an un-check reads the old yeast again', async ({ page }) => {
  const tb = await yeast.brink('YB-back')
  const a = await yeast.brewed('Galactic')
  await harvest(a, 'Yeast harvest', tb.id, '40')
  const second = await harvest(a, 'Yeast harvest - #2', tb.id, '9', { yeast_brink_answer: 'empty' })
  expect((await brink(tb.id))!.yeast?.on_hand_lb).toBe('9')
  expect((await (await apiAs('brewer1')).post(`/api/production/steps/${second.id}/uncomplete`)).status()).toBe(200)
  await page.goto('/ingredients/brinks')
  await expect(page.getByTestId(`brink-on-hand-${tb.id}`)).toContainText('40 lb')
  expect((await history(tb.id)).filter((r) => r.status === 'in_brink')).toHaveLength(1)
})
