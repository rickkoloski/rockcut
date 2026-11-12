import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { authFile, personas } from '../../config/test-env'
import { addDays, apiAs, card, denverToday, getBoard, moveTask, openBoard, tempTag } from '../brewery/taskBoardHelpers'
import { cleanupTemp, createEvent, denverUtc, listEvents, openScheduler, weekMonday } from '../scheduler/helpers'

// D58 §3.5–§3.11, the backlog sweep: S15 (5202 repeat twin), S16 (4261 event
// series split chain), S17 (5204 shifts on a deactivated person), S19 (5206
// card links), S20 (5205 start-up), S21 (4061 tablet header). S18 (4118 item 1,
// staff code Remove waits for Save) is in regression/taproom/staff-codes.spec.ts.
// S15 writes to the shared Brewery board, so this file is in the `d58` project.

const isoWeekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay() || 7

// ── S15 (5202): a moved occurrence stands in for its old day ─────────

test.describe('S15: brewer1, a repeat task', () => {
  test.use({ storageState: authFile('brewer1'), viewport: { width: 1600, height: 1100 } })

  const made: number[] = []
  test.afterEach(async () => {
    const api = await apiAs('breweryMgr')
    for (const id of made.splice(0)) {
      const res = await api.delete(`/api/boards/brewery/tasks/${id}`, { params: { scope: 'following', changed: 'remove' } })
      expect([204, 404, 410]).toContain(res.status())
    }
  })

  /** Every card titled `title` on the Brewery board from `from` for `days` days, as [day, id]. */
  async function cardsOf(api: APIRequestContext, title: string, from: string, days: number) {
    const board = await getBoard(api, from, addDays(from, days - 1))
    return board.days.flatMap((d) => (d.cards as { id: number; title: string }[]).filter((c) => c.title === title).map((c) => [d.date, c.id] as const))
  }

  test('moves one ("Just this one"), then changes the rule from the first: no twin on the old day', async ({ page }) => {
    const api = await apiAs('brewer1')
    const title = tempTag('D58 S15 Keg Wash')
    const t = addDays(denverToday(), 1)
    const res = await api.post('/api/boards/brewery/tasks', { data: { title, due_on: t, repeat: 'weekly', repeat_weekdays: [isoWeekday(t)] } })
    expect(res.status(), await res.text()).toBe(201)
    const first = (await res.json()).data as { id: number; series_id: number }
    made.push(first.id)

    // The second week's one goes a day later, on its own.
    const [[, w1]] = (await cardsOf(api, title, addDays(t, 7), 1)) as [string, number][]
    await moveTask(api, w1, addDays(t, 8))

    // From the first: every week on t's weekday and two days later; keep the changed one.
    await openBoard(page)
    await card(page, first.id, t).getByTestId(`task-title-${first.id}:${t}`).click()
    await page.getByTestId('task-menu-edit').click()
    await page.getByTestId(`task-repeat-day-${isoWeekday(addDays(t, 2))}`).click()
    // From the first occurrence there's no "this one / following" question.
    await page.getByTestId('task-dialog').getByRole('button', { name: 'Save' }).click()
    await expect(page.getByTestId('remove-later-note')).toContainText(
      'If kept, the one moved to another day stays on its new day, and the new pattern doesn’t remake its old day.',
    )
    const saved = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().endsWith(`/tasks/${first.id}`))
    await page.getByTestId('remove-later-keep').click()
    expect((await saved).status()).toBe(200)
    const now = ((await (await saved).json()).data as { id: number }).id
    if (now !== first.id) made.push(now)

    const after = await cardsOf(api, title, t, 22)
    const on = (day: string) => after.filter(([d]) => d === day).map(([, id]) => id)
    expect(on(addDays(t, 7))).toEqual([])
    expect(on(addDays(t, 8))).toEqual([w1])
    // The new pattern still makes the other days.
    for (const n of [2, 9, 14, 16, 21]) expect(on(addDays(t, n))).toHaveLength(1)
  })
})

// ── S16 (4261): D39's split chain on repeating schedule events ───────

test.describe('S16: breweryMgr, a weekly event split', () => {
  test.use({ storageState: authFile('breweryMgr') })
  test.beforeEach(() => test.slow())

  let tag = ''
  test.afterEach(async () => {
    if (tag) await cleanupTemp(await apiAs('breweryMgr'), tag, '2025-01-01', '2029-12-31')
  })

  test('"following" from before the split reaches past it; the dialog gets no internal end; delete following takes the rest', async ({ page }) => {
    tag = tempTag('D58 S16 Tasting')
    const api = await apiAs('breweryMgr')
    const week = weekMonday(46)
    const tue = (n: number) => addDays(week, 1 + 7 * n)
    const { event: first } = await createEvent(api, 'brewery', {
      title: tag,
      starts_at: denverUtc(tue(0), '19:00'),
      ends_at: denverUtc(tue(0), '21:00'),
      repeat: 'weekly',
      repeat_weekdays: [2],
    })
    const mine = async () => (await listEvents(api, week, addDays(week, 70))).filter((e) => e.title.startsWith(tag))

    // From the 3rd Tuesday, Thursdays: the split.
    const third = (await mine())[2]
    const split = await api.patch(`/api/schedule_events/${third.id}`, {
      data: { starts_at: denverUtc(addDays(tue(2), 2), '19:00'), ends_at: denverUtc(addDays(tue(2), 2), '21:00'), repeat: 'weekly', repeat_weekdays: [4], scope: 'following' },
    })
    expect(split.status(), await split.text()).toBe(200)
    const before = await mine()
    const at = (iso: string) => new Date(iso).getTime()
    expect(before.slice(0, 3).map((e) => at(e.starts_at))).toEqual([tue(0), tue(1), addDays(tue(2), 2)].map((d) => at(denverUtc(d, '19:00'))))
    const second = before[1]

    // R1: the second's series shows no end (the split's internal one stays inside).
    const shown = await (await api.get(`/api/schedule_events/${second.id}`)).json()
    expect(shown.data.series.until_date).toBeNull()

    // G1: a new title from the 2nd, "this and all following", in the Scheduler.
    await openScheduler(page, 47)
    await page.getByTestId(`event-chip-${second.id}`).click()
    await page.getByTestId('event-title').fill(`${tag} new host`)
    await page.getByTestId('event-save').click()
    const patched = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().endsWith(`/api/schedule_events/${second.id}`))
    await page.getByTestId('series-scope-following').click()
    expect((await patched).status()).toBe(200)
    const renamed = await mine()
    expect(renamed[0].title).toBe(tag)
    expect(renamed.slice(1).every((e) => e.title === `${tag} new host`)).toBe(true)
    expect(renamed.length).toBe(before.length)

    // G1: delete this and all following from the 2nd takes the Thursdays too.
    expect((await api.delete(`/api/schedule_events/${second.id}`, { params: { scope: 'following' } })).status()).toBe(200)
    expect((await mine()).map((e) => e.id)).toEqual([first.id])
  })
})

// ── S17 (5204): no shift for a deactivated person ────────────────────

test.describe('S17: barMgr', () => {
  test.use({ storageState: authFile('barMgr') })

  const shifts: number[] = []
  test.afterEach(async () => {
    const api = await apiAs('barMgr')
    for (const id of shifts.splice(0)) await api.delete(`/api/shifts/${id}`)
  })

  test('a shift for inactive is 422 "is not active", on create and on reassign', async () => {
    const api = await apiAs('barMgr')
    const users = (await (await (await apiAs('owner')).get('/api/users')).json()).data as { id: number; email: string; active: boolean }[]
    const gone = users.find((u) => u.email === personas.inactive.email)!
    expect(gone.active).toBe(false)
    const sam = users.find((u) => u.email === personas.bartender1.email)!
    const positions = (await (await api.get('/api/positions')).json()).data as { id: number; name: string }[]
    const position = positions.find((p) => p.name === 'Bar-open')!.id
    const day = addDays(weekMonday(44), 2)
    const shift = { position_id: position, starts_at: denverUtc(day, '10:00'), ends_at: denverUtc(day, '16:00'), notes: tempTag('D58 S17') }

    const refused = await api.post('/api/shifts', { data: { ...shift, assignee_id: gone.id } })
    expect(refused.status()).toBe(422)
    expect((await refused.json()).errors.assignee_id).toEqual(['is not active'])

    const made = await api.post('/api/shifts', { data: { ...shift, assignee_id: sam.id } })
    expect(made.status(), await made.text()).toBe(201)
    const id = (await made.json()).data.id as number
    shifts.push(id)
    const moved = await api.patch(`/api/shifts/${id}`, { data: { assignee_id: gone.id } })
    expect(moved.status()).toBe(422)
    expect((await moved.json()).errors.assignee_id).toEqual(['is not active'])
  })
})

// ── S19 (5206): a card link that names no card ───────────────────────

const NOTICE = 'That card wasn’t found (it may have been deleted).'

for (const [persona, key] of [
  ['bartender1', 'bar'],
  ['brewer1', 'brewery'],
  ['taproomDevice', 'bar'],
] as const) {
  test.describe(`S19: ${persona}`, () => {
    test.use({ storageState: authFile(persona) })

    for (const cardId of ['99999999', 'abc']) {
      test(`/boards/${key}/cards/${cardId} shows the board with the notice`, async ({ page }) => {
        await page.goto(`/boards/${key}/cards/${cardId}`)
        await expect(page.getByTestId('idea-toast')).toHaveText(NOTICE)
        await expect(page).toHaveURL(new RegExp(`/boards/${key}$`))
        await expect(page.getByTestId('board-title')).toBeVisible()
        await expect(page.getByTestId('idea-card-dialog')).toHaveCount(0)
      })
    }
  })
}

// ── S20 (5205): start-up isn't blank ─────────────────────────────────

test.describe('S20: brewer1, a slow /api/me', () => {
  test.use({ storageState: authFile('brewer1') })

  test('loading screen at once, Still connecting at 4 s, Retry loads the app', async ({ page }) => {
    let hold = true
    await page.route('**/api/me', (route) => (hold ? undefined : route.continue()))
    const started = Date.now()
    await page.goto('/')
    await expect(page.getByTestId('loading-screen')).toBeVisible({ timeout: 2_000 })
    await expect(page.getByTestId('still-connecting')).toBeHidden()

    await expect(page.getByTestId('still-connecting')).toBeVisible({ timeout: 6_000 })
    expect(Date.now() - started).toBeGreaterThanOrEqual(4_000)
    await expect(page.getByTestId('server-unreachable')).toBeHidden()

    hold = false
    await page.getByTestId('still-connecting-retry').click()
    await expect(page.getByTestId('loading-screen')).toBeHidden({ timeout: 10_000 })
  })
})

// ── S21 (4061): the tablet header at phone width ─────────────────────

test.describe('S21: taproomDevice', () => {
  test.use({ storageState: authFile('taproomDevice') })

  async function header(page: Page) {
    const box = async (testId: string) => (await page.getByTestId(testId).boundingBox())!
    const logo = (await page.locator('.phone-logo').boundingBox())!
    return { chip: await box('device-chip'), signOut: await box('device-signout'), logo }
  }

  for (const width of [320, 360, 384]) {
    test(`${width} px: the board's title stays on one line beside the pill`, async ({ page }) => {
      await page.setViewportSize({ width, height: 740 })
      await page.goto('/boards/bar')
      const title = page.getByTestId('board-title')
      await expect(title).toBeVisible({ timeout: 15_000 })
      const lineHeight = await title.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight))
      expect((await title.boundingBox())!.height).toBeLessThan(lineHeight * 1.5)
      const { chip, signOut: so } = await header(page)
      expect(chip.x + chip.width).toBeLessThanOrEqual(so.x)
    })

    test(`${width} px: one line, icon Sign out, ellipsized pill, the logo's gap kept`, async ({ page }) => {
      await page.setViewportSize({ width, height: 740 })
      await page.goto('/')
      await expect(page.getByTestId('device-chip')).toBeVisible({ timeout: 15_000 })
      const signOut = page.getByTestId('device-signout')
      await expect(signOut).toHaveAccessibleName('Sign out')
      await expect(signOut).not.toHaveText('Sign out')

      const { chip, signOut: so, logo } = await header(page)
      // One line: every piece on the same row, nothing past the right edge.
      const mid = (b: { y: number; height: number }) => b.y + b.height / 2
      expect(Math.abs(mid(chip) - mid(so))).toBeLessThan(4)
      expect(Math.abs(mid(logo) - mid(so))).toBeLessThan(4)
      expect(so.x + so.width).toBeLessThanOrEqual(width)
      expect(chip.x + chip.width).toBeLessThanOrEqual(so.x)
      // The logo keeps its gap (the toolbar's 8 px).
      expect(chip.x - (logo.x + logo.width)).toBeGreaterThanOrEqual(8)
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(scroll).toBeLessThanOrEqual(width)
    })
  }

  test('412 px: the text Sign out and the "Shared device" pill, as before', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 })
    await page.goto('/')
    await expect(page.getByTestId('device-chip')).toBeVisible({ timeout: 15_000 })
    expect(await page.getByTestId('device-chip').innerText()).toBe('Shared device')
    await expect(page.getByTestId('device-signout')).toHaveText('Sign out')
  })
})
