import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addDays, apiAs, cleanupTemp, denverUtc, openScheduler, tempTag, weekMonday } from './helpers'

// D32 S19 (§3.8): a Sunday-evening shift shows in its own week. Week queries
// used UTC midnight, so a Sunday shift after 6 pm MDT / 5 pm MST dropped out of
// the Scheduler grid entirely.

test.describe('barMgr', () => {
  test.use({ storageState: authFile('barMgr') })

  let tag = ''
  const week = weekMonday(12)
  test.afterEach(async () => {
    await cleanupTemp(await apiAs('barMgr'), tag, week, addDays(week, 13))
  })

  test('S19: a Sunday Bar-close shift 6 pm–1 am is in that Sunday’s week', async ({ page }) => {
    tag = tempTag('S19 sunday close')
    const sunday = addDays(week, 6)
    const api = await apiAs('barMgr')
    const positions = (await (await api.get('/api/positions')).json()).data as { id: number; name: string }[]
    const res = await api.post('/api/shifts', {
      data: {
        position_id: positions.find((p) => p.name === 'Bar-close')!.id,
        starts_at: denverUtc(sunday, '18:00'),
        ends_at: denverUtc(addDays(sunday, 1), '01:00'),
        notes: tag,
      },
    })
    expect(res.status()).toBe(201)
    const id = (await res.json()).data.id

    await openScheduler(page, 12)
    await expect(page.getByTestId(`shift-chip-${id}`)).toContainText('6:00 PM')

    // Not in the following week.
    await page.getByRole('button', { name: 'Next week' }).click()
    await expect(page.getByTestId(`events-cell-${addDays(week, 7)}`)).toBeVisible()
    await expect(page.getByTestId(`shift-chip-${id}`)).toHaveCount(0)
  })
})
