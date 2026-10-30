import { test, expect, type APIRequestContext } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addDays, apiAs, card, cleanupTasks, createTask, dayLabel, denverToday, getBoard, openBoard, tempTag, type ApiCard } from './taskBoardHelpers'
import { boardManagerItems, choiceOptions } from '../settingsMenu'

// D52 on the task boards: notes on hover (the popup shows them; a click on the
// icon or the popup edits them), extending a series from its last occurrence,
// a board's name in its link (task 4318), and the settings gear's contents.
// Named task-board-* so it runs in the one-worker `brewery-board` project.

test.use({ viewport: { width: 1600, height: 1000 } })

const today = () => denverToday()
const isoWeekday = (key: string) => new Date(`${key}T12:00:00Z`).getUTCDay() || 7

// Occurrence ids to remove (with their series) after each test.
const created: number[] = []
test.afterEach(async () => {
  const api = await apiAs('breweryMgr')
  for (const id of created) {
    const res = await api.delete(`/api/boards/brewery/tasks/${id}`, { params: { scope: 'following', changed: 'remove' } })
    expect([204, 404, 410]).toContain(res.status())
  }
  await cleanupTasks(created.splice(0))
})

/** A weekly series from today that ends a week later: two occurrences, the second its last. */
async function twoWeekSeries(api: APIRequestContext, label: string) {
  const title = tempTag(label)
  const res = await api.post('/api/boards/brewery/tasks', {
    data: { title, due_on: today(), repeat: 'weekly', repeat_weekdays: [isoWeekday(today())], repeat_until: addDays(today(), 7) },
  })
  expect(res.status(), await res.text()).toBe(201)
  const first = (await res.json()).data as ApiCard & { series_id: number }
  created.push(first.id)
  const board = await getBoard(api, addDays(today(), 7), addDays(today(), 7))
  const last = board.days[0].cards.find((c) => (c as ApiCard & { series_id?: number }).series_id === first.series_id)!
  return { first, last, title }
}

async function seriesEnd(api: APIRequestContext, taskId: number) {
  const res = await api.get(`/api/boards/brewery/tasks/${taskId}/series`)
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()).data.until_date as string | null
}

test.describe('brewer1', () => {
  test.use({ storageState: authFile('brewer1') })

  test('notes: the hover shows them; a click on the icon or the popup opens Edit with Notes focused, not the menu', async ({ page }) => {
    const notes = 'Rinse twice\nthen caustic'
    const task = await createTask(await apiAs('brewer1'), { title: tempTag('D52 notes'), due_on: today(), notes })
    created.push(task.id)
    await openBoard(page)
    const key = `${task.id}:${today()}`
    const icon = page.getByTestId(`task-notes-icon-${key}`)
    const popup = page.getByTestId(`task-notes-popup-${key}`)

    await icon.hover()
    await expect(popup).toHaveText(notes)

    await icon.click()
    await expect(page.getByTestId('task-dialog')).toBeVisible()
    await expect(page.getByTestId('task-notes-input')).toBeFocused()
    await expect(page.getByTestId('task-menu-header')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('task-dialog')).toHaveCount(0)

    await page.mouse.move(0, 0)
    await icon.hover()
    await popup.click()
    await expect(page.getByTestId('task-notes-input')).toBeFocused()
    await expect(page.getByTestId('task-menu-header')).toHaveCount(0)
  })

  test('extend: the last occurrence is tagged and offers Extend; checking it off asks; Same again runs it as long again', async ({ page }) => {
    const api = await apiAs('brewer1')
    const { first, last, title } = await twoWeekSeries(api, 'D52 extend')
    const lastDay = addDays(today(), 7)
    await openBoard(page)
    const lastCard = card(page, last.id, lastDay)
    await expect(lastCard).toContainText('last in series')
    await expect(card(page, first.id, today())).not.toContainText('last in series')

    // From its menu.
    await page.getByTestId(`task-title-${last.id}:${lastDay}`).click()
    await expect(page.getByTestId('task-menu-extend')).toBeVisible()
    await page.keyboard.press('Escape')

    // Checked off without opening it: "where should it show" (not today's), then the question.
    await lastCard.getByRole('checkbox').click()
    const finish = page.getByRole('dialog').filter({ hasText: 'show as done' })
    await finish.getByRole('radio').first().check()
    await page.getByTestId('finish-confirm').click()
    await expect(page.getByTestId('extend-series-text')).toHaveText(`That was the last “${title}” in its series (it ends on ${dayLabel(lastDay)}).`)
    await expect(page.getByTestId('extend-series-again')).toContainText('Same again')

    const saved = page.waitForResponse((r) => r.url().endsWith(`/api/boards/brewery/tasks/${last.id}`) && r.request().method() === 'PATCH')
    await page.getByTestId('extend-series-again').click()
    expect((await saved).status()).toBe(200)
    await expect(page.getByTestId('extend-series-dialog')).toHaveCount(0)
    expect(await seriesEnd(api, first.id)).toBe(addDays(today(), 14))
    const next = (await getBoard(api, addDays(today(), 14), addDays(today(), 14))).days[0].cards.filter((c) => c.title === title)
    expect(next).toHaveLength(1)
  })

  test('extend: Not now leaves the series as it was; Pick a new end… opens Edit series', async ({ page }) => {
    const api = await apiAs('brewer1')
    const { first, last } = await twoWeekSeries(api, 'D52 not now')
    const lastDay = addDays(today(), 7)
    await openBoard(page)
    await page.getByTestId(`task-title-${last.id}:${lastDay}`).click()
    await page.getByTestId('task-menu-extend').click()
    await expect(page.getByTestId('extend-series-text')).toHaveText(/^This is the last/)
    await page.getByTestId('extend-series-not-now').click()
    await expect(page.getByTestId('extend-series-dialog')).toHaveCount(0)
    expect(await seriesEnd(api, first.id)).toBe(lastDay)

    await page.getByTestId(`task-title-${last.id}:${lastDay}`).click()
    await page.getByTestId('task-menu-extend').click()
    await page.getByTestId('extend-series-pick').click()
    await expect(page.getByTestId('task-dialog')).toContainText('Edit series')
  })
})

test.describe('breweryDevice (a shared tablet)', () => {
  test.use({ storageState: authFile('breweryDevice') })

  test('extend: no Extend series on the tablet', async ({ page }) => {
    const { last } = await twoWeekSeries(await apiAs('breweryMgr'), 'D52 tablet')
    const lastDay = addDays(today(), 7)
    await openBoard(page)
    await page.getByTestId(`task-title-${last.id}:${lastDay}`).click()
    await expect(page.getByTestId('task-menu-header')).toBeVisible()
    await expect(page.getByTestId('task-menu-extend')).toHaveCount(0)
  })
})

test.describe('floater', () => {
  test.use({ storageState: authFile('floater') })

  test('4318: /tasks/taproom opens the Taproom board (key bar), keeping the range', async ({ page }) => {
    const from = addDays(today(), 2)
    const to = addDays(today(), 8)
    await page.goto(`/tasks/taproom?from=${from}&to=${to}`)
    await expect(page).toHaveURL(new RegExp(`/tasks/bar\\?from=${from}&to=${to}$`))
    await expect(page.getByTestId('board-grid')).toBeVisible()
  })

  test('the settings gear: View, the switches, First day, Days shown; no manager items for staff', async ({ page }) => {
    await openBoard(page)
    expect(await choiceOptions(page, 'board-settings', 'board-filter')).toEqual(['board-filter-all', 'board-filter-mine', 'board-filter-unassigned'])
    expect(await choiceOptions(page, 'board-settings', 'board-first-day')).toEqual(['board-first-day-sunday', 'board-first-day-monday', 'board-first-day-today'])
    expect(await choiceOptions(page, 'board-settings', 'board-span')).toEqual(['board-span-7', 'board-span-14'])
    expect(await boardManagerItems(page)).toEqual([])
  })
})

test.describe('breweryMgr', () => {
  test.use({ storageState: authFile('breweryMgr') })

  test('the settings gear ends with Edit Daily items, then History', async ({ page }) => {
    await openBoard(page)
    expect(await boardManagerItems(page)).toEqual(['board-menu-daily-items', 'board-menu-history'])
  })
})

