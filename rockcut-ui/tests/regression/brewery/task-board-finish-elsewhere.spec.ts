import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addDays, apiAs, boardWrite, card, cleanupTasks, createTask, dayLabel, denverToday, getBoard, listKeys, openBoard, tempTag } from './taskBoardHelpers'

// D38 §3.8 "Finishing a task on another day", scenarios S8a–S8g and S9c. The
// range runs from three days ago, so a past day and today are both on screen.

test.use({ storageState: authFile('brewer1'), viewport: { width: 1600, height: 1000 } })

const created: number[] = []
test.afterEach(async () => {
  await cleanupTasks(created.splice(0))
})

const today = () => denverToday()
const range = () => ({ from: addDays(today(), -3), to: addDays(today(), 3) })
async function pastTask(label: string, daysAgo = 2) {
  const task = await createTask(await apiAs('brewer1'), { title: tempTag(label), due_on: addDays(today(), -daysAgo) })
  created.push(task.id)
  return task
}

async function history(taskId: number) {
  const res = await (await apiAs('breweryMgr')).get('/api/brewery/tasks/history', { params: { task_id: String(taskId) } })
  expect(res.status()).toBe(200)
  return (await res.json()).data as { action: string; detail: Record<string, unknown> }[]
}

/** Check the task off from the Unfinished card and answer the dialog. */
async function finishFromUnfinished(page: Page, id: number, choice: 'planned' | 'today' | 'both') {
  await page.getByTestId(`task-check-${id}:unfinished`).click()
  await expect(page.getByTestId('finish-dialog')).toBeVisible()
  await expect(page.getByTestId('finish-confirm')).toBeDisabled()
  await page.getByTestId(`finish-${choice}`).check()
  const done = boardWrite(page, new RegExp(`/${id}/complete$`))
  await page.getByTestId('finish-confirm').click()
  await done
  await page.reload()
  await expect(page.getByTestId('board-grid')).toBeVisible()
}

test('S8a: On today: it leaves the Unfinished card and shows on today, after today\'s own tasks, "planned …"', async ({ page }) => {
  const task = await pastTask('S8a Carb FV3')
  const planned = addDays(today(), -2)
  await openBoard(page, range())
  await expect(card(page, task.id, 'unfinished')).toBeVisible()
  await expect(page.getByTestId(`task-date-${task.id}:unfinished`)).toHaveText(dayLabel(planned))

  await finishFromUnfinished(page, task.id, 'today')
  await expect(card(page, task.id, 'unfinished')).toHaveCount(0)
  await expect(card(page, task.id, planned)).toHaveCount(0)
  await expect(card(page, task.id, today())).toHaveAttribute('data-done', 'true')
  await expect(page.getByTestId(`task-tag-planned-${task.id}:${today()}`)).toHaveText(`planned ${dayLabel(planned)}`)
  // After today's own tasks, on screen as in the API.
  const cards = (await getBoard(await apiAs('brewer1'), today(), today())).days[0].cards
  const mine = cards.findIndex((c) => c.id === task.id)
  expect(mine).toBeGreaterThan(cards.map((c) => c.due_on).lastIndexOf(today()))
  await expect.poll(() => listKeys(page, `day-list-${today()}`)).toEqual(cards.map((c) => c.key))
  const completed = (await history(task.id)).find((e) => e.action === 'completed')
  expect(completed?.detail).toMatchObject({ display: 'completed_day', completed_on: today() })
})

test('S8b: On both days: in place on the planned day with "done …", and on today with "planned …"; neither drags', async ({ page }) => {
  const task = await pastTask('S8b Carb FV3')
  const planned = addDays(today(), -2)
  await openBoard(page, range())
  await finishFromUnfinished(page, task.id, 'both')

  await expect(card(page, task.id, planned)).toHaveAttribute('data-done', 'true')
  await expect(page.getByTestId(`task-tag-done-${task.id}:${planned}`)).toHaveText(`done ${dayLabel(today())}`)
  await expect(page.getByTestId(`task-tag-planned-${task.id}:${today()}`)).toHaveText(`planned ${dayLabel(planned)}`)
  await expect(card(page, task.id, planned)).toHaveAttribute('data-locked', 'true')
  await expect(card(page, task.id, today())).toHaveAttribute('data-locked', 'true')
  await expect(card(page, task.id, 'unfinished')).toHaveCount(0)
})

test('S8c: On its planned day: done only there; today doesn\'t show it', async ({ page }) => {
  const task = await pastTask('S8c Carb FV3')
  const planned = addDays(today(), -2)
  await openBoard(page, range())
  await finishFromUnfinished(page, task.id, 'planned')

  await expect(card(page, task.id, planned)).toHaveAttribute('data-done', 'true')
  await expect(card(page, task.id, today())).toHaveCount(0)
  await expect(card(page, task.id, 'unfinished')).toHaveCount(0)
})

test('S8d: unchecking the "both" copy on today (after a confirm) reopens it on its planned day and the Unfinished card', async ({ page }) => {
  const task = await pastTask('S8d Carb FV3')
  const planned = addDays(today(), -2)
  await openBoard(page, range())
  await finishFromUnfinished(page, task.id, 'both')

  await page.getByTestId(`task-check-${task.id}:${today()}`).click()
  const confirm = page.getByRole('dialog').filter({ hasText: 'Mark not done?' })
  await expect(confirm).toContainText(`goes back to open on ${dayLabel(planned)}`)
  const undone = boardWrite(page, new RegExp(`/${task.id}/uncomplete$`))
  await confirm.getByRole('button', { name: 'Mark not done' }).click()
  await undone
  await page.reload()

  await expect(card(page, task.id, today())).toHaveCount(0)
  await expect(card(page, task.id, planned)).toHaveAttribute('data-done', 'false')
  await expect(card(page, task.id, planned)).toHaveAttribute('data-overdue', 'true')
  await expect(card(page, task.id, 'unfinished')).toBeVisible()
})

test('S8e: Cancel leaves the task open and logs nothing', async ({ page }) => {
  const task = await pastTask('S8e Carb FV3')
  const before = (await history(task.id)).length
  await openBoard(page, range())
  await page.getByTestId(`task-check-${task.id}:unfinished`).click()
  await page.getByTestId('finish-cancel').click()
  await expect(page.getByTestId('finish-dialog')).toHaveCount(0)
  await expect(page.getByTestId(`task-check-${task.id}:unfinished`)).not.toBeChecked()
  await page.reload()
  await expect(card(page, task.id, 'unfinished')).toHaveAttribute('data-done', 'false')
  expect((await history(task.id)).length).toBe(before)
})

test('S8g: a future-day task finished early asks too; On today moves its card to today', async ({ page }) => {
  const planned = addDays(today(), 2)
  const task = await createTask(await apiAs('brewer1'), { title: tempTag('S8g Package Pils FV3'), due_on: planned })
  created.push(task.id)
  await openBoard(page, range())
  await page.getByTestId(`task-check-${task.id}:${planned}`).click()
  await expect(page.getByTestId('finish-dialog-text')).toHaveText(`Planned for ${dayLabel(planned)}, finished today (${dayLabel(today())}).`)
  await page.getByTestId('finish-today').check()
  const done = boardWrite(page, new RegExp(`/${task.id}/complete$`))
  await page.getByTestId('finish-confirm').click()
  await done
  await page.reload()
  await expect(page.getByTestId(`task-tag-planned-${task.id}:${today()}`)).toHaveText(`planned ${dayLabel(planned)}`)
  await expect(card(page, task.id, planned)).toHaveCount(0)
})

test('S8f: completing a past-day task without `display` is 422 display_required', async () => {
  const task = await pastTask('S8f Carb FV3')
  const res = await (await apiAs('brewer1')).post(`/api/brewery/tasks/${task.id}/complete`, { data: {} })
  expect(res.status()).toBe(422)
  expect((await res.json()).error).toBe('display_required')
})

test('S9c: Mark completed in the menu on yesterday\'s task opens the same dialog', async ({ page }) => {
  const task = await pastTask('S9c Dry hop', 1)
  const yesterday = addDays(today(), -1)
  await openBoard(page, range())
  await page.getByTestId(`task-title-${task.id}:${yesterday}`).click()
  await page.getByTestId('task-menu-complete').click()
  await expect(page.getByTestId('finish-dialog')).toBeVisible()
  await expect(page.getByTestId('finish-dialog-text')).toContainText(`Planned for ${dayLabel(yesterday)}`)
  await page.getByTestId('finish-cancel').click()
  await expect(card(page, task.id, yesterday)).toHaveAttribute('data-done', 'false')
})
