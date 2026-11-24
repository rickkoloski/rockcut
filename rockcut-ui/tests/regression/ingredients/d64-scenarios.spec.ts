import { test, expect, type Browser, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { adoptParty, adoptProduct, apiAs, categoryId, denverToday, expectNoSidewaysScroll, expectPhoneDialogClosed, makeD65Ingredient, openDialog, pick, saveProduct, tempTag } from './helpers'
import { batchOf, snack, stepOf, today, type SBatch } from '../production/schedule'
import { brinkAnswer, brink, fillHarvest, history, Yeast, yeastProduct } from '../production/yeast'

// D64 Stop 4 (spec §13, the persona scenarios not yet walked through the
// screens): yeast purchasing (order and receive bricks, To order, Totals with
// bricks and pitchables apart); Mother → gen 1 → gen 2; a co-ferment and its
// repitch; the same strain at another generation on top; Dump / Adjust /
// Mark clean / Add count on the Brinks tab; two people pitching the last lb;
// a double press on Pitch and Add count; a bartender. Lean (no tank or
// template of its own: `ingredients` runs beside `production`). [TEST-TEMP]
// rows only; a batch purchased yeast went into is left for `setup` (`keep`).

test.use({ storageState: authFile('brewer1') })

const yeast = new Yeast({ lean: true })
test.afterEach(async () => {
  await yeast.cleanup()
})

async function ok<T>(res: { status: () => number; text: () => Promise<string>; json: () => Promise<{ data: T }> }, status = 201): Promise<T> {
  expect(res.status(), await res.text()).toBe(status)
  return (await res.json()).data
}

/** A [TEST-TEMP] lab (manufacturer and supplier) with a yeast product of `form`, and its offer. */
async function tempYeast(label: string, form: 'Dry' | 'Liquid', lab?: { id: number; name: string }) {
  const owner = await apiAs('owner')
  const api = await apiAs('brewer1')
  lab ??= await ok<{ id: number; name: string }>(await owner.post('/api/parties', { data: { name: tempTag(`${label} Labs`), roles: ['manufacturer', 'supplier'] } }))
  adoptParty(lab.id)
  const strain = await makeD65Ingredient(`${label} Ale`, 'yeast')
  const product = await ok<{ id: number; name: string; display_name: string }>(
    await api.post('/api/ingredient_products', {
      data: { ingredient_id: strain.id, manufacturer_party_id: lab.id, name: `TT-${label.slice(0, 4).toUpperCase()}`, form, unit: 'each', ...(form === 'Liquid' ? { features: { pitch_bbl: '7' } } : {}) },
    }),
  )
  adoptProduct(product.id)
  const pack = form === 'Dry' ? 'brick' : 'pitchable'
  const offer = await ok<{ id: number }>(await api.post('/api/supplier_offers', { data: { product_id: product.id, supplier_party_id: lab.id, pack_name: pack, pack_size: '1' } }))
  await ok(await api.post(`/api/supplier_offers/${offer.id}/prices`, { data: { price_per_pack: form === 'Dry' ? '76.99' : '165.00', effective_on: '2020-01-01' } }))
  return { lab, strain, product, offer }
}

async function lot(productId: number, supplierId: number, pack: string, quantity: string, features?: Record<string, string>) {
  return ok<{ id: number }>(
    await (await apiAs('brewer1')).post('/api/ingredient_lots', {
      data: { product_id: productId, supplier_party_id: supplierId, pack_name: pack, pack_size: '1', lot_number: tempTag('lot'), received_date: denverToday(), initial_kind: 'opening', initial_quantity: quantity, ...(features ? { features } : {}) },
    }),
  )
}

/** A harvest through the API on the step's own day. */
async function harvestApi(b: SBatch, step: string, brinkId: number, lb: string, productIds: number[], generation: number, extra: Record<string, unknown> = {}) {
  const s = stepOf(b, step)
  await ok(
    await (await apiAs('brewer1')).post(`/api/production/steps/${s.id}/complete`, {
      data: { done_on: s.due_on, yeast_outcome: 'harvested', yeast_brink_id: brinkId, yeast_lb: lb, yeast_product_ids: productIds, yeast_generation: generation, ...extra },
    }),
    200,
  )
}

/** Open the step's dialog through the Gantt's `?step=` link and press Check off on its own day. */
async function checkOff(page: Page, b: SBatch, name: string) {
  const s = stepOf(await batchOf(b.id), name)
  await page.goto(`/brewery/production?step=${s.id}&day=${s.due_on}`)
  await expect(page.getByTestId('step-dialog')).toBeVisible()
  await page.getByTestId('step-done-on').fill(s.due_on)
  await page.getByTestId('step-check-off').click()
  await expect(page.getByTestId('harvest-dialog')).toBeVisible()
  return page.getByTestId('harvest-dialog')
}

async function brinkAction(page: Page, brinkId: number, action: string, dialog: string) {
  await page.goto('/ingredients/brinks')
  await page.getByTestId(`brink-actions-${brinkId}`).click()
  await page.getByTestId(`brink-action-${action}`).click()
  const d = page.getByTestId(dialog)
  await expect(d).toBeVisible()
  return d
}

const openTasks = async (brinkId: number) => {
  const b = await brink(brinkId)
  return { recount: b!.recount_due, clean: b!.clean_due, dirty: b!.dirty }
}

async function as(browser: Browser, who: 'owner' | 'brewer2' | 'bartender1') {
  const ctx = await browser.newContext({ storageState: authFile(who) })
  return ctx.newPage()
}

test('purchasing: 4 bricks ordered and received read "4 bricks"; To order under the minimum; Totals keeps bricks and pitchables apart', async ({ page, browser }) => {
  test.slow()
  const dry = await tempYeast('Brick', 'Dry')
  const liquid = await tempYeast('Pitch', 'Liquid', dry.lab)
  // A Liquid lot of 2 pitchables at 10 bbl; the product still says 7.
  await lot(liquid.product.id, dry.lab.id, 'pitchable', '2', { pitch_bbl: '10' })

  const order = await ok<{ id: number }>(
    await (await apiAs('brewer1')).post('/api/purchase_orders', {
      data: { supplier_party_id: dry.lab.id, ordered_on: denverToday(), lines: [{ offer_id: dry.offer.id, packs_ordered: 4 }] },
    }),
  )
  await page.goto(`/ingredients/orders/${order.id}`)
  const r = await openDialog(page, page.getByTestId('order-receive'), 'receive-dialog')
  const line = r.getByTestId(/^receive-line-\d+$/).first()
  await pick(page, line, 'Goes to', 'New lot #')
  await line.getByLabel('Lot #').fill(tempTag('B'))
  await r.getByRole('button', { name: 'Receive' }).click()
  await expect(r).toHaveCount(0)
  await page.goto(`/ingredients/products/${dry.product.id}`)
  await expect(page.getByTestId('product-on-hand')).toHaveText('4 bricks')

  expect((await saveProduct(dry.product.id, { min_on_hand_packs: 5 })).status()).toBe(200)
  await page.goto('/ingredients/to-order')
  await expect(page.getByTestId(`to-order-${dry.product.id}`)).toBeVisible()
  await expect(page.getByTestId(`to-order-${dry.product.id}-on-hand`)).toHaveText('4 bricks')

  const owner = await as(browser, 'owner')
  await owner.goto('/ingredients/totals')
  await owner.getByTestId('totals-inventory-supplier').click()
  await owner.getByRole('option', { name: dry.lab.name }).click()
  await expect(owner.getByTestId('totals-inventory-total-bricks')).toHaveText('4 bricks')
  await expect(owner.getByTestId('totals-inventory-total-pitchables')).toHaveText('2 pitchables')
  await owner.context().close()
})

test('Mother → gen 1 → gen 2: pitch 2 bricks, the harvest fills gen 1, Add count ticks Count, pitch it all (dirty, Clean), the next harvest fills gen 2', async ({ page }) => {
  test.slow()
  const dry = await tempYeast('Mother', 'Dry')
  await lot(dry.product.id, dry.lab.id, 'brick', '6')
  const tb = await yeast.brink('YB-chain', '148')
  const a = await yeast.brewed('Galactic')
  const b = await yeast.brewed('Enos')
  yeast.keep(a)

  // Pitch 2 bricks of the Mother into #A from the product page.
  await page.goto(`/ingredients/products/${dry.product.id}`)
  const p = await openDialog(page, page.getByTestId('product-pitch'), 'pitch-dialog')
  await pick(page, p, 'Batch', a.label)
  await p.getByTestId('pitch-quantity-lb').fill('2')
  await p.getByRole('button', { name: 'Pitch' }).click()
  await expect(p).toHaveCount(0)

  // #A's harvest: gen 1 of the Mother's strain, into the brink.
  let d = await checkOff(page, a, 'Yeast harvest - #2')
  await expect(d.getByTestId('harvest-generation')).toHaveValue('1')
  await expect(d.getByTestId('harvest-strains')).toContainText(dry.product.name)
  await fillHarvest(page, { brinkId: tb.id, lb: '30', note: 'good slurry' })
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(snack(page)).toHaveText(`Yeast harvest - #2 done · 30 lb → ${tb.name}.`)
  expect(await openTasks(tb.id)).toEqual({ recount: true, clean: false, dirty: false })

  // Add count on the Brinks tab: the Count task ticks.
  const c = await brinkAction(page, tb.id, 'count', 'brink-count-dialog')
  await c.getByTestId('brink-count-cells').fill('1200')
  await c.getByTestId('brink-count-pct').fill('92')
  await c.getByRole('button', { name: 'Save' }).click()
  await expect(c).toHaveCount(0)
  await expect(page.getByTestId(`brink-count-${tb.id}`)).toContainText('1,200 M/mL · 92%')
  expect((await openTasks(tb.id)).recount).toBe(false)

  // Pitch all 30 lb into #B: empty, dirty, Clean due.
  const pd = await brinkAction(page, tb.id, 'pitch', 'brink-pitch-dialog')
  await pick(page, pd, 'Batch', b.label)
  await pd.getByTestId('brink-pitch-lb').fill('30')
  await pd.getByRole('button', { name: 'Pitch' }).click()
  await expect(pd).toHaveCount(0)
  expect(await openTasks(tb.id)).toEqual({ recount: false, clean: true, dirty: true })

  // #B's harvest fills gen 2.
  d = await checkOff(page, b, 'Yeast harvest - #2')
  await expect(d.getByTestId('harvest-generation')).toHaveValue('2')
  await expect(d.getByTestId('harvest-strains')).toContainText(dry.product.name)
  await d.getByRole('button', { name: 'Cancel' }).click()
})

test('co-ferment: two strains pitched into a batch harvest as "Co-ferment … gen 1"; a repitch of it harvests at gen 2', async ({ page }) => {
  test.slow()
  const [us05, s04] = [await yeastProduct('US-05'), await yeastProduct('S-04')]
  const [s1, s2, tb] = [await yeast.brink('YB-s1'), await yeast.brink('YB-s2'), await yeast.brink('YB-co')]
  const x = await yeast.brewed('Galactic')
  const y = await yeast.brewed('Enos')
  const c = await yeast.brewed('Crusher')
  const e = await yeast.brewed('Altruism')
  await harvestApi(x, 'Yeast harvest', s1.id, '20', [us05.id], 1)
  await harvestApi(y, 'Yeast harvest', s2.id, '20', [s04.id], 2)

  // Pitch 10 lb of each into #C on the Brinks tab.
  for (const s of [s1, s2]) {
    const pd = await brinkAction(page, s.id, 'pitch', 'brink-pitch-dialog')
    await pick(page, pd, 'Batch', c.label)
    await pd.getByTestId('brink-pitch-lb').fill('10')
    await pd.getByRole('button', { name: 'Pitch' }).click()
    await expect(pd).toHaveCount(0)
  }

  let d = await checkOff(page, c, 'Yeast harvest - #2')
  await expect(d.getByTestId('harvest-generation')).toHaveValue('1')
  await expect(d.getByTestId('harvest-coferment')).toHaveText('Two or more strains make a co-ferment.')
  await fillHarvest(page, { brinkId: tb.id, lb: '20' })
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(snack(page)).toContainText(`20 lb → ${tb.name}`)
  await page.goto('/ingredients/brinks')
  await expect(page.getByTestId(`brink-row-${tb.id}`)).toContainText(/Co-ferment: (US-05 \+ S-04|S-04 \+ US-05) · gen 1/)

  // The repitch: 10 lb of the co-ferment into #E; its harvest fills the same co-ferment, gen 2.
  const pd = await brinkAction(page, tb.id, 'pitch', 'brink-pitch-dialog')
  await pick(page, pd, 'Batch', e.label)
  await pd.getByTestId('brink-pitch-lb').fill('10')
  await pd.getByRole('button', { name: 'Pitch' }).click()
  await expect(pd).toHaveCount(0)
  d = await checkOff(page, e, 'Yeast harvest - #2')
  await expect(d.getByTestId('harvest-generation')).toHaveValue('2')
  await expect(d.getByTestId('harvest-strains')).toContainText('US-05')
  await expect(d.getByTestId('harvest-strains')).toContainText('S-04')
  await d.getByRole('button', { name: 'Cancel' }).click()
})

test('the same strain at another generation on top: US-05 gen 4 onto gen 2 makes the brink gen 4, from both batches', async ({ page }) => {
  const us05 = await yeastProduct('US-05')
  const tb = await yeast.brink('YB-gen')
  const a = await yeast.brewed('Galactic')
  const b = await yeast.brewed('Enos')
  await harvestApi(a, 'Yeast harvest', tb.id, '20', [us05.id], 2)

  const d = await checkOff(page, b, 'Yeast harvest - #2')
  await fillHarvest(page, { brinkId: tb.id, lb: '10', strainId: us05.id, generation: '4' })
  await d.getByRole('button', { name: 'Save' }).click()
  await page.getByTestId('harvest-question-has-yeast').getByRole('button', { name: 'Harvest on top' }).click()
  await expect(snack(page)).toContainText(`10 lb → ${tb.name}`)

  await page.goto('/ingredients/brinks')
  const row = page.getByTestId(`brink-row-${tb.id}`)
  await expect(row).toContainText('US-05 · gen 4')
  await expect(row).toContainText(`${a.label} (gen 2) and ${b.label} (gen 4)`)
})

test('the Brinks tab: Adjust weight 40 → 33 with a note, Dump ("infected": dirty, Clean due), Mark clean ticks Clean', async ({ page }) => {
  const us05 = await yeastProduct('US-05')
  const tb = await yeast.brink('YB-act')
  const a = await yeast.brewed('Galactic')
  await harvestApi(a, 'Yeast harvest', tb.id, '40', [us05.id], 1)

  const adj = await brinkAction(page, tb.id, 'adjust', 'brink-adjust-dialog')
  await adj.getByTestId('brink-adjust-lb').fill('33')
  await adj.getByTestId('brink-adjust-note').fill('settled')
  await adj.getByRole('button', { name: 'Save' }).click()
  await expect(adj).toHaveCount(0)
  await expect(page.getByTestId(`brink-on-hand-${tb.id}`)).toContainText('33 lb')

  const dump = await brinkAction(page, tb.id, 'dump', 'brink-dump-dialog')
  await dump.getByTestId('brink-dump-note').fill('infected')
  await dump.getByRole('button', { name: 'Dump' }).click()
  await expect(dump).toHaveCount(0)
  expect(await openTasks(tb.id)).toEqual({ recount: false, clean: true, dirty: true })
  const [rec] = await history(tb.id)
  expect(rec.entries.map((x) => x.kind)).toEqual(['harvested', 'adjusted', 'dumped'])

  const clean = await brinkAction(page, tb.id, 'clean', 'brink-clean-dialog')
  await clean.getByRole('button', { name: 'Mark clean' }).click()
  await expect(clean).toHaveCount(0)
  expect(await openTasks(tb.id)).toEqual({ recount: false, clean: false, dirty: false })
})

test('two people pitch the last 20 lb of one brink: the second is refused, one pitch written', async ({ page, browser }) => {
  const us05 = await yeastProduct('US-05')
  const tb = await yeast.brink('YB-two')
  const a = await yeast.brewed('Galactic')
  const b = await yeast.brewed('Enos')
  await harvestApi(a, 'Yeast harvest', tb.id, '20', [us05.id], 1)

  const other = await as(browser, 'brewer2')
  const dialogs = []
  for (const p of [page, other]) {
    const pd = await brinkAction(p, tb.id, 'pitch', 'brink-pitch-dialog')
    await pick(p, pd, 'Batch', b.label)
    await pd.getByTestId('brink-pitch-lb').fill('20')
    dialogs.push(pd)
  }
  await dialogs[0].getByRole('button', { name: 'Pitch' }).click()
  await expect(dialogs[0]).toHaveCount(0)
  await dialogs[1].getByRole('button', { name: 'Pitch' }).click()
  await expect(dialogs[1].getByTestId('brink-pitch-dialog-error')).toBeVisible()
  await expect(dialogs[1]).toBeVisible()
  await other.context().close()
  const pitches = (await history(tb.id)).flatMap((r) => r.entries).filter((x) => x.kind === 'pitched')
  expect(pitches).toHaveLength(1)
})

test('a double press on Pitch and on Add count writes once', async ({ page }) => {
  const us05 = await yeastProduct('US-05')
  const tb = await yeast.brink('YB-dbl')
  const a = await yeast.brewed('Galactic')
  const b = await yeast.brewed('Enos')
  await harvestApi(a, 'Yeast harvest', tb.id, '30', [us05.id], 1)

  const c = await brinkAction(page, tb.id, 'count', 'brink-count-dialog')
  await c.getByTestId('brink-count-cells').fill('1100')
  await c.getByTestId('brink-count-pct').fill('90')
  await c.getByRole('button', { name: 'Save' }).dblclick()
  await expect(c).toHaveCount(0)

  const pd = await brinkAction(page, tb.id, 'pitch', 'brink-pitch-dialog')
  await pick(page, pd, 'Batch', b.label)
  await pd.getByTestId('brink-pitch-lb').fill('5')
  await pd.getByRole('button', { name: 'Pitch' }).dblclick()
  await expect(pd).toHaveCount(0)

  const [rec] = await history(tb.id)
  expect(rec.counts).toHaveLength(1)
  expect(rec.entries.filter((x) => x.kind === 'pitched')).toHaveLength(1)
})

test('a count before the latest harvest still shows, marked, with Recount due', async ({ page }) => {
  const us05 = await yeastProduct('US-05')
  const tb = await yeast.brink('YB-cnt')
  const a = await yeast.brewed('Galactic')
  // The first pull yesterday, counted yesterday; the second today, on top.
  await harvestApi(a, 'Yeast harvest', tb.id, '20', [us05.id], 1)
  const yesterday = stepOf(a, 'Yeast harvest').due_on
  await ok(await (await apiAs('brewer1')).post('/api/yeast/counts', { data: { brink_id: tb.id, counted_on: yesterday, viable_millions_per_ml: '1200', viability_pct: '92' } }))
  await harvestApi(a, 'Yeast harvest - #2', tb.id, '10', [us05.id], 1, await brinkAnswer(tb.id, 'on_top'))

  const short = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`
  await page.goto('/ingredients/brinks')
  await expect(page.getByTestId(`brink-count-${tb.id}`)).toContainText(`counted ${short(yesterday)} · before the ${short(today())} harvest`)
  await expect(page.getByTestId(`brink-recount-due-${tb.id}`)).toBeVisible()
})

test('bartender1: no Ingredient Library or Brinks in the nav, and 403 from the yeast routes', async ({ browser }) => {
  const page = await as(browser, 'bartender1')
  await page.goto('/')
  await expect(page.getByText('Home', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Ingredient Library')).toHaveCount(0)
  const api = await apiAs('bartender1')
  for (const path of ['/api/yeast/brinks', '/api/yeast/strain_types', `/api/ingredient_products?category_id=${await categoryId('yeast')}`])
    expect((await api.get(path)).status(), path).toBe(403)
  await page.context().close()
})

test.describe('at 360 px', () => {
  test.use({ viewport: { width: 360, height: 780 } })

  test('Pitch and Add count on the Brinks tab have no sideways scroll', async ({ page }) => {
    const us05 = await yeastProduct('US-05')
    const tb = await yeast.brink('YB-phone-act', '148')
    const a = await yeast.brewed('Galactic')
    await harvestApi(a, 'Yeast harvest', tb.id, '20', [us05.id], 1)
    for (const [action, dialog] of [
      ['pitch', 'brink-pitch-dialog'],
      ['count', 'brink-count-dialog'],
    ]) {
      const d = await brinkAction(page, tb.id, action, dialog)
      await expectNoSidewaysScroll(page)
      await d.getByRole('button', { name: 'Cancel' }).click()
      await expectPhoneDialogClosed(page, d)
    }
  })
})
