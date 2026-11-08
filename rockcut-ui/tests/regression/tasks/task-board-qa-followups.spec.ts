import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addDays, apiAs, card, cleanupTasks, denverToday, openBoard, tempTag, userId } from '../brewery/taskBoardHelpers'

// D53 Part 2 stage 7 (spec §4.8), the task-board follow-ups the UI shows:
//  * gap 11: one person, a repeat icon and a notes icon don't crush the title
//    in a day column (repro: Part 1 DEV QA, 1440 px);
//  * gaps 4, 5, 9: History reads who a following edit took off, one row per
//    series for someone leaving, and "deactivated" (wording from the API's
//    detail; the API side is ExUnit `qa_followups_test.exs`).
// The Brewery board is shared, so this runs in the one-worker `brewery-board` project.

test.use({ storageState: authFile('brewer1'), viewport: { width: 1440, height: 1100 } })

const made: number[] = []
test.afterEach(async () => cleanupTasks(made.splice(0)))

test('gap 11: a narrow card with one person, a repeat and notes puts the initials under the title', async ({ page }) => {
  const api = await apiAs('brewer1')
  const today = denverToday()
  const res = await api.post('/api/boards/brewery/tasks', {
    data: {
      title: tempTag('Q5g notes following'),
      due_on: today,
      notes: 'Bring the hose',
      assignee_ids: [await userId(api)],
      repeat: 'weekly',
      repeat_weekdays: [new Date(`${today}T12:00:00Z`).getUTCDay() || 7],
    },
  })
  expect(res.status(), await res.text()).toBe(201)
  const task = (await res.json()).data as { id: number }
  made.push(task.id)

  await openBoard(page, { from: today, to: addDays(today, 13) })
  const face = card(page, task.id, today)
  await expect(face).toBeVisible()
  const title = (await face.getByTestId(`task-title-${task.id}:${today}`).boundingBox())!
  const initials = (await face.getByTestId(`task-assignee-${task.id}:${today}`).boundingBox())!
  // Under the title, not beside it.
  expect(initials.y).toBeGreaterThanOrEqual(title.y + title.height - 1)
})

test('gap 4: History names everyone a following edit took off later occurrences', async ({ page }) => {
  const api = await apiAs('brewer1')
  const mgr = await apiAs('breweryMgr')
  const today = denverToday()
  const [jake, riley, morgan] = [await userId(api), await userId(await apiAs('brewer2')), await userId(mgr)]
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay() || 7
  const res = await api.post('/api/boards/brewery/tasks', {
    data: { title: tempTag('Q gap 4'), due_on: today, assignee_ids: [jake, riley], repeat: 'weekly', repeat_weekdays: [weekday] },
  })
  const first = (await res.json()).data as { id: number; series_id: number }
  made.push(first.id)
  const board = (await (await api.get('/api/boards/brewery/tasks', { params: { from: today, to: addDays(today, 21) } })).json()).data
  const occ = (n: number) =>
    board.days.find((d: { date: string }) => d.date === addDays(today, 7 * n)).cards.find((c: { series_id: number }) => c.series_id === first.series_id)
  // Week 2 on: Morgan. Then week 1 on: Jake.
  expect((await api.patch(`/api/boards/brewery/tasks/${occ(2).id}`, { data: { assignee_ids: [morgan], scope: 'following' } })).status()).toBe(200)
  expect((await api.patch(`/api/boards/brewery/tasks/${occ(1).id}`, { data: { assignee_ids: [jake], scope: 'following' } })).status()).toBe(200)

  const mgrPage = await page.context().browser()!.newPage({ storageState: authFile('breweryMgr') })
  await openBoard(mgrPage)
  await mgrPage.getByTestId('board-settings').click()
  await mgrPage.getByTestId('board-menu-history').click()
  const entry = mgrPage.locator('[data-testid^="history-text-"]').first()
  await expect(entry).toContainText('removed Riley Wort, Morgan Mash')
  await expect(entry).toContainText('(this and following)')
  await mgrPage.close()
})
