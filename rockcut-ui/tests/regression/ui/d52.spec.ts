import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addDays, apiAs, cleanupTemp, createEvent, denverToday, denverUtc, listEvents, openScheduler, tempTag, weekMonday } from '../scheduler/helpers'
import { openSettings, closeSettings, settingsItems } from '../settingsMenu'

// D52 (refinements): the collapsed nav, the one top row on seven pages, View
// Schedule and the Scheduler as two pages (task 4707), Publish week's confirm
// (4232), list replies that aren't lists (4063), a failed channel list (4062),
// the ingredient categories under the library, and the Buy-a-Beer gear.

test.use({ viewport: { width: 1440, height: 900 } })

const today = () => denverToday()

// ── The one top row: controls left; actions and the gear right; no white panel ──

const PAGES: { path: string; gear: string }[] = [
  { path: '/tasks/brewery', gear: 'board-settings' },
  { path: '/schedule', gear: 'schedule-settings' },
  { path: '/scheduler', gear: 'scheduler-settings' },
  { path: '/brewery/production', gear: 'gantt-settings' },
  { path: '/brands', gear: 'brands-settings' },
  { path: '/ingredients', gear: 'ingredients-settings' },
  { path: '/taproom/beer-board', gear: 'board-settings' },
]

test.describe('owner', () => {
  test.use({ storageState: authFile('owner') })

  test('the top row: the gear is in the same place on all seven pages, on the page background', async ({ page }) => {
    const spots: { path: string; x: number; y: number }[] = []
    for (const { path, gear } of PAGES) {
      await page.goto(path)
      const g = page.getByTestId(gear)
      await expect(g).toBeVisible({ timeout: 20_000 })
      // Not inside a white panel (Paper): straight on the page.
      expect(await g.locator('xpath=ancestor::*[contains(concat(" ", @class, " "), " MuiPaper-root ")]').count(), path).toBe(0)
      const b = (await g.boundingBox())!
      spots.push({ path, x: Math.round(b.x), y: Math.round(b.y) })
    }
    for (const s of spots) {
      expect(Math.abs(s.x - spots[0].x), s.path).toBeLessThanOrEqual(2)
      expect(Math.abs(s.y - spots[0].y), s.path).toBeLessThanOrEqual(2)
    }
  })

  test('collapsed nav: a section opens its pages as icons below it; the rail stays narrow; hover names them', async ({ page }) => {
    await page.goto('/')
    const drawer = page.locator('.MuiDrawer-paper').first()
    await drawer.getByRole('button').first().click() // collapse
    await expect.poll(async () => Math.round((await drawer.boundingBox())!.width)).toBe(64)

    // The section heading (Messages also has a Brewery channel, further down).
    const brewery = drawer.getByRole('button', { name: 'Brewery', exact: true }).first()
    await brewery.hover()
    await expect(page.getByRole('tooltip').filter({ hasText: 'Brewery' })).toBeVisible()
    await brewery.click()
    await expect(brewery).toHaveAttribute('aria-expanded', 'true')
    await expect.poll(async () => Math.round((await drawer.boundingBox())!.width)).toBe(64)
    const production = drawer.getByRole('button', { name: 'Production' })
    await production.hover()
    // The last tooltip may still be fading out: find this one by its text.
    await expect(page.getByRole('tooltip').filter({ hasText: 'Production' })).toBeVisible()
    await production.click()
    await expect(page).toHaveURL(/\/brewery\/production$/)

    // Messages: "all" and "mngr" words, a department's icon for its channel.
    const messages = drawer.getByRole('button', { name: 'Messages' })
    await messages.click()
    await expect(drawer.getByRole('button', { name: 'All-staff' })).toContainText('all')
    await expect(drawer.getByRole('button', { name: 'Managers' })).toContainText('mngr')

    await brewery.click()
    await expect(brewery).toHaveAttribute('aria-expanded', 'false')
    await expect(drawer.getByRole('button', { name: 'Production' })).toHaveCount(0)
  })

  test('nav: Brewery has no Settings; old /settings links land on the ingredient categories', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.MuiDrawer-paper').first().getByText('Settings', { exact: true })).toHaveCount(0)
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/ingredients\/categories$/)
    await page.goto('/settings/categories/1')
    await expect(page).toHaveURL(/\/ingredients\/categories\/1$/)
    // QA gap 5: the list's old address too.
    await page.goto('/settings/categories')
    await expect(page).toHaveURL(/\/ingredients\/categories$/)
  })

  test('Ingredient Library: Add left of the gear in the search row; the gear opens the categories', async ({ page }) => {
    await page.goto('/ingredients')
    const add = (await page.getByTestId('ingredients-add-button').boundingBox())!
    const gear = (await page.getByTestId('ingredients-settings').boundingBox())!
    expect(add.x).toBeLessThan(gear.x)
    expect(Math.abs(add.y + add.height / 2 - (gear.y + gear.height / 2))).toBeLessThanOrEqual(4)
    await openSettings(page, 'ingredients-settings')
    await page.getByTestId('ingredients-settings-categories').click()
    await expect(page).toHaveURL(/\/ingredients\/categories$/)
    await expect(page.locator('.MuiDataGrid-row').first()).toBeVisible()
  })

  test('Brands & Recipes: Add Brand beside the gear; the gear has no settings yet', async ({ page }) => {
    await page.goto('/brands')
    await expect(page.getByTestId('brands-add-button')).toBeVisible()
    await openSettings(page, 'brands-settings')
    await expect(page.getByTestId('brands-settings-empty')).toHaveText('No settings yet')
    await closeSettings(page)
  })

  test('4063: list replies that aren\'t lists leave the pages up (Scheduler, View Schedule, Time off, Messages)', async ({ page }) => {
    const lists = /\/api\/(shifts|schedule_events|positions|departments|roster|shift_templates|time_off|availability|schedule_templates|channels|messages)(\?|$|\/)/
    await page.route('**/api/**', (route) =>
      route.request().method() === 'GET' && lists.test(route.request().url())
        ? route.fulfill({ status: 200, contentType: 'application/json', body: '{"data": null}' })
        : route.continue(),
    )
    for (const path of ['/scheduler', '/schedule', '/time_off', '/messages', '/messages/all']) {
      await page.goto(path)
      await expect(page.locator('.MuiDrawer-paper').first(), path).toBeVisible()
      await expect(page.getByText('Something went wrong'), path).toHaveCount(0)
    }
  })

  test('Scheduler: a draft shift keeps its department color, striped; a published one is plain', async ({ page }) => {
    // Every other shift reads as a draft in the browser only; nothing is saved.
    await page.route('**/api/shifts?*', async (route) => {
      const res = await route.fetch()
      const body = await res.json()
      body.data.forEach((s: { status: string }, i: number) => i % 2 === 0 && (s.status = 'draft'))
      await route.fulfill({ response: res, json: body })
    })
    await page.goto('/scheduler')
    const chips = page.locator('[data-testid^="shift-chip-"]')
    await expect(chips.first()).toBeVisible({ timeout: 20_000 })
    const drafts = chips.filter({ hasText: '· draft' })
    const published = chips.filter({ hasNotText: '· draft' })
    test.skip((await drafts.count()) === 0 || (await published.count()) === 0, 'needs a draft and a published shift this week')
    const look = (chip: typeof chips) =>
      chip.evaluate((el) => ({ image: getComputedStyle(el).backgroundImage, color: getComputedStyle(el).backgroundColor }))
    const [d, p] = [await look(drafts.first()), await look(published.first())]
    expect(d.image).toContain('repeating-linear-gradient')
    expect(d.color).not.toBe('rgba(0, 0, 0, 0)')
    expect(p.image).toBe('none')
  })

  test('4062: a failed channel list says so with Retry, and Retry recovers', async ({ page }) => {
    let fail = true
    await page.route('**/api/channels', (route) =>
      fail ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }) : route.continue(),
    )
    await page.goto('/messages/all')
    await expect(page.getByTestId('channels-error')).toContainText("Couldn't load the channels.")
    fail = false
    await page.getByTestId('channels-retry').click()
    await expect(page.getByTestId('channels-error')).toHaveCount(0)
    await expect(page.getByLabel('Send message')).toBeVisible()
  })
})

// ── View Schedule and the Scheduler (4707), Today, Publish week (4232) ──

const range = async (page: Page) => ({ from: await page.getByLabel('From').inputValue(), to: await page.getByLabel('To').inputValue() })

for (const persona of ['owner', 'barMgr'] as const) {
  test.describe(persona, () => {
    test.use({ storageState: authFile(persona) })

    test('4707: Scheduler → View Schedule (from the nav) shows today and the next six days', async ({ page }) => {
      await page.goto('/scheduler')
      await expect(page.getByTestId('events-row')).toBeVisible({ timeout: 20_000 })
      await page.locator('.MuiDrawer-paper').first().getByRole('button', { name: 'View Schedule' }).click()
      await expect(page).toHaveURL(/\/schedule$/)
      expect(await range(page)).toEqual({ from: today(), to: addDays(today(), 6) })
    })
  })
}

test.describe('barMgr', () => {
  test.use({ storageState: authFile('barMgr') })
  let tag = ''
  let week = ''
  test.afterEach(async () => {
    if (tag) await cleanupTemp(await apiAs('barMgr'), tag, week, addDays(week, 6))
    tag = ''
  })

  test('View Schedule: Today keeps the number of days and starts them today', async ({ page }) => {
    await page.goto('/schedule')
    await page.getByLabel('From').fill(addDays(today(), 10))
    await page.getByLabel('To').fill(addDays(today(), 23))
    await page.getByTestId('schedule-today').click()
    expect(await range(page)).toEqual({ from: today(), to: addDays(today(), 13) })
  })

  test('4232: Publish week asks first, with the counts; Cancel publishes nothing', async ({ page }) => {
    tag = tempTag('4232 confirm')
    week = weekMonday(4)
    const { event } = await createEvent(await apiAs('barMgr'), 'bar', {
      title: tag,
      starts_at: denverUtc(addDays(week, 1), '10:00'),
      ends_at: denverUtc(addDays(week, 1), '11:00'),
    })
    await openScheduler(page, 4)
    // By its name, so the check runs against a build without the confirm too (it then publishes).
    await page.getByRole('button', { name: 'Publish week' }).click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Publish this week?' })
    await expect(dialog).toContainText(/Publish .*draft event.* for .*\? Staff will be notified\./)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
    const after = (await listEvents(await apiAs('barMgr'), week, addDays(week, 6))).find((e) => e.id === event.id)
    expect(after?.status).toBe('draft')
  })

  test('Scheduler: the gear holds the filters, Templates, Positions and Delete week', async ({ page }) => {
    await page.goto('/scheduler')
    expect(await settingsItems(page, 'scheduler-settings')).toEqual([
      'scheduler-department',
      'scheduler-position',
      'scheduler-templates',
      'scheduler-positions',
      'scheduler-delete-week',
    ])
  })

  test('Buy-a-Beer: Export, Import and History are in the gear; History has a way back; no tabs', async ({ page }) => {
    await page.goto('/taproom/beer-board')
    await expect(page.getByRole('tab')).toHaveCount(0)
    expect(await settingsItems(page, 'board-settings')).toEqual(['board-export', 'board-import', 'board-tab-history'])
    await openSettings(page, 'board-settings')
    await page.getByTestId('board-tab-history').click()
    await expect(page.getByTestId('board-history')).toBeVisible()
    await page.getByTestId('board-tab-board').click()
    await expect(page.getByTestId('board-grid')).toBeVisible()

    // QA gap 7: History has its own address; a reload stays there and Back returns to the board.
    await openSettings(page, 'board-settings')
    await page.getByTestId('board-tab-history').click()
    await expect(page).toHaveURL(/\/taproom\/beer-board\?view=history$/)
    await page.reload()
    await expect(page.getByTestId('board-history')).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/\/taproom\/beer-board$/)
    await expect(page.getByTestId('board-grid')).toBeVisible()
  })
})
