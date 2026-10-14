import { test, expect, type Page } from '@playwright/test'
import { authFile, type PersonaKey } from '../../config/test-env'
import {
  addDays,
  apiAs,
  card,
  cleanupTasks,
  createTask,
  dailyCard,
  dailyItems,
  denverToday,
  getBoard,
  removeTick,
  setBoardCheck,
  tempTag,
} from '../brewery/taskBoardHelpers'
import { createTempPerson, retireTempPerson, type TempPerson } from '../auth/helpers'

// D40 (D38 spec §3.4, D41 item 6, plan decisions 1–4): the shared tablets on
// their department's board. S9g, S42–S46 and S68 on the brewhouse tablet;
// the Taproom tablet's Tasks. Codes belong to [TEST-TEMP] people (set by
// their department's manager), so persona codes stay untouched. The lockout
// itself is ExUnit's (task_board_device_test); here its message is checked
// with a stubbed 429. Runs in the one-worker `brewery-board` project.

test.use({ viewport: { width: 1600, height: 1100 } })

const made: number[] = []
let brewer: { person: TempPerson; code: string } | null = null

/** A `[TEST-TEMP]` member of `dept` with a staff code, set by that department's manager. */
async function staffWithCode(label: string, dept: 'brewery' | 'bar') {
  const person = await createTempPerson(label, { ready: false, memberships: [{ department: dept, role: 'employee' }] })
  const mgr = await apiAs(dept === 'brewery' ? 'breweryMgr' : 'barMgr')
  const code = (await (await mgr.get('/api/staff_codes/suggest')).json()).data.code as string
  const res = await mgr.put(`/api/users/${person.id}/staff_code`, { data: { code } })
  expect(res.status(), await res.text()).toBe(200)
  return { person, code }
}

const saveDialog = (page: Page) => page.getByTestId('task-dialog').getByRole('button', { name: 'Save' })

async function enterCode(page: Page, code: string) {
  const dialog = page.getByTestId('acting-code-dialog')
  await expect(dialog).toBeVisible()
  await page.getByTestId('acting-staff-code').fill(code)
  await page.getByTestId('acting-submit').click()
}

/** The newest History rows (breweryMgr). */
async function history(dept = 'brewery', manager: PersonaKey = 'breweryMgr') {
  const res = await (await apiAs(manager)).get(`/api/boards/${dept}/tasks/history`)
  expect(res.status()).toBe(200)
  return (await res.json()).data as { action: string; title: string; actor_name: string; on_shared_device: boolean }[]
}

test.beforeAll(async () => {
  brewer = await staffWithCode('D40 brewhouse', 'brewery')
})
test.afterAll(async () => {
  await retireTempPerson(brewer?.person ?? null)
})
test.afterEach(async () => {
  await cleanupTasks(made.splice(0))
})

test.describe('the brewhouse tablet', () => {
  test.use({ storageState: authFile('breweryDevice') })

  test('S42: opens on the Brewery board; no switcher, History, Edit Daily items or My tasks', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/tasks\/brewery/)
    await expect(page.getByTestId('board-grid')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('board-switcher')).toHaveCount(0)
    await expect(page.getByTestId('board-filter-mine')).toHaveCount(0)
    await expect(page.getByTestId('board-menu-history')).toHaveCount(0)
    await expect(page.getByTestId('board-menu-daily-items')).toHaveCount(0)
    // Another board, or All departments, goes back to its own.
    await page.goto('/tasks/bar')
    await expect(page).toHaveURL(/\/tasks\/brewery/)
    await page.goto('/tasks/all')
    await expect(page).toHaveURL(/\/tasks\/brewery/)
  })

  test('S9g: the menu opens without a code; Mark completed asks for one', async ({ page }) => {
    const today = denverToday()
    const t = await createTask(await apiAs('brewer1'), { title: tempTag('S9g'), due_on: today })
    made.push(t.id)
    await page.goto('/tasks/brewery')
    await card(page, t.id, today).getByTestId(`task-title-${t.id}:${today}`).click()
    await expect(page.getByTestId('task-menu')).toBeVisible()
    await expect(page.getByTestId('acting-code-dialog')).toHaveCount(0)
    await page.getByTestId('task-menu-complete').click()
    await enterCode(page, brewer!.code)
    await expect(page.getByTestId('acting-name')).toContainText(`Acting as ${brewer!.person.name.split(' ')[0]}`)

    await page.reload()
    await expect(page.getByTestId(`task-check-${t.id}:${today}`)).toBeChecked()
    const [latest] = await history()
    expect(latest).toMatchObject({ action: 'completed', actor_name: brewer!.person.name, on_shared_device: true })
  })

  test('S43: tick Temps with a code; a second tick within 5 minutes needs none; History names the person', async ({ page }) => {
    const today = denverToday()
    const api = await apiAs('breweryMgr')
    const items = await dailyItems(api)
    const [temps, pressures] = ['Temps', 'Pressures'].map((n) => items.find((i) => i.name === n)!)
    for (const i of [temps, pressures]) await removeTick(api, today, i.id)
    try {
      await page.goto('/tasks/brewery')
      await page.getByTestId(`daily-check-${today}-${temps.id}`).click()
      await enterCode(page, brewer!.code)
      await expect(page.getByTestId('acting-banner')).toBeVisible()
      await expect(page.getByTestId(`daily-check-${today}-${temps.id}`)).toBeChecked()

      // Within the 5 minutes: no dialog.
      await setBoardCheck(page.getByTestId(`daily-check-${today}-${pressures.id}`), true)
      await expect(page.getByTestId('acting-code-dialog')).toHaveCount(0)

      const daily = await dailyCard(api, today)
      expect(daily.items.filter((i) => [temps.id, pressures.id].includes(i.daily_item_id)).every((i) => i.checked)).toBe(true)
      const rows = (await history()).filter((h) => h.title === 'Temps')
      expect(rows[0]).toMatchObject({ actor_name: brewer!.person.name, on_shared_device: true })

      // D40 DEV qa gap 1: an untick sends the code in the body, never the URL.
      const untick = page.waitForRequest((r) => r.method() === 'DELETE' && r.url().includes(`/daily_checks/${today}/${temps.id}`))
      await setBoardCheck(page.getByTestId(`daily-check-${today}-${temps.id}`), false)
      const req = await untick
      expect(req.url()).not.toContain('staff_code')
      expect(req.postDataJSON()).toEqual({ staff_code: brewer!.code })
      await expect.poll(async () => (await dailyCard(api, today)).items.find((i) => i.daily_item_id === temps.id)?.checked).toBe(false)

      // Done ends it: the next tick asks again.
      await page.getByTestId('acting-done').click()
      await expect(page.getByTestId('acting-banner')).toHaveCount(0)
      await page.getByTestId(`daily-check-${today}-${pressures.id}`).click()
      await expect(page.getByTestId('acting-code-dialog')).toBeVisible()
      await page.getByTestId('acting-cancel').click()
      // Cancelled: nothing changed.
      await expect(page.getByTestId(`daily-check-${today}-${pressures.id}`)).toBeChecked()
    } finally {
      for (const i of [temps, pressures]) await removeTick(api, today, i.id)
    }
  })

  test('S44: add a task, 5 idle minutes, the second add asks again', async ({ page }) => {
    const today = denverToday()
    await page.clock.install()
    await page.goto('/tasks/brewery')
    const add = async (title: string) => {
      await page.getByTestId(`day-add-${today}`).click()
      await page.getByTestId('task-title-input').fill(title)
      await saveDialog(page).click()
    }
    const first = tempTag('S44 first')
    const second = tempTag('S44 second')
    await add(first)
    await enterCode(page, brewer!.code)
    await expect(page.getByTestId('acting-banner')).toBeVisible()

    await page.clock.fastForward('05:01')
    await expect(page.getByTestId('acting-banner')).toHaveCount(0)
    await add(second)
    await expect(page.getByTestId('acting-code-dialog')).toBeVisible()
    await enterCode(page, brewer!.code)
    await expect(page.getByTestId('task-dialog')).toHaveCount(0)

    const titles = (await getBoard(await apiAs('breweryMgr'), today, today)).days[0].cards.map((c) => c.title)
    expect(titles).toEqual(expect.arrayContaining([first, second]))
  })

  test('S45: a Taproom member’s code is a wrong code here; the dialog stays open', async ({ page }) => {
    const bartender = await staffWithCode('D40 S45 taproom', 'bar')
    try {
      const today = denverToday()
      const t = await createTask(await apiAs('brewer1'), { title: tempTag('S45'), due_on: today })
      made.push(t.id)
      await page.goto('/tasks/brewery')
      const box = page.getByTestId(`task-check-${t.id}:${today}`)
      await box.click()
      // D40 DEV qa gap 3: nothing shows ticked behind the dialog, or after a wrong code.
      await expect(page.getByTestId('acting-code-dialog')).toBeVisible()
      await expect(box).not.toBeChecked()
      await enterCode(page, bartender.code)
      await expect(page.getByTestId('acting-code-dialog')).toContainText("That staff code isn't right")
      await expect(page.getByTestId('acting-staff-code')).toHaveValue('')
      await expect(box).not.toBeChecked()
      await page.getByTestId('acting-cancel').click()
      await page.reload()
      await expect(page.getByTestId(`task-check-${t.id}:${today}`)).not.toBeChecked()
    } finally {
      await retireTempPerson(bartender.person)
    }
  })

  test('S46: the lockout message shows under the field', async ({ page }) => {
    const today = denverToday()
    const t = await createTask(await apiAs('brewer1'), { title: tempTag('S46'), due_on: today })
    made.push(t.id)
    await page.route(`**/api/boards/brewery/tasks/${t.id}/complete`, (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'staff_code_locked', retry_after_minutes: 7, message: 'Too many wrong codes. Try again in 7 minutes, or use Sign in as me.' }),
      }),
    )
    await page.goto('/tasks/brewery')
    await page.getByTestId(`task-check-${t.id}:${today}`).click()
    await enterCode(page, '1234')
    await expect(page.getByTestId('acting-code-dialog')).toContainText('Too many wrong codes. Try again in 7 minutes')
  })

  test('S68: a recurring task asks for a code; History: created on the Shared Device', async ({ page }) => {
    const today = denverToday()
    const title = tempTag('S68 weekly')
    await page.goto('/tasks/brewery')
    await page.getByTestId(`day-add-${today}`).click()
    await page.getByTestId('task-title-input').fill(title)
    await page.getByTestId('task-repeat-select').click()
    await page.getByTestId('task-repeat-option-weekly').click()
    await saveDialog(page).click()
    await enterCode(page, brewer!.code)
    await expect(page.getByTestId('task-dialog')).toHaveCount(0)

    const board = await getBoard(await apiAs('breweryMgr'), today, addDays(today, 7))
    const occurrences = board.days.flatMap((d) => d.cards).filter((c) => c.title === title)
    expect(occurrences.length).toBe(2)
    made.push(...occurrences.map((c) => c.id))
    const [created] = (await history()).filter((h) => h.title === title)
    expect(created).toMatchObject({ action: 'created', actor_name: brewer!.person.name, on_shared_device: true })
  })
})

test.describe('the Taproom tablet', () => {
  test.use({ storageState: authFile('taproomDevice') })

  test('D41 item 6: Tasks in its nav opens the Taproom board; a Taproom code adds a task', async ({ page }) => {
    const bartender = await staffWithCode('D40 taproom tablet', 'bar')
    const today = denverToday()
    const title = tempTag('Taproom tablet')
    try {
      await page.goto('/')
      await expect(page).toHaveURL(/\/$/) // keeps its landing
      await page.getByRole('button', { name: 'Tasks' }).first().click()
      await expect(page).toHaveURL(/\/tasks\/bar/)
      await expect(page.getByTestId('board-title')).toContainText('Taproom')
      await page.getByTestId(`day-add-${today}`).click()
      await page.getByTestId('task-title-input').fill(title)
      await saveDialog(page).click()
      await enterCode(page, bartender.code)
      await expect(page.getByTestId('acting-banner')).toBeVisible()

      await page.reload()
      await expect(page.getByText(title)).toBeVisible()
      const [latest] = await history('bar', 'barMgr')
      expect(latest).toMatchObject({ action: 'created', actor_name: bartender.person.name, on_shared_device: true })
    } finally {
      const owner = await apiAs('owner')
      const board = (await (await owner.get('/api/boards/bar/tasks', { params: { from: today, to: today } })).json()).data
      for (const c of board.days[0].cards.filter((c: { title: string }) => c.title === title))
        await owner.delete(`/api/boards/bar/tasks/${c.id}`)
      await retireTempPerson(bartender.person)
    }
  })
})
