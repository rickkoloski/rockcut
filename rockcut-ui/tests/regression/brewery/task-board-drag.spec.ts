import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import {
  addDays,
  apiAs,
  boardWrite,
  card,
  cleanupTasks,
  createTask,
  dayLabel,
  denverToday,
  getBoard,
  listKeys,
  mouseDrag,
  openBoard,
  tempTag,
} from './taskBoardHelpers'

// D38 §3.7 through the board, scenarios S12–S14: mouse and keyboard moves
// within and across days, Escape, and a move the server refuses snapping back.
// Each test works on days it fills with its own [TEST-TEMP] tasks.

// Tall enough for both rows of two weeks, so no drag needs to scroll.
test.use({ storageState: authFile('brewer1'), viewport: { width: 1600, height: 2200 } })

const created: number[] = []
test.afterEach(async () => {
  await cleanupTasks(created.splice(0))
})

const today = () => denverToday()

async function tasksOn(day: string, labels: string[]) {
  const api = await apiAs('brewer1')
  const tasks = []
  for (const label of labels) {
    const t = await createTask(api, { title: tempTag(label), due_on: day })
    created.push(t.id)
    tasks.push(t)
  }
  return tasks
}

/** The keys in a day's list that belong to `ids`, in order. */
async function orderOf(page: Page, day: string, ids: number[]) {
  const keys = await listKeys(page, `day-list-${day}`)
  return keys.filter((k) => ids.includes(Number(k.split(':')[0])))
}

/** The drag handle: the focusable wrapper around a card in a day's list (not the lifted copy). */
const handle = (page: Page, id: number, day: string) =>
  page.getByTestId(`day-list-${day}`).getByTestId(`task-${id}:${day}`).locator('xpath=..')

test('S12: dragging the 3rd task to the top persists after a reload, for brewer2 too', async ({ page, browser }) => {
  const day = addDays(today(), 4)
  const [a, b, c] = await tasksOn(day, ['S12 A', 'S12 B', 'S12 C'])
  await openBoard(page)
  const own = (await getBoard(await apiAs('brewer1'), day, day)).days[0].cards.filter((x) => x.due_on === day)
  const top = own[0]

  const moved = boardWrite(page, new RegExp(`/${c.id}/move$`))
  await mouseDrag(page, card(page, c.id, day), page.getByTestId(`day-list-${day}`), card(page, top.id, day))
  expect((await moved).request().postDataJSON()).toEqual({ due_on: day, before_id: top.id })

  await page.reload()
  await expect(card(page, c.id, day)).toBeVisible()
  expect((await listKeys(page, `day-list-${day}`))[0]).toBe(`${c.id}:${day}`)
  expect(await orderOf(page, day, [a.id, b.id, c.id])).toEqual([`${c.id}:${day}`, `${a.id}:${day}`, `${b.id}:${day}`])

  const ctx = await browser.newContext({ storageState: authFile('brewer2'), viewport: { width: 1600, height: 2200 } })
  const other = await ctx.newPage()
  await openBoard(other)
  await expect(card(other, c.id, day)).toBeVisible()
  expect(await orderOf(other, day, [a.id, b.id, c.id])).toEqual([`${c.id}:${day}`, `${a.id}:${day}`, `${b.id}:${day}`])
  await ctx.close()
})

test('S13: dragging from today to day 9 (second row) between two tasks lands there; both counts update', async ({ page }) => {
  const day9 = addDays(today(), 8)
  const [t] = await tasksOn(today(), ['S13 move me'])
  const [x, y] = await tasksOn(day9, ['S13 X', 'S13 Y'])
  // Taller still: day 9 is in the second row, under today, and other tasks on
  // a shared board (DEV) push it down; at 2200px the whole board fits, so
  // there's nothing to scroll.
  await page.setViewportSize({ width: 1600, height: 2600 })
  await openBoard(page)
  const todayCount = Number(await page.getByTestId(`day-count-${today()}`).textContent())
  const day9Count = Number(await page.getByTestId(`day-count-${day9}`).textContent())

  const moved = boardWrite(page, new RegExp(`/${t.id}/move$`))
  await mouseDrag(page, card(page, t.id, today()), page.getByTestId(`day-list-${day9}`), card(page, y.id, day9))
  expect((await moved).request().postDataJSON()).toEqual({ due_on: day9, before_id: y.id })
  await expect(page.getByTestId(`day-count-${today()}`)).toHaveText(String(todayCount - 1))
  await expect(page.getByTestId(`day-count-${day9}`)).toHaveText(String(day9Count + 1))

  await page.reload()
  await expect(card(page, t.id, day9)).toBeVisible()
  expect(await orderOf(page, day9, [x.id, y.id, t.id])).toEqual([`${x.id}:${day9}`, `${t.id}:${day9}`, `${y.id}:${day9}`])
  await expect(page.getByTestId(`day-count-${today()}`)).toHaveText(String(todayCount - 1))
  await expect(page.getByTestId(`day-count-${day9}`)).toHaveText(String(day9Count + 1))
})

test('S14: keyboard: Space picks up, an arrow moves it to the next day, Space drops; it persists', async ({ page }) => {
  const from = addDays(today(), 5)
  const to = addDays(today(), 6)
  const [t] = await tasksOn(from, ['S14 keyboard'])
  await openBoard(page)

  await handle(page, t.id, from).focus()
  await page.keyboard.press('Space')
  await expect(handle(page, t.id, from)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[aria-live]')).toContainText([/S14 keyboard/])
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[aria-live]')).toContainText([new RegExp(`S14 keyboard.*${dayLabel(to)}`)])
  const moved = boardWrite(page, new RegExp(`/${t.id}/move$`))
  await page.keyboard.press('Space')
  expect((await moved).request().postDataJSON()).toMatchObject({ due_on: to })
  await page.reload()
  await expect(card(page, t.id, to)).toBeVisible()
})

test('S14: Escape mid-move puts it back and saves nothing', async ({ page }) => {
  const day = addDays(today(), 5)
  const tasks = await tasksOn(day, ['S14 esc A', 'S14 esc B'])
  await openBoard(page)
  const before = await listKeys(page, `day-list-${day}`)
  const moves: string[] = []
  page.on('request', (r) => /\/api\/brewery\/tasks\/\d+\/move$/.test(r.url()) && moves.push(r.url()))

  await handle(page, tasks[0].id, day).focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Escape')
  await expect(page.locator('[aria-live]').filter({ hasText: 'Cancelled' })).toHaveCount(1)
  expect(await listKeys(page, `day-list-${day}`)).toEqual(before)
  await page.reload()
  await expect(card(page, tasks[0].id, day)).toBeVisible()
  expect(await listKeys(page, `day-list-${day}`)).toEqual(before)
  expect(moves).toEqual([])
})

test('a move the server refuses snaps back with an error toast', async ({ page }) => {
  const day = addDays(today(), 4)
  const [a, b] = await tasksOn(day, ['reject A', 'reject B'])
  await openBoard(page)
  const before = await orderOf(page, day, [a.id, b.id])
  await page.route('**/api/brewery/tasks/*/move', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom', message: 'The server had a problem' }) }),
  )

  const refused = page.waitForResponse((r) => r.url().endsWith(`/${b.id}/move`) && r.status() === 500)
  await mouseDrag(page, card(page, b.id, day), page.getByTestId(`day-list-${day}`), card(page, a.id, day))
  await refused
  await expect(page.getByTestId('board-toast')).toContainText('The server had a problem')
  await expect.poll(() => orderOf(page, day, [a.id, b.id])).toEqual(before)

  await page.unroute('**/api/brewery/tasks/*/move')
  await page.reload()
  await expect(card(page, b.id, day)).toBeVisible()
  expect(await orderOf(page, day, [a.id, b.id])).toEqual(before)
})

test('a task finished on another day can\'t be dragged', async ({ page }) => {
  const api = await apiAs('brewer1')
  const t = await createTask(api, { title: tempTag('locked drag'), due_on: addDays(today(), -1) })
  created.push(t.id)
  const res = await api.post(`/api/brewery/tasks/${t.id}/complete`, { data: { display: 'completed_day' } })
  expect(res.status()).toBe(200)
  await tasksOn(addDays(today(), 2), ['locked target'])
  await openBoard(page)
  const moves: string[] = []
  page.on('request', (r) => /\/api\/brewery\/tasks\/\d+\/move$/.test(r.url()) && moves.push(r.url()))

  await mouseDrag(page, card(page, t.id, today()), page.getByTestId(`day-list-${addDays(today(), 2)}`))
  await expect(card(page, t.id, today())).toBeVisible()
  await expect(page.getByTestId('task-menu')).toHaveCount(0)
  expect(moves).toEqual([])
})
