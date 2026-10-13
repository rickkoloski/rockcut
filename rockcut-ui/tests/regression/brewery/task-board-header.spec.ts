import { test, expect, type APIRequestContext } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addDays, apiAs, denverToday, denverUtc, openBoard, tempTag, userId } from './taskBoardHelpers'

// D38 §3.2, scenarios S1–S5: each day's header is read from the published
// Brewery schedule. Tests use days 9–13 from today (the second row of the
// default range), which the synthetic seed's this-week shifts never reach.

test.use({ storageState: authFile('brewer1'), viewport: { width: 1600, height: 1000 } })

let tag = ''
const shiftIds: number[] = []
const eventIds: number[] = []
const timeOffIds: number[] = []

test.afterEach(async () => {
  const mgr = await apiAs('breweryMgr')
  for (const id of shiftIds.splice(0)) await mgr.delete(`/api/shifts/${id}`)
  for (const id of eventIds.splice(0)) await mgr.delete(`/api/schedule_events/${id}`)
  const brewer2 = await apiAs('brewer2')
  for (const id of timeOffIds.splice(0)) await brewer2.post(`/api/time_off/${id}/cancel`)
})

async function brewerPositionId(api: APIRequestContext) {
  const positions = (await (await api.get('/api/positions')).json()).data as { id: number; name: string }[]
  return positions.find((p) => p.name === 'Brewer')!.id
}

async function createShift(api: APIRequestContext, assigneeId: number | null, day: string, from: string, to: string, publish: boolean) {
  const res = await api.post('/api/shifts', {
    data: { position_id: await brewerPositionId(api), assignee_id: assigneeId, starts_at: denverUtc(day, from), ends_at: denverUtc(day, to), notes: tag },
  })
  expect(res.status(), await res.text()).toBe(201)
  const id = (await res.json()).data.id as number
  shiftIds.push(id)
  if (publish) expect((await api.post(`/api/shifts/${id}/publish`)).status()).toBe(200)
  return id
}

async function createEvent(api: APIRequestContext, deptKey: string, title: string, day: string) {
  const depts = (await (await api.get('/api/departments')).json()).data as { id: number; key: string }[]
  const res = await api.post('/api/schedule_events', {
    data: {
      department_id: depts.find((d) => d.key === deptKey)!.id,
      title,
      all_day: true,
      starts_at: denverUtc(day, '00:00'),
      ends_at: denverUtc(addDays(day, 1), '00:00'),
    },
  })
  expect(res.status(), await res.text()).toBe(201)
  const id = (await res.json()).data.id as number
  eventIds.push(id)
  expect((await api.post(`/api/schedule_events/${id}/publish`)).status()).toBe(200)
  return id
}

test('S1: two rows of seven days; a published shift shows as "name · position · times · hours"', async ({ page }) => {
  tag = tempTag('S1 shift note')
  const day = addDays(denverToday(), 9)
  const brewer1Id = await userId(await apiAs('brewer1'))
  await createShift(await apiAs('breweryMgr'), brewer1Id, day, '07:00', '15:00', true)

  await openBoard(page)
  await expect(page.getByTestId('board-grid').locator('[data-testid^="day-title-"]')).toHaveCount(14)
  await expect(page.getByTestId('board-span-14')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId(`day-${denverToday()}`)).toHaveAttribute('data-today', 'true')
  // Day 7 starts the second row.
  const first = await page.getByTestId(`day-${denverToday()}`).boundingBox()
  const eighth = await page.getByTestId(`day-${addDays(denverToday(), 7)}`).boundingBox()
  expect(eighth!.y).toBeGreaterThan(first!.y + first!.height - 1)
  expect(Math.abs(eighth!.x - first!.x)).toBeLessThan(2)

  await expect(page.getByTestId(`header-person-${day}-${brewer1Id}`)).toHaveText('Jake Brewer · Brewer · 7:00a–3:00p · 8h')
  await expect(page.getByTestId(`day-header-${day}`)).not.toContainText(tag)
})

test('S1: two shifts for one person share a line with their total hours', async ({ page }) => {
  tag = tempTag('S1 two shifts')
  const day = addDays(denverToday(), 10)
  const brewer1Id = await userId(await apiAs('brewer1'))
  const mgr = await apiAs('breweryMgr')
  await createShift(mgr, brewer1Id, day, '06:00', '10:00', true)
  await createShift(mgr, brewer1Id, day, '14:00', '18:30', true)

  await openBoard(page)
  await expect(page.getByTestId(`header-person-${day}-${brewer1Id}`)).toHaveText('Jake Brewer · Brewer · 6:00a–10:00a, 2:00p–6:30p · 8.5h')
})

test('S2: a day without published Brewery shifts says "No brewers scheduled" and keeps its Daily card', async ({ page }) => {
  const day = addDays(denverToday(), 12)
  await openBoard(page)
  await expect(page.getByTestId(`header-none-${day}`)).toHaveText('No brewers scheduled')
  await expect(page.getByTestId(`daily-count-${day}`)).toHaveText(/^Daily \d+\/\d+$/)
})

test.describe('as breweryMgr', () => {
  test.use({ storageState: authFile('breweryMgr') })

  test('S3: a draft shift stays off the header, for the manager too, until it is published', async ({ page }) => {
    tag = tempTag('S3 draft')
    const day = addDays(denverToday(), 11)
    const mgr = await apiAs('breweryMgr')
    const brewer2Id = await userId(await apiAs('brewer2'))
    const shiftId = await createShift(mgr, brewer2Id, day, '08:00', '16:00', false)

    await openBoard(page)
    await expect(page.getByTestId(`day-header-${day}`)).toBeVisible()
    await expect(page.getByTestId(`header-person-${day}-${brewer2Id}`)).toHaveCount(0)

    expect((await mgr.post(`/api/shifts/${shiftId}/publish`)).status()).toBe(200)
    await page.reload()
    await expect(page.getByTestId(`header-person-${day}-${brewer2Id}`)).toHaveText('Riley Wort · Brewer · 8:00a–4:00p · 8h')
  })
})

test('S1: an open (unassigned) published Brewery shift shows as "Open"', async ({ page }) => {
  tag = tempTag('S1 open shift')
  const day = addDays(denverToday(), 13)
  const shiftId = await createShift(await apiAs('breweryMgr'), null, day, '07:00', '15:00', true)

  await openBoard(page)
  await expect(page.getByTestId(`header-open-${day}-${shiftId}`)).toHaveText('Open · Brewer · 7:00a–3:00p')
  await expect(page.getByTestId(`header-none-${day}`)).toHaveCount(0)
})

test('S4: a published all-day Brewery event shows; a Taproom event the same day does not', async ({ page }) => {
  tag = tempTag('S4')
  const day = addDays(denverToday(), 12)
  const breweryEvent = await createEvent(await apiAs('breweryMgr'), 'brewery', `${tag} GABF Awards`, day)
  const taproomEvent = await createEvent(await apiAs('barMgr'), 'bar', `${tag} Trivia`, day)

  await openBoard(page)
  await expect(page.getByTestId(`header-event-${day}-${breweryEvent}`)).toHaveText(`${tag} GABF Awards · All day`)
  await expect(page.getByTestId(`header-event-${day}-${taproomEvent}`)).toHaveCount(0)
  await expect(page.getByTestId(`day-header-${day}`)).not.toContainText('Trivia')
})

test('S5: approved time off is not shown in the header', async ({ page }) => {
  tag = tempTag('S5 time off')
  const day = addDays(denverToday(), 9)
  const brewer2 = await apiAs('brewer2')
  const res = await brewer2.post('/api/time_off', {
    data: { type: 'pto', all_day: true, starts_at: denverUtc(day, '00:00'), ends_at: denverUtc(addDays(day, 1), '00:00'), note: tag },
  })
  expect(res.status(), await res.text()).toBe(201)
  const id = (await res.json()).data.id as number
  timeOffIds.push(id)
  expect((await (await apiAs('breweryMgr')).post(`/api/time_off/${id}/review`, { data: { status: 'approved' } })).status()).toBe(200)

  await openBoard(page)
  await expect(page.getByTestId(`day-header-${day}`)).toBeVisible()
  await expect(page.getByTestId(`day-header-${day}`)).not.toContainText('Riley')
  await expect(page.getByTestId(`day-header-${day}`)).not.toContainText(tag)
})
