import { test, expect, type Page } from '@playwright/test'
import { authFile, type PersonaKey } from '../../config/test-env'
import { createTempPerson, retireTempPerson, type TempPerson } from '../auth/helpers'
import { openUser } from '../taproom/helpers'
import { OWNERS, apiAs, channelNames, denverToday, membershipsOf, openTaskBoard, status, switcherEntries, userId } from './helpers'

// D59 §5, the people Owners is private from: dualMgr (manages Taproom and
// Office; O5, O6, O7), office1 (an Office employee, not in Owners; O10's
// "doesn't see it"), and the Taproom tablet (O12). Each asserts what the person
// sees (switchers, channel list, a typed URL) and the API's answer. Runs in the
// one-worker `owners` project.

test.use({ viewport: { width: 1600, height: 1100 } })
test.describe.configure({ mode: 'default', timeout: 60_000 })

const range = `from=${denverToday()}&to=${denverToday()}`

/** What a non-member sees and gets: no Owners in any list, typed URLs go elsewhere, the API refuses. */
async function refusedEverywhere(page: Page, persona: PersonaKey, home: string, boards: string[], ideaBoards: string[]) {
  await openTaskBoard(page, `/tasks/${home}`)
  // One board: no switcher at all (D41 S101).
  if (boards.length === 1) await expect(page.getByTestId('board-switcher')).toHaveCount(0)
  else expect(await switcherEntries(page)).toEqual(boards)
  // A typed /tasks/owners lands on their own first board, as for any board they aren't in (D41 S102).
  await page.goto('/tasks/owners')
  await expect(page).toHaveURL(new RegExp(`/tasks/${boards[0] === 'Taproom' ? 'bar' : boards[0].toLowerCase()}$`))
  await expect(page.getByTestId('board-title')).not.toHaveText('Owners tasks')

  await page.goto(`/boards/${home}`)
  await expect(page.getByTestId('idea-board')).toBeVisible({ timeout: 20_000 })
  expect(await switcherEntries(page)).toEqual(ideaBoards)
  await page.goto('/boards/owners')
  await expect(page.getByTestId('idea-board')).toBeVisible({ timeout: 20_000 })
  await expect(page).not.toHaveURL(/\/boards\/owners/)

  expect(await channelNames(page)).not.toContain('Owners')
  await page.goto('/messages/dept:owners')
  await expect(page.getByTestId('channel-not-found')).toBeVisible()
  await expect(page.getByRole('textbox')).toHaveCount(0)

  expect(await status(persona, 'GET', `/api/boards/${OWNERS}/tasks?${range}`)).toBe(403)
  expect(await status(persona, 'POST', `/api/boards/${OWNERS}/tasks`, { title: '[TEST-TEMP] never', due_on: denverToday() })).toBe(403)
  expect(await status(persona, 'GET', `/api/idea_boards/${OWNERS}/lists`)).toBe(403)
  expect(await status(persona, 'GET', '/api/channels/dept:owners/messages')).toBe(403)
  expect(await status(persona, 'POST', '/api/channels/dept:owners/messages', { body: '[TEST-TEMP] never' })).toBe(403)
  const channels = (await (await (await apiAs(persona)).get('/api/channels')).json()).data as { key: string }[]
  expect(channels.map((c) => c.key)).not.toContain('dept:owners')
}

test.describe('dualMgr', () => {
  test.use({ storageState: authFile('dualMgr') })

  test('O5: Owners in none of Tasks, Boards or Messages; typed URLs refused; the API 403s', async ({ page }) => {
    await refusedEverywhere(page, 'dualMgr', 'bar', ['Taproom', 'Office'], ['Taproom', 'Office', 'Company'])
    const me = (await (await (await apiAs('dualMgr')).get('/api/me')).json()) as { task_boards: { key: string }[]; idea_boards: { key: string }[] }
    expect(me.task_boards.map((b) => b.key)).not.toContain(OWNERS)
    expect(me.idea_boards.map((b) => b.key)).not.toContain(OWNERS)
  })

  test('O6: editing ownersAsst shows Owners as a read-only chip; Save sends Office only; Owners stays', async ({ page }) => {
    const before = await membershipsOf('ownersAsst')
    expect(before).toEqual([
      { department: 'office', role: 'employee' },
      { department: 'owners', role: 'employee' },
    ])
    await openUser(page, 'Ellis Assist')
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('combobox', { name: 'Office' })).toBeVisible()
    await expect(dialog.getByRole('combobox', { name: 'Owners' })).toHaveCount(0)
    await expect(dialog.getByText('Owners member', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Only owners change Owners membership.')).toBeVisible()

    const put = page.waitForResponse((r) => /\/api\/users\/\d+\/memberships$/.test(r.url()) && r.request().method() === 'PUT')
    await dialog.getByRole('button', { name: 'Save' }).click()
    const res = await put
    expect(res.status(), await res.text()).toBe(200)
    expect(res.request().postDataJSON().memberships).toEqual([{ department: 'office', role: 'employee' }])
    await expect(dialog).toBeHidden()
    expect(await membershipsOf('ownersAsst')).toEqual(before)
  })

  test.describe('O6 with a real Office change', () => {
    let person: TempPerson | null = null
    test.afterAll(async () => retireTempPerson(person))

    test('O6: dualMgr makes a [TEST-TEMP] Office + Owners person an Office manager; it saves and Owners stays', async ({ page }) => {
      person = await createTempPerson('O6', {
        ready: false,
        schedulable: false,
        memberships: [
          { department: 'office', role: 'employee' },
          { department: 'owners', role: 'employee' },
        ],
      })
      await openUser(page, person.name)
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Owners member', { exact: true })).toBeVisible()
      await dialog.getByRole('combobox', { name: 'Office' }).click()
      await page.getByRole('option', { name: 'Manager' }).click()
      const put = page.waitForResponse((r) => /\/api\/users\/\d+\/memberships$/.test(r.url()) && r.request().method() === 'PUT')
      await dialog.getByRole('button', { name: 'Save' }).click()
      const res = await put
      expect(res.status(), await res.text()).toBe(200)
      expect(res.request().postDataJSON().memberships).toEqual([{ department: 'office', role: 'manager' }])

      const users = (await (await (await apiAs('owner')).get('/api/users')).json()).data as { id: number; memberships: { department_key: string; role: string }[] }[]
      const ms = users.find((u) => u.id === person!.id)!.memberships.map((m) => [m.department_key, m.role]).sort()
      expect(ms).toEqual([
        ['office', 'manager'],
        ['owners', 'employee'],
      ])
    })
  })

  test('O7: dualMgr adding themselves to Owners through the API → 403, nothing changed (also with an Office change in the same request)', async () => {
    const before = await membershipsOf('dualMgr')
    const api = await apiAs('dualMgr')
    const me = await userId(api)
    try {
      for (const memberships of [
        [
          { department: 'bar', role: 'manager' },
          { department: 'office', role: 'manager' },
          { department: 'owners', role: 'employee' },
        ],
        [
          { department: 'bar', role: 'manager' },
          { department: 'office', role: 'employee' },
          { department: 'owners', role: 'employee' },
        ],
      ]) {
        const res = await api.put(`/api/users/${me}/memberships`, { data: { memberships } })
        expect(res.status(), await res.text()).toBe(403)
        expect(await membershipsOf('dualMgr')).toEqual(before)
      }
    } finally {
      // Only if the refusal failed: put dualMgr back as the persona is.
      if (JSON.stringify(await membershipsOf('dualMgr')) !== JSON.stringify(before)) {
        await (await apiAs('owner')).put(`/api/users/${me}/memberships`, { data: { memberships: before } })
      }
    }
  })
})

test.describe('office1 (Office, not in Owners)', () => {
  test.use({ storageState: authFile('office1') })

  test('O10/O5: no Owners board, Idea Board or channel; typed URLs refused; the API 403s', async ({ page }) => {
    await refusedEverywhere(page, 'office1', 'office', ['Office'], ['Office', 'Company'])
  })
})

test.describe('taproomDevice', () => {
  test.use({ storageState: authFile('taproomDevice') })

  test('O12: typed /tasks/owners and /boards/owners go to the Taproom boards; /messages/dept:owners is "Not available on a shared device"; the API 403s', async ({ page }) => {
    await page.goto('/tasks/owners')
    await expect(page).toHaveURL(/\/tasks\/bar$/)
    await expect(page.getByTestId('board-title')).toHaveText('Taproom tasks')

    await page.goto('/boards/owners')
    await expect(page).toHaveURL(/\/boards\/bar$/)
    await expect(page.getByTestId('idea-board')).toBeVisible({ timeout: 20_000 })

    await page.goto('/messages/dept:owners')
    await expect(page.getByTestId('device-not-available')).toBeVisible()

    expect(await status('taproomDevice', 'GET', `/api/boards/${OWNERS}/tasks?${range}`)).toBe(403)
    expect(await status('taproomDevice', 'GET', `/api/idea_boards/${OWNERS}/lists`)).toBe(403)
    expect(await status('taproomDevice', 'GET', '/api/channels/dept:owners/messages')).toBe(403)
    // The same answer as another non-home board.
    expect(await status('taproomDevice', 'GET', `/api/boards/brewery/tasks?${range}`)).toBe(403)
  })
})
