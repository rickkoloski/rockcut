import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addDays, batchOf, Made, openGantt, snack, stepOf, today, type SBatch } from './schedule'
import { enterCode, firstName, longPress, retireCoded, staffWithCode, tap, touchDragBy, type Coded } from './device'

// D50 D6 (touch) and P105 by finger, at the bar's Samsung tablets' 1280×800
// (spec §2.1): a long-press drag, long-press selection and taps, the step
// dialog's check-off, each behind a staff code. Persist-verified through the API.

test.use({ storageState: authFile('breweryDevice'), viewport: { width: 1280, height: 800 }, hasTouch: true, isMobile: true })

const ALE = '[SEED] Standard ale'
const made = new Made()
let brewer: Coded | null = null

test.beforeAll(async () => {
  brewer = await staffWithCode('D50 touch')
})
test.afterAll(async () => {
  await made.cleanup()
  await retireCoded([brewer])
})

async function ale(label: string, brewOffset: number): Promise<SBatch> {
  const brand = await made.brand(label)
  const tank = await made.tank('FV')
  return batchOf((await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), brewOffset), tank_ids: [tank.id] })).id)
}

const dot = (page: Page, id: number) => page.getByTestId(`gantt-step-${id}`)

test('P105 (touch): a long-press drag asks for the code, then the move prompt; recorded as the person', async ({ page }) => {
  const b = await ale('Galactic', 2)
  const fdh = stepOf(b, 'FDH')
  await openGantt(page)
  await touchDragBy(page, dot(page, fdh.id), 1)
  await enterCode(page, brewer!.code)
  await expect(page.getByTestId('move-prompt')).toContainText('FDH moved 1 day later')
  await page.getByTestId('move-only').tap()
  await page.getByTestId('move-apply').tap()
  await expect(snack(page)).toHaveText('FDH moved 1 day later.')
  await expect(page.getByTestId('acting-name')).toHaveText(`Acting as ${firstName(brewer!)}`)
  expect(stepOf(await batchOf(b.id), 'FDH').due_on).toBe(addDays(fdh.due_on, 1))
})

test('D6 (touch): long-press to select, tap two more, drag: they move as a block', async ({ page }) => {
  const b = await ale('Enos', 2)
  const names = ['PDH', 'FDH', 'Set temp - 58°']
  await openGantt(page)
  await longPress(page, dot(page, stepOf(b, 'PDH').id))
  await expect(page.getByTestId('gantt-selection-bar')).toBeVisible()
  for (const n of names.slice(1)) await tap(page, dot(page, stepOf(b, n).id))
  await expect(page.getByTestId('gantt-selection-count')).toHaveText('3 steps selected')
  await touchDragBy(page, dot(page, stepOf(b, 'FDH').id), 1)
  await enterCode(page, brewer!.code)
  await expect(page.getByTestId('move-prompt')).toContainText('3 steps moved 1 day later')
  await page.getByTestId('move-only').tap()
  await page.getByTestId('move-apply').tap()
  await expect(snack(page)).toHaveText('3 steps moved 1 day later.')
  const after = await batchOf(b.id)
  for (const n of names) expect(stepOf(after, n).due_on, n).toBe(addDays(stepOf(b, n).due_on, 1))
})

test('a tap opens the step dialog; Check off with a code marks it done by the person', async ({ page }) => {
  const b = await ale('Fest', -1)
  const brew = stepOf(b, 'Brew day')
  await openGantt(page)
  await tap(page, dot(page, brew.id))
  await expect(page.getByTestId('step-dialog')).toBeVisible()
  await page.getByTestId('step-done-on').fill(brew.due_on)
  await page.getByTestId('step-check-off').tap()
  await enterCode(page, brewer!.code)
  // Brew day asks for the batch number.
  await page.getByTestId('number-input').fill(`T${Date.now().toString(36).slice(-6)}`)
  await page.getByTestId('number-save').tap()
  await expect(snack(page)).toContainText('Brew day done.')
  const done = stepOf(await batchOf(b.id), 'Brew day')
  expect(done.done_on).toBe(brew.due_on)
})
