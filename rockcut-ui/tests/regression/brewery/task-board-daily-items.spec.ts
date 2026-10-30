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
  removeTick,
  restoreDailyItems,
  setCheck,
  type ApiDailyItem,
} from './taskBoardHelpers'
import { boardManagerItems, settingsItem } from '../settingsMenu'

// D38 §3.8 Edit Daily items, scenarios S28–S31. The items are shared, so
// after each test the four defaults are put back (names, order, active) and
// every other item is retired; checks the tests made are taken off first.
// S29 retires a [TEST-TEMP] item; D39's S75 retires Temps and restores it.

test.use({ storageState: authFile('breweryMgr'), viewport: { width: 1600, height: 2200 } })

let defaults: ApiDailyItem[] = []
const ticks: { date: string; id: number }[] = []

test.beforeEach(async () => {
  defaults = await dailyItems(await apiAs('breweryMgr'))
  expect(defaults.map((i) => i.name), 'the Daily items should start as the four defaults').toEqual(DEFAULT_DAILY_ITEMS)
})

test.afterEach(async () => {
  const api = await apiAs('breweryMgr')
  // Items first: a retired item's tick comes off by restoring it, which needs room on the list.
  await restoreDailyItems(defaults)
  for (const t of ticks.splice(0)) await removeTick(api, t.date, t.id)
})

const itemWrite = (page: Page, method: string, path = /\/api\/boards\/brewery\/daily_items/) =>
  page.waitForResponse((r) => path.test(new URL(r.url()).pathname) && r.request().method() === method && r.ok())

async function openItems(page: Page) {
  await settingsItem(page, 'board-settings', 'board-menu-daily-items')
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

  const ordered = itemWrite(page, 'PUT', /\/api\/boards\/brewery\/daily_items\/order$/)
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
  const ordered = itemWrite(page, 'PUT', /\/api\/boards\/brewery\/daily_items\/order$/)
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
  const res = await (await apiAs('owner')).patch(`/api/boards/brewery/daily_items/${temps.id}`, { data: { name: '[TEST-TEMP] Temps G1' } })
  expect(res.status(), await res.text()).toBe(200)
  const refetched = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/boards/brewery/daily_items' && r.request().method() === 'GET' && r.ok())
  const ordered = itemWrite(page, 'PUT', /\/api\/boards\/brewery\/daily_items\/order$/)
  await page.getByTestId(`daily-items-down-${defaults[0].id}`).click()
  await ordered
  await refetched

  let patched = false
  page.on('request', (r) => {
    if (r.method() === 'PATCH' && new URL(r.url()).pathname === `/api/boards/brewery/daily_items/${temps.id}`) patched = true
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
  const res = await api.post('/api/boards/brewery/daily_items', { data: { name: '[TEST-TEMP] Backups' } })
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
  const res = await api.post('/api/boards/brewery/daily_items', { data: { name: '[TEST-TEMP] DO' } })
  expect(res.status()).toBe(201)
  const item: ApiDailyItem = (await res.json()).data

  await openBoard(page, { from: yesterday, to: addDays(today, 5) })
  await page.getByTestId(`daily-toggle-${yesterday}`).click()
  await expect(page.getByTestId(`daily-item-${today}-${item.id}`)).toBeVisible()
  await expect(page.getByTestId(`daily-item-${yesterday}-${item.id}`)).toHaveCount(0)
  await expect(page.getByTestId(`daily-count-${yesterday}`)).toHaveText(`Daily ${before.done}/${before.total}`)
  expect(await cardNames(page, yesterday)).toHaveLength(before.total)

  // The API refuses a tick on yesterday, and nothing changes.
  const tick = await api.put(`/api/boards/brewery/daily_checks/${yesterday}/${item.id}`)
  expect(tick.status()).toBe(422)
  expect((await tick.json()).error).toBe('not_yet_added')
  await page.reload()
  await expect(page.getByTestId('board-grid')).toBeVisible()
  await expect(page.getByTestId(`daily-item-${yesterday}-${item.id}`)).toHaveCount(0)
  expect(await dailyCard(api, yesterday)).toMatchObject({ done: before.done, total: before.total })

  // A board loaded before the fix (or a stale one) still shows the row: the
  // refusal reaches the person as the other Daily errors do.
  await page.route(/\/api\/boards\/brewery\/tasks\?/, async (route) => {
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
  await page.unroute(/\/api\/boards\/brewery\/tasks\?/)
})

test.describe('as brewer1', () => {
  test.use({ storageState: authFile('brewer1') })

  test('S30: no Edit Daily items for a brewer, and the API refuses', async ({ page }) => {
    const today = denverToday()
    await openBoard(page)
    await expect(page.getByTestId(`daily-${today}`)).toBeVisible()
    expect(await boardManagerItems(page)).toEqual([])
    await expect(page.getByTestId(`daily-menu-${today}`)).toHaveCount(0)
    const res = await (await apiAs('brewer1')).post('/api/boards/brewery/daily_items', { data: { name: '[TEST-TEMP] S30' } })
    expect(res.status()).toBe(403)
  })
})

test("S31: a 13th item and a duplicate name are refused in the dialog (D42: Add greyed out at 12)", async ({ page }) => {
  const api = await apiAs('breweryMgr')
  for (let n = defaults.length + 1; n <= 12; n++) {
    const res = await api.post('/api/boards/brewery/daily_items', { data: { name: `[TEST-TEMP] S31 ${n}` } })
    expect(res.status(), await res.text()).toBe(201)
  }

  await openBoard(page)
  // The Daily card's own menu opens the same dialog.
  await page.getByTestId(`daily-menu-${denverToday()}`).click()
  await page.getByTestId(`daily-menu-edit-${denverToday()}`).click()
  await expect(page.getByTestId('daily-items-dialog')).toBeVisible()

  // D42 §2.7: at 12, Add is greyed out with the hint; the API still refuses a 13th.
  await expect(page.getByTestId('daily-items-new')).toBeDisabled()
  await expect(page.getByTestId('daily-items-add')).toBeDisabled()
  await expect(page.getByTestId('daily-items-dialog').getByText('Up to 12 Daily items. Retire one first.').first()).toBeVisible()
  const thirteenth = await api.post('/api/boards/brewery/daily_items', { data: { name: '[TEST-TEMP] S31 13' } })
  expect(thirteenth.status()).toBe(422)
  expect((await thirteenth.json()).error).toBe('too_many_items')
  expect((await dailyItems(api)).length).toBe(12)

  // Room for one more (retired here, so the dialog sees it), then a name already on the list (ignoring case).
  const extra = (await dailyItems(api)).find((i) => i.name === '[TEST-TEMP] S31 12')!
  await page.getByTestId(`daily-items-retire-${extra.id}`).click()
  await page.getByRole('button', { name: 'Retire', exact: true }).click()
  await expect(page.getByTestId('daily-items-new')).toBeEnabled()
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

// ── D39 follow-ups ──────────────────────────────────────────────────

test('S75: Restore brings Temps back at the bottom with its past ticks; at 12 items it is refused', async ({ page }) => {
  const today = denverToday()
  const yesterday = addDays(today, -1)
  const api = await apiAs('breweryMgr')
  const temps = defaults.find((i) => i.name === 'Temps')!
  await setCheck(api, yesterday, temps.id, true)
  ticks.push({ date: yesterday, id: temps.id })
  expect((await api.patch(`/api/boards/brewery/daily_items/${temps.id}`, { data: { active: false } })).status()).toBe(200)

  await openBoard(page, { from: yesterday, to: addDays(today, 5) })
  await openItems(page)
  await expect(page.getByTestId(`daily-items-row-${temps.id}`)).toHaveCount(0)
  await page.getByTestId('daily-items-retired-toggle').click()
  await expect(page.getByTestId(`daily-items-retired-row-${temps.id}`)).toBeVisible()
  const restored = itemWrite(page, 'POST', /\/restore$/)
  await page.getByTestId(`daily-items-restore-${temps.id}`).click()
  await restored
  await expect(page.getByTestId('daily-items-list').locator('[data-testid^="daily-items-name-"]')).toHaveText([
    'Backups',
    'Gravities',
    'Pressures',
    'Temps',
  ])
  await expect(page.getByTestId(`daily-items-retired-row-${temps.id}`)).toHaveCount(0)
  await page.getByTestId('daily-items-close').click()

  await page.reload()
  await expect(page.getByTestId('board-grid')).toBeVisible()
  expect((await cardNames(page, today)).map((n) => n.split(' — ')[0])).toEqual(['Backups', 'Gravities', 'Pressures', 'Temps'])
  await page.getByTestId(`daily-toggle-${yesterday}`).click()
  await expect(page.getByTestId(`daily-check-${yesterday}-${temps.id}`)).toBeChecked()

  // Retired again, with 12 items on the list: Restore is greyed out with the hint (D42 §2.7), and the API refuses it.
  expect((await api.patch(`/api/boards/brewery/daily_items/${temps.id}`, { data: { active: false } })).status()).toBe(200)
  for (let n = 1; n <= 9; n++) {
    const res = await api.post('/api/boards/brewery/daily_items', { data: { name: `[TEST-TEMP] Item ${n}` } })
    expect(res.status()).toBe(201)
  }
  await openItems(page)
  await page.getByTestId('daily-items-retired-toggle').click()
  await expect(page.getByTestId(`daily-items-restore-${temps.id}`)).toBeDisabled()
  await expect(page.getByTestId('daily-items-retired-full')).toHaveText('Up to 12 Daily items. Retire one first.')
  const refused = await api.post(`/api/boards/brewery/daily_items/${temps.id}/restore`)
  expect(refused.status()).toBe(422)
  expect((await refused.json()).error).toBe('too_many_items')
  await page.reload()
  await expect(page.getByTestId('board-grid')).toBeVisible()
  expect((await dailyItems(api)).some((i) => i.id === temps.id)).toBe(false)
})

test('Decision 1: a retired item ticked today shows a disabled box that says its ticks are kept', async ({ page }) => {
  const today = denverToday()
  const api = await apiAs('breweryMgr')
  const res = await api.post('/api/boards/brewery/daily_items', { data: { name: '[TEST-TEMP] Hoses' } })
  expect(res.status()).toBe(201)
  const item: ApiDailyItem = (await res.json()).data
  await setCheck(api, today, item.id, true)
  ticks.push({ date: today, id: item.id })
  expect((await api.patch(`/api/boards/brewery/daily_items/${item.id}`, { data: { active: false } })).status()).toBe(200)

  await openBoard(page, { from: today, to: addDays(today, 5) })
  const box = page.getByTestId(`daily-check-${today}-${item.id}`)
  await expect(box).toBeChecked()
  await expect(box).toBeDisabled()
  await page.getByTestId(`daily-retired-${today}-${item.id}`).hover()
  await expect(page.getByRole('tooltip')).toHaveText('[TEST-TEMP] Hoses is retired; its ticks are kept')

  // The API refuses the untick too, and the tick stays.
  const untick = await api.delete(`/api/boards/brewery/daily_checks/${today}/${item.id}`)
  expect(untick.status()).toBe(422)
  await page.reload()
  await expect(page.getByTestId(`daily-check-${today}-${item.id}`)).toBeChecked()
})

test('O-2: the open dialog picks up a rename made elsewhere when the board refetches; a rename being typed stays', async ({ page }) => {
  const backups = defaults.find((i) => i.name === 'Backups')!
  const gravities = defaults.find((i) => i.name === 'Gravities')!
  await openBoard(page)
  await openItems(page)

  // A rename in progress here.
  await page.getByTestId(`daily-items-rename-${gravities.id}`).click()
  await page.getByTestId(`daily-items-rename-input-${gravities.id}`).fill('Gravity readings')

  // Someone else renames Backups.
  const owner = await apiAs('owner')
  expect((await owner.patch(`/api/boards/brewery/daily_items/${backups.id}`, { data: { name: 'Backups (NAS)' } })).status()).toBe(200)

  // The board refetches on focus, and the dialog with it.
  const refetched = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/boards/brewery/daily_items' && r.ok())
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await refetched
  await expect(page.getByTestId(`daily-items-name-${backups.id}`)).toHaveText('Backups (NAS)')
  await expect(page.getByTestId(`daily-items-rename-input-${gravities.id}`)).toHaveValue('Gravity readings')
})
