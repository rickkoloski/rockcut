import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs } from './helpers'
import { addDays, batchOf, Made, openGantt, schedule, snack, stepOf, today, undo, type SBatch } from './schedule'

// D48 DEV gate fix cycle 5 (lead decisions 6): a split batch moves as one
// tree (Y1), the Split waits for brew day (Y2), and Brand and Template are
// locked while split (Y3). The rules themselves are in ExUnit
// (split_moves_test).

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

/** Plan an ale brewed `brewIn` days from today in `tank`, split two days before FDH (part 1 stays, part 2 → `into`). */
async function splitAle(brewIn: number, tank: number, into: number): Promise<{ b: SBatch; p1: SBatch; p2: SBatch }> {
  const brand = await made.brand('Ale')
  const b = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), brewIn), tank_ids: [tank] })
  const res = await (await apiAs('brewer1')).post(`${P}/batches/${b.id}/split`, {
    data: { due_on: addDays(stepOf(b, 'FDH').due_on, -2), parts: [{ stays: true, volume_bbl: 12 }, { tank_id: into, volume_bbl: 8 }] },
  })
  expect(res.status()).toBe(201)
  const [p1, p2] = (await schedule()).batches.filter((x) => x.split_parent_id === b.id).sort((x, y) => x.part_number! - y.part_number!)
  return { b: await batchOf(b.id), p1, p2 }
}

const dates = (b: SBatch) => b.steps.map((s) => `${s.name} ${s.due_on}`).sort()

test('Y1: Move all on the parent’s Brew day lists the parts under their labels and moves them; the Split carries them; Undo puts the tree back', async ({ page }) => {
  const [a, d] = [await made.tank('FV2'), await made.tank('Q1SD')]
  const { b, p1, p2 } = await splitAle(7, a.id, d.id)
  const before = [b, p1, p2].map(dates)
  await openGantt(page)
  await openBatch(page, b)

  // Brew day a week later: the prompt groups the following steps by batch, the parts by their labels.
  const brew = stepOf(b, 'Brew day')
  const date = page.getByTestId(`batch-step-date-${brew.id}`)
  await date.fill(addDays(brew.due_on, 7))
  await date.press('Enter')
  await expect(page.getByTestId('move-prompt')).toBeVisible()
  await expect(page.getByTestId('move-default-move_all')).toBeVisible()
  for (const p of [p1, p2]) {
    const group = page.getByTestId(`move-following-batch-${p.id}`)
    await expect(group).toContainText(p.label)
    await expect(group).toContainText('Carb')
    await expect(group).toContainText('Package')
  }
  await page.getByTestId('move-apply').click()
  await expect(snack(page)).toContainText('Brew day moved 7 days later, with')
  const carb = stepOf(p2, 'Carb').due_on
  expect(stepOf(await batchOf(p2.id), 'Carb').due_on).toBe(addDays(carb, 7))
  expect(stepOf(await batchOf(p1.id), 'Package').due_on).toBe(addDays(stepOf(p1, 'Package').due_on, 7))
  await undo(page)
  expect(await Promise.all([b, p1, p2].map(async (x) => dates(await batchOf(x.id))))).toEqual(before)

  // The Split's own date (the dialog is still open): nothing else follows it (part 1 stays), so no prompt; the parts go with it.
  const split = stepOf(b, 'Split - Transfer')
  const splitDate = page.getByTestId(`batch-step-date-${split.id}`)
  await splitDate.fill(addDays(split.due_on, 3))
  await splitDate.press('Enter')
  await expect(snack(page)).toHaveText(`Split - Transfer moved 3 days later, with ${p1.label} and ${p2.label}.`)
  expect(stepOf(await batchOf(p2.id), 'Carb').due_on).toBe(addDays(carb, 3))
  expect((await schedule()).flags.filter((f) => f.kind === 'out_of_order' && f.batch_ids.includes(p2.id))).toEqual([])
  await page.getByTestId('batch-dialog-close').click()
  await undo(page)
  expect(await Promise.all([b, p1, p2].map(async (x) => dates(await batchOf(x.id))))).toEqual(before)
})

test('Y2 and Y3: the Split’s check-off waits for brew day; Brand and Template are read-only while split', async ({ page }) => {
  const [a, d] = [await made.tank('FV2'), await made.tank('Q1SD')]
  // Brew day ten days ago, not checked off: the Split (Brew day + 5) is in the past.
  const { b, p1 } = await splitAle(-10, a.id, d.id)
  await openGantt(page)
  await openBatch(page, b)

  // Y3: locked on the parent, with the same words as the tanks and volume.
  const locked = 'Undo the split first to change it'
  for (const id of ['batch-brand', 'batch-template']) await expect(page.getByTestId(id)).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByTestId('batch-dialog')).toContainText(locked)

  // Y2: the Split's Check off is refused, and the batch stays planned with its P-number.
  const split = stepOf(b, 'Split - Transfer')
  await page.getByTestId(`batch-step-note-${split.id}`).click()
  await expect(page.getByTestId('step-dialog')).toBeVisible()
  await page.getByTestId('step-check-off').click()
  await expect(page.getByTestId('step-dialog-error')).toHaveText('Check off brew day first.')
  await page.keyboard.press('Escape')
  const after = await batchOf(b.id)
  expect([after.status, after.p_number, stepOf(after, 'Split - Transfer').done_on]).toEqual(['planned', b.p_number, null])

  // Y3 on a part: locked too.
  await expect(page.getByTestId('step-dialog')).toHaveCount(0)
  if (await page.getByTestId('batch-dialog').isVisible()) await page.getByTestId('batch-dialog-close').click()
  await openBatch(page, p1)
  for (const id of ['batch-brand', 'batch-template']) await expect(page.getByTestId(id)).toHaveAttribute('aria-disabled', 'true')
  await page.getByTestId('batch-dialog-close').click()
})
