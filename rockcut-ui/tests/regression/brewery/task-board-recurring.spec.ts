import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
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
  moveTask,
  mouseDrag,
  openBoard,
  setBoardCheck,
  tempTag,
  userId,
  type ApiCard,
} from './taskBoardHelpers'

// D39 spec §3.10, scenarios S52–S65, S67, S69 and S78: recurring tasks on the
// board. Dates are relative to today; every write is checked again after a
// reload or through the API. Each series is removed afterwards (DELETE
// "following" with changed=remove on its first occurrence).

test.use({ storageState: authFile('brewer1'), viewport: { width: 1600, height: 1000 } })

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const today = () => denverToday()
const isoWeekday = (key: string) => new Date(`${key}T12:00:00Z`).getUTCDay() || 7
const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

/** The first date on or after `from` that `test` accepts. */
function firstFrom(from: string, ok: (key: string) => boolean): string {
  let d = from
  while (!ok(d)) d = addDays(d, 1)
  return d
}

interface ApiOccurrence extends ApiCard {
  series_id: number | null
  series_date: string | null
  series_exception: boolean
  assignee_name: string | null
}

// Occurrence ids to remove (with their series) after each test.
const created: number[] = []
test.afterEach(async () => {
  const api = await apiAs('breweryMgr')
  for (const id of created) {
    const res = await api.delete(`/api/brewery/tasks/${id}`, { params: { scope: 'following', changed: 'remove' } })
    expect([204, 404, 410]).toContain(res.status()) // 410: deleted already (O-1)
  }
  await cleanupTasks(created.splice(0))
})

/** Create a recurring task through the API; returns its first occurrence. */
async function createSeries(api: APIRequestContext, attrs: Record<string, unknown>): Promise<ApiOccurrence> {
  const res = await api.post('/api/brewery/tasks', { data: attrs })
  expect(res.status(), await res.text()).toBe(201)
  const first = (await res.json()).data as ApiOccurrence
  created.push(first.id)
  return first
}

const weekly = (title: string, start: string, extra: Record<string, unknown> = {}) => ({
  title,
  due_on: start,
  repeat: 'weekly',
  repeat_weekdays: [isoWeekday(start)],
  ...extra,
})

/** Every card of `seriesId` from `from` to `to`, 31 days per request, by planned day. */
async function occurrences(api: APIRequestContext, seriesId: number, from: string, to: string): Promise<ApiOccurrence[]> {
  const out: ApiOccurrence[] = []
  for (let f = from; f <= to; f = addDays(f, 31)) {
    const t = addDays(f, 30) < to ? addDays(f, 30) : to
    const board = await getBoard(api, f, t)
    for (const d of board.days)
      for (const c of d.cards as ApiOccurrence[]) if (c.series_id === seriesId && c.due_on === d.date) out.push(c)
  }
  return out
}

async function seriesInfo(api: APIRequestContext, taskId: number) {
  const res = await api.get(`/api/brewery/tasks/${taskId}/series`)
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()).data as { later_open: number; later_changed: number; count: number | null; frequency: string }
}

/** The occurrence planned on `day` (by the API). */
async function on(api: APIRequestContext, seriesId: number, day: string): Promise<ApiOccurrence | undefined> {
  return (await occurrences(api, seriesId, day, day))[0]
}

const saveDialog = (page: Page) => page.getByTestId('task-dialog').getByRole('button', { name: 'Save' })

async function pick(page: Page, select: string, option: string) {
  await page.getByTestId(select).click()
  await page.getByTestId(option).click()
}

async function openMenu(page: Page, id: number, where: string) {
  await card(page, id, where).getByTestId(`task-title-${id}:${where}`).click()
  await expect(page.getByTestId('task-menu')).toBeVisible()
}

/** Add a task on `day` from the board's dialog, with the repeat set by `setRepeat`; returns the first occurrence. */
async function addThroughDialog(page: Page, title: string, day: string, setRepeat: () => Promise<void>, summary: string) {
  await page.getByTestId(`day-add-${today()}`).click()
  await page.getByTestId('task-title-input').fill(title)
  if (day !== today()) await page.getByTestId('task-day-input').fill(day)
  await setRepeat()
  await expect(page.getByTestId('task-repeat-summary')).toHaveText(summary)
  const saved = boardWrite(page, /^\/api\/brewery\/tasks$/)
  await saveDialog(page).click()
  const first = (await (await saved).json()).data as ApiOccurrence
  created.push(first.id)
  await expect(page.getByTestId('task-dialog')).toHaveCount(0)
  return first
}

test('S52, S67: a weekly task from a day; No day disables Repeat; ↻ on every week, 11 months out too', async ({ page }) => {
  const title = tempTag('S52 Keg Wash')
  const t = today()
  await openBoard(page)
  await page.getByTestId(`day-add-${t}`).click()
  await page.getByTestId('task-title-input').fill(title)

  // S67: no day, no repeat.
  await page.getByTestId('task-no-day').check()
  await expect(page.getByTestId('task-repeat-hint')).toHaveText('Pick a day to repeat')
  await expect(page.getByTestId('task-repeat-select')).toHaveAttribute('aria-disabled', 'true')
  await page.getByTestId('task-no-day').uncheck()

  await pick(page, 'task-repeat-select', 'task-repeat-option-weekly')
  await expect(page.getByTestId(`task-repeat-day-${isoWeekday(t)}`)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('task-repeat-summary')).toHaveText(`Repeats every week on ${WEEKDAY_SHORT[isoWeekday(t) - 1]}`)
  const saved = boardWrite(page, /^\/api\/brewery\/tasks$/)
  await saveDialog(page).click()
  const first = (await (await saved).json()).data as ApiOccurrence
  created.push(first.id)
  expect(first.series_id).not.toBeNull()

  await page.reload()
  await expect(page.getByTestId(`task-repeat-icon-${first.id}:${t}`)).toHaveAttribute('aria-label', 'Repeats')
  const api = await apiAs('brewer1')
  const nextWeek = await on(api, first.series_id!, addDays(t, 7))
  await expect(page.getByTestId(`task-repeat-icon-${nextWeek!.id}:${addDays(t, 7)}`)).toBeVisible()

  // 11 months out, through the date range selector (31 days).
  const from = addDays(t, 308)
  const to = addDays(from, 30)
  await page.getByTestId('board-range-from').fill(from)
  await page.getByTestId('board-range-to').fill(to)
  await page.getByTestId('board-range-apply').click()
  await expect(page).toHaveURL(new RegExp(`from=${from}&to=${to}`))
  const far = await occurrences(api, first.series_id!, from, to)
  expect(far.length).toBeGreaterThanOrEqual(4)
  for (const o of far) await expect(page.getByTestId(`task-repeat-icon-${o.id}:${o.due_on}`)).toBeVisible()
})

test('S53: every other week on Mon and Thu', async ({ page }) => {
  const t = today()
  await openBoard(page)
  const first = await addThroughDialog(
    page,
    tempTag('S53 CIP brite tanks'),
    t,
    async () => {
      await pick(page, 'task-repeat-select', 'task-repeat-option-weekly')
      if (![1, 4].includes(isoWeekday(t))) await page.getByTestId(`task-repeat-day-${isoWeekday(t)}`).click()
      for (const d of [1, 4]) if (isoWeekday(t) !== d) await page.getByTestId(`task-repeat-day-${d}`).click()
      await pick(page, 'task-repeat-interval', 'task-repeat-interval-2')
    },
    'Repeats every other week on Mon and Thu',
  )

  const dates = (await occurrences(await apiAs('brewer1'), first.series_id!, t, addDays(t, 60))).map((o) => o.due_on!)
  const monday = (k: string) => addDays(k, 1 - isoWeekday(k))
  const weeks = (k: string) => Math.round((Date.parse(monday(k)) - Date.parse(monday(t))) / (7 * 86_400_000))
  expect(dates.length).toBeGreaterThanOrEqual(8)
  for (const d of dates) {
    expect([1, 4]).toContain(isoWeekday(d))
    expect(weeks(d) % 2).toBe(0)
  }
  await page.reload()
  await expect(page.getByTestId(`task-repeat-icon-${first.id}:${first.due_on}`)).toBeVisible()
})

test('S54: monthly on day 31 is the last day in shorter months', async ({ page }) => {
  const day31 = firstFrom(addDays(today(), 1), (k) => k.endsWith('-31'))
  await openBoard(page)
  const first = await addThroughDialog(
    page,
    tempTag('S54 Inventory'),
    day31,
    () => pick(page, 'task-repeat-select', 'task-repeat-option-monthly'),
    'Repeats every month on the 31st (or the last day)',
  )
  expect(first.due_on).toBe(day31)

  const dates = (await occurrences(await apiAs('brewer1'), first.series_id!, day31, addDays(day31, 150))).map((o) => o.due_on!)
  expect(dates.length).toBeGreaterThanOrEqual(5)
  for (const d of dates) {
    const [y, m, dd] = d.split('-').map(Number)
    expect(dd).toBe(lastDayOfMonth(y, m))
  }
})

test('S55: monthly on the last Friday', async ({ page }) => {
  const api = await apiAs('brewer1')
  const first = await createSeries(api, {
    title: tempTag('S55 Glycol check'),
    due_on: today(),
    repeat: 'monthly',
    repeat_month_rule: 'weekday',
    repeat_week_of_month: -1,
    repeat_weekday: 5,
  })
  const dates = (await occurrences(api, first.series_id!, today(), addDays(today(), 120))).map((o) => o.due_on!)
  expect(dates.length).toBeGreaterThanOrEqual(3)
  for (const d of dates) {
    expect(isoWeekday(d)).toBe(5)
    expect(Number(addDays(d, 7).slice(5, 7))).not.toBe(Number(d.slice(5, 7)))
  }

  await openBoard(page, { from: first.due_on!, to: first.due_on! })
  await openMenu(page, first.id, first.due_on!)
  await page.getByTestId('task-menu-edit').click()
  await expect(page.getByTestId('task-repeat-summary')).toHaveText('Repeats every month on the last Friday')
})

test('S56: quarterly on the 15th, every 3 months from the start month', async ({ page }) => {
  const day15 = firstFrom(today(), (k) => k.endsWith('-15'))
  await openBoard(page)
  const first = await addThroughDialog(
    page,
    tempTag('S56 Calibrate pH meter'),
    day15,
    () => pick(page, 'task-repeat-select', 'task-repeat-option-quarterly'),
    'Repeats every 3 months on the 15th',
  )
  const dates = (await occurrences(await apiAs('brewer1'), first.series_id!, day15, addDays(day15, 364))).map((o) => o.due_on!)
  const month = (k: string) => Number(k.slice(0, 4)) * 12 + Number(k.slice(5, 7))
  expect(dates).toHaveLength(4)
  dates.forEach((d, i) => {
    expect(d.endsWith('-15')).toBe(true)
    expect(month(d) - month(day15)).toBe(3 * i)
  })
})

test('S57: annually on Mar 1, after 3 times', async ({ page }) => {
  const mar1 = firstFrom(addDays(today(), 1), (k) => k.endsWith('-03-01'))
  await openBoard(page)
  const first = await addThroughDialog(
    page,
    tempTag('S57 TTB permit renewal'),
    mar1,
    async () => {
      await pick(page, 'task-repeat-select', 'task-repeat-option-annually')
      await pick(page, 'task-repeat-ends', 'task-repeat-ends-count')
      await page.getByTestId('task-repeat-count').fill('3')
    },
    'Repeats every year on Mar 1, 3 times',
  )
  expect(first.due_on).toBe(mar1)
  const info = await seriesInfo(await apiAs('brewer1'), first.id)
  expect({ frequency: info.frequency, count: info.count }).toEqual({ frequency: 'annually', count: 3 })
})

test('S58: checking this week’s leaves next week’s open', async ({ page }) => {
  const api = await apiAs('brewer1')
  const t = today()
  const first = await createSeries(api, weekly(tempTag('S58 Keg Wash'), t))
  await openBoard(page)
  await setBoardCheck(page.getByTestId(`task-check-${first.id}:${t}`), true)
  await page.reload()
  await expect(page.getByTestId(`task-check-${first.id}:${t}`)).toBeChecked()
  expect((await on(api, first.series_id!, addDays(t, 7)))!.done).toBe(false)
})

test('S59: dragging one to another day moves only that one; no second copy', async ({ page }) => {
  const api = await apiAs('brewer1')
  const t = today()
  const tomorrow = addDays(t, 1)
  const first = await createSeries(api, weekly(tempTag('S59 Keg Wash'), t))
  await openBoard(page)
  const moved = boardWrite(page, new RegExp(`/${first.id}/move$`))
  await mouseDrag(page, card(page, first.id, t), page.getByTestId(`day-list-${tomorrow}`))
  expect((await moved).request().postDataJSON()).toMatchObject({ due_on: tomorrow })

  await page.reload()
  await expect(card(page, first.id, tomorrow)).toBeVisible()
  await expect(card(page, first.id, t)).toHaveCount(0)
  const all = await occurrences(api, first.series_id!, t, addDays(t, 7))
  expect(all.map((o) => [o.due_on, o.series_date, o.series_exception])).toEqual([
    [tomorrow, t, true],
    [addDays(t, 7), addDays(t, 7), false],
  ])
})

test('S60, S69, S61: "Just this one" and "This and all following"; ones changed on their own keep their values', async ({ page }) => {
  const api = await apiAs('brewer1')
  const t = today()
  const title = tempTag('S60 Keg Wash')
  const first = await createSeries(api, weekly(title, t))
  const w = async (n: number) => (await on(api, first.series_id!, addDays(t, 7 * n)))!
  const [w1, w2, w4] = [await w(1), await w(2), await w(4)]
  // A later one changed on its own beforehand.
  const own = await api.patch(`/api/brewery/tasks/${w4.id}`, { data: { notes: 'own', scope: 'this' } })
  expect(own.status()).toBe(200)

  await openBoard(page, { from: t, to: addDays(t, 30) })
  // S69 + S60: an edit asks; Just this one.
  await openMenu(page, w1.id, w1.due_on!)
  await page.getByTestId('task-menu-edit').click()
  await expect(page.getByTestId('task-repeat-summary')).toHaveText(`Repeats every week on ${WEEKDAY_SHORT[isoWeekday(t) - 1]}`)
  await expect(page.getByTestId('task-repeat-select')).not.toHaveText('Never')
  await page.getByTestId('task-title-input').fill(`${title} + sanitize`)
  await saveDialog(page).click()
  await expect(page.getByTestId('series-scope-dialog')).toBeVisible()
  const thisOne = boardWrite(page, new RegExp(`^/api/brewery/tasks/${w1.id}$`), 'PATCH')
  await page.getByTestId('series-scope-this').click()
  expect((await thisOne).request().postDataJSON()).toEqual({ title: `${title} + sanitize`, scope: 'this' })

  // S61: from w2 on, assigned to brewer2.
  await page.reload()
  await openMenu(page, w2.id, w2.due_on!)
  await page.getByTestId('task-menu-edit').click()
  const brewer2 = await userId(await apiAs('brewer2'))
  await pick(page, 'task-assignee-select', `task-assignee-option-${brewer2}`)
  await saveDialog(page).click()
  const following = boardWrite(page, new RegExp(`^/api/brewery/tasks/${w2.id}$`), 'PATCH')
  await page.getByTestId('series-scope-following').click()
  expect((await following).request().postDataJSON()).toEqual({ assignee_id: brewer2, scope: 'following' })
  await page.reload()

  const after = await occurrences(api, first.series_id!, t, addDays(t, 42))
  const byWeek = new Map(after.map((o) => [Math.round((Date.parse(o.series_date!) - Date.parse(t)) / (7 * 86_400_000)), o]))
  expect(byWeek.get(0)!.assignee_id).toBeNull()
  expect(byWeek.get(1)!.title).toBe(`${title} + sanitize`)
  expect(byWeek.get(1)!.series_exception).toBe(true)
  expect(byWeek.get(1)!.assignee_id).toBeNull()
  expect(byWeek.get(2)!.assignee_id).toBe(brewer2)
  expect(byWeek.get(2)!.title).toBe(title)
  expect(byWeek.get(3)!.assignee_id).toBe(brewer2)
  expect(byWeek.get(4)!.assignee_id).toBeNull() // changed on its own
  expect(byWeek.get(5)!.assignee_id).toBe(brewer2)
  await expect(page.getByTestId(`task-assignee-${w2.id}:${w2.due_on}`)).toBeVisible()
})

test('S62: Edit series… from weekly to the 1st weekday of the month, after the confirm', async ({ page }) => {
  const api = await apiAs('brewer1')
  const t = today()
  const first = await createSeries(api, weekly(tempTag('S62 Keg Wash'), t))
  const w1 = (await on(api, first.series_id!, addDays(t, 7)))!
  const { later_open } = await seriesInfo(api, w1.id)
  await api.post(`/api/brewery/tasks/${first.id}/complete`, { data: {} })

  await openBoard(page, { from: t, to: addDays(t, 13) })
  await openMenu(page, w1.id, w1.due_on!)
  await page.getByTestId('task-menu-edit-series').click()
  await expect(page.getByTestId('task-dialog')).toContainText('Edit series')
  await pick(page, 'task-repeat-select', 'task-repeat-option-monthly')
  await pick(page, 'task-repeat-month-rule', 'task-repeat-month-rule-weekday')
  await pick(page, 'task-repeat-week', 'task-repeat-week-1')
  await expect(page.getByTestId('task-repeat-summary')).toContainText('Repeats every month on the 1st ')
  await saveDialog(page).click()
  await expect(page.getByTestId('remove-later-message')).toHaveText(`Removes ${later_open} later occurrences.`)
  await expect(page.getByTestId('remove-later-keep')).toHaveCount(0)
  const saved = boardWrite(page, new RegExp(`^/api/brewery/tasks/${w1.id}$`), 'PATCH')
  await page.getByTestId('remove-later-confirm').click()
  const body = (await saved).request().postDataJSON()
  expect(body).toMatchObject({ scope: 'following', repeat: 'monthly', repeat_month_rule: 'weekday', repeat_week_of_month: 1 })
  const result = (await (await saved).json()).data as ApiOccurrence
  if (result.series_id !== first.series_id) created.push(result.id)
  await page.reload()

  // The finished first one stays in the old series; the rest are first weekdays of a month.
  const old = await occurrences(api, first.series_id!, t, addDays(t, 120))
  expect(old.map((o) => o.due_on)).toEqual([t])
  expect(old[0].done).toBe(true)
  const fresh = await occurrences(api, result.series_id!, t, addDays(t, 120))
  expect(fresh.length).toBeGreaterThanOrEqual(3)
  for (const o of fresh) {
    expect(Number(o.due_on!.slice(8, 10))).toBeLessThanOrEqual(7)
    expect(isoWeekday(o.due_on!)).toBe(isoWeekday(t))
  }
})

test('S63: Stop repeating, with one changed on its own: keep it', async ({ page }) => {
  const api = await apiAs('brewer1')
  const t = today()
  const first = await createSeries(api, weekly(tempTag('S63 Keg Wash'), t))
  const w1 = (await on(api, first.series_id!, addDays(t, 7)))!
  const w3 = (await on(api, first.series_id!, addDays(t, 21)))!
  await moveTask(api, w3.id, addDays(w3.due_on!, 1))
  const { later_open, later_changed } = await seriesInfo(api, w1.id)
  expect(later_changed).toBe(1)

  await openBoard(page)
  await openMenu(page, w1.id, w1.due_on!)
  await page.getByTestId('task-menu-stop-repeating').click()
  await expect(page.getByTestId('remove-later-message')).toHaveText(
    `Removes ${later_open} later occurrences. 1 was changed on its own.`,
  )
  await expect(page.getByTestId('remove-later-keep')).toHaveText(`Remove ${later_open}, keep the 1 changed on its own`)
  await expect(page.getByTestId('remove-later-confirm')).toHaveText(`Remove all ${later_open + 1}`)
  const stopped = boardWrite(page, new RegExp(`/${w1.id}/stop_repeating$`))
  await page.getByTestId('remove-later-keep').click()
  expect((await stopped).request().postDataJSON()).toEqual({ changed: 'keep' })
  await expect(page.getByTestId('board-toast')).toContainText('no longer repeats')

  await page.reload()
  const left = await occurrences(api, first.series_id!, t, addDays(t, 120))
  expect(left.map((o) => o.id)).toEqual([first.id, w1.id, w3.id])
  expect((await seriesInfo(api, w1.id)).later_open).toBe(0)

  // G2: the kept one is now the last; its menu has Edit series… but no Stop repeating.
  await openBoard(page, { from: t, to: addDays(t, 27) })
  await openMenu(page, w3.id, addDays(w3.due_on!, 1))
  await expect(page.getByTestId('task-menu-edit-series')).toBeVisible()
  await expect(page.getByTestId('task-menu-stop-repeating')).toHaveCount(0)
})

test('G1: Edit series… from before a split reaches the occurrences after it', async ({ page }) => {
  const api = await apiAs('brewer1')
  const t = today()
  const first = await createSeries(api, weekly(tempTag('G1 Keg Wash'), t))
  const w = async (n: number) => (await on(api, first.series_id!, addDays(t, 7 * n)))!
  const [w1, w3, w7] = [await w(1), await w(3), await w(7)]
  // QA's setup, through the API: assign w3 on "following", then split w7 to monthly.
  const brewer2 = await userId(await apiAs('brewer2'))
  const assigned = await api.patch(`/api/brewery/tasks/${w3.id}`, { data: { assignee_id: brewer2, scope: 'following' } })
  expect(assigned.status(), await assigned.text()).toBe(200)
  const split = await api.patch(`/api/brewery/tasks/${w7.id}`, {
    data: { scope: 'following', repeat: 'monthly', repeat_interval: 1, repeat_month_rule: 'weekday', repeat_week_of_month: 1, repeat_weekday: isoWeekday(t) },
  })
  expect(split.status(), await split.text()).toBe(200)
  const after = (await split.json()).data as ApiOccurrence
  created.push(after.id)
  expect(after.series_id).not.toBe(first.series_id)

  const me = await userId(api)
  await openBoard(page)
  await openMenu(page, w1.id, w1.due_on!)
  await page.getByTestId('task-menu-edit-series').click()
  await pick(page, 'task-assignee-select', `task-assignee-option-${me}`)
  const saved = boardWrite(page, new RegExp(`^/api/brewery/tasks/${w1.id}$`), 'PATCH')
  await saveDialog(page).click()
  expect((await saved).request().postDataJSON()).toEqual({ assignee_id: me, scope: 'following' })
  await expect(page.getByTestId('task-dialog')).toHaveCount(0)

  // Every open one from w1 on, past the split too, is brewer1's.
  const later = [
    ...(await occurrences(api, first.series_id!, w1.due_on!, addDays(t, 60))),
    ...(await occurrences(api, after.series_id!, addDays(t, 40), addDays(t, 130))),
  ]
  expect(later.filter((o) => o.series_id === after.series_id).length).toBeGreaterThanOrEqual(2)
  for (const o of later) expect([o.due_on, o.assignee_id]).toEqual([o.due_on, me])
})

test('R1: a rule change from before a split, Ends left alone, keeps repeating past the split', async ({ page }) => {
  const api = await apiAs('brewer1')
  const t = today()
  const first = await createSeries(api, weekly(tempTag('R1 Keg Wash'), t))
  const w3 = (await on(api, first.series_id!, addDays(t, 21)))!
  const w7 = (await on(api, first.series_id!, addDays(t, 49)))!
  // QA's setup, through the API: w7 on "following" to monthly, the 1st weekday.
  const split = await api.patch(`/api/brewery/tasks/${w7.id}`, {
    data: { scope: 'following', repeat: 'monthly', repeat_interval: 1, repeat_month_rule: 'weekday', repeat_week_of_month: 1, repeat_weekday: isoWeekday(t) },
  })
  expect(split.status(), await split.text()).toBe(200)
  created.push(((await split.json()).data as ApiOccurrence).id)

  await openBoard(page, { from: addDays(t, 21), to: addDays(t, 27) })
  await openMenu(page, w3.id, w3.due_on!)
  await page.getByTestId('task-menu-edit-series').click()
  // The split's end (the day before w7) isn't the person's: Ends is Never.
  await expect(page.getByTestId('task-repeat-summary')).not.toContainText('until')
  await pick(page, 'task-repeat-interval', 'task-repeat-interval-2')
  await expect(page.getByTestId('task-repeat-summary')).toHaveText(`Repeats every other week on ${WEEKDAY_SHORT[isoWeekday(t) - 1]}`)
  await saveDialog(page).click()
  const saved = boardWrite(page, new RegExp(`^/api/brewery/tasks/${w3.id}$`), 'PATCH')
  await page.getByTestId('remove-later-confirm').click()
  expect((await saved).request().postDataJSON()).toMatchObject({ repeat_interval: 2, repeat_until: '', repeat_count: '' })
  const result = (await (await saved).json()).data as ApiOccurrence
  created.push(result.id)

  // Six months out, every other week from w3, in the new series.
  const later = await occurrences(api, result.series_id!, addDays(t, 175), addDays(t, 205))
  expect(later.length).toBeGreaterThanOrEqual(2)
  for (const o of later) {
    const days = (Date.parse(o.due_on!) - Date.parse(w3.due_on!)) / 86_400_000
    expect(days % 14).toBe(0)
  }
})

test('S64 and delete "This and all following"', async ({ page }) => {
  const api = await apiAs('brewer1')
  const t = today()
  const first = await createSeries(api, weekly(tempTag('S64 Keg Wash'), t))
  const w1 = (await on(api, first.series_id!, addDays(t, 7)))!
  const w2 = (await on(api, first.series_id!, addDays(t, 14)))!

  // S64: just this one.
  await openBoard(page)
  await openMenu(page, w1.id, w1.due_on!)
  await page.getByTestId('task-menu-delete').click()
  const one = boardWrite(page, new RegExp(`^/api/brewery/tasks/${w1.id}$`), 'DELETE')
  await page.getByTestId('series-scope-this').click()
  expect(new URL((await one).url()).searchParams.get('scope')).toBe('this')
  await page.reload()
  await expect(card(page, w1.id, w1.due_on!)).toHaveCount(0)
  await expect(card(page, first.id, t)).toBeVisible()

  // This and all following, from w2.
  const { later_open } = await seriesInfo(api, w2.id)
  await openBoard(page, { from: t, to: addDays(t, 30) })
  await openMenu(page, w2.id, w2.due_on!)
  await page.getByTestId('task-menu-delete').click()
  await page.getByTestId('series-scope-following').click()
  await expect(page.getByTestId('remove-later-message')).toHaveText(`Removes ${later_open} later occurrences.`)
  const rest = boardWrite(page, new RegExp(`^/api/brewery/tasks/${w2.id}$`), 'DELETE')
  await page.getByTestId('remove-later-confirm').click()
  expect(new URL((await rest).url()).searchParams.get('scope')).toBe('following')
  await page.reload()
  expect((await occurrences(api, first.series_id!, t, addDays(t, 120))).map((o) => o.id)).toEqual([first.id])
})

test.describe('S65: Move all to today', () => {
  // Every open past task moves, the seed's too; they go back afterwards.
  let restore: ApiCard[] = []
  test.afterEach(async () => {
    const api = await apiAs('breweryMgr')
    for (const c of restore.filter((c) => !c.title.startsWith('[TEST-TEMP]'))) await moveTask(api, c.id, c.due_on)
    restore = []
  })

  test('three missed occurrences show on Unfinished and all move to today', async ({ page }) => {
    const api = await apiAs('brewer1')
    const t = today()
    const start = addDays(t, -21)
    const first = await createSeries(api, weekly(tempTag('S65 Keg Wash'), start))
    restore = (await getBoard(api, t, t)).unfinished

    await openBoard(page)
    const missed = (await getBoard(api, t, t)).unfinished.filter((c) => (c as ApiOccurrence).series_id === first.series_id)
    expect(missed.map((c) => c.due_on)).toEqual([start, addDays(t, -14), addDays(t, -7)])
    for (const c of missed) await expect(card(page, c.id, 'unfinished')).toBeVisible()

    await page.getByTestId('unfinished-move-all').click()
    const moved = boardWrite(page, /\/move_overdue_to_today$/)
    await page.getByRole('dialog').getByRole('button', { name: 'Move' }).click()
    await moved
    await page.reload()
    for (const c of missed) await expect(card(page, c.id, t)).toBeVisible()
    const onToday = (await occurrences(api, first.series_id!, t, t)).filter((o) => missed.some((m) => m.id === o.id))
    expect(onToday.map((o) => [o.series_date, o.series_exception])).toEqual([
      [start, true],
      [addDays(t, -14), true],
      [addDays(t, -7), true],
    ])
  })
})

test.describe('as breweryMgr', () => {
  test.use({ storageState: authFile('breweryMgr') })

  test('History reads the series actions', async ({ page }) => {
    const api = await apiAs('breweryMgr')
    const t = today()
    const title = tempTag('History Keg Wash')
    const first = await createSeries(api, weekly(title, t))
    const w1 = (await on(api, first.series_id!, addDays(t, 7)))!
    const { later_open } = await seriesInfo(api, w1.id)
    const res = await api.post(`/api/brewery/tasks/${w1.id}/stop_repeating`, { data: { changed: 'remove' } })
    expect(res.status()).toBe(200)

    await openBoard(page)
    await page.getByTestId('board-menu').click()
    await page.getByTestId('board-menu-history').click()
    const list = page.getByTestId('history-list')
    await expect(list).toContainText(
      `Created recurring task ${title} on ${new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'numeric', day: 'numeric' }).format(new Date(`${t}T12:00:00Z`)).replace(',', '')} (Repeats every week on ${WEEKDAY_SHORT[isoWeekday(t) - 1]})`,
    )
    await expect(list).toContainText(`Stopped repeating ${title} after`)
    await expect(list).toContainText(`(removed ${later_open})`)
  })

  test('S78: editing a one-off can make it repeat; a Future one needs a day; a finished one has no Repeat; one History entry', async ({ page }) => {
    const api = await apiAs('breweryMgr')
    const t = today()
    const title = tempTag('S78 Hose check')
    const oneOff = await createTask(api, { title, due_on: t })
    created.push(oneOff.id)
    const future = await createTask(api, { title: tempTag('S78 Future'), due_on: null })
    created.push(future.id)
    const done = await createTask(api, { title: tempTag('S78 Done'), due_on: t })
    created.push(done.id)
    await completeTask(api, done.id)

    await openBoard(page)
    // A Future one-off: Repeat is there but needs a day.
    await openMenu(page, future.id, 'future')
    await page.getByTestId('task-menu-edit').click()
    await expect(page.getByTestId('task-repeat-hint')).toHaveText('Pick a day to repeat')
    await expect(page.getByTestId('task-repeat-select')).toHaveAttribute('aria-disabled', 'true')
    await page.getByTestId('task-dialog').getByRole('button', { name: 'Cancel' }).click()
    // A finished one: no Repeat.
    await openMenu(page, done.id, t)
    await page.getByTestId('task-menu-edit').click()
    await expect(page.getByTestId('task-title-input')).toBeVisible()
    await expect(page.getByTestId('task-repeat-select')).toHaveCount(0)
    await page.getByTestId('task-dialog').getByRole('button', { name: 'Cancel' }).click()

    // The open one-off on today: Never → every week.
    await openMenu(page, oneOff.id, t)
    await page.getByTestId('task-menu-edit').click()
    await expect(page.getByTestId('task-repeat-select')).toHaveText('Never')
    await pick(page, 'task-repeat-select', 'task-repeat-option-weekly')
    await expect(page.getByTestId('task-repeat-summary')).toHaveText(`Repeats every week on ${WEEKDAY_SHORT[isoWeekday(t) - 1]}`)
    const saved = boardWrite(page, new RegExp(`^/api/brewery/tasks/${oneOff.id}$`), 'PATCH')
    await saveDialog(page).click()
    const res = await saved
    expect(res.request().postDataJSON()).toMatchObject({ repeat: 'weekly', repeat_weekdays: [isoWeekday(t)] })
    const first = (await res.json()).data as ApiOccurrence
    expect([first.id, first.series_date, first.due_on]).toEqual([oneOff.id, t, t])
    await expect(page.getByTestId('task-dialog')).toHaveCount(0)

    await page.reload()
    await expect(page.getByTestId(`task-repeat-icon-${oneOff.id}:${t}`)).toBeVisible()
    const nextWeek = await on(api, first.series_id!, addDays(t, 7))
    expect(nextWeek?.title).toBe(title)
    expect((await seriesInfo(api, oneOff.id)).later_open).toBeGreaterThanOrEqual(51)

    // History: one entry for it, none for the occurrences.
    await page.getByTestId('board-menu').click()
    await page.getByTestId('board-menu-history').click()
    const list = page.getByTestId('history-list')
    await expect(list.getByText(`Made ${title} repeat from`)).toHaveCount(1)
    await expect(list.getByText(title)).toHaveCount(2) // Added …, Made … repeat
  })
})
