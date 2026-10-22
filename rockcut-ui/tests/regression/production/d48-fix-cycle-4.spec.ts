import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs } from './helpers'
import { addDays, batchOf, dragToLane, Made, openGantt, schedule, snack, stepOf, today, type SBatch } from './schedule'

// D48 DEV gate fix cycle 4 (lead decisions 5): on a split, the parent's and
// the staying part's tanks are locked (Matt), the other pickers and a bar
// drag follow the rule over the whole tree (X2), the split dialog
// shows part 1's refusal before Split (X4), and a refused Undo shows what
// the server has (X5). X1 and X3 are in ExUnit (split_tree_test).

test.use({ storageState: authFile('brewer1'), viewport: { width: 1440, height: 1400 } })

const ALE = '[SEED] Standard ale'
const LAGER = '[SEED] Lager with transfer'
const P = '/api/production'
const made = new Made()
// Each test cleans up after itself, failed or not.
test.afterEach(() => made.cleanup())

async function openBatch(page: Page, b: { id: number }, vessel = 0) {
  await page.getByTestId(`gantt-bar-${b.id}-${vessel}`).click()
  await expect(page.getByTestId('batch-dialog')).toBeVisible()
}

const tankOf = (b: SBatch, k = 0) => b.vessels.find((v) => v.vessel_index === k)!.tank_id

test('X2 and the lock: on a split, the parent’s and the staying part’s tanks are locked; part 2’s picker and a bar drag follow the tree', async ({ page }) => {
  const [a, d, e] = [await made.tank('FV2'), await made.tank('Q1SD'), await made.tank('Q1SE')]
  const brand = await made.brand('Ale')
  const b = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), 7), tank_ids: [a.id] })
  const api = await apiAs('brewer1')
  const split = await api.post(`${P}/batches/${b.id}/split`, {
    data: { due_on: addDays(stepOf(b, 'FDH').due_on, -2), parts: [{ stays: true, volume_bbl: 12 }, { tank_id: d.id, volume_bbl: 8 }] },
  })
  expect(split.status()).toBe(201)
  const [p1, p2] = (await schedule()).batches.filter((x) => x.split_parent_id === b.id).sort((x, y) => x.part_number! - y.part_number!)
  await openGantt(page)

  // The parent: Ferment in is read-only, and Add transfer / filter is off (Matt).
  await openBatch(page, b)
  const locked = 'Undo the split first to change it'
  await expect(page.getByTestId('batch-tank-0')).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByTestId('batch-dialog')).toContainText(locked)
  await expect(page.getByTestId('batch-add-transfer')).toBeDisabled()
  await page.getByTestId('batch-dialog-close').click()

  // Part 1 stays: its tank is locked too.
  await openBatch(page, p1)
  await expect(page.getByTestId('batch-tank-0')).toHaveAttribute('aria-disabled', 'true')
  await page.getByTestId('batch-dialog-close').click()

  // Part 2: not the tank part 1 stays in; another free one is offered.
  await openBatch(page, p2)
  await page.getByTestId('batch-tank-0').click()
  await expect(page.getByTestId(`batch-tank-0-${a.id}`)).toHaveCount(0)
  await expect(page.getByTestId(`batch-tank-0-${e.id}`)).toHaveCount(1)
  await page.keyboard.press('Escape')
  await page.getByTestId('batch-dialog-close').click()

  // Part 2's bar onto a's row: the hint says why, and the drop is refused.
  const refused = `Part 2 can't go into ${a.name}: part 1 stays there`
  await dragToLane(page, page.getByTestId(`gantt-bar-${p2.id}-0`), `gantt-lane-${a.id}`)
  const hint = page.getByTestId('gantt-drag-hint')
  await expect(hint).toContainText(`→ ${a.name} · ${refused}`)
  await expect(hint).toHaveAttribute('data-warn', 'true')
  await page.mouse.up()
  await expect(snack(page)).toHaveText(`${refused}.`)
  expect(tankOf(await batchOf(p2.id))).toBe(d.id)

  // The parent's bar onto e's row: locked, in the hint and on the drop.
  await dragToLane(page, page.getByTestId(`gantt-bar-${b.id}-0`), `gantt-lane-${e.id}`)
  await expect(hint).toContainText(`→ ${e.name} · ${locked}`)
  await page.mouse.up()
  await expect(snack(page)).toHaveText('Undo the split first.')
  expect([tankOf(await batchOf(b.id)), tankOf(await batchOf(p1.id))]).toEqual([a.id, a.id])
})

test('X4: with nothing staying, part 1’s picker leaves out the next tank, and the dialog says why before Split', async ({ page }) => {
  const [a, b, d] = [await made.tank('FV2'), await made.tank('Q1SB'), await made.tank('Q1SD')]
  const brand = await made.brand('Lager')
  const planned = await made.plan({ brand_id: brand.id, template: LAGER, brew_on: addDays(today(), 7), tank_ids: [a.id, b.id] })
  const transfer = planned.steps.find((s) => s.behavior === 'transfer' && s.vessel_index === 1)!.due_on
  await openGantt(page)
  await openBatch(page, planned)
  await page.getByTestId('batch-split').click()
  await page.getByTestId('split-day').fill(addDays(transfer, -2))

  // QA's path: part 2 into d, then part 1's picker (it stays now).
  await page.getByTestId('split-tank-1').click()
  await page.getByTestId(`split-tank-1-${d.id}`).click()
  await page.getByTestId('split-tank-0').click()
  await expect(page.getByTestId(`split-tank-0-${b.id}`)).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('split-preview')).toHaveCount(0)

  // Two parts in one tank: said before Split.
  await page.getByTestId('split-tank-0').click()
  await page.getByTestId(`split-tank-0-${d.id}`).click()
  await expect(page.getByTestId('split-preview')).toHaveText('Two parts can’t go into the same tank.')
  await page.getByTestId('split-dialog-cancel').click()
  expect((await schedule()).batches.filter((x) => x.split_parent_id === planned.id)).toEqual([])
})

test('X5: a refused Undo shows the server’s tanks at once, in the dialog and on the chart', async ({ page }) => {
  const [a, c, d, e] = [await made.tank('FV2'), await made.tank('Q1SC'), await made.tank('Q1SD'), await made.tank('Q1SE')]
  const brand = await made.brand('Lager')
  const planned = await made.plan({ brand_id: brand.id, template: LAGER, brew_on: addDays(today(), 7), tank_ids: [a.id, c.id] })
  await openGantt(page)
  await openBatch(page, planned)
  await page.getByTestId('batch-tank-1').click()
  await page.getByTestId(`batch-tank-1-${d.id}`).click()
  await expect(snack(page)).toContainText(`→ ${d.name}`)

  // Someone else changes Ferment in meanwhile.
  const other = await apiAs('brewer2')
  expect((await other.patch(`${P}/batches/${planned.id}/vessels/0`, { data: { tank_id: e.id } })).status()).toBe(200)

  await page.getByTestId('batch-dialog-close').click()
  await page.getByTestId('gantt-undo').click()
  await expect(snack(page)).toHaveText('Something changed since. Nothing was undone.')
  await expect(page.getByTestId(`gantt-lane-${e.id}`).getByTestId(`gantt-bar-${planned.id}-0`)).toBeVisible()
  await openBatch(page, planned)
  await expect(page.getByTestId('batch-tank-0')).toContainText(e.name)
  await expect(page.getByTestId('batch-tank-1')).toContainText(d.name)
  await page.getByTestId('batch-dialog-close').click()
  expect((await batchOf(planned.id)).vessels.map((v) => v.tank_id)).toEqual([e.id, d.id])
})
