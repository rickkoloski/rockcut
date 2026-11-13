import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { addDays, apiAs, card, getBoard, openBoard, type ApiCard } from '../brewery/taskBoardHelpers'
import { batchOf, Made, openGantt, stepOf, today, type SBatch } from '../production/schedule'
import { setSetting } from '../settingsMenu'

// D56 on the Brewery board: S17 (§3.4, the settings refresh when the app
// comes back to the screen) and S19 (§3.6, 5211: a step taken off the task
// list is still on the schedule, and its dialog puts it back). Named
// task-board-* so it runs in the one-worker `brewery-board` project. The
// batches are [TEST-TEMP] ones in their own tanks.

test.use({ storageState: authFile('brewer1'), viewport: { width: 1600, height: 2200 } })

const ALE = '[SEED] Standard ale'
const made = new Made()
test.afterEach(async () => {
  const api = await apiAs('brewer1')
  await api.put('/api/me/show_planned_batches', { data: { show_planned_batches: true } })
  await api.put('/api/me/board_settings/production', { data: { expanded: [], label_by: {} } })
  await made.cleanup()
})

/** A planned [TEST-TEMP] ale in its own tank, brewed in `brewIn` days. */
async function ale(label: string, brewIn: number): Promise<SBatch> {
  const tank = await made.tank('FV')
  const brand = await made.brand(label)
  return batchOf((await made.plan({ brand_id: brand.id, template: ALE, brew_on: addDays(today(), brewIn), tank_ids: [tank.id] })).id)
}

/** The board's card for a step, a few weeks either side of today. */
async function linked(stepId: number): Promise<ApiCard | undefined> {
  const board = await getBoard(await apiAs('brewer1'), addDays(today(), -7), addDays(today(), 20))
  return [...board.unfinished, ...board.days.flatMap((d) => d.cards)].find((c) => c.production?.step_id === stepId)
}

/** As if the tab came back to the screen (the tablet waking, another tab closing). */
const backOnScreen = (page: Page) =>
  page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })

test('S17: Show planned batches changed in browser A; browser B picks it up when it comes back to the screen, with no reload; a failed /api/me says nothing', async ({ page, browser }) => {
  const b = await ale('S17', 2)
  const c = (await linked(stepOf(b, 'Brew day').id))!
  const range = { from: today(), to: addDays(today(), 6) }

  const ctxB = await browser.newContext({ storageState: authFile('brewer1'), viewport: { width: 1600, height: 2200 } })
  try {
    const pageB = await ctxB.newPage()
    // B's clock runs on its own so the once-a-minute limit can pass.
    await pageB.clock.install()
    await openBoard(pageB, range)
    await expect(card(pageB, c.id, c.due_on!)).toBeVisible()
    const loads = { me: 0 }
    pageB.on('request', (r) => {
      if (new URL(r.url()).pathname === '/api/me') loads.me += 1
    })

    // A hides planned batches.
    await openBoard(page, range)
    const saved = page.waitForResponse((r) => r.url().endsWith('/api/me/show_planned_batches') && r.ok())
    await setSetting(page, 'board-settings', 'board-hide-planned', true)
    await saved

    // Back within the minute: no read. A minute on: read, and the card goes, with no reload.
    await backOnScreen(pageB)
    await pageB.waitForTimeout(300)
    expect(loads.me).toBe(0)
    await expect(card(pageB, c.id, c.due_on!)).toBeVisible()
    await pageB.clock.fastForward('01:01')
    await backOnScreen(pageB)
    await expect(card(pageB, c.id, c.due_on!)).toHaveCount(0)
    expect(loads.me).toBe(1)

    // A shows them again, but B's /api/me fails: B stays as it was, quietly.
    await setSetting(page, 'board-settings', 'board-hide-planned', false)
    await pageB.route('**/api/me', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }))
    await pageB.clock.fastForward('01:01')
    await backOnScreen(pageB)
    await expect.poll(() => loads.me).toBe(2)
    await pageB.waitForTimeout(500)
    await expect(pageB.getByTestId('server-unreachable')).toHaveCount(0)
    await expect(pageB.getByRole('alert')).toHaveCount(0)
    await expect(card(pageB, c.id, c.due_on!)).toHaveCount(0)

    // The next return reads it.
    await pageB.unroute('**/api/me')
    await pageB.clock.fastForward('01:01')
    await backOnScreen(pageB)
    await expect(card(pageB, c.id, c.due_on!)).toBeVisible()
  } finally {
    await ctxB.close()
  }
})

test('S19 (5211): take a linked task off the list: the step is still on the Gantt (expanded) and in the batch dialog; its dialog puts it back', async ({ page }) => {
  const b = await ale('S19', 2)
  const fdh = stepOf(b, 'FDH')
  const c = (await linked(fdh.id))!
  await openBoard(page, { from: addDays(c.due_on!, -3), to: addDays(c.due_on!, 3) })
  await card(page, c.id, c.due_on!).click()
  await page.getByTestId('task-menu-delete').click()
  const confirm = page.getByRole('dialog').filter({ hasText: 'Take this off the task list? It stays on the production schedule.' })
  await confirm.getByRole('button', { name: 'Take off' }).click()
  await expect(card(page, c.id, c.due_on!)).toHaveCount(0)
  expect(await linked(fdh.id)).toBeUndefined()

  // On the Gantt: the expanded tank's row and the batch dialog both still have it.
  await openGantt(page)
  await page.getByTestId(`gantt-caret-${b.vessels[0].tank_id}`).click()
  await expect(page.getByTestId(`gantt-step-row-${fdh.id}`)).toBeVisible()
  await page.getByTestId(`gantt-bar-${b.id}-0`).click()
  await expect(page.getByTestId(`batch-step-${fdh.id}`)).toBeVisible()
  // 5211: its name opens the step dialog, which puts it back on the list.
  await page.getByTestId(`batch-step-name-${fdh.id}`).click()
  await expect(page.getByTestId('step-dialog')).toBeVisible()
  await expect(page.getByTestId('step-task-list')).not.toBeChecked()
  await page.getByTestId('step-task-list').check()
  await page.getByTestId('step-dialog-save').click()
  await expect(page.getByTestId('step-dialog')).toBeHidden()

  await expect.poll(async () => (await linked(fdh.id))?.title).toBe(c.title)
  const back = (await linked(fdh.id))!
  await openBoard(page, { from: addDays(back.due_on!, -3), to: addDays(back.due_on!, 3) })
  await expect(card(page, back.id, back.due_on!)).toBeVisible()
})
