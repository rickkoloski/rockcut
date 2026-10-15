import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs, tempTag } from '../scheduler/helpers'
import { contextWith, meStatus } from '../auth/helpers'
import { claimSpare } from '../auth/spares'

// D43 §1.5–§1.8, S152–S155: nav order, the page title in the top bar, the
// phone bar, the account menu.

const PHONE = { width: 412, height: 915 }

/** Top-level nav labels, in order, from the drawer that's showing. */
async function navLabels(page: Page): Promise<string[]> {
  const drawer = page.locator('.MuiDrawer-paper:visible').last()
  await expect(drawer.locator('.MuiListItemText-primary').first()).toBeVisible()
  // A plain link is a direct child of the nav list; a section's heading is the first button in its box.
  const list = drawer.locator('.MuiList-root').first()
  return list
    .locator(':scope > .MuiListItemButton-root .MuiListItemText-primary, :scope > div > .MuiListItemButton-root .MuiListItemText-primary')
    .allInnerTexts()
}

test.describe('S152: brewer1 nav order', () => {
  test.use({ storageState: authFile('brewer1') })

  test('desktop: Home, Tasks, Schedule, …', async ({ page }) => {
    await page.goto('/')
    expect((await navLabels(page)).slice(0, 3)).toEqual(['Home', 'Tasks', 'Schedule'])
  })

  test('phone drawer: the same', async ({ page }) => {
    await page.setViewportSize(PHONE)
    await page.goto('/')
    await page.getByRole('button', { name: 'Open navigation' }).click()
    expect((await navLabels(page)).slice(0, 3)).toEqual(['Home', 'Tasks', 'Schedule'])
  })
})

test.describe('S153: owner — the title is in the top bar', () => {
  test.use({ storageState: authFile('owner') })
  let categoryId: number | null = null
  test.afterAll(async () => {
    if (categoryId) await (await apiAs('owner')).delete(`/api/ingredient_categories/${categoryId}`)
  })

  test('Brewery board: h1 in the bar with the board switcher (dot, name, ▾)', async ({ page }) => {
    await page.goto('/tasks/brewery')
    const h1 = page.locator('header h1')
    await expect(h1).toHaveCount(1)
    const switcher = h1.getByTestId('board-switcher')
    await expect(switcher).toBeVisible()
    await expect(switcher.getByTestId('board-title')).toHaveText('Brewery tasks')
    await expect(switcher.locator('svg')).toHaveCount(1) // ▾
    await expect(page.getByTestId('board-title')).toHaveCount(1)
    await expect(page.locator('.MuiBreadcrumbs-root')).toHaveCount(0)
  })

  test('Scheduler: h1 "Scheduler" in the bar, no breadcrumbs', async ({ page }) => {
    await page.goto('/scheduler')
    await expect(page.locator('header h1')).toHaveText('Scheduler')
    await expect(page.locator('main h1')).toHaveCount(0)
    await expect(page.locator('.MuiBreadcrumbs-root')).toHaveCount(0)
  })

  test('a Settings category: "‹ Settings" back link, no breadcrumbs', async ({ page }) => {
    const res = await (await apiAs('owner')).post('/api/ingredient_categories', { data: { name: tempTag('S153 category') } })
    expect(res.status(), await res.text()).toBe(201)
    categoryId = (await res.json()).data.id
    await page.goto(`/settings/categories/${categoryId}`)
    const back = page.getByTestId('page-back')
    await expect(back).toContainText('Settings')
    await expect(back).toHaveAttribute('href', '/settings')
    await expect(page.locator('.MuiBreadcrumbs-root')).toHaveCount(0)
    await back.click()
    await expect(page).toHaveURL(/\/settings$/)
  })
})

test.describe('S154: brewer1 at phone width', () => {
  test.use({ storageState: authFile('brewer1'), viewport: PHONE })

  test('the title replaces the small logo on the board and Schedule; Home keeps the logo', async ({ page }) => {
    await page.goto('/tasks/brewery')
    await expect(page.locator('header h1')).toBeVisible()
    await expect(page.locator('header .phone-logo')).toBeHidden()

    await page.goto('/schedule')
    await expect(page.locator('header h1')).toHaveText('Schedule')
    await expect(page.locator('header .phone-logo')).toBeHidden()

    await page.goto('/')
    await expect(page.locator('header .phone-logo')).toBeVisible()
    await expect(page.locator('header h1')).toHaveCount(0)
  })
})

test.describe('S155: the account menu', () => {
  test.describe('owner', () => {
    test.use({ storageState: authFile('owner') })

    test('name, email · Owner, Profile, Theme (3), Log out; Profile opens /profile', async ({ page }) => {
      await page.goto('/')
      await page.getByTestId('account-menu').click()
      const menu = page.getByRole('menu')
      await expect(menu).toContainText('Olivia Owner')
      await expect(menu).toContainText('owner@rockcut-test.com · Owner')
      await expect(menu.getByRole('menuitem')).toHaveText(['Profile', 'Light', 'Dark', 'Match this device', 'Log out'])
      await expect(menu.getByText('Theme', { exact: true })).toBeVisible()
      await page.getByTestId('profile-link').click()
      await expect(page).toHaveURL(/\/profile$/)
    })
  })

  // Log out ends the session, so it uses a spare session, not the shared owner's.
  test('Log out signs out', async ({ browser }) => {
    const token = claimSpare()
    const { context, page } = await contextWith(browser, token)
    await page.goto('/')
    await page.getByTestId('account-menu').click()
    await page.getByTestId('logout-button').click()
    await expect(page.getByTestId('login-submit')).toBeVisible()
    await expect.poll(() => meStatus(token)).toBe(401)
    await context.close()
  })
})
