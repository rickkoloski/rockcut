import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addDays, apiAs, cleanupTemp, createEvent, denverUtc, listEvents, openScheduler, tempTag, weekMonday } from './helpers'

// D32 DEV-check findings, round 2 (G2–G5 and the Extend message). Each test
// works in its own week (14–18 out).

let tag = ''
test.afterEach(async () => {
  await cleanupTemp(await apiAs('barMgr'), tag, '2025-01-01', '2029-12-31')
})

test.describe('barMgr', () => {
  test.use({ storageState: authFile('barMgr') })

  test('G2: saving an event someone else deleted says so and refreshes the grid', async ({ page }) => {
    tag = tempTag('G2 stale')
    const week = weekMonday(14)
    const api = await apiAs('barMgr')
    const { event } = await createEvent(api, 'bar', { title: tag, starts_at: denverUtc(addDays(week, 1), '18:00'), ends_at: denverUtc(addDays(week, 1), '20:00') })

    await openScheduler(page, 14)
    await page.getByTestId(`event-chip-${event.id}`).click()
    await page.getByTestId('event-title').fill(`${tag} renamed`)
    expect((await api.delete(`/api/schedule_events/${event.id}`)).status()).toBe(200) // "someone else"

    await page.getByTestId('event-save').click()
    await expect(page.getByTestId('event-error')).toContainText('no longer exists')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId(`event-chip-${event.id}`)).toHaveCount(0)
  })

  test('G3: moving a repeating date to another day with "this and all following" moves the later dates', async ({ page }) => {
    tag = tempTag('G3 trivia')
    const week = weekMonday(15)
    const api = await apiAs('barMgr')
    const { event: first } = await createEvent(api, 'bar', {
      title: tag,
      starts_at: denverUtc(addDays(week, 1), '19:00'),
      ends_at: denverUtc(addDays(week, 1), '21:00'),
      repeat: 'weekly',
      repeat_weekdays: [2],
      repeat_count: 5,
    })
    const third = (await listEvents(api, week, addDays(week, 40))).filter((e) => e.series_id === first.series_id)[2]
    const wednesday = addDays(week, 16) // the 3rd week's Wednesday (3rd Tuesday is week + 15)

    await openScheduler(page, 17)
    await page.getByTestId(`event-chip-${third.id}`).click()
    await page.getByTestId('event-start-day').fill(wednesday)
    await page.getByTestId('event-end-day').fill(wednesday)
    await page.getByTestId('event-save').click()
    const saved = page.waitForResponse((r) => r.request().method() === 'PATCH')
    await page.getByTestId('series-scope-following').click()
    expect((await saved).status()).toBe(200)

    const days = (await listEvents(api, week, addDays(week, 40)))
      .filter((e) => e.title === tag)
      .map((e) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', weekday: 'short' }).format(new Date(e.starts_at)))
    expect(days).toEqual(['Tue', 'Tue', 'Wed', 'Wed', 'Wed'])
  })

  test('G4: a 100-character title doesn’t widen its day column', async ({ page }) => {
    tag = tempTag('G4')
    const week = weekMonday(16)
    const title = `${tag} ${'x'.repeat(100)}`.slice(0, 100)
    const { event } = await createEvent(await apiAs('barMgr'), 'bar', { title, starts_at: denverUtc(addDays(week, 2), '12:00'), ends_at: denverUtc(addDays(week, 2), '13:00') })

    await openScheduler(page, 16)
    await expect(page.getByTestId(`event-chip-${event.id}`)).toBeVisible()
    const cell = await page.getByTestId(`events-cell-${addDays(week, 2)}`).boundingBox()
    const neighbour = await page.getByTestId(`events-cell-${addDays(week, 3)}`).boundingBox()
    expect(cell!.width).toBeLessThan(200)
    expect(Math.abs(cell!.width - neighbour!.width)).toBeLessThan(5)
  })

  test('G5 (A4): an event ending by 3 AM shows on its start day only; a longer one shows on each day with continuation labels', async ({ page }) => {
    tag = tempTag('G5')
    const week = weekMonday(17)
    const api = await apiAs('barMgr')
    const sunday = addDays(week, 6)
    // Sunday 10 pm – Monday 2 am: Sunday only (not next week's Monday).
    const { event: late } = await createEvent(api, 'bar', { title: `${tag} late`, starts_at: denverUtc(sunday, '22:00'), ends_at: denverUtc(addDays(sunday, 1), '02:00') })
    // Tuesday 6 pm – Friday 12 pm: four days.
    const tue = addDays(week, 1)
    const { event: long } = await createEvent(api, 'bar', { title: `${tag} long`, starts_at: denverUtc(tue, '18:00'), ends_at: denverUtc(addDays(tue, 3), '12:00') })

    await openScheduler(page, 17)
    await expect(page.getByTestId(`events-cell-${sunday}`).getByTestId(`event-chip-${late.id}`)).toContainText('10:00 PM')
    await expect(page.getByTestId(`events-cell-${tue}`).getByTestId(`event-chip-${long.id}`)).toContainText('6:00 PM →')
    await expect(page.getByTestId(`events-cell-${addDays(tue, 1)}`).getByTestId(`event-chip-${long.id}`)).toContainText('All day (cont.)')
    await expect(page.getByTestId(`events-cell-${addDays(tue, 2)}`).getByTestId(`event-chip-${long.id}`)).toContainText('All day (cont.)')
    await expect(page.getByTestId(`events-cell-${addDays(tue, 3)}`).getByTestId(`event-chip-${long.id}`)).toContainText('→ until 12:00 PM')
    await expect(page.getByTestId(`events-cell-${addDays(tue, 4)}`).getByTestId(`event-chip-${long.id}`)).toHaveCount(0)

    await page.getByRole('button', { name: 'Next week' }).click()
    await expect(page.getByTestId(`events-cell-${addDays(week, 7)}`)).toBeVisible()
    await expect(page.getByTestId(`event-chip-${late.id}`)).toHaveCount(0)
  })

  test('Extend with nothing to add says so and keeps the dialog open', async ({ page }) => {
    tag = tempTag('extend none')
    const week = weekMonday(18)
    const { event } = await createEvent(await apiAs('barMgr'), 'bar', {
      title: tag,
      starts_at: denverUtc(addDays(week, 3), '19:00'),
      ends_at: denverUtc(addDays(week, 3), '21:00'),
      repeat: 'weekly',
      repeat_weekdays: [4],
    })

    await openScheduler(page, 18)
    await page.getByTestId(`event-chip-${event.id}`).click()
    await page.getByTestId('event-extend').click()
    await expect(page.getByTestId('event-info')).toContainText('Already scheduled')
    await expect(page.getByTestId('event-dialog')).toBeVisible()
  })
})
