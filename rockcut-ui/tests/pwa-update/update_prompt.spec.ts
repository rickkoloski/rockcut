import { test, expect } from '@playwright/test'
import type { ChildProcess } from 'node:child_process'
import { addDays, apiAs, cleanupTasks, denverToday, tempTag } from '../regression/brewery/taskBoardHelpers'
import { claimSpare } from '../regression/auth/spares'
import { createTempPerson, retireTempPerson, type TempPerson } from '../regression/auth/helpers'
import { buildBoth, buildOld, deployBAndLook, openOnA, previewState, prompt, runningBuild, serve, startPreview, stopPreview, writePreviewStates } from './helpers'

// D45 §3.1, S170–S177: "New version available · Reload", and the shared
// tablets reloading by themselves when idle. Two builds behind `vite preview`;
// the `pwa-update` project (one worker, not in the default run). The tablet
// waits are the real 10 s / 30 s (lib/updatePrompt.ts).

test.describe.configure({ timeout: 120_000 })

let server: ChildProcess | undefined
test.beforeAll(async () => {
  test.setTimeout(300_000)
  writePreviewStates(['brewer1', 'breweryMgr', 'taproomDevice', 'breweryDevice'])
  buildBoth()
  buildOld()
  serve('A')
  server = await startPreview()
})
test.afterAll(() => stopPreview(server))

const DAY = 24 * 60 * 60 * 1000

test.describe('brewer1', () => {
  test.use({ storageState: previewState('brewer1') })

  test('S170, S171: the bar shows over a working page; Reload loads B, still signed in', async ({ page }) => {
    await openOnA(page, '/schedule')
    await deployBAndLook(page)
    await expect(prompt(page)).toContainText('New version available')
    // The page still works underneath.
    await page.getByLabel('To').fill(addDays(denverToday(), 3))
    await expect(page.getByLabel('To')).toHaveValue(addDays(denverToday(), 3))
    expect(await runningBuild(page)).toBe('A')

    await page.getByTestId('update-reload').click()
    await expect.poll(() => runningBuild(page), { timeout: 15_000 }).toBe('B')
    await expect(page.locator('header h1')).toHaveText('Schedule')
    await expect(prompt(page)).toHaveCount(0)

    // S178 / D19: B's worker serves the precached shell offline, deep links included.
    await page.context().setOffline(true)
    try {
      await page.reload()
      expect(await runningBuild(page)).toBe('B')
      await page.goto('/tasks/brewery')
      expect(await runningBuild(page)).toBe('B')
    } finally {
      await page.context().setOffline(false)
    }
  })

  test('S172: × hides the bar until the next check or the next page', async ({ page }) => {
    await openOnA(page, '/schedule')
    await deployBAndLook(page)
    await expect(prompt(page)).toBeVisible()
    await page.getByRole('button', { name: 'Dismiss' }).click()
    await expect(prompt(page)).toHaveCount(0)
    // The next check.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await expect(prompt(page)).toBeVisible()
    await page.getByRole('button', { name: 'Dismiss' }).click()
    await expect(prompt(page)).toHaveCount(0)
    // The next page.
    await page.locator('.MuiDrawer-paper').filter({ visible: true }).getByRole('button', { name: 'Home' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(prompt(page)).toBeVisible()
    // A plain reload keeps A (the new build waits for Reload); the bar comes back.
    await page.reload()
    await expect(prompt(page)).toBeVisible()
    expect(await runningBuild(page)).toBe('A')
  })
})

test.describe('S173: breweryMgr', () => {
  test.use({ storageState: previewState('breweryMgr') })

  test('a half-filled Add task dialog stays until the person reloads', async ({ page }) => {
    const today = denverToday()
    await openOnA(page, '/tasks/brewery')
    await page.getByTestId(`day-add-${today}`).click()
    await page.getByTestId('task-title-input').fill('half-typed')
    await deployBAndLook(page)
    await expect(prompt(page)).toBeVisible()
    await page.waitForTimeout(12_000)
    await expect(page.getByTestId('task-title-input')).toHaveValue('half-typed')
    expect(await runningBuild(page)).toBe('A')
    await page.keyboard.press('Escape')
  })
})

test.describe('taproomDevice', () => {
  test.use({ storageState: previewState('taproomDevice') })

  test('S174: idle on the shared screen, the daily check finds B and the tablet reloads itself', async ({ page }) => {
    await page.clock.install()
    await openOnA(page, '/')
    serve('B') // the page never leaves view
    await page.clock.fastForward(DAY)
    await expect(prompt(page)).toBeVisible({ timeout: 15_000 })
    await page.clock.fastForward(10_000)
    await expect.poll(() => runningBuild(page), { timeout: 15_000 }).toBe('B')
  })

  test('S175: the screen wakes after B; it checks at once and reloads itself', async ({ page }) => {
    await openOnA(page, '/schedule')
    await deployBAndLook(page)
    await expect(prompt(page)).toBeVisible()
    await expect.poll(() => runningBuild(page), { timeout: 20_000 }).toBe('B')
    await expect(page.getByTestId('device-chip')).toBeVisible()
  })

  test('S176: "Sign in as me" gets the prompt and no reload; signed out and idle, it reloads', async ({ page }) => {
    await openOnA(page, '/')
    await page.getByTestId('personal-signin').click()
    // A spare session stands in for typing the person's password.
    await page.evaluate((t) => localStorage.setItem('rockcut_token', t), claimSpare())
    await page.reload()
    await expect(page.getByTestId('personal-session-banner')).toBeVisible()

    await deployBAndLook(page)
    await expect(prompt(page)).toBeVisible()
    await page.waitForTimeout(15_000)
    expect(await runningBuild(page)).toBe('A')

    await page.getByTestId('logout-button').click()
    await expect(page.getByTestId('device-chip')).toBeVisible()
    await expect.poll(() => runningBuild(page), { timeout: 25_000 }).toBe('B')
  })
})

test.describe('S177: breweryDevice', () => {
  test.use({ storageState: previewState('breweryDevice'), viewport: { width: 1600, height: 1100 } })

  let brewer: { person: TempPerson; code: string } | null = null
  const made: number[] = []
  test.afterAll(async () => {
    await retireTempPerson(brewer?.person ?? null)
    await cleanupTasks(made)
  })

  test('a dialog open: no reload until it closes', async ({ page }) => {
    const today = denverToday()
    await openOnA(page, '/tasks/brewery')
    await page.getByTestId(`day-add-${today}`).click()
    await page.getByTestId('task-title-input').fill('half-typed')
    await deployBAndLook(page)
    await expect(prompt(page)).toBeVisible()
    await page.waitForTimeout(15_000)
    await expect(page.getByTestId('task-title-input')).toHaveValue('half-typed')
    expect(await runningBuild(page)).toBe('A')

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('task-dialog')).toHaveCount(0)
    await expect.poll(() => runningBuild(page), { timeout: 45_000 }).toBe('B')
  })

  test('"Acting as": no reload until Done', async ({ page }) => {
    const person = await createTempPerson('D45 acting', { ready: false, memberships: [{ department: 'brewery', role: 'employee' }] })
    const mgr = await apiAs('breweryMgr')
    const code = (await (await mgr.get('/api/staff_codes/suggest')).json()).data.code as string
    expect((await mgr.put(`/api/users/${person.id}/staff_code`, { data: { code } })).status()).toBe(200)
    brewer = { person, code }

    const today = denverToday()
    await openOnA(page, '/tasks/brewery')
    await page.getByTestId(`day-add-${today}`).click()
    await page.getByTestId('task-title-input').fill(tempTag('D45 acting'))
    const created = page.waitForResponse((r) => r.request().method() === 'POST' && r.status() === 201 && /\/api\/boards\/brewery\/tasks$/.test(r.url()))
    await page.getByTestId('task-dialog').getByRole('button', { name: 'Save' }).click()
    await page.getByTestId('acting-staff-code').fill(code)
    await page.getByTestId('acting-submit').click()
    made.push(((await (await created).json()).data as { id: number }).id)
    await expect(page.getByTestId('acting-banner')).toBeVisible()
    await expect(page.getByTestId('task-dialog')).toHaveCount(0)

    await deployBAndLook(page)
    await expect(prompt(page)).toBeVisible()
    await page.waitForTimeout(15_000)
    expect(await runningBuild(page)).toBe('A')

    await page.getByTestId('acting-done').click()
    await expect.poll(() => runningBuild(page), { timeout: 45_000 }).toBe('B')
  })
})

test.describe('S189: brewer1, first rollout', () => {
  test.use({ storageState: previewState('brewer1') })

  test('a page on the last release reloads itself once into D45; the next build prompts', async ({ page }) => {
    serve('OLD')
    await page.goto('/schedule')
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20_000 })
    expect(await runningBuild(page)).toBeUndefined()

    let loads = 0
    page.on('load', () => loads++)
    serve('A')
    // The old page never checks; the browser does (on its next navigation or a push).
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()))
    await expect.poll(() => runningBuild(page), { timeout: 20_000 }).toBe('A')
    await expect(page.locator('header h1')).toHaveText('Schedule')
    // Once, no tap, and no loop.
    await page.waitForTimeout(5_000)
    expect(loads).toBe(1)
    await expect(prompt(page)).toHaveCount(0)

    // Every build after that waits for the prompt.
    await deployBAndLook(page)
    await expect(prompt(page)).toBeVisible()
    await page.waitForTimeout(3_000)
    expect(await runningBuild(page)).toBe('A')
    expect(loads).toBe(1)
  })
})
