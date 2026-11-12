import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
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
  openBoard,
  tempTag,
  toggleAssignees,
  userId,
  type ApiCard,
} from './taskBoardHelpers'
import { createTempPerson, retireTempPerson, type TempPerson } from '../auth/helpers'
import { batchOf, Made, stepOf, today as productionToday } from '../production/schedule'
import { pickSetting, settingsItem } from '../settingsMenu'
import { putBoardSettings, resetBoardSettingsAroundEach } from '../boardSettings'
import { openUser } from '../taproom/helpers'

// D53 Part 1 (§3, S216–S220, S222, lead decision 3): several people on a task.
// S221's push is ExUnit's (`task_board_multi_assignee_test`, the scanner's clock
// is injected there). Runs in the one-worker `brewery-board` project.

test.use({ viewport: { width: 1600, height: 1100 } })
// D58: the View filter and the phone layout are each persona's own, on the server.
resetBoardSettingsAroundEach()

const created: number[] = []
test.afterEach(async () => {
  await cleanupTasks(created.splice(0))
})

const saveDialog = (page: Page) => page.getByTestId('task-dialog').getByRole('button', { name: 'Save' })

async function openEdit(page: Page, id: number, day: string) {
  await card(page, id, day).getByTestId(`task-title-${id}:${day}`).click()
  await page.getByTestId('task-menu-edit').click()
  await expect(page.getByTestId('task-dialog')).toBeVisible()
}

const ids = (c: { assignees: { id: number }[] }) => c.assignees.map((p) => p.id)

async function cardOn(api: APIRequestContext, id: number, day: string): Promise<ApiCard> {
  const board = await getBoard(api, day, day)
  return board.days[0].cards.find((c) => c.id === id)!
}

const isoWeekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay() || 7

test.describe('as brewer1', () => {
  test.use({ storageState: authFile('brewer1') })

  test('S216: add two people in the dialog; two sets of initials, still there after a reload', async ({ page }) => {
    const api = await apiAs('brewer1')
    const day = denverToday()
    const task = await createTask(api, { title: tempTag('S216'), due_on: day })
    created.push(task.id)
    const [brewer2, floater] = [await userId(await apiAs('brewer2')), await userId(await apiAs('floater'))]

    await openBoard(page)
    await openEdit(page, task.id, day)
    await expect(page.getByTestId('task-assignee-select')).toHaveText('Anyone')
    await toggleAssignees(page, [brewer2, floater])
    await expect(page.getByTestId(`task-assignee-chip-${brewer2}`)).toHaveText('Riley Wort')
    await expect(page.getByTestId(`task-assignee-chip-${floater}`)).toHaveText('Jordan Float')

    const saved = boardWrite(page, new RegExp(`^/api/boards/brewery/tasks/${task.id}$`), 'PATCH')
    await saveDialog(page).click()
    expect((await saved).request().postDataJSON()).toEqual({ assignee_ids: [brewer2, floater] })

    await page.reload()
    await expect(page.getByTestId(`task-assignee-${task.id}:${day}`)).toHaveText('RW')
    await expect(page.getByTestId(`task-assignee-${task.id}:${day}-1`)).toHaveText('JF')
    const after = await cardOn(api, task.id, day)
    expect(ids(after)).toEqual([brewer2, floater])
    expect(after.assignee_id).toBe(brewer2)
  })

  test('adding a task with two people, from the Add dialog', async ({ page }) => {
    const day = denverToday()
    const [me, brewer2] = [await userId(await apiAs('brewer1')), await userId(await apiAs('brewer2'))]
    await openBoard(page)
    await page.getByTestId(`day-add-${day}`).click()
    await page.getByTestId('task-title-input').fill(tempTag('S216 add'))
    await toggleAssignees(page, [me, brewer2])
    const saved = boardWrite(page, /^\/api\/boards\/brewery\/tasks$/)
    await saveDialog(page).click()
    const task = (await (await saved).json()).data
    created.push(task.id)
    expect(ids(task)).toEqual([me, brewer2])
  })

  test('up to three sets of initials, then +N; the tooltip names everyone', async ({ page }) => {
    const api = await apiAs('brewer1')
    const day = denverToday()
    const people = await Promise.all((['brewer1', 'brewer2', 'floater', 'breweryMgr'] as const).map(async (p) => userId(await apiAs(p))))
    const task = await createTask(api, { title: tempTag('Four people'), due_on: day, assignee_ids: people })
    created.push(task.id)

    await openBoard(page)
    const key = `${task.id}:${day}`
    await expect(page.getByTestId(`task-assignee-${key}`)).toHaveText('JB')
    await expect(page.getByTestId(`task-assignee-${key}-2`)).toHaveText('JF')
    await expect(page.getByTestId(`task-assignee-${key}-3`)).toHaveCount(0)
    await expect(page.getByTestId(`task-assignee-more-${key}`)).toHaveText('+1')
    // First browser run: beside the title they squeezed it to a letter per line and ran off the card.
    const box = async (id: string) => (await page.getByTestId(id).boundingBox())!
    const [whole, words, more] = [await box(`task-${key}`), await box(`task-title-${key}`), await box(`task-assignee-more-${key}`)]
    expect(words.width).toBeGreaterThan(whole.width * 0.5)
    expect(more.x + more.width).toBeLessThanOrEqual(whole.x + whole.width)
    await page.getByTestId(`task-assignees-${key}`).hover()
    await expect(page.getByRole('tooltip')).toHaveText('Jake Brewer, Riley Wort, Jordan Float, Morgan Mash')
  })

  test('the menu names everyone; emptying the list is unassigned', async ({ page }) => {
    const api = await apiAs('brewer1')
    const day = denverToday()
    const [me, brewer2] = [await userId(api), await userId(await apiAs('brewer2'))]
    const task = await createTask(api, { title: tempTag('Menu'), due_on: day, assignee_ids: [me, brewer2] })
    created.push(task.id)

    await openBoard(page)
    await card(page, task.id, day).getByTestId(`task-title-${task.id}:${day}`).click()
    await expect(page.getByTestId('task-menu-header')).toContainText('Jake Brewer, Riley Wort')
    await page.getByTestId('task-menu-edit').click()

    // "Anyone" clears everybody and closes the list.
    await page.getByTestId('task-assignee-select').click()
    await page.getByTestId('task-assignee-anyone').click()
    await expect(page.getByTestId('task-assignee-select')).toHaveText('Anyone')
    const saved = boardWrite(page, new RegExp(`^/api/boards/brewery/tasks/${task.id}$`), 'PATCH')
    await saveDialog(page).click()
    expect((await saved).request().postDataJSON()).toEqual({ assignee_ids: [] })

    await page.reload()
    await expect(page.getByTestId(`task-assignees-${task.id}:${day}`)).toHaveCount(0)
    expect(ids(await cardOn(api, task.id, day))).toEqual([])
  })

  test('lead decision 3: people who stay keep their order and a new one goes last', async ({ page }) => {
    const api = await apiAs('brewer1')
    const day = denverToday()
    const [me, brewer2, floater] = [await userId(api), await userId(await apiAs('brewer2')), await userId(await apiAs('floater'))]
    const task = await createTask(api, { title: tempTag('Order'), due_on: day, assignee_ids: [brewer2, me] })
    created.push(task.id)

    await openBoard(page)
    await openEdit(page, task.id, day)
    await toggleAssignees(page, [floater])
    const saved = boardWrite(page, new RegExp(`^/api/boards/brewery/tasks/${task.id}$`), 'PATCH')
    await saveDialog(page).click()
    expect((await saved).request().postDataJSON()).toEqual({ assignee_ids: [brewer2, me, floater] })
    expect((await cardOn(api, task.id, day)).assignee_id).toBe(brewer2)
  })

  test('lead decision 3: off and on again is the same people, so Save just closes', async ({ page }) => {
    const api = await apiAs('brewer1')
    const day = denverToday()
    const [me, brewer2] = [await userId(api), await userId(await apiAs('brewer2'))]
    const task = await createTask(api, { title: tempTag('Off and on'), due_on: day, assignee_ids: [me, brewer2] })
    created.push(task.id)

    await openBoard(page)
    await openEdit(page, task.id, day)
    let wrote = false
    page.on('request', (r) => {
      if (r.method() === 'PATCH' && r.url().includes(`/tasks/${task.id}`)) wrote = true
    })
    // Takes the first person off and puts them back, which puts them last.
    await toggleAssignees(page, [me, me])
    await saveDialog(page).click()
    await expect(page.getByTestId('task-dialog')).toHaveCount(0)
    expect(wrote).toBe(false)
    expect(ids(await cardOn(api, task.id, day))).toEqual([me, brewer2])
  })

  test('lead decision 3: another order through the API changes nothing and logs nothing', async () => {
    const api = await apiAs('brewer1')
    const day = denverToday()
    const [me, brewer2] = [await userId(api), await userId(await apiAs('brewer2'))]
    const task = await createTask(api, { title: tempTag('API order'), due_on: day, assignee_ids: [me, brewer2] })
    created.push(task.id)

    const res = await api.patch(`/api/boards/brewery/tasks/${task.id}`, { data: { assignee_ids: [brewer2, me] } })
    expect(res.status(), await res.text()).toBe(200)
    const body = (await res.json()).data
    expect(ids(body)).toEqual([me, brewer2])
    expect(body.assignee_id).toBe(me)

    const history = await (await apiAs('breweryMgr')).get('/api/boards/brewery/tasks/history', { params: { task_id: task.id } })
    const actions = ((await history.json()).data as { action: string }[]).map((e) => e.action)
    expect(actions).toEqual(['created'])
  })

  test('S219: a weekly series with two people; a "following" edit changes both for later ones', async ({ page }) => {
    const api = await apiAs('brewer1')
    const start = denverToday()
    const [me, brewer2, floater] = [await userId(api), await userId(await apiAs('brewer2')), await userId(await apiAs('floater'))]
    const res = await api.post('/api/boards/brewery/tasks', {
      data: { title: tempTag('S219'), due_on: start, repeat: 'weekly', repeat_weekdays: [isoWeekday(start)], assignee_ids: [me, brewer2] },
    })
    expect(res.status(), await res.text()).toBe(201)
    const first = (await res.json()).data
    created.push(first.id)
    const [w1, w2] = [addDays(start, 7), addDays(start, 14)]

    const occurrence = (from: ApiCard[], day: string) => from.find((c) => c.title === first.title && c.due_on === day)!
    const on = async (day: string) => occurrence((await getBoard(api, day, day)).days[0].cards, day)

    // New occurrences carry both.
    expect(ids(await on(w1))).toEqual([me, brewer2])
    const series = await (await api.get(`/api/boards/brewery/tasks/${first.id}/series`)).json()
    expect(ids(series.data)).toEqual([me, brewer2])

    // From w1 on: floater instead of brewer2.
    await openBoard(page, { from: start, to: w2 })
    const edited = await on(w1)
    await openEdit(page, edited.id, w1)
    await toggleAssignees(page, [brewer2, floater])
    await saveDialog(page).click()
    const saved = boardWrite(page, new RegExp(`^/api/boards/brewery/tasks/${edited.id}$`), 'PATCH')
    await page.getByTestId('series-scope-following').click()
    expect((await saved).request().postDataJSON()).toEqual({ assignee_ids: [me, floater], scope: 'following' })

    await page.reload()
    await expect(page.getByTestId('board-grid')).toBeVisible()
    expect(ids(await on(start))).toEqual([me, brewer2])
    expect(ids(await on(w1))).toEqual([me, floater])
    expect(ids(await on(w2))).toEqual([me, floater])
  })

  test('QA gap 1: adding a day from the dialog leaves everyone on their own dates', async ({ page }) => {
    const api = await apiAs('brewer1')
    const [me, brewer2, floater] = [await userId(api), await userId(await apiAs('brewer2')), await userId(await apiAs('floater'))]
    // A Monday more than a week ahead, so every date below is still open.
    const today = denverToday()
    const monday = addDays(today, 8 - isoWeekday(today) + 7)
    const res = await api.post('/api/boards/brewery/tasks', {
      data: { title: tempTag('Gap1'), due_on: monday, repeat: 'weekly', repeat_weekdays: [1, 3, 5], assignee_ids: [me, brewer2] },
    })
    expect(res.status(), await res.text()).toBe(201)
    const first = (await res.json()).data
    created.push(first.id)
    const on = async (day: string) => (await getBoard(api, day, day)).days[0].cards.find((c) => c.title === first.title && c.due_on === day)!
    const following = async (day: string, data: Record<string, unknown>) => {
      const r = await api.patch(`/api/boards/brewery/tasks/${(await on(day)).id}`, { data: { ...data, scope: 'following' } })
      expect(r.status(), await r.text()).toBe(200)
    }
    const [mon2, wed2, fri2, mon3, tue3] = [7, 9, 11, 14, 15].map((n) => addDays(monday, n))
    await following(mon2, { assignee_ids: [floater] })
    await following(mon3, { assignee_ids: [brewer2] })

    // Wed of week 2 shows the floater. Add Tuesday and leave the people alone.
    await openBoard(page, { from: wed2, to: wed2 })
    const wed = await on(wed2)
    await openEdit(page, wed.id, wed2)
    await expect(page.getByTestId(`task-assignee-chip-${floater}`)).toBeVisible()
    await page.getByTestId('task-repeat-day-2').click()
    await saveDialog(page).click()
    await expect(page.getByTestId('remove-later-note')).toHaveText('The new pattern remakes them. Dates that stay keep their people. New dates take them from the last regular occurrence.')
    const saved = boardWrite(page, new RegExp(`^/api/boards/brewery/tasks/${wed.id}$`), 'PATCH')
    await page.getByTestId('remove-later-confirm').click()
    const write = await saved
    expect(write.request().postDataJSON()).not.toHaveProperty('assignee_ids')
    expect(write.status()).toBe(200)

    expect(ids(await on(monday))).toEqual([me, brewer2])
    expect(ids(await on(wed2))).toEqual([floater])
    expect(ids(await on(fri2))).toEqual([floater])
    expect(ids(await on(mon3))).toEqual([brewer2])
    expect(ids(await on(tue3))).toEqual([brewer2])
  })

  test('A UI tab on the old version: a lone assignee_id writes and reads back', async () => {
    const api = await apiAs('brewer1')
    const brewer2 = await userId(await apiAs('brewer2'))
    const task = await createTask(api, { title: tempTag('Old tab'), due_on: denverToday(), assignee_id: brewer2 })
    created.push(task.id)
    expect(task.assignee_id).toBe(brewer2)
    expect(ids(task)).toEqual([brewer2])

    const res = await api.patch(`/api/boards/brewery/tasks/${task.id}`, { data: { assignee_id: null } })
    expect(res.status(), await res.text()).toBe(200)
    const body = (await res.json()).data
    expect(body.assignee_id).toBeNull()
    expect(body.assignee_name).toBeNull()
    expect(body.assignees).toEqual([])
  })

  test('§3.3: a refusal names the person; nothing changes', async () => {
    const api = await apiAs('brewer1')
    const bartender = await userId(await apiAs('bartender1'))
    const me = await userId(api)
    const res = await api.post('/api/boards/brewery/tasks', { data: { title: tempTag('Refused'), assignee_ids: [me, bartender] } })
    expect(res.status()).toBe(422)
    expect((await res.json()).errors.assignee_ids).toEqual(['Sam Pour must be a Brewery member'])
  })
})

test.describe('as brewer2', () => {
  test.use({ storageState: authFile('brewer2') })

  test('S217: My tasks shows a shared task for second place too; Unassigned does not', async ({ page }) => {
    const brewer1 = await apiAs('brewer1')
    const day = denverToday()
    const [me, other] = [await userId(await apiAs('brewer2')), await userId(brewer1)]
    const task = await createTask(brewer1, { title: tempTag('S217'), due_on: day, assignee_ids: [other, me] })
    const theirs = await createTask(brewer1, { title: tempTag('S217 theirs'), due_on: day, assignee_ids: [other] })
    created.push(task.id, theirs.id)

    await openBoard(page)
    await pickSetting(page, 'board-settings', 'board-filter', 'mine')
    await expect(card(page, task.id, day)).toBeVisible()
    await expect(card(page, theirs.id, day)).toHaveCount(0)
    await pickSetting(page, 'board-settings', 'board-filter', 'unassigned')
    await expect(card(page, task.id, day)).toHaveCount(0)
  })
})

test.describe('as brewer1, the other half of S217', () => {
  test.use({ storageState: authFile('brewer1') })

  test('S217: the same shared task shows in first place', async ({ page }) => {
    const api = await apiAs('brewer1')
    const day = denverToday()
    const [me, brewer2] = [await userId(api), await userId(await apiAs('brewer2'))]
    const task = await createTask(api, { title: tempTag('S217 first'), due_on: day, assignee_ids: [me, brewer2] })
    created.push(task.id)

    await openBoard(page)
    await pickSetting(page, 'board-settings', 'board-filter', 'mine')
    await expect(card(page, task.id, day)).toBeVisible()
  })
})

test.describe('as breweryMgr', () => {
  test.use({ storageState: authFile('breweryMgr') })

  test('S216: History reads "Assigned Riley Wort, Jordan Float to …", then "Removed …"', async ({ page }) => {
    const api = await apiAs('breweryMgr')
    const day = denverToday()
    const title = tempTag('S216 History')
    const task = await createTask(api, { title, due_on: day })
    created.push(task.id)
    const [brewer2, floater] = [await userId(await apiAs('brewer2')), await userId(await apiAs('floater'))]
    for (const list of [[brewer2, floater], [brewer2]]) {
      const res = await api.patch(`/api/boards/brewery/tasks/${task.id}`, { data: { assignee_ids: list } })
      expect(res.status(), await res.text()).toBe(200)
    }

    await openBoard(page)
    await settingsItem(page, 'board-settings', 'board-menu-history')
    const rows = page.getByTestId('history-list').locator(`li[data-task-id="${task.id}"]`)
    await expect(rows.nth(0)).toContainText(`Removed Jordan Float from ${title}`)
    await expect(rows.nth(1)).toContainText(`Assigned Riley Wort, Jordan Float to ${title}`)
  })

  test('S220: a linked task keeps its single picker and one person; two through the API → 422', async ({ page }) => {
    const made = new Made()
    try {
      const tank = await made.tank('FV')
      const brand = await made.brand('S220')
      const t = productionToday()
      const b = await made.plan({ brand_id: brand.id, template: '[SEED] Standard ale', brew_on: addDays(t, 2), tank_ids: [tank.id] })
      const fdh = stepOf(await batchOf(b.id), 'FDH')
      const api = await apiAs('breweryMgr')
      const board = await getBoard(api, fdh.due_on!, fdh.due_on!)
      const c = board.days[0].cards.find((x) => x.production?.step_id === fdh.id)!
      const [brewer1, brewer2] = [await userId(await apiAs('brewer1')), await userId(await apiAs('brewer2'))]

      const refused = await api.patch(`/api/boards/brewery/tasks/${c.id}`, { data: { assignee_ids: [brewer1, brewer2] } })
      expect(refused.status()).toBe(422)
      expect((await refused.json()).error).toBe('linked_task_assignees')

      await openBoard(page, { from: addDays(c.due_on!, -3), to: addDays(c.due_on!, 3) })
      await card(page, c.id, c.due_on!).click()
      await page.getByTestId('task-menu-edit').click()
      const dialog = page.getByTestId('task-dialog')
      await expect(dialog.getByTestId('task-dialog-linked')).toBeVisible()
      // One pick closes the list and goes to the step: the single picker, as before.
      await dialog.getByTestId('task-assignee-select').click()
      await page.getByTestId(`task-assignee-option-${brewer2}`).click()
      await expect(page.getByTestId(`task-assignee-option-${brewer1}`)).toHaveCount(0)
      await dialog.getByRole('button', { name: 'Save' }).click()
      await expect(dialog).toBeHidden()

      await page.reload()
      await expect(page.getByTestId(`task-assignee-${c.id}:${c.due_on}`)).toHaveText('RW')
      expect((await batchOf(b.id)).steps.find((s) => s.id === fdh.id)!.assignee_id).toBe(brewer2)
      expect(ids((await getBoard(api, c.due_on!, c.due_on!)).days[0].cards.find((x) => x.id === c.id)!)).toEqual([brewer2])
    } finally {
      await made.cleanup()
    }
  })

  test('someone who has left stays visible on a finished task until they are removed', async ({ page }) => {
    const api = await apiAs('breweryMgr')
    const owner = await apiAs('owner')
    const day = denverToday()
    let person: TempPerson | null = null
    try {
      person = await createTempPerson('D53 left', { ready: false, memberships: [{ department: 'brewery', role: 'employee' }] })
      const task = await createTask(api, { title: tempTag('Left'), due_on: day, assignee_ids: [person.id] })
      created.push(task.id)
      await completeTask(api, task.id)
      const left = await owner.put(`/api/users/${person.id}/memberships`, { data: { memberships: [{ department: 'bar', role: 'employee' }] } })
      expect(left.status(), await left.text()).toBe(200)

      await openBoard(page)
      await openEdit(page, task.id, day)
      await expect(page.getByTestId(`task-assignee-chip-${person.id}`)).toHaveText(person.name)
      await toggleAssignees(page, [person.id])
      await expect(page.getByTestId('task-assignee-select')).toHaveText('Anyone')
      const saved = boardWrite(page, new RegExp(`^/api/boards/brewery/tasks/${task.id}$`), 'PATCH')
      await saveDialog(page).click()
      await saved
      expect(ids(await cardOn(api, task.id, day))).toEqual([])
    } finally {
      await retireTempPerson(person)
    }
  })
})

test.describe('as owner', () => {
  test.use({ storageState: authFile('owner') })

  test('S218: Users & Roles → remove someone from the Brewery; the other person stays', async ({ page }) => {
    const owner = await apiAs('owner')
    const day = denverToday()
    const brewer1 = await userId(await apiAs('brewer1'))
    let person: TempPerson | null = null
    try {
      person = await createTempPerson('S218', {
        ready: false,
        memberships: [
          { department: 'bar', role: 'employee' },
          { department: 'brewery', role: 'employee' },
        ],
      })
      const shared = await createTask(owner, { title: tempTag('S218 shared'), due_on: day, assignee_ids: [person.id, brewer1] })
      const alone = await createTask(owner, { title: tempTag('S218 alone'), due_on: day, assignee_ids: [person.id] })
      created.push(shared.id, alone.id)

      await openUser(page, person.name)
      const dialog = page.getByRole('dialog')
      await dialog.getByRole('combobox', { name: 'Brewery' }).click()
      await page.getByRole('option', { name: '— None —' }).click()
      await dialog.getByRole('button', { name: 'Save' }).click()
      await expect(dialog).toBeHidden()

      const after = await cardOn(owner, shared.id, day)
      expect(ids(after)).toEqual([brewer1])
      // The next person is now the first, and the old field follows.
      expect(after.assignee_id).toBe(brewer1)
      expect(ids(await cardOn(owner, alone.id, day))).toEqual([])

      await openBoard(page)
      await settingsItem(page, 'board-settings', 'board-menu-history')
      await expect(page.getByTestId('history-dialog').locator(`li[data-task-id="${shared.id}"]`).first()).toContainText(`Removed ${person.name} from`)
    } finally {
      await retireTempPerson(person)
    }
  })
})

test.describe('the brewhouse tablet', () => {
  test.use({ storageState: authFile('breweryDevice') })

  let brewer: { person: TempPerson; code: string } | null = null

  test.beforeAll(async () => {
    const person = await createTempPerson('D53 tablet', { ready: false, memberships: [{ department: 'brewery', role: 'employee' }] })
    const mgr = await apiAs('breweryMgr')
    const code = (await (await mgr.get('/api/staff_codes/suggest')).json()).data.code as string
    const res = await mgr.put(`/api/users/${person.id}/staff_code`, { data: { code } })
    expect(res.status(), await res.text()).toBe(200)
    brewer = { person, code }
  })
  test.afterAll(async () => {
    await retireTempPerson(brewer?.person ?? null)
  })

  test('S222: adds two people with a staff code; saved, and History names the acting person', async ({ page }) => {
    const day = denverToday()
    const mgr = await apiAs('breweryMgr')
    const task = await createTask(mgr, { title: tempTag('S222'), due_on: day })
    created.push(task.id)
    const [brewer1, brewer2] = [await userId(await apiAs('brewer1')), await userId(await apiAs('brewer2'))]

    await page.goto('/tasks/brewery')
    await expect(page.getByTestId('board-grid')).toBeVisible({ timeout: 20_000 })
    await openEdit(page, task.id, day)
    await toggleAssignees(page, [brewer1, brewer2])
    await saveDialog(page).click()
    await expect(page.getByTestId('acting-code-dialog')).toBeVisible()
    await page.getByTestId('acting-staff-code').fill(brewer!.code)
    await page.getByTestId('acting-submit').click()
    await expect(page.getByTestId('task-dialog')).toHaveCount(0)

    await page.reload()
    await expect(page.getByTestId(`task-assignee-${task.id}:${day}`)).toHaveText('JB')
    await expect(page.getByTestId(`task-assignee-${task.id}:${day}-1`)).toHaveText('RW')
    expect(ids(await cardOn(mgr, task.id, day))).toEqual([brewer1, brewer2])

    const res = await mgr.get('/api/boards/brewery/tasks/history', { params: { task_id: task.id } })
    const [latest] = (await res.json()).data as { action: string; actor_name: string; on_shared_device: boolean }[]
    expect(latest).toMatchObject({ action: 'assigned', actor_name: brewer!.person.name, on_shared_device: true })
  })
})

test.describe('at phone width', () => {
  test.use({ storageState: authFile('brewer1'), viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true })

  test.beforeEach(async () => {
    expect((await putBoardSettings('brewer1', 'brewery', { phone_view: 'day' })).status).toBe(200)
  })

  test("the Dashboard's Today's tasks shows everyone, together, and leaves the title its room", async ({ page }) => {
    const api = await apiAs('brewer1')
    const day = denverToday()
    const people = await Promise.all((['brewer1', 'brewer2', 'floater', 'breweryMgr'] as const).map(async (p) => userId(await apiAs(p))))
    const task = await createTask(api, { title: tempTag('Dashboard'), due_on: day, assignee_ids: people })
    created.push(task.id)
    // The card lists the day's first five open tasks.
    const top = (await getBoard(api, day, day)).days[0].cards[0].id
    expect((await api.post(`/api/boards/brewery/tasks/${task.id}/move`, { data: { due_on: day, before_id: top } })).status()).toBe(200)

    await page.goto('/brewery')
    const chips = page.getByTestId(`todays-task-people-${task.id}`)
    await expect(chips.locator('[data-testid^="todays-task-person-"]')).toHaveCount(4)
    await expect(page.getByTestId(`todays-task-person-${task.id}-${people[0]}`)).toHaveText('JB')
    // First browser run: the chips took the row and split around a title squeezed to 8 lines.
    const row = (await page.getByTestId(`todays-task-person-${task.id}-${people[0]}`).boundingBox())!
    const last = (await page.getByTestId(`todays-task-person-${task.id}-${people[3]}`).boundingBox())!
    expect(last.y).toBe(row.y)
    const words = (await page.getByText(task.title).boundingBox())!
    expect(words.width).toBeGreaterThan(140)
  })

  test('QA gap 10: a long name wraps in the people list; nothing is cut off', async ({ page }) => {
    const api = await apiAs('brewer1')
    const day = denverToday()
    const person = await createTempPerson('Maximiliana Featherstonehaugh-Cholmondeley Wolfeschlegelsteinhausen', { memberships: [{ department: 'brewery', role: 'employee' }] })
    const task = await createTask(api, { title: tempTag('LongName'), due_on: day })
    created.push(task.id)
    try {
      await page.goto('/')
      await openBoard(page)
      await openEdit(page, task.id, day)
      await page.getByTestId('task-assignee-select').click()
      const option = page.getByTestId(`task-assignee-option-${person.id}`)
      await expect(option).toBeVisible()
      const fit = await option.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth, right: el.getBoundingClientRect().right, wide: window.innerWidth }))
      expect(fit.scroll).toBeLessThanOrEqual(fit.client)
      expect(fit.right).toBeLessThanOrEqual(fit.wide)
    } finally {
      await retireTempPerson(person)
    }
  })

  test('back closes the list first, then the dialog; the dialog stays usable', async ({ page }) => {
    const api = await apiAs('brewer1')
    const day = denverToday()
    const [me, brewer2] = [await userId(api), await userId(await apiAs('brewer2'))]
    const task = await createTask(api, { title: tempTag('Phone'), due_on: day, assignee_ids: [me] })
    created.push(task.id)

    await page.goto('/')
    await openBoard(page)
    await openEdit(page, task.id, day)
    await page.getByTestId('task-assignee-select').click()
    await page.getByTestId(`task-assignee-option-${brewer2}`).click()
    await expect(page.getByTestId(`task-assignee-option-${brewer2}`)).toBeVisible()

    await page.goBack()
    await expect(page.getByTestId(`task-assignee-option-${brewer2}`)).toHaveCount(0)
    await expect(page.getByTestId('task-dialog')).toBeVisible()
    await expect(page.getByTestId(`task-assignee-chip-${brewer2}`)).toBeVisible()
    await expect(page).toHaveURL(/\/tasks\/brewery/)

    await page.goBack()
    await expect(page.getByTestId('task-dialog')).toHaveCount(0)
    await expect(page).toHaveURL(/\/tasks\/brewery/)
    await expect(page.getByTestId('board-grid')).toBeVisible()
    // Closed without Save: nothing changed.
    expect(ids(await cardOn(api, task.id, day))).toEqual([me])
  })
})
