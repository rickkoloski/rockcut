import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import {
  DEFAULT_DAILY_ITEMS,
  addDays,
  apiAs,
  dailyCard,
  dailyItems,
  denverToday,
  mouseDrag,
  openBoard,
  restoreDailyItems,
  setCheck,
  type ApiDailyItem,
} from './taskBoardHelpers'

// D38 §3.8 Edit Daily items, scenarios S28–S31. The items are shared, so
// after each test the four defaults are put back (names, order, active) and
// every other item is retired; checks the tests made are taken off first.
// Retired items can't come back, so S29 retires a [TEST-TEMP] item, not Backups.

test.use({ storageState: authFile('breweryMgr'), viewport: { width: 1600, height: 2200 } })

let defaults: ApiDailyItem[] = []
const ticks: { date: string; id: number }[] = []

test.beforeEach(async () => {
  defaults = await dailyItems(await apiAs('breweryMgr'))
  expect(defaults.map((i) => i.name), 'the Daily items should start as the four defaults').toEqual(DEFAULT_DAILY_ITEMS)
})

test.afterEach(async () => {
  const api = await apiAs('breweryMgr')
  for (const t of ticks.splice(0)) await setCheck(api, t.date, t.id, false)
  await restoreDailyItems(defaults)
})

const itemWrite = (page: Page, method: string, path = /\/api\/brewery\/daily_items/) =>
  page.waitForResponse((r) => path.test(new URL(r.url()).pathname) && r.request().method() === method && r.ok())

async function openItems(page: Page) {
  await page.getByTestId('board-menu').click()
  await page.getByTestId('board-menu-daily-items').click()
  await expect(page.getByTestId('daily-items-dialog')).toBeVisible()
}

/** The names on one day's Daily card, in order. */
const cardNames = (page: Page, date: string) =>
  page.getByTestId(`daily-${date}`).locator('[data-testid^="daily-label-"]').allTextContents()

test('S28: add DO, drag it first, rename Temps → Temperatures', async ({ page }) => {
  const today = denverToday()
  const yesterday = addDays(today, -1)
  const yesterdayBefore = await dailyCard(await apiAs('breweryMgr'), yesterday)
  const temps = defaults.find((i) => i.name === 'Temps')!

  await openBoard(page, { from: yesterday, to: addDays(today, 5) })
  await openItems(page)

  await page.getByTestId('daily-items-new').fill('[TEST-TEMP] DO')
  const added = itemWrite(page, 'POST')
  await page.getByTestId('daily-items-add').click()
  const doItem: ApiDailyItem = (await (await added).json()).data
  await expect(page.getByTestId(`daily-items-row-${doItem.id}`)).toBeVisible()

  const ordered = itemWrite(page, 'PUT', /\/api\/brewery\/daily_items\/order$/)
  await mouseDrag(
    page,
    page.getByTestId(`daily-items-name-${doItem.id}`),
    page.getByTestId('daily-items-list'),
    page.getByTestId(`daily-items-row-${defaults[0].id}`),
  )
  await ordered

  await page.getByTestId(`daily-items-rename-${temps.id}`).click()
  await page.getByTestId(`daily-items-rename-input-${temps.id}`).fill('Temperatures')
  const renamed = itemWrite(page, 'PATCH')
  await page.getByTestId(`daily-items-rename-save-${temps.id}`).click()
  await renamed
  await page.getByTestId('daily-items-close').click()

  // Persisted.
  expect((await dailyItems(await apiAs('breweryMgr'))).map((i) => i.name)).toEqual([
    '[TEST-TEMP] DO',
    'Backups',
    'Gravities',
    'Temperatures',
    'Pressures',
  ])

  await page.reload()
  await expect(page.getByTestId('board-grid')).toBeVisible()
  const todayCard = await dailyCard(await apiAs('breweryMgr'), today)
  await expect(page.getByTestId(`daily-count-${today}`)).toHaveText(`Daily ${todayCard.done}/5`)
  expect((await cardNames(page, today))[0]).toBe('[TEST-TEMP] DO')

  // Yesterday shows the new name, and still counts out of what it had.
  await page.getByTestId(`daily-toggle-${yesterday}`).click()
  await expect(page.getByTestId(`daily-label-${yesterday}-${temps.id}`)).toHaveText(/^Temperatures/)
  await expect(page.getByTestId(`daily-count-${yesterday}`)).toHaveText(`Daily ${yesterdayBefore.done}/${yesterdayBefore.total}`)
})

test('S28: Move up and Move down reorder without dragging', async ({ page }) => {
  await openBoard(page)
  await openItems(page)
  const [first, second] = defaults
  await expect(page.getByTestId(`daily-items-up-${first.id}`)).toBeDisabled()
  await expect(page.getByTestId(`daily-items-down-${defaults[3].id}`)).toBeDisabled()
  const ordered = itemWrite(page, 'PUT', /\/api\/brewery\/daily_items\/order$/)
  await page.getByTestId(`daily-items-down-${first.id}`).click()
  await ordered
  expect((await dailyItems(await apiAs('breweryMgr'))).map((i) => i.id).slice(0, 2)).toEqual([second.id, first.id])
})

test("G1: an unchanged rename saves nothing, after someone else's rename reached the list", async ({ page }) => {
  const temps = defaults.find((i) => i.name === 'Temps')!
  await openBoard(page)
  await openItems(page)
  await page.getByTestId(`daily-items-rename-${temps.id}`).click()
  await expect(page.getByTestId(`daily-items-rename-input-${temps.id}`)).toHaveValue('Temps')

  // The owner renames Temps; a reorder here brings the new name into the list.
  const res = await (await apiAs('owner')).patch(`/api/brewery/daily_items/${temps.id}`, { data: { name: '[TEST-TEMP] Temps G1' } })
  expect(res.status(), await res.text()).toBe(200)
  const refetched = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/brewery/daily_items' && r.request().method() === 'GET' && r.ok())
  const ordered = itemWrite(page, 'PUT', /\/api\/brewery\/daily_items\/order$/)
  await page.getByTestId(`daily-items-down-${defaults[0].id}`).click()
  await ordered
  await refetched

  let patched = false
  page.on('request', (r) => {
    if (r.method() === 'PATCH' && new URL(r.url()).pathname === `/api/brewery/daily_items/${temps.id}`) patched = true
  })
  await page.getByTestId(`daily-items-rename-save-${temps.id}`).click()
  await expect(page.getByTestId(`daily-items-rename-input-${temps.id}`)).toHaveCount(0)
  expect(patched).toBe(false)
  expect((await dailyItems(await apiAs('breweryMgr'))).find((i) => i.id === temps.id)!.name).toBe('[TEST-TEMP] Temps G1')
})

// A new item can't be ticked on a day before it was added (G4), so the tick
// is today's; ExUnit covers a tick on an earlier day (brewery_daily_test, S29).
test('S29: a retired item leaves the card, and the day it was ticked still shows its tick', async ({ page }) => {
  const today = denverToday()
  const tomorrow = addDays(today, 1)
  const api = await apiAs('breweryMgr')
  const res = await api.post('/api/brewery/daily_items', { data: { name: '[TEST-TEMP] Backups' } })
  expect(res.status()).toBe(201)
  const item: ApiDailyItem = (await res.json()).data
  await setCheck(api, today, item.id, true)
  ticks.push({ date: today, id: item.id })

  await openBoard(page, { from: today, to: addDays(today, 5) })
  await openItems(page)
  await page.getByTestId(`daily-items-retire-${item.id}`).click()
  await expect(page.getByRole('dialog').filter({ hasText: 'Retire [TEST-TEMP] Backups? Past ticks are kept.' })).toBeVisible()
  const retired = itemWrite(page, 'PATCH')
  await page.getByRole('button', { name: 'Retire', exact: true }).click()
  await retired
  await expect(page.getByTestId(`daily-items-row-${item.id}`)).toHaveCount(0)
  await page.getByTestId('daily-items-close').click()

  await page.reload()
  await expect(page.getByTestId('board-grid')).toBeVisible()
  await expect(page.getByTestId(`daily-count-${tomorrow}`)).toHaveText('Daily 0/4')
  await expect(page.getByTestId(`daily-item-${tomorrow}-${item.id}`)).toHaveCount(0)
  await expect(page.getByTestId(`daily-check-${today}-${item.id}`)).toBeChecked()
  await expect(page.getByTestId(`daily-label-${today}-${item.id}`)).toHaveText(/^\[TEST-TEMP\] Backups — Morgan, /)
})

test('G4: an item added today is not on earlier days, and they refuse its tick', async ({ page }) => {
  const today = denverToday()
  const yesterday = addDays(today, -1)
  const api = await apiAs('breweryMgr')
  const before = await dailyCard(api, yesterday)
  const res = await api.post('/api/brewery/daily_items', { data: { name: '[TEST-TEMP] DO' } })
  expect(res.status()).toBe(201)
  const item: ApiDailyItem = (await res.json()).data

  await openBoard(page, { from: yesterday, to: addDays(today, 5) })
  await page.getByTestId(`daily-toggle-${yesterday}`).click()
  await expect(page.getByTestId(`daily-item-${today}-${item.id}`)).toBeVisible()
  await expect(page.getByTestId(`daily-item-${yesterday}-${item.id}`)).toHaveCount(0)
  await expect(page.getByTestId(`daily-count-${yesterday}`)).toHaveText(`Daily ${before.done}/${before.total}`)
  expect(await cardNames(page, yesterday)).toHaveLength(before.total)

  // The API refuses a tick on yesterday, and nothing changes.
  const tick = await api.put(`/api/brewery/daily_checks/${yesterday}/${item.id}`)
  expect(tick.status()).toBe(422)
  expect((await tick.json()).error).toBe('not_yet_added')
  await page.reload()
  await expect(page.getByTestId('board-grid')).toBeVisible()
  await expect(page.getByTestId(`daily-item-${yesterday}-${item.id}`)).toHaveCount(0)
  expect(await dailyCard(api, yesterday)).toMatchObject({ done: before.done, total: before.total })

  // A board loaded before the fix (or a stale one) still shows the row: the
  // refusal reaches the person as the other Daily errors do.
  await page.route(/\/api\/brewery\/tasks\?/, async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    for (const d of body.data.days) {
      if (d.date === yesterday) d.daily.items.push({ daily_item_id: item.id, name: item.name, active: true, checked: false, completed_by_name: null, completed_at: null })
    }
    // A tick cancels a board fetch in flight; that request is gone by now.
    await route.fulfill({ response, json: body }).catch(() => {})
  })
  await page.reload()
  await expect(page.getByTestId('board-grid')).toBeVisible()
  await page.getByTestId(`daily-toggle-${yesterday}`).click()
  await page.getByTestId(`daily-check-${yesterday}-${item.id}`).click()
  await expect(page.getByTestId('board-toast')).toContainText("That Daily item wasn't on the list that day")
  await expect(page.getByTestId(`daily-check-${yesterday}-${item.id}`)).not.toBeChecked()
  await page.unroute(/\/api\/brewery\/tasks\?/)
})

test.describe('as brewer1', () => {
  test.use({ storageState: authFile('brewer1') })

  test('S30: no Edit Daily items for a brewer, and the API refuses', async ({ page }) => {
    const today = denverToday()
    await openBoard(page)
    await expect(page.getByTestId(`daily-${today}`)).toBeVisible()
    await expect(page.getByTestId('board-menu')).toHaveCount(0)
    await expect(page.getByTestId(`daily-menu-${today}`)).toHaveCount(0)
    const res = await (await apiAs('brewer1')).post('/api/brewery/daily_items', { data: { name: '[TEST-TEMP] S30' } })
    expect(res.status()).toBe(403)
  })
})

test("S31: a 13th item and a duplicate name are refused in the dialog", async ({ page }) => {
  const api = await apiAs('breweryMgr')
  for (let n = defaults.length + 1; n <= 12; n++) {
    const res = await api.post('/api/brewery/daily_items', { data: { name: `[TEST-TEMP] S31 ${n}` } })
    expect(res.status(), await res.text()).toBe(201)
  }

  await openBoard(page)
  // The Daily card's own menu opens the same dialog.
  await page.getByTestId(`daily-menu-${denverToday()}`).click()
  await page.getByTestId(`daily-menu-edit-${denverToday()}`).click()
  await expect(page.getByTestId('daily-items-dialog')).toBeVisible()

  await page.getByTestId('daily-items-new').fill('[TEST-TEMP] S31 13')
  await page.getByTestId('daily-items-add').click()
  await expect(page.getByTestId('daily-items-dialog').getByText('Up to 12 items')).toBeVisible()
  expect((await dailyItems(api)).length).toBe(12)

  // Room for one more, then a name already on the list (ignoring case).
  const extra = (await dailyItems(api)).find((i) => i.name === '[TEST-TEMP] S31 12')!
  expect((await api.patch(`/api/brewery/daily_items/${extra.id}`, { data: { active: false } })).status()).toBe(200)
  await page.getByTestId('daily-items-new').fill('temps')
  await page.getByTestId('daily-items-add').click()
  await expect(page.getByTestId('daily-items-dialog').getByText('Already on the list')).toBeVisible()

  // A rename to a name on the list, inline on the row.
  const gravities = defaults.find((i) => i.name === 'Gravities')!
  await page.getByTestId(`daily-items-rename-${gravities.id}`).click()
  await page.getByTestId(`daily-items-rename-input-${gravities.id}`).fill('BACKUPS')
  await page.getByTestId(`daily-items-rename-save-${gravities.id}`).click()
  await expect(page.getByTestId(`daily-items-row-${gravities.id}`).getByText('Already on the list')).toBeVisible()
  expect((await dailyItems(api)).map((i) => i.name)).toContain('Gravities')
})
