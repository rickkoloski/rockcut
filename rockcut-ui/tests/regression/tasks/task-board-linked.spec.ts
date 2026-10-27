import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addDays, apiAs, card, getBoard, mouseDrag, openBoard, setBoardCheck, type ApiCard } from '../brewery/taskBoardHelpers'
import { batchOf, Made, schedule, snack, stepOf, today, type SBatch, type SStep } from '../production/schedule'

// D49 §3.12: production steps on the Brewery board (P90–P101, P103, P108,
// P125, and the board side of P130/P132/P133/P135). Named task-board-* so it
// runs in the one-worker `brewery-board` project (after `production`). Its
// batches are [TEST-TEMP] ones in their own tanks; P- and X-numbers are read
// from the schedule, never assumed.

test.use({ storageState: authFile('brewer1'), viewport: { width: 1600, height: 2200 } })

const ALE = '[SEED] Standard ale'
const P = '/api/production'
const made = new Made()
test.afterEach(async () => {
  await (await apiAs('brewer1')).put('/api/me/show_planned_batches', { data: { show_planned_batches: true } })
  await made.cleanup()
})

/** The board's card for a step (wherever it shows a month either side of today), or undefined. */
async function linked(stepId: number): Promise<ApiCard | undefined> {
  const api = await apiAs('brewer1')
  const t = today()
  for (const [from, to] of [
    [addDays(t, -30), addDays(t, -1)],
    [t, addDays(t, 30)],
  ]) {
    const board = await getBoard(api, from, to)
    const hit = [...board.unfinished, ...board.days.flatMap((d) => d.cards)].find((c) => c.production?.step_id === stepId)
    if (hit) return hit
  }
  return undefined
}

/** A [TEST-TEMP] ale in its own tank, brewed in `brewIn` days (planned). */
async function ale(label: string, brewIn: number): Promise<{ batch: SBatch; tank: string }> {
  const tank = await made.tank('FV')
  const brand = await made.brand(label)
  const b = await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), brewIn), tank_ids: [tank.id] })
  return { batch: await batchOf(b.id), tank: tank.name }
}

/** The same, brewed `ago` days ago with a batch number. */
async function brewed(label: string, ago: number) {
  const { batch, tank } = await ale(label, -ago)
  const number = `9${Math.floor(Math.random() * 1e6)}`
  await made.checkOff(stepOf(batch, 'Brew day'), number)
  return { batch: await batchOf(batch.id), tank, number }
}

/** The board on the week around `day` (one row: every drag stays on screen). */
const openAround = (page: Page, day = today()) => openBoard(page, { from: addDays(day, -3), to: addDays(day, 3) })

/** Persist-verified (local gate): the board reloaded from the server. */
async function reloadBoard(page: Page) {
  await page.reload()
  await expect(page.getByTestId('board-grid')).toBeVisible({ timeout: 20_000 })
}

const title = (tank: string, batch: SBatch, step: string) => `${tank} · ${batch.label} · ${step}`
const step = async (id: number) => (await schedule()).batches.flatMap((b) => b.steps).concat((await schedule()).cips).find((s) => s.id === id) as SStep

async function check(page: Page, c: ApiCard, where = c.due_on!) {
  await page.getByTestId(`task-check-${c.id}:${where}`).click()
}

test('P90: each task-list step is a task on its day with a Planned batch pill; markers are not', async ({ page }) => {
  const { batch, tank } = await ale('Galactic', 2)
  const fdh = stepOf(batch, 'FDH')
  const c = (await linked(fdh.id))!
  expect(c.title).toBe(title(tank, batch, 'FDH'))
  expect(c.due_on).toBe(fdh.due_on)
  expect(c.production).toMatchObject({ batch_id: batch.id, planned: true })
  // No phase marker has a task.
  for (const m of batch.steps.filter((s) => s.marker)) expect(await linked(m.id)).toBeUndefined()

  await openAround(page, c.due_on!)
  await expect(card(page, c.id, c.due_on!)).toBeVisible()
  await expect(page.getByTestId(`task-planned-${c.id}:${c.due_on}`)).toHaveText('Planned batch')
})

test('P91: Show planned batches off hides them, after a reload too; brewer2 still sees them', async ({ page, browser }) => {
  const { batch } = await ale('Galactic', 2)
  const c = (await linked(stepOf(batch, 'FDH').id))!
  await openAround(page, c.due_on!)
  await expect(card(page, c.id, c.due_on!)).toBeVisible()
  const saved = page.waitForResponse((r) => r.url().endsWith('/api/me/show_planned_batches') && r.ok())
  await page.getByTestId('board-show-planned').click()
  await saved
  await expect(card(page, c.id, c.due_on!)).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('board-show-planned')).not.toBeChecked()
  await expect(card(page, c.id, c.due_on!)).toHaveCount(0)

  const ctx = await browser.newContext({ storageState: authFile('brewer2'), viewport: { width: 1600, height: 2200 } })
  try {
    const other = await ctx.newPage()
    await openBoard(other, { from: addDays(c.due_on!, -3), to: addDays(c.due_on!, 3) })
    await expect(other.getByTestId('board-show-planned')).toBeChecked()
    await expect(card(other, c.id, c.due_on!)).toBeVisible()
  } finally {
    await ctx.close()
  }
})

test('P92: dragging a linked task two days later runs the move prompt; Apply moves the step and the following ones', async ({ page }) => {
  // Brewed (planned) 5 days ago: FDH (day 13) is 8 days out, the ramp follows it.
  const { batch } = await ale('Crusher', -5)
  const fdh = stepOf(batch, 'FDH')
  const ramp = batch.steps.find((s) => s.name.startsWith('Set temp'))!
  const c = (await linked(fdh.id))!
  const to = addDays(fdh.due_on, 2)
  await openAround(page, fdh.due_on)
  await mouseDrag(page, card(page, c.id, fdh.due_on), page.getByTestId(`day-list-${to}`))
  const prompt = page.getByTestId('move-prompt')
  await expect(prompt).toBeVisible()
  await page.getByTestId('move-all').check()
  await page.getByTestId('move-apply').click()
  await expect(snack(page)).toContainText('FDH moved 2 days later')
  await expect.poll(async () => (await step(fdh.id)).due_on).toBe(to)
  expect((await step(ramp.id)).due_on).toBe(addDays(ramp.due_on, 2))
  await expect(card(page, c.id, to)).toBeVisible()
  await reloadBoard(page)
  await expect(card(page, c.id, to)).toBeVisible()
  await expect(card(page, c.id, fdh.due_on)).toHaveCount(0)
})

test('the move prompt cancelled puts the card back; nothing moves', async ({ page }) => {
  const { batch } = await ale('Crusher', -5)
  const fdh = stepOf(batch, 'FDH')
  const c = (await linked(fdh.id))!
  await openAround(page, fdh.due_on)
  await mouseDrag(page, card(page, c.id, fdh.due_on), page.getByTestId(`day-list-${addDays(fdh.due_on, 1)}`))
  await page.getByTestId('move-cancel').click()
  // One card, back on its day (the drag's overlay copy may still be leaving).
  await expect(card(page, c.id, fdh.due_on)).toHaveCount(1)
  await expect(card(page, c.id, fdh.due_on)).toBeVisible()
  expect((await step(fdh.id)).due_on).toBe(fdh.due_on)
  await reloadBoard(page)
  await expect(card(page, c.id, fdh.due_on)).toBeVisible()
})

test('P93: a step due today checks off with no question, and is done on the Gantt', async ({ page }) => {
  // Brewed 13 days ago: FDH (day 13) is today.
  const { batch } = await brewed('Crusher', 13)
  const fdh = stepOf(batch, 'FDH')
  const c = (await linked(fdh.id))!
  expect(c.due_on).toBe(today())
  await openAround(page)
  await setBoardCheck(page.getByTestId(`task-check-${c.id}:${today()}`), true)
  await expect(snack(page)).toHaveText('FDH done.')
  await expect(page.getByTestId('finish-dialog')).toHaveCount(0)
  expect((await step(fdh.id)).done_on).toBe(today())
  await reloadBoard(page)
  await expect(page.getByTestId(`task-check-${c.id}:${today()}`)).toBeChecked()
})

test('P94: a step planned 3 days ago checks off today with the move prompt, never "where should it show"', async ({ page }) => {
  const { batch } = await brewed('Crusher', 16)
  const fdh = stepOf(batch, 'FDH')
  const c = (await linked(fdh.id))!
  expect(c.due_on).toBe(addDays(today(), -3))
  await openAround(page)
  await check(page, c, 'unfinished')
  await expect(page.getByTestId('move-prompt')).toContainText('FDH done 3 days late')
  await page.getByTestId('move-only').check()
  await page.getByTestId('move-apply').click()
  await expect(snack(page)).toHaveText('FDH done.')
  await expect(page.getByTestId('finish-dialog')).toHaveCount(0)
  const s = await step(fdh.id)
  expect([s.due_on, s.done_on]).toEqual([today(), today()])
  await expect(page.getByTestId(`task-check-${c.id}:${today()}`)).toBeChecked()
  await reloadBoard(page)
  await expect(page.getByTestId(`task-check-${c.id}:${today()}`)).toBeChecked()
  await expect(card(page, c.id, 'unfinished')).toHaveCount(0)
})

test('P95: brew day of a planned batch asks for the batch number on the board', async ({ page }) => {
  const { batch, tank } = await ale('Galactic', 0)
  const brew = stepOf(batch, 'Brew day')
  const c = (await linked(brew.id))!
  const number = `9${Math.floor(Math.random() * 1e6)}`
  await openAround(page)
  await check(page, c)
  await expect(page.getByTestId('number-prompt')).toBeVisible()
  await page.getByTestId('number-input').fill(number)
  await page.getByTestId('number-save').click()
  await expect(snack(page)).toContainText(`is #${number}.`)
  const done = `${tank} · ${batch.label.replace(/ P\d+$/, '')} #${number} · Brew day`
  expect((await linked(brew.id))!.title).toBe(done)
  await reloadBoard(page)
  await expect(page.getByTestId(`task-title-${c.id}:${today()}`)).toHaveText(done)
  await expect(page.getByTestId(`task-check-${c.id}:${today()}`)).toBeChecked()
})

test('P96–P98: Edit says where it comes from; notes and assignee go to the step, and back', async ({ page }) => {
  const { batch } = await ale('Crusher', 2)
  const fdh = stepOf(batch, 'FDH')
  const c = (await linked(fdh.id))!
  const brewer2 = (await (await (await apiAs('brewer2')).get('/api/me')).json()).user.id as number
  await openAround(page, c.due_on!)
  await card(page, c.id, c.due_on!).click()
  await page.getByTestId('task-menu-edit').click()
  const dialog = page.getByTestId('task-dialog')
  await expect(dialog.getByTestId('task-dialog-linked')).toContainText('This task comes from the production schedule')
  await expect(dialog.getByTestId('task-title-input')).toHaveCount(0)
  await expect(dialog.getByTestId('task-day-input')).toHaveCount(0)
  await dialog.getByTestId('task-notes-input').fill('Use the Citra')
  await dialog.getByTestId('task-assignee-select').click()
  await page.getByTestId(`task-assignee-option-${brewer2}`).click()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()
  await expect(snack(page)).toHaveText('Saved.')
  // P97: the step's assignee (the Gantt's initials) and notes.
  expect(await step(fdh.id)).toMatchObject({ notes: 'Use the Citra', assignee_id: brewer2 })

  // P98: the schedule's notes show on the board.
  await (await apiAs('brewer1')).patch(`${P}/steps/${fdh.id}`, { data: { notes: 'From the Gantt' } })
  expect((await linked(fdh.id))!.notes).toBe('From the Gantt')

  // Open in schedule: the step's dialog on the Gantt. After the reload the card has brewer2's initials.
  await reloadBoard(page)
  await expect(page.getByTestId(`task-assignee-${c.id}:${c.due_on}`)).toBeVisible()
  await card(page, c.id, c.due_on!).click()
  await page.getByTestId('task-menu-edit').click()
  await page.getByTestId('task-dialog-open-schedule').click()
  await expect(page).toHaveURL(/\/brewery\/production/)
  await expect(page.getByTestId('step-dialog')).toBeVisible()
  await expect(page.getByTestId('step-notes')).toHaveValue('From the Gantt')
})

test('P99, P100: Delete takes it off the task list (the step stays; Undo brings it back); the step dialog puts it back', async ({ page }) => {
  const { batch } = await ale('Crusher', 2)
  const fdh = stepOf(batch, 'FDH')
  const c = (await linked(fdh.id))!
  await openAround(page, c.due_on!)
  await card(page, c.id, c.due_on!).click()
  await page.getByTestId('task-menu-delete').click()
  const confirm = page.getByRole('dialog').filter({ hasText: 'Take this off the task list? It stays on the production schedule.' })
  await confirm.getByRole('button', { name: 'Take off' }).click()
  await expect(card(page, c.id, c.due_on!)).toHaveCount(0)
  expect(await linked(fdh.id)).toBeUndefined()
  expect((await step(fdh.id)) as unknown as { on_task_list: boolean }).toMatchObject({ on_task_list: false })

  await page.getByTestId('gantt-undo').click()
  await expect.poll(async () => (await linked(fdh.id))?.title).toBe(c.title)
  await reloadBoard(page)
  await expect(page.getByText(c.title, { exact: true })).toBeVisible()

  // P100: off again, then on from the step dialog (the schedule's Open link).
  await (await apiAs('brewer1')).patch(`${P}/steps/${fdh.id}`, { data: { on_task_list: false } })
  await page.goto(`/brewery/production?step=${fdh.id}&day=${fdh.due_on}`)
  await expect(page.getByTestId('step-dialog')).toBeVisible()
  await page.getByTestId('step-task-list').check()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('step-dialog')).toBeHidden()
  await expect.poll(async () => (await linked(fdh.id))?.due_on).toBe(fdh.due_on)
  // On the board after navigating there.
  await openAround(page, fdh.due_on)
  await expect(page.getByText(c.title, { exact: true })).toBeVisible()
})

test('P101: into another tank and with its batch number, the titles follow', async () => {
  const { batch } = await ale('Crusher', 2)
  const fdh = stepOf(batch, 'FDH')
  const other = await made.tank('FV')
  const api = await apiAs('brewer1')
  expect((await api.patch(`${P}/batches/${batch.id}/vessels/0`, { data: { tank_id: other.id } })).status()).toBe(200)
  expect((await linked(fdh.id))!.title).toBe(title(other.name, batch, 'FDH'))
})

test('P103, P125: standalone CIPs on the board; checking one off there marks the tank sanitized', async ({ page }) => {
  const tank = await made.tank('FV')
  const api = await apiAs('brewer1')
  const cip = (await (await api.post(`${P}/cips`, { data: { tank_id: tank.id, due_on: today() } })).json()).data.cip as SStep
  const noSani = (await (await api.post(`${P}/cips`, { data: { tank_id: tank.id, due_on: addDays(today(), 1), cip_method: 'no_sani' } })).json()).data
    .cip as SStep
  made.cips.push(cip.id, noSani.id)
  const c = (await linked(cip.id))!
  expect(c.title).toBe(`${tank.name} · CIP & Sanitize`)
  expect(c.production).toMatchObject({ batch_id: null, planned: false })
  expect((await linked(noSani.id))!.title).toBe(`${tank.name} · CIP - no sani`)

  await openAround(page)
  await expect(page.getByTestId(`task-planned-${c.id}:${today()}`)).toHaveCount(0)
  await setBoardCheck(page.getByTestId(`task-check-${c.id}:${today()}`), true)
  await expect.poll(async () => (await step(cip.id)).done_on).toBe(today())
  await reloadBoard(page)
  await expect(page.getByTestId(`task-check-${c.id}:${today()}`)).toBeChecked()
  const status = (await schedule()).statuses.find((s) => s.tank_id === tank.id)!
  expect(status.line).toMatch(/^Sani 0 days/)
})

test('P108: no recurring options on a linked task; Change day has no Future and runs the move prompt', async ({ page }) => {
  const { batch } = await ale('Crusher', 2)
  const c = (await linked(stepOf(batch, 'FDH').id))!
  await openAround(page, c.due_on!)
  await card(page, c.id, c.due_on!).click()
  const menu = page.getByTestId('task-menu')
  await expect(menu.getByTestId('task-menu-open-schedule')).toBeVisible()
  await expect(menu.getByTestId('task-menu-edit-series')).toHaveCount(0)
  await expect(menu.getByTestId('task-menu-stop-repeating')).toHaveCount(0)
  await menu.getByTestId('task-menu-edit').click()
  await expect(page.getByTestId('task-dialog').getByText('Repeat')).toHaveCount(0)
  await page.getByTestId('task-dialog').getByRole('button', { name: 'Cancel' }).click()
  await card(page, c.id, c.due_on!).click()
  await page.getByTestId('task-menu-change-day').click()
  await expect(page.getByTestId('change-day-dialog')).toBeVisible()
  await expect(page.getByTestId('change-day-future')).toHaveCount(0)
  // Change day… moves the step, with the move prompt.
  const fdh = stepOf(batch, 'FDH')
  await page.getByTestId('change-day-input').fill(addDays(fdh.due_on, 1))
  await page.getByTestId('change-day-confirm').click()
  await page.getByTestId('move-only').check()
  await page.getByTestId('move-apply').click()
  await expect.poll(async () => (await step(fdh.id)).due_on).toBe(addDays(fdh.due_on, 1))
  await reloadBoard(page)
  await expect(card(page, c.id, addDays(fdh.due_on, 1))).toBeVisible()
})

test('P130, P132, P133, P135: a pencilled batch has no tasks, whatever the toggle; Schedule adds them, Pencil in removes them', async ({ page }) => {
  const { batch } = await ale('Oktoberfest', 3)
  const api = await apiAs('brewer1')
  expect((await api.post(`${P}/batches/${batch.id}/pencil`)).status()).toBe(200)
  const fdh = stepOf(batch, 'FDH')
  expect(await linked(fdh.id)).toBeUndefined()

  // P135: Show planned batches on; still nothing from it.
  await openAround(page)
  await expect(page.getByTestId('board-show-planned')).toBeChecked()
  await expect(page.getByText(batch.label.replace(/ P\d+$/, ''), { exact: false })).toHaveCount(0)

  // P132: scheduled, its tasks come, with its new P-number.
  expect((await api.post(`${P}/batches/${batch.id}/schedule`)).status()).toBe(200)
  const scheduled = await batchOf(batch.id)
  expect(scheduled.p_number).toMatch(/^P\d+$/)
  expect((await linked(fdh.id))!.title).toContain(` · ${scheduled.label} · FDH`)

  // P133: pencilled in again, they go.
  expect((await api.post(`${P}/batches/${batch.id}/pencil`)).status()).toBe(200)
  expect(await linked(fdh.id)).toBeUndefined()
})

test("decision 8.3: on the Dashboard's Today's tasks card, brew day opens its step on the schedule; a CIP checks off there", async ({ page }) => {
  const { batch } = await ale('Galactic', 0)
  const brew = stepOf(batch, 'Brew day')
  const tank = await made.tank('FV')
  const api = await apiAs('brewer1')
  const cip = (await (await api.post(`${P}/cips`, { data: { tank_id: tank.id, due_on: today() } })).json()).data.cip as SStep
  made.cips.push(cip.id)
  // The card lists today's first five open tasks: put these two first.
  const [brewTask, cipTask] = [(await linked(brew.id))!, (await linked(cip.id))!]
  for (const t of [cipTask, brewTask]) {
    const first = (await getBoard(api, today(), today())).days[0].cards[0]
    expect((await api.post(`/api/boards/brewery/tasks/${t.id}/move`, { data: { due_on: today(), before_id: first.id } })).status()).toBe(200)
  }

  await page.goto('/brewery')
  const list = page.getByTestId('todays-tasks-list')
  await expect(list).toContainText(cipTask.title)
  // No prompt needed: checked off in the card.
  await page.getByRole('checkbox', { name: `Mark "${cipTask.title}" done` }).click()
  await expect(list).not.toContainText(cipTask.title)
  expect((await step(cip.id)).done_on).toBe(today())
  await page.reload()
  await expect(list).toContainText(brewTask.title)
  await expect(list).not.toContainText(cipTask.title)

  // Brew day needs the batch number: the step on the schedule, nothing checked off.
  await page.getByRole('checkbox', { name: `Mark "${brewTask.title}" done` }).click()
  await expect(page).toHaveURL(/\/brewery\/production/)
  await expect(page.getByTestId('step-dialog')).toBeVisible()
  await expect(page.getByTestId('step-dialog')).toContainText('Brew day')
  expect((await step(brew.id)).done_on).toBeNull()
})

test("QA 3: the Dashboard's Today's tasks card follows Show planned batches, with the Planned batch pill", async ({ page }) => {
  const { batch } = await ale('Galactic', 0)
  const api = await apiAs('brewer1')
  const brewTask = (await linked(stepOf(batch, 'Brew day').id))!
  const first = (await getBoard(api, today(), today())).days[0].cards[0]
  expect((await api.post(`/api/boards/brewery/tasks/${brewTask.id}/move`, { data: { due_on: today(), before_id: first.id } })).status()).toBe(200)

  await page.goto('/brewery')
  await expect(page.getByTestId('todays-tasks-list')).toContainText(brewTask.title)
  await expect(page.getByTestId(`todays-task-planned-${brewTask.id}`)).toHaveText('Planned batch')

  // Off (the afterEach puts it back on): gone from the card, after a reload too.
  expect((await api.put('/api/me/show_planned_batches', { data: { show_planned_batches: false } })).status()).toBe(200)
  // Read once the card's board is in (before that it lists nothing either way).
  const loaded = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/boards/brewery/tasks' && r.ok())
  await page.reload()
  await loaded
  await expect(page.getByTestId('todays-tasks-list').or(page.getByText('Nothing open today.'))).toBeVisible()
  await expect(page.getByTestId(`todays-task-planned-${brewTask.id}`)).toHaveCount(0)
  await expect(page.getByText(brewTask.title, { exact: true })).toHaveCount(0)
})

test.describe('the brewhouse tablet (decision 8: read-only until D50)', () => {
  test.use({ storageState: authFile('breweryDevice') })

  test('a linked task has no checkbox and no actions, and says where to do it', async ({ page }) => {
    const { batch } = await ale('Crusher', 2)
    const fdh = stepOf(batch, 'FDH')
    await (await apiAs('brewer1')).patch(`${P}/steps/${fdh.id}`, { data: { notes: 'Bring the Citra up from the cooler' } })
    const c = (await linked(fdh.id))!
    await openAround(page, c.due_on!)
    const key = `${c.id}:${c.due_on}`
    await expect(page.getByTestId(`task-${key}`)).toBeVisible()
    await expect(page.getByTestId(`task-check-${key}`)).toHaveCount(0)
    // It can't be dragged.
    await expect(page.getByTestId(`task-${key}`)).toHaveAttribute('data-locked', 'true')
    await page.getByTestId(`task-${key}`).click()
    const menu = page.getByTestId('task-menu')
    await expect(menu.getByTestId('task-menu-linked-device')).toHaveText('From the production schedule. Do this on the production schedule.')
    // QA 5: its notes, which the tablet can't read anywhere else.
    await expect(menu.getByTestId('task-menu-notes-text')).toHaveText('Bring the Citra up from the cooler')
    for (const id of ['task-menu-edit', 'task-menu-complete', 'task-menu-change-day', 'task-menu-delete', 'task-menu-open-schedule']) await expect(menu.getByTestId(id)).toHaveCount(0)
  })
})
