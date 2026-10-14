import { test, expect, type Locator, type Page } from '@playwright/test'
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
  getBoard,
  listKeys,
  moveTask,
  openBoard,
  tempTag,
  touchDrag,
  userId,
} from './taskBoardHelpers'

// D38 §3.8 "Phone width" (plan step 9): one day at a time, the day strip with
// its Future stop, arrows and swipe, the calendar button, and the task menu as
// a bottom sheet (S9a, S15's browser parts, S23j). Touch drag and swipe on a
// real phone (S9e, S15) are checked by hand on the Pixel.

test.use({ storageState: authFile('brewer1'), viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true })

const created: number[] = []
test.afterEach(async () => {
  await cleanupTasks(created.splice(0))
})

// D38's tests are about the one-day view; phones start in the vertical view
// since D39, so they pick one day before each page load. The D39 tests start
// with nothing saved, as a first visit does.
const VERTICAL = 'D39 vertical view'
test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.titlePath.includes(VERTICAL)) return
  await page.addInitScript(() => localStorage.setItem('rockcut.tasks.phoneView', 'day'))
})

const today = () => denverToday()
const phoneDay = (page: Page) => page.getByTestId('phone-day')
/** A closed phone dialog takes its back entry off (S76): wait for that before a reload. */
const settled = (page: Page) =>
  expect.poll(() => page.evaluate(() => Object.keys(history.state ?? {}).some((k) => k.startsWith('rockcut')))).toBe(false)
const stop = (page: Page, s: string) => page.getByTestId(s === 'future' ? 'phone-stop-future' : `phone-stop-${s}`)

/** Open tasks per strip stop, as the API sees them (filter All). */
async function openCounts(from: string, to: string) {
  const board = await getBoard(await apiAs('brewer1'), from, to)
  const counts: Record<string, number> = {}
  for (const d of board.days) counts[d.date] = d.cards.filter((c) => !c.done).length
  counts.future = board.future.filter((c) => !c.done).length
  return counts
}

async function touchSession(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: [number, number][]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y]) => ({ x, y })) })
  return { touch }
}

/** A quick sideways finger swipe across `target` (no pause, so it never becomes a long press). */
async function swipe(page: Page, target: Locator, direction: 'left' | 'right') {
  const { touch } = await touchSession(page)
  const box = (await target.boundingBox())!
  const y = box.y + Math.min(40, box.height / 2)
  const [x0, x1] = direction === 'left' ? [300, 80] : [60, 280]
  await touch('touchStart', [[x0, y]])
  for (let i = 1; i <= 10; i++) await touch('touchMove', [[x0 + ((x1 - x0) * i) / 10, y + 2]])
  await touch('touchEnd', [])
}

test('the phone layout shows one day, starting on today, with a strip of the range ending in Future', async ({ page }) => {
  await openBoard(page)
  await expect(page.getByTestId('board-grid')).toHaveAttribute('data-layout', 'phone')
  await expect(phoneDay(page)).toHaveAttribute('data-stop', today())
  await expect(page.locator('[data-testid^="day-"][data-today]')).toHaveCount(1)
  await expect(page.getByTestId(`day-${today()}`)).toBeVisible()
  await expect(page.getByTestId('future-list')).toHaveCount(0)

  // The default span is 2 weeks: 14 days and the Future stop, in order.
  const stops = await page.getByTestId('phone-strip').locator('[data-stop]').evaluateAll((els) => els.map((e) => e.getAttribute('data-stop')))
  expect(stops).toEqual([...Array.from({ length: 14 }, (_, i) => addDays(today(), i)), 'future'])
  await expect(stop(page, today())).toHaveAttribute('aria-selected', 'true')
  // Nothing wider than the screen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
})

test('each strip stop shows its open count, and the counts follow the filter', async ({ page }) => {
  const api = await apiAs('brewer1')
  const me = await userId(api)
  const day = addDays(today(), 2)
  const mine = await createTask(api, { title: tempTag('phone count mine'), due_on: day, assignee_id: me })
  const anyone = await createTask(api, { title: tempTag('phone count anyone'), due_on: day })
  const done = await createTask(api, { title: tempTag('phone count done'), due_on: day })
  created.push(mine.id, anyone.id, done.id)
  await completeTask(api, done.id, 'planned_day')

  await openBoard(page)
  const counts = await openCounts(today(), addDays(today(), 13))
  for (const [s, n] of Object.entries(counts)) {
    await expect(page.getByTestId(s === 'future' ? 'phone-stop-count-future' : `phone-stop-count-${s}`)).toHaveText(String(n))
  }

  // My tasks: the day counts only what's assigned to brewer1.
  const board = await getBoard(api, day, day)
  const myOpen = board.days[0].cards.filter((c) => !c.done && c.assignee_id === me).length
  await page.getByTestId('board-filter-mine').click()
  await expect(page.getByTestId(`phone-stop-count-${day}`)).toHaveText(String(myOpen))
  await page.getByTestId('board-filter-unassigned').click()
  const unassigned = board.days[0].cards.filter((c) => !c.done && c.assignee_id === null).length
  await expect(page.getByTestId(`phone-stop-count-${day}`)).toHaveText(String(unassigned))
})

test('the arrows and the strip move between days; the Unfinished card shows on today only', async ({ page }) => {
  const api = await apiAs('brewer1')
  const late = await createTask(api, { title: tempTag('phone overdue'), due_on: addDays(today(), -1) })
  created.push(late.id)

  await openBoard(page)
  await expect(page.getByTestId('unfinished-card')).toBeVisible()
  await expect(card(page, late.id, 'unfinished')).toBeVisible()
  await expect(page.getByTestId('phone-prev-day')).toBeDisabled()

  await page.getByTestId('phone-next-day').click()
  await expect(phoneDay(page)).toHaveAttribute('data-stop', addDays(today(), 1))
  await expect(page.getByTestId('unfinished-card')).toHaveCount(0)
  await page.getByTestId('phone-prev-day').click()
  await expect(phoneDay(page)).toHaveAttribute('data-stop', today())
  await expect(page.getByTestId('unfinished-card')).toBeVisible()

  // The last stop is Future, and Next stops there.
  await stop(page, addDays(today(), 13)).click()
  await expect(page.getByTestId(`day-${addDays(today(), 13)}`)).toBeVisible()
  await page.getByTestId('phone-next-day').click()
  await expect(phoneDay(page)).toHaveAttribute('data-stop', 'future')
  await expect(page.getByTestId('phone-next-day')).toBeDisabled()

  // Today in the toolbar goes back to today.
  await page.getByTestId('board-today').click()
  await expect(phoneDay(page)).toHaveAttribute('data-stop', today())
})

test('a sideways swipe changes day; a vertical one doesn\'t', async ({ page }) => {
  await openBoard(page)
  await swipe(page, phoneDay(page), 'left')
  await expect(phoneDay(page)).toHaveAttribute('data-stop', addDays(today(), 1))
  await swipe(page, phoneDay(page), 'left')
  await expect(phoneDay(page)).toHaveAttribute('data-stop', addDays(today(), 2))
  await swipe(page, phoneDay(page), 'right')
  await expect(phoneDay(page)).toHaveAttribute('data-stop', addDays(today(), 1))

  // Mostly up and down: a scroll, not a day change.
  const { touch } = await touchSession(page)
  const box = (await phoneDay(page).boundingBox())!
  const x = box.x + box.width / 2
  await touch('touchStart', [[x, 600]])
  for (let i = 1; i <= 10; i++) await touch('touchMove', [[x - i * 4, 600 - i * 30]])
  await touch('touchEnd', [])
  await expect(page.getByTestId(`day-${addDays(today(), 1)}`)).toBeVisible()
  await expect(phoneDay(page)).toHaveAttribute('data-stop', addDays(today(), 1))
})

test('S15: a long press lifts a task and reorders it within the day; the day doesn\'t change', async ({ page }) => {
  const api = await apiAs('brewer1')
  const day = addDays(today(), 4)
  const a = await createTask(api, { title: tempTag('S15 A'), due_on: day })
  const b = await createTask(api, { title: tempTag('S15 B'), due_on: day })
  created.push(a.id, b.id)

  await openBoard(page)
  await stop(page, day).click()
  const source = card(page, b.id, day)
  await source.scrollIntoViewIfNeeded()
  const s = (await page.getByTestId(`task-title-${b.id}:${day}`).boundingBox())!
  const t = (await card(page, a.id, day).boundingBox())!
  const { touch } = await touchSession(page)
  const [x, y] = [s.x + 40, s.y + s.height / 2]
  await touch('touchStart', [[x, y]])
  // Lifted after the long press: the copy under the finger is a second card with this test id.
  await expect(source).toHaveCount(2)
  // Up onto A, drifting sideways as a finger does.
  const moved = boardWrite(page, new RegExp(`/${b.id}/move$`))
  for (let i = 1; i <= 12; i++) await touch('touchMove', [[x + i * 6, y - ((y - (t.y + 2)) * i) / 12]])
  await touch('touchEnd', [])
  expect((await moved).request().postDataJSON()).toEqual({ due_on: day, before_id: a.id })
  await expect(phoneDay(page)).toHaveAttribute('data-stop', day)
  await expect(page.getByTestId('task-menu')).toHaveCount(0)

  await page.reload()
  await stop(page, day).click()
  await expect(card(page, b.id, day)).toBeVisible()
  const keys = await listKeys(page, `day-list-${day}`)
  expect(keys.indexOf(`${b.id}:${day}`)).toBe(keys.indexOf(`${a.id}:${day}`) - 1)
})

test('S15: a long press drags a task to the very bottom of today, under a card finished there from another day', async ({ page }) => {
  // DEV pass 2, A (Matt's Pixel): today ended in a card finished there from
  // yesterday. Those cards always sit after the day's own tasks (§7 rule 2),
  // but the drag let the task go below it: the placeholder showed last, the
  // server put it above that card, and it landed second from the bottom. The
  // bottom spot is now just above the visitor, and the placeholder shows that.
  const api = await apiAs('brewer1')
  const day = today()
  const visitor = await createTask(api, { title: tempTag('phone bottom visitor'), due_on: addDays(day, -1) })
  created.push(visitor.id)
  await completeTask(api, visitor.id, 'completed_day')
  const own = []
  for (const n of ['A', 'B', 'C', 'D']) {
    const t = await createTask(api, { title: tempTag(`phone bottom ${n}`), due_on: day })
    created.push(t.id)
    own.push(t)
  }

  await openBoard(page)
  const list = page.getByTestId(`day-list-${day}`)
  const keysBefore = await listKeys(page, `day-list-${day}`)
  // The day's visitors (ours, and any the seed has): the last cards in the list.
  const visitors = (await getBoard(api, day, day)).days[0].cards.filter((c) => c.due_on !== day).map((c) => `${c.id}:${day}`)
  expect(visitors).toContain(`${visitor.id}:${day}`)
  expect(keysBefore.slice(-visitors.length)).toEqual(visitors)
  const ownCount = keysBefore.length - visitors.length
  const source = page.getByTestId(`task-title-${own[0].id}:${day}`)
  await source.scrollIntoViewIfNeeded()
  const s = (await source.boundingBox())!
  const { touch } = await touchSession(page)
  const [x, y] = [s.x + 40, s.y + s.height / 2]
  await touch('touchStart', [[x, y]])
  await expect(card(page, own[0].id, day)).toHaveCount(2)

  // Down to the screen's bottom edge, as a finger does, until the page has
  // scrolled as far as it goes; then onto the last card.
  let at = y
  const slide = async (to: number, steps: number) => {
    for (let i = 1; i <= steps; i++) await touch('touchMove', [[x, at + ((to - at) * i) / steps]])
    at = to
  }
  await slide(790, 20)
  await expect
    .poll(() => page.evaluate(() => Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight))
    .toBe(true)
  const last = (await page.getByTestId(`task-${visitors.at(-1)}`).boundingBox())!
  await slide(last.y + last.height - 4, 8)
  // The placeholder settles just above the visitors, not under them.
  await expect
    .poll(() =>
      list.evaluate((el) => {
        const items = Array.from(el.querySelectorAll('[aria-roledescription="sortable"]'))
        if (items.some((e) => e.getAnimations().length > 0)) return 'still moving'
        const shown = items.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
        const lifted = shown.findIndex((e) => e.getAttribute('aria-pressed') === 'true')
        return `${lifted + 1} of ${shown.length}`
      }),
    )
    .toBe(`${ownCount} of ${keysBefore.length}`)

  const moved = boardWrite(page, new RegExp(`/${own[0].id}/move$`))
  await touch('touchEnd', [])
  expect((await moved).request().postDataJSON()).toEqual({ due_on: day, before_id: null })

  await page.reload()
  await expect(list).toBeVisible()
  const keys = await listKeys(page, `day-list-${day}`)
  expect(keys.slice(ownCount - 1)).toEqual([`${own[0].id}:${day}`, ...visitors])
})

test('S9a: tapping a task opens a bottom sheet; Add notes focuses Notes, and then the sheet says Edit notes', async ({ page }) => {
  const api = await apiAs('brewer1')
  const task = await createTask(api, { title: tempTag('S9a Keg Wash'), due_on: today() })
  created.push(task.id)

  await openBoard(page)
  await card(page, task.id, today()).scrollIntoViewIfNeeded()
  await page.getByTestId(`task-title-${task.id}:${today()}`).click()
  const sheet = page.getByTestId('task-menu')
  await expect(sheet).toHaveAttribute('data-variant', 'sheet')
  await expect(page.getByTestId('task-menu-header')).toContainText(task.title)
  for (const id of ['edit', 'notes', 'complete', 'change-day', 'up', 'down', 'delete']) {
    await expect(page.getByTestId(`task-menu-${id}`)).toBeVisible()
  }
  await expect(page.getByTestId('task-menu-notes')).toHaveText('Add notes')
  // The sheet spans the screen's width, at its bottom.
  const box = (await sheet.boundingBox())!
  expect(box.width).toBeGreaterThanOrEqual(359)
  expect(box.y + box.height).toBeGreaterThanOrEqual(799)

  await page.getByTestId('task-menu-notes').click()
  await expect(page.getByTestId('task-notes-input')).toBeFocused()
  await page.keyboard.type('Rinse twice')
  const saved = boardWrite(page, new RegExp(`/api/boards/brewery/tasks/${task.id}$`), 'PATCH')
  await page.getByTestId('task-dialog').getByRole('button', { name: 'Save' }).click()
  await saved
  // The closed dialog takes its back entry off (S76) before the reload.
  await expect(page.getByTestId('task-dialog')).toHaveCount(0)
  await settled(page)

  await page.reload()
  await expect(page.getByTestId(`task-notes-icon-${task.id}:${today()}`)).toBeVisible()
  await page.getByTestId(`task-title-${task.id}:${today()}`).click()
  await expect(page.getByTestId('task-menu-notes')).toHaveText('Edit notes')
})

test('Back with the sheet open closes the sheet and stays on the board; the next Back leaves', async ({ page }) => {
  // DEV pass 2, B (Matt's Pixel): Android back left the page with the sheet open.
  const api = await apiAs('brewer1')
  const task = await createTask(api, { title: tempTag('phone back'), due_on: today() })
  created.push(task.id)

  await page.goto('/')
  await openBoard(page)
  await card(page, task.id, today()).scrollIntoViewIfNeeded()
  await page.getByTestId(`task-title-${task.id}:${today()}`).click()
  await expect(page.getByTestId('task-menu')).toBeVisible()

  await page.goBack()
  await expect(page.getByTestId('task-menu')).toHaveCount(0)
  await expect(page).toHaveURL(/\/tasks\/brewery$/)
  await expect(page.getByTestId('board-grid')).toBeVisible()

  await page.goBack()
  await expect(page).not.toHaveURL(/\/tasks\/brewery/)
})

test('a sheet closed by tapping outside leaves no extra Back behind', async ({ page }) => {
  const api = await apiAs('brewer1')
  const task = await createTask(api, { title: tempTag('phone back outside'), due_on: today() })
  created.push(task.id)

  await page.goto('/')
  await openBoard(page)
  await card(page, task.id, today()).scrollIntoViewIfNeeded()
  await page.getByTestId(`task-title-${task.id}:${today()}`).click()
  await expect(page.getByTestId('task-menu')).toBeVisible()

  // Above the sheet: the backdrop.
  await page.mouse.click(180, 40)
  await expect(page.getByTestId('task-menu')).toHaveCount(0)
  await expect(page).toHaveURL(/\/tasks\/brewery$/)
  // The sheet's entry is gone again: back on the page's own entry.
  await expect.poll(() => page.evaluate(() => Object.keys(history.state ?? {}).some((k) => k.startsWith('rockcut')))).toBe(false)

  await page.goBack()
  await expect(page).not.toHaveURL(/\/tasks\/brewery/)
})

test('S9a: the sheet greys out moves on a locked card, as the desktop menu does', async ({ page }) => {
  const api = await apiAs('brewer1')
  const task = await createTask(api, { title: tempTag('S9a locked'), due_on: addDays(today(), -1) })
  created.push(task.id)
  await completeTask(api, task.id, 'completed_day')

  await openBoard(page)
  await card(page, task.id, today()).scrollIntoViewIfNeeded()
  await page.getByTestId(`task-title-${task.id}:${today()}`).click()
  await expect(page.getByTestId('task-menu')).toHaveAttribute('data-variant', 'sheet')
  for (const id of ['change-day', 'up', 'down']) await expect(page.getByTestId(`task-menu-${id}`)).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByTestId('task-menu-locked-hint')).toHaveText('Mark not done first to move it')
  await expect(page.getByTestId('task-menu-complete')).toHaveText('Mark not done')
})

test('Change day… and Move to Future in the sheet move a task across days', async ({ page }) => {
  const api = await apiAs('brewer1')
  const task = await createTask(api, { title: tempTag('phone change day'), due_on: today() })
  created.push(task.id)
  const target = addDays(today(), 3)

  await openBoard(page)
  await card(page, task.id, today()).scrollIntoViewIfNeeded()
  await page.getByTestId(`task-title-${task.id}:${today()}`).click()
  await page.getByTestId('task-menu-change-day').click()
  await page.getByTestId('change-day-input').fill(target)
  let moved = boardWrite(page, new RegExp(`/${task.id}/move$`))
  await page.getByTestId('change-day-confirm').click()
  expect((await moved).request().postDataJSON()).toEqual({ due_on: target, before_id: null })
  await settled(page)

  await page.reload()
  await expect(card(page, task.id, today())).toHaveCount(0)
  await stop(page, target).click()
  await expect(card(page, task.id, target)).toBeVisible()

  await page.getByTestId(`task-title-${task.id}:${target}`).click()
  await page.getByTestId('task-menu-change-day').click()
  moved = boardWrite(page, new RegExp(`/${task.id}/move$`))
  await page.getByTestId('change-day-future').click()
  expect((await moved).request().postDataJSON()).toEqual({ due_on: null, before_id: null })
  await settled(page)

  await page.reload()
  await stop(page, 'future').click()
  await expect(card(page, task.id, 'future')).toBeVisible()
})

test('S23j: the strip\'s Future stop shows the Future list, and its + Add a task adds a task with no day', async ({ page }) => {
  const title = tempTag('S23j Line clean?')
  await openBoard(page)
  await stop(page, 'future').click()
  await expect(phoneDay(page)).toHaveAttribute('data-stop', 'future')
  await expect(page.getByTestId('future-list')).toBeVisible()
  await expect(page.getByTestId(`day-${today()}`)).toHaveCount(0)

  await page.getByTestId('future-add').click()
  await expect(page.getByTestId('task-no-day')).toBeChecked()
  await page.getByTestId('task-title-input').fill(title)
  const saved = boardWrite(page, /^\/api\/boards\/brewery\/tasks$/)
  await page.getByTestId('task-dialog').getByRole('button', { name: 'Save' }).click()
  const task = (await (await saved).json()).data
  created.push(task.id)
  expect(task.due_on).toBeNull()
  await settled(page)

  await page.reload()
  await stop(page, 'future').click()
  await expect(card(page, task.id, 'future')).toBeVisible()
  await expect(page.getByTestId('phone-stop-count-future')).toHaveText(String((await openCounts(today(), today())).future))
})

test('the 1 week / 2 weeks toggle and the date range sit behind the calendar button', async ({ page }) => {
  await openBoard(page)
  await expect(page.getByTestId('board-span-7')).toHaveCount(0)
  await expect(page.getByTestId('board-range-from')).toHaveCount(0)
  // Hide completed and the filter stay on the toolbar.
  await expect(page.getByTestId('board-hide-completed')).toBeAttached()
  await expect(page.getByTestId('board-filter-mine')).toBeVisible()

  await page.getByTestId('board-calendar').click()
  await expect(page.getByTestId('board-calendar-dialog')).toBeVisible()
  await page.getByTestId('board-span-7').click()
  await expect(page.getByTestId('board-calendar-dialog')).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`from=${today()}&to=${addDays(today(), 6)}`))
  await expect(page.getByTestId('phone-strip').locator('[data-stop]')).toHaveCount(8)

  // A custom range: the strip follows it, and the day starts on its first day.
  const from = addDays(today(), 20)
  const to = addDays(today(), 24)
  await page.getByTestId('board-calendar').click()
  await page.getByTestId('board-range-from').fill(from)
  await page.getByTestId('board-range-to').fill(to)
  await page.getByTestId('board-range-apply').click()
  await expect(page).toHaveURL(new RegExp(`from=${from}&to=${to}`))
  await expect(page.getByTestId('phone-strip').locator('[data-stop]')).toHaveCount(6)
  await expect(phoneDay(page)).toHaveAttribute('data-stop', from)

  // Too long a range keeps the dialog open with the message.
  await page.getByTestId('board-calendar').click()
  await page.getByTestId('board-range-to').fill(addDays(from, 40))
  await page.getByTestId('board-range-apply').click()
  await expect(page.getByTestId('board-range-error')).toHaveText('Up to 31 days')
  await expect(page.getByTestId('board-calendar-dialog')).toBeVisible()
})

test('as breweryMgr, the ⋮ menu, Daily items and History fit the phone screen', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: authFile('breweryMgr'), viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  const widest = () => page.evaluate(() => Math.max(...[...document.querySelectorAll('.MuiDialog-paper, .MuiDialog-paper *')].map((e) => e.getBoundingClientRect().right)))
  try {
    await openBoard(page)
    await page.getByTestId('board-menu').click()
    await page.getByTestId('board-menu-daily-items').click()
    await expect(page.getByRole('dialog', { name: 'Daily items' })).toBeVisible()
    expect(await widest()).toBeLessThanOrEqual(360)
    await page.getByRole('dialog', { name: 'Daily items' }).getByRole('button', { name: 'Done' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await page.getByTestId('board-menu').click()
    await page.getByTestId('board-menu-history').click()
    await expect(page.getByRole('dialog', { name: 'History' })).toBeVisible()
    expect(await widest()).toBeLessThanOrEqual(360)
  } finally {
    await ctx.close()
  }
})

test.describe(VERTICAL, () => {
  const dayCard = (page: Page, date: string) => page.getByTestId(`day-${date}`)

  test('S70: a first visit is the vertical view; choosing one day survives a reload', async ({ page }) => {
    const api = await apiAs('brewer1')
    const late = await createTask(api, { title: tempTag('S70 overdue'), due_on: addDays(today(), -3) })
    created.push(late.id)

    await openBoard(page)
    await expect(page.getByTestId('board-grid')).toHaveAttribute('data-layout', 'vertical')
    await expect(page.getByTestId('board-view-vertical')).toHaveAttribute('aria-pressed', 'true')
    // Unfinished first, every day of the range in order with its header and Daily card, then Future.
    const order = await page
      .getByTestId('board-grid')
      .locator('[data-testid="unfinished-card"], [data-testid^="day-"][data-today], [data-testid="future-list"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
    expect(order).toEqual(['unfinished-card', ...Array.from({ length: 14 }, (_, i) => `day-${addDays(today(), i)}`), 'future-list'])
    await expect(dayCard(page, addDays(today(), 5)).getByTestId(`daily-${addDays(today(), 5)}`)).toBeAttached()
    await expect(page.getByTestId('phone-strip')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)

    await page.getByTestId('board-view-day').click()
    await expect(page.getByTestId('board-grid')).toHaveAttribute('data-layout', 'phone')
    await page.reload()
    await expect(page.getByTestId('board-grid')).toHaveAttribute('data-layout', 'phone')
    await expect(page.getByTestId('board-view-day')).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('board-view-vertical').click()
    await page.reload()
    await expect(page.getByTestId('board-grid')).toHaveAttribute('data-layout', 'vertical')
  })

  test('S71: a long press drags a task down to day 3, scrolling the page; it lands where dropped', async ({ page, browser }) => {
    const api = await apiAs('brewer1')
    const day3 = addDays(today(), 3)
    const task = await createTask(api, { title: tempTag('S71 Keg BBT1'), due_on: today() })
    const a = await createTask(api, { title: tempTag('S71 day 3 A'), due_on: day3 })
    const b = await createTask(api, { title: tempTag('S71 day 3 B'), due_on: day3 })
    created.push(task.id, a.id, b.id)

    await openBoard(page)
    const scrolledFrom = await page.evaluate(() => window.scrollY)
    const moved = boardWrite(page, new RegExp(`/${task.id}/move$`))
    await touchDrag(page, card(page, task.id, today()), page.getByTestId(`day-list-${day3}`), card(page, b.id, day3))
    expect((await moved).request().postDataJSON()).toEqual({ due_on: day3, before_id: b.id })
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(scrolledFrom)

    await page.reload()
    await expect(card(page, task.id, day3)).toBeAttached()
    await expect(card(page, task.id, today())).toHaveCount(0)
    const keys = await listKeys(page, `day-list-${day3}`)
    expect(keys.indexOf(`${task.id}:${day3}`)).toBe(keys.indexOf(`${b.id}:${day3}`) - 1)

    // History, as a manager reads it.
    const ctx = await browser.newContext({ storageState: authFile('breweryMgr'), viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true })
    const mgr = await ctx.newPage()
    await openBoard(mgr)
    await mgr.getByTestId('board-menu').click()
    await mgr.getByTestId('board-menu-history').click()
    const label = (key: string) =>
      new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'numeric', day: 'numeric' })
        .format(new Date(`${key}T12:00:00Z`))
        .replace(',', '')
    await expect(mgr.getByTestId('history-list')).toContainText(`Moved ${task.title} from ${label(today())} to ${label(day3)}`)
    await ctx.close()
  })

  test('S72: a long press drags a task off the Unfinished card onto tomorrow', async ({ page }) => {
    const api = await apiAs('brewer1')
    const tomorrow = addDays(today(), 1)
    const late = await createTask(api, { title: tempTag('S72 three days ago'), due_on: addDays(today(), -3) })
    created.push(late.id)

    await openBoard(page)
    const moved = boardWrite(page, new RegExp(`/${late.id}/move$`))
    await touchDrag(page, card(page, late.id, 'unfinished'), page.getByTestId(`day-list-${tomorrow}`))
    expect((await moved).request().postDataJSON()).toEqual({ due_on: tomorrow, before_id: null })

    await page.reload()
    await expect(card(page, late.id, tomorrow)).toBeVisible()
    await expect(card(page, late.id, 'unfinished')).toHaveCount(0)
    expect((await getBoard(api, addDays(today(), -3), addDays(today(), -3))).days[0].cards.some((c) => c.id === late.id)).toBe(false)
  })

  test('S73: in the one-day view on today, a task from the Unfinished card goes between today\'s first and second', async ({ page }) => {
    const api = await apiAs('brewer1')
    const late = await createTask(api, { title: tempTag('S73 yesterday'), due_on: addDays(today(), -1) })
    created.push(late.id)
    // Two tasks at the top of today: put them first.
    const first = await createTask(api, { title: tempTag('S73 first'), due_on: today() })
    const second = await createTask(api, { title: tempTag('S73 second'), due_on: today() })
    created.push(first.id, second.id)
    const top = (await getBoard(api, today(), today())).days[0].cards.find((c) => c.due_on === today())!
    await moveTask(api, second.id, today(), top.id)
    await moveTask(api, first.id, today(), second.id)
    const keysBefore = (await getBoard(api, today(), today())).days[0].cards.filter((c) => c.due_on === today()).map((c) => c.id)
    expect(keysBefore.slice(0, 2)).toEqual([first.id, second.id])

    await openBoard(page)
    await page.getByTestId('board-view-day').click()
    await expect(page.getByTestId('phone-day')).toHaveAttribute('data-stop', today())
    const moved = boardWrite(page, new RegExp(`/${late.id}/move$`))
    await touchDrag(page, card(page, late.id, 'unfinished'), page.getByTestId(`day-list-${today()}`), card(page, second.id, today()))
    expect((await moved).request().postDataJSON()).toEqual({ due_on: today(), before_id: second.id })

    await page.reload()
    await expect(page.getByTestId('board-grid')).toHaveAttribute('data-layout', 'phone')
    await expect(card(page, late.id, today())).toBeAttached()
    await expect(card(page, late.id, 'unfinished')).toHaveCount(0)
    const keys = await listKeys(page, `day-list-${today()}`)
    expect(keys.slice(0, 3)).toEqual([`${first.id}:${today()}`, `${late.id}:${today()}`, `${second.id}:${today()}`])
  })

  test('S74: a long press drags a task onto the Future list at the bottom', async ({ page }) => {
    const api = await apiAs('brewer1')
    const task = await createTask(api, { title: tempTag('S74 Order CO2'), due_on: today() })
    created.push(task.id)

    await openBoard(page)
    const moved = boardWrite(page, new RegExp(`/${task.id}/move$`))
    await touchDrag(page, card(page, task.id, today()), page.getByTestId('future-items'))
    expect((await moved).request().postDataJSON()).toMatchObject({ due_on: null })

    await page.reload()
    await expect(card(page, task.id, 'future')).toBeAttached()
    await expect(card(page, task.id, today())).toHaveCount(0)
  })
})

test.describe('S76: the back gesture closes the phone dialogs', () => {
  const sheetAction = async (page: Page, id: number, day: string, action: string) => {
    await card(page, id, day).scrollIntoViewIfNeeded()
    await page.getByTestId(`task-title-${id}:${day}`).click()
    await expect(page.getByTestId('task-menu')).toHaveAttribute('data-variant', 'sheet')
    await page.getByTestId(`task-menu-${action}`).click()
  }

  const backClosesIt = async (page: Page, dialog: string) => {
    const url = page.url()
    await expect(page.getByTestId(dialog)).toBeVisible()
    await page.goBack()
    await expect(page.getByTestId(dialog)).toHaveCount(0)
    expect(page.url()).toBe(url)
    await expect(page.getByTestId('board-grid')).toBeVisible()
  }

  test('Edit, Change day… and "where should it show" each close on back; the board stays', async ({ page }) => {
    const api = await apiAs('brewer1')
    const task = await createTask(api, { title: tempTag('S76 back'), due_on: today() })
    const later = await createTask(api, { title: tempTag('S76 tomorrow'), due_on: addDays(today(), 1) })
    created.push(task.id, later.id)

    await page.goto('/')
    await openBoard(page)
    await sheetAction(page, task.id, today(), 'edit')
    await backClosesIt(page, 'task-dialog')
    await sheetAction(page, task.id, today(), 'change-day')
    await backClosesIt(page, 'change-day-dialog')

    // Ticking tomorrow's task today asks where it should show.
    await stop(page, addDays(today(), 1)).click()
    await page.getByTestId(`task-check-${later.id}:${addDays(today(), 1)}`).click()
    await backClosesIt(page, 'finish-dialog')
    expect((await getBoard(api, addDays(today(), 1), addDays(today(), 1))).days[0].cards.find((c) => c.id === later.id)!.done).toBe(false)

    // Nothing left behind: one more back leaves the board.
    await page.goBack()
    await expect(page).not.toHaveURL(/\/tasks\/brewery/)
  })

  test('a dialog opened from the sheet takes over its entry: back closes it, the next back leaves', async ({ page }) => {
    const api = await apiAs('brewer1')
    const task = await createTask(api, { title: tempTag('S76 handover'), due_on: today() })
    created.push(task.id)

    await page.goto('/')
    await openBoard(page)
    await sheetAction(page, task.id, today(), 'edit')
    await expect(page.getByTestId('task-menu')).toHaveCount(0)
    await backClosesIt(page, 'task-dialog')
    await page.goBack()
    await expect(page).not.toHaveURL(/\/tasks\/brewery/)
  })

  test('a dialog closed with Cancel leaves no dead back press', async ({ page }) => {
    const api = await apiAs('brewer1')
    const task = await createTask(api, { title: tempTag('S76 cancel'), due_on: today() })
    created.push(task.id)

    await page.goto('/')
    await openBoard(page)
    await sheetAction(page, task.id, today(), 'edit')
    await expect(page.getByTestId('task-dialog')).toBeVisible()
    await page.getByTestId('task-dialog').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByTestId('task-dialog')).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => Object.keys(history.state ?? {}).some((k) => k.startsWith('rockcut')))).toBe(false)
    await page.goBack()
    await expect(page).not.toHaveURL(/\/tasks\/brewery/)
  })
})
