import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { seedState } from '../production/schedule'
import { addDays, apiAs, cleanupTasks, createTask, denverToday, getBoard, moveTask, tempTag } from '../brewery/taskBoardHelpers'

// D40 (spec §3.8): the Brewery Dashboard's Today's tasks card (S50) and the
// "Unfinished tasks before shift end" notification toggle (S35 UI, S37).
// The board is shared (DEV has [SEED] tasks), so the card is checked against
// the board's own read of today. Runs in the one-worker `brewery-board` project.

test.use({ viewport: { width: 1600, height: 1100 } })

const made: number[] = []
// D49: a Brewery task can be a production step; no test here may change the seed's schedule.
let seed: string[] = []
test.beforeEach(async () => {
  seed = await seedState()
})
test.afterEach(async () => {
  await cleanupTasks(made.splice(0))
  expect(await seedState(), 'this test changed the seed schedule').toEqual(seed)
})

test.describe('as brewer1', () => {
  test.use({ storageState: authFile('brewer1') })

  test('S50: Daily count with the unticked items, the first five open tasks, +N more, unfinished count; ticking updates the board', async ({ page }) => {
    const api = await apiAs('brewer1')
    const today = denverToday()
    for (let i = 1; i <= 7; i++) made.push((await createTask(api, { title: tempTag(`S50 task ${i}`), due_on: today })).id)
    made.push((await createTask(api, { title: tempTag('S50 earlier'), due_on: addDays(today, -2) })).id)
    // The task it ticks is its own, first on today: the first open one may be
    // the seed's (D49: a production step, which ticking would check off).
    const top = (await getBoard(api, today, today)).days[0].cards[0]
    if (top.id !== made[0]) await moveTask(api, made[0], today, top.id)

    const board = await getBoard(api, today, today)
    const day = board.days[0]
    const open = day.cards.filter((c) => !c.done && c.due_on === today)
    const unticked = day.daily.items.filter((i) => !i.checked)

    await page.goto('/brewery')
    const cardEl = page.getByTestId('todays-tasks-card')
    await expect(cardEl).toBeVisible()
    if (day.daily.total > 0) await expect(page.getByTestId('todays-tasks-daily-count')).toHaveText(`Daily ${day.daily.done}/${day.daily.total}`)
    for (const i of unticked) await expect(page.getByTestId('todays-tasks-daily')).toContainText(i.name)
    await expect(page.getByTestId('todays-task')).toHaveCount(Math.min(open.length, 5))
    for (const c of open.slice(0, 5)) await expect(page.getByTestId('todays-tasks-list')).toContainText(c.title)
    await expect(page.getByTestId('todays-tasks-more')).toHaveText(`+${open.length - 5} more`)
    await expect(page.getByTestId('todays-tasks-unfinished')).toHaveText(`${board.unfinished.length} unfinished from earlier days`)

    // Ticking the first listed task (this spec's) completes it on the board.
    const first = open[0]
    expect(first.id).toBe(made[0])
    const done = page.waitForResponse((r) => r.url().includes(`/tasks/${first.id}/complete`) && r.ok())
    await page.getByRole('checkbox', { name: `Mark "${first.title}" done` }).click()
    await done
    await expect(page.getByTestId('todays-tasks-list')).not.toContainText(first.title)
    await page.goto('/tasks/brewery')
    await expect(page.getByTestId(`task-check-${first.id}:${today}`)).toBeChecked()
  })

  test('S35 (UI): the toggle is in the preferences; turned off, it stays off after a reload', async ({ page }) => {
    const api = await apiAs('brewer1')
    const before = (await (await api.get('/api/notification_preferences')).json()).data
    try {
      await openPrefs(page)
      const row = page.getByTestId('notification-pref-task_shift_end')
      await expect(row).toContainText('Unfinished tasks before shift end')
      // On by default for the bell and push; never email.
      const inApp = row.getByLabel(/In-app/)
      const push = row.getByLabel(/Push/)
      await expect(inApp).toBeChecked()
      await expect(push).toBeChecked()
      await expect(row.getByLabel(/Email/)).toHaveCount(0)

      // Each switch saves on its own: wait for both saves before reloading
      // (DEV latency; the switch turns off before the PUT lands).
      const putDone = () => page.waitForResponse((r) => r.url().endsWith('/api/notification_preferences') && r.request().method() === 'PUT')
      let put = putDone()
      await inApp.click()
      expect((await put).ok()).toBe(true)
      put = putDone()
      await push.click()
      expect((await put).ok()).toBe(true)
      await expect(inApp).not.toBeChecked()
      await page.reload()
      await openPrefs(page)
      await expect(page.getByTestId('notification-pref-task_shift_end').getByLabel(/In-app/)).not.toBeChecked()
      const saved = (await (await api.get('/api/notification_preferences')).json()).data
      expect(saved.task_shift_end).toMatchObject({ in_app: false, push: false })
    } finally {
      await api.put('/api/notification_preferences', { data: { prefs: before } })
    }
  })
})

test.describe('as brewer1, with the first read answering late (DEV latency)', () => {
  test.use({ storageState: authFile('brewer1') })

  // D49 DEV run 1: the PUT sends the whole map. A switch clicked before the
  // dialog's first read answered: the read then landed on top of the change
  // with the old prefs, and the next switch saved those (In-app back on).
  // Here the first read answers, with what the server had, just after the
  // first save is sent, as it did on DEV.
  test("S35: the dialog's first read can't undo a switch; the next one keeps it", async ({ page }) => {
    const api = await apiAs('brewer1')
    const before = (await (await api.get('/api/notification_preferences')).json()).data
    let putSent: () => void = () => undefined
    const firstPut = new Promise<void>((r) => (putSent = r))
    let firstGet = true
    let firstPutHeld = true
    await page.route('**/api/notification_preferences', async (route) => {
      const method = route.request().method()
      if (method === 'GET' && firstGet) {
        firstGet = false
        const res = await route.fetch()
        // Until the first save is sent (or 1.5 s: a dialog that waits for it).
        await Promise.race([firstPut, new Promise((r) => setTimeout(r, 1_500))])
        return route.fulfill({ response: res })
      }
      if (method === 'PUT' && firstPutHeld) {
        firstPutHeld = false
        putSent()
        await new Promise((r) => setTimeout(r, 300))
      }
      return route.continue()
    })
    try {
      await openPrefs(page)
      const row = page.getByTestId('notification-pref-task_shift_end')
      const putDone = () => page.waitForResponse((r) => r.url().endsWith('/api/notification_preferences') && r.request().method() === 'PUT')
      let put = putDone()
      await row.getByLabel(/In-app/).click()
      expect((await put).ok()).toBe(true)
      put = putDone()
      await row.getByLabel(/Push/).click()
      expect((await put).ok()).toBe(true)
      const saved = (await (await api.get('/api/notification_preferences')).json()).data
      expect(saved.task_shift_end).toMatchObject({ in_app: false, push: false })
      // Nothing else was lost.
      for (const [event, value] of Object.entries(before as Record<string, object>)) if (event !== 'task_shift_end') expect(saved[event]).toEqual(value)
    } finally {
      await api.put('/api/notification_preferences', { data: { prefs: before } })
    }
  })
})

test.describe('as bartender1', () => {
  test.use({ storageState: authFile('bartender1') })

  test('S37: not a Brewery member, no toggle', async ({ page }) => {
    await openPrefs(page)
    await expect(page.getByRole('dialog')).toContainText('Shift reminder')
    await expect(page.getByTestId('notification-pref-task_shift_end')).toHaveCount(0)
  })
})

async function openPrefs(page: Page) {
  if (!page.url().includes('/schedule')) await page.goto('/schedule')
  await page.getByTestId('notification-bell').click()
  await page.getByTestId('notification-preferences').click()
  await expect(page.getByRole('dialog')).toBeVisible()
}
