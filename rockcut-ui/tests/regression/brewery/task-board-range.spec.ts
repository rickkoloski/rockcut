import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import {
  addDays,
  apiAs,
  boardWrite,
  card,
  cleanupTasks,
  completeTask,
  createTask,
  denverToday,
  fitViewportToBoard,
  getBoard,
  listKeys,
  mouseDrag,
  moveTask,
  openBoard,
  tempTag,
  type ApiCard,
} from './taskBoardHelpers'

// D38 §3.8, scenarios S18–S23b: the Unfinished card, Move all to today, the
// range (URL, Previous / Today / Next, the date range selector, 1 week /
// 2 weeks) and the narrow layout.

test.use({ storageState: authFile('brewer1'), viewport: { width: 1600, height: 1000 } })

const created: number[] = []
test.afterEach(async () => {
  await cleanupTasks(created.splice(0))
})

const today = () => denverToday()
const titlesIn = (cards: ApiCard[]) => cards.map((c) => c.title)

test('S18: the Unfinished card comes first and lists open past tasks with their dates, not finished ones or Daily checks', async ({ page }) => {
  const api = await apiAs('brewer1')
  const threeAgo = addDays(today(), -3)
  const a = await createTask(api, { title: tempTag('S18 open A'), due_on: threeAgo })
  const b = await createTask(api, { title: tempTag('S18 open B'), due_on: threeAgo })
  const done = await createTask(api, { title: tempTag('S18 done'), due_on: addDays(today(), -1) })
  created.push(a.id, b.id, done.id)
  await completeTask(api, done.id, 'planned_day')

  await openBoard(page)
  const unfinished = page.getByTestId('unfinished-card')
  await expect(card(page, a.id, 'unfinished')).toBeVisible()
  await expect(card(page, b.id, 'unfinished')).toBeVisible()
  await expect(page.getByTestId(`task-date-${a.id}:unfinished`)).toHaveText(/^\w{3} \d{1,2}\/\d{1,2}$/)
  await expect(card(page, done.id, 'unfinished')).toHaveCount(0)
  await expect(unfinished).not.toContainText('Gravities')
  await expect(unfinished).not.toContainText('Daily')
  // First on the page: left of today's column.
  const u = (await unfinished.boundingBox())!
  const t = (await page.getByTestId(`day-${today()}`).boundingBox())!
  expect(u.x).toBeLessThan(t.x)
  // Its order is the API's: oldest day first.
  const board = await getBoard(api, today(), today())
  await expect.poll(() => listKeys(page, 'unfinished-list')).toEqual(board.unfinished.map((c) => c.key))
})

test('S19: dragging a task out of the Unfinished card onto day 2 moves it there', async ({ page }) => {
  const api = await apiAs('brewer1')
  const task = await createTask(api, { title: tempTag('S19 drag me'), due_on: addDays(today(), -3) })
  created.push(task.id)
  const day2 = addDays(today(), 1)

  // Other tasks on a shared board make the days taller: size the viewport to the board.
  await openBoard(page)
  await fitViewportToBoard(page, 2200)
  const moved = boardWrite(page, new RegExp(`/${task.id}/move$`))
  await mouseDrag(page, card(page, task.id, 'unfinished'), page.getByTestId(`day-list-${day2}`))
  expect((await moved).request().postDataJSON()).toMatchObject({ due_on: day2 })
  await page.reload()
  await expect(card(page, task.id, day2)).toBeVisible()
  await expect(card(page, task.id, 'unfinished')).toHaveCount(0)
})

test('a task dragged over the Unfinished card gets no spot there, and stays on its day', async ({ page }) => {
  // D39 (lead, Task 8): the Unfinished card isn't a place to drop. S19's drag out of it still works.
  const api = await apiAs('brewer1')
  const late = await createTask(api, { title: tempTag('Unfinished stays'), due_on: addDays(today(), -2) })
  const task = await createTask(api, { title: tempTag('Drag over Unfinished'), due_on: today() })
  created.push(late.id, task.id)

  // Sized to the board, as the other drag specs, so extra cards can't push today's card off screen.
  await openBoard(page)
  await fitViewportToBoard(page, 2200)
  const lifted = '[aria-roledescription="sortable"][aria-pressed="true"]'
  const unfinished = page.getByTestId('unfinished-list')
  let moves = 0
  page.on('request', (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname === `/api/boards/brewery/tasks/${task.id}/move`) moves += 1
  })

  await card(page, task.id, today()).scrollIntoViewIfNeeded()
  await expect(unfinished).toBeInViewport()
  const s = (await card(page, task.id, today()).boundingBox())!
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2)
  await page.mouse.down()
  await page.mouse.move(s.x + s.width / 2 + 12, s.y + s.height / 2 + 12, { steps: 4 })
  await expect(page.locator(lifted)).toHaveCount(1)
  // Over the Unfinished card's list, onto its card, and its empty end.
  const u = (await unfinished.boundingBox())!
  const c = (await card(page, late.id, 'unfinished').boundingBox())!
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2, { steps: 20 })
  await page.mouse.move(u.x + u.width / 2, u.y + u.height - 4, { steps: 10 })
  // The drag layer has taken the hover in (its screen-reader announcement), and
  // the placeholder stays in today's list; none shows in Unfinished.
  await expect(page.getByRole('status').filter({ hasText: `${task.title} is not over a list.` })).toHaveCount(1)
  await expect(page.getByTestId(`day-list-${today()}`).locator(lifted)).toHaveCount(1)
  await expect(unfinished.locator(lifted)).toHaveCount(0)
  await page.mouse.up()
  await expect(page.locator(lifted)).toHaveCount(0)

  await page.reload()
  await expect(card(page, task.id, today())).toBeVisible()
  await expect(card(page, task.id, 'unfinished')).toHaveCount(0)
  expect(moves).toBe(0)
})

test.describe('Move all to today', () => {
  // Every open past task moves, the seed's too; they go back afterwards.
  let restore: ApiCard[] = []
  test.afterEach(async () => {
    const api = await apiAs('breweryMgr')
    for (const c of restore.filter((c) => !c.title.startsWith('[TEST-TEMP]'))) await moveTask(api, c.id, c.due_on)
    restore = []
  })

  test('S20, S21: confirm, then today has its own tasks first and the others oldest-first; the card goes away', async ({ page }) => {
    const api = await apiAs('brewer1')
    const t3 = await createTask(api, { title: tempTag('S20 three days ago'), due_on: addDays(today(), -3) })
    const t2 = await createTask(api, { title: tempTag('S20 two days ago'), due_on: addDays(today(), -2) })
    const t1 = await createTask(api, { title: tempTag('S20 yesterday'), due_on: addDays(today(), -1) })
    created.push(t3.id, t2.id, t1.id)
    const before = await getBoard(api, today(), today())
    // D49: the linked tasks (the seed's steps) stay; they move with their steps.
    const [movable, linked] = [before.unfinished.filter((c) => !c.production), before.unfinished.filter((c) => c.production)]
    restore = movable
    const ownToday = before.days[0].cards.filter((c) => c.due_on === today())
    const n = movable.length

    await openBoard(page)
    await page.getByTestId('unfinished-move-all').click()
    const confirm = page.getByRole('dialog').filter({ hasText: `Move ${n} unfinished tasks to today?` })
    await expect(confirm).toBeVisible()
    const moved = boardWrite(page, /\/move_overdue_to_today$/)
    await confirm.getByRole('button', { name: 'Move' }).click()
    expect((await (await moved).json()).moved).toBe(n)
    await page.reload()
    await expect(page.getByTestId(`day-${today()}`)).toBeVisible()
    // S21: the card goes away, unless linked tasks are still on it (then Move all does).
    if (linked.length === 0) await expect(page.getByTestId('unfinished-card')).toHaveCount(0)
    else {
      await expect.poll(() => listKeys(page, 'unfinished-list')).toEqual(linked.map((c) => c.key))
      await expect(page.getByTestId('unfinished-move-all')).toHaveCount(0)
    }

    const after = (await getBoard(api, today(), today())).days[0].cards.filter((c) => c.due_on === today())
    expect(titlesIn(after)).toEqual([...titlesIn(ownToday), ...titlesIn(movable)])
    const mine = titlesIn(after).filter((t) => [t3.title, t2.title, t1.title].includes(t))
    expect(mine).toEqual([t3.title, t2.title, t1.title])

    const history = (await (await (await apiAs('breweryMgr')).get('/api/boards/brewery/tasks/history')).json()).data as { task_id: number; action: string }[]
    for (const t of [t3, t2, t1]) expect(history.filter((e) => e.task_id === t.id && e.action === 'moved')).toHaveLength(1)
  })
})

test('S22: an all-past range shows open tasks with the amber edge; Previous / Next move by its length; Today resets', async ({ page }) => {
  const from = addDays(today(), -10)
  const to = addDays(today(), -1)
  const task = await createTask(await apiAs('brewer1'), { title: tempTag('S22 old'), due_on: addDays(today(), -8) })
  created.push(task.id)

  await openBoard(page)
  await page.getByTestId('board-range-from').fill(from)
  await page.getByTestId('board-range-to').fill(to)
  await page.getByTestId('board-range-apply').click()
  await expect(page).toHaveURL(new RegExp(`from=${from}&to=${to}`))
  await expect(card(page, task.id, addDays(today(), -8))).toHaveAttribute('data-overdue', 'true')
  await expect(card(page, task.id, addDays(today(), -8))).toHaveCSS('border-left-width', '4px')
  await expect(card(page, task.id, 'unfinished')).toBeVisible()
  await expect(page.getByTestId('board-span-7')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('board-span-14')).toHaveAttribute('aria-pressed', 'false')

  await page.getByTestId('board-prev').click()
  await expect(page).toHaveURL(new RegExp(`from=${addDays(from, -10)}&to=${addDays(to, -10)}`))
  await page.getByTestId('board-next').click()
  await page.getByTestId('board-next').click()
  await expect(page).toHaveURL(new RegExp(`from=${addDays(from, 10)}&to=${addDays(to, 10)}`))
  await page.getByTestId('board-today').click()
  await expect(page.getByTestId(`day-${today()}`)).toHaveAttribute('data-today', 'true')
  await expect(page.getByTestId('board-grid').locator('[data-testid^="day-title-"]')).toHaveCount(14)
})

test('S23: a range over 31 days says "Up to 31 days" and isn\'t applied', async ({ page }) => {
  await openBoard(page)
  const url = page.url()
  await page.getByTestId('board-range-from').fill(today())
  await page.getByTestId('board-range-to').fill(addDays(today(), 40))
  await page.getByTestId('board-range-apply').click()
  await expect(page.getByTestId('board-range-error')).toHaveText('Up to 31 days')
  expect(page.url()).toBe(url)
  await expect(page.getByTestId('board-grid').locator('[data-testid^="day-title-"]')).toHaveCount(14)
})

test('D41: an old /brewery/tasks link lands on /tasks/brewery with its range, replacing the old entry', async ({ page }) => {
  const from = addDays(today(), 3)
  const to = addDays(today(), 9)
  await page.goto('/')
  await expect(page.getByTestId('board-grid')).toHaveCount(0)
  await page.goto(`/brewery/tasks?from=${from}&to=${to}`)
  await expect(page).toHaveURL(new RegExp(`/tasks/brewery\\?from=${from}&to=${to}$`))
  await expect(page.getByTestId('board-grid')).toBeVisible()
  await expect(page.getByTestId('board-range-from')).toHaveValue(from)
  await expect(page.getByTestId('board-range-to')).toHaveValue(to)
  await expect(page.getByTestId(`day-${from}`)).toBeVisible()
  await expect(page.getByTestId('board-grid').locator('[data-testid^="day-title-"]')).toHaveCount(7)
  // Replaced: Back goes to the page before, not through the old URL again.
  await page.goBack()
  await expect(page).toHaveURL(/\/$/)
})

test('S23a: 1 week becomes this browser\'s default (after a reload and Today); another browser still opens on 2 weeks', async ({ page, browser }) => {
  await openBoard(page)
  await page.getByTestId('board-span-7').click()
  await expect(page.getByTestId('board-span-7')).toHaveAttribute('aria-pressed', 'true')
  const days = page.getByTestId('board-grid').locator('[data-testid^="day-title-"]')
  await expect(days).toHaveCount(7)
  // One row.
  const first = (await page.getByTestId(`day-${today()}`).boundingBox())!
  const last = (await page.getByTestId(`day-${addDays(today(), 6)}`).boundingBox())!
  expect(Math.abs(last.y - first.y)).toBeLessThan(2)

  await page.goto('/tasks/brewery')
  await expect(days).toHaveCount(7)
  await page.getByTestId('board-today').click()
  await expect(days).toHaveCount(7)
  await expect(page.getByTestId('board-span-7')).toHaveAttribute('aria-pressed', 'true')

  const ctx = await browser.newContext({ storageState: authFile('brewer1'), viewport: { width: 1600, height: 1000 } })
  const other = await ctx.newPage()
  await openBoard(other)
  await expect(other.getByTestId('board-grid').locator('[data-testid^="day-title-"]')).toHaveCount(14)
  await ctx.close()
})

test('S23b: a custom range highlights neither side; Today uses the default; picking 2 weeks starts from From and becomes the default', async ({ page }) => {
  const from = addDays(today(), -10)
  const to = addDays(today(), 9)
  await openBoard(page)
  await page.getByTestId('board-span-7').click()
  await page.getByTestId('board-range-from').fill(from)
  await page.getByTestId('board-range-to').fill(to)
  await page.getByTestId('board-range-apply').click()
  const days = page.getByTestId('board-grid').locator('[data-testid^="day-title-"]')
  await expect(days).toHaveCount(20)
  await expect(page.getByTestId('board-span-7')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('board-span-14')).toHaveAttribute('aria-pressed', 'false')

  await page.getByTestId('board-today').click()
  await expect(days).toHaveCount(7)

  await page.getByTestId('board-range-from').fill(from)
  await page.getByTestId('board-range-to').fill(to)
  await page.getByTestId('board-range-apply').click()
  await expect(days).toHaveCount(20)
  await page.getByTestId('board-span-14').click()
  await expect(page).toHaveURL(new RegExp(`from=${from}&to=${addDays(from, 13)}`))
  await expect(days).toHaveCount(14)
  await page.goto('/tasks/brewery')
  await expect(days).toHaveCount(14)
  await expect(page.getByTestId('board-span-14')).toHaveAttribute('aria-pressed', 'true')
})

test.describe('narrow screens', () => {
  test.use({ viewport: { width: 1180, height: 900 } })

  test('below about 1280px, Unfinished sits above the days and Future below them', async ({ page }) => {
    const task = await createTask(await apiAs('brewer1'), { title: tempTag('narrow past'), due_on: addDays(today(), -2) })
    created.push(task.id)
    await openBoard(page)
    await expect(page.getByTestId('board-grid')).toHaveAttribute('data-layout', 'stacked')
    const u = (await page.getByTestId('unfinished-card').boundingBox())!
    const d = (await page.getByTestId(`day-${today()}`).boundingBox())!
    const f = (await page.getByTestId('future-list').boundingBox())!
    expect(u.y + u.height).toBeLessThanOrEqual(d.y)
    expect(f.y).toBeGreaterThan(d.y + d.height)
  })
})
