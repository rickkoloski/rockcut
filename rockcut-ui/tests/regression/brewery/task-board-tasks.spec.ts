import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import {
  addDays,
  apiAs,
  boardWrite,
  card,
  cleanupTasks,
  completeTask,
  createTask,
  denverToday,
  getBoard,
  listKeys,
  openBoard,
  setBoardCheck,
  tempTag,
  userId,
} from './taskBoardHelpers'
import { pickSetting, setSetting, settingOn } from '../settingsMenu'

// D38 §3.8, scenarios S6–S9b, S9d, S9f, S16, S17: tasks on the board, the task
// menu and the add/edit dialog. Every write is checked again after a reload.

test.use({ storageState: authFile('brewer1'), viewport: { width: 1600, height: 1000 } })

const created: number[] = []
test.afterEach(async () => {
  await cleanupTasks(created.splice(0))
})

const saveDialog = (page: Page) => page.getByTestId('task-dialog').getByRole('button', { name: 'Save' })

async function openMenu(page: Page, id: number, where: string) {
  await card(page, id, where).getByTestId(`task-title-${id}:${where}`).click()
  await expect(page.getByTestId('task-menu')).toBeVisible()
}

test('S6: + Add a task on today adds it at the bottom, unassigned, and it persists', async ({ page }) => {
  const title = tempTag('S6 Package FV6')
  const today = denverToday()
  await openBoard(page)
  await page.getByTestId(`day-add-${today}`).click()
  await page.getByTestId('task-title-input').fill(title)
  await expect(page.getByTestId('task-assignee-select')).toHaveText('Anyone')
  const saved = boardWrite(page, /^\/api\/boards\/brewery\/tasks$/)
  await saveDialog(page).click()
  const task = (await (await saved).json()).data
  created.push(task.id)

  await page.reload()
  await expect(card(page, task.id, today)).toBeVisible()
  // The bottom of today's own tasks (only cards finished there from other days come after).
  const own = (await getBoard(await apiAs('brewer1'), today, today)).days[0].cards.filter((c) => c.due_on === today)
  expect(own[own.length - 1].title).toBe(title)
  await expect(card(page, task.id, today).getByTestId(`task-assignee-${task.id}:${today}`)).toHaveCount(0)
})

test.describe('as brewer2', () => {
  test.use({ storageState: authFile('brewer2') })

  test('S7: assigning to brewer1 shows their initials, sends no notification, and filters as My tasks', async ({ page, browser }) => {
    const title = tempTag('S7 Package FV6')
    const today = denverToday()
    const task = await createTask(await apiAs('brewer2'), { title, due_on: today })
    created.push(task.id)
    const since = new Date().toISOString()

    await openBoard(page)
    await openMenu(page, task.id, today)
    await page.getByTestId('task-menu-edit').click()
    await page.getByTestId('task-assignee-select').click()
    const brewer1Id = await userId(await apiAs('brewer1'))
    await page.getByTestId(`task-assignee-option-${brewer1Id}`).click()
    const saved = boardWrite(page, new RegExp(`^/api/boards/brewery/tasks/${task.id}$`), 'PATCH')
    await saveDialog(page).click()
    await saved
    await page.reload()
    await expect(page.getByTestId(`task-assignee-${task.id}:${today}`)).toHaveText('JB')

    // brewer2's My tasks doesn't show it.
    await pickSetting(page, 'board-settings', 'board-filter', 'mine')
    await expect(card(page, task.id, today)).toHaveCount(0)
    await pickSetting(page, 'board-settings', 'board-filter', 'unassigned')
    await expect(card(page, task.id, today)).toHaveCount(0)

    // brewer1's My tasks does.
    const ctx = await browser.newContext({ storageState: authFile('brewer1'), viewport: { width: 1600, height: 1000 } })
    const other = await ctx.newPage()
    await openBoard(other)
    await pickSetting(other, 'board-settings', 'board-filter', 'mine')
    await expect(card(other, task.id, today)).toBeVisible()
    await expect(other.locator(`[data-testid^="task-"][data-done]`).filter({ hasNot: other.getByTestId(/^task-assignee-/) })).toHaveCount(0)
    await ctx.close()

    const notes = (await (await (await apiAs('brewer1')).get('/api/notifications')).json()).data as { title: string; body: string | null; inserted_at: string }[]
    expect(notes.filter((n) => n.inserted_at >= since.slice(0, 19) && `${n.title} ${n.body ?? ''}`.includes(title))).toEqual([])
  })

  test('S8: checking a task on today asks nothing; it shows struck through with ✓ Riley; unchecking clears it', async ({ page }) => {
    const title = tempTag('S8 Package FV6')
    const today = denverToday()
    const task = await createTask(await apiAs('brewer2'), { title, due_on: today })
    created.push(task.id)

    await openBoard(page)
    const done = boardWrite(page, new RegExp(`/${task.id}/complete$`))
    await setBoardCheck(page.getByTestId(`task-check-${task.id}:${today}`), true)
    await done
    await expect(page.getByTestId('finish-dialog')).toHaveCount(0)
    await page.reload()
    await expect(card(page, task.id, today)).toHaveAttribute('data-done', 'true')
    await expect(page.getByTestId(`task-done-by-${task.id}:${today}`)).toHaveText('✓ Riley')
    await expect(page.getByTestId(`task-title-${task.id}:${today}`)).toHaveCSS('text-decoration-line', 'line-through')

    const undone = boardWrite(page, new RegExp(`/${task.id}/uncomplete$`))
    await setBoardCheck(page.getByTestId(`task-check-${task.id}:${today}`), false)
    await undone
    await page.reload()
    await expect(card(page, task.id, today)).toHaveAttribute('data-done', 'false')
    await expect(page.getByTestId(`task-done-by-${task.id}:${today}`)).toHaveCount(0)
  })

  test('S9: Delete from the task menu, after a confirm', async ({ page }) => {
    const title = tempTag('S9 Package FV6')
    const today = denverToday()
    const task = await createTask(await apiAs('brewer2'), { title, due_on: today })
    created.push(task.id)

    await openBoard(page)
    await openMenu(page, task.id, today)
    await page.getByTestId('task-menu-delete').click()
    const dialog = page.getByRole('dialog').filter({ hasText: `Delete '${title}'?` })
    await expect(dialog).toBeVisible()
    const deleted = boardWrite(page, new RegExp(`^/api/boards/brewery/tasks/${task.id}$`), 'DELETE')
    await dialog.getByRole('button', { name: 'Delete' }).click()
    await deleted
    await page.reload()
    await expect(page.getByTestId(`day-${today}`)).toBeVisible()
    await expect(card(page, task.id, today)).toHaveCount(0)
  })
})

test('S9a: the menu offers Add notes; it opens the dialog in Notes, and then the card has a notes icon and Edit notes', async ({ page }) => {
  const title = tempTag('S9a Keg Wash')
  const today = denverToday()
  const task = await createTask(await apiAs('brewer1'), { title, due_on: today })
  created.push(task.id)

  await openBoard(page)
  await openMenu(page, task.id, today)
  for (const id of ['edit', 'notes', 'complete', 'change-day', 'up', 'down', 'delete']) {
    await expect(page.getByTestId(`task-menu-${id}`)).toBeVisible()
  }
  await expect(page.getByTestId('task-menu-notes')).toHaveText('Add notes')
  await expect(page.getByTestId('task-menu-complete')).toHaveText('Mark completed')
  await page.getByTestId('task-menu-notes').click()
  await expect(page.getByTestId('task-notes-input')).toBeFocused()
  await page.keyboard.type('Use the caustic, then acid rinse')
  const saved = boardWrite(page, new RegExp(`^/api/boards/brewery/tasks/${task.id}$`), 'PATCH')
  await saveDialog(page).click()
  await saved

  await page.reload()
  await expect(page.getByTestId(`task-notes-icon-${task.id}:${today}`)).toBeVisible()
  await openMenu(page, task.id, today)
  await expect(page.getByTestId('task-menu-notes')).toHaveText('Edit notes')
})

test('S9b: Change day… to six weeks out takes it out of the range; that day shows it at the bottom', async ({ page }) => {
  const title = tempTag('S9b Brite CIP')
  const today = denverToday()
  const target = addDays(today, 42)
  const api = await apiAs('brewer1')
  const task = await createTask(api, { title, due_on: today })
  created.push(task.id)
  const already = await createTask(api, { title: tempTag('S9b already there'), due_on: target })
  created.push(already.id)

  await openBoard(page)
  await openMenu(page, task.id, today)
  await page.getByTestId('task-menu-change-day').click()
  await expect(page.getByTestId('change-day-input')).toHaveValue(today)
  await page.getByTestId('change-day-input').fill(target)
  const moved = boardWrite(page, new RegExp(`/${task.id}/move$`))
  await page.getByTestId('change-day-confirm').click()
  await moved
  await page.reload()
  await expect(page.getByTestId(`day-${today}`)).toBeVisible()
  await expect(page.getByTestId('task-board').getByText(title)).toHaveCount(0)

  // D52: a one-day range through the URL (no picker on the toolbar now).
  await page.goto(`/tasks/brewery?from=${target}&to=${target}`)
  await expect(page.getByTestId(`day-${target}`)).toBeVisible()
  // Only ours: a shared board (DEV) can hold other tasks on that day too.
  const ours = [`${already.id}:${target}`, `${task.id}:${target}`]
  await expect.poll(async () => (await listKeys(page, `day-list-${target}`)).filter((k) => ours.includes(k))).toEqual(ours)
})

test('S9d: a task finished on another day can\'t be moved from the menu ("Mark not done first to move it")', async ({ page }) => {
  const title = tempTag('S9d Carb FV3')
  const today = denverToday()
  const api = await apiAs('brewer1')
  const task = await createTask(api, { title, due_on: addDays(today, -2) })
  created.push(task.id)
  await completeTask(api, task.id, 'completed_day')

  await openBoard(page)
  await expect(card(page, task.id, today)).toHaveAttribute('data-locked', 'true')
  await expect(page.getByTestId(`task-tag-planned-${task.id}:${today}`)).toHaveText(/^planned /)
  await openMenu(page, task.id, today)
  for (const id of ['change-day', 'up', 'down']) {
    await expect(page.getByTestId(`task-menu-${id}`)).toHaveAttribute('aria-disabled', 'true')
  }
  await expect(page.getByTestId('task-menu-locked-hint')).toHaveText('Mark not done first to move it')
  for (const id of ['edit', 'notes', 'complete', 'delete']) {
    await expect(page.getByTestId(`task-menu-${id}`)).not.toHaveAttribute('aria-disabled', 'true')
  }
  await expect(page.getByTestId('task-menu-complete')).toHaveText('Mark not done')
})

test('Move up / Move down move one place within the day, disabled at the ends', async ({ page }) => {
  const day = addDays(denverToday(), 5)
  const api = await apiAs('brewer1')
  const a = await createTask(api, { title: tempTag('order A'), due_on: day })
  const b = await createTask(api, { title: tempTag('order B'), due_on: day })
  created.push(a.id, b.id)
  const before = (await getBoard(api, day, day)).days[0].cards.map((c) => c.key)

  await openBoard(page)
  await openMenu(page, b.id, day)
  await expect(page.getByTestId('task-menu-down')).toHaveAttribute('aria-disabled', 'true')
  const moved = boardWrite(page, new RegExp(`/${b.id}/move$`))
  await page.getByTestId('task-menu-up').click()
  await moved
  await page.reload()
  const expected = [...before]
  expected.splice(expected.indexOf(`${b.id}:${day}`), 1)
  expected.splice(expected.indexOf(`${a.id}:${day}`), 0, `${b.id}:${day}`)
  await expect.poll(() => listKeys(page, `day-list-${day}`)).toEqual(expected)

  await openMenu(page, a.id, day)
  await expect(page.getByTestId('task-menu-down')).toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('Escape')
  const first = expected[0]
  const [firstId] = first.split(':')
  await openMenu(page, Number(firstId), day)
  await expect(page.getByTestId('task-menu-up')).toHaveAttribute('aria-disabled', 'true')
})

test('S9f: Hide completed hides finished tasks on every day and is remembered after a reload', async ({ page }) => {
  const today = denverToday()
  const api = await apiAs('brewer1')
  const done = await createTask(api, { title: tempTag('S9f done'), due_on: addDays(today, 1) })
  const elsewhere = await createTask(api, { title: tempTag('S9f done elsewhere'), due_on: addDays(today, 2) })
  const open = await createTask(api, { title: tempTag('S9f open'), due_on: addDays(today, 1) })
  created.push(done.id, elsewhere.id, open.id)
  await completeTask(api, done.id, 'planned_day')
  await completeTask(api, elsewhere.id, 'completed_day')

  await openBoard(page)
  await expect(card(page, done.id, addDays(today, 1))).toBeVisible()
  await expect(card(page, elsewhere.id, today)).toBeVisible()
  await setSetting(page, 'board-settings', 'board-hide-completed', true)
  await page.reload()
  expect(await settingOn(page, 'board-settings', 'board-hide-completed')).toBe(true)
  await expect(card(page, open.id, addDays(today, 1))).toBeVisible()
  await expect(card(page, done.id, addDays(today, 1))).toHaveCount(0)
  await expect(card(page, elsewhere.id, today)).toHaveCount(0)

  await setSetting(page, 'board-settings', 'board-hide-completed', false)
  await expect(card(page, done.id, addDays(today, 1))).toBeVisible()
  await expect(card(page, elsewhere.id, today)).toBeVisible()
  await page.reload()
  expect(await settingOn(page, 'board-settings', 'board-hide-completed')).toBe(false)
})

test('S16: two people move the same task at once; both succeed, the last wins, and both boards agree', async ({ page, browser }) => {
  const title = tempTag('S16 race')
  const today = denverToday()
  const task = await createTask(await apiAs('brewer1'), { title, due_on: addDays(today, 3) })
  created.push(task.id)
  const ctx = await browser.newContext({ storageState: authFile('brewer2'), viewport: { width: 1600, height: 1000 } })
  const other = await ctx.newPage()
  await Promise.all([openBoard(page), openBoard(other)])

  const changeDay = async (p: Page, day: string) => {
    await openMenu(p, task.id, addDays(today, 3))
    await p.getByTestId('task-menu-change-day').click()
    await p.getByTestId('change-day-input').fill(day)
  }
  await changeDay(page, addDays(today, 4))
  await changeDay(other, addDays(today, 6))
  const [r1, r2] = await Promise.all([
    boardWrite(page, new RegExp(`/${task.id}/move$`)),
    boardWrite(other, new RegExp(`/${task.id}/move$`)),
    page.getByTestId('change-day-confirm').click(),
    other.getByTestId('change-day-confirm').click(),
  ])
  expect(r1.ok() && r2.ok()).toBe(true)

  const final = (await getBoard(await apiAs('brewer1'), today, addDays(today, 13))).days.find((d) => d.cards.some((c) => c.id === task.id))!.date
  expect([addDays(today, 4), addDays(today, 6)]).toContain(final)
  // The 60-second refresh (or a focus) brings both boards to the same answer; a reload stands in for it.
  await Promise.all([page.reload(), other.reload()])
  for (const p of [page, other]) {
    await expect(card(p, task.id, final)).toBeVisible()
    await expect(p.getByTestId('task-board').getByText(title)).toHaveCount(1)
  }
  await ctx.close()
})

test("G1: a notes edit in a dialog opened before someone else's rename keeps both changes", async ({ page, browser }) => {
  const title = tempTag('G1 Package FV6')
  const renamed = tempTag('G1 Package FV7')
  const today = denverToday()
  const task = await createTask(await apiAs('brewer1'), { title, due_on: today })
  created.push(task.id)
  const ctx = await browser.newContext({ storageState: authFile('brewer2'), viewport: { width: 1600, height: 1000 } })
  const other = await ctx.newPage()
  await Promise.all([openBoard(page), openBoard(other)])

  // brewer2 opens Edit and types notes.
  await openMenu(other, task.id, today)
  await other.getByTestId('task-menu-edit').click()
  await other.getByTestId('task-notes-input').fill('Check the gauge')

  // Meanwhile brewer1 renames the task.
  await openMenu(page, task.id, today)
  await page.getByTestId('task-menu-edit').click()
  await page.getByTestId('task-title-input').fill(renamed)
  const renaming = boardWrite(page, new RegExp(`^/api/boards/brewery/tasks/${task.id}$`), 'PATCH')
  await saveDialog(page).click()
  await renaming

  // brewer2 saves: only the notes go.
  const saving = boardWrite(other, new RegExp(`^/api/boards/brewery/tasks/${task.id}$`), 'PATCH')
  await saveDialog(other).click()
  expect((await saving).request().postDataJSON()).toEqual({ notes: 'Check the gauge' })
  await expect(other.getByTestId('task-dialog')).toHaveCount(0)

  const saved = (await getBoard(await apiAs('brewer1'), today, today)).days[0].cards.find((c) => c.id === task.id)!
  expect(saved).toMatchObject({ title: renamed, notes: 'Check the gauge' })
  await Promise.all([page.reload(), other.reload()])
  for (const p of [page, other]) await expect(card(p, task.id, today).getByTestId(`task-title-${task.id}:${today}`)).toHaveText(renamed)

  // With nothing changed, Save just closes.
  await openMenu(other, task.id, today)
  await other.getByTestId('task-menu-edit').click()
  let patched = false
  other.on('request', (r) => {
    if (r.method() === 'PATCH' && new URL(r.url()).pathname === `/api/boards/brewery/tasks/${task.id}`) patched = true
  })
  await saveDialog(other).click()
  await expect(other.getByTestId('task-dialog')).toHaveCount(0)
  expect(patched).toBe(false)
  await ctx.close()
})

test('S17: an empty or 201-character title is an inline error, and nothing is saved', async ({ page }) => {
  const today = denverToday()
  await openBoard(page)
  const posts: string[] = []
  page.on('request', (r) => r.method() === 'POST' && r.url().endsWith('/api/boards/brewery/tasks') && posts.push(r.url()))
  await page.getByTestId(`day-add-${today}`).click()
  await saveDialog(page).click()
  await expect(page.getByTestId('task-dialog').getByText('Enter a title')).toBeVisible()

  await page.getByTestId('task-title-input').fill(`[TEST-TEMP] S17 ${'x'.repeat(201 - 16)}`)
  await expect(page.getByTestId('task-title-input')).toHaveValue(/.{201}/)
  await saveDialog(page).click()
  await expect(page.getByTestId('task-dialog').getByText('Up to 200 characters')).toBeVisible()
  await expect(page.getByTestId('task-dialog')).toBeVisible()
  expect(posts).toEqual([])
  await page.getByTestId('task-dialog').getByRole('button', { name: 'Cancel' }).click()
  await page.reload()
  await expect(page.getByTestId('task-board').getByText('[TEST-TEMP] S17')).toHaveCount(0)
})

test('S77: saving a dialog for a task someone deleted says so, refreshes, and recreates nothing', async ({ browser }) => {
  const title = tempTag('S77 Package FV6')
  const today = denverToday()
  const task = await createTask(await apiAs('brewer1'), { title, due_on: today })
  created.push(task.id)
  const ctx = await browser.newContext({ storageState: authFile('brewer2'), viewport: { width: 1600, height: 1000 } })
  const other = await ctx.newPage()
  await openBoard(other)

  // brewer2 opens Edit and leaves it open; brewer1 deletes the task.
  await openMenu(other, task.id, today)
  await other.getByTestId('task-menu-edit').click()
  await other.getByTestId('task-notes-input').fill('Check the gauge')
  const gone = await (await apiAs('brewer1')).delete(`/api/boards/brewery/tasks/${task.id}`)
  expect(gone.status()).toBe(204)

  // brewer2 saves.
  const saving = other.waitForResponse(
    (r) => new URL(r.url()).pathname === `/api/boards/brewery/tasks/${task.id}` && r.request().method() === 'PATCH',
  )
  const refetch = other.waitForResponse((r) => new URL(r.url()).pathname === '/api/boards/brewery/tasks' && r.ok())
  await saveDialog(other).click()
  expect((await saving).status()).toBe(410)
  await expect(other.getByTestId('task-dialog')).toContainText('This task was deleted')
  await expect(other.getByTestId('task-dialog')).not.toContainText('Not found')
  await refetch
  await expect(card(other, task.id, today)).toHaveCount(0)

  // Nothing is recreated.
  await other.reload()
  await expect(other.getByTestId('board-grid')).toBeVisible()
  await expect(card(other, task.id, today)).toHaveCount(0)
  expect((await getBoard(await apiAs('brewer1'), today, today)).days[0].cards.some((c) => c.title === title)).toBe(false)
  await ctx.close()
})
