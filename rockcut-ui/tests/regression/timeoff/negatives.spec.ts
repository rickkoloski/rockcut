import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { openScheduler, weekMonday } from '../scheduler/helpers'
import {
  addDays,
  apiAs,
  cleanupTimeOff,
  freeDays,
  enterFor,
  navBadge,
  notificationsOf,
  openAgenda,
  requestOwn,
  review,
  tempTag,
} from './helpers'

// D44 spec §4: who doesn't see time off or can't act on it.

test.afterEach(cleanupTimeOff)

test.describe('breweryMgr (another department’s manager)', () => {
  test.use({ storageState: authFile('breweryMgr') })

  test('N1: isn’t told of a bartender’s request, doesn’t see it, and can’t review it (403)', async ({ page }) => {
    const day = addDays(weekMonday(1), 1)
    const r = await requestOwn('bartender1', { first: day, last: day }, tempTag('N1 bar'))
    expect(await notificationsOf('barMgr', 'time_off_requested', r.note!)).toHaveLength(1)
    expect(await notificationsOf('breweryMgr', 'time_off_requested', r.note!)).toHaveLength(0)

    await openScheduler(page, 1)
    await expect(page.getByTestId('events-row')).toBeVisible()
    await expect(page.getByTestId(`off-chip-${r.id}`)).toHaveCount(0)
    await openAgenda(page, weekMonday(1), addDays(weekMonday(1), 6))
    await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible()
    await expect(page.getByTestId(`agenda-time-off-${r.id}`)).toHaveCount(0)

    expect((await review('breweryMgr', r.id, 'approved')).status()).toBe(403)
  })
})

test.describe('taproomDevice (shared tablet)', () => {
  test.use({ storageState: authFile('taproomDevice') })

  test('N2: the agenda shows no time off, there’s no Time off page or badge, and the API refuses (403)', async ({ page }) => {
    const r = await enterFor('barMgr', 'bartender1', await freeDays('bartender1', 1), tempTag('N2 tablet'))
    await requestOwn('bartender2', await freeDays('bartender2', 1), tempTag('N2 pending'))

    const timeOffCalls: string[] = []
    page.on('request', (req) => {
      if (new URL(req.url()).pathname === '/api/time_off') timeOffCalls.push(req.url())
    })
    await page.goto('/schedule')
    await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible()
    await expect(page.getByTestId('schedule-today')).toBeVisible()
    await expect(page.getByTestId(`agenda-time-off-${r.id}`)).toHaveCount(0)
    await expect(page.locator('[data-testid^="agenda-time-off-"]')).toHaveCount(0)
    expect(await navBadge(page, 'Schedule')).toBe(0)
    await expect(page.locator('.MuiDrawer-paper').first().getByRole('button', { name: /Time off/ })).toHaveCount(0)
    expect(timeOffCalls).toEqual([])
    // DEV fix cycle 1, G5: no dot on the ☰ on a shared tablet.
    const dot = page.getByTestId('nav-menu-dot').locator('.MuiBadge-badge')
    for (const d of await dot.all()) await expect(d).toHaveClass(/MuiBadge-invisible/)

    const api = await apiAs('taproomDevice')
    expect((await api.get('/api/time_off')).status()).toBe(403)
    const me = await (await api.get('/api/me')).json()
    expect(me.capabilities.pending_time_off).toBe(0)
  })
})
