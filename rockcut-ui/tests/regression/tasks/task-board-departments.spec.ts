import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { authFile, type PersonaKey } from '../../config/test-env'
import { addDays, apiAs, denverToday, denverUtc, tempTag, userId } from '../brewery/taskBoardHelpers'
import { createTempPerson, retireTempPerson, type TempPerson } from '../auth/helpers'
import { openUser } from '../taproom/helpers'

// D41 §4, scenarios S101–S115: a task board per department. Who sees which
// board (nav, switcher, typed URLs), manager tools per board, the hidden Daily
// card and "Set up Daily checks", assignees and History per board, leaving one
// department, the old /brewery/tasks link, and ids from another board.
// The boards are shared, so this runs in the one-worker `brewery-board` project.

test.use({ viewport: { width: 1600, height: 1100 } })

interface Made {
  dept: string
  id: number
}
const tasks: Made[] = []
const shiftIds: number[] = []
const dailyItems: Made[] = []
let person: TempPerson | null = null

test.afterEach(async () => {
  const owner = await apiAs('owner')
  for (const { dept, id } of tasks.splice(0)) {
    const res = await owner.delete(`/api/boards/${dept}/tasks/${id}`, { params: { scope: 'following', changed: 'remove' } })
    expect([204, 404, 410]).toContain(res.status())
  }
  for (const { dept, id } of dailyItems.splice(0)) {
    const res = await owner.patch(`/api/boards/${dept}/daily_items/${id}`, { data: { active: false } })
    expect(res.status(), await res.text()).toBe(200)
  }
  for (const id of shiftIds.splice(0)) await owner.delete(`/api/shifts/${id}`)
  await retireTempPerson(person)
  person = null
})

async function createTask(api: APIRequestContext, dept: string, attrs: Record<string, unknown>) {
  const res = await api.post(`/api/boards/${dept}/tasks`, { data: attrs })
  expect(res.status(), await res.text()).toBe(201)
  const task = (await res.json()).data as { id: number; title: string; assignee_id: number | null; series_id: number | null }
  tasks.push({ dept, id: task.id })
  return task
}

async function getTask(api: APIRequestContext, dept: string, id: number) {
  const board = (await (await api.get(`/api/boards/${dept}/tasks`, { params: { from: denverToday(), to: addDays(denverToday(), 30) } })).json()).data
  const cards = [...board.unfinished, ...board.future, ...board.days.flatMap((d: { cards: unknown[] }) => d.cards)] as {
    id: number
    title: string
    assignee_id: number | null
    series_id: number | null
  }[]
  return cards.find((c) => c.id === id)
}

const navTasks = (page: Page) => page.getByRole('button', { name: 'Tasks', exact: true })

/** Open a board's URL and wait for it (or for wherever it sends the person). */
async function openBoard(page: Page, path: string) {
  await page.goto(path)
  await expect(page.getByTestId('board-grid')).toBeVisible({ timeout: 20_000 })
}

/** The switcher's entries, in order. */
async function switcherEntries(page: Page) {
  await page.getByTestId('board-switcher').click()
  const items = page.getByTestId('board-switcher-menu').getByRole('menuitem')
  await expect(items.first()).toBeVisible()
  const names = await items.allInnerTexts()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('board-switcher-menu')).toBeHidden()
  return names.map((n) => n.trim())
}

/** Board ⋮ entries (History, Edit Daily items / Set up Daily checks), or [] with no menu. */
async function boardMenu(page: Page) {
  if ((await page.getByTestId('board-menu').count()) === 0) return []
  await page.getByTestId('board-menu').click()
  const items = page.getByRole('menu').getByRole('menuitem')
  await expect(items.first()).toBeVisible()
  const names = await items.allInnerTexts()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toBeHidden()
  return names.map((n) => n.trim())
}

async function status(persona: PersonaKey, method: string, path: string, data?: Record<string, unknown>) {
  const api = await apiAs(persona)
  return (await api.fetch(path, { method, data })).status()
}

const isoWeekday = (key: string) => {
  const d = new Date(`${key}T12:00:00Z`).getUTCDay()
  return d === 0 ? 7 : d
}

test.describe('bartender1 (Taproom only)', () => {
  test.use({ storageState: authFile('bartender1') })

  test('S101: nav → Tasks opens "Taproom tasks", no switcher, Taproom shifts in the header, no Daily card', async ({ page }) => {
    const day = addDays(denverToday(), 9)
    const barMgr = await apiAs('barMgr')
    const positions = (await (await barMgr.get('/api/positions')).json()).data as { id: number; name: string }[]
    const res = await barMgr.post('/api/shifts', {
      data: {
        position_id: positions.find((p) => p.name === 'Bar-open')!.id,
        assignee_id: await userId(await apiAs('bartender1')),
        starts_at: denverUtc(day, '08:00'),
        ends_at: denverUtc(day, '16:00'),
        notes: tempTag('S101'),
      },
    })
    expect(res.status(), await res.text()).toBe(201)
    const shiftId = (await res.json()).data.id as number
    shiftIds.push(shiftId)
    expect((await barMgr.post(`/api/shifts/${shiftId}/publish`)).status()).toBe(200)

    await page.goto('/')
    await navTasks(page).click()
    await expect(page).toHaveURL(/\/tasks\/bar$/)
    await expect(page.getByTestId('board-grid')).toBeVisible()
    await expect(page.getByTestId('board-title')).toHaveText('Taproom tasks')
    await expect(page.getByTestId('board-switcher')).toHaveCount(0)
    const me = await userId(await apiAs('bartender1'))
    await expect(page.getByTestId(`header-person-${day}-${me}`)).toHaveText('Sam Pour · Bar-open · 8:00a–4:00p · 8h')
    // The Taproom has no Daily items (D41 Decision 5), so no Daily card.
    await expect(page.getByTestId(`daily-${denverToday()}`)).toHaveCount(0)
    await expect(page.getByTestId('board-menu')).toHaveCount(0)
  })

  test('S102: a typed /tasks/brewery goes to /tasks/bar; the Brewery API answers 403', async ({ page }) => {
    await page.goto('/tasks/brewery')
    await expect(page).toHaveURL(/\/tasks\/bar$/)
    await expect(page.getByTestId('board-title')).toHaveText('Taproom tasks')
    expect(await status('bartender1', 'GET', `/api/boards/brewery/tasks?from=${denverToday()}&to=${denverToday()}`)).toBe(403)
  })

  test('S105: the assignee list has only Taproom members; brewer1 through the API → 422', async ({ page }) => {
    const brewer1 = await userId(await apiAs('brewer1'))
    const bartender2 = await userId(await apiAs('bartender2'))
    await openBoard(page, '/tasks/bar')
    await page.getByTestId(`day-add-${denverToday()}`).click()
    await page.getByTestId('task-assignee-select').click()
    await expect(page.getByTestId(`task-assignee-option-${bartender2}`)).toBeVisible()
    await expect(page.getByTestId(`task-assignee-option-${brewer1}`)).toHaveCount(0)
    await page.keyboard.press('Escape')

    const api = await apiAs('bartender1')
    const res = await api.post('/api/boards/bar/tasks', { data: { title: tempTag('S105'), due_on: denverToday(), assignee_id: brewer1 } })
    expect(res.status()).toBe(422)
    expect((await res.json()).errors.assignee_id).toEqual(['must be a Taproom member'])
  })
})

test.describe('floater (Taproom + Brewery)', () => {
  test.use({ storageState: authFile('floater') })

  test('S103: the switcher lists Brewery and Taproom; the choice is remembered for /tasks', async ({ page }) => {
    await openBoard(page, '/tasks')
    await expect(page).toHaveURL(/\/tasks\/brewery$/)
    expect(await switcherEntries(page)).toEqual(['Brewery', 'Taproom'])

    await page.getByTestId('board-switcher').click()
    await page.getByTestId('board-switch-bar').click()
    await expect(page).toHaveURL(/\/tasks\/bar$/)
    await expect(page.getByTestId('board-title')).toHaveText('Taproom tasks')
    await openBoard(page, '/tasks')
    await expect(page).toHaveURL(/\/tasks\/bar$/)

    await page.getByTestId('board-switcher').click()
    await page.getByTestId('board-switch-brewery').click()
    await expect(page).toHaveURL(/\/tasks\/brewery$/)
    await expect(page.getByTestId(`daily-${denverToday()}`)).toBeVisible()
    await page.reload()
    await openBoard(page, '/tasks')
    await expect(page).toHaveURL(/\/tasks\/brewery$/)
    await expect(page.getByTestId('board-title')).toHaveText('Brewery tasks')
  })

  test('S106: a weekly series added on the Brewery shows only on the Brewery board', async ({ page }) => {
    const start = addDays(denverToday(), 2)
    const title = tempTag('S106 Keg Wash')
    const first = await createTask(await apiAs('floater'), 'brewery', { title, due_on: start, repeat: 'weekly', repeat_weekdays: [isoWeekday(start)] })
    expect(first.series_id).not.toBeNull()

    await openBoard(page, '/tasks/brewery')
    await expect(page.getByTestId(`day-list-${start}`).getByText(title)).toBeVisible()
    await expect(page.getByTestId(`day-list-${addDays(start, 7)}`).getByText(title)).toBeVisible()

    await openBoard(page, '/tasks/bar')
    await expect(page.getByTestId('board-title')).toHaveText('Taproom tasks')
    await expect(page.getByTestId('board-grid').getByText(title)).toHaveCount(0)
    const bar = (await (await (await apiAs('floater')).get('/api/boards/bar/tasks', { params: { from: denverToday(), to: addDays(denverToday(), 30) } })).json()).data
    expect(JSON.stringify(bar)).not.toContain(title)
  })

  test('S115: PATCH a Brewery task through the Taproom board → 404, unchanged; brewer1 → 403', async () => {
    const title = tempTag('S115 Brewery task')
    const task = await createTask(await apiAs('floater'), 'brewery', { title, due_on: denverToday() })
    expect(await status('floater', 'PATCH', `/api/boards/bar/tasks/${task.id}`, { title: `${title} changed` })).toBe(404)
    expect(await status('brewer1', 'PATCH', `/api/boards/bar/tasks/${task.id}`, { title: `${title} changed` })).toBe(403)
    expect((await getTask(await apiAs('floater'), 'brewery', task.id))?.title).toBe(title)
  })
})

test.describe('owner (no memberships)', () => {
  test.use({ storageState: authFile('owner') })

  test('S104: all four boards in the switcher, each with History and its Daily items entry', async ({ page }) => {
    await openBoard(page, '/tasks/brewery')
    expect(await switcherEntries(page)).toEqual(['Brewery', 'Taproom', 'Office', 'Sales'])
    expect(await boardMenu(page)).toEqual(['History', 'Edit Daily items'])
    for (const key of ['bar', 'office', 'sales']) {
      await openBoard(page, `/tasks/${key}`)
      // No Daily items yet on these boards (S107).
      expect(await boardMenu(page)).toEqual(['History', 'Set up Daily checks'])
    }
  })

  test('S112: removing someone from the Taproom in Users & Roles unassigns only their Taproom task', async ({ page }) => {
    person = await createTempPerson('S112', {
      ready: false,
      memberships: [
        { department: 'bar', role: 'employee' },
        { department: 'brewery', role: 'employee' },
      ],
    })
    const owner = await apiAs('owner')
    const pour = await createTask(owner, 'bar', { title: tempTag('S112 Lines'), due_on: denverToday(), assignee_id: person.id })
    const brew = await createTask(owner, 'brewery', { title: tempTag('S112 Brew'), due_on: denverToday(), assignee_id: person.id })

    await openUser(page, person.name)
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('combobox', { name: 'Taproom' }).click()
    await page.getByRole('option', { name: '— None —' }).click()
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden()

    expect((await getTask(owner, 'bar', pour.id))?.assignee_id).toBeNull()
    expect((await getTask(owner, 'brewery', brew.id))?.assignee_id).toBe(person.id)

    // Logged on the Taproom board, in the department's words.
    await openBoard(page, '/tasks/bar')
    await page.getByTestId('board-menu').click()
    await page.getByTestId('board-menu-history').click()
    await expect(page.getByTestId('history-dialog').locator(`li[data-task-id="${pour.id}"]`).first()).toContainText('(left the Taproom)')
  })
})

test.describe('barMgr (Taproom manager)', () => {
  test.use({ storageState: authFile('barMgr') })

  test('S107–S108: Set up Daily checks adds the Taproom card; History shows Taproom events only', async ({ page }) => {
    const today = denverToday()
    const brewery = await apiAs('breweryMgr')
    const breweryItems = (await (await brewery.get('/api/boards/brewery/daily_items')).json()).data as unknown[]
    // Something on the Brewery board meanwhile, which the Taproom's History mustn't show.
    const breweryTask = await createTask(await apiAs('floater'), 'brewery', { title: tempTag('S108 Brewery only'), due_on: today })

    await openBoard(page, '/tasks/bar')
    await expect(page.getByTestId(`daily-${today}`)).toHaveCount(0)
    await page.getByTestId('board-menu').click()
    await expect(page.getByTestId('board-menu-daily-items')).toHaveText('Set up Daily checks')
    await page.getByTestId('board-menu-daily-items').click()
    const dialog = page.getByTestId('daily-items-dialog')
    await expect(dialog).toBeVisible()
    const name = tempTag('S107 Lines')
    await page.getByTestId('daily-items-new').fill(name)
    const added = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/boards/bar/daily_items' && r.request().method() === 'POST' && r.ok(),
    )
    await page.getByTestId('daily-items-add').click()
    dailyItems.push({ dept: 'bar', id: (await (await added).json()).data.id })
    await page.getByTestId('daily-items-close').click()

    await expect(page.getByTestId(`daily-count-${today}`)).toHaveText('Daily 0/1')
    await page.reload()
    await expect(page.getByTestId(`daily-count-${today}`)).toHaveText('Daily 0/1')
    await page.getByTestId('board-menu').click()
    await expect(page.getByTestId('board-menu-daily-items')).toHaveText('Edit Daily items')
    // The Brewery's card still has its own items.
    expect(((await (await brewery.get('/api/boards/brewery/daily_items')).json()).data as unknown[]).length).toBe(breweryItems.length)

    await page.getByTestId('board-menu-history').click()
    const history = page.getByTestId('history-dialog')
    await expect(history.getByText(`Added ${name} to the Daily items`)).toBeVisible()
    await expect(history.getByText(breweryTask.title)).toHaveCount(0)
    await expect(history.locator(`li[data-task-id="${breweryTask.id}"]`)).toHaveCount(0)
  })
})

test.describe('breweryMgr (Brewery manager, not Taproom)', () => {
  test.use({ storageState: authFile('breweryMgr') })

  test('S109: a typed /tasks/bar goes to /tasks/brewery; the Taproom History API → 403', async ({ page }) => {
    await page.goto('/tasks/bar')
    await expect(page).toHaveURL(/\/tasks\/brewery$/)
    await expect(page.getByTestId('board-title')).toHaveText('Brewery tasks')
    expect(await status('breweryMgr', 'GET', '/api/boards/bar/tasks/history')).toBe(403)
  })
})

test.describe('splitRole (Taproom manager, Brewery employee)', () => {
  test.use({ storageState: authFile('splitRole') })

  test('S110: manager tools on the Taproom board, none on the Brewery board', async ({ page }) => {
    await openBoard(page, '/tasks/bar')
    expect((await boardMenu(page))[0]).toBe('History')
    expect(await boardMenu(page)).toHaveLength(2)
    await openBoard(page, '/tasks/brewery')
    expect(await boardMenu(page)).toEqual([])
    await expect(page.getByTestId(`daily-menu-${denverToday()}`)).toHaveCount(0)
  })
})

test.describe('dualMgr (Taproom + Office manager)', () => {
  test.use({ storageState: authFile('dualMgr') })

  test('S111: Taproom and Office in the switcher, manager tools on both', async ({ page }) => {
    await openBoard(page, '/tasks')
    await expect(page).toHaveURL(/\/tasks\/bar$/)
    expect(await switcherEntries(page)).toEqual(['Taproom', 'Office'])
    expect((await boardMenu(page))[0]).toBe('History')
    await page.getByTestId('board-switcher').click()
    await page.getByTestId('board-switch-office').click()
    await expect(page).toHaveURL(/\/tasks\/office$/)
    await expect(page.getByTestId('board-title')).toHaveText('Office tasks')
    expect(await boardMenu(page)).toEqual(['History', 'Set up Daily checks'])
  })
})

test.describe('brewer1 (old bookmark)', () => {
  test.use({ storageState: authFile('brewer1') })

  test('S113: /brewery/tasks lands on /tasks/brewery with the 1 week / Hide completed choices kept', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      for (const k of ['span', 'hideCompleted', 'phoneView', 'board']) localStorage.removeItem(`rockcut.tasks.${k}`)
      localStorage.setItem('rockcut.breweryTasks.span', '7')
      localStorage.setItem('rockcut.breweryTasks.hideCompleted', 'true')
    })
    await page.goto('/brewery/tasks')
    await expect(page).toHaveURL(/\/tasks\/brewery$/)
    await expect(page.getByTestId('board-grid')).toBeVisible()
    await expect(page.getByTestId('board-span-7')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('board-hide-completed')).toBeChecked()
    expect(await page.evaluate(() => [localStorage.getItem('rockcut.tasks.span'), localStorage.getItem('rockcut.tasks.hideCompleted')])).toEqual([
      '7',
      'true',
    ])
  })
})

test.describe('noDept', () => {
  test.use({ storageState: authFile('noDept') })

  test('S114: no Tasks entry, the URL goes Home, and the API answers 403', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Schedule', exact: true })).toBeVisible()
    await expect(navTasks(page)).toHaveCount(0)
    for (const path of ['/tasks', '/tasks/bar', '/brewery/tasks']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/$/)
    }
    await expect(page.getByTestId('task-board')).toHaveCount(0)
    expect(await status('noDept', 'GET', `/api/boards/bar/tasks?from=${denverToday()}&to=${denverToday()}`)).toBe(403)
  })
})

test.describe('taproomDevice', () => {
  test.use({ storageState: authFile('taproomDevice') })

  test('S114: the Taproom tablet gets 403 on the Taproom board (until D40)', async ({ page }) => {
    await page.goto('/tasks/bar')
    await expect(page.getByText('Not available on a shared device')).toBeVisible()
    expect(await status('taproomDevice', 'GET', `/api/boards/bar/tasks?from=${denverToday()}&to=${denverToday()}`)).toBe(403)
  })
})
