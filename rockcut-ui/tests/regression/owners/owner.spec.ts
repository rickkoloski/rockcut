import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { boardWrite, toggleAssignees } from '../brewery/taskBoardHelpers'
import { createTempPerson, retireTempPerson, type TempPerson } from '../auth/helpers'
import { createDevice, deleteDevices } from '../devices/helpers'
import { denverUtc, openScheduler } from '../scheduler/helpers'
import { openUser } from '../taproom/helpers'
import { choiceOptions, settingsItem } from '../settingsMenu'
import {
  OWNERS,
  addDays,
  apiAs,
  channelNames,
  cleanupOwners,
  denverToday,
  deptId,
  membershipsOf,
  openTaskBoard,
  ownersCards,
  ownersTask,
  pageAs,
  rememberOwnersTask,
  switcherEntries,
  tempTag,
  userId,
} from './helpers'

// D59 §5 as the owner: O1 (a task on the Owners board for owner2 and
// ownersAsst; owners offered only on the Owners board, decision 8), O2 (office1
// into Owners and out again), O8 (no managers in Owners), O9 (no Owners on the
// schedule), O11 (not a device home), O13 (All departments), and Owners last in
// each list (§4.4). Runs in the one-worker `owners` project.

test.use({ storageState: authFile('owner'), viewport: { width: 1600, height: 1100 } })
test.describe.configure({ mode: 'default', timeout: 60_000 })

test.afterEach(cleanupOwners)

const saveDialog = (page: Page) => page.getByTestId('task-dialog').getByRole('button', { name: 'Save' })
const owners = /^Owners$/

test('O1: Tasks → switcher → Owners; a task for owner2 and ownersAsst saves with both; no schedule header', async ({ page }) => {
  const today = denverToday()
  const [owner, owner2, asst] = [await userId(await apiAs('owner')), await userId(await apiAs('owner2')), await userId(await apiAs('ownersAsst'))]

  await openTaskBoard(page, '/tasks/brewery')
  // §4.4: Owners after the other boards, All departments last.
  expect(await switcherEntries(page)).toEqual(['Brewery', 'Taproom', 'Office', 'Sales', 'Owners', 'All departments'])
  await page.getByTestId('board-switcher').click()
  await page.getByTestId(`board-switch-${OWNERS}`).click()
  await expect(page).toHaveURL(/\/tasks\/owners$/)
  await expect(page.getByTestId('board-title')).toHaveText('Owners tasks')
  await expect(page.getByTestId(`day-${today}`)).toBeVisible()
  // §4.2: no shifts, so no "who's working" header on any day.
  await expect(page.locator('[data-testid^="day-header-"]')).toHaveCount(0)
  expect((await ownersCards('owner')).headers.every((h) => h === null)).toBe(true)

  await page.getByTestId(`day-add-${today}`).click()
  await page.getByTestId('task-title-input').fill(tempTag('O1 Bank call'))
  // Decision 8: the owners are offered on the Owners board, with its members.
  await page.getByTestId('task-assignee-select').click()
  for (const id of [owner, owner2, asst]) await expect(page.getByTestId(`task-assignee-option-${id}`)).toBeVisible()
  await page.keyboard.press('Escape')
  await toggleAssignees(page, [owner2, asst])
  const saved = boardWrite(page, /^\/api\/boards\/owners\/tasks$/)
  await saveDialog(page).click()
  const res = await saved
  const task = (await res.json()).data as { id: number; assignees: { id: number }[] }
  rememberOwnersTask(task.id)
  expect(task.assignees.map((p) => p.id)).toEqual([owner2, asst])

  await page.reload()
  const key = `${task.id}:${today}`
  await expect(page.getByTestId(`task-assignee-${key}`)).toHaveText('AO')
  await expect(page.getByTestId(`task-assignee-${key}-1`)).toHaveText('EA')
  const card = (await ownersCards('ownersAsst')).cards.find((c) => c.id === task.id)!
  expect(card.assignees.map((p) => p.name)).toEqual(['Avery Owner', 'Ellis Assist'])
})

test('Decision 8: owners are not offered on another board (Taproom: members only)', async ({ page }) => {
  const [owner2, bartender2] = [await userId(await apiAs('owner2')), await userId(await apiAs('bartender2'))]
  await openTaskBoard(page, '/tasks/bar')
  await page.getByTestId(`day-add-${denverToday()}`).click()
  await page.getByTestId('task-assignee-select').click()
  await expect(page.getByTestId(`task-assignee-option-${bartender2}`)).toBeVisible()
  await expect(page.getByTestId(`task-assignee-option-${owner2}`)).toHaveCount(0)
  await page.keyboard.press('Escape')
})

test.describe('O2: office1 into Owners', () => {
  // Put office1 back however the test ends: Office employee only.
  test.afterAll(async () => {
    const owner = await apiAs('owner')
    const id = await userId(await apiAs('office1'))
    const res = await owner.put(`/api/users/${id}/memberships`, { data: { memberships: [{ department: 'office', role: 'employee' }] } })
    expect(res.status(), await res.text()).toBe(200)
    expect(await membershipsOf('office1')).toEqual([{ department: 'office', role: 'employee' }])
  })

  test('O2: the owner adds office1 to Owners (member only, no manager choice); office1 then sees Owners in Tasks, Boards and Messages; removed again', async ({
    page,
    browser,
  }) => {
    expect(await membershipsOf('office1')).toEqual([{ department: 'office', role: 'employee' }])

    await openUser(page, 'Pat Ledger')
    const dialog = page.getByRole('dialog')
    const ownersRole = dialog.getByRole('combobox', { name: 'Owners' })
    await expect(dialog.getByText('Owners has no managers.')).toBeVisible()
    await ownersRole.click()
    // No Manager option in Owners (§4.3).
    await expect(page.getByRole('listbox').getByRole('option')).toHaveText(['— None —', 'Member'])
    await page.getByRole('option', { name: 'Member' }).click()
    const put = page.waitForResponse((r) => /\/api\/users\/\d+\/memberships$/.test(r.url()) && r.request().method() === 'PUT')
    await dialog.getByRole('button', { name: 'Save' }).click()
    const res = await put
    expect(res.status(), await res.text()).toBe(200)
    expect(res.request().postDataJSON().memberships).toEqual([
      { department: 'office', role: 'employee' },
      { department: 'owners', role: 'employee' },
    ])
    await expect(dialog).toBeHidden()
    expect(await membershipsOf('office1')).toEqual([
      { department: 'office', role: 'employee' },
      { department: 'owners', role: 'employee' },
    ])

    // office1 now has the Owners board, Idea Board and channel.
    const { context, page: office } = await pageAs(browser, 'office1')
    try {
      await openTaskBoard(office, '/tasks/office')
      expect(await switcherEntries(office)).toEqual(['Office', 'Owners'])
      await openTaskBoard(office, '/tasks/owners')
      await expect(office.getByTestId('board-title')).toHaveText('Owners tasks')

      await office.goto('/boards/office')
      await expect(office.getByTestId('idea-board')).toBeVisible({ timeout: 20_000 })
      expect(await switcherEntries(office)).toEqual(['Office', 'Owners', 'Company'])

      expect(await channelNames(office)).toContain('Owners')
      await office.goto('/messages/dept:owners')
      await expect(office.getByPlaceholder('Message Owners')).toBeVisible()
    } finally {
      await context.close()
    }

    // And out again through the same dialog.
    await openUser(page, 'Pat Ledger')
    await page.getByRole('dialog').getByRole('combobox', { name: 'Owners' }).click()
    await page.getByRole('option', { name: '— None —' }).click()
    const removed = page.waitForResponse((r) => /\/api\/users\/\d+\/memberships$/.test(r.url()) && r.request().method() === 'PUT')
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
    expect((await removed).status()).toBe(200)
    expect(await membershipsOf('office1')).toEqual([{ department: 'office', role: 'employee' }])
  })
})

test.describe('O8: no managers in Owners', () => {
  let person: TempPerson | null = null
  test.afterAll(async () => retireTempPerson(person))

  test('O8: memberships with owners as manager → 422 "Owners has no managers", nothing changed', async () => {
    person = await createTempPerson('O8', { ready: false, memberships: [{ department: 'office', role: 'employee' }] })
    const owner = await apiAs('owner')
    const res = await owner.put(`/api/users/${person.id}/memberships`, {
      data: {
        memberships: [
          { department: 'office', role: 'employee' },
          { department: 'owners', role: 'manager' },
        ],
      },
    })
    expect(res.status(), await res.text()).toBe(422)
    expect(await res.text()).toContain('Owners has no managers')
    const users = (await (await owner.get('/api/users')).json()).data as { id: number; memberships: { department_key: string; role: string }[] }[]
    expect(users.find((u) => u.id === person!.id)!.memberships.map((m) => [m.department_key, m.role])).toEqual([['office', 'employee']])
  })
})

test.describe('O9: Owners is not on the schedule', () => {
  test('O9 (UI): absent from the Scheduler filter and grid, the shift, event and positions dialogs, View Schedule and Calendar sync', async ({ page }) => {
    const ownersId = await deptId(await apiAs('owner'), OWNERS)
    const barId = await deptId(await apiAs('owner'), 'bar')

    await openScheduler(page)
    const filter = await choiceOptions(page, 'scheduler-settings', 'scheduler-department')
    expect(filter).toContain(`scheduler-department-${barId}`)
    expect(filter).not.toContain(`scheduler-department-${ownersId}`)
    await expect(page.getByRole('main').getByText(owners)).toHaveCount(0)

    // Add shift → Position: headings by department, none for Owners.
    await page.getByRole('button', { name: 'Add shift', exact: true }).click()
    await page.getByRole('dialog').getByRole('combobox', { name: 'Position' }).click()
    await expect(page.getByRole('listbox')).toBeVisible()
    await expect(page.getByRole('listbox')).toContainText('Taproom')
    await expect(page.getByRole('listbox').getByText(owners)).toHaveCount(0)
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()

    // Add event → Department.
    await page.getByTestId('add-event').click()
    await page.getByRole('dialog').getByRole('combobox', { name: 'Department' }).click()
    await expect(page.getByRole('listbox').getByRole('option', { name: 'Taproom' })).toBeVisible()
    await expect(page.getByRole('listbox').getByRole('option', { name: 'Owners' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()

    // Manage positions: the new-position Department, and no Owners color group.
    await settingsItem(page, 'scheduler-settings', 'scheduler-positions')
    const positions = page.getByRole('dialog', { name: 'Manage positions' })
    await expect(positions).toBeVisible()
    await expect(positions.getByText(owners)).toHaveCount(0)
    await positions.getByRole('combobox', { name: 'Department' }).click()
    await expect(page.getByRole('listbox').getByRole('option', { name: 'Taproom' })).toBeVisible()
    await expect(page.getByRole('listbox').getByRole('option', { name: 'Owners' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')

    await page.goto('/schedule')
    const viewFilter = await choiceOptions(page, 'schedule-settings', 'schedule-department')
    expect(viewFilter).toContain(`schedule-department-${barId}`)
    expect(viewFilter).not.toContain(`schedule-department-${ownersId}`)
    await settingsItem(page, 'schedule-settings', 'schedule-calendar-sync')
    const sync = page.getByRole('dialog', { name: 'Calendar sync' })
    await expect(sync.getByText('Taproom', { exact: false }).first()).toBeVisible()
    await expect(sync.getByText(/Owners/)).toHaveCount(0)
  })

  test('O9 (API): a position or event in Owners → 422; no Owners calendar feed, and rotating one → 404', async () => {
    const owner = await apiAs('owner')
    const ownersId = await deptId(owner, OWNERS)
    const refused = { department_id: ["Owners isn't on the schedule"] }

    const pos = await owner.post('/api/positions', { data: { name: tempTag('O9 Chair').slice(0, 60), department_id: ownersId } })
    if (pos.status() === 201) await owner.delete(`/api/positions/${(await pos.json()).data.id}`)
    expect(pos.status()).toBe(422)
    expect((await pos.json()).errors).toEqual(refused)

    const day = addDays(denverToday(), 40)
    const ev = await owner.post('/api/schedule_events', {
      data: { department_id: ownersId, title: tempTag('O9 Retreat'), starts_at: denverUtc(day, '18:00'), ends_at: denverUtc(day, '20:00') },
    })
    if (ev.status() === 201) await owner.delete(`/api/schedule_events/${(await ev.json()).data.id}`, { params: { scope: 'following' } })
    expect(ev.status()).toBe(422)
    expect((await ev.json()).errors).toMatchObject(refused)

    const feeds = (await (await owner.get('/api/calendar_feeds')).json()).data as { subject_type: string; subject_id: number | null }[]
    expect(feeds.some((f) => f.subject_type === 'department')).toBe(true)
    expect(feeds.some((f) => f.subject_type === 'department' && f.subject_id === ownersId)).toBe(false)
    const rotate = await owner.post('/api/calendar_feeds/rotate', { data: { subject_type: 'department', subject_id: ownersId } })
    expect(rotate.status()).toBe(404)
  })
})

test.describe('O11: Owners is not a device home', () => {
  let tag = ''
  test.afterAll(async () => {
    if (tag) await deleteDevices(await apiAs('owner'), tag)
  })

  test('O11: Shared devices → Home department leaves Owners out; the API refuses it on create and update (422)', async ({ page }) => {
    tag = tempTag('O11 tablet')
    const owner = await apiAs('owner')
    const ownersId = await deptId(owner, OWNERS)

    await page.goto('/devices')
    await page.getByTestId('add-device').click()
    await page.getByLabel('Home department').click()
    await expect(page.getByRole('option', { name: 'Taproom' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Owners' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()

    const created = await owner.post('/api/devices', { data: { name: `${tag} create`, home_department_id: ownersId } })
    expect(created.status(), await created.text()).toBe(422)
    expect(Object.keys((await created.json()).errors)).toEqual(['home_department_id'])

    const device = await createDevice(owner, `${tag} update`)
    const moved = await owner.patch(`/api/devices/${device.id}`, { data: { home_department_id: ownersId } })
    expect(moved.status(), await moved.text()).toBe(422)
    expect(Object.keys((await moved.json()).errors)).toEqual(['home_department_id'])
  })
})

test('O13: All departments shows the Owners tasks with the others, Owners after the rest', async ({ page }) => {
  const today = denverToday()
  const brew = await apiAs('owner')
  const brewTask = await brew.post('/api/boards/brewery/tasks', { data: { title: tempTag('O13 Brewery'), due_on: today } })
  expect(brewTask.status()).toBe(201)
  const brewId = (await brewTask.json()).data.id as number
  try {
    const task = await ownersTask('owner', 'O13 Insurance renewal')
    await openTaskBoard(page, '/tasks/brewery')
    await page.getByTestId('board-switcher').click()
    await page.getByTestId('board-switch-all').click()
    await expect(page).toHaveURL(/\/tasks\/all$/)
    const col = page.getByTestId(`day-${today}`)
    await expect(col.getByTestId(`section-${OWNERS}`).getByTestId(`task-${task.id}:${today}`)).toBeVisible()
    await expect(col.getByTestId('section-brewery').getByTestId(`task-${brewId}:${today}`)).toBeVisible()
    const keys = await col.locator('[data-department]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.department))
    expect(keys.at(-1)).toBe(OWNERS)
  } finally {
    await brew.delete(`/api/boards/brewery/tasks/${brewId}`)
  }
})

test('§4.4: Owners last in the Idea Boards (before Company), Messages and Users & Roles', async ({ page }) => {
  await page.goto('/boards/brewery')
  await expect(page.getByTestId('idea-board')).toBeVisible({ timeout: 20_000 })
  expect(await switcherEntries(page)).toEqual(['Brewery', 'Taproom', 'Office', 'Sales', 'Owners', 'Company'])

  const channels = await channelNames(page)
  const departments = channels.filter((c) => ['Brewery', 'Office', 'Owners', 'Sales', 'Taproom'].includes(c))
  expect(departments.at(-1)).toBe('Owners')

  // ownersAsst's roles: Office, then Owners.
  await page.goto('/users')
  const row = page.getByRole('row').filter({ hasText: 'Ellis Assist' })
  await expect(row).toContainText('Office: employee, Owners: employee')
})
