import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { activeProfile } from '../../config/targets'
import { apiAs } from '../scheduler/helpers'
import { createTempPerson, retireTempPerson, type TempPerson } from '../auth/helpers'
import { contrastOf, iconButtonContrasts } from './contrast'

// D43 §1.2, S143–S149, S169: the color mode (`users.color_mode`). It follows
// the person; a shared tablet has its own, kept during "Sign in as me". Every
// test puts brewer1 and the Brewhouse tablet back to Light.

const LIGHT_BG = 'rgb(238, 242, 232)' // Hop Field background.default
const DARK_BG = 'rgb(21, 25, 21)' // Hop Field Night background.default

test.describe.configure({ mode: 'serial', timeout: 60_000 })

const bodyBg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
const navLogo = (page: Page) => page.locator('img[alt="Rockcut Brewing Co"]').first()

async function setPersonMode(mode: string) {
  const res = await (await apiAs('brewer1')).put('/api/me/color_mode', { data: { color_mode: mode } })
  expect(res.status()).toBe(200)
}

async function breweryDeviceId(): Promise<number> {
  return (await (await (await apiAs('breweryDevice')).get('/api/me')).json()).user.id
}

async function setDeviceMode(mode: string) {
  const res = await (await apiAs('owner')).patch(`/api/devices/${await breweryDeviceId()}`, { data: { color_mode: mode } })
  expect(res.status()).toBe(200)
}

test.afterAll(async () => {
  await setPersonMode('light')
  await setDeviceMode('light')
})

test.describe('brewer1', () => {
  test.use({ storageState: authFile('brewer1') })
  test.beforeEach(() => setPersonMode('light'))

  test('S143: Light by default; nothing asks to choose', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('account-menu')).toBeVisible()
    expect(await bodyBg(page)).toBe(LIGHT_BG)
    await expect(navLogo(page)).toHaveAttribute('src', '/rockcut-logo.png')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('S144: account menu → Dark changes in place; ✓ on Dark. S145: another browser is dark too', async ({ page, browser }) => {
    await page.goto('/')
    await expect(page.getByTestId('account-menu')).toBeVisible()
    // No reload: a marker on window survives the change.
    await page.evaluate(() => ((window as unknown as { d43: number }).d43 = 1))
    const saved = page.waitForResponse((r) => r.url().endsWith('/api/me/color_mode') && r.request().method() === 'PUT')
    await page.getByTestId('account-menu').click()
    await page.getByTestId('theme-dark').click()
    expect((await saved).status()).toBe(200)
    await expect.poll(() => bodyBg(page)).toBe(DARK_BG)
    expect(await page.evaluate(() => (window as unknown as { d43?: number }).d43)).toBe(1)
    await expect(navLogo(page)).toHaveAttribute('src', '/rockcut-logo-light.png')
    await page.getByTestId('account-menu').click()
    await expect(page.getByTestId('theme-dark')).toHaveClass(/Mui-selected/)
    await expect(page.getByTestId('theme-light')).not.toHaveClass(/Mui-selected/)
    await page.keyboard.press('Escape')

    // S145: a fresh browser (nothing cached) for the same person.
    const other = await browser.newContext({ storageState: authFile('brewer1') })
    const p2 = await other.newPage()
    await p2.goto('/')
    await expect(p2.getByTestId('account-menu')).toBeVisible()
    await expect.poll(() => bodyBg(p2)).toBe(DARK_BG)
    await other.close()
  })

  test('S146: Match this device follows the browser, live', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    await page.getByTestId('account-menu').click()
    await page.getByTestId('theme-device').click()
    await expect.poll(() => bodyBg(page)).toBe(LIGHT_BG)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(() => bodyBg(page)).toBe(DARK_BG)
    await page.emulateMedia({ colorScheme: 'light' })
    await expect.poll(() => bodyBg(page)).toBe(LIGHT_BG)
  })

  test('a refused save puts the theme back and says so', async ({ page }) => {
    await page.goto('/')
    await page.route('**/api/me/color_mode', (route) => route.fulfill({ status: 500, body: '{}' }))
    await page.getByTestId('account-menu').click()
    await page.getByTestId('theme-dark').click()
    await expect(page.getByText('Couldn’t save your theme. Try again.')).toBeVisible()
    await expect.poll(() => bodyBg(page)).toBe(LIGHT_BG)
  })

  test('a save that never answers gives up, puts the theme back and says so', async ({ page }) => {
    await page.goto('/')
    await page.route('**/api/me/color_mode', () => {}) // held: no answer
    await page.getByTestId('account-menu').click()
    await page.getByTestId('theme-dark').click()
    await expect.poll(() => bodyBg(page)).toBe(DARK_BG)
    await expect(page.getByText('Couldn’t save your theme. Try again.')).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => bodyBg(page)).toBe(LIGHT_BG)
  })

  // DEV QA G5: offline is a network error, not an HTTP answer; the same must happen.
  test('a save that fails offline puts the theme back and says so', async ({ page, context }) => {
    await page.goto('/')
    await expect(page.getByTestId('account-menu')).toBeVisible()
    await context.setOffline(true)
    await page.getByTestId('account-menu').click()
    await page.getByTestId('theme-dark').click()
    // As QA did: Escape and a click elsewhere don't dismiss the message before it can be read.
    await page.waitForTimeout(800)
    await page.keyboard.press('Escape')
    await page.mouse.click(5, 400)
    await expect(page.getByText('Couldn’t save your theme. Try again.')).toBeVisible()
    await expect.poll(() => bodyBg(page)).toBe(LIGHT_BG)
    await page.getByTestId('account-menu').click()
    await expect(page.getByTestId('theme-light')).toHaveClass(/Mui-selected/)
    await page.keyboard.press('Escape')
    await context.setOffline(false)
    expect((await (await (await apiAs('brewer1')).get('/api/me')).json()).color_mode).toBe('light')
  })
})

// DEV QA G1, G2: dark mode used light defaults for text.disabled and action.active
// (black timestamps and icon buttons on the dark page). Icons need 3:1, text 4.5:1.
test.describe('owner in Dark', () => {
  test.use({ storageState: authFile('owner') })
  const setOwnerMode = async (mode: string) =>
    expect((await (await apiAs('owner')).put('/api/me/color_mode', { data: { color_mode: mode } })).status()).toBe(200)
  test.beforeAll(() => setOwnerMode('dark'))
  test.afterAll(() => setOwnerMode('light'))

  const lowIcons = async (page: Page) => (await iconButtonContrasts(page.locator('body'))).filter((b) => b.ratio < 3)

  test('G1: the bell popover: timestamps and ⚙ readable', async ({ page }) => {
    await page.goto('/')
    await expect.poll(() => bodyBg(page)).toBe(DARK_BG)
    await page.getByTestId('notification-bell').click()
    const prefs = page.getByTestId('notification-preferences')
    await expect(prefs).toBeVisible()
    expect(await contrastOf(prefs)).toBeGreaterThanOrEqual(3)
    const stamps = page.locator('.MuiPopover-paper .MuiTypography-caption')
    expect(await stamps.count(), 'owner has notifications to show').toBeGreaterThan(0)
    expect(await contrastOf(stamps.first())).toBeGreaterThanOrEqual(4.5)
  })

  for (const path of ['/tasks/brewery', '/scheduler', '/profile']) {
    test(`G2: icon buttons on ${path} stand out from the page`, async ({ page }) => {
      await page.goto(path)
      await expect.poll(() => bodyBg(page)).toBe(DARK_BG)
      await expect(page.locator('header h1')).toBeVisible()
      await expect(page.locator('button.MuiIconButton-root:visible').first()).toBeVisible()
      if (path === '/tasks/brewery') await expect(page.getByTestId('board-prev')).toBeVisible()
      if (path === '/scheduler') await expect(page.getByRole('button', { name: 'Previous week' })).toBeVisible()
      expect(await lowIcons(page)).toEqual([])
    })
  }

  test('G2: the sign-in page eye icon (Dark on this device)', async ({ browser }) => {
    const origin = new URL(activeProfile().uiUrl).origin
    const ctx = await browser.newContext({
      colorScheme: 'dark',
      storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: 'rockcut_color_mode', value: 'device' }] }] },
    })
    const page = await ctx.newPage()
    await page.goto('/')
    await expect.poll(() => bodyBg(page)).toBe(DARK_BG)
    await expect(page.getByTestId('login-submit')).toBeVisible()
    expect(await lowIcons(page)).toEqual([])
    await ctx.close()
  })
})

test.describe('the Brewhouse tablet', () => {
  test('S147: breweryMgr sets Dark on Shared devices; breweryDevice loads dark', async ({ browser }) => {
    await setDeviceMode('light')
    const id = await breweryDeviceId()
    const mgr = await browser.newContext({ storageState: authFile('breweryMgr') })
    const page = await mgr.newPage()
    await page.goto('/devices')
    const row = page.getByTestId(`device-row-${id}`)
    const saved = page.waitForResponse((r) => r.url().endsWith(`/api/devices/${id}`) && r.request().method() === 'PATCH')
    await row.getByRole('combobox').click()
    await page.getByRole('option', { name: 'Dark' }).click()
    expect((await saved).status()).toBe(200)
    await expect(row.getByRole('combobox')).toHaveText('Dark')
    await mgr.close()

    const tablet = await browser.newContext({ storageState: authFile('breweryDevice') })
    const tp = await tablet.newPage()
    await tp.goto('/')
    await expect(tp.getByTestId('device-chip')).toBeVisible()
    await expect.poll(() => bodyBg(tp)).toBe(DARK_BG)
    await tablet.close()
  })

  test.describe('S148: Sign in as me keeps the tablet dark', () => {
    test.use({ storageState: authFile('breweryDevice') })
    let person: TempPerson | null = null
    test.afterAll(() => retireTempPerson(person))

    test('a Light person signs in; the tablet stays dark with a visible Sign out', async ({ page }) => {
      await setDeviceMode('dark')
      person = await createTempPerson('D43 S148', { memberships: [{ department: 'brewery', role: 'employee' }] })
      await page.goto('/')
      await expect(page.getByTestId('device-chip')).toBeVisible()
      await expect.poll(() => bodyBg(page)).toBe(DARK_BG)

      await page.getByTestId('personal-signin').click()
      await expect(page.getByTestId('login-email')).toBeVisible()
      expect(await bodyBg(page)).toBe(DARK_BG)
      await page.getByTestId('login-email').locator('input').fill(person.email)
      await page.getByTestId('login-password').locator('input').fill(person.password)
      await page.getByTestId('login-submit').click()
      await expect(page.getByTestId('personal-session-banner')).toContainText(person.name)

      expect(await bodyBg(page)).toBe(DARK_BG)
      await expect(page.getByText(person.email)).toBeVisible()
      await expect(page.getByTestId('logout-button')).toBeVisible()
      await expect(page.getByTestId('logout-button')).toHaveText(/Sign out/)
      await expect(page.getByTestId('account-menu')).toHaveCount(0)

      await page.getByTestId('logout-button').click()
      await expect(page.getByTestId('device-chip')).toBeVisible()
    })
  })
})

test.describe('S149: bartender1', () => {
  test.use({ storageState: authFile('bartender1') })

  test('no Shared devices page; PATCH of a device theme is 403', async ({ page }) => {
    await page.goto('/devices')
    await expect(page).toHaveURL(/\/$/)
    const res = await (await apiAs('bartender1')).patch(`/api/devices/${await breweryDeviceId()}`, { data: { color_mode: 'dark' } })
    expect(res.status()).toBe(403)
  })
})

test.describe('S169: the sign-in page', () => {
  test('Match this device in a dark browser: green logo on the dark page', async ({ browser }) => {
    const origin = new URL(activeProfile().uiUrl).origin
    const context = await browser.newContext({
      colorScheme: 'dark',
      storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: 'rockcut_color_mode', value: 'device' }] }] },
    })
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.getByTestId('login-submit')).toBeVisible()
    await expect.poll(() => bodyBg(page)).toBe(DARK_BG)
    await expect(page.locator('img[alt="Rockcut Brewing Co"]').first()).toHaveAttribute('src', '/rockcut-logo-light.png')
    await context.close()
  })
})
