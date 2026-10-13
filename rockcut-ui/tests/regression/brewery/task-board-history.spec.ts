import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import {
  addDays,
  apiAs,
  card,
  cleanupTasks,
  completeTask,
  createTask,
  dailyCard,
  dailyItems,
  dayLabel,
  denverToday,
  openBoard,
  setCheck,
  tempTag,
  userId,
} from './taskBoardHelpers'

// D38 §3.8 "Change log", scenarios S10 and S11, and History filtered to one
// task from its dialog. History is read-only; the writes it lists are made
// through the API as brewer1, so each test checks entries it caused itself.

test.use({ storageState: authFile('breweryMgr'), viewport: { width: 1600, height: 1100 } })

const created: number[] = []
test.afterEach(async () => {
  await cleanupTasks(created.splice(0))
})

/** An entry's "who · when" line: "Jake Brewer · Sun 10/11, 8:12p". */
const meta = (who: string, day: string) => new RegExp(`^${who} · ${dayLabel(day)}, \\d{1,2}:\\d{2}[ap]$`)

/** The History entries for one task (or the Daily ones, `null`), newest first: [text, meta]. */
async function entries(page: Page, taskId: number | null) {
  const rows = page.getByTestId('history-list').locator(`li[data-task-id="${taskId ?? ''}"]`)
  return rows.evaluateAll((els) =>
    els.map((el) => [
      el.querySelector('[data-testid^="history-text-"]')!.textContent!,
      el.querySelector('[data-testid^="history-meta-"]')!.textContent!,
    ]),
  )
}

async function openHistory(page: Page) {
  await page.getByTestId('board-menu').click()
  await page.getByTestId('board-menu-history').click()
  await expect(page.getByTestId('history-dialog')).toBeVisible()
  await expect(page.getByTestId('history-list').locator('li').first()).toBeVisible()
}

/** The whole log's size, from the API. */
async function historyTotal(api: APIRequestContext) {
  const res = await api.get('/api/brewery/tasks/history')
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()).total as number
}

test('S10: History lists added, assigned, completed, uncompleted, moved and deleted, newest first, with who and when', async ({ page }) => {
  const brewer = await apiAs('brewer1')
  const today = denverToday()
  const title = tempTag('S10 Package FV6')
  const task = await createTask(brewer, { title, due_on: today })
  created.push(task.id)
  const ids = { brewer1: await userId(brewer) }

  let res = await brewer.patch(`/api/brewery/tasks/${task.id}`, { data: { assignee_id: ids.brewer1 } })
  expect(res.status(), await res.text()).toBe(200)
  await completeTask(brewer, task.id)
  res = await brewer.post(`/api/brewery/tasks/${task.id}/uncomplete`)
  expect(res.status(), await res.text()).toBe(200)
  res = await brewer.post(`/api/brewery/tasks/${task.id}/move`, { data: { due_on: null } })
  expect(res.status(), await res.text()).toBe(200)
  res = await brewer.delete(`/api/brewery/tasks/${task.id}`)
  expect(res.status()).toBe(204)

  await openBoard(page)
  await openHistory(page)
  const day = dayLabel(today)
  const rows = await entries(page, task.id)
  expect(rows.map(([text]) => text)).toEqual([
    `Deleted ${title} (Future)`,
    `Moved ${title} from ${day} to Future`,
    `Marked ${title} not done (was done ${day})`,
    `Completed ${title}`,
    `Assigned ${title} to Jake Brewer`,
    `Added ${title} to ${day}`,
  ])
  for (const [, who] of rows) expect(who).toMatch(meta('Jake Brewer', today))
})

test('S10: a finished-elsewhere completion and Daily ticks read in words', async ({ page }) => {
  const brewer = await apiAs('brewer1')
  const today = denverToday()
  const planned = addDays(today, -1)
  const title = tempTag('S10 Carb FV3')
  const task = await createTask(brewer, { title, due_on: planned })
  created.push(task.id)
  await completeTask(brewer, task.id, 'both')

  // A Daily tick and untick on today, with Temps put back as it was.
  const temps = (await dailyItems(brewer)).find((i) => i.name === 'Temps')!
  const wasTicked = (await dailyCard(brewer, today)).items.find((i) => i.daily_item_id === temps.id)!.checked
  try {
    await setCheck(brewer, today, temps.id, !wasTicked)
    await setCheck(brewer, today, temps.id, wasTicked)

    await openBoard(page)
    await openHistory(page)
    expect((await entries(page, task.id))[0][0]).toBe(`Completed ${title} on ${dayLabel(today)}, shown on both days`)
    const daily = (await entries(page, null)).slice(0, 2).map(([text]) => text)
    const verbs = wasTicked ? ['Ticked', 'Unticked'] : ['Unticked', 'Ticked']
    expect(daily).toEqual(verbs.map((v) => `${v} Temps for ${dayLabel(today)}`))
  } finally {
    await setCheck(await apiAs('breweryMgr'), today, temps.id, wasTicked)
  }
})

test('Load more shows the next 50', async ({ page }) => {
  const mgr = await apiAs('breweryMgr')
  // Make sure there's a second page.
  while ((await historyTotal(mgr)) <= 50) {
    const t = await createTask(mgr, { title: tempTag('History filler'), due_on: null })
    created.push(t.id)
  }
  await openBoard(page)
  await openHistory(page)
  const rows = page.getByTestId('history-list').locator('li')
  await expect(rows).toHaveCount(50)
  const more = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/brewery/tasks/history' && new URL(r.url()).searchParams.get('page') === '2')
  await page.getByTestId('history-load-more').click()
  await more
  expect(await rows.count()).toBeGreaterThan(50)
})

test('History filtered to one task, from its dialog', async ({ page }) => {
  const brewer = await apiAs('brewer1')
  const today = denverToday()
  const mine = await createTask(brewer, { title: tempTag('Filter FV2 > FV3'), due_on: today })
  const other = await createTask(brewer, { title: tempTag('Package FV6'), due_on: today })
  created.push(mine.id, other.id)
  const renamed = `${mine.title} (racked)`
  const res = await brewer.patch(`/api/brewery/tasks/${mine.id}`, { data: { title: renamed } })
  expect(res.status(), await res.text()).toBe(200)

  await openBoard(page)
  await card(page, mine.id, today).getByTestId(`task-title-${mine.id}:${today}`).click()
  await page.getByTestId('task-menu-edit').click()
  await page.getByTestId('task-dialog-history').click()
  const dialog = page.getByTestId('history-dialog')
  await expect(dialog.getByRole('heading')).toHaveText(`History: ${renamed}`)
  await expect(dialog.locator('li')).toHaveCount(2)
  expect(await dialog.locator('li').evaluateAll((els) => els.map((e) => e.getAttribute('data-task-id')))).toEqual([String(mine.id), String(mine.id)])
  expect((await entries(page, mine.id)).map(([text]) => text)).toEqual([
    `Renamed ${mine.title} to ${renamed}`,
    `Added ${mine.title} to ${dayLabel(today)}`,
  ])
})

test.describe('brewer1', () => {
  test.use({ storageState: authFile('brewer1') })

  test('S11: no ⋮ menu, no History in the task dialog, and the API refuses History', async ({ page }) => {
    const brewer = await apiAs('brewer1')
    const today = denverToday()
    const task = await createTask(brewer, { title: tempTag('S11 Keg Wash'), due_on: today })
    created.push(task.id)

    await openBoard(page)
    await expect(page.getByTestId('board-menu')).toHaveCount(0)
    await card(page, task.id, today).getByTestId(`task-title-${task.id}:${today}`).click()
    await page.getByTestId('task-menu-edit').click()
    await expect(page.getByTestId('task-dialog')).toBeVisible()
    await expect(page.getByTestId('task-dialog-history')).toHaveCount(0)

    expect((await brewer.get('/api/brewery/tasks/history')).status()).toBe(403)
    expect((await brewer.get('/api/brewery/tasks/history', { params: { task_id: task.id } })).status()).toBe(403)
  })
})
