import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addDays, apiAs, cleanupTemp, createEvent, denverUtc, listEvents, openScheduler, tempTag, weekMonday } from './helpers'

// D32 S1–S3, S9: a taproom manager adds events in the Scheduler grid. Each test
// works in its own week (2–6 weeks out) so parallel tests and Publish week don't
// touch each other's data.

test.describe('barMgr in the Scheduler', () => {
  test.use({ storageState: authFile('barMgr') })

  let tag = ''
  let week = ''
  test.afterEach(async () => {
    await cleanupTemp(await apiAs('barMgr'), tag, week, addDays(week, 6))
  })

  test('S1: adds a timed event from the Events row; it persists as a draft', async ({ page }) => {
    tag = tempTag('S1 private party')
    week = weekMonday(2)
    const tuesday = addDays(week, 1)

    await openScheduler(page, 2)
    await page.getByTestId(`events-cell-${tuesday}`).click()
    await expect(page.getByTestId('event-start-day')).toHaveValue(tuesday)
    await page.getByTestId('event-title').fill(tag)
    await page.getByTestId('event-start-time').fill('18:00')
    await page.getByTestId('event-end-time').fill('22:00')
    await page.getByTestId('event-notes').fill('Back room; kegs set up by 5')
    const saved = page.waitForResponse((r) => r.url().endsWith('/api/schedule_events') && r.request().method() === 'POST')
    await page.getByTestId('event-save').click()
    expect((await saved).status()).toBe(201)

    await page.reload()
    await openScheduler(page, 2)
    const chip = page.getByTestId(`events-cell-${tuesday}`).getByText(tag)
    await expect(chip).toBeVisible()
    await expect(page.getByTestId(`events-cell-${tuesday}`)).toContainText('6:00 PM · draft')
  })

  test('S2: Publish week publishes the week’s events and shifts; the event notifies nobody', async ({ page }) => {
    tag = tempTag('S2 delivery')
    week = weekMonday(3)
    const api = await apiAs('barMgr')
    const bartender = await apiAs('bartender1')

    const { event } = await createEvent(api, 'bar', {
      title: tag,
      starts_at: denverUtc(addDays(week, 2), '10:00'),
      ends_at: denverUtc(addDays(week, 2), '11:00'),
    })
    const since = new Date().toISOString()

    await openScheduler(page, 3)
    await expect(page.getByTestId(`event-chip-${event.id}`)).toContainText('draft')
    const published = page.waitForResponse((r) => r.url().endsWith('/api/schedule_events/publish'))
    await page.getByRole('button', { name: /publish week/i }).click()
    expect((await published).status()).toBe(200)

    await page.reload()
    await openScheduler(page, 3)
    await expect(page.getByTestId(`event-chip-${event.id}`)).not.toContainText('draft')
    const after = (await listEvents(api, week, addDays(week, 6))).find((e) => e.id === event.id)
    expect(after?.status).toBe('published')
    // No notification about this event. (Other specs publish Taproom shifts in
    // parallel, so a plain unread count would be racy.)
    const notes = (await (await bartender.get('/api/notifications')).json()).data as { title: string; body: string | null; event: string; inserted_at: string }[]
    const recent = notes.filter((n) => n.inserted_at >= since.slice(0, 19))
    expect(recent.filter((n) => `${n.title} ${n.body ?? ''}`.includes(tag) || n.event.includes('schedule_event'))).toEqual([])
  })

  test('S2: Publish week publishes shifts and events together', async ({ page }) => {
    tag = tempTag('S2 both')
    week = weekMonday(4)
    const api = await apiAs('barMgr')
    const positions = (await (await api.get('/api/positions')).json()).data as { id: number; name: string }[]
    const shiftRes = await api.post('/api/shifts', {
      data: {
        position_id: positions.find((p) => p.name === 'Bar-open')!.id,
        starts_at: denverUtc(addDays(week, 3), '08:00'),
        ends_at: denverUtc(addDays(week, 3), '16:00'),
        notes: tag,
      },
    })
    expect(shiftRes.status()).toBe(201)
    const shiftId = (await shiftRes.json()).data.id
    const { event } = await createEvent(api, 'bar', {
      title: tag,
      starts_at: denverUtc(addDays(week, 3), '19:00'),
      ends_at: denverUtc(addDays(week, 3), '21:00'),
    })

    await openScheduler(page, 4)
    await expect(page.getByTestId(`event-chip-${event.id}`)).toBeVisible()
    const both = Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/api/shifts/publish')),
      page.waitForResponse((r) => r.url().endsWith('/api/schedule_events/publish')),
    ])
    await page.getByRole('button', { name: /publish week/i }).click()
    await both

    const shift = (await (await api.get(`/api/shifts/${shiftId}`)).json()).data
    expect(shift.status).toBe('published')
    expect((await listEvents(api, week, addDays(week, 6))).find((e) => e.id === event.id)?.status).toBe('published')
  })

  test('S3: an all-day event over two days shows "All day" on both', async ({ page }) => {
    tag = tempTag('S3 beer festival')
    week = weekMonday(5)
    const friday = addDays(week, 4)
    const saturday = addDays(week, 5)

    await openScheduler(page, 5)
    await page.getByTestId(`events-cell-${friday}`).click()
    await page.getByTestId('event-title').fill(tag)
    await page.getByTestId('event-all-day').check()
    await expect(page.getByTestId('event-start-time')).toHaveCount(0)
    await page.getByTestId('event-end-day').fill(saturday)
    const saved = page.waitForResponse((r) => r.url().endsWith('/api/schedule_events') && r.request().method() === 'POST')
    await page.getByTestId('event-save').click()
    expect((await saved).status()).toBe(201)

    await page.reload()
    await openScheduler(page, 5)
    for (const day of [friday, saturday]) {
      await expect(page.getByTestId(`events-cell-${day}`)).toContainText(tag)
      await expect(page.getByTestId(`events-cell-${day}`)).toContainText('All day')
    }
    await expect(page.getByTestId(`events-cell-${addDays(week, 6)}`)).not.toContainText(tag)
  })

  test('S9: a shift overlapping an event gets no conflict warning', async ({ page }) => {
    tag = tempTag('S9 overlap')
    week = weekMonday(6)
    const api = await apiAs('barMgr')
    const positions = (await (await api.get('/api/positions')).json()).data as { id: number; name: string }[]
    const shiftRes = await api.post('/api/shifts', {
      data: {
        position_id: positions.find((p) => p.name === 'Bar-close')!.id,
        starts_at: denverUtc(addDays(week, 1), '17:00'),
        ends_at: denverUtc(addDays(week, 1), '23:00'),
        notes: tag,
      },
    })
    expect(shiftRes.status()).toBe(201)
    await createEvent(api, 'bar', {
      title: tag,
      starts_at: denverUtc(addDays(week, 1), '18:00'),
      ends_at: denverUtc(addDays(week, 1), '22:00'),
    })

    await openScheduler(page, 6)
    await expect(page.getByTestId(`events-cell-${addDays(week, 1)}`)).toContainText(tag)
    await expect(page.getByText(/scheduling conflict/)).toHaveCount(0)
  })
})
