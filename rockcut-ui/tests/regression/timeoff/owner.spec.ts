import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { openScheduler, weekMonday } from '../scheduler/helpers'
import {
  addDays,
  apiBadge,
  cleanupTimeOff,
  freeDays,
  dialog,
  enterFor,
  findAs,
  navBadge,
  notificationsOf,
  requestOwn,
  tempTag,
} from './helpers'

// D44 spec §4, an owner: owner (Olivia Owner).

test.use({ storageState: authFile('owner') })
test.afterEach(cleanupTimeOff)

test('O1: denies a pending request from the Scheduler; the chip goes; the badge is the server’s count', async ({ page }) => {
  const day = addDays(weekMonday(1), 3)
  const r = await requestOwn('bartender2', { first: day, last: day }, tempTag('O1 deny'))
  expect(await notificationsOf('owner', 'time_off_requested', r.note!)).toHaveLength(1)

  await openScheduler(page, 1)
  // The Brewery board's specs may add brewer2 requests meanwhile, so compare
  // with what the server says now rather than a number from before.
  await expect.poll(async () => (await navBadge(page, 'Schedule')) === (await apiBadge('owner'))).toBe(true)
  const chip = page.getByTestId(`off-chip-${r.id}`)
  await chip.click()
  await page.getByTestId('time-off-deny').click()
  await expect(dialog(page)).toBeHidden()
  await expect(chip).toHaveCount(0)

  await openScheduler(page, 1)
  await expect(page.getByTestId(`off-chip-${r.id}`)).toHaveCount(0)
  expect((await findAs('owner', r.id))?.status).toBe('denied')
  expect(await notificationsOf('bartender2', 'time_off_reviewed', 'Denied by Olivia Owner')).not.toHaveLength(0)
})

test('O2: sees every department’s time off in the agenda, with Remove on approved', async ({ page }) => {
  // brewer1 has seeded time off this week and next (`[SEED]`): days clear of it.
  const bar = await enterFor('barMgr', 'bartender1', await freeDays('bartender1', 2), tempTag('O2 bar'))
  const brew = await enterFor('breweryMgr', 'brewer1', await freeDays('brewer1', 2), tempTag('O2 brewery'))

  await page.goto('/schedule')
  await expect(page.getByTestId(`agenda-time-off-${bar.id}`)).toContainText('Sam Pour')
  await expect(page.getByTestId(`agenda-time-off-${brew.id}`)).toContainText('Jake Brewer')
  await page.getByTestId(`agenda-time-off-${brew.id}`).click()
  await expect(page.getByTestId('time-off-remove')).toBeVisible()
})
