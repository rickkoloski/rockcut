import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs } from './helpers'
import { addDays, batchOf, Made, openGantt, schedule, snack, stepOf, today, undo, type SBatch } from './schedule'

// D48 DEV gate fix cycle 6 (lead decisions 7): a split part can't get ahead
// of its parent's Split (Z1), and a late check-off of the Split names the
// parts it moves (Z2). The rules themselves are in ExUnit (split_moves_test).

test.use({ storageState: authFile('brewer1'), viewport: { width: 1440, height: 1400 } })

const ALE = '[SEED] Standard ale'
const P = '/api/production'
const made = new Made()
// Each test cleans up after itself, failed or not.
test.afterEach(() => made.cleanup())

async function openBatch(page: Page, b: { id: number }, vessel = 0) {
  await page.getByTestId(`gantt-bar-${b.id}-${vessel}`).click()
  await expect(page.getByTestId('batch-dialog')).toBeVisible()
}

async function openStep(page: Page, stepId: number) {
  await page.getByTestId(`batch-step-note-${stepId}`).click()
  await expect(page.getByTestId('step-dialog')).toBeVisible()
}

/** Plan an ale brewed `brewIn` days from today, brew day checked off, split two days before FDH (part 1 stays, part 2 → `into`). */
async function brewedSplit(brewIn: number, tank: number, into: number): Promise<{ b: SBatch; p1: SBatch; p2: SBatch }> {
  const brand = await made.brand('Ale')
  const b = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), brewIn), tank_ids: [tank] })
  await made.checkOff(stepOf(b, 'Brew day'), `T${Date.now() % 1_000_000}`)
  const res = await (await apiAs('brewer1')).post(`${P}/batches/${b.id}/split`, {
    data: { due_on: addDays(stepOf(b, 'FDH').due_on, -2), parts: [{ stays: true, volume_bbl: 12 }, { tank_id: into, volume_bbl: 8 }] },
  })
  expect(res.status()).toBe(201)
  const [p1, p2] = (await schedule()).batches.filter((x) => x.split_parent_id === b.id).sort((x, y) => x.part_number! - y.part_number!)
  return { b: await batchOf(b.id), p1, p2 }
}

const dates = (b: SBatch) => b.steps.map((s) => `${s.name} ${s.due_on}`).sort()

test('Z1: a part’s Package waits for the Split; the Split can’t be marked not done while a part’s Package is done', async ({ page }) => {
  const [a, d] = [await made.tank('FV2'), await made.tank('Q1SD')]
  // Brewed 15 days ago: the Split is past (the parent's bar still on the Gantt).
  const { b, p2 } = await brewedSplit(-15, a.id, d.id)
  const pkg = stepOf(p2, 'Package')
  await openGantt(page)

  // The part's Package with the Split not done: refused in the step dialog.
  await openBatch(page, p2)
  await openStep(page, pkg.id)
  await page.getByTestId('step-check-off').click()
  await expect(page.getByTestId('step-dialog-error')).toHaveText('Check off Split - Transfer first.')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('step-dialog')).toHaveCount(0)
  if (await page.getByTestId('batch-dialog').isVisible()) await page.getByTestId('batch-dialog-close').click()
  const refused = await batchOf(p2.id)
  expect([refused.status, stepOf(refused, 'Package').done_on]).toEqual(['planned', null])

  // In order: the Split, then the part's Package. Now the Split stays done.
  await made.checkOff(stepOf(b, 'Split - Transfer'))
  // The Package checked off today, early (only it moves).
  await made.checkOff({ ...pkg, due_on: pkg.due_on < today() ? pkg.due_on : today() })
  const part = await batchOf(p2.id)
  expect(part.status).toBe('completed')
  await openGantt(page)
  await openBatch(page, b)
  await openStep(page, stepOf(b, 'Split - Transfer').id)
  await page.getByTestId('step-uncheck').click()
  await expect(page.getByTestId('step-dialog-error')).toHaveText(`Mark ${part.label}: Package not done first.`)
  await page.keyboard.press('Escape')
  expect(stepOf(await batchOf(b.id), 'Split - Transfer').done_on).not.toBeNull()
})

test('Z2: checking the Split off late names the parts that moved with it; Undo puts the tree back', async ({ page }) => {
  const [a, d] = [await made.tank('FV2'), await made.tank('Q1SD')]
  // Brewed 15 days ago: the Split was due some days ago. Part 1 stays, so nothing else follows it: no prompt.
  const { b, p1, p2 } = await brewedSplit(-15, a.id, d.id)
  const before = [b, p1, p2].map(dates)
  const split = stepOf(b, 'Split - Transfer')
  const late = Math.round((Date.parse(today()) - Date.parse(split.due_on)) / 86_400_000)
  expect(late).toBeGreaterThan(1)
  await openGantt(page)
  await openBatch(page, b)
  await openStep(page, split.id)
  await expect(page.getByTestId('step-done-on')).toHaveValue(today())
  await page.getByTestId('step-check-off').click()
  await expect(snack(page)).toHaveText(`Split - Transfer done, ${late} days late. ${p1.label} and ${p2.label} moved with it.`)
  expect(stepOf(await batchOf(p2.id), 'Carb').due_on).toBe(addDays(stepOf(p2, 'Carb').due_on, late))
  if (await page.getByTestId('batch-dialog').isVisible()) await page.getByTestId('batch-dialog-close').click()
  await undo(page)
  expect(await Promise.all([b, p1, p2].map(async (x) => dates(await batchOf(x.id))))).toEqual(before)
  expect(stepOf(await batchOf(b.id), 'Split - Transfer').done_on).toBeNull()
})
