import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs } from './helpers'
import { addDays, addProcess, batchOf, Made, openGantt, schedule, snack, stepOf, today, type SBatch } from './schedule'
import { dayLabel } from '../../../src/lib/gantt'

// D48 DEV gate fix cycle 3 (lead decisions 4): refusals clear when the
// input changes (R2), a split where nothing stays names the part and part 1's
// picker leaves out the next tank (R3), and a Move only that puts transfers
// out of order is allowed and flagged as such (R4, Matt's change). R1 (Undo)
// is covered in ExUnit.

test.use({ storageState: authFile('brewer1'), viewport: { width: 1440, height: 1400 } })

const ALE = '[SEED] Standard ale'
const LAGER = '[SEED] Lager with transfer'
const P = '/api/production'
const made = new Made()
// Each test cleans up after itself, failed or not.
test.afterEach(() => made.cleanup())

async function openBatch(page: Page, b: SBatch, vessel = 0) {
  await page.getByTestId(`gantt-bar-${b.id}-${vessel}`).click()
  await expect(page.getByTestId('batch-dialog')).toBeVisible()
}

const transferInto = (b: SBatch, k: number) => b.steps.find((s) => s.behavior === 'transfer' && s.vessel_index === k)!

test('R2: Add step, Add a ramp, Change ramp and the batch dialog drop a refusal once the input changes', async ({ page }) => {
  const fv = await made.tank('FV2')
  const brand = await made.brand('Ale')
  const b = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), 7), tank_ids: [fv.id] })
  const exit = stepOf(b, 'Package').due_on
  const after = "The beer isn't in that tank on that day."
  await openGantt(page)
  await openBatch(page, b)

  // Add step: a day after the exit, then the exit day.
  await page.getByTestId('batch-add-step').click()
  await page.getByTestId('add-step-type').click()
  await page.getByTestId('add-step-type-custom').click()
  await page.getByTestId('add-step-name').fill('Check')
  await page.getByTestId('add-step-day').fill(addDays(exit, 1))
  await page.getByTestId('add-step-dialog-save').click()
  await expect(page.getByTestId('add-step-dialog-error')).toContainText(after)
  await page.getByTestId('add-step-day').fill(exit)
  await expect(page.getByTestId('add-step-dialog-error')).toHaveCount(0)
  await page.getByTestId('add-step-dialog-cancel').click()

  // Add a ramp: three steps ending a day past the exit, then a day earlier.
  await page.getByTestId('batch-add-ramp').click()
  await page.getByTestId('add-ramp-start').fill('60')
  await page.getByTestId('add-ramp-target').fill('40')
  await page.getByTestId('add-ramp-change').fill('10')
  await page.getByTestId('add-ramp-first-on').fill(addDays(exit, -1))
  await page.getByTestId('add-ramp-dialog-save').click()
  await expect(page.getByTestId('add-ramp-dialog-error')).toContainText(after)
  await page.getByTestId('add-ramp-first-on').fill(addDays(exit, -2))
  await expect(page.getByTestId('add-ramp-dialog-error')).toHaveCount(0)
  await page.getByTestId('add-ramp-dialog-cancel').click()

  // Change ramp: 1° a day runs past the exit; 10° a day doesn't.
  await page.getByTestId('batch-dialog-close').click()
  await page.getByTestId(`gantt-step-${stepOf(b, 'Set temp - 58°').id}`).click()
  await page.getByTestId('step-change-ramp').click()
  await page.getByTestId('change-ramp-change').fill('1')
  await page.getByTestId('change-ramp-dialog-save').click()
  await expect(page.getByTestId('change-ramp-dialog-error')).toContainText(after)
  await page.getByTestId('change-ramp-change').fill('10')
  await expect(page.getByTestId('change-ramp-dialog-error')).toHaveCount(0)
  await page.getByTestId('change-ramp-dialog-cancel').click()
  await page.keyboard.press('Escape')
  expect(stepOf(await batchOf(b.id), 'Set temp - 58°').due_on).toBe(stepOf(b, 'Set temp - 58°').due_on)
})

test('R2: the batch dialog’s banner clears when another dialog opens from it; Plan batch’s when a tank changes', async ({ page }) => {
  const [a, c, d] = [await made.tank('FV2'), await made.tank('Q1RB'), await made.tank('Q1RC')]
  const brand = await made.brand('Lager')
  const planned = await made.plan({ brand_id: brand.id, template: LAGER, brew_on: addDays(today(), 7), tank_ids: [a.id, c.id] })
  await openGantt(page)

  await openBatch(page, planned)
  await page.getByTestId('batch-tank-0').click()
  await page.getByTestId(`batch-tank-0-${c.id}`).click()
  await expect(page.getByTestId('batch-dialog-error')).toContainText(`The beer goes into ${c.name} next`)
  await page.getByTestId('batch-add-transfer').click()
  await expect(page.getByTestId('add-transfer-dialog')).toBeVisible()
  await page.getByTestId('add-transfer-dialog-cancel').click()
  await expect(page.getByTestId('batch-dialog-error')).toHaveCount(0)
  await page.getByTestId('batch-dialog-close').click()

  // Plan batch: the same tank twice, then another.
  await addProcess(page, 'plan')
  const dialog = page.getByTestId('plan-dialog')
  await page.getByTestId('plan-brand').click()
  await page.getByTestId(`plan-brand-${brand.id}`).click()
  await page.getByTestId('plan-template').click()
  await page.getByRole('option', { name: LAGER, exact: true }).click()
  await page.getByTestId('plan-brew-on').fill(addDays(today(), 40))
  await page.getByTestId('plan-volume').fill('20')
  for (const k of [0, 1]) {
    await page.getByTestId(`plan-tank-${k}`).click()
    await page.getByTestId(`plan-tank-${k}-${d.id}`).click()
  }
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog.getByRole('alert')).toContainText(`The beer goes into ${d.name} next`)
  await page.getByTestId('plan-tank-1').click()
  await page.getByTestId(`plan-tank-1-${a.id}`).click()
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  expect((await schedule()).batches.filter((x) => x.brand_id === brand.id).map((x) => x.id)).toEqual([planned.id])
})

test('R3: with nothing staying, part 1’s picker leaves out the next tank, and the refusal names part 1', async ({ page }) => {
  const [a, b, c, d] = [await made.tank('FV2'), await made.tank('Q1RB'), await made.tank('Q1RC'), await made.tank('Q1RD')]
  const brand = await made.brand('Lager')
  const planned = await made.plan({ brand_id: brand.id, template: LAGER, brew_on: addDays(today(), 7), tank_ids: [a.id, b.id] })
  const transfer = transferInto(planned, 1).due_on
  await openGantt(page)
  await openBatch(page, planned)
  await page.getByTestId('batch-split').click()
  await page.getByTestId('split-day').fill(addDays(transfer, -2))

  // Part 2 stays, so part 1 may take b; then part 2 goes into d and nothing
  // stays. Part 1's own picker no longer offers b while it stays (fix cycle 4, X4).
  await page.getByTestId('split-tank-0').click()
  await expect(page.getByTestId(`split-tank-0-${b.id}`)).toHaveCount(0)
  // Part 1 into c first, so part 2 can take "(stays here)".
  await page.getByTestId(`split-tank-0-${c.id}`).click()
  await page.getByTestId('split-tank-1').click()
  await page.getByTestId('split-tank-1-stay').click()
  await page.getByTestId('split-tank-0').click()
  await page.getByTestId(`split-tank-0-${b.id}`).click()
  await page.getByTestId('split-tank-1').click()
  await page.getByTestId(`split-tank-1-${d.id}`).click()
  const refused = `Part 1: The beer goes into ${b.name} next, on ${dayLabel(transfer)}.`
  await expect(page.getByTestId('split-preview')).toHaveText(refused)
  await page.getByTestId('split-dialog-save').click()
  await expect(page.getByTestId('split-dialog-error')).toHaveText(refused)

  // Into c instead: b isn't offered to part 1 any more; part 2 is offered it.
  await page.getByTestId('split-tank-0').click()
  await page.getByTestId(`split-tank-0-${c.id}`).click()
  await expect(page.getByTestId('split-dialog-error')).toHaveCount(0)
  await expect(page.getByTestId('split-preview')).toHaveCount(0)
  await page.getByTestId('split-tank-0').click()
  await expect(page.getByTestId(`split-tank-0-${b.id}`)).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.getByTestId('split-tank-1').click()
  await expect(page.getByTestId(`split-tank-1-${b.id}`)).toHaveCount(1)
  await page.keyboard.press('Escape')
  await page.getByTestId('split-dialog-cancel').click()
  expect((await schedule()).batches.filter((x) => x.split_parent_id === planned.id)).toEqual([])
})

test('R4: a Move only that puts the way back before the way out is allowed and flagged as transfers out of order, not a dirty fill', async ({ page }) => {
  const [a, b] = [await made.tank('FV2'), await made.tank('Q1RB')]
  const brand = await made.brand('Lager')
  const planned = await made.plan({ brand_id: brand.id, template: LAGER, brew_on: addDays(today(), 7), tank_ids: [a.id, b.id] })
  const out = transferInto(planned, 1).due_on
  const api = await apiAs('brewer1')
  // a → b → a: back into a three days after the template's transfer.
  expect((await api.post(`${P}/batches/${planned.id}/transfers`, { data: { due_on: addDays(out, 3), tank_id: a.id } })).status()).toBe(201)
  const back = transferInto(await batchOf(planned.id), 2)
  await openGantt(page)

  // Its date in the batch dialog, four days earlier: the move prompt, Move only.
  await openBatch(page, planned)
  const date = page.getByTestId(`batch-step-date-${back.id}`)
  await date.fill(addDays(out, -1))
  await date.press('Enter')
  const prompt = page.getByTestId('move-prompt')
  await expect(prompt.or(snack(page))).toBeVisible()
  if (await prompt.isVisible()) {
    await page.getByTestId('move-only').check()
    await page.getByTestId('move-apply').click()
  }
  await expect(snack(page)).toContainText('moved 4 days earlier')
  expect(transferInto(await batchOf(planned.id), 2).due_on).toBe(addDays(out, -1))

  const mine = (await schedule()).flags.filter((f) => f.batch_ids.includes(planned.id))
  const message = `${planned.label}'s transfers are out of order: on ${dayLabel(addDays(out, -1))} the beer goes into ${a.name}, which it's already in.`
  expect(mine.filter((f) => f.kind === 'transfer_order').map((f) => f.message)).toEqual([message])
  expect(mine.filter((f) => f.kind === 'dirty_fill')).toEqual([])
  await expect(page.getByTestId('batch-flags')).toContainText(message)
})
