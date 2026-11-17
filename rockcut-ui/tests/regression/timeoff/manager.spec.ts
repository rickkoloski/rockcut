import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { pickSetting } from '../settingsMenu'
import { openScheduler, weekMonday } from '../scheduler/helpers'
import {
  adopt,
  addDays,
  apiAs,
  apiBadge,
  cleanupTimeOff,
  dayFrom,
  dialog,
  enterFor,
  expectNavBadge,
  findAs,
  notificationsOf,
  requestOwn,
  review,
  tempTag,
} from './helpers'

// D44 spec §4, the Taproom manager: barMgr (Casey Tap).

test.use({ storageState: authFile('barMgr') })
test.afterEach(cleanupTimeOff)

test('M1: approves from the Scheduler with a note; chip and badges update without a reload; Sam is told', async ({ page }) => {
  const day = addDays(weekMonday(1), 2)
  const r = await requestOwn('bartender1', { first: day, last: day }, tempTag('M1 grid'))
  const note = tempTag('M1 enjoy')
  const before = await apiBadge('barMgr')

  await openScheduler(page, 1)
  await expectNavBadge(page, 'Schedule', before)
  const chip = page.getByTestId(`off-chip-${r.id}`)
  await expect(chip).toHaveText('Off (pending)')
  await chip.click()
  // The chip opens its own dialog, not the cell's new shift dialog.
  await expect(dialog(page)).toContainText(r.note!)
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await page.getByTestId('time-off-review-note').fill(note)
  await page.getByTestId('time-off-approve').click()
  await expect(dialog(page)).toBeHidden()

  await expect(chip).toHaveText('Off')
  await expectNavBadge(page, 'Schedule', before - 1)
  await expectNavBadge(page, 'Time off', before - 1)

  await openScheduler(page, 1)
  await expect(page.getByTestId(`off-chip-${r.id}`)).toHaveText('Off')
  const saved = await findAs('barMgr', r.id)
  expect(saved?.status).toBe('approved')
  expect(saved?.reviewer_note).toBe(note)

  const sent = await notificationsOf('bartender1', 'time_off_reviewed', note)
  expect(sent).toHaveLength(1)
  expect(sent[0].title).toBe('Your time off was approved')
  expect(sent[0].body).toContain('Approved by Casey Tap')
})

test('M2: denies from the Time off page with a note; Sam sees it on his request', async ({ page, browser }) => {
  const r = await requestOwn('bartender1', { first: dayFrom(3), last: dayFrom(3) }, tempTag('M2 page'))
  const note = tempTag('M2 short-staffed')

  await page.goto('/time_off')
  await page.getByTestId(`time-off-review-${r.id}`).click()
  await page.getByTestId('time-off-review-note').fill(note)
  await page.getByTestId('time-off-deny').click()
  await expect(dialog(page)).toBeHidden()
  await expect(page.getByTestId(`time-off-review-${r.id}`)).toHaveCount(0)
  await page.reload()
  await expect(page.getByText(r.note!)).toHaveCount(0) // denied: not in Pending or Approved

  const sam = await browser.newContext({ storageState: authFile('bartender1') })
  try {
    const samPage = await sam.newPage()
    await samPage.goto('/time_off')
    await expect(samPage.getByTestId(`time-off-reviewer-note-${r.id}`)).toContainText(note)
  } finally {
    await sam.close()
  }
})

test('M3: removes approved time off from View Schedule after the confirm step; Sam is told; gone after a reload', async ({ page }) => {
  const r = await enterFor('barMgr', 'bartender1', { first: dayFrom(2), last: dayFrom(2) }, tempTag('M3 remove'))
  const note = tempTag('M3 needed after all')

  await page.goto('/schedule')
  const row = page.getByTestId(`agenda-time-off-${r.id}`)
  await row.click()
  await expect(dialog(page)).toContainText('Approved by Casey Tap')
  await page.getByTestId('time-off-remove').click()
  const confirm = page.getByTestId('time-off-remove-confirm')
  await expect(confirm).toContainText('Remove approved time off?')
  await confirm.getByTestId('time-off-review-note').fill(note)
  await confirm.getByRole('button', { name: 'Remove' }).click()
  await expect(confirm).toBeHidden()
  await expect(row).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible()
  await expect(page.getByTestId(`agenda-time-off-${r.id}`)).toHaveCount(0)
  expect((await findAs('barMgr', r.id))?.status).toBe('denied')

  const sent = await notificationsOf('bartender1', 'time_off_reviewed', note)
  expect(sent).toHaveLength(1)
  expect(sent[0].title).toBe('Your time off was denied')
})

test('M4: approves a pending request from the agenda', async ({ page }) => {
  const r = await requestOwn('bartender1', { first: dayFrom(1), last: dayFrom(1), from: '14:00', to: '17:00' }, tempTag('M4 agenda'))

  await page.goto('/schedule')
  const row = page.getByTestId(`agenda-time-off-${r.id}`)
  await expect(row).toContainText('Pending')
  await expect(row).toContainText('2:00 PM–5:00 PM')
  await row.click()
  await page.getByTestId('time-off-approve').click()
  await expect(dialog(page)).toBeHidden()
  await expect(row).not.toContainText('Pending')

  await page.reload()
  await expect(page.getByTestId(`agenda-time-off-${r.id}`)).not.toContainText('Pending')
  expect((await findAs('barMgr', r.id))?.status).toBe('approved')
})

test('M5: my own request reaches the other reviewers, not me; approving it myself sends no decision', async ({ page }) => {
  const r = await requestOwn('barMgr', { first: dayFrom(5), last: dayFrom(5) }, tempTag('M5 own'))

  for (const who of ['dualMgr', 'splitRole', 'owner', 'owner2'] as const) {
    expect(await notificationsOf(who, 'time_off_requested', r.note!), who).toHaveLength(1)
  }
  expect(await notificationsOf('barMgr', 'time_off_requested', r.note!)).toHaveLength(0)
  expect(await notificationsOf('breweryMgr', 'time_off_requested', r.note!)).toHaveLength(0)
  const decided = (await notificationsOf('barMgr', 'time_off_reviewed', '')).length

  await page.goto('/time_off')
  await page.locator('.MuiPaper-root').filter({ hasText: r.note! }).getByRole('button', { name: 'Review' }).click()
  await page.getByTestId('time-off-approve').click()
  await expect(dialog(page)).toBeHidden()
  await expect(page.locator('.MuiPaper-root').filter({ hasText: r.note! })).toContainText('Approved')

  expect((await findAs('barMgr', r.id))?.status).toBe('approved')
  expect(await notificationsOf('barMgr', 'time_off_reviewed', '')).toHaveLength(decided)
})

test('M6: time off entered for Sam with the form is approved and notifies no one', async ({ page }) => {
  const note = tempTag('M6 on behalf')
  const decided = (await notificationsOf('bartender1', 'time_off_reviewed', '')).length

  await page.goto('/time_off')
  await page.getByLabel('For').click()
  await page.getByRole('option', { name: 'Sam Pour' }).click()
  await page.getByLabel('Start').fill(dayFrom(6))
  await page.getByLabel('End').fill(dayFrom(6))
  await page.getByLabel('Note (optional)').fill(note)
  await page.getByRole('button', { name: 'Submit request' }).click()
  await expect(page.getByText('Time off added for Sam Pour')).toBeVisible()

  const r = await adopt('bartender1', note)
  expect(r.status).toBe('approved')
  for (const who of ['barMgr', 'dualMgr', 'owner'] as const) {
    expect(await notificationsOf(who, 'time_off_requested', note), who).toHaveLength(0)
  }
  expect(await notificationsOf('bartender1', 'time_off_reviewed', '')).toHaveLength(decided)
})

test('M7: the Archive has my department’s past time off, not the Brewery’s; read-only; the API refuses a review (422)', async ({ page }) => {
  const bar = await enterFor('barMgr', 'bartender1', { first: dayFrom(-10), last: dayFrom(-9) }, tempTag('M7 bar past'))
  const brew = await enterFor('breweryMgr', 'brewer1', { first: dayFrom(-10), last: dayFrom(-9) }, tempTag('M7 brewery past'))

  await page.goto('/time_off')
  await expect(page.getByText(bar.note!)).toHaveCount(0)
  await page.getByTestId('time-off-view-archive').click()
  const row = page.getByTestId(`time-off-archive-${bar.id}`)
  await expect(row).toContainText('Sam Pour')
  await expect(page.getByTestId(`time-off-archive-${brew.id}`)).toHaveCount(0)
  await row.click()
  await expect(dialog(page)).toContainText('Approved')
  await expect(dialog(page).getByRole('button')).toHaveText(['Close'])

  const res = await review('barMgr', bar.id, 'denied')
  expect(res.status()).toBe(422)
  expect((await res.json()).error).toBe('This time off has already passed')
  expect((await (await apiAs('bartender1')).post(`/api/time_off/${bar.id}/cancel`)).status()).toBe(422)
})

test('M8: a past request nobody reviewed reads “Not reviewed”, with no buttons', async ({ page }) => {
  // A past pending request can't be made through the API (own past requests
  // are refused, on-behalf ones are created approved), so the Archive's reply
  // shows a real past request as pending. The API side is in ExUnit
  // (time_off_d44_test.exs: review/cancel of a past request → 422).
  const r = await enterFor('barMgr', 'bartender1', { first: dayFrom(-6), last: dayFrom(-5) }, tempTag('M8 not reviewed'))
  await page.route(
    (url) => url.pathname === '/api/time_off' && url.searchParams.get('when') === 'past',
    async (route) => {
      const res = await route.fetch()
      const json = await res.json()
      for (const x of json.data) if (x.id === r.id) Object.assign(x, { status: 'pending', reviewed_by: null, reviewed_by_id: null, reviewed_at: null })
      await route.fulfill({ response: res, json })
    },
  )

  await page.goto('/time_off')
  await page.getByTestId('time-off-view-archive').click()
  const row = page.getByTestId(`time-off-archive-${r.id}`)
  await expect(row.getByTestId('time-off-status')).toHaveText('Not reviewed')
  await row.click()
  await expect(dialog(page).getByTestId('time-off-status')).toHaveText('Not reviewed')
  await expect(dialog(page).getByRole('button')).toHaveText(['Close'])
  await expect(page.getByTestId('time-off-review-note')).toHaveCount(0)
})

test('M9: in the agenda, the Brewery filter hides Sam’s time off, Taproom shows it, a position filter hides it', async ({ page }) => {
  const r = await requestOwn('bartender1', { first: dayFrom(1), last: dayFrom(1) }, tempTag('M9 filters'))
  const api = await apiAs('barMgr')
  const depts = (await (await api.get('/api/departments')).json()).data as { id: number; key: string }[]
  const positions = (await (await api.get('/api/positions')).json()).data as { id: number }[]
  const id = (key: string) => depts.find((d) => d.key === key)!.id

  await page.goto('/schedule')
  const row = page.getByTestId(`agenda-time-off-${r.id}`)
  await expect(row).toBeVisible()
  await pickSetting(page, 'schedule-settings', 'schedule-department', id('brewery'))
  await expect(row).toHaveCount(0)
  await pickSetting(page, 'schedule-settings', 'schedule-department', id('bar'))
  await expect(row).toBeVisible()
  await pickSetting(page, 'schedule-settings', 'schedule-position', positions[0].id)
  await expect(row).toHaveCount(0)
})

// Lead decisions 1, item 1: a dialog opened before someone else acted.
test('M10: approved elsewhere while my dialog was open: Deny gets the 409, the dialog shows Approved', async ({ page }) => {
  const r = await requestOwn('bartender1', { first: dayFrom(4), last: dayFrom(4) }, tempTag('M10 stale'))

  await page.goto('/time_off')
  await page.getByTestId(`time-off-review-${r.id}`).click()
  await expect(dialog(page).getByTestId('time-off-status')).toHaveText('Pending')
  expect((await review('dualMgr', r.id, 'approved')).status()).toBe(200)

  const late = tempTag('M10 too late')
  await page.getByTestId('time-off-review-note').fill(late)
  await page.getByTestId('time-off-deny').click()
  await expect(dialog(page).getByRole('alert')).toHaveText('This request has changed since you opened it.')
  await expect(dialog(page).getByTestId('time-off-status')).toHaveText('Approved')
  await expect(dialog(page)).toContainText('Approved by Dana Dual')
  await expect(page.getByTestId('time-off-deny')).toHaveCount(0)
  await expect(page.getByTestId('time-off-approve')).toHaveCount(0)
  await expect(page.getByTestId('time-off-remove')).toBeVisible()

  // The page behind refetched: no Review button for it any more.
  await dialog(page).getByRole('button', { name: 'Close' }).click()
  await expect(page.getByTestId(`time-off-review-${r.id}`)).toHaveCount(0)

  const saved = await findAs('barMgr', r.id)
  expect(saved?.status).toBe('approved')
  expect(saved?.reviewer_note).toBeNull()
  expect(await notificationsOf('bartender1', 'time_off_reviewed', late)).toHaveLength(0)
})

test('M11: cancelled by Sam while my dialog was open: Approve gets the 409, only Close is left', async ({ page }) => {
  const r = await requestOwn('bartender1', { first: dayFrom(5), last: dayFrom(5) }, tempTag('M11 cancelled'))

  await page.goto('/time_off')
  await page.getByTestId(`time-off-review-${r.id}`).click()
  expect((await (await apiAs('bartender1')).post(`/api/time_off/${r.id}/cancel`)).status()).toBe(200)

  await page.getByTestId('time-off-approve').click()
  await expect(dialog(page).getByRole('alert')).toHaveText('This request has changed since you opened it.')
  await expect(dialog(page).getByTestId('time-off-status')).toHaveText('Cancelled')
  await expect(dialog(page).getByRole('button')).toHaveText(['Close'])
  await expect(page.getByTestId('time-off-review-note')).toHaveCount(0)
  expect((await findAs('barMgr', r.id))?.status).toBe('cancelled')
})
