import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addDays, apiAs, cleanupTemp, createEvent, denverToday, denverUtc, listEvents, openScheduler, tempTag, weekMonday, weeksAhead } from './helpers'

// D32 S13–S18: repeating events. Series live 11+ weeks out, apart from the other
// scheduler specs' weeks. Occurrence times are checked in Colorado time.

const denverTime = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso))
const denverDay = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

/** The 3rd Sunday on or after `key`'s month, as a date key. */
function thirdSundayFrom(key: string): string {
  const [y, m] = key.split('-').map(Number)
  for (let i = 0; i < 3; i++) {
    const first = new Date(Date.UTC(y, m - 1 + i, 1, 12))
    const offset = (7 - first.getUTCDay()) % 7
    const third = new Date(first.getTime() + (offset + 14) * 86_400_000).toISOString().slice(0, 10)
    if (third >= key) return third
  }
  throw new Error('unreachable')
}

let tag = ''
const FAR = '2029-12-31'
// These tests page many weeks ahead and create whole series; give them more time.
test.beforeEach(() => test.slow())
test.afterEach(async () => {
  await cleanupTemp(await apiAs('barMgr'), tag, '2025-01-01', FAR)
})

test.describe('barMgr', () => {
  test.use({ storageState: authFile('barMgr') })

  test('S13: a weekly series makes 8 Tuesday drafts; Publish week publishes one', async ({ page }) => {
    tag = tempTag('S13 trivia')
    const week = weekMonday(20)
    const tuesday = addDays(week, 1)

    await openScheduler(page, 20)
    await page.getByTestId('add-event').click()
    await page.getByTestId('event-start-day').fill(tuesday)
    await page.getByTestId('event-end-day').fill(tuesday)
    await page.getByTestId('event-title').fill(tag)
    await page.getByTestId('event-start-time').fill('19:00')
    await page.getByTestId('event-end-time').fill('21:00')
    await page.getByRole('combobox', { name: /^Repeat/ }).click()
    await page.getByRole('option', { name: 'Weekly' }).click()
    await page.getByRole('combobox', { name: /^Ends/ }).click()
    await page.getByRole('option', { name: 'After a number of times' }).click()
    await page.getByTestId('event-repeat-count').fill('8')
    await expect(page.getByTestId('event-repeat-summary')).toHaveText('Every Tuesday, 8 times')
    const saved = page.waitForResponse((r) => r.url().endsWith('/api/schedule_events') && r.request().method() === 'POST')
    await page.getByTestId('event-save').click()
    expect((await (await saved).json()).count).toBe(8)

    const occ = (await listEvents(await apiAs('barMgr'), week, addDays(week, 70))).filter((e) => e.title === tag)
    expect(occ).toHaveLength(8)
    expect(occ.every((e) => e.status === 'draft')).toBe(true)
    expect(occ.map((e) => new Date(`${denverDay(e.starts_at)}T12:00:00Z`).getUTCDay())).toEqual(Array(8).fill(2))
    expect(new Set(occ.map((e) => denverTime(e.starts_at)))).toEqual(new Set(['7:00 PM']))

    await page.reload()
    await openScheduler(page, 20)
    const firstChip = page.getByTestId(`events-cell-${tuesday}`).locator('[data-testid^="event-chip-"]', { hasText: tag })
    await expect(firstChip.getByRole('img', { name: 'Repeats' })).toBeVisible()
    const published = page.waitForResponse((r) => r.url().endsWith('/api/schedule_events/publish'))
    await page.getByRole('button', { name: /publish week/i }).click()
    await published

    const after = (await listEvents(await apiAs('barMgr'), week, addDays(week, 70))).filter((e) => e.title === tag)
    expect(after.filter((e) => e.status === 'published').map((e) => denverDay(e.starts_at))).toEqual([tuesday])
  })

  test('S14: a monthly 3rd-Sunday series is capped at 12 months and keeps 7 PM across DST', async ({ page }) => {
    tag = tempTag('S14 bingo')
    const sunday = thirdSundayFrom(weekMonday(11))
    const weeks = weeksAhead(sunday)

    await openScheduler(page, weeks)
    await page.getByTestId('add-event').click()
    await page.getByTestId('event-start-day').fill(sunday)
    await page.getByTestId('event-end-day').fill(sunday)
    await page.getByTestId('event-title').fill(tag)
    await page.getByTestId('event-start-time').fill('19:00')
    await page.getByTestId('event-end-time').fill('21:00')
    await page.getByRole('combobox', { name: /^Repeat/ }).click()
    await page.getByRole('option', { name: 'Monthly (by weekday)' }).click()
    await expect(page.getByTestId('event-repeat-summary')).toContainText('Monthly on the 3rd Sunday')
    await page.getByRole('combobox', { name: /^Ends/ }).click()
    await page.getByRole('option', { name: 'On a date' }).click()
    await page.getByTestId('event-repeat-until').fill(FAR)
    const saved = page.waitForResponse((r) => r.url().endsWith('/api/schedule_events') && r.request().method() === 'POST')
    await page.getByTestId('event-save').click()
    const count = (await (await saved).json()).count
    expect([12, 13]).toContain(count) // 12 months from the start, inclusive of the anniversary month's date if it falls before it

    const occ = (await listEvents(await apiAs('barMgr'), sunday, FAR)).filter((e) => e.title === tag)
    expect(occ).toHaveLength(count)
    const last = denverDay(occ[occ.length - 1].starts_at)
    expect(last < addDays(sunday, 366)).toBe(true)
    // Every one is a 3rd Sunday at 7 PM Colorado time, whether in MDT or MST.
    for (const e of occ) {
      const day = denverDay(e.starts_at)
      expect(new Date(`${day}T12:00:00Z`).getUTCDay()).toBe(0)
      expect(Number(day.slice(8, 10))).toBeGreaterThanOrEqual(15)
      expect(Number(day.slice(8, 10))).toBeLessThanOrEqual(21)
      expect(denverTime(e.starts_at)).toBe('7:00 PM')
    }
  })

  test('S15: "this event only" changes one date; "this and following" renames the rest', async ({ page }) => {
    tag = tempTag('S15 trivia')
    const week = weekMonday(30)
    const api = await apiAs('barMgr')
    const { event: first } = await createEvent(api, 'bar', {
      title: tag,
      starts_at: denverUtc(addDays(week, 3), '19:00'),
      ends_at: denverUtc(addDays(week, 3), '21:00'),
      repeat: 'weekly',
      repeat_weekdays: [4],
      repeat_count: 6,
    })
    const occ = async () => (await listEvents(api, week, addDays(week, 60))).filter((e) => e.series_id === first.series_id)
    const [, second, , fourth] = await occ()

    // This event only: the 2nd Thursday moves to 8 PM.
    await openScheduler(page, 31)
    await page.getByTestId(`event-chip-${second.id}`).click()
    await page.getByTestId('event-start-time').fill('20:00')
    await page.getByTestId('event-end-time').fill('22:00')
    await page.getByTestId('event-save').click()
    const patched = page.waitForResponse((r) => r.request().method() === 'PATCH')
    await page.getByTestId('series-scope-this').click()
    expect((await patched).status()).toBe(200)

    let now = await occ()
    expect(now.map((e) => denverTime(e.starts_at))).toEqual(['7:00 PM', '8:00 PM', '7:00 PM', '7:00 PM', '7:00 PM', '7:00 PM'])

    // This and all following, from the 4th: new title from there on.
    await openScheduler(page, 33)
    await page.getByTestId(`event-chip-${fourth.id}`).click()
    await page.getByTestId('event-title').fill(`${tag} new host`)
    await page.getByTestId('event-save').click()
    const patched2 = page.waitForResponse((r) => r.request().method() === 'PATCH')
    await page.getByTestId('series-scope-following').click()
    expect((await patched2).status()).toBe(200)

    await page.reload()
    now = await occ()
    expect(now.map((e) => e.title)).toEqual([tag, tag, tag, `${tag} new host`, `${tag} new host`, `${tag} new host`])
    expect(denverTime(now[1].starts_at)).toBe('8:00 PM') // the earlier individual change is untouched
  })

  test('S16: delete "this event only", then "this and all following"', async ({ page }) => {
    tag = tempTag('S16 open mic')
    const week = weekMonday(40)
    const api = await apiAs('barMgr')
    const { event: first } = await createEvent(api, 'bar', {
      title: tag,
      starts_at: denverUtc(addDays(week, 2), '18:00'),
      ends_at: denverUtc(addDays(week, 2), '20:00'),
      repeat: 'weekly',
      repeat_weekdays: [3],
      repeat_count: 5,
    })
    const occ = async () => (await listEvents(api, week, addDays(week, 50))).filter((e) => e.series_id === first.series_id)
    const [, second, third] = await occ()

    await openScheduler(page, 41)
    await page.getByTestId(`event-chip-${second.id}`).click()
    await page.getByTestId('event-delete').click()
    const del1 = page.waitForResponse((r) => r.request().method() === 'DELETE')
    await page.getByTestId('series-scope-this').click()
    expect((await del1).status()).toBe(200)
    expect(await occ()).toHaveLength(4)

    await openScheduler(page, 42)
    await page.getByTestId(`event-chip-${third.id}`).click()
    await page.getByTestId('event-delete').click()
    const del2 = page.waitForResponse((r) => r.request().method() === 'DELETE')
    await page.getByTestId('series-scope-following').click()
    expect((await del2).status()).toBe(200)

    const left = await occ()
    expect(left.map((e) => e.id)).toEqual([first.id])
  })

  test('S17: Extend adds drafts past the old last date', async ({ page }) => {
    tag = tempTag('S17 bingo')
    const api = await apiAs('barMgr')
    // A series that started months ago, so 12 months from today reaches past it.
    const start = thirdSundayFrom(addDays(denverToday(), -150))
    const { event: first, count } = await createEvent(api, 'bar', {
      title: tag,
      starts_at: denverUtc(start, '19:00'),
      ends_at: denverUtc(start, '21:00'),
      repeat: 'monthly_weekday',
      repeat_week_of_month: 3,
      repeat_weekday: 7,
    })
    const upcoming = (await listEvents(api, denverToday(), FAR)).find((e) => e.series_id === first.series_id)!
    const before = upcoming.series!.generated_through!

    await openScheduler(page, weeksAhead(denverDay(upcoming.starts_at)))
    await page.getByTestId(`event-chip-${upcoming.id}`).click()
    await expect(page.getByTestId('event-extend')).toBeVisible()
    const extended = page.waitForResponse((r) => r.url().includes('/extend'))
    await page.getByTestId('event-extend').click()
    const added = (await (await extended).json()).count
    expect(added).toBeGreaterThan(0)

    const all = (await listEvents(api, '2025-01-01', FAR)).filter((e) => e.series_id === first.series_id)
    expect(all).toHaveLength(count + added)
    const newest = all.filter((e) => denverDay(e.starts_at) > before)
    expect(newest).toHaveLength(added)
    expect(newest.every((e) => e.status === 'draft' && denverTime(e.starts_at) === '7:00 PM')).toBe(true)
  })
})

test.describe('other personas (S18)', () => {
  test('breweryMgr can’t change or extend a taproom series; bartender1 sees published dates read-only', async ({ browser }) => {
    tag = tempTag('S18 trivia')
    const week = weekMonday(45)
    const api = await apiAs('barMgr')
    const { event: first } = await createEvent(api, 'bar', {
      title: tag,
      notes: 'House-run',
      starts_at: denverUtc(addDays(week, 1), '19:00'),
      ends_at: denverUtc(addDays(week, 1), '21:00'),
      repeat: 'weekly',
      repeat_weekdays: [2],
      repeat_count: 3,
    })
    const [a, b] = (await listEvents(api, week, addDays(week, 30))).filter((e) => e.series_id === first.series_id)
    expect((await api.post(`/api/schedule_events/${a.id}/publish`)).status()).toBe(200)

    const brewery = await apiAs('breweryMgr')
    expect((await brewery.patch(`/api/schedule_events/${a.id}`, { data: { title: 'x', scope: 'following' } })).status()).toBe(403)
    expect((await brewery.delete(`/api/schedule_events/${a.id}`, { params: { scope: 'following' } })).status()).toBe(403)
    expect((await brewery.post(`/api/schedule_event_series/${first.series_id}/extend`)).status()).toBe(403)

    const bartender = await apiAs('bartender1')
    expect((await bartender.get(`/api/schedule_events/${b.id}`)).status()).toBe(404)

    const ctx = await browser.newContext({ storageState: authFile('bartender1') })
    const page = await ctx.newPage()
    await page.goto('/schedule')
    await page.getByLabel('From').fill(week)
    await page.getByLabel('To').fill(addDays(week, 6))
    const card = page.getByTestId(`agenda-event-${a.id}`)
    await expect(card.getByRole('img', { name: 'Repeats' })).toBeVisible()
    await card.click()
    await expect(page.getByTestId('event-notes-view')).toHaveText('House-run')
    await expect(page.getByTestId('event-save')).toHaveCount(0)
    await ctx.close()
  })
})
