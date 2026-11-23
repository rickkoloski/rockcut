import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { adoptParty, adoptProduct, apiAs, cleanupIngredients, denverToday, makeD65Ingredient, tempTag } from './helpers'
import { addDays, schedule, stepOf, type SBatch } from '../production/schedule'
import { addCount, brink, brinkAnswer, history, Yeast, yeastProduct } from '../production/yeast'

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

test('gap 3: Pitch, Add count and Adjust weight say the first harvest day and wait; the day itself is fine', async ({ page }) => {
  const tb = await yeast.brink('YB-date')
  const a = await yeast.brewed('Galactic')
  const first = (await harvest(a, 'Yeast harvest', tb.id, '20')).due_on
  const says = `${tb.name}'s yeast was harvested ${Number(first.slice(5, 7))}/${Number(first.slice(8))}. Pick that day or later.`
  for (const [which, dialog, button] of [
    ['pitch', 'brink-pitch-dialog', 'Pitch'],
    ['count', 'brink-count-dialog', 'Save'],
    ['adjust', 'brink-adjust-dialog', 'Save'],
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
  await expect(page.getByRole('dialog')).toContainText('"brick · 1 (5 lb)"')
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
  const second = await harvest(a, 'Yeast harvest - #2', tb.id, '9', await brinkAnswer(tb.id, 'empty'))
  expect((await brink(tb.id))!.yeast?.on_hand_lb).toBe('9')
  expect((await (await apiAs('brewer1')).post(`/api/production/steps/${second.id}/uncomplete`)).status()).toBe(200)
  await page.goto('/ingredients/brinks')
  await expect(page.getByTestId(`brink-on-hand-${tb.id}`)).toContainText('40 lb')
  expect((await history(tb.id)).filter((r) => r.status === 'in_brink')).toHaveLength(1)
})

test('gap 15: a count is edited and deleted from History by its maker; not once pitched after, not by another brewer', async ({ page, browser }) => {
  const tb = await yeast.brink('YB-count')
  const [a, b] = [await yeast.brewed('Galactic'), await yeast.brewed('Enos')]
  const first = (await harvest(a, 'Yeast harvest', tb.id, '20')).due_on
  await addCount(tb.id)
  const id = (await history(tb.id))[0].counts[0].id

  const other = await browser.newContext({ storageState: authFile('brewer2') })
  const theirs = await action(await other.newPage(), tb.id, 'history', 'brink-history-dialog')
  await expect(theirs.getByTestId(`brink-history-count-${id}`)).toContainText('Count 1,200 M/mL · 92%')
  await expect(theirs.getByTestId(`brink-history-count-edit-${id}`)).toHaveCount(0)
  await expect(theirs.getByTestId(`brink-history-count-delete-${id}`)).toHaveCount(0)
  await other.close()

  let h = await action(page, tb.id, 'history', 'brink-history-dialog')
  await h.getByTestId(`brink-history-count-edit-${id}`).click()
  const d = page.getByTestId('brink-count-dialog')
  await expect(d.getByTestId('brink-count-cells')).toHaveValue('1200')
  await d.getByTestId('brink-count-date').fill(addDays(first, -1))
  await expect(d.getByRole('button', { name: 'Save' })).toBeDisabled()
  await d.getByTestId('brink-count-date').fill(first)
  await d.getByTestId('brink-count-cells').fill('1350.5')
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(d).toHaveCount(0)
  await expect(h.getByTestId(`brink-history-count-${id}`)).toContainText('Count 1,350.5 M/mL · 92%')

  // Pitched after it: neither is offered.
  await stock(tb.id, 'pitch', { lb: '1', batch_id: b.id })
  h = await action(page, tb.id, 'history', 'brink-history-dialog')
  await expect(h.getByTestId(`brink-history-count-${id}`)).toBeVisible()
  await expect(h.getByTestId(`brink-history-count-delete-${id}`)).toHaveCount(0)
  const pitch = (await history(tb.id))[0].entries.find((e) => e.kind === 'pitched')!
  expect((await (await apiAs('brewer1')).delete(`/api/yeast/entries/${pitch.id}`)).ok()).toBe(true)

  h = await action(page, tb.id, 'history', 'brink-history-dialog')
  await h.getByTestId(`brink-history-count-delete-${id}`).click()
  const q = page.getByTestId('brink-history-count-confirm')
  await expect(q).toContainText('(1,350.5 M/mL · 92%)')
  await q.getByRole('button', { name: 'Delete' }).click()
  await expect(q).toHaveCount(0)
  await expect(h.getByTestId(`brink-history-count-${id}`)).toHaveCount(0)
  expect((await brink(tb.id))!.recount_due).toBe(true)
})

test('gaps 17, 20 and 21: a part shows what went into its parent; neither deletes, and the dialog says why', async ({ page }) => {
  const src = await yeast.brink('YB-split')
  const [a, b] = [await yeast.brewed('Galactic'), await yeast.brewed('Enos')]
  await harvest(a, 'Yeast harvest', src.id, '30')
  await stock(src.id, 'pitch', { lb: '10', batch_id: b.id })
  const res = await (await apiAs('brewer1')).post(`/api/production/batches/${b.id}/split`, {
    data: { due_on: addDays(denverToday(), -1), parts: [{ stays: true, volume_bbl: 10 }, { volume_bbl: 10 }] },
  })
  expect(res.status(), await res.text()).toBe(201)
  const [part] = (await schedule()).batches.filter((x) => x.split_parent_id === b.id)

  await page.goto(`/batches/${part.id}`)
  await expect(page.getByTestId('batch-yeast-pitched')).toContainText(`10 lb from ${src.name} · US-05 gen 1 · into #${b.batch_number}`)
  // Gap 22: the page and its question name the part.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`#${b.batch_number}.${part.part_number}`)
  for (const [id, label, says] of [
    [part.id, `#${b.batch_number}.${part.part_number}`, "That's a part of a split. Undo the split to change it that way."],
    [b.id, `#${b.batch_number}`, 'Undo the split first.'],
  ] as const) {
    await page.goto(`/batches/${id}`)
    await page.getByRole('button', { name: 'Delete Batch' }).click()
    const q = page.getByTestId('batch-page-delete-confirm')
    await expect(q).toContainText(`delete batch "${label}"?`)
    await q.getByRole('button', { name: 'Delete' }).click()
    await expect(q.getByTestId('batch-page-delete-error')).toHaveText(says)
  }
})

test('gap 23: two people edit one count: the second save and a stale delete are refused, the input stays, reopening shows the change', async ({ page, browser }) => {
  const tb = await yeast.brink('YB-two')
  const a = await yeast.brewed('Galactic')
  await harvest(a, 'Yeast harvest', tb.id, '20')
  await addCount(tb.id)
  const now = async () => (await history(tb.id))[0].counts[0]
  const id = (await now()).id
  const stale = 'Someone else changed this count since you opened it. Close and reopen it to see their change.'
  const dialog = async (p: Page) => {
    await p.getByTestId(`brink-history-count-edit-${id}`).click()
    return p.getByTestId('brink-count-dialog')
  }

  const h = await action(page, tb.id, 'history', 'brink-history-dialog')
  const ctx = await browser.newContext({ storageState: authFile('breweryMgr') })
  const mgr = await ctx.newPage()
  await action(mgr, tb.id, 'history', 'brink-history-dialog')
  const mine = await dialog(page)
  const theirs = await dialog(mgr)
  await theirs.getByTestId('brink-count-cells').fill('700')
  await theirs.getByTestId('brink-count-note').fill('recounted')
  await theirs.getByRole('button', { name: 'Save' }).click()
  await expect(theirs).toHaveCount(0)

  await mine.getByTestId('brink-count-pct').fill('61')
  await mine.getByRole('button', { name: 'Save' }).click()
  await expect(mine).toContainText(stale)
  await expect(mine.getByTestId('brink-count-pct')).toHaveValue('61')
  // History behind it has the change; saving again is still refused.
  await expect(h.getByTestId(`brink-history-count-${id}`)).toContainText('Count 700 M/mL · 92% · recounted')
  const refused = page.waitForResponse((r) => r.url().includes(`/api/yeast/counts/${id}`) && r.request().method() === 'PUT')
  await mine.getByRole('button', { name: 'Save' }).click()
  expect((await refused).status()).toBe(409)
  expect(await now()).toMatchObject({ viable_millions_per_ml: '700', viability_pct: '92', note: 'recounted' })
  await mine.getByRole('button', { name: 'Cancel' }).click()

  // Reopened: their values, and it saves.
  const again = await dialog(page)
  await expect(again.getByTestId('brink-count-cells')).toHaveValue('700')
  await expect(again.getByTestId('brink-count-note')).toHaveValue('recounted')

  // The manager's Delete, open meanwhile on the version before: refused too.
  await mgr.getByTestId(`brink-history-count-delete-${id}`).click()
  await again.getByTestId('brink-count-pct').fill('61')
  await again.getByRole('button', { name: 'Save' }).click()
  await expect(again).toHaveCount(0)
  const q = mgr.getByTestId('brink-history-count-confirm')
  await q.getByRole('button', { name: 'Delete' }).click()
  await expect(q.getByTestId('brink-history-count-error')).toHaveText(stale)
  expect((await now()).viability_pct).toBe('61')
  await q.getByRole('button', { name: 'Cancel' }).click()
  await mgr.getByTestId(`brink-history-count-delete-${id}`).click()
  await expect(q).toContainText('(700 M/mL · 61%)')
  await q.getByRole('button', { name: 'Delete' }).click()
  await expect(q).toHaveCount(0)
  expect((await history(tb.id))[0].counts).toHaveLength(0)
  await ctx.close()
})

test('gap 24: a count moved across a harvest on top settles Recount due and the Count task, both ways', async ({ page }) => {
  const tb = await yeast.brink('YB-move')
  const a = await yeast.brewed('Galactic')
  const first = (await harvest(a, 'Yeast harvest', tb.id, '20')).due_on
  const api = await apiAs('brewer1')
  const add = await api.post('/api/yeast/counts', { data: { brink_id: tb.id, counted_on: first, viable_millions_per_ml: '1200', viability_pct: '92' } })
  expect(add.status()).toBe(201)
  const id = (await history(tb.id))[0].counts[0].id
  const top = (await harvest(a, 'Yeast harvest - #2', tb.id, '9', await brinkAnswer(tb.id, 'on_top'))).due_on
  const move = async (to: string) => {
    const h = await action(page, tb.id, 'history', 'brink-history-dialog')
    await h.getByTestId(`brink-history-count-edit-${id}`).click()
    const d = page.getByTestId('brink-count-dialog')
    await d.getByTestId('brink-count-date').fill(to)
    await d.getByRole('button', { name: 'Save' }).click()
    await expect(d).toHaveCount(0)
    await h.getByRole('button', { name: 'Close' }).click()
  }
  const row = page.getByTestId(`brink-row-${tb.id}`)
  await page.goto('/ingredients/brinks')
  await expect(row).toContainText('Recount due')
  await move(top)
  await expect(row).not.toContainText('Recount due')
  expect((await brink(tb.id))!.recount_due).toBe(false)
  await move(first)
  await expect(row).toContainText('Recount due')
  expect((await brink(tb.id))!.recount_due).toBe(true)
})
