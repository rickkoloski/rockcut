import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addDays, openScheduler, weekMonday } from './helpers'

// D36 QA gap 1: a Sunday overnight shift runs into Monday, so the Scheduler
// must load time off through the next Monday or that conflict is never shown
// (the next week doesn't show the shift either).
test.describe('barMgr', () => {
  test.use({ storageState: authFile('barMgr') })

  test('the Scheduler loads time off through the next Monday', async ({ page }) => {
    const week = weekMonday(1)
    const seen: { from: string | null; to: string | null }[] = []
    page.on('request', (r) => {
      const u = new URL(r.url())
      if (u.pathname === '/api/time_off') seen.push({ from: u.searchParams.get('from'), to: u.searchParams.get('to') })
    })
    await openScheduler(page, 1)
    await expect.poll(() => seen.find((s) => s.from === week)?.to ?? null).toBe(addDays(week, 7))
  })
})
