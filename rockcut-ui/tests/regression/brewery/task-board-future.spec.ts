import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import {
  addDays,
  apiAs,
  boardWrite,
  card,
  cleanupTasks,
  createTask,
  denverToday,
  getBoard,
  listKeys,
  mouseDrag,
  moveTask,
  openBoard,
  tempTag,
  type ApiCard,
} from './taskBoardHelpers'

// D38 §3.8 Future list, scenarios S23c–S23i (S23j, the phone day strip's
// Future stop, is in task-board-phone.spec.ts).

// Tall enough for a day's list and the Future list together on screen (mouseDrag),
// with the production schedule's tasks on the days too (D49).
test.use({ storageState: authFile('brewer1'), viewport: { width: 1600, height: 2200 } })

const created: number[] = []
// Shared tasks a test moved out of the way, and where they were.
let restore: { card: ApiCard; dueOn: string | null }[] = []
test.afterEach(async () => {
  const api = await apiAs('breweryMgr')
  for (const r of restore) await moveTask(api, r.card.id, r.dueOn)
  restore = []
  await cleanupTasks(created.splice(0))
})

const today = () => denverToday()
const futureKeys = async () => (await getBoard(await apiAs('brewer1'), today(), today())).future.map((c) => c.key)

test('S23c: + Add a task on the Future list adds it at the bottom with no date; it stays after a reload and a range change', async ({ page }) => {
  const title = tempTag('S23c Gas order and Tanks Out')
  await openBoard(page)
  await page.getByTestId('future-add').click()
  await expect(page.getByTestId('task-no-day')).toBeChecked()
  await page.getByTestId('task-title-input').fill(title)
  const saved = boardWrite(page, /^\/api\/boards\/brewery\/tasks$/)
  await page.getByTestId('task-dialog').getByRole('button', { name: 'Save' }).click()
  const task = (await (await saved).json()).data
  created.push(task.id)
  expect(task.due_on).toBeNull()

  await page.reload()
  await expect.poll(() => listKeys(page, 'future-items')).toEqual(await futureKeys())
  expect((await futureKeys()).at(-1)).toBe(`${task.id}:future`)
  await page.getByTestId('board-next').click()
  await expect(card(page, task.id, 'future')).toBeVisible()
})

test('S23d: dragging a Future task onto a day between two tasks puts it there', async ({ page }) => {
  const api = await apiAs('brewer1')
  const day = addDays(today(), 3)
  const x = await createTask(api, { title: tempTag('S23d X'), due_on: day })
  const y = await createTask(api, { title: tempTag('S23d Y'), due_on: day })
  const f = await createTask(api, { title: tempTag('S23d Gas order'), due_on: null })
  created.push(x.id, y.id, f.id)

  await openBoard(page)
  const moved = boardWrite(page, new RegExp(`/${f.id}/move$`))
  await mouseDrag(page, card(page, f.id, 'future'), page.getByTestId(`day-list-${day}`), card(page, y.id, day))
  expect((await moved).request().postDataJSON()).toEqual({ due_on: day, before_id: y.id })
  await page.reload()
  const keys = await (async () => {
    await expect(card(page, f.id, day)).toBeVisible()
    return listKeys(page, `day-list-${day}`)
  })()
  expect(keys.slice(keys.indexOf(`${x.id}:${day}`))).toEqual([`${x.id}:${day}`, `${f.id}:${day}`, `${y.id}:${day}`])
  await expect(card(page, f.id, 'future')).toHaveCount(0)
})

test('S23e: dragging a day\'s task onto the Future list between two tasks puts it there, logged "→ Future"', async ({ page }) => {
  const api = await apiAs('brewer1')
  const day = addDays(today(), 2)
  const a = await createTask(api, { title: tempTag('S23e A'), due_on: null })
  const b = await createTask(api, { title: tempTag('S23e B'), due_on: null })
  const t = await createTask(api, { title: tempTag('S23e move me'), due_on: day })
  created.push(a.id, b.id, t.id)

  await openBoard(page)
  const moved = boardWrite(page, new RegExp(`/${t.id}/move$`))
  await mouseDrag(page, card(page, t.id, day), page.getByTestId('future-items'), card(page, b.id, 'future'))
  expect((await moved).request().postDataJSON()).toEqual({ due_on: null, before_id: b.id })
  await page.reload()
  await expect(card(page, t.id, 'future')).toBeVisible()
  const keys = await listKeys(page, 'future-items')
  expect(keys.slice(keys.indexOf(`${a.id}:future`))).toEqual([`${a.id}:future`, `${t.id}:future`, `${b.id}:future`])
  await expect(card(page, t.id, day)).toHaveCount(0)

  const history = (await (await (await apiAs('breweryMgr')).get('/api/boards/brewery/tasks/history', { params: { task_id: String(t.id) } })).json()).data
  expect(history.find((e: { action: string }) => e.action === 'moved').detail).toMatchObject({ from: { due_on: day }, to: { due_on: null } })
})

test('S23f: Change day… takes a Future task to the bottom of a day five weeks out; Move to Future takes a dated task to the bottom of the list', async ({ page }) => {
  const api = await apiAs('brewer1')
  const target = addDays(today(), 35)
  const f = await createTask(api, { title: tempTag('S23f future'), due_on: null })
  const there = await createTask(api, { title: tempTag('S23f already there'), due_on: target })
  const d = await createTask(api, { title: tempTag('S23f dated'), due_on: addDays(today(), 1) })
  created.push(f.id, there.id, d.id)

  await openBoard(page)
  await page.getByTestId(`task-title-${f.id}:future`).click()
  await page.getByTestId('task-menu-change-day').click()
  await expect(page.getByTestId('change-day-future')).toHaveCount(0)
  await page.getByTestId('change-day-input').fill(target)
  const moved = boardWrite(page, new RegExp(`/${f.id}/move$`))
  await page.getByTestId('change-day-confirm').click()
  await moved

  await page.getByTestId(`task-title-${d.id}:${addDays(today(), 1)}`).click()
  await page.getByTestId('task-menu-change-day').click()
  const moved2 = boardWrite(page, new RegExp(`/${d.id}/move$`))
  await page.getByTestId('change-day-future').click()
  await moved2

  await page.reload()
  await expect(card(page, d.id, 'future')).toBeVisible()
  await expect(card(page, f.id, 'future')).toHaveCount(0)
  expect((await futureKeys()).at(-1)).toBe(`${d.id}:future`)
  const targetCards = (await getBoard(api, target, target)).days[0].cards.map((c) => c.id)
  expect(targetCards.slice(-2)).toEqual([there.id, f.id])
})

test('S23g: checking a Future task asks nothing, shows it done on today "from Future"; Mark not done puts it at the bottom of the list', async ({ page }) => {
  const api = await apiAs('brewer1')
  const f = await createTask(api, { title: tempTag('S23g future'), due_on: null })
  const last = await createTask(api, { title: tempTag('S23g after it'), due_on: null })
  created.push(f.id, last.id)

  await openBoard(page)
  const done = boardWrite(page, new RegExp(`/${f.id}/complete$`))
  await page.getByTestId(`task-check-${f.id}:future`).click()
  await done
  await expect(page.getByTestId('finish-dialog')).toHaveCount(0)
  await page.reload()
  await expect(card(page, f.id, today())).toHaveAttribute('data-done', 'true')
  await expect(page.getByTestId(`task-tag-from-future-${f.id}:${today()}`)).toHaveText('from Future')
  await expect(card(page, f.id, 'future')).toHaveCount(0)

  await page.getByTestId(`task-title-${f.id}:${today()}`).click()
  const undone = boardWrite(page, new RegExp(`/${f.id}/uncomplete$`))
  await page.getByTestId('task-menu-complete').click()
  await undone
  await page.reload()
  await expect(card(page, f.id, today())).toHaveCount(0)
  expect((await futureKeys()).slice(-2)).toEqual([`${last.id}:future`, `${f.id}:future`])
  await expect.poll(() => listKeys(page, 'future-items')).toEqual(await futureKeys())
})

test('S23h: with open Future tasks and nothing overdue, there is no Unfinished card and the Future count shows them', async ({ page }) => {
  const api = await apiAs('brewer1')
  // Clear the overdue tasks out of the way (put back after).
  const board = await getBoard(api, today(), today())
  for (const c of board.unfinished) {
    restore.push({ card: c, dueOn: c.due_on })
    await moveTask(await apiAs('breweryMgr'), c.id, addDays(today(), 60))
  }
  for (let i = 0; i < 3; i++) created.push((await createTask(api, { title: tempTag(`S23h future ${i}`), due_on: null })).id)
  const open = (await getBoard(api, today(), today())).future.filter((c) => !c.done).length

  await openBoard(page)
  await expect(page.getByTestId('future-list')).toBeVisible()
  await expect(page.getByTestId('unfinished-card')).toHaveCount(0)
  await expect(page.getByTestId('unfinished-move-all')).toHaveCount(0)
  await expect(page.getByTestId('future-count')).toHaveText(String(open))
})

test('S23i: an empty Future list still shows, with "Nothing here. Drag a task here or add one."', async ({ page }) => {
  const api = await apiAs('breweryMgr')
  const board = await getBoard(api, today(), today())
  for (const c of board.future) {
    restore.push({ card: c, dueOn: null })
    await moveTask(api, c.id, addDays(today(), 60))
  }

  await openBoard(page)
  await expect(page.getByTestId('future-empty')).toHaveText('Nothing here. Drag a task here or add one.')
  await expect(page.getByTestId('future-count')).toHaveText('0')
  await expect(page.getByTestId('future-add')).toBeVisible()
})
