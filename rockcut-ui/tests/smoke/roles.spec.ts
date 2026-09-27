import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../config/test-env'
import { activeProfile } from '../config/targets'

// One smoke check per role (D30): the nav each role sees. Uses minted-token
// storageState — no UI login.

// The permanent sidebar (the Home page repeats some labels as quick-link cards).
const nav = (page: Page) => page.locator('.MuiDrawer-docked')

async function open(page: Page) {
  await page.goto('/')
  await expect(page.getByText('View Schedule').first()).toBeVisible()
}

test.describe('owner', () => {
  test.use({ storageState: authFile('owner') })
  test('sees Admin, Scheduler and every department', async ({ page }) => {
    await open(page)
    await expect(nav(page).getByText('Admin', { exact: true })).toBeVisible()
    await expect(nav(page).getByText('Scheduler', { exact: true })).toBeVisible()
    for (const dept of ['Bar', 'Brewery', 'Office', 'Sales']) {
      await expect(nav(page).getByText(dept, { exact: true }).first()).toBeVisible()
    }
  })
})

test.describe('manager (barMgr)', () => {
  test.use({ storageState: authFile('barMgr') })
  test('sees Scheduler and Admin, not Brewery', async ({ page }) => {
    await open(page)
    await expect(nav(page).getByText('Scheduler', { exact: true })).toBeVisible()
    await expect(nav(page).getByText('Admin', { exact: true })).toBeVisible()
    await expect(nav(page).getByText('Brewery', { exact: true })).toHaveCount(0)
  })
})

test.describe('employee (bartender1)', () => {
  test.use({ storageState: authFile('bartender1') })
  test('sees the schedule but no Scheduler or Admin', async ({ page }) => {
    await open(page)
    await expect(nav(page).getByText('Scheduler', { exact: true })).toHaveCount(0)
    await expect(nav(page).getByText('Admin', { exact: true })).toHaveCount(0)
  })
})

test.describe('brewery employee (brewer1)', () => {
  test.use({ storageState: authFile('brewer1') })
  test('sees the Brewery section', async ({ page }) => {
    await open(page)
    await expect(nav(page).getByText('Brewery', { exact: true }).first()).toBeVisible()
  })
})

test.describe('no department (noDept)', () => {
  test.use({ storageState: authFile('noDept') })
  test('gets only the baseline', async ({ page }) => {
    await open(page)
    for (const hidden of ['Scheduler', 'Admin', 'Brewery', 'Bar']) {
      await expect(nav(page).getByText(hidden, { exact: true })).toHaveCount(0)
    }
  })
})

test.describe('environment banner', () => {
  test.use({ storageState: authFile('owner') })
  test('DEV shows the banner', async ({ page }) => {
    test.skip(activeProfile().name !== 'dev', 'banner is built only into the DEV UI')
    await page.goto('/')
    await expect(page.getByTestId('env-banner')).toContainText('DEV')
  })
})
