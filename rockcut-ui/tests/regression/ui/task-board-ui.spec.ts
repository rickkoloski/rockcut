import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { authFile, type PersonaKey } from '../../config/test-env'
import { addDays, apiAs, cleanupTasks, completeTask, createTask, dailyCard, denverToday, denverUtc, openBoard, removeTick, setBoardCheck, tempTag, userId } from '../brewery/taskBoardHelpers'
import { contrastOf } from './contrast'

// D43 §1.3, §1.11, §1.14: board layers (S151), the finished Daily card
// (S163, S164) and the day header in time order (S167, S168). Named
// task-board-* so it runs in the one-worker `brewery-board` project (it ticks
// the shared Brewery board's Daily items and restores them).

test.use({ viewport: { width: 1600, height: 1000 } })

const bg = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => getComputedStyle(el).backgroundColor)

// Task 4706 (D52): these set their persona's color mode, so they use one no other
// spec changes. theme.spec and position-menu.spec set owner's (and brewer1's),
// and running beside them the board could load in the other theme.
const MODE_PERSONA = 'breweryMgr' as const

async function setMode(mode: string) {
  expect((await (await apiAs(MODE_PERSONA)).put('/api/me/color_mode', { data: { color_mode: mode } })).status()).toBe(200)
}

test.describe('S151: board layers', () => {
  test.use({ storageState: authFile(MODE_PERSONA) })
  test.afterAll(() => setMode('light'))

  for (const mode of ['light', 'dark'] as const) {
    test(`page, columns, today's column and cards are distinct shades (${mode})`, async ({ page }) => {
      await setMode(mode)
      await openBoard(page)
      const today = denverToday()
      const page_ = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
      const column = await bg(page, `[data-testid="day-${addDays(today, 1)}"]`)
      const todayColumn = await bg(page, `[data-testid="day-${today}"]`)
      const card = await bg(page, '[data-testid="board-grid"] [data-testid^="daily-"][data-complete]')
      expect(new Set([page_, column, card]).size).toBe(3)
      expect(todayColumn).not.toBe(column)
      expect(todayColumn).not.toBe(page_)
    })
  }
})

// DEV QA G3: a done card's "✓ name" line and the assignee's initials were
// about 2:1 on dark boards (the whole card was faded). Text needs 4.5:1.
test.describe('a done task card', () => {
  test.use({ storageState: authFile(MODE_PERSONA) })
  // Each test makes its own: another board spec's clean-up may run between them.
  let taskId: number | null = null
  test.afterEach(async () => {
    await setMode('light')
    if (taskId) await cleanupTasks([taskId])
    taskId = null
  })

  for (const mode of ['light', 'dark'] as const) {
    test(`"✓ name" and the initials are readable (${mode})`, async ({ page }) => {
      const today = denverToday()
      const t = await createTask(await apiAs('breweryMgr'), { title: tempTag('G3 done card'), due_on: today, assignee_id: await userId(await apiAs('brewer1')) })
      taskId = t.id
      await completeTask(await apiAs('brewer1'), t.id)
      await setMode(mode)
      await openBoard(page)
      const key = `${taskId}:${today}`
      await expect(page.getByTestId(`task-done-by-${key}`)).toHaveText('✓ Jake')
      expect(await contrastOf(page.getByTestId(`task-done-by-${key}`))).toBeGreaterThanOrEqual(4.5)
      expect(await contrastOf(page.getByTestId(`task-assignee-${key}`))).toBeGreaterThanOrEqual(4.5)
      expect(await page.getByTestId(`task-${key}`).evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
      await expect(page.getByTestId(`task-title-${key}`)).toHaveCSS('text-decoration-line', 'line-through')
    })
  }
})

// ── Daily card (S163, S164) ──────────────────────────────────────────

const checkPath = (date: string, itemId: number) => `/api/boards/brewery/daily_checks/${date}/${itemId}`

async function tick(api: APIRequestContext, date: string, itemId: number) {
  const res = await api.put(checkPath(date, itemId))
  expect([200, 201], await res.text()).toContain(res.status())
}

type Saved = { all: number[]; ticked: { id: number; by: string | null }[] }

/** A day's items and who ticked which, to put back afterwards. */
async function ticked(api: APIRequestContext, date: string): Promise<Saved> {
  const card = await dailyCard(api, date)
  const active = card.items.filter((i) => i.active)
  return {
    all: active.map((i) => i.daily_item_id),
    ticked: active.filter((i) => i.checked).map((i) => ({ id: i.daily_item_id, by: i.completed_by_name })),
  }
}

// Re-tick as the person who had ticked it (the seed's are breweryMgr's), so "who" stays the same.
const TICKERS: Record<string, PersonaKey> = { 'Morgan Mash': 'breweryMgr', 'Jake Brewer': 'brewer1', 'Riley Wort': 'brewer2' }

async function restore(date: string, saved: Saved) {
  const api = await apiAs('brewer1')
  for (const id of saved.all) await removeTick(api, date, id)
  for (const t of saved.ticked) await tick(await apiAs(TICKERS[t.by ?? ''] ?? 'brewer1'), date, t.id)
}

test.describe('the Daily card (brewer1)', () => {
  test.use({ storageState: authFile('brewer1') })
  test.describe.configure({ mode: 'serial' })

  const today = denverToday()
  const yesterday = addDays(today, -1)
  let savedToday: Saved | null = null
  let savedYesterday: Saved | null = null

  test.afterAll(async () => {
    if (savedToday) await restore(today, savedToday)
    if (savedYesterday) await restore(yesterday, savedYesterday)
  })

  test('S163: tick every item: open, struck and dimmed; after reload closed, struck and dimmed', async ({ page }) => {
    const api = await apiAs('brewer1')
    savedToday = await ticked(api, today)
    for (const id of savedToday.all) await removeTick(api, today, id)

    await openBoard(page)
    const card = page.getByTestId(`daily-${today}`)
    await expect(card).toHaveAttribute('data-complete', 'false')
    // Each tick's PUT has landed before the reload below (the box shows ticked
    // before it does; DEV latency).
    for (const id of savedToday.all) {
      const saved = page.waitForResponse((r) => r.url().endsWith(`/daily_checks/${today}/${id}`) && r.request().method() === 'PUT')
      await setBoardCheck(page.getByTestId(`daily-check-${today}-${id}`), true)
      expect((await saved).ok()).toBe(true)
    }

    // Ticking the last item doesn't snap it shut.
    await expect(card).toHaveAttribute('data-complete', 'true')
    await expect(page.getByTestId(`daily-check-${today}-${savedToday.all[0]}`)).toBeVisible()
    const look = async () => ({
      opacity: await card.evaluate((el) => getComputedStyle(el).opacity),
      strike: await page.getByTestId(`daily-count-${today}`).evaluate((el) => getComputedStyle(el).textDecorationLine),
    })
    expect(await look()).toEqual({ opacity: '0.65', strike: 'line-through' })
    await expect(page.getByTestId(`daily-count-${today}`)).toHaveText(`Daily ${savedToday.all.length}/${savedToday.all.length}`)

    await page.reload()
    await expect(card).toHaveAttribute('data-complete', 'true')
    await expect(page.getByTestId(`daily-check-${today}-${savedToday.all[0]}`)).toBeHidden()
    expect(await look()).toEqual({ opacity: '0.65', strike: 'line-through' })
  })

  test('S164: a day at 2/4 looks normal and starts closed; unfinished today starts open', async ({ page }) => {
    const api = await apiAs('brewer1')
    savedToday ??= await ticked(api, today)
    savedYesterday = await ticked(api, yesterday)
    for (const id of savedYesterday.all) await removeTick(api, yesterday, id)
    for (const id of savedYesterday.all.slice(0, 2)) await tick(api, yesterday, id)
    // Today unfinished.
    for (const id of savedToday.all) await removeTick(api, today, id)

    await openBoard(page, { from: yesterday, to: addDays(today, 5) })
    const past = page.getByTestId(`daily-${yesterday}`)
    await expect(page.getByTestId(`daily-count-${yesterday}`)).toHaveText(`Daily 2/${savedYesterday.all.length}`)
    await expect(past).toHaveAttribute('data-complete', 'false')
    expect(await past.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
    expect(await page.getByTestId(`daily-count-${yesterday}`).evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe('none')
    await expect(page.getByTestId(`daily-check-${yesterday}-${savedYesterday.all[0]}`)).toBeHidden()
    // Today, unfinished, is open.
    await expect(page.getByTestId(`daily-check-${today}-${savedToday.all[0]}`)).toBeVisible()
  })
})

// ── Day header order (S167, S168) ────────────────────────────────────

const shiftIds: number[] = []
test.afterEach(async () => {
  const owner = await apiAs('owner')
  for (const id of shiftIds.splice(0)) await owner.delete(`/api/shifts/${id}`)
})

async function positionId(api: APIRequestContext, name: string) {
  const positions = (await (await api.get('/api/positions')).json()).data as { id: number; name: string }[]
  return positions.find((p) => p.name === name)!.id
}

async function shift(position: string, assigneeId: number | null, day: string, from: string, to: string, tag: string) {
  const owner = await apiAs('owner')
  const res = await owner.post('/api/shifts', {
    data: { position_id: await positionId(owner, position), assignee_id: assigneeId, starts_at: denverUtc(day, from), ends_at: denverUtc(day, to), notes: tag },
  })
  expect(res.status(), await res.text()).toBe(201)
  const id = (await res.json()).data.id as number
  shiftIds.push(id)
  expect((await owner.post(`/api/shifts/${id}/publish`)).status()).toBe(200)
  return id
}

/** The header's people and open-shift lines of a day, in order. */
async function headerOrder(page: Page, day: string): Promise<string[]> {
  return page
    .getByTestId(`day-header-${day}`)
    .locator('[data-testid^="header-person-"], [data-testid^="header-open-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid') ?? ''))
}

test.describe('S167: floater, the Taproom board', () => {
  test.use({ storageState: authFile('floater') })

  test('people and open shifts together by start time: 8a, open 10a, 12p', async ({ page }) => {
    const tag = tempTag('S167')
    const day = addDays(denverToday(), 9)
    const sam = await userId(await apiAs('bartender1'))
    const alex = await userId(await apiAs('bartender2'))
    await shift('Bar-open', alex, day, '12:00', '20:00', tag)
    const open = await shift('Bar-open', null, day, '10:00', '18:00', tag)
    await shift('Bar-open', sam, day, '08:00', '16:00', tag)

    await page.goto('/tasks/bar')
    await expect(page.getByTestId('board-grid')).toBeVisible({ timeout: 20_000 })
    await expect
      .poll(() => headerOrder(page, day))
      .toEqual([`header-person-${day}-${sam}`, `header-open-${day}-${open}`, `header-person-${day}-${alex}`])
  })
})

test.describe('S168: breweryMgr, the Brewery board', () => {
  test.use({ storageState: authFile('breweryMgr') })

  test("a brewer's 7a and 3p shifts share the first line; the 11a brewer comes next", async ({ page }) => {
    const tag = tempTag('S168')
    const day = addDays(denverToday(), 10)
    const jake = await userId(await apiAs('brewer1'))
    const riley = await userId(await apiAs('brewer2'))
    await shift('Brewer', riley, day, '11:00', '14:00', tag)
    await shift('Brewer', jake, day, '15:00', '18:00', tag)
    await shift('Brewer', jake, day, '07:00', '10:00', tag)

    await openBoard(page)
    await expect.poll(() => headerOrder(page, day)).toEqual([`header-person-${day}-${jake}`, `header-person-${day}-${riley}`])
    await expect(page.getByTestId(`header-person-${day}-${jake}`)).toContainText('7:00a')
    await expect(page.getByTestId(`header-person-${day}-${jake}`)).toContainText('3:00p')
  })
})

