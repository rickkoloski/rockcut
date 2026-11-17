import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import {
  adopt,
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
  today,
} from './helpers'

// D44 spec §4, the employee: bartender1 (Sam Pour, Taproom).

test.use({ storageState: authFile('bartender1') })
test.afterEach(cleanupTimeOff)

test('E1: requests PTO; the badge goes up without a reload and stays; reviewers are told, once each', async ({ page }) => {
  const note = tempTag('E1 trip')
  const before = await apiBadge('bartender1')

  await page.goto('/time_off')
  await expectNavBadge(page, 'Time off', before)
  await page.getByLabel('Start').fill(dayFrom(2))
  await page.getByLabel('End').fill(dayFrom(3))
  await page.getByLabel('Note (optional)').fill(note)
  await page.getByRole('button', { name: 'Submit request' }).click()
  await expect(page.getByText('Time-off request submitted')).toBeVisible()
  const r = await adopt('bartender1', note)

  await expectNavBadge(page, 'Time off', before + 1)
  await expectNavBadge(page, 'Schedule', before + 1)
  await page.reload()
  await expectNavBadge(page, 'Time off', before + 1)
  await expect(page.getByText(note)).toBeVisible()

  // §2.5: both Taproom managers (barMgr, dualMgr, splitRole) and every owner;
  // not the Brewery manager, not Sam.
  for (const who of ['barMgr', 'dualMgr', 'splitRole', 'owner', 'owner2'] as const) {
    const sent = await notificationsOf(who, 'time_off_requested', note)
    expect(sent, who).toHaveLength(1)
    expect(sent[0].title).toBe('Sam Pour requested time off')
    expect(sent[0].data?.url).toBe('/time_off')
  }
  expect(await notificationsOf('breweryMgr', 'time_off_requested', note)).toHaveLength(0)
  expect(await notificationsOf('bartender1', 'time_off_requested', note)).toHaveLength(0)

  // Until it's decided: approved → the badge drops.
  expect((await review('barMgr', r.id, 'approved')).status()).toBe(200)
  await page.reload()
  await expectNavBadge(page, 'Time off', before)
})

test('E2: the form refuses a day that has passed, with the API’s words, and stores nothing', async ({ page }) => {
  const note = tempTag('E2 late')
  await page.goto('/time_off')
  await page.getByLabel('Start').fill(dayFrom(-2))
  await page.getByLabel('End').fill(dayFrom(-1))
  await page.getByLabel('Note (optional)').fill(note)
  await page.getByRole('button', { name: 'Submit request' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'This date has passed. Ask your manager to enter it for you.' })).toBeVisible()

  const list = (await (await (await apiAs('bartender1')).get('/api/time_off')).json()).data as { note: string | null }[]
  expect(list.some((r) => r.note === note)).toBe(false)
})

test('E3: My requests is current and later (ending today still shows); the Archive has last month’s, read-only', async ({ page }) => {
  const endsToday = await requestOwn('bartender1', { first: dayFrom(-1), last: today() }, tempTag('E3 today'))
  const lastMonth = await enterFor('barMgr', 'bartender1', { first: dayFrom(-35), last: dayFrom(-33) }, tempTag('E3 last month'))

  await page.goto('/time_off')
  await expect(page.getByText(endsToday.note!)).toBeVisible()
  await expect(page.getByText(lastMonth.note!)).toHaveCount(0)

  await page.getByTestId('time-off-view-archive').click()
  const row = page.getByTestId(`time-off-archive-${lastMonth.id}`)
  await expect(row).toContainText(lastMonth.note!)
  await expect(row).toContainText('Approved')
  await expect(page.getByText(endsToday.note!)).toHaveCount(0)
  await expect(row.getByRole('button')).toHaveCount(0)

  await row.click()
  await expect(dialog(page)).toContainText('Approved by Casey Tap')
  await expect(dialog(page).getByRole('button')).toHaveText(['Close'])

  const api = await apiAs('bartender1')
  const ids = async (when: string) =>
    ((await (await api.get('/api/time_off', { params: { when } })).json()).data as { id: number }[]).map((r) => r.id)
  expect(await ids('past')).toContain(lastMonth.id)
  expect(await ids('past')).not.toContain(endsToday.id)
  expect(await ids('current')).toContain(endsToday.id)
  expect(await ids('current')).not.toContain(lastMonth.id)
})

test('E4: a denied future request stays in My requests with the manager’s note; the notification carries it', async ({ page }) => {
  const r = await requestOwn('bartender1', { first: dayFrom(4), last: dayFrom(5) }, tempTag('E4 weekend'))
  const managerNote = tempTag('E4 short that weekend')
  expect((await review('barMgr', r.id, 'denied', managerNote)).status()).toBe(200)

  await page.goto('/time_off')
  const row = page.locator('.MuiPaper-root').filter({ hasText: r.note! })
  await expect(row).toContainText('Denied')
  await expect(page.getByTestId(`time-off-reviewer-note-${r.id}`)).toContainText(managerNote)

  const sent = await notificationsOf('bartender1', 'time_off_reviewed', managerNote)
  expect(sent).toHaveLength(1)
  expect(sent[0].title).toBe('Your time off was denied')
  expect(sent[0].body).toContain('Denied by Casey Tap')
  expect((await findAs('bartender1', r.id))?.status).toBe('denied')
})

test('E5: View Schedule shows my pending and approved time off on each day, not a teammate’s; mine opens read-only', async ({ page }) => {
  const pending = await requestOwn('bartender1', { first: dayFrom(2), last: dayFrom(3) }, tempTag('E5 pending'))
  const approved = await enterFor('barMgr', 'bartender1', { first: dayFrom(4), last: dayFrom(4) }, tempTag('E5 approved'))
  const mate = await requestOwn('bartender2', { first: dayFrom(2), last: dayFrom(2) }, tempTag('E5 teammate'))

  await page.goto('/schedule')
  const p = page.getByTestId(`agenda-time-off-${pending.id}`)
  await expect(p).toHaveCount(2)
  await expect(p.and(page.locator(`[data-day="${dayFrom(2)}"]`))).toContainText('Pending')
  await expect(p.and(page.locator(`[data-day="${dayFrom(3)}"]`))).toContainText('Sam Pour')
  const a = page.getByTestId(`agenda-time-off-${approved.id}`)
  await expect(a).toHaveCount(1)
  await expect(a).toContainText('All day')
  await expect(a).not.toContainText('Pending')
  await expect(page.getByTestId(`agenda-time-off-${mate.id}`)).toHaveCount(0)

  await p.first().click()
  await expect(dialog(page)).toContainText(pending.note!)
  await expect(dialog(page).getByRole('button')).toHaveText(['Close'])
  await dialog(page).getByRole('button', { name: 'Close' }).click()

  await a.click()
  await expect(dialog(page)).toContainText('Approved by Casey Tap')
  await expect(dialog(page).getByRole('button')).toHaveText(['Close'])
})
