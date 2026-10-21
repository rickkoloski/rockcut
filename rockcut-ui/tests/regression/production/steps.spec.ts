import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addDays, batchOf, dragBy, Made, openGantt, schedule, snack, stepOf, today, type SBatch } from './schedule'

// D47 §3.5/§3.7 moving and checking off steps, and the step dialog: P25–P29,
// P34, P35, P41–P45. "[SEED] Standard ale": Brew day 0, PDH 7, FDH 13 (after
// Brew day), the crash ramp 58/48/38/32° on days 18–21 (after FDH),
// Conditioning 22, Carb 23, Package 25 (after Carb, "move only"), CIP 25.

test.use({ storageState: authFile('brewer1'), viewport: { width: 1440, height: 1400 } })

const made = new Made()
test.afterAll(() => made.cleanup())

const ALE = '[SEED] Standard ale'
const tag = () => `T${Date.now().toString(36).slice(-5)}`

async function ale(label: string, brewOffset: number, brewed = false): Promise<SBatch> {
  const brand = await made.brand(label)
  const tank = await made.tank('FV')
  const b = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), brewOffset), tank_ids: [tank.id] })
  if (brewed) await made.checkOff(stepOf(b, 'Brew day'), tag())
  return batchOf(b.id)
}

const dot = (page: Page, id: number) => page.getByTestId(`gantt-step-${id}`)

test('P25: drag FDH 2 days later: "Move all following steps" by default, listing them; Apply moves them all', async ({ page }) => {
  const b = await ale('Galactic', 1)
  const fdh = stepOf(b, 'FDH')
  await openGantt(page)
  await dragBy(page, dot(page, fdh.id), 2)
  const prompt = page.getByTestId('move-prompt')
  await expect(prompt).toContainText('FDH moved 2 days later')
  await expect(page.getByTestId('move-default-move_all')).toBeVisible()
  await expect(page.getByTestId('move-all')).toBeChecked()
  const following = ['Set temp - 58°', 'Set temp - 48°', 'Set temp - 38°', 'Set temp - 32°', 'Conditioning', 'Carb', 'Package', 'CIP & Sanitize']
  for (const name of following) await expect(page.getByTestId('move-following')).toContainText(name)
  await page.getByTestId('move-apply').click()
  await expect(prompt).toBeHidden()
  await expect(snack(page)).toContainText('FDH moved 2 days later, with 8 following steps.')
  const after = await batchOf(b.id)
  for (const name of ['FDH', ...following]) expect(stepOf(after, name).due_on, name).toBe(addDays(stepOf(b, name).due_on, 2))
  expect(stepOf(after, 'PDH').due_on).toBe(stepOf(b, 'PDH').due_on)
})

test('P26: "Move only FDH" past the ramp warns; after Apply the "Steps out of order" flag appears', async ({ page }) => {
  const b = await ale('Galactic', 1)
  await openGantt(page)
  await dragBy(page, dot(page, stepOf(b, 'FDH').id), 6)
  await page.getByTestId('move-only').check()
  await expect(page.getByTestId('move-only-warning')).toHaveText('Some of them would then come before the step they follow. They’ll be flagged.')
  await page.getByTestId('move-apply').click()
  await expect(page.getByTestId('move-prompt')).toBeHidden()
  const flags = (await schedule()).flags.filter((f) => f.kind === 'out_of_order' && f.batch_ids.includes(b.id))
  expect(flags.map((f) => f.message)).toContain(`${b.label}: Set temp - 58° is before FDH, the step it follows.`)
  expect(stepOf(await batchOf(b.id), 'Set temp - 58°').due_on).toBe(stepOf(b, 'Set temp - 58°').due_on)
})

test('P27, P28: Carb’s only link is "move only", so that’s the default; the prompt’s Undo changes nothing', async ({ page }) => {
  const b = await ale('Crusher', 1)
  await openGantt(page)
  await dragBy(page, dot(page, stepOf(b, 'Carb').id), 1)
  await expect(page.getByTestId('move-default-move_only')).toBeVisible()
  await expect(page.getByTestId('move-only')).toBeChecked()
  await page.getByTestId('move-cancel').click()
  await expect(page.getByTestId('move-prompt')).toBeHidden()
  const after = await batchOf(b.id)
  for (const s of b.steps) expect(after.steps.find((x) => x.id === s.id)!.due_on).toBe(s.due_on)
})

test('P29: a date changed in the batch dialog runs the same prompt; the dialog stays open', async ({ page }) => {
  const b = await ale('Enos', 1)
  const fdh = stepOf(b, 'FDH')
  await openGantt(page)
  await page.getByTestId(`gantt-bar-${b.id}-0`).click()
  await page.getByTestId(`batch-step-date-${fdh.id}`).fill(addDays(fdh.due_on, 1))
  await expect(page.getByTestId('move-prompt')).toContainText('FDH moved 1 day later')
  await page.getByTestId('move-apply').click()
  await expect(page.getByTestId('move-prompt')).toBeHidden()
  await expect(page.getByTestId('batch-dialog')).toBeVisible()
  await expect(page.getByTestId(`batch-step-date-${fdh.id}`)).toHaveValue(addDays(fdh.due_on, 1))
})

test('P34: checking off "Set temp - 58°" due today sets the tank’s temperature', async ({ page }) => {
  const b = await ale('Crusher', -18, true)
  const tankId = b.vessels[0].tank_id!
  const setTemp = stepOf(b, 'Set temp - 58°')
  expect(setTemp.due_on).toBe(today())
  await openGantt(page)
  await expect(page.getByTestId(`gantt-status-${tankId}`)).toHaveText('Day 18 · Fermentation · 68° · set to 58° today')
  await dot(page, setTemp.id).click()
  await page.getByTestId('step-check-off').click()
  await expect(page.getByTestId('step-dialog')).toBeHidden()
  await expect(snack(page)).toContainText('Set temp - 58° done.')
  await expect(page.getByTestId(`gantt-status-${tankId}`)).toHaveText('Day 18 · Crash · 58°')
})

test('P35: FDH done 2 days late: it moves to today and the prompt asks about the steps after it', async ({ page }) => {
  const b = await ale('Galactic', -15, true)
  const fdh = stepOf(b, 'FDH')
  expect(fdh.due_on).toBe(addDays(today(), -2))
  await openGantt(page)
  await dot(page, fdh.id).click()
  await expect(page.getByTestId('step-dialog-status')).toHaveText(/^Late \(planned /)
  await expect(page.getByTestId('step-done-on')).toHaveValue(today())
  await page.getByTestId('step-check-off').click()
  await expect(page.getByTestId('move-prompt')).toContainText('FDH done 2 days late')
  await page.getByTestId('move-apply').click()
  await expect(page.getByTestId('step-dialog')).toBeHidden()
  const after = await batchOf(b.id)
  expect(stepOf(after, 'FDH')).toMatchObject({ due_on: today(), done_on: today() })
  expect(stepOf(after, 'Set temp - 58°').due_on).toBe(addDays(stepOf(b, 'Set temp - 58°').due_on, 2))
})

test('P41–P44: add to the name, a temperature, an assignee (initials), notes', async ({ page }) => {
  const b = await ale('Fest', 2)
  const pdh = stepOf(b, 'PDH')
  const st = stepOf(b, 'Set temp - 58°')
  await openGantt(page)

  await dot(page, pdh.id).click()
  await page.getByTestId('step-detail').fill('#2')
  await page.getByTestId('step-assignee').click()
  await page.getByRole('option', { name: 'Riley Wort' }).click()
  await page.getByTestId('step-notes').fill('Watch the glycol on FV4')
  await page.getByTestId('step-dialog-save').click()
  await expect(page.getByTestId('step-dialog')).toBeHidden()

  await dot(page, st.id).click()
  await page.getByTestId('step-temperature').fill('52')
  await page.getByTestId('step-dialog-close').click()
  await expect(page.getByTestId('step-dialog')).toBeHidden()

  await page.reload()
  const after = await batchOf(b.id)
  expect(after.steps.find((s) => s.id === pdh.id)).toMatchObject({ name: 'PDH - #2', notes: 'Watch the glycol on FV4' })
  expect(after.steps.find((s) => s.id === st.id)!.name).toBe('Set temp - 52°')
  await expect(dot(page, pdh.id)).toHaveAttribute('aria-label', /^PDH - #2 · .* · Riley Wort · Watch the glycol on FV4$/)
  await expect(page.getByTestId(`gantt-initials-${pdh.id}`)).toHaveText('RW')
  await expect(dot(page, st.id)).toHaveAttribute('aria-label', /^Set temp - 52° ·/)
  // Expanded: the step's line shows its name and initials.
  await page.getByTestId(`gantt-caret-${b.vessels[0].tank_id}`).click()
  await expect(page.getByTestId(`gantt-diamond-${pdh.id}`)).toContainText('PDH - #2 · RW')
  await page.getByTestId(`gantt-caret-${b.vessels[0].tank_id}`).click()
})

test('P45: the batch dialog’s + Note opens the step; closing returns to the batch dialog with Note ✎', async ({ page }) => {
  const b = await ale('Altruism', 3)
  const fdh = stepOf(b, 'FDH')
  await openGantt(page)
  await page.getByTestId(`gantt-bar-${b.id}-0`).click()
  await expect(page.getByTestId(`batch-step-note-${fdh.id}`)).toHaveText('+ Note')
  await page.getByTestId(`batch-step-note-${fdh.id}`).click()
  await page.getByTestId('step-notes').fill('Use the T-90 pellets')
  await page.getByTestId('step-dialog-close').click()
  await expect(page.getByTestId('step-dialog')).toBeHidden()
  await expect(page.getByTestId('batch-dialog')).toBeVisible()
  await expect(page.getByTestId(`batch-step-note-${fdh.id}`)).toHaveText('Note ✎')
  expect(stepOf(await batchOf(b.id), 'FDH').notes).toBe('Use the T-90 pellets')
})
