import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addDays, apiAs, cleanupTemp, denverToday, mondayOf, openScheduler, tempTag } from './helpers'

// D32 S12 / backlog 3940 (found on DEV in D31). Add shift and Add event opened
// while viewing another week default to that week, not to today.

test.describe('dualMgr, viewing next week', () => {
  test.use({ storageState: authFile('dualMgr') })

  const monday = addDays(mondayOf(denverToday()), 7)
  const sunday = addDays(monday, 6)
  let tag = ''

  test.beforeEach(() => {
    tag = tempTag('3940')
  })

  test.afterEach(async () => {
    await cleanupTemp(await apiAs('dualMgr'), tag, monday, sunday)
  })

  test('Add shift defaults to that week and saves there', async ({ page }) => {
    await openScheduler(page, 1)
    await page.getByRole('button', { name: 'Add shift' }).click()

    await expect(page.getByLabel('Day').first()).toHaveValue(monday)

    await page.getByRole('combobox', { name: /^Position/ }).click()
    await page.getByRole('option', { name: 'Bar-open' }).click()
    await page.getByLabel('Notes').fill(tag)
    const saved = page.waitForResponse((r) => r.url().endsWith('/api/shifts') && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Save' }).click()
    expect((await saved).status()).toBe(201)

    // Persist-verify: it's in the week that was on screen.
    const api = await apiAs('dualMgr')
    const shifts = (await (await api.get('/api/shifts', { params: { from: monday, to: sunday } })).json()).data
    expect(shifts.some((s: { notes: string | null }) => s.notes === tag)).toBe(true)
  })

  test('Add event defaults to that week and saves there', async ({ page }) => {
    await openScheduler(page, 1)
    await page.getByTestId('add-event').click()

    await expect(page.getByTestId('event-start-day')).toHaveValue(monday)

    // dualMgr manages two departments, so the dialog asks which one.
    await page.getByRole('combobox', { name: /^Department/ }).click()
    await page.getByRole('option', { name: 'Taproom' }).click()
    await page.getByTestId('event-title').fill(tag)
    const saved = page.waitForResponse((r) => r.url().endsWith('/api/schedule_events') && r.request().method() === 'POST')
    await page.getByTestId('event-save').click()
    expect((await saved).status()).toBe(201)

    await page.reload()
    await openScheduler(page, 1)
    await expect(page.getByTestId(`events-cell-${monday}`).getByText(tag)).toBeVisible()
  })
})
