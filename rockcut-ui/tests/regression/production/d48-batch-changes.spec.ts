import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs } from './helpers'
import { addDays, batchOf, dayPx, dragToLane, gantt, Made, openGantt, snack, stepOf, today, undo, type SBatch } from './schedule'

// D48 §3.11 (task 3): the batch and step dialogs' changes. Add step (P65–P67),
// Add a ramp (P68), Change ramp… (P69), Remove step (P70–P71), Add / remove
// transfer / filter (P72–P74), template and brand (P83–P84). Each test works
// on its own [TEST-TEMP] brand, tanks and batches.
//
// The [SEED] Standard ale, from brew day: PDH 7, FDH 13, Set temp 58/48/38/32°
// on 18–21 (one ramp), Carb 23, Package and CIP 25.

test.use({ storageState: authFile('brewer1'), viewport: { width: 1440, height: 1400 } })

const ALE = '[SEED] Standard ale'
const LAGER = '[SEED] Lager with transfer'
const made = new Made()
// Each test cleans up after itself, failed or not: tanks left over make the grid taller for the next.
test.afterEach(() => made.cleanup())

async function openBatch(page: Page, b: SBatch) {
  await openGantt(page)
  await page.getByTestId(`gantt-bar-${b.id}-0`).click()
  await expect(page.getByTestId('batch-dialog')).toBeVisible()
}

async function pick(page: Page, select: string, option: string) {
  await page.getByTestId(select).click()
  await page.getByTestId(option).click()
}

const links = (b: SBatch) => b.links.map((l) => `${b.steps.find((s) => s.id === l.from_step_id)!.name} → ${b.steps.find((s) => s.id === l.to_step_id)!.name}`)

async function planned(label: string, brewIn = 2, template = ALE, tanks: (number | null)[] = []) {
  const brand = await made.brand(label)
  return made.plan({ brand_id: brand.id, template, brew_on: addDays(today(), brewIn), tank_ids: tanks })
}

test('P65–P66: Add step: an addition slotted between FDH and Set temp 58°, marked Added; Undo takes it out', async ({ page }) => {
  const b = await planned('Galactic')
  const fdh = stepOf(b, 'FDH')
  const t58 = stepOf(b, 'Set temp - 58°')
  await openBatch(page, b)
  await page.getByTestId('batch-add-step').click()
  await page.getByTestId('add-step-type').click()
  await page.getByRole('option', { name: 'Addition', exact: true }).click()
  await page.getByTestId('add-step-detail').fill('raspberry puree')
  await page.getByTestId('add-step-day').fill(addDays(fdh.due_on, 1))
  await pick(page, 'add-step-after', `add-step-after-${fdh.id}`)
  await pick(page, 'add-step-leads', `add-step-leads-${t58.id}`)
  await page.getByTestId('add-step-dialog-save').click()
  await expect(snack(page)).toHaveText(`Addition - raspberry puree added to ${b.label}.`)

  const after = await batchOf(b.id)
  const added = stepOf(after, 'Addition - raspberry puree')
  expect(added.added).toBe(true)
  expect(links(after)).toEqual(expect.arrayContaining(['FDH → Addition - raspberry puree', 'Addition - raspberry puree → Set temp - 58°']))
  expect(links(after)).not.toContain('FDH → Set temp - 58°')
  await expect(page.getByTestId(`batch-step-added-${added.id}`)).toHaveText('Added')

  await undo(page)
  expect((await batchOf(b.id)).steps.some((s) => s.name === 'Addition - raspberry puree')).toBe(false)
})

test('P67: Something else needs a name; with one it is added', async ({ page }) => {
  const b = await planned('Enos')
  await openBatch(page, b)
  await page.getByTestId('batch-add-step').click()
  await pick(page, 'add-step-type', 'add-step-type-custom')
  await page.getByTestId('add-step-dialog-save').click()
  await expect(page.getByTestId('add-step-dialog')).toContainText('Give the step a name.')
  await page.getByTestId('add-step-name').fill('Check the valve')
  await page.getByTestId('add-step-dialog-save').click()
  await expect(snack(page)).toHaveText(`Check the valve added to ${b.label}.`)
  expect(stepOf(await batchOf(b.id), 'Check the valve').marker).toBe(false)
})

test('P68: Add a ramp 60° → 40° at 10° a day: three chained Set temp steps', async ({ page }) => {
  const b = await planned('Fest')
  const first = addDays(stepOf(b, 'Set temp - 32°').due_on, 1)
  await openBatch(page, b)
  await page.getByTestId('batch-add-ramp').click()
  await page.getByTestId('add-ramp-start').fill('60')
  await page.getByTestId('add-ramp-target').fill('40')
  await page.getByTestId('add-ramp-change').fill('10')
  await page.getByTestId('add-ramp-first-on').fill(first)
  await expect(page.getByTestId('add-ramp-preview')).toContainText('3 Set temp steps: 60°, 50°, 40°')
  await page.getByTestId('add-ramp-dialog-save').click()
  await expect(snack(page)).toHaveText(`Ramp added to ${b.label}: 60°, 50°, 40°.`)
  const after = await batchOf(b.id)
  expect(['Set temp - 60°', 'Set temp - 50°', 'Set temp - 40°'].map((n) => stepOf(after, n).due_on)).toEqual([first, addDays(first, 1), addDays(first, 2)])
  expect(links(after)).toEqual(expect.arrayContaining(['Set temp - 60° → Set temp - 50°', 'Set temp - 50° → Set temp - 40°']))
})

test('P69 and P73: Change ramp… rebuilds only the unfinished steps; a transfer before a done step is refused', async ({ page }) => {
  const fv = await made.tank('FV1')
  // Brewed 19 days ago: Set temp 58° was yesterday (checked off), 48° today.
  const b = await planned('Crusher', -19, ALE, [fv.id])
  await made.checkOff(stepOf(b, 'Brew day'), `T${Date.now() % 1_000_000}`)
  await made.checkOff(stepOf(b, 'Set temp - 58°'))
  const t48 = stepOf(b, 'Set temp - 48°')

  await openBatch(page, b)
  await page.getByTestId(`batch-step-note-${t48.id}`).click()
  await page.getByTestId('step-change-ramp').click()
  await page.getByTestId('change-ramp-target').fill('34')
  await page.getByTestId('change-ramp-change').fill('7')
  await expect(page.getByTestId('change-ramp-preview')).toHaveText('New steps: 51°, 44°, 37°, 34°.')
  await page.getByTestId('change-ramp-dialog-save').click()
  await expect(snack(page)).toHaveText('Ramp changed: 51°, 44°, 37°, 34°.')

  const after = await batchOf(b.id)
  const ramp = after.steps.filter((s) => s.name.startsWith('Set temp')).sort((x, y) => x.due_on.localeCompare(y.due_on))
  expect(ramp.map((s) => [s.name, !!s.done_on])).toEqual([
    ['Set temp - 58°', true],
    ['Set temp - 51°', false],
    ['Set temp - 44°', false],
    ['Set temp - 37°', false],
    ['Set temp - 34°', false],
  ])
  expect(stepOf(after, 'Set temp - 51°').due_on).toBe(t48.due_on)

  // P73: a filter three days ago comes before the done 58° step.
  await page.getByTestId('batch-add-transfer').click()
  await page.getByTestId('add-transfer-day').fill(addDays(today(), -3))
  await expect(page.getByTestId('add-transfer-preview')).toHaveText('Some steps after that date are already done. Pick a later date.')
  await page.getByTestId('add-transfer-dialog-save').click()
  await expect(page.getByTestId('add-transfer-dialog-error')).toContainText('Some steps after that date are already done. Pick a later date.')
})

test('P70–P71: Remove FDH: its links pass through; Brew day has no Remove', async ({ page }) => {
  const b = await planned('Altruism')
  await openBatch(page, b)
  await expect(page.getByTestId(`batch-step-remove-${stepOf(b, 'Brew day').id}`)).toHaveCount(0)
  await page.getByTestId(`batch-step-remove-${stepOf(b, 'FDH').id}`).click()
  await page.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(snack(page)).toHaveText(`FDH removed from ${b.label}.`)
  const after = await batchOf(b.id)
  expect(after.steps.some((s) => s.name === 'FDH')).toBe(false)
  expect(links(after)).toContain('Brew day → Set temp - 58°')
})

test('P72, P74: Add a Filter into a Serving tank, then remove it from the step dialog', async ({ page }) => {
  const fv = await made.tank('FV2')
  const serving = await made.tank('Serving 1', 30)
  const b = await planned('Galactic', 2, ALE, [fv.id])
  const day = addDays(stepOf(b, 'Set temp - 32°').due_on, 1)
  await openBatch(page, b)
  await page.getByTestId('batch-add-transfer').click()
  await page.getByTestId('add-transfer-type').click()
  await page.getByRole('option', { name: 'Filter', exact: true }).click()
  await page.getByTestId('add-transfer-day').fill(day)
  await pick(page, 'add-transfer-tank', `add-transfer-tank-${serving.id}`)
  await expect(page.getByTestId('add-transfer-preview')).toContainText(`move to ${serving.name}`)
  await page.getByTestId('add-transfer-dialog-save').click()
  await expect(snack(page)).toContainText(`move to ${serving.name}; ${fv.name} gets a CIP & Sanitize that day.`)

  let after = await batchOf(b.id)
  expect(after.vessels).toEqual([
    { vessel_index: 0, tank_id: fv.id },
    { vessel_index: 1, tank_id: serving.id },
  ])
  const filter = stepOf(after, 'Filter')
  expect([filter.vessel_index, filter.due_on]).toEqual([1, day])
  expect(after.steps.filter((s) => s.name === 'CIP & Sanitize' && s.vessel_index === 0 && s.due_on === day)).toHaveLength(1)
  // The arrow between the two tanks.
  await expect(page.getByTestId(`gantt-transfer-${b.id}-0`)).toBeAttached()

  await page.getByTestId(`batch-step-note-${filter.id}`).click()
  await page.getByTestId('step-remove').click()
  await expect(page.getByRole('dialog').last()).toContainText(`The beer stays in ${fv.name}`)
  await page.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(snack(page)).toHaveText(`Filter removed: ${b.label} stays in ${fv.name}.`)
  after = await batchOf(b.id)
  expect(after.vessels).toHaveLength(1)
  expect(after.steps.some((s) => s.name === 'Filter')).toBe(false)
})

test('P83–P84: a planned batch changes template (keeping its added step) and brand', async ({ page }) => {
  const b = await planned('Enos')
  // Made before the dialog opens: it loads the brands once.
  const other = await made.brand('Altruism')
  const api = await apiAs('brewer1')
  expect((await api.post(`/api/production/batches/${b.id}/steps`, { data: { name: 'Taste it', due_on: addDays(b.steps[0].due_on, 3) } })).status()).toBe(201)
  await openBatch(page, b)
  await page.getByTestId('batch-template').click()
  await page.getByRole('option', { name: LAGER, exact: true }).click()
  await page.getByRole('button', { name: 'Change template' }).click()
  await expect(snack(page)).toHaveText(`${ALE} → ${LAGER}. Kept 1 added step.`)
  let after = await batchOf(b.id)
  expect(after.vessels).toEqual([
    { vessel_index: 0, tank_id: null },
    { vessel_index: 1, tank_id: null },
  ])
  expect(stepOf(after, 'Taste it').added).toBe(true)
  expect(after.steps.some((s) => s.name === 'Transfer')).toBe(true)

  await pick(page, 'batch-brand', `batch-brand-${other.id}`)
  after = await batchOf(b.id)
  expect(after.brand_id).toBe(other.id)
  await expect(snack(page)).toHaveText(`${b.label} is now ${after.label}.`)
})

test.describe('a short window', () => {
  test.use({ viewport: { width: 1280, height: 760 } })

  test('drags auto-scroll the grid: down to a row below the fold, and sideways past the right edge', async ({ page }) => {
    const fv = await made.tank('FV')
    const b = await planned('Crusher', 2, ALE, [fv.id])
    // Made last: its row is the last tank's, below the grid's fold here.
    const target = await made.tank('Serving')
    await openGantt(page)
    const grid = gantt(page)
    const box = (await grid.boundingBox())!
    expect((await page.getByTestId(`gantt-lane-${target.id}`).boundingBox())!.y).toBeGreaterThan(box.y + box.height)

    const top = await grid.evaluate((e) => e.scrollTop)
    await dragToLane(page, page.getByTestId(`gantt-bar-${b.id}-0`), `gantt-lane-${target.id}`)
    expect(await grid.evaluate((e) => e.scrollTop)).toBeGreaterThan(top)
    await expect(page.getByTestId(`gantt-lane-${target.id}`)).toHaveAttribute('data-drop', 'true')
    await expect(page.getByTestId('gantt-drag-hint')).toContainText(`→ ${target.name}`)
    await page.mouse.up()
    await expect(snack(page)).toHaveText(`${b.label} → ${target.name}.`)
    await expect(page.getByTestId(`gantt-row-${target.id}`).getByTestId(`gantt-bar-${b.id}-0`)).toBeVisible()

    // Sideways: held at the right edge, the dates scroll and the hint counts on.
    const dot = page.getByTestId(`gantt-step-${stepOf(b, 'FDH').id}`)
    await dot.scrollIntoViewIfNeeded()
    const d = (await dot.boundingBox())!
    const left = await grid.evaluate((e) => e.scrollLeft)
    const px = await dayPx(page)
    const [x, y] = [d.x + d.width / 2, d.y + d.height / 2]
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 6, y, { steps: 3 })
    await page.mouse.move(box.x + box.width - 6, y, { steps: 8 })
    await expect.poll(() => grid.evaluate((e) => e.scrollLeft), { timeout: 5000 }).toBeGreaterThan(left + 3 * px)
    const days = Number((await page.getByTestId('gantt-drag-hint').textContent())!.match(/\+(\d+) days/)![1])
    expect(days * px).toBeGreaterThan(box.x + box.width - 6 - x)
    await page.keyboard.press('Escape')
    await page.mouse.up()
  })
})
