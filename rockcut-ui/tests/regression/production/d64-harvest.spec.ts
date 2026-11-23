import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { batchOf, openGantt, snack, stepOf, today, undo, type SBatch } from './schedule'
import { apiAs } from './helpers'
import { addCount, brink, brinkAnswer, fillHarvest, history, pitchFrom, Yeast, yeastProduct } from './yeast'

// D64 Stop 3 (spec §5, decisions 10–17): the Yeast harvest step's check-off on
// the Gantt opens the Harvest dialog: Harvest yeast (brink with states, the
// yeast weight with the empty weight beside it, strains and generation from
// the pitches or asked) or Yeast dumped; the dirty and has-yeast questions;
// Mark not done refused once counted and allowed before; Undo refused the
// same way. The board and the brewhouse device are task-board-d64-harvest.
// Persist-verified through the API.

test.use({ storageState: authFile('brewer1'), viewport: { width: 1600, height: 1000 } })

const yeast = new Yeast()
test.afterEach(async () => {
  await yeast.cleanup()
})

const dot = (page: Page, id: number) => page.getByTestId(`gantt-step-${id}`)

/** Open a step's dialog on the Gantt and press Check off on `doneOn`. */
async function checkOff(page: Page, b: SBatch, name: string, doneOn?: string) {
  const s = stepOf(b, name)
  await openGantt(page)
  await dot(page, s.id).scrollIntoViewIfNeeded()
  await dot(page, s.id).click()
  await expect(page.getByTestId('step-dialog')).toBeVisible()
  await page.getByTestId('step-done-on').fill(doneOn ?? s.due_on)
  await page.getByTestId('step-check-off').click()
  return s
}

test('nothing pitched: the dialog asks the strain (gen 1); the harvest saves with the step; Count is due', async ({ page }) => {
  const us05 = await yeastProduct('US-05')
  const tb = await yeast.brink('YB-A', '148')
  const b = await yeast.brewed('Galactic')
  const s = await checkOff(page, b, 'Yeast harvest')

  const d = page.getByTestId('harvest-dialog')
  await expect(d.getByTestId('harvest-asked')).toBeVisible()
  await expect(d.getByTestId('harvest-generation')).toHaveValue('1')
  await d.getByTestId('harvest-brink').click()
  await expect(page.getByTestId(`harvest-brink-option-${tb.id}`)).toHaveText(`${tb.name} · empty`)
  await page.getByTestId(`harvest-brink-option-${tb.id}`).click()
  await expect(d.getByTestId('harvest-lb-helper')).toHaveText(`${tb.name} empty: 148 lb`)

  // No strain: refused before it's sent.
  await d.getByTestId('harvest-lb').fill('30')
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(d.getByTestId('harvest-dialog-error')).toHaveText('Pick the strain')

  await fillHarvest(page, { strainId: us05.id, note: 'good slurry' })
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(snack(page)).toHaveText(`Yeast harvest done · 30 lb → ${tb.name}.`)
  await expect(d).toHaveCount(0)

  expect(stepOf(await batchOf(b.id), 'Yeast harvest').done_on).toBe(s.due_on)
  const now = (await brink(tb.id))!
  expect(now.yeast).toMatchObject({ on_hand_lb: '30', generation: 1, strains: ['US-05'] })
  expect(now.recount_due).toBe(true)
})

test('from a brink pitch the dialog fills the strain and gen 2; the second pull defaults to that brink → Harvest on top', async ({ page }) => {
  const us05 = await yeastProduct('US-05')
  const [src, tb] = [await yeast.brink('YB-src'), await yeast.brink('YB-B')]
  const a = await yeast.brewed('Galactic')
  const b = await yeast.brewed('Enos')
  // #A's harvest (gen 1) into src, through the API; then 10 lb of it into #B.
  const api = await apiAs('brewer1')
  const res = await api.post(`/api/production/steps/${stepOf(a, 'Yeast harvest').id}/complete`, {
    data: { done_on: stepOf(a, 'Yeast harvest').due_on, yeast_outcome: 'harvested', yeast_brink_id: src.id, yeast_lb: '40', yeast_product_ids: [us05.id], yeast_generation: 1 },
  })
  expect(res.status(), await res.text()).toBe(200)
  await pitchFrom(src.id, b.id, '10')

  await checkOff(page, b, 'Yeast harvest')
  const d = page.getByTestId('harvest-dialog')
  await expect(d.getByTestId('harvest-asked')).toHaveCount(0)
  await expect(d.getByTestId('harvest-generation')).toHaveValue('2')
  await expect(d.getByTestId('harvest-strains')).toContainText('US-05')
  await fillHarvest(page, { brinkId: tb.id, lb: '30' })
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(snack(page)).toHaveText(`Yeast harvest done · 30 lb → ${tb.name}.`)

  // The second pull: the brink the first went into, which shows yeast → Harvest on top.
  await checkOff(page, await batchOf(b.id), 'Yeast harvest - #2')
  await expect(d.getByTestId('harvest-brink')).toContainText(`${tb.name} · 30 lb US-05 gen 2`)
  await d.getByTestId('harvest-lb').fill('12')
  await d.getByRole('button', { name: 'Save' }).click()
  const q = page.getByTestId('harvest-question-has-yeast')
  await expect(q).toContainText(`${tb.name} shows yeast in brink. Do you want to harvest on top or is this brink empty?`)
  await q.getByRole('button', { name: 'Harvest on top' }).click()
  await expect(snack(page)).toHaveText(`Yeast harvest - #2 done · 12 lb → ${tb.name}.`)
  expect((await brink(tb.id))!.yeast).toMatchObject({ on_hand_lb: '42', generation: 2 })
  expect((await history(tb.id))[0].entries.map((e) => e.kind)).toEqual(['harvested', 'harvested'])
})

test('a dirty brink asks first; Cancel keeps the dialog, Record anyway saves and clears the mark', async ({ page }) => {
  const us05 = await yeastProduct('US-05')
  const tb = await yeast.brink('YB-dirty')
  const a = await yeast.brewed('Galactic')
  const b = await yeast.brewed('Enos')
  const api = await apiAs('brewer1')
  const first = stepOf(a, 'Yeast harvest')
  await api.post(`/api/production/steps/${first.id}/complete`, {
    data: { done_on: first.due_on, yeast_outcome: 'harvested', yeast_brink_id: tb.id, yeast_lb: '5', yeast_product_ids: [us05.id], yeast_generation: 1 },
  })
  expect((await api.post(`/api/yeast/brinks/${tb.id}/dump`, { data: { occurred_on: today(), note: 'infected' } })).status()).toBe(200)
  expect((await brink(tb.id))!.dirty).toBe(true)

  await checkOff(page, b, 'Yeast harvest')
  const d = page.getByTestId('harvest-dialog')
  await fillHarvest(page, { brinkId: tb.id, lb: '20', strainId: us05.id })
  await expect(page.getByTestId(`harvest-brink`)).toContainText(`${tb.name} · dirty`)
  await d.getByRole('button', { name: 'Save' }).click()
  const q = page.getByTestId('harvest-question-dirty')
  await expect(q).toContainText(`${tb.name} is marked as dirty, record harvest anyway?`)
  await q.getByRole('button', { name: 'Cancel' }).click()
  await expect(q).toHaveCount(0)
  await expect(d).toBeVisible()
  expect(stepOf(await batchOf(b.id), 'Yeast harvest').done_on).toBeNull()

  await d.getByRole('button', { name: 'Save' }).click()
  await page.getByTestId('harvest-question-dirty').getByRole('button', { name: 'Record anyway' }).click()
  await expect(snack(page)).toHaveText(`Yeast harvest done · 20 lb → ${tb.name}.`)
  expect((await brink(tb.id))!.dirty).toBe(false)
})

test('gap 19: the yeast changed while it was asked about: asked again with the brink as it is now, nothing written until answered', async ({ page }) => {
  const us05 = await yeastProduct('US-05')
  const tb = await yeast.brink('YB-stale')
  const [a, b] = [await yeast.brewed('Galactic'), await yeast.brewed('Enos')]
  const api = await apiAs('brewer1')
  const other = await apiAs('brewer2')
  const first = stepOf(a, 'Yeast harvest')
  const fields = { done_on: first.due_on, yeast_outcome: 'harvested', yeast_brink_id: tb.id, yeast_product_ids: [us05.id], yeast_generation: 1 }
  expect((await api.post(`/api/production/steps/${first.id}/complete`, { data: { ...fields, yeast_lb: '12' } })).status()).toBe(200)

  const s = await checkOff(page, b, 'Yeast harvest')
  const d = await fillHarvest(page, { brinkId: tb.id, lb: '9', strainId: us05.id })
  await d.getByRole('button', { name: 'Save' }).click()
  const q = page.getByTestId('harvest-question-has-yeast')
  await expect(q.getByTestId('harvest-question-now')).toHaveText(`${tb.name} · 12 lb US-05 gen 1`)

  // brewer2's second pull answers "This brink is empty" first.
  const second = stepOf(a, 'Yeast harvest - #2')
  const taken = await other.post(`/api/production/steps/${second.id}/complete`, {
    data: { ...fields, done_on: second.due_on, yeast_lb: '8', yeast_generation: 5, ...(await brinkAnswer(tb.id, 'empty')) },
  })
  expect(taken.status(), await taken.text()).toBe(200)

  await q.getByRole('button', { name: 'This brink is empty' }).click()
  await expect(q.getByTestId('harvest-question-now')).toHaveText(`It changed since you answered. ${tb.name} · 8 lb US-05 gen 5`)
  expect((await brink(tb.id))!.yeast?.on_hand_lb).toBe('8')
  expect(stepOf(await batchOf(b.id), 'Yeast harvest').done_on).toBeNull()

  await q.getByRole('button', { name: 'Harvest on top' }).click()
  await expect(snack(page)).toHaveText(`Yeast harvest done · 9 lb → ${tb.name}.`)
  expect((await brink(tb.id))!.yeast?.on_hand_lb).toBe('17')
  expect(stepOf(await batchOf(b.id), 'Yeast harvest').done_on).toBe(s.due_on)
})

test('Yeast dumped with a note: no brink changes; the step says so', async ({ page }) => {
  const b = await yeast.brewed('Galactic')
  await checkOff(page, b, 'Yeast harvest')
  const d = page.getByTestId('harvest-dialog')
  await d.getByTestId('harvest-outcome-dumped').check()
  await expect(d.getByTestId('harvest-brink')).toHaveCount(0)
  await d.getByTestId('harvest-note').fill('too much trub')
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(snack(page)).toHaveText('Yeast harvest done · Yeast dumped.')
  const s = stepOf(await batchOf(b.id), 'Yeast harvest') as ReturnType<typeof stepOf> & { yeast_outcome: string; yeast_note: string }
  expect([s.yeast_outcome, s.yeast_note]).toEqual(['dumped', 'too much trub'])

  await dot(page, s.id).click()
  await expect(page.getByTestId('step-dialog-yeast')).toHaveText('Yeast dumped · too much trub')
})

test('Mark not done: refused once counted (with the sentence); allowed before, and the Count task goes', async ({ page }) => {
  const us05 = await yeastProduct('US-05')
  const tb = await yeast.brink('YB-un')
  const b = await yeast.brewed('Galactic')
  await checkOff(page, b, 'Yeast harvest')
  await fillHarvest(page, { brinkId: tb.id, lb: '30', strainId: us05.id })
  await page.getByTestId('harvest-dialog').getByRole('button', { name: 'Save' }).click()
  await expect(snack(page)).toContainText('Yeast harvest done')
  await addCount(tb.id)

  const s = stepOf(b, 'Yeast harvest')
  await dot(page, s.id).click()
  await page.getByTestId('step-uncheck').click()
  await expect(page.getByTestId('step-dialog')).toContainText(`${tb.name} has been pitched from or counted since this harvest. The harvest can't be un-checked.`)
  expect(stepOf(await batchOf(b.id), 'Yeast harvest').done_on).not.toBeNull()
  await page.keyboard.press('Escape')

  // The count goes (its maker), and then it un-checks: the brink is empty again.
  const counts = (await history(tb.id))[0].counts
  const api = await apiAs('brewer1')
  for (const c of counts) expect((await api.delete(`/api/yeast/counts/${c.id}?lock_version=${c.lock_version}`)).status()).toBe(204)
  await page.reload()
  await dot(page, s.id).click()
  await page.getByTestId('step-uncheck').click()
  await expect(snack(page)).toHaveText('Yeast harvest is not done.')
  const after = (await brink(tb.id))!
  expect(after.yeast).toBeNull()
  expect(after.recount_due).toBe(false)
})

test('Undo of the check-off: allowed with nothing after it; refused once counted', async ({ page }) => {
  const us05 = await yeastProduct('US-05')
  const tb = await yeast.brink('YB-undo')
  const b = await yeast.brewed('Galactic')
  await checkOff(page, b, 'Yeast harvest')
  await fillHarvest(page, { brinkId: tb.id, lb: '30', strainId: us05.id })
  await page.getByTestId('harvest-dialog').getByRole('button', { name: 'Save' }).click()
  await expect(snack(page)).toContainText('Yeast harvest done')
  await undo(page)
  expect(stepOf(await batchOf(b.id), 'Yeast harvest').done_on).toBeNull()
  expect((await brink(tb.id))!.yeast).toBeNull()

  await checkOff(page, b, 'Yeast harvest')
  await fillHarvest(page, { brinkId: tb.id, lb: '30', strainId: us05.id })
  await page.getByTestId('harvest-dialog').getByRole('button', { name: 'Save' }).click()
  await expect(snack(page)).toContainText('Yeast harvest done')
  await addCount(tb.id)
  await page.getByTestId('gantt-undo').click()
  await expect(snack(page)).toHaveText(`${tb.name} has been pitched from or counted since this harvest. The harvest can't be un-checked.`)
  expect(stepOf(await batchOf(b.id), 'Yeast harvest').done_on).not.toBeNull()
})

test('Undo of Mark not done is refused: check it off again', async ({ page }) => {
  const us05 = await yeastProduct('US-05')
  const tb = await yeast.brink('YB-redo')
  const b = await yeast.brewed('Galactic')
  await checkOff(page, b, 'Yeast harvest')
  await fillHarvest(page, { brinkId: tb.id, lb: '30', strainId: us05.id })
  await page.getByTestId('harvest-dialog').getByRole('button', { name: 'Save' }).click()
  await expect(snack(page)).toContainText('Yeast harvest done')
  await dot(page, stepOf(b, 'Yeast harvest').id).click()
  await page.getByTestId('step-uncheck').click()
  await expect(snack(page)).toHaveText('Yeast harvest is not done.')
  await page.getByTestId('gantt-undo').click()
  await expect(snack(page)).toHaveText('Check it off again to record the harvest.')
  expect(stepOf(await batchOf(b.id), 'Yeast harvest').done_on).toBeNull()
})

test('one press at a time: a double press on Save writes once', async ({ page }) => {
  const us05 = await yeastProduct('US-05')
  const tb = await yeast.brink('YB-dbl')
  const b = await yeast.brewed('Galactic')
  const s = await checkOff(page, b, 'Yeast harvest')
  const d = await fillHarvest(page, { brinkId: tb.id, lb: '30', strainId: us05.id })
  let posts = 0
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith(`/steps/${s.id}/complete`) && !r.postData()?.includes('"preview"')) posts += 1
  })
  await d.getByRole('button', { name: 'Save' }).dblclick()
  await expect(snack(page)).toContainText('Yeast harvest done')
  expect(posts).toBe(1)
  expect((await history(tb.id))[0].entries).toHaveLength(1)
})

test('Stop 4: Delete planned batch is refused once yeast went into it, with the sentence; nothing deleted', async ({ page }) => {
  const us05 = await yeastProduct('US-05')
  const tb = await yeast.brink('YB-del')
  const a = await yeast.brewed('Galactic')
  const brand = await yeast.made.brand('Oktoberfest')
  const tank = await yeast.made.tank('FV')
  const planned = await yeast.made.plan({ brand_id: brand.id, template: '[SEED] Standard ale', brew_on: today(), tank_ids: [tank.id] })
  const api = await apiAs('brewer1')
  const h = stepOf(a, 'Yeast harvest')
  expect(
    (await api.post(`/api/production/steps/${h.id}/complete`, { data: { done_on: h.due_on, yeast_outcome: 'harvested', yeast_brink_id: tb.id, yeast_lb: '20', yeast_product_ids: [us05.id], yeast_generation: 1 } })).status(),
  ).toBe(200)
  await pitchFrom(tb.id, planned.id, '5')

  await openGantt(page)
  await page.getByTestId(`gantt-bar-${planned.id}-0`).click()
  await page.getByTestId('batch-delete').click()
  await page.getByRole('dialog', { name: 'Delete planned batch' }).getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByTestId('batch-dialog-error')).toHaveText(`${planned.label} has yeast pitched into it or harvested from it. Remove those first.`)
  expect(await batchOf(planned.id)).toBeTruthy()
})
