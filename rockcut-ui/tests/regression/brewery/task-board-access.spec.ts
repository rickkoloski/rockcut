import { test, expect, type Page } from '@playwright/test'
import { authFile, type PersonaKey } from '../../config/test-env'
import { apiAs, card, cleanupTasks, createTask, denverToday, openBoard, tempTag } from './taskBoardHelpers'

// D38 §3.8 access, scenarios S38–S41: who gets the task board, History and
// Edit Daily items. Since D41 every department has a board, so someone outside
// the Brewery gets their own board for the typed URL (D41 S102), and a 403
// from every Brewery board route.

const created: number[] = []
test.afterEach(async () => {
  await cleanupTasks(created.splice(0))
})

/** Every D38 route. Ids and dates are placeholders: a refusal comes before any lookup. */
function routes(today: string): [string, string][] {
  return [
    ['GET', `/api/boards/brewery/tasks?from=${today}&to=${today}`],
    ['GET', '/api/boards/brewery/tasks/history'],
    ['POST', '/api/boards/brewery/tasks'],
    ['POST', '/api/boards/brewery/tasks/move_overdue_to_today'],
    ['PATCH', '/api/boards/brewery/tasks/1'],
    ['DELETE', '/api/boards/brewery/tasks/1'],
    ['POST', '/api/boards/brewery/tasks/1/move'],
    ['POST', '/api/boards/brewery/tasks/1/complete'],
    ['POST', '/api/boards/brewery/tasks/1/uncomplete'],
    ['PUT', `/api/boards/brewery/daily_checks/${today}/1`],
    ['DELETE', `/api/boards/brewery/daily_checks/${today}/1`],
    ['GET', '/api/boards/brewery/daily_items'],
    ['POST', '/api/boards/brewery/daily_items'],
    ['PUT', '/api/boards/brewery/daily_items/order'],
    ['PATCH', '/api/boards/brewery/daily_items/1'],
  ]
}

async function statuses(persona: PersonaKey) {
  const api = await apiAs(persona)
  const out: Record<string, number> = {}
  for (const [method, path] of routes(denverToday())) {
    const res = await api.fetch(path, { method, data: method === 'GET' || method === 'DELETE' ? undefined : {} })
    out[`${method} ${path}`] = res.status()
  }
  return out
}

const navTasks = (page: Page) => page.getByRole('button', { name: 'Tasks', exact: true })

/** D41: Tasks is a top-level nav entry. */
async function expectTasksInNav(page: Page) {
  await expect(navTasks(page)).toBeVisible()
}

// Each persona's own department heading (once it shows, the nav has loaded) and board.
const OWN_SECTION = { bartender1: 'Taproom', office1: 'Office' } as const
const OWN_BOARD = { bartender1: 'bar', office1: 'office' } as const

for (const persona of ['bartender1', 'office1'] as const) {
  test.describe(`${persona} (not in the Brewery)`, () => {
    test.use({ storageState: authFile(persona) })

    test('S39: the typed URL goes to their own board (D41), and every Brewery board route is 403', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('button', { name: OWN_SECTION[persona], exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Brewery', exact: true })).toHaveCount(0)

      await page.goto('/tasks/brewery')
      await expect(page).toHaveURL(new RegExp(`/tasks/${OWN_BOARD[persona]}$`))
      await expect(page.getByTestId('board-title')).toHaveText(`${OWN_SECTION[persona]} tasks`)
      await expect(page.getByTestId('board-switcher')).toHaveCount(0)

      for (const [route, status] of Object.entries(await statuses(persona))) expect(status, route).toBe(403)
    })
  })
}

test.describe('taproomDevice', () => {
  test.use({ storageState: authFile('taproomDevice') })

  test('S41 (D40): the Brewery board isn’t its own; the URL goes to the Taproom board, every Brewery route is 403', async ({ page }) => {
    await page.goto('/tasks/brewery')
    await expect(page).toHaveURL(/\/tasks\/bar/)
    await expect(page.getByTestId('board-title')).toContainText('Taproom')
    await expectTasksInNav(page)

    for (const [route, status] of Object.entries(await statuses('taproomDevice'))) expect(status, route).toBe(403)
  })
})

test.describe('floater (Brewery + Taproom)', () => {
  test.use({ storageState: authFile('floater'), viewport: { width: 1600, height: 1100 } })

  test('S38: the same access as brewer1: the board and its writes, no History or Edit Daily items', async ({ page }) => {
    const today = denverToday()
    await page.goto('/')
    await expectTasksInNav(page)
    await navTasks(page).click()
    await expect(page).toHaveURL(/\/tasks\/brewery$/)
    await expect(page.getByTestId('board-grid')).toBeVisible()

    // Adds a task through the board, and it's there after a reload.
    const title = tempTag('S38 Keg Wash')
    await page.getByTestId(`day-add-${today}`).click()
    await page.getByTestId('task-title-input').fill(title)
    const saved = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/boards/brewery/tasks' && r.request().method() === 'POST' && r.ok())
    await page.getByTestId('task-dialog').getByRole('button', { name: 'Save' }).click()
    const task = (await (await saved).json()).data
    created.push(task.id)
    await page.reload()
    await expect(card(page, task.id, today)).toBeVisible()

    await expect(page.getByTestId('board-menu')).toHaveCount(0)
    await expect(page.getByTestId(`daily-menu-${today}`)).toHaveCount(0)
    const api = await apiAs('floater')
    expect((await api.get('/api/boards/brewery/tasks/history')).status()).toBe(403)
    expect((await api.post('/api/boards/brewery/daily_items', { data: { name: tempTag('x') } })).status()).toBe(403)
    expect((await api.get('/api/boards/brewery/daily_items')).status()).toBe(200)
  })
})

test.describe('owner (no memberships)', () => {
  test.use({ storageState: authFile('owner'), viewport: { width: 1600, height: 1100 } })

  test('S40: full access: Tasks, History and Edit Daily items', async ({ page }) => {
    const today = denverToday()
    const task = await createTask(await apiAs('owner'), { title: tempTag('S40 Package FV6'), due_on: today })
    created.push(task.id)

    await page.goto('/')
    await expectTasksInNav(page)
    await openBoard(page)
    await expect(card(page, task.id, today)).toBeVisible()

    await page.getByTestId('board-menu').click()
    await expect(page.getByTestId('board-menu-daily-items')).toBeVisible()
    await page.getByTestId('board-menu-history').click()
    const history = page.getByTestId('history-dialog')
    await expect(history.locator(`li[data-task-id="${task.id}"]`)).toHaveText(new RegExp(`^Added ${task.title.replace(/[[\]]/g, '\\$&')} to `))
    await history.getByTestId('history-close').click()

    await page.getByTestId('board-menu').click()
    await page.getByTestId('board-menu-daily-items').click()
    await expect(page.getByTestId('daily-items-dialog')).toBeVisible()
  })
})
