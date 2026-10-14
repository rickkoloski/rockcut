import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addDays, apiAs, card, dailyItems, denverToday, restoreDailyItems, setCheck, tempTag, type ApiDailyItem } from '../brewery/taskBoardHelpers'
import { contextWith, createTempPerson, retireTempPerson, signIn, throwawayPassword, type TempPerson } from '../auth/helpers'

// D42 §4, scenarios S121–S140: the required password reset (API and UI), a
// foreign before_id, the "No one scheduled" header key, deleting a retired
// Daily item, the 12-item cap, the Ends-only confirm wording, settings per
// board, and the board's first day. S129–S132's series rules are ExUnit
// (series_edits_test, series_ends_test); the wording is covered here.
// The boards are shared, so this runs in the one-worker `brewery-board` project.

test.use({ viewport: { width: 1600, height: 1100 } })

const today = () => denverToday()
/** The Monday / Sunday of the week holding `day`. */
const mondayOf = (day: string) => addDays(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7))
const sundayOf = (day: string) => addDays(day, -new Date(`${day}T12:00:00Z`).getUTCDay())

interface Made {
  dept: string
  id: number
}
const tasks: Made[] = []
let person: TempPerson | null = null

test.afterEach(async () => {
  const owner = await apiAs('owner')
  for (const { dept, id } of tasks.splice(0)) {
    const res = await owner.delete(`/api/boards/${dept}/tasks/${id}`, { params: { scope: 'following', changed: 'remove' } })
    expect([204, 404, 410]).toContain(res.status())
  }
  for (const dept of ['bar', 'brewery']) await cleanupDailyItems(owner, dept)
  await retireTempPerson(person)
  person = null
})

async function createTask(api: APIRequestContext, dept: string, attrs: Record<string, unknown>) {
  const res = await api.post(`/api/boards/${dept}/tasks`, { data: attrs })
  expect(res.status(), await res.text()).toBe(201)
  const task = (await res.json()).data as { id: number; title: string; due_on: string | null; position: number; series_id: number | null }
  tasks.push({ dept, id: task.id })
  return task
}

async function allItems(api: APIRequestContext, dept: string): Promise<(ApiDailyItem & { deletable?: boolean })[]> {
  const res = await api.get(`/api/boards/${dept}/daily_items`, { params: { include_retired: 'true' } })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()).data
}

/** `[TEST-TEMP]` Daily items: active ones retired, then the never-ticked retired ones deleted (D42). */
async function cleanupDailyItems(api: APIRequestContext, dept: string) {
  for (const item of await allItems(api, dept)) {
    if (item.active && item.name.startsWith('[TEST-TEMP]'))
      expect((await api.patch(`/api/boards/${dept}/daily_items/${item.id}`, { data: { active: false } })).status()).toBe(200)
  }
  for (const item of await allItems(api, dept)) {
    if (!item.active && item.deletable && item.name.startsWith('[TEST-TEMP]'))
      expect((await api.delete(`/api/boards/${dept}/daily_items/${item.id}`)).status()).toBe(204)
  }
}

async function addItem(api: APIRequestContext, dept: string, name: string): Promise<ApiDailyItem> {
  const res = await api.post(`/api/boards/${dept}/daily_items`, { data: { name } })
  expect(res.status(), await res.text()).toBe(201)
  return (await res.json()).data
}

async function retireItem(api: APIRequestContext, dept: string, id: number) {
  const res = await api.patch(`/api/boards/${dept}/daily_items/${id}`, { data: { active: false } })
  expect(res.status(), await res.text()).toBe(200)
}

async function dailyTotal(api: APIRequestContext, dept: string, day: string): Promise<number> {
  const res = await api.get(`/api/boards/${dept}/tasks`, { params: { from: day, to: day } })
  return (await res.json()).data.days[0].daily.total
}

/** Open a board and wait for its days (and, on a department's board, its Daily items, which the ⋮ menu waits for). */
async function openBoard(page: Page, path: string) {
  const items = path.startsWith('/tasks/all') ? null : page.waitForResponse((r) => r.url().includes('/daily_items'))
  await page.goto(path)
  await expect(page.getByTestId('board-grid')).toBeVisible({ timeout: 20_000 })
  await items
}

async function openDailyItems(page: Page) {
  await page.getByTestId('board-menu').click()
  await page.getByTestId('board-menu-daily-items').click()
  await expect(page.getByTestId('daily-items-dialog')).toBeVisible()
}

/** The day columns showing, in order. */
async function shownDays(page: Page): Promise<string[]> {
  return page
    .getByTestId('board-grid')
    .locator('[data-testid^="day-"][data-today]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.slice('day-'.length)))
}

const range = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i))

// ── 1. Required password reset (§2.1) ────────────────────────────────

test('S121: newhire (reset required): the board and the beer board refused, /api/me open', async () => {
  const api = await apiAs('newhire')
  const board = await api.get('/api/boards/bar/tasks', { params: { from: today(), to: today() } })
  expect(board.status()).toBe(403)
  expect(await board.json()).toEqual({ error: 'password_reset_required' })
  const beer = await api.post('/api/beer_board', { data: { recipient_name: '[TEST-TEMP] x', beers: 1 } })
  expect(beer.status()).toBe(403)
  expect((await api.get('/api/me')).status()).toBe(200)
})

test('S123: a person with a temporary password sees "Set a new password"; after it, the board works', async ({ browser }) => {
  person = await createTempPerson('S123', { ready: false })
  const token = await signIn(person)
  const { context, page } = await contextWith(browser, token)
  try {
    await page.goto('/tasks/bar')
    await expect(page.getByText('Set a new password')).toBeVisible({ timeout: 20_000 })
    const password = throwawayPassword()
    await page.getByTestId('current-password').locator('input').fill(person.password)
    await page.getByTestId('new-password').locator('input').fill(password)
    await page.getByTestId('confirm-password').locator('input').fill(password)
    await page.getByTestId('change-password-submit').click()
    await expect(page.getByText('Set a new password')).toHaveCount(0)
    await page.goto('/tasks/bar')
    await expect(page.getByTestId('board-grid')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId(`day-${today()}`)).toBeVisible()
  } finally {
    await context.close()
  }
})

// ── 2, 3. Foreign before_id, header key ──────────────────────────────

test('S124: floater moves a Brewery task before a Taproom task: 404, nothing changes', async () => {
  const api = await apiAs('floater')
  const brewery = await createTask(api, 'brewery', { title: tempTag('S124 brewery'), due_on: today() })
  const taproom = await createTask(api, 'bar', { title: tempTag('S124 taproom'), due_on: today() })
  const res = await api.post(`/api/boards/brewery/tasks/${brewery.id}/move`, { data: { due_on: addDays(today(), 1), before_id: taproom.id } })
  expect(res.status()).toBe(404)
  for (const [dept, t] of [['brewery', brewery], ['bar', taproom]] as const) {
    const board = (await (await api.get(`/api/boards/${dept}/tasks`, { params: { from: today(), to: today() } })).json()).data
    const found = board.days[0].cards.find((c: { id: number }) => c.id === t.id)
    expect(found, `${dept} task still on today`).toMatchObject({ due_on: today(), position: t.position })
  }
})

test.describe('as bartender1', () => {
  test.use({ storageState: authFile('bartender1') })

  test('S125: a Taproom day with no one scheduled says "No one scheduled" (no_one_scheduled)', async ({ page }) => {
    const day = addDays(today(), 28)
    const api = await apiAs('bartender1')
    const header = (await (await api.get('/api/boards/bar/tasks', { params: { from: day, to: day } })).json()).data.days[0].header
    expect(header).toMatchObject({ people: [], open_shifts: [], no_one_scheduled: true })
    expect(header).not.toHaveProperty('no_brewers')
    await openBoard(page, `/tasks/bar?from=${day}&to=${day}`)
    await expect(page.getByTestId(`header-none-${day}`)).toHaveText('No one scheduled')
  })
})

// ── 4, 7. Daily items: delete, the cap (§2.4, §2.7) ──────────────────

test.describe('as barMgr', () => {
  test.use({ storageState: authFile('barMgr') })

  test('S126: add, retire, Delete a never-ticked item; History says so; no day’s count changes', async ({ page }) => {
    const api = await apiAs('barMgr')
    const name = tempTag('Typo').slice(0, 40)
    const before = await dailyTotal(api, 'bar', today())

    await openBoard(page, '/tasks/bar')
    await openDailyItems(page)
    await page.getByTestId('daily-items-new').fill(name)
    await page.getByTestId('daily-items-add').click()
    const row = page.getByTestId('daily-items-list').getByText(name)
    await expect(row).toBeVisible()
    const item = (await allItems(api, 'bar')).find((i) => i.name === name)!
    await page.getByTestId(`daily-items-retire-${item.id}`).click()
    await page.getByRole('button', { name: 'Retire', exact: true }).click()
    await page.getByTestId('daily-items-retired-toggle').click()
    await page.getByTestId(`daily-items-delete-${item.id}`).click()
    await expect(page.getByRole('dialog', { name: 'Delete item' })).toContainText(
      `Delete ${name}? It was never ticked, so no day's Daily checks change.`,
    )
    const deleted = page.waitForResponse((r) => r.request().method() === 'DELETE' && r.url().endsWith(`/daily_items/${item.id}`))
    await page.getByRole('dialog', { name: 'Delete item' }).getByRole('button', { name: 'Delete' }).click()
    expect((await deleted).status()).toBe(204)
    await expect(page.getByTestId(`daily-items-retired-row-${item.id}`)).toHaveCount(0)

    // Persisted, and nothing else moved.
    await page.reload()
    expect((await allItems(api, 'bar')).some((i) => i.id === item.id)).toBe(false)
    expect(await dailyTotal(api, 'bar', today())).toBe(before)

    await expect(page.getByTestId('board-grid')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('board-menu').click()
    await page.getByTestId('board-menu-history').click()
    await expect(page.getByTestId('history-list').getByText(`Deleted the Daily item '${name}'`)).toBeVisible()
  })
})

test.describe('as breweryMgr', () => {
  test.use({ storageState: authFile('breweryMgr') })
  let defaults: ApiDailyItem[] = []
  let untick: string | null = null

  test.beforeEach(async () => {
    defaults = await dailyItems(await apiAs('breweryMgr'))
    expect(defaults.length).toBe(4)
  })
  test.afterEach(async () => {
    await restoreDailyItems(defaults)
    if (untick) await setCheck(await apiAs('breweryMgr'), today(), Number(untick), false)
    untick = null
  })

  test('S127: a retired item ticked once has Restore but no Delete; the API says has_ticks', async ({ page }) => {
    const api = await apiAs('breweryMgr')
    const temps = defaults.find((d) => d.name === 'Temps')!
    const card = (await (await api.get('/api/boards/brewery/tasks', { params: { from: today(), to: today() } })).json()).data.days[0].daily
    if (!card.items.find((i: { daily_item_id: number; checked: boolean }) => i.daily_item_id === temps.id).checked) {
      await setCheck(api, today(), temps.id, true)
      untick = String(temps.id)
    }
    await retireItem(api, 'brewery', temps.id)
    expect((await allItems(api, 'brewery')).find((i) => i.id === temps.id)).toMatchObject({ active: false, deletable: false })

    await openBoard(page, '/tasks/brewery')
    await openDailyItems(page)
    await page.getByTestId('daily-items-retired-toggle').click()
    await expect(page.getByTestId(`daily-items-restore-${temps.id}`)).toBeVisible()
    await expect(page.getByTestId(`daily-items-delete-${temps.id}`)).toHaveCount(0)

    const res = await api.delete(`/api/boards/brewery/daily_items/${temps.id}`)
    expect(res.status()).toBe(422)
    expect((await res.json()).error).toBe('has_ticks')
  })

  test('S128: DELETE on an active item is not_retired; on a Taproom item, 403', async () => {
    const api = await apiAs('breweryMgr')
    const temps = defaults.find((d) => d.name === 'Temps')!
    const active = await api.delete(`/api/boards/brewery/daily_items/${temps.id}`)
    expect(active.status()).toBe(422)
    expect((await active.json()).error).toBe('not_retired')

    const taproom = await addItem(await apiAs('barMgr'), 'bar', tempTag('S128').slice(0, 40))
    await retireItem(await apiAs('barMgr'), 'bar', taproom.id)
    expect((await api.delete(`/api/boards/bar/daily_items/${taproom.id}`)).status()).toBe(403)
  })

  test('S133: at 12 active items, Add and Restore are greyed out with the hint', async ({ page }) => {
    const api = await apiAs('breweryMgr')
    const made: ApiDailyItem[] = []
    for (let n = 1; n <= 8; n++) made.push(await addItem(api, 'brewery', tempTag(`S133 ${n}`).slice(0, 40)))
    await retireItem(api, 'brewery', made[7].id)
    await addItem(api, 'brewery', tempTag('S133 9').slice(0, 40))

    await openBoard(page, '/tasks/brewery')
    await openDailyItems(page)
    await expect(page.getByTestId('daily-items-new')).toBeDisabled()
    await expect(page.getByTestId('daily-items-add')).toBeDisabled()
    await expect(page.getByTestId('daily-items-dialog')).toContainText('Up to 12 Daily items. Retire one first.')
    await page.getByTestId('daily-items-retired-toggle').click()
    await expect(page.getByTestId(`daily-items-restore-${made[7].id}`)).toBeDisabled()
    await expect(page.getByTestId('daily-items-retired-full')).toHaveText('Up to 12 Daily items. Retire one first.')

    // One retired: Add and Restore come back.
    await page.getByTestId(`daily-items-retire-${made[0].id}`).click()
    await page.getByRole('button', { name: 'Retire', exact: true }).click()
    await expect(page.getByTestId(`daily-items-restore-${made[7].id}`)).toBeEnabled()
    await expect(page.getByTestId('daily-items-new')).toBeEnabled()
  })

  test('S131/S132 wording: Ends → After 5 times says "Removes 11 later occurrences."; Ends → Never says "Extends the series."', async ({ page }) => {
    const api = await apiAs('breweryMgr')
    const t = today()
    const weekday = new Date(`${t}T12:00:00Z`).getUTCDay() || 7
    const first = await createTask(api, 'brewery', {
      title: tempTag('S132 Keg Wash'),
      due_on: t,
      repeat: 'weekly',
      repeat_weekdays: [weekday],
      repeat_until: addDays(t, 7 * 15),
    })
    const count = async () => {
      const ids = new Set<number>()
      for (const from of [t, addDays(t, 31), addDays(t, 62), addDays(t, 93)]) {
        const board = (await (await api.get('/api/boards/brewery/tasks', { params: { from, to: addDays(from, 30) } })).json()).data
        for (const d of board.days) for (const c of d.cards) if (c.series_id === first.series_id) ids.add(c.id)
      }
      return ids.size
    }
    expect(await count()).toBe(16)

    const editSeries = async () => {
      await openBoard(page, `/tasks/brewery?from=${t}&to=${addDays(t, 6)}`)
      await card(page, first.id, t).getByTestId(`task-title-${first.id}:${t}`).click()
      await page.getByTestId('task-menu-edit-series').click()
      await expect(page.getByTestId('task-repeat-ends')).toBeVisible()
    }

    await editSeries()
    await page.getByTestId('task-repeat-ends').click()
    await page.getByTestId('task-repeat-ends-count').click()
    await page.getByTestId('task-repeat-count').fill('5')
    await page.getByTestId('task-dialog').getByRole('button', { name: 'Save' }).click()
    await expect(page.getByTestId('remove-later-dialog')).toContainText('Change when it ends')
    await expect(page.getByTestId('remove-later-message')).toHaveText('Removes 11 later occurrences.')
    const saved = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().endsWith(`/tasks/${first.id}`))
    await page.getByTestId('remove-later-confirm').click()
    expect((await saved).status()).toBe(200)
    expect(await count()).toBe(5)

    await editSeries()
    await page.getByTestId('task-repeat-ends').click()
    await page.getByTestId('task-repeat-ends-never').click()
    await page.getByTestId('task-dialog').getByRole('button', { name: 'Save' }).click()
    await expect(page.getByTestId('extend-series-message')).toHaveText('Extends the series.')
    const extended = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().endsWith(`/tasks/${first.id}`))
    await page.getByTestId('extend-series-confirm').click()
    expect((await extended).status()).toBe(200)
    // Not split: the same series, through the horizon (the four 31-day windows hold 18 weeks).
    expect(await count()).toBeGreaterThan(16)
  })
})

// ── 8. Settings per board (§2.8) ─────────────────────────────────────

test.describe('as floater', () => {
  test.use({ storageState: authFile('floater') })

  test('S134: Brewery 2 weeks + Hide completed; Taproom keeps its own; back on Brewery they hold', async ({ page }) => {
    await openBoard(page, '/tasks/bar')
    await page.getByTestId('board-span-7').click()
    await openBoard(page, '/tasks/brewery')
    await expect(page.getByTestId('board-span-14')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('board-hide-completed')).not.toBeChecked()
    await page.getByTestId('board-span-14').click()
    await page.getByTestId('board-hide-completed').check()

    await openBoard(page, '/tasks/bar')
    await expect(page.getByTestId('board-span-7')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('board-hide-completed')).not.toBeChecked()
    await expect.poll(async () => (await shownDays(page)).length).toBe(7)

    await openBoard(page, '/tasks/brewery')
    await expect(page.getByTestId('board-span-14')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('board-hide-completed')).toBeChecked()
    await expect.poll(async () => (await shownDays(page)).length).toBe(14)
  })
})

// ── 8, 9. D41 settings carried over; the first day (§2.9) ────────────

test.describe('as brewer1', () => {
  test.use({ storageState: authFile('brewer1') })

  test('S135: the browser’s D41 settings carry over to the board after D42', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.setItem('rockcut.tasks.span', '7')
      localStorage.setItem('rockcut.tasks.hideCompleted', 'true')
      localStorage.setItem('rockcut.tasks.phoneView', 'day')
    })
    await openBoard(page, '/tasks/brewery')
    await expect(page.getByTestId('board-span-7')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('board-hide-completed')).toBeChecked()
    expect(await page.evaluate(() => localStorage.getItem('rockcut.tasks.phoneView.brewery'))).toBe('day')
  })

  test('S136: First day → Monday: Mon–Sun of this week, the days before today dimmed and usable; Next → next Monday', async ({ page }) => {
    const mon = mondayOf(today())
    await openBoard(page, '/tasks/brewery')
    await page.getByTestId('board-span-7').click()
    await page.getByTestId('board-first-day').selectOption('monday')
    await expect(page.getByTestId(`day-${mon}`)).toBeVisible()
    await expect.poll(() => shownDays(page)).toEqual(range(mon, 7))
    for (const d of range(mon, 7)) await expect(page.getByTestId(`day-${d}`)).toHaveAttribute('data-past', String(d < today()))
    if (mon < today()) {
      // A past day still takes a new task.
      await page.getByTestId(`day-add-${mon}`).click()
      await expect(page.getByTestId('task-dialog')).toBeVisible()
      await expect(page.getByTestId('task-day-input')).toHaveValue(mon)
      await page.keyboard.press('Escape')
    }
    // Remembered after a reload.
    await page.reload()
    await expect(page.getByTestId('board-first-day')).toHaveValue('monday')
    await expect.poll(() => shownDays(page)).toEqual(range(mon, 7))

    await page.getByTestId('board-next').click()
    await expect(page.getByTestId(`day-${addDays(mon, 7)}`)).toBeVisible()
    await expect.poll(() => shownDays(page)).toEqual(range(addDays(mon, 7), 7))
  })

  test('S137: First day → Sunday, 2 weeks: this Sunday through next Saturday; Today returns there', async ({ page }) => {
    const sun = sundayOf(today())
    await openBoard(page, '/tasks/brewery')
    await page.getByTestId('board-span-14').click()
    await page.getByTestId('board-first-day').selectOption('sunday')
    await expect(page.getByTestId(`day-${sun}`)).toBeVisible()
    await expect.poll(() => shownDays(page)).toEqual(range(sun, 14))
    await page.getByTestId('board-next').click()
    await expect(page.getByTestId(`day-${addDays(sun, 14)}`)).toBeVisible()
    await page.getByTestId('board-today').click()
    await expect(page.getByTestId(`day-${sun}`)).toBeVisible()
    await expect.poll(() => shownDays(page)).toEqual(range(sun, 14))
  })

  test('S140: First day → Monday, then a typed range shows as typed', async ({ page }) => {
    await openBoard(page, '/tasks/brewery')
    await page.getByTestId('board-first-day').selectOption('monday')
    const from = addDays(today(), 2)
    const to = addDays(today(), 4)
    await page.getByTestId('board-range-from').fill(from)
    await page.getByTestId('board-range-to').fill(to)
    await page.getByTestId('board-range-apply').click()
    await expect(page.getByTestId(`day-${from}`)).toBeVisible()
    await expect.poll(() => shownDays(page)).toEqual(range(from, 3))
  })

  test.describe('at phone width', () => {
    test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true })

    test('S139: First day → Monday: the vertical view starts Monday, scrolled to today; one-day opens on today', async ({ page }) => {
      const mon = mondayOf(today())
      await openBoard(page, '/tasks/brewery')
      await page.getByTestId('board-calendar').click()
      await page.getByTestId('board-first-day').selectOption('monday')
      await expect(page.getByTestId('board-grid')).toHaveAttribute('data-layout', 'vertical')
      await expect(page.getByTestId(`day-${mon}`)).toBeAttached()
      await expect.poll(async () => (await shownDays(page))[0]).toBe(mon)
      await expect(page.getByTestId(`day-${today()}`)).toBeInViewport()
      if (mon < today()) await expect(page.getByTestId(`day-${mon}`)).not.toBeInViewport()

      await page.getByTestId('board-view-day').click()
      await expect(page.getByTestId(`phone-stop-${today()}`)).toHaveAttribute('aria-selected', 'true')
    })
  })
})

// ── 9. All departments keeps its own first day (S138) ────────────────

test.describe('as owner', () => {
  test.use({ storageState: authFile('owner') })

  test('S138: All departments on Monday, Brewery on Today; an All card for Tuesday opens Brewery with Tuesday in range', async ({ page }) => {
    const mon = mondayOf(today())
    const tue = addDays(mon, 1)
    const task = await createTask(await apiAs('owner'), 'brewery', { title: tempTag('S138'), due_on: tue })

    await openBoard(page, '/tasks/all')
    await page.getByTestId('board-span-7').click()
    await page.getByTestId('board-first-day').selectOption('monday')
    await expect(page.getByTestId(`day-${mon}`)).toBeVisible()
    await expect.poll(() => shownDays(page)).toEqual(range(mon, 7))

    await openBoard(page, '/tasks/brewery')
    await expect(page.getByTestId('board-first-day')).toHaveValue('today')
    await expect.poll(async () => (await shownDays(page))[0]).toBe(today())

    await openBoard(page, '/tasks/all')
    await expect(page.getByTestId('board-first-day')).toHaveValue('monday')
    await page.getByTestId(`task-title-${task.id}:${tue}`).click()
    await expect(page).toHaveURL(/\/tasks\/brewery/)
    await expect(page.getByTestId(`day-${tue}`)).toBeVisible({ timeout: 20_000 })
  })
})
