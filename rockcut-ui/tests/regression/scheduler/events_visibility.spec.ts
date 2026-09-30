import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addDays, apiAs, cleanupTemp, createEvent, denverUtc, listEvents, openScheduler, tempTag, weekMonday } from './helpers'

// D32 S4–S8: who sees and changes events. Each test uses its own week (7–10 out).

let tag = ''
let week = ''
test.afterEach(async () => {
  await cleanupTemp(await apiAs('owner'), tag, week, addDays(week, 6))
})

async function taproomEvent(status: 'draft' | 'published', day: string, notes = 'Private party, back room') {
  const api = await apiAs('barMgr')
  const { event } = await createEvent(api, 'bar', {
    title: tag,
    notes,
    starts_at: denverUtc(day, '18:00'),
    ends_at: denverUtc(day, '22:00'),
  })
  if (status === 'published') expect((await api.post(`/api/schedule_events/${event.id}/publish`)).status()).toBe(200)
  return event
}

test.describe('bartender1 (employee)', () => {
  test.use({ storageState: authFile('bartender1') })

  test('S4: sees a published event read-only, with its notes', async ({ page }) => {
    tag = tempTag('S4 party')
    week = weekMonday(7)
    const e = await taproomEvent('published', addDays(week, 2))

    await page.goto('/schedule')
    await page.getByLabel('From').fill(week)
    await page.getByLabel('To').fill(addDays(week, 6))
    const card = page.getByTestId(`agenda-event-${e.id}`)
    await expect(card).toContainText(tag)
    await expect(card).toContainText('6:00 PM')
    await expect(card.getByRole('button', { name: 'Claim' })).toHaveCount(0)

    await card.click()
    await expect(page.getByTestId('event-notes-view')).toHaveText('Private party, back room')
    await expect(page.getByTestId('event-save')).toHaveCount(0)
    await expect(page.getByTestId('event-delete')).toHaveCount(0)

    const api = await apiAs('bartender1')
    expect((await api.patch(`/api/schedule_events/${e.id}`, { data: { title: 'x' } })).status()).toBe(403)
    expect((await api.delete(`/api/schedule_events/${e.id}`)).status()).toBe(403)
  })

  test('S5: doesn’t see a draft; the API answers 404', async ({ page }) => {
    tag = tempTag('S5 draft')
    week = weekMonday(7)
    const e = await taproomEvent('draft', addDays(week, 3))

    await page.goto('/schedule')
    await page.getByLabel('From').fill(week)
    await page.getByLabel('To').fill(addDays(week, 6))
    await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible()
    await expect(page.getByTestId(`agenda-event-${e.id}`)).toHaveCount(0)
    expect((await (await apiAs('bartender1')).get(`/api/schedule_events/${e.id}`)).status()).toBe(404)
  })
})

test.describe('breweryMgr (another department’s manager)', () => {
  test.use({ storageState: authFile('breweryMgr') })

  test('S6: can’t change a taproom event but can add a Brewery one', async ({ page }) => {
    tag = tempTag('S6 taproom')
    week = weekMonday(8)
    const e = await taproomEvent('published', addDays(week, 1))

    await openScheduler(page, 8)
    await page.getByTestId(`event-chip-${e.id}`).click()
    await expect(page.getByTestId('event-notes-view')).toBeVisible()
    await expect(page.getByTestId('event-save')).toHaveCount(0)
    await page.keyboard.press('Escape')

    const api = await apiAs('breweryMgr')
    expect((await api.patch(`/api/schedule_events/${e.id}`, { data: { title: 'x' } })).status()).toBe(403)
    expect((await api.delete(`/api/schedule_events/${e.id}`)).status()).toBe(403)

    await page.getByTestId('add-event').click()
    await page.getByTestId('event-title').fill(`${tag} brewery`)
    await page.getByTestId('event-start-day').fill(addDays(week, 2))
    await page.getByTestId('event-end-day').fill(addDays(week, 2))
    const saved = page.waitForResponse((r) => r.url().endsWith('/api/schedule_events') && r.request().method() === 'POST')
    await page.getByTestId('event-save').click()
    const res = await saved
    expect(res.status()).toBe(201)
    expect((await res.json()).data.department.key).toBe('brewery')
  })
})

test.describe('dualMgr (manages Taproom and Office)', () => {
  test.use({ storageState: authFile('dualMgr') })

  test('S7: creates events in both departments; Publish week publishes both', async ({ page }) => {
    tag = tempTag('S7 dual')
    week = weekMonday(9)
    const api = await apiAs('dualMgr')
    const { event: bar } = await createEvent(api, 'bar', { title: `${tag} taproom`, starts_at: denverUtc(addDays(week, 1), '18:00'), ends_at: denverUtc(addDays(week, 1), '20:00') })
    const { event: office } = await createEvent(api, 'office', { title: `${tag} office`, starts_at: denverUtc(addDays(week, 2), '09:00'), ends_at: denverUtc(addDays(week, 2), '10:00') })

    await openScheduler(page, 9)
    const published = page.waitForResponse((r) => r.url().endsWith('/api/schedule_events/publish'))
    await page.getByRole('button', { name: /publish week/i }).click()
    await published

    const statuses = Object.fromEntries((await listEvents(api, week, addDays(week, 6))).map((e) => [e.id, e.status]))
    expect(statuses[bar.id]).toBe('published')
    expect(statuses[office.id]).toBe('published')
  })
})

test.describe('owner', () => {
  test.use({ storageState: authFile('owner') })

  test('S8: creates, edits and publishes an event in any department', async ({ page }) => {
    tag = tempTag('S8 owner')
    week = weekMonday(10)
    const api = await apiAs('owner')
    const { event } = await createEvent(api, 'sales', { title: tag, starts_at: denverUtc(addDays(week, 3), '12:00'), ends_at: denverUtc(addDays(week, 3), '13:00') })

    await openScheduler(page, 10)
    await page.getByTestId(`event-chip-${event.id}`).click()
    await page.getByTestId('event-notes').fill('Distributor lunch')
    const saved = page.waitForResponse((r) => r.request().method() === 'PATCH')
    await page.getByTestId('event-save').click()
    expect((await saved).status()).toBe(200)

    expect((await api.post(`/api/schedule_events/${event.id}/publish`)).status()).toBe(200)
    const after = (await listEvents(api, week, addDays(week, 6))).find((e) => e.id === event.id)
    expect(after?.status).toBe('published')
  })
})
