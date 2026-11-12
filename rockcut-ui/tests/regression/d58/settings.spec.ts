import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addDays, denverToday } from '../brewery/taskBoardHelpers'
import { apiWith, contextWith, createTempPerson, retireTempPerson, signIn, type TempPerson } from '../auth/helpers'
import { pickSetting, setSetting, settingOn, settingValue } from '../settingsMenu'
import { putBoardSettings, resetBoardSettings, resetBoardSettingsAroundEach, storedBoardSettings } from '../boardSettings'

// D58 §3.1–§3.2, S1–S6: task board settings per account on the server (each
// tablet its own), the once-per-browser carry-over, and the 31-day URL clamp.
// The settings are the personas' own, so this runs in the one-worker `d58`
// project, after `brewery-board` (which changes the same personas' boards);
// every test starts and ends with the defaults.

test.use({ viewport: { width: 1600, height: 1100 } })
resetBoardSettingsAroundEach()
test.afterAll(async () => resetBoardSettings('brewer1', 'bartender1', 'taproomDevice', 'breweryDevice', 'owner', 'breweryMgr'))

const GEAR = 'board-settings'
const today = () => denverToday()
const mondayOf = (day: string) => addDays(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7))

async function openBoard(page: Page, path: string) {
  await page.goto(path)
  await expect(page.getByTestId('board-grid')).toBeVisible({ timeout: 20_000 })
}

/** The day columns showing, in order. */
async function shownDays(page: Page): Promise<string[]> {
  return page
    .getByTestId('board-grid')
    .locator('[data-testid^="day-"][data-today]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.slice('day-'.length)))
}

const settingSaved = (page: Page, board: string) =>
  page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().endsWith(`/api/me/board_settings/${board}`))

test.describe('brewer1', () => {
  test.use({ storageState: authFile('brewer1') })

  test('S1: 1 week, Hide completed, Monday and My tasks follow brewer1 to another browser', async ({ page, browser }) => {
    await openBoard(page, '/tasks/brewery')
    for (const [choice, value] of [
      ['board-span', 7],
      ['board-first-day', 'monday'],
      ['board-filter', 'mine'],
    ] as const) {
      const saved = settingSaved(page, 'brewery')
      await pickSetting(page, GEAR, choice, value)
      expect((await saved).status()).toBe(200)
    }
    const saved = settingSaved(page, 'brewery')
    await setSetting(page, GEAR, 'board-hide-completed', true)
    expect((await saved).status()).toBe(200)
    expect((await storedBoardSettings('brewer1')).brewery).toMatchObject({ span: 7, first_day: 'monday', view: 'mine', hide_completed: true })

    // Another browser: nothing local, the same settings.
    const context = await browser.newContext({ storageState: authFile('brewer1'), viewport: { width: 1600, height: 1100 } })
    try {
      const other = await context.newPage()
      await openBoard(other, '/tasks/brewery')
      expect(await settingValue(other, GEAR, 'board-span')).toBe('1 week')
      expect(await settingValue(other, GEAR, 'board-first-day')).toBe('Monday')
      expect(await settingValue(other, GEAR, 'board-filter')).toBe('My tasks')
      expect(await settingOn(other, GEAR, 'board-hide-completed')).toBe(true)
      await expect.poll(() => shownDays(other)).toEqual(Array.from({ length: 7 }, (_, i) => addDays(mondayOf(today()), i)))
    } finally {
      await context.close()
    }
  })
})

test.describe('brewer1, a save that fails', () => {
  test.use({ storageState: authFile('brewer1') })

  test('the change stays for this page, a quiet "Not saved" shows, and the server keeps what it had', async ({ page }) => {
    await page.route('**/api/me/board_settings/**', (route) => route.fulfill({ status: 500, json: { error: 'boom' } }))
    await openBoard(page, '/tasks/brewery')
    await pickSetting(page, GEAR, 'board-span', 7)
    await expect(page.getByTestId('settings-not-saved')).toContainText('Not saved')
    expect(await settingValue(page, GEAR, 'board-span')).toBe('1 week')
    await expect.poll(async () => (await shownDays(page)).length).toBe(7)
    expect((await storedBoardSettings('brewer1')).brewery?.span ?? 14).toBe(14)
  })
})

// S2: brewer1's Brewery board already has server settings after S1 (a reset
// saves the defaults), and the carry-over never runs then. So a `[TEST-TEMP]`
// Brewery person stands in: nothing on the server for their board yet.
test.describe('S2: the carry-over', () => {
  let person: TempPerson | null = null
  test.afterEach(async () => {
    await retireTempPerson(person)
    person = null
  })

  test('D45 local settings are saved once, the local keys cleared; with the server set, nothing is sent', async ({ browser }) => {
    person = await createTempPerson('D58 S2', { schedulable: false, memberships: [{ department: 'brewery', role: 'employee' }] })
    const token = await signIn(person)
    const { context, page } = await contextWith(browser, token)
    const api = await apiWith(token)
    try {
      await page.setViewportSize({ width: 1600, height: 1100 })
      await page.goto('/')
      await page.evaluate(() => {
        localStorage.setItem('rockcut.tasks.span.brewery', '7')
        localStorage.setItem('rockcut.tasks.hideShifts.brewery', 'true')
        localStorage.setItem('rockcut.tasks.firstDay.brewery', 'sunday')
        localStorage.setItem('rockcut.tasks.board', 'brewery')
      })
      const puts: string[] = []
      page.on('request', (r) => {
        if (r.method() === 'PUT' && r.url().includes('/api/me/board_settings/')) puts.push(r.url())
      })

      const saved = settingSaved(page, 'brewery')
      await openBoard(page, '/tasks/brewery')
      expect((await saved).status()).toBe(200)
      expect(await settingValue(page, GEAR, 'board-span')).toBe('1 week')
      expect(await settingValue(page, GEAR, 'board-first-day')).toBe('Sunday')
      expect(await settingOn(page, GEAR, 'board-hide-shifts')).toBe(true)
      expect((await (await api.get('/api/me')).json()).board_settings).toEqual({ brewery: { span: 7, hide_shifts: true, first_day: 'sunday' } })
      // Cleared once saved; the last board opened stays in the browser.
      expect(
        await page.evaluate(() => ['span', 'hideShifts', 'firstDay', 'board'].map((k) => localStorage.getItem(`rockcut.tasks.${k}${k === 'board' ? '' : '.brewery'}`))),
      ).toEqual([null, null, null, 'brewery'])

      // A stale local value on a board the server has: never sent.
      await page.evaluate(() => localStorage.setItem('rockcut.tasks.span.brewery', '14'))
      await openBoard(page, '/tasks/brewery')
      expect(await settingValue(page, GEAR, 'board-span')).toBe('1 week')
      expect(puts).toHaveLength(1)
    } finally {
      await api.dispose()
      await context.close()
    }
  })
})

test.describe('taproomDevice', () => {
  test.use({ storageState: authFile('taproomDevice') })

  test('S3: the tablet keeps its own View and Hide shifts; bartender1’s are unchanged', async ({ page }) => {
    const before = (await storedBoardSettings('bartender1')).bar
    await openBoard(page, '/tasks/bar')
    let saved = settingSaved(page, 'bar')
    await pickSetting(page, GEAR, 'board-filter', 'unassigned')
    expect((await saved).status()).toBe(200)
    saved = settingSaved(page, 'bar')
    await setSetting(page, GEAR, 'board-hide-shifts', true)
    expect((await saved).status()).toBe(200)
    // No staff code for the tablet's own view.
    await expect(page.getByTestId('acting-code-dialog')).toHaveCount(0)

    await page.reload()
    await expect(page.getByTestId('board-grid')).toBeVisible({ timeout: 20_000 })
    expect(await settingValue(page, GEAR, 'board-filter')).toBe('Unassigned')
    expect(await settingOn(page, GEAR, 'board-hide-shifts')).toBe(true)
    expect((await storedBoardSettings('taproomDevice')).bar).toMatchObject({ view: 'unassigned', hide_shifts: true })
    expect((await storedBoardSettings('bartender1')).bar).toEqual(before)
  })

  test('S4: settings for another board are refused (403), its home board allowed', async () => {
    expect((await putBoardSettings('taproomDevice', 'brewery', { span: 7 })).status).toBe(403)
    expect((await putBoardSettings('taproomDevice', 'all', { span: 7 })).status).toBe(403)
    expect((await putBoardSettings('breweryDevice', 'bar', { span: 7 })).status).toBe(403)
    expect((await putBoardSettings('taproomDevice', 'nope', { span: 7 })).status).toBe(404)
    expect((await putBoardSettings('taproomDevice', 'bar', { span: 30 as 7 })).status).toBe(422)
    expect(await putBoardSettings('taproomDevice', 'bar', { span: 7 })).toMatchObject({ status: 200, body: { span: 7, view: 'all' } })
    expect((await storedBoardSettings('taproomDevice')).brewery).toBeUndefined()
  })
})

test.describe('owner', () => {
  test.use({ storageState: authFile('owner') })

  test('S5: All departments keeps Unassigned and 1 week; the Brewery board keeps its own', async ({ page }) => {
    await openBoard(page, '/tasks/all')
    let saved = settingSaved(page, 'all')
    await pickSetting(page, GEAR, 'board-filter', 'unassigned')
    expect((await saved).status()).toBe(200)
    saved = settingSaved(page, 'all')
    await pickSetting(page, GEAR, 'board-span', 7)
    expect((await saved).status()).toBe(200)
    // My tasks isn't offered on All departments, and the API refuses it.
    expect((await putBoardSettings('owner', 'all', { view: 'mine' })).status).toBe(422)

    await page.reload()
    await expect(page.getByTestId('board-grid')).toBeVisible({ timeout: 20_000 })
    expect(await settingValue(page, GEAR, 'board-filter')).toBe('Unassigned')
    expect(await settingValue(page, GEAR, 'board-span')).toBe('1 week')
    await expect.poll(async () => (await shownDays(page)).length).toBe(7)

    await openBoard(page, '/tasks/brewery')
    expect(await settingValue(page, GEAR, 'board-filter')).toBe('All')
    expect(await settingValue(page, GEAR, 'board-span')).toBe('2 weeks')
  })

  test('S6 (All departments): a 40-day URL shows 31 days, says so, and the URL is corrected', async ({ page }) => {
    const from = today()
    await openBoard(page, `/tasks/all?from=${from}&to=${addDays(from, 39)}`)
    await expect(page.getByTestId('range-clamped')).toHaveText('Showing 31 days (the most a board shows)')
    await expect.poll(() => new URL(page.url()).searchParams.get('to')).toBe(addDays(from, 30))
    await expect.poll(async () => (await shownDays(page)).length).toBe(31)
  })
})

test.describe('breweryMgr', () => {
  test.use({ storageState: authFile('breweryMgr') })

  test('S6: a 40-day URL shows 31 days from its start, says so, and the URL is replaced', async ({ page }) => {
    const from = addDays(today(), -3)
    await page.goto('/')
    await expect(page.getByTestId('loading-screen')).toBeHidden({ timeout: 20_000 })
    const historyBefore = await page.evaluate(() => history.length)
    await openBoard(page, `/tasks/brewery?from=${from}&to=${addDays(from, 39)}`)
    await expect(page.getByTestId('range-clamped')).toHaveText('Showing 31 days (the most a board shows)')
    await expect.poll(() => new URL(page.url()).searchParams.get('to')).toBe(addDays(from, 30))
    expect(new URL(page.url()).searchParams.get('from')).toBe(from)
    await expect.poll(() => shownDays(page)).toEqual(Array.from({ length: 31 }, (_, i) => addDays(from, i)))
    // Replaced, not pushed: one entry for the board, as a normal visit.
    expect(await page.evaluate(() => history.length)).toBe(historyBefore + 1)

    // Next moves on from the shown range; the notice goes with it.
    await page.getByTestId('board-next').click()
    await expect(page.getByTestId('range-clamped')).toHaveCount(0)
  })

  test('S6: an invalid range (To before From) shows the default two weeks and drops it from the URL', async ({ page }) => {
    await openBoard(page, `/tasks/brewery?from=${addDays(today(), 5)}&to=${today()}`)
    await expect.poll(() => new URL(page.url()).search).toBe('')
    await expect.poll(async () => (await shownDays(page))[0]).toBe(today())
    expect((await shownDays(page)).length).toBe(14)
    await expect(page.getByTestId('range-clamped')).toHaveCount(0)
  })
})
