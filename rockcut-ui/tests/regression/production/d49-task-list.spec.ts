import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs, templates } from './helpers'
import { addDays, batchOf, Made, openGantt, schedule, snack, stepOf, today, type SBatch, type SStep } from './schedule'

// D49 §3.12: the Gantt's Task list panel (P102), Open in schedule, and
// decision 6.1 (no task-list switch for a phase marker). The board itself is
// in tests/regression/tasks/task-board-linked.spec.ts.

test.use({ storageState: authFile('brewer1'), viewport: { width: 1440, height: 1400 } })

const ALE = '[SEED] Standard ale'
const P = '/api/production'
const made = new Made()
test.afterEach(() => made.cleanup())

const step = async (id: number) => (await schedule()).batches.flatMap((b) => b.steps).find((s) => s.id === id) as SStep

/** A [TEST-TEMP] ale in its own tank, brewed `ago` days ago with a batch number. */
async function brewed(label: string, ago: number): Promise<SBatch> {
  const tank = await made.tank('FV')
  const brand = await made.brand(label)
  const b = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), -ago), tank_ids: [tank.id] })
  await made.checkOff(stepOf(b, 'Brew day'), `9${Math.floor(Math.random() * 1e6)}`)
  return batchOf(b.id)
}

test('P102: the Task list: Late and Today; check off, who has it, and the title opens the step', async ({ page }) => {
  // Brewed 13 days ago: PDH (day 7) is 6 days late, FDH (day 13) is today.
  const batch = await brewed('Crusher', 13)
  const pdh = stepOf(batch, 'PDH')
  const fdh = stepOf(batch, 'FDH')
  const brewer2 = (await (await (await apiAs('brewer2')).get('/api/me')).json()).user.id as number
  const taskId = async (stepId: number) => {
    const board = (await (await (await apiAs('brewer1')).get('/api/boards/brewery/tasks', { params: { from: today(), to: addDays(today(), 6), linked: 'true' } })).json()).data
    return [...board.unfinished, ...board.days.flatMap((d: { cards: unknown[] }) => d.cards)].find((c: { production: { step_id: number } }) => c.production.step_id === stepId).id as number
  }
  const [pdhTask, fdhTask] = [await taskId(pdh.id), await taskId(fdh.id)]

  await openGantt(page)
  await page.getByTestId('gantt-task-list').click()
  const panel = page.getByTestId('task-list-panel')
  await expect(panel.getByTestId('task-list-group-late').getByTestId(`task-list-row-${pdhTask}`)).toBeVisible()
  await expect(panel.getByTestId(`task-list-group-${today()}`).getByTestId(`task-list-row-${fdhTask}`)).toBeVisible()
  await expect(panel.getByTestId(`task-list-group-${today()}`)).toContainText('Today')

  // Check off FDH (due today: no question).
  // Click, not check(): the box follows the board once it's refetched (setBoardCheck's reason).
  await panel.getByTestId(`task-list-check-${fdhTask}`).click()
  await expect(snack(page)).toHaveText('FDH done.')
  await expect(panel.getByTestId(`task-list-check-${fdhTask}`)).toBeChecked()
  await expect.poll(async () => (await step(fdh.id)).done_on).toBe(today())

  // D52: no Move or assign controls in the row; moving and assigning are in the step.
  await expect(panel.getByTestId(`task-list-move-${pdhTask}`)).toHaveCount(0)
  await expect(panel.getByTestId(`task-list-move-date-${pdhTask}`)).toHaveCount(0)
  await expect(panel.getByTestId(`task-list-open-${pdhTask}`)).toHaveCount(0)
  // Assigned elsewhere (the API, as the step dialog does): the row names who has it.
  expect((await (await apiAs('brewer1')).post(`${P}/steps/assign`, { data: { ids: [pdh.id], assignee_id: brewer2 } })).status()).toBe(200)

  // Persisted: after a reload the panel has FDH done, and PDH with brewer2.
  await page.reload()
  await page.getByTestId('gantt-task-list').click()
  await expect(panel.getByTestId(`task-list-check-${fdhTask}`)).toBeChecked()
  await expect(panel.getByTestId(`task-list-assignee-${pdhTask}`)).toHaveText('Riley Wort')

  // D52: the panel sits over the chart (not the whole page), its title bar level with the date header.
  const chart = (await page.getByTestId('gantt').boundingBox())!
  const box = (await panel.boundingBox())!
  expect(Math.round(box.y)).toBe(Math.round(chart.y))
  expect(Math.round(box.y + box.height)).toBe(Math.round(chart.y + chart.height))
  expect(Math.round(box.x + box.width)).toBe(Math.round(chart.x + chart.width))
  expect(Math.round(box.width)).toBe(317)

  // The title opens the step dialog (it replaced Open).
  await panel.getByTestId(`task-list-title-${pdhTask}`).click()
  await expect(panel).toBeHidden()
  await expect(page.getByTestId('step-dialog')).toBeVisible()
  await expect(page.getByTestId('step-dialog')).toContainText('PDH')
})

test('the Task list follows Show planned batches', async ({ page }) => {
  const tank = await made.tank('FV')
  const brand = await made.brand('Galactic')
  const b = await made.plan({ brand_id: brand.id, template: ALE, brew_on: today(), tank_ids: [tank.id] })
  const api = await apiAs('brewer1')
  try {
    await openGantt(page)
    await page.getByTestId('gantt-task-list').click()
    const today_ = page.getByTestId(`task-list-group-${today()}`)
    await expect(today_.getByText(`${b.label} · Brew day`)).toBeVisible()
    expect((await api.put('/api/me/show_planned_batches', { data: { show_planned_batches: false } })).status()).toBe(200)
    await page.reload()
    await page.getByTestId('gantt-task-list').click()
    await expect(page.getByTestId('task-list-panel')).toBeVisible()
    await expect(page.getByText(`${b.label} · Brew day`)).toHaveCount(0)
  } finally {
    await api.put('/api/me/show_planned_batches', { data: { show_planned_batches: true } })
  }
})

test('decision 6.1: a phase marker has no task-list switch (step dialog, template row, Add phase start)', async ({ page }) => {
  const sched = await schedule()
  const marker = sched.batches.flatMap((b) => b.steps).find((s) => s.marker && s.due_on >= today())!
  const typed = sched.batches.flatMap((b) => b.steps).find((s) => !s.marker && s.batch_id && s.due_on >= today() && !s.done_on)!

  await page.goto(`/brewery/production?step=${marker.id}&day=${marker.due_on}`)
  await expect(page.getByTestId('step-dialog')).toBeVisible()
  await expect(page.getByTestId('step-task-list')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.goto(`/brewery/production?step=${typed.id}&day=${typed.due_on}`)
  await expect(page.getByTestId('step-dialog')).toBeVisible()
  await expect(page.getByTestId('step-task-list')).toHaveCount(1)
  await page.keyboard.press('Escape')

  const ale = (await templates()).find((t) => t.name === ALE)!
  const full = (await (await (await apiAs('brewer1')).get(`${P}/templates/${ale.id}`)).json()).data as { steps: { id: number; marker: boolean }[] }
  await page.goto(`/brewery/production/templates/${ale.id}`)
  for (const s of full.steps) await expect(page.getByTestId(`entry-task-list-${s.id}`)).toHaveCount(s.marker ? 0 : 1)
  await page.getByTestId('template-add-marker').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByTestId('entry-task-list')).toHaveCount(0)
})
