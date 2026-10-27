import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs } from './helpers'
import { addDays, addProcess, batchOf, dragToLane, Made, openGantt, schedule, snack, stepOf, today, undo, type SBatch } from './schedule'

// D49 §3.12b Pencilled batches: P130–P134 on the Gantt. The rules in full
// are in ExUnit (pencilled_test); the board (no tasks, P135) is task 3's.
// P- and X-numbers are checked by their letter, not their value: other
// specs plan batches too.

test.use({ storageState: authFile('brewer1'), viewport: { width: 1440, height: 1400 } })

const ALE = '[SEED] Standard ale'
const LAGER = '[SEED] Lager with transfer'
const P = '/api/production'
const made = new Made()
// Each test cleans up after itself, failed or not.
test.afterEach(() => made.cleanup())

type Batch = SBatch & { pencilled: boolean }

const fresh = async (id: number) => (await batchOf(id)) as Batch
const flagsOf = async (id: number) => (await schedule()).flags.filter((f) => f.batch_ids.includes(id)) as unknown as { key: string; kind: string; muted: boolean }[]

/** A pencilled batch through the API (the seed ale), cleaned up with the spec's. */
async function pencilled(label: string, brewIn: number, tankIds: (number | null)[] = [null], template = ALE): Promise<Batch> {
  const brand = await made.brand(label)
  const b = await made.plan({ brand_id: brand.id, template, brew_on: addDays(today(), brewIn), tank_ids: tankIds })
  const res = await (await apiAs('brewer1')).post(`${P}/batches/${b.id}/pencil`)
  expect(res.status()).toBe(200)
  return fresh(b.id)
}

async function pickOption(page: Page, select: string, option: string) {
  await page.getByTestId(select).click()
  await page.getByTestId(option).click()
}

test('P130: Plan batch → Pencil in, Unassigned: an X-number, faded and labeled Pencilled; no "No tank" flag', async ({ page }) => {
  const brand = await made.brand('Oktoberfest')
  await openGantt(page)
  await addProcess(page, 'plan')
  await expect(page.getByTestId('plan-schedule')).toBeChecked()
  await page.getByTestId('plan-pencil').check()
  await pickOption(page, 'plan-brand', `plan-brand-${brand.id}`)
  await page.getByTestId('plan-template').click()
  await page.getByRole('option', { name: LAGER, exact: true }).click()
  // Two days out: a scheduled batch here would get "No tank assigned".
  await page.getByTestId('plan-brew-on').fill(addDays(today(), 2))
  await page.getByTestId('plan-volume').fill('20')
  await page.getByTestId('plan-dialog').getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('plan-dialog')).toBeHidden()
  await expect(snack(page)).toHaveText(/^\[TEST-TEMP\] Oktoberfest .* X\d+ pencilled in\.$/)

  const b = (await schedule()).batches.find((x) => x.brand_id === brand.id)! as Batch
  made.batches.push(b.id)
  expect(b.pencilled).toBe(true)
  expect(b.p_number).toMatch(/^X\d+$/)
  expect(b.label.endsWith(` ${b.p_number}`)).toBe(true)
  const bar = page.getByTestId('gantt-row-unassigned').getByTestId(`gantt-bar-${b.id}-0`)
  await expect(bar).toHaveAttribute('data-pencilled', 'true')
  await expect(bar).toContainText('Pencilled')
  expect(Number(await bar.evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.5)
  expect((await flagsOf(b.id)).map((f) => f.kind)).not.toContain('no_tank')

  await page.getByTestId(`gantt-bar-${b.id}-0`).click()
  await expect(page.getByTestId('batch-dialog-title')).toHaveText(b.label)
  await expect(page.getByTestId('batch-dialog-sub')).toContainText('pencilled in')
})

test('P131, P132: dragged into a tank over a scheduled batch: a muted overlap, not counted; Schedule this batch; Undo', async ({ page }) => {
  const fv6 = await made.tank('FV6')
  const brand = await made.brand('Galactic')
  const sched = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), 3), tank_ids: [fv6.id] })
  const x = await pencilled('Oktoberfest', 6)
  await openGantt(page)

  // P131: into FV6 over Galactic: it moves.
  await dragToLane(page, page.getByTestId(`gantt-bar-${x.id}-0`), `gantt-lane-${fv6.id}`)
  await page.mouse.up()
  await expect(snack(page)).toHaveText(`${x.label} → ${fv6.name}.`)
  expect((await fresh(x.id)).vessels[0].tank_id).toBe(fv6.id)

  const mine = await flagsOf(x.id)
  expect(mine.some((f) => f.kind === 'tank_overlap')).toBe(true)
  expect(mine.every((f) => f.muted)).toBe(true)
  // The scheduled batch keeps its own, open.
  expect((await flagsOf(sched.id)).find((f) => f.kind === 'tank_overlap')?.muted).toBe(false)
  const counted = (await schedule()).flags.filter((f) => !(f as unknown as { muted: boolean }).muted).length
  await expect(page.getByTestId('gantt-flags')).toHaveText(new RegExp(`^${counted} flags?( ·|$)`))
  await expect(page.getByTestId(`gantt-badge-${x.id}-0`)).toHaveCount(0)

  await page.getByTestId('gantt-flags').click()
  const row = page.getByTestId(`flag-${mine.find((f) => f.kind === 'tank_overlap')!.key}`)
  await expect(row).toHaveAttribute('data-muted', 'true')
  await expect(row.getByTestId('flag-ok')).toHaveCount(0)
  await expect(row.getByTestId('flag-muted')).toHaveText('Pencilled batch: this counts once it’s scheduled.')
  await page.getByTestId('flags-close').click()

  // P132: Schedule this batch: a P-number, drawn normally, flags open.
  await page.getByTestId(`gantt-bar-${x.id}-0`).click()
  await page.getByTestId('batch-schedule').click()
  await expect(snack(page)).toContainText('is scheduled.')
  const scheduled = await fresh(x.id)
  expect(scheduled.pencilled).toBe(false)
  expect(scheduled.p_number).toMatch(/^P\d+$/)
  await expect(page.getByTestId('batch-pencil')).toBeVisible()
  expect((await flagsOf(x.id)).every((f) => !f.muted)).toBe(true)
  await page.getByTestId('batch-dialog-close').click()
  await expect(page.getByTestId(`gantt-bar-${x.id}-0`)).not.toHaveAttribute('data-pencilled', 'true')

  // Undo reverses it.
  await undo(page)
  expect((await fresh(x.id)).pencilled).toBe(true)
  await expect(page.getByTestId(`gantt-bar-${x.id}-0`)).toHaveAttribute('data-pencilled', 'true')
})

test('P133: a scheduled planned batch → Pencil in: back to an X-number; refused once a step is done', async ({ page }) => {
  const brand = await made.brand('Crusher')
  const b = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), 4) })
  await openGantt(page)
  await page.getByTestId(`gantt-bar-${b.id}-0`).click()
  await page.getByTestId('batch-pencil').click()
  await expect(snack(page)).toContainText('is pencilled in.')
  const after = await fresh(b.id)
  expect(after.p_number).toMatch(/^X\d+$/)
  await expect(page.getByTestId('batch-dialog-title')).toHaveText(after.label)
  await expect(page.getByTestId('batch-schedule')).toBeVisible()
  await page.getByTestId('batch-dialog-close').click()
  await expect(page.getByTestId(`gantt-bar-${b.id}-0`)).toHaveAttribute('data-pencilled', 'true')

  // A batch with a done step offers no Pencil in, and the API refuses it.
  const brewed = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), -3) })
  await made.checkOff(stepOf(brewed, 'Brew day'), `T${Date.now() % 1_000_000}`)
  const res = await (await apiAs('brewer1')).post(`${P}/batches/${brewed.id}/pencil`)
  expect(res.status()).toBe(422)
  const planned = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), 8) })
  const fdh = stepOf(planned, 'FDH')
  await (await apiAs('brewer1')).post(`${P}/steps/${fdh.id}/complete`, { data: { done_on: today(), answer: 'move_only' } })
  await page.reload()
  await page.getByTestId(`gantt-bar-${planned.id}-0`).click()
  await expect(page.getByTestId('batch-dialog')).toBeVisible()
  await expect(page.getByTestId('batch-pencil')).toHaveCount(0)
})

test('P134: checking off brew day on a pencilled batch: "Schedule this batch first."; Cancel does nothing; Schedule, then it\'s checked off', async ({ page }) => {
  const x = await pencilled('Fest', 0)
  const brew = stepOf(x, 'Brew day')
  await openGantt(page)

  await page.getByTestId(`gantt-step-${brew.id}`).click()
  await page.getByTestId('step-check-off').click()
  await expect(page.getByTestId('schedule-prompt')).toContainText('Schedule this batch first.')
  await expect(page.getByTestId('schedule-prompt')).toContainText(`${x.label} is pencilled in.`)
  await page.getByTestId('schedule-prompt-cancel').click()
  await expect(page.getByTestId('schedule-prompt')).toBeHidden()
  expect((await fresh(x.id)).pencilled).toBe(true)
  expect(stepOf(await fresh(x.id), 'Brew day').done_on).toBeNull()

  await page.getByTestId('step-check-off').click()
  await page.getByTestId('schedule-prompt-ok').click()
  // Scheduled; then brew day's number prompt, with the new label.
  const scheduled = await fresh(x.id)
  expect(scheduled.p_number).toMatch(/^P\d+$/)
  await expect(page.getByTestId('number-prompt')).toContainText(`Brew day for ${scheduled.label}`)
  await page.getByTestId('number-input').fill(`T${Date.now() % 1_000_000}`)
  await page.getByTestId('number-save').click()
  await expect(page.getByTestId('number-prompt')).toBeHidden()
  await expect(page.getByTestId('step-dialog')).toBeHidden()
  const done = await fresh(x.id)
  expect(stepOf(done, 'Brew day').done_on).toBe(today())
  expect(done.status).toBe('fermenting')
})
