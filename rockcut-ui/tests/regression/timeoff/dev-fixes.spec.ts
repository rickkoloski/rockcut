import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { weekMonday } from '../scheduler/helpers'
import {
  addDays,
  adopt,
  apiAs,
  apiBadge,
  cleanupTimeOff,
  dialog,
  expectNavBadge,
  freeDays,
  navBadge,
  openAgenda,
  requestOwn,
  review,
  tempTag,
  today,
} from './helpers'

// D44 DEV fix cycle 1: G1 (badges catch up on navigation), G2 (long notes),
// G5 (the phone menu's dot), G7 (no overlapping time off). DEV fix cycle 2:
// N1 (a note cut at 2,000 says so), N2 (the year on next year's headings).

test.afterEach(cleanupTimeOff)

/** Click a nav item in the drawer (in-app navigation, no reload). */
const nav = (page: Page, label: string) =>
  page
    .locator('.MuiDrawer-paper')
    .first()
    .getByRole('button', { name: new RegExp(`^(\\d+ )?${label}$`) })
    .click()

/** How far the page scrolls sideways (0 when it doesn't). */
const sideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

test.describe('barMgr: G1', () => {
  test.use({ storageState: authFile('barMgr') })

  test('D1: an open page catches up on in-app navigation: the list on opening Time off, the badges at most every 30 s', async ({ page, browser }) => {
    const days = await freeDays('bartender1', 3)
    await page.clock.install()
    await page.goto('/time_off')
    const before = await apiBadge('barMgr')
    await expectNavBadge(page, 'Time off', before)
    await nav(page, 'View Schedule')
    await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible()

    const me: string[] = []
    page.on('request', (r) => {
      if (new URL(r.url()).pathname === '/api/me') me.push(r.url())
    })

    // Sam asks for the day off in his own browser.
    const note = tempTag('D1 two pages')
    const sam = await browser.newContext({ storageState: authFile('bartender1') })
    try {
      const samPage = await sam.newPage()
      await samPage.goto('/time_off')
      await samPage.getByLabel('Start').fill(days.first)
      await samPage.getByLabel('End').fill(days.last)
      await samPage.getByLabel('Note (optional)').fill(note)
      await samPage.getByRole('button', { name: 'Submit request' }).click()
      await expect(samPage.getByText('Time-off request submitted')).toBeVisible()
    } finally {
      await sam.close()
    }
    const r = await adopt('bartender1', note)
    expect(await apiBadge('barMgr')).toBe(before + 1)

    // Back to Time off within 30 s: the list is read again, the badge isn't yet.
    await nav(page, 'Time off')
    await expect(page.getByTestId(`time-off-review-${r.id}`)).toBeVisible()
    expect(await navBadge(page, 'Time off')).toBe(before)
    expect(me).toHaveLength(0)

    // 30 s on, the next navigation re-reads it once.
    await page.clock.fastForward('00:31')
    await nav(page, 'View Schedule')
    await expectNavBadge(page, 'Schedule', before + 1)
    await expectNavBadge(page, 'Time off', before + 1)
    await nav(page, 'Time off')
    await nav(page, 'View Schedule')
    await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible()
    expect(me).toHaveLength(1)
  })
})

test.describe('bartender1 at 390 px: G2, G5', () => {
  test.use({ storageState: authFile('bartender1'), viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('D2: long unbroken notes wrap: no sideways scroll on the page, in the dialog or in the bell; fields stop at 2,000', async ({ page }) => {
    const days = await freeDays('bartender1', 4)
    const long = tempTag('D2 ') + 'x'.repeat(1_950)
    const r = await requestOwn('bartender1', days, long)
    const reply = tempTag('D2 ') + 'y'.repeat(1_950)
    expect((await review('barMgr', r.id, 'denied', reply)).status()).toBe(200)

    await page.goto('/time_off')
    await expect(page.getByTestId(`time-off-reviewer-note-${r.id}`)).toBeVisible()
    expect(await sideways(page)).toBe(0)
    await expect(page.getByLabel('Note (optional)')).toHaveAttribute('maxlength', '2000')

    await page.locator('.MuiPaper-root').filter({ hasText: long.slice(0, 40) }).first().click()
    await expect(dialog(page)).toContainText('Your note')
    const paper = dialog(page).locator('.MuiDialog-paper')
    expect(await paper.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0)
    expect(await sideways(page)).toBe(0)
    await dialog(page).getByRole('button', { name: 'Close' }).click()

    await page.getByTestId('notification-bell').click()
    const popover = page.locator('.MuiPopover-paper')
    await expect(popover).toContainText('Your time off was denied')
    expect(await popover.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0)
    expect(await sideways(page)).toBe(0)
  })

  test('D3: the ☰ shows a dot while I have pending time off and the drawer is closed', async ({ page }) => {
    const dot = page.getByTestId('nav-menu-dot').locator('.MuiBadge-badge')
    await page.goto('/')
    // Nothing pending of Sam's own at the start (cleanup cancels them).
    if ((await apiBadge('bartender1')) === 0) await expect(dot).toHaveClass(/MuiBadge-invisible/)

    const r = await requestOwn('bartender1', await freeDays('bartender1', 5), tempTag('D3 dot'))
    await page.reload()
    await expect(dot).not.toHaveClass(/MuiBadge-invisible/)
    await expect(dot).toHaveText('') // a dot, no number

    await page.getByRole('button', { name: 'Open navigation' }).click()
    await expect(dot).toHaveClass(/MuiBadge-invisible/)
    await page.keyboard.press('Escape')
    await expect(dot).not.toHaveClass(/MuiBadge-invisible/)

    expect((await (await apiAs('bartender1')).post(`/api/time_off/${r.id}/cancel`)).status()).toBe(200)
    await page.reload()
    if ((await apiBadge('bartender1')) === 0) await expect(dot).toHaveClass(/MuiBadge-invisible/)
  })
})

test.describe('G7: the form shows the overlap refusal', () => {
  test.describe('own', () => {
    test.use({ storageState: authFile('bartender1') })
    test('D4: “You already have time off then.”, nothing stored', async ({ page }) => {
      const days = await freeDays('bartender1', 6)
      await requestOwn('bartender1', days, tempTag('D4 first'))
      const note = tempTag('D4 again')

      await page.goto('/time_off')
      await page.getByLabel('Start').fill(days.first)
      await page.getByLabel('End').fill(days.last)
      await page.getByLabel('Note (optional)').fill(note)
      await page.getByRole('button', { name: 'Submit request' }).click()
      await expect(page.getByRole('alert').filter({ hasText: 'You already have time off then.' })).toBeVisible()

      const list = (await (await (await apiAs('bartender1')).get('/api/time_off')).json()).data as { note: string | null }[]
      expect(list.some((x) => x.note === note)).toBe(false)
    })
  })

  test.describe('on behalf', () => {
    test.use({ storageState: authFile('barMgr') })
    test('D5: “This person already has time off then.”', async ({ page }) => {
      const days = await freeDays('bartender1', 6)
      await requestOwn('bartender1', days, tempTag('D5 Sam asked'))

      await page.goto('/time_off')
      await page.getByLabel('For').click()
      await page.getByRole('option', { name: 'Sam Pour' }).click()
      await page.getByLabel('Start').fill(days.first)
      await page.getByLabel('End').fill(days.last)
      await page.getByLabel('Note (optional)').fill(tempTag('D5 entered'))
      await page.getByRole('button', { name: 'Submit request' }).click()
      await expect(page.getByRole('alert').filter({ hasText: 'This person already has time off then.' })).toBeVisible()
    })
  })
})

test.describe('bartender1: N1', () => {
  test.use({ storageState: authFile('bartender1') })

  test('D6: pasting 2,100 characters keeps 2,000 and says the rest was cut; shorter clears it', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/time_off')
    const field = page.getByLabel('Note (optional)')
    const helper = page.locator('.MuiFormHelperText-root')

    await field.fill('a'.repeat(1_799))
    await expect(helper).toHaveCount(0)
    await field.press('a')
    await expect(helper).toHaveText('1,800 / 2,000')

    await field.fill('')
    await page.evaluate((t) => navigator.clipboard.writeText(t), 'z'.repeat(2_100))
    await field.focus()
    await page.keyboard.press('ControlOrMeta+V')
    await expect(field).toHaveValue('z'.repeat(2_000))
    await expect(helper).toHaveText('2,000 / 2,000 · the rest was cut')

    await field.press('Backspace')
    await expect(helper).toHaveText('1,999 / 2,000')
    // Typing up to the cap isn't a cut; typing past it is.
    await field.press('z')
    await expect(helper).toHaveText('2,000 / 2,000')
    await field.press('z')
    await expect(helper).toHaveText('2,000 / 2,000 · the rest was cut')
  })
})

test.describe('barMgr: N2', () => {
  test.use({ storageState: authFile('barMgr') })

  test('D7: next year’s dates carry the year: an agenda day heading and the Scheduler’s week label', async ({ page }) => {
    const year = Number(today().slice(0, 4))
    const daysTo = (key: string) => Math.round((Date.parse(`${key}T12:00:00Z`) - Date.parse(`${today()}T12:00:00Z`)) / 86_400_000)
    const days = await freeDays('bartender1', daysTo(`${year + 1}-01-05`))
    const r = await requestOwn('bartender1', days, tempTag('D7 next year'))

    await openAgenda(page, days.first, days.last)
    await expect(page.getByTestId(`agenda-time-off-${r.id}`).first()).toBeVisible()
    await expect(page.getByTestId(`agenda-day-heading-${days.first}`)).toHaveText(new RegExp(`^\\w+day, \\w{3} \\d{1,2}, ${year + 1}$`))

    // The Scheduler: the week across New Year shows both years, the next one its year.
    const newYear = `${year + 1}-01-01`
    let weeks = 0
    while (addDays(weekMonday(weeks), 6) < newYear) weeks++
    await page.goto('/scheduler')
    const label = page.getByTestId('scheduler-week-label')
    await expect(label).not.toContainText(String(year)) // this week
    for (let i = 0; i < weeks; i++) await page.getByRole('button', { name: 'Next week' }).click()
    const across = weekMonday(weeks) < newYear
    await expect(label).toHaveText(across ? new RegExp(`^Dec \\d+, ${year} – Jan \\d+, ${year + 1}$`) : new RegExp(`^Jan 1 – 7, ${year + 1}$`))
    await page.getByRole('button', { name: 'Next week' }).click()
    await expect(label).toHaveText(new RegExp(`^Jan \\d+ – \\d+, ${year + 1}$`))
  })
})
