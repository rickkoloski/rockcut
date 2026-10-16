import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addDays, apiAs, denverToday, denverUtc, openBoard, tempTag, userId } from './taskBoardHelpers'

// D45 §3.3, S184–S188: "Hide shifts" beside Hide completed drops the people,
// open shifts and "No one scheduled" from each day's header; events stay, and
// a day without one has no header box. Remembered per board, per browser
// (each test starts from a fresh browser, so nothing needs restoring). Days
// 11–13 from today, inside the default two weeks and past the seed's shifts.

const shiftIds: number[] = []
const eventIds: number[] = []
const EVENT_DAY = 11
const SHIFT_DAY = 12
const EMPTY_DAY = 13
const day = (n: number) => addDays(denverToday(), n)
let tag = ''
let eventId = 0
let brewer1Id = 0

test.beforeAll(async () => {
  tag = tempTag('D45 hide shifts')
  const mgr = await apiAs('breweryMgr')
  brewer1Id = await userId(await apiAs('brewer1'))
  const positions = (await (await mgr.get('/api/positions')).json()).data as { id: number; name: string }[]
  const brewer = positions.find((p) => p.name === 'Brewer')!.id
  for (const n of [EVENT_DAY, SHIFT_DAY]) {
    const res = await mgr.post('/api/shifts', {
      data: { position_id: brewer, assignee_id: brewer1Id, starts_at: denverUtc(day(n), '07:00'), ends_at: denverUtc(day(n), '15:00'), notes: tag },
    })
    expect(res.status(), await res.text()).toBe(201)
    const id = (await res.json()).data.id as number
    shiftIds.push(id)
    expect((await mgr.post(`/api/shifts/${id}/publish`)).status()).toBe(200)
  }
  eventId = await createEvent(mgr, 'brewery', tag, day(EVENT_DAY))
})

test.afterAll(async () => {
  const mgr = await apiAs('breweryMgr')
  for (const id of shiftIds.splice(0)) await mgr.delete(`/api/shifts/${id}`)
  for (const id of eventIds.splice(0)) await mgr.delete(`/api/schedule_events/${id}`)
})

async function createEvent(api: APIRequestContext, deptKey: string, title: string, on: string) {
  const depts = (await (await api.get('/api/departments')).json()).data as { id: number; key: string }[]
  const res = await api.post('/api/schedule_events', {
    data: { department_id: depts.find((d) => d.key === deptKey)!.id, title, all_day: true, starts_at: denverUtc(on, '00:00'), ends_at: denverUtc(addDays(on, 1), '00:00') },
  })
  expect(res.status(), await res.text()).toBe(201)
  const id = (await res.json()).data.id as number
  eventIds.push(id)
  expect((await api.post(`/api/schedule_events/${id}/publish`)).status()).toBe(200)
  return id
}

const toggle = (page: Page) => page.getByTestId('board-hide-shifts')

async function expectShiftsShown(page: Page) {
  await expect(page.getByTestId(`header-person-${day(SHIFT_DAY)}-${brewer1Id}`)).toBeVisible()
  await expect(page.getByTestId(`header-person-${day(EVENT_DAY)}-${brewer1Id}`)).toBeVisible()
  await expect(page.getByTestId(`header-event-${day(EVENT_DAY)}-${eventId}`)).toBeVisible()
}

async function expectShiftsHidden(page: Page) {
  // The event day keeps its event, without the person.
  await expect(page.getByTestId(`header-event-${day(EVENT_DAY)}-${eventId}`)).toBeVisible()
  await expect(page.getByTestId(`header-person-${day(EVENT_DAY)}-${brewer1Id}`)).toHaveCount(0)
  // No events: no header box at all.
  await expect(page.getByTestId(`day-header-${day(SHIFT_DAY)}`)).toHaveCount(0)
  await expect(page.getByTestId(`header-none-${day(EMPTY_DAY)}`)).toHaveCount(0)
  await expect(page.locator('[data-testid^="header-person-"], [data-testid^="header-open-"], [data-testid^="header-none-"]')).toHaveCount(0)
}

test.describe('brewer1', () => {
  test.use({ storageState: authFile('brewer1'), viewport: { width: 1600, height: 1000 } })

  test('S184: Hide shifts keeps events only; a day without one has no header', async ({ page }) => {
    await openBoard(page)
    await expect(toggle(page)).not.toBeChecked()
    await expectShiftsShown(page)
    await expect(page.getByTestId(`header-none-${day(EMPTY_DAY)}`)).toBeVisible()

    await toggle(page).check()
    await expectShiftsHidden(page)
    // Day columns, Daily cards and tasks are untouched.
    await expect(page.getByTestId(`day-${day(SHIFT_DAY)}`)).toBeVisible()

    await toggle(page).uncheck()
    await expectShiftsShown(page)
  })
})

test.describe('owner', () => {
  test.use({ storageState: authFile('owner'), viewport: { width: 1600, height: 1000 } })

  test('S185: remembered after a reload; the Taproom board has its own (off)', async ({ page }) => {
    await openBoard(page)
    await toggle(page).check()
    await page.reload()
    await expect(toggle(page)).toBeChecked()
    await expectShiftsHidden(page)

    await page.goto('/tasks/bar')
    await expect(page.getByTestId('board-grid')).toBeVisible({ timeout: 20_000 })
    await expect(toggle(page)).not.toBeChecked()
    await expect(page.locator('[data-testid^="day-header-"]').first()).toBeVisible()

    await page.goto('/tasks/brewery')
    await expect(toggle(page)).toBeChecked()
    await expectShiftsHidden(page)
  })

  test('S187: All departments has no day headers, so no Hide shifts', async ({ page }) => {
    await page.goto('/tasks/all')
    await expect(page.getByTestId('board-hide-completed')).toBeVisible({ timeout: 20_000 })
    await expect(toggle(page)).toHaveCount(0)
    await expect(page.locator('[data-testid^="day-header-"]')).toHaveCount(0)
  })
})

test.describe('S186: brewer1 at phone width', () => {
  test.use({ storageState: authFile('brewer1'), viewport: { width: 412, height: 915 } })

  test('the same switch in the phone toolbar; both phone views', async ({ page }) => {
    await page.goto('/tasks/brewery')
    await expect(toggle(page)).toBeVisible({ timeout: 20_000 })
    await toggle(page).check()
    // Every day stacked (the default).
    await expectShiftsHidden(page)

    // One day at a time, on the event day and on a day without one.
    await page.getByTestId('board-view-day').click()
    await page.goto(`/tasks/brewery?day=${day(EVENT_DAY)}`)
    await expect(page.getByTestId('board-view-day')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId(`header-event-${day(EVENT_DAY)}-${eventId}`)).toBeVisible()
    await expect(page.getByTestId(`header-person-${day(EVENT_DAY)}-${brewer1Id}`)).toHaveCount(0)
    await page.goto(`/tasks/brewery?day=${day(SHIFT_DAY)}`)
    await expect(page.getByTestId(`day-${day(SHIFT_DAY)}`)).toBeVisible()
    await expect(page.getByTestId(`day-header-${day(SHIFT_DAY)}`)).toHaveCount(0)
  })
})

test.describe('S188: taproomDevice', () => {
  test.use({ storageState: authFile('taproomDevice'), viewport: { width: 1600, height: 1000 } })

  test('remembered on the tablet; no staff code asked', async ({ page }) => {
    await page.goto('/tasks/bar')
    await expect(toggle(page)).toBeVisible({ timeout: 20_000 })
    await toggle(page).check()
    await expect(page.getByTestId('acting-code-dialog')).toHaveCount(0)
    await expect(page.locator('[data-testid^="header-person-"], [data-testid^="header-none-"]')).toHaveCount(0)
    await page.reload()
    await expect(toggle(page)).toBeChecked()
    expect(await page.evaluate(() => localStorage.getItem('rockcut.tasks.hideShifts.bar'))).toBe('true')
  })
})
