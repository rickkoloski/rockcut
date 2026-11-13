import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addDays, apiAs, stepTypes, template } from './helpers'
import { addProcess, batchOf, dragBy, Made, openGantt, schedule, snack, stepOf, today, undo } from './schedule'
import { Setup } from './d56'
import { getBoard, openBoard, setBoardCheck } from '../brewery/taskBoardHelpers'

// D56 §3.1 pre-brew steps, S1–S6: a plain step before brew day (−1 to −30) in
// a template, drawn left of the bar, moving with brew day, never onto it, and
// ticked on the board without making the batch brewed. Each test's template
// is a [TEST-TEMP] copy of the seed ale with a [TEST-TEMP] "Prep grain" type
// at day −1; batches are in the spec's own tanks.

test.use({ storageState: authFile('brewer1'), viewport: { width: 1600, height: 1200 } })

const ALE = '[SEED] Standard ale'
const P = '/api/production'
const made = new Made()
const setup = new Setup()
test.afterEach(() => made.cleanup())
test.afterAll(() => setup.cleanup())

/** The seed ale with a "Prep grain" step at day −1. */
async function preBrewTemplate() {
  const prep = await setup.stepType('Prep grain')
  const t = await setup.copy(ALE, 'Pre-brew ale')
  await setup.addStep(t.id, { step_type_id: prep.id, day_offset: -1, vessel_index: 0 })
  return { ...t, prep: prep.name }
}

/** A batch of that template brewed on `brewOn`, in its own tank. */
async function preBrewBatch(label: string, brewOn: string) {
  const t = await preBrewTemplate()
  const tank = await made.tank('FV3')
  const brand = await made.brand(label)
  const b = await made.plan({ brand_id: brand.id, template: t.name, brew_on: brewOn, tank_ids: [tank.id] })
  return { batch: await batchOf(b.id), prep: t.prep, tank }
}

/** Whether `a` is drawn left of `b` (centres; the bar itself starts at the pre-brew day). */
const leftOf = async (page: Page, a: string, b: string) => {
  const [x, y] = [await page.getByTestId(a).boundingBox(), await page.getByTestId(b).boundingBox()]
  return x!.x + x!.width / 2 < y!.x + y!.width / 2
}

test.describe('S1 (breweryMgr): a pre-brew step in the template editor', () => {
  test.use({ storageState: authFile('breweryMgr') })

  test('adds "Prep grain" at day −1: saved, previewed left of brew day; a Transfer at −1 is refused', async ({ page }) => {
    const prep = await setup.stepType('Prep grain')
    const t = await setup.copy(ALE, 'S1 pre-brew')
    await page.goto(`/brewery/production/templates/${t.id}`)
    await page.getByTestId('template-add-step').click()
    const dialog = page.getByTestId('entry-dialog')
    await page.getByTestId('entry-day').fill('-1')
    await expect(page.getByTestId('entry-pre-brew-note')).toHaveText('Before brew day: in the first tank, with no phase.')
    // Before brew day only plain steps: the Transfer is offered, greyed out, with why.
    const transfer = (await stepTypes()).find((s) => s.built_in && s.name === 'Transfer')!
    await page.getByTestId('entry-type').click()
    await expect(page.getByTestId(`entry-type-${transfer.id}`)).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByTestId(`entry-type-refused-${transfer.id}`)).toHaveText("A Transfer can't be before brew day.")
    await page.getByTestId(`entry-type-${prep.id}`).click()
    await page.getByTestId('entry-dialog-save').click()
    await expect(dialog).toBeHidden()

    // Persisted: after a reload it's first, at day −1, left of brew day in the preview.
    await page.reload()
    const saved = (await template(t.id)).steps.find((s) => s.name === prep.name)!
    expect(saved).toMatchObject({ day_offset: -1, vessel_index: 0, phase_id: null })
    await expect(page.locator('[data-testid^="entry-name-"]').first()).toHaveText(prep.name)
    await expect(page.getByTestId('preview-dot-0--1')).toBeVisible()
    expect(await leftOf(page, 'preview-dot-0--1', 'preview-dot-0-0')).toBe(true)

    // The API refuses a Transfer at −1 too (the picker never offers it).
    const res = await (await apiAs('breweryMgr')).post(`${P}/templates/${t.id}/steps`, { data: { step_type_id: transfer.id, day_offset: -1, vessel_index: 0 } })
    expect(res.status()).toBe(422)
    expect(await res.text()).toMatch(/before brew day/)
    expect((await template(t.id)).steps.filter((s) => s.day_offset < 0).map((s) => s.name)).toEqual([prep.name])
  })
})

test('S2: Plan batch from that template on FV3: a dot left of the bar; no overlap with the batch ending there the day before', async ({ page }) => {
  const t = await preBrewTemplate()
  const tank = await made.tank('FV3')
  // The seed ale ends 25 days after brew day (Package, CIP): this one ends today + 5.
  const before = await made.plan({ brand_id: (await made.brand('S2 before')).id, template: ALE, brew_on: addDays(today(), -20), tank_ids: [tank.id] })
  const lastDay = (await batchOf(before.id)).steps.reduce((m, s) => (s.due_on > m ? s.due_on : m), '')
  const brand = await made.brand('S2 pre-brew')
  await openGantt(page)
  await addProcess(page, 'plan')
  await page.getByTestId('plan-brand').click()
  await page.getByTestId(`plan-brand-${brand.id}`).click()
  await page.getByTestId('plan-template').click()
  await page.getByRole('option', { name: t.name, exact: true }).click()
  await page.getByTestId('plan-brew-on').fill(addDays(lastDay, 1))
  await page.getByTestId('plan-volume').fill('20')
  await page.getByTestId('plan-tank-0').click()
  await page.getByTestId(`plan-tank-0-${tank.id}`).click()
  await page.getByTestId('plan-dialog').getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('plan-dialog')).toBeHidden()

  const b = (await schedule()).batches.find((x) => x.brand_id === brand.id)!
  made.batches.push(b.id)
  const prep = stepOf(b, t.prep)
  expect(prep.due_on).toBe(lastDay)
  // Persisted: after a reload the dot is left of the bar, in the tank's row.
  await page.reload()
  await expect(page.getByTestId(`gantt-step-${prep.id}`)).toBeVisible()
  expect(await leftOf(page, `gantt-step-${prep.id}`, `gantt-step-${stepOf(b, 'Brew day').id}`)).toBe(true)
  const flags = (await schedule()).flags.filter((f) => f.batch_ids.includes(b.id))
  expect(flags.map((f) => f.kind)).not.toContain('tank_overlap')
})

test('S3: drag the bar 2 days later, then Undo: the pre-brew dot moves with it and back; kept after a reload', async ({ page }) => {
  const { batch, prep } = await preBrewBatch('S3', addDays(today(), 7))
  const [brew, pre] = [stepOf(batch, 'Brew day'), stepOf(batch, prep)]
  await openGantt(page)
  // A bar moves the whole batch: no prompt.
  await dragBy(page, page.getByTestId(`gantt-bar-${batch.id}-0`), 2)
  await expect(snack(page)).toBeVisible()
  let now = await batchOf(batch.id)
  expect([stepOf(now, 'Brew day').due_on, stepOf(now, prep).due_on]).toEqual([addDays(brew.due_on, 2), addDays(pre.due_on, 2)])
  await page.reload()
  await expect(page.getByTestId(`gantt-step-${pre.id}`)).toBeVisible()
  expect(await leftOf(page, `gantt-step-${pre.id}`, `gantt-step-${brew.id}`)).toBe(true)

  // Undo (a fresh write to undo: the reload dropped the snackbar's).
  await dragBy(page, page.getByTestId(`gantt-bar-${batch.id}-0`), -2)
  await expect(snack(page)).toBeVisible()
  now = await batchOf(batch.id)
  expect([stepOf(now, 'Brew day').due_on, stepOf(now, prep).due_on]).toEqual([brew.due_on, pre.due_on])
  await undo(page)
  now = await batchOf(batch.id)
  expect([stepOf(now, 'Brew day').due_on, stepOf(now, prep).due_on]).toEqual([addDays(brew.due_on, 2), addDays(pre.due_on, 2)])
  await page.reload()
  await expect(page.getByTestId(`gantt-step-${pre.id}`)).toBeVisible()
  expect((await batchOf(batch.id)).steps.find((s) => s.id === pre.id)!.due_on).toBe(addDays(pre.due_on, 2))
})

test('S4: the batch dialog moves brew day by the date box, "Move only": the pre-brew step still moves, the steps after stay', async ({ page }) => {
  const { batch, prep } = await preBrewBatch('S4', addDays(today(), 7))
  const [brew, pre, pdh] = [stepOf(batch, 'Brew day'), stepOf(batch, prep), stepOf(batch, 'PDH')]
  await openGantt(page)
  await page.getByTestId(`gantt-bar-${batch.id}-0`).click()
  await expect(page.getByTestId('batch-dialog')).toBeVisible()
  const date = page.getByTestId(`batch-step-date-${brew.id}`)
  await date.fill(addDays(brew.due_on, 1))
  await date.blur()
  await expect(page.getByTestId('move-prompt')).toBeVisible()
  await expect(page.getByTestId('move-pre-brew')).toContainText(`${prep} (→ `)
  await page.getByTestId('move-only').check()
  await page.getByTestId('move-apply').click()
  await expect(page.getByTestId('move-prompt')).toBeHidden()
  await expect(snack(page)).toBeVisible()

  await page.reload()
  await expect(page.getByTestId(`gantt-step-${pre.id}`)).toBeVisible()
  const now = await batchOf(batch.id)
  expect(stepOf(now, 'Brew day').due_on).toBe(addDays(brew.due_on, 1))
  expect(stepOf(now, prep).due_on).toBe(addDays(pre.due_on, 1))
  expect(stepOf(now, 'PDH').due_on).toBe(pdh.due_on)
})

test('S5: drag the pre-brew dot onto brew day: refused, and the hint says why', async ({ page }) => {
  const { batch, prep } = await preBrewBatch('S5', addDays(today(), 7))
  const pre = stepOf(batch, prep)
  await openGantt(page)
  const dot = page.getByTestId(`gantt-step-${pre.id}`)
  await dot.scrollIntoViewIfNeeded()
  const box = (await dot.boundingBox())!
  const { x, y } = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const px = (await page.getByTestId('gantt-dates').boundingBox())!.width
  const days = Math.round((Date.parse(await page.getByTestId('gantt-to').inputValue()) - Date.parse(await page.getByTestId('gantt-from').inputValue())) / 86_400_000) + 1
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 6, y, { steps: 3 })
  await page.mouse.move(x + px / days, y, { steps: 10 })
  await expect(page.getByTestId('gantt-drag-hint')).toContainText('A pre-brew step stays before brew day')
  await page.mouse.up()
  await expect(page.getByTestId('move-prompt')).toHaveCount(0)
  await page.reload()
  await expect(dot).toBeVisible()
  expect(stepOf(await batchOf(batch.id), prep).due_on).toBe(pre.due_on)
})

test('S6: tick the pre-brew task of a planned batch on the board: done, no batch number prompt, still planned (P-number)', async ({ page }) => {
  const { batch, prep } = await preBrewBatch('S6', addDays(today(), 1))
  const pre = stepOf(batch, prep)
  expect(pre.due_on).toBe(today())
  const api = await apiAs('brewer1')
  const card = (await getBoard(api, today(), today())).days[0].cards.find((c) => (c as { production?: { step_id: number } }).production?.step_id === pre.id)!
  expect(card).toBeTruthy()
  await openBoard(page, { from: today(), to: addDays(today(), 6) })
  await setBoardCheck(page.getByTestId(`task-check-${card.key}`), true)
  await expect(page.getByTestId('number-prompt')).toHaveCount(0)

  await page.reload()
  await expect(page.getByTestId('board-grid')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId(`task-check-${card.key}`)).toBeChecked()
  const now = await batchOf(batch.id)
  expect(stepOf(now, prep).done_on).toBe(today())
  expect(now.status).toBe('planned')
  expect(now.batch_number).toBeNull()
  expect(now.p_number).toMatch(/^P\d+$/)
  // Un-ticked for the cleanup (a planned batch with a done step deletes all the same, but leave nothing behind).
  await setBoardCheck(page.getByTestId(`task-check-${card.key}`), false)
  expect(stepOf(await batchOf(batch.id), prep).done_on).toBeNull()
})

