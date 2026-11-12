import { test, expect, type Page } from '@playwright/test'
import { authFile, personas, type PersonaKey } from '../../config/test-env'
import { apiAs, tempTag, userId } from '../brewery/taskBoardHelpers'
import { createTempPerson, retireTempPerson, type TempPerson } from '../auth/helpers'
import { openUser } from '../taproom/helpers'
import { settingsItem } from '../settingsMenu'

// D58 §3.3–§3.4, S7–S14: every manager sees every employee in Users & Roles.
// Lead decisions 1: a person's details, password, staff code and Active are
// a manager's only when they manage every department the person is in (any
// manager for someone with none, never an owner); otherwise the row is
// read-only except their role in the manager's departments and Add
// department. Owners stays hidden from managers; positions stop at the
// manager's departments.
// Writes go to `[TEST-TEMP]` people and positions only (removed by id); the
// seeded personas are only looked at, and refusals that would change one are
// tried on a `[TEST-TEMP]` stand-in.

// Lead decisions 1: neutral for everyone (DEV QA gap 6).
const DEACTIVATE_HINT = "You can't change Active for this person."

interface Row {
  id: number
  name: string
  active: boolean
  can_edit: boolean
  can_deactivate: boolean
  addable_departments: { key: string; name: string }[]
  memberships: { department_key: string; role: string; owners_only: boolean }[]
}

const people: TempPerson[] = []
const positionIds: number[] = []

test.afterAll(async () => {
  for (const p of people.splice(0)) await retireTempPerson(p)
  const owner = await apiAs('owner')
  for (const id of positionIds.splice(0)) await owner.delete(`/api/positions/${id}`)
})

/** A `[TEST-TEMP]` person in `departments` (as an employee), off the Scheduler roster. */
async function tempIn(label: string, departments: string[]) {
  const person = await createTempPerson(`D58 ${label}`, {
    schedulable: false,
    memberships: departments.map((department) => ({ department, role: 'employee' as const })),
  })
  people.push(person)
  return person
}

async function usersAs(persona: PersonaKey): Promise<Row[]> {
  const res = await (await apiAs(persona)).get('/api/users')
  expect(res.status()).toBe(200)
  return (await res.json()).data
}

const rowOf = async (persona: PersonaKey, id: number) => (await usersAs(persona)).find((u) => u.id === id)!
const departmentsOf = async (id: number) => (await rowOf('owner', id)).memberships.map((m) => m.department_key).sort()

async function status(persona: PersonaKey, method: string, path: string, data?: unknown) {
  return (await (await apiAs(persona)).fetch(path, { method, data })).status()
}

/** The Active switch's state in the open dialog, and its tooltip when greyed out. */
async function expectActiveGreyed(page: Page) {
  await expect(page.getByTestId('user-active-switch').getByRole('switch')).toBeDisabled()
  await page.getByTestId('user-active-switch').hover()
  await expect(page.getByRole('tooltip')).toHaveText(DEACTIVATE_HINT)
}

async function toggleActive(page: Page, name: string, to: boolean) {
  await openUser(page, name)
  const input = page.getByTestId('user-active-switch').getByRole('switch')
  await expect(input).toBeEnabled()
  await expect(input).toBeChecked({ checked: !to })
  await input.click()
  const saved = page.waitForResponse((r) => r.request().method() === 'PATCH' && /\/api\/users\/\d+$/.test(r.url()))
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  expect((await saved).status()).toBe(200)
  await expect(page.getByRole('dialog')).toBeHidden()
}

test.describe('breweryMgr', () => {
  test.use({ storageState: authFile('breweryMgr') })

  test('S7: everyone listed; bartender1 is read-only with Add department (Brewery); adding keeps Taproom', async ({ page }) => {
    const rows = await usersAs('breweryMgr')
    const names = rows.map((r) => r.name)
    for (const key of ['bartender1', 'office1', 'sales1', 'noDept', 'ownersAsst', 'dualMgr', 'owner'] as const) expect(names).toContain(personas[key].name)
    for (const key of ['taproomDevice', 'breweryDevice'] as const) expect(names).not.toContain(personas[key].name)
    const sam = rows.find((r) => r.name === personas.bartender1.name)!
    expect(sam).toMatchObject({ can_edit: false, can_deactivate: false, addable_departments: [{ key: 'brewery', name: 'Brewery' }] })

    // The seeded bartender1, looked at only.
    await openUser(page, personas.bartender1.name)
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByTestId('user-read-only')).toContainText("isn't in a department you manage")
    await expect(dialog.getByLabel('Name')).toBeDisabled()
    await expect(dialog.getByTestId('user-departments')).toHaveText(/Taproom/)
    await expect(dialog.getByRole('button', { name: 'Reset password' })).toHaveCount(0)
    await expect(dialog.getByTestId('staff-code-section')).toHaveCount(0)
    await expectActiveGreyed(page)
    await dialog.getByTestId('user-add-department').getByRole('combobox').click()
    await expect(page.getByRole('listbox').getByRole('option')).toHaveText(['— None —', 'Brewery'])
    await page.keyboard.press('Escape')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    // The row says View only in the list.
    const row = page.getByRole('row').filter({ has: page.getByRole('gridcell', { name: personas.bartender1.name, exact: true }) })
    await expect(row.getByTestId('user-view-only')).toBeVisible()

    // The add itself, on a [TEST-TEMP] Taproom employee.
    const temp = await tempIn('S7', ['bar'])
    await openUser(page, temp.name)
    await dialog.getByTestId('user-add-department').getByRole('combobox').click()
    await page.getByRole('option', { name: 'Brewery' }).click()
    const added = page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().endsWith(`/api/users/${temp.id}/memberships`))
    await dialog.getByRole('button', { name: 'Save' }).click()
    expect((await added).status()).toBe(200)
    await expect(dialog).toBeHidden()
    expect(await departmentsOf(temp.id)).toEqual(['bar', 'brewery'])
    // D58 lead decisions 1: Taproom still isn't theirs, so still read-only.
    expect(await rowOf('breweryMgr', temp.id)).toMatchObject({ can_edit: false, can_deactivate: false, addable_departments: [] })
  })

  test('S8: floater (Taproom + Brewery): only the Brewery role changes; Deactivate greyed out (403)', async ({ page }) => {
    await openUser(page, personas.floater.name)
    const dialog = page.getByRole('dialog')
    // D58 lead decisions 1: details, password and staff code aren't breweryMgr's.
    await expect(dialog.getByTestId('user-read-only')).toContainText('you can change only their role in yours')
    await expect(dialog.getByLabel('Name')).toBeDisabled()
    await expect(dialog.getByRole('button', { name: 'Reset password' })).toHaveCount(0)
    await expect(dialog.getByTestId('staff-code-section')).toHaveCount(0)
    await expect(dialog.getByTestId('user-role-brewery')).toBeVisible()
    await expect(dialog.getByTestId('user-departments')).toHaveText(/Taproom/)
    await expectActiveGreyed(page)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    expect((await rowOf('breweryMgr', await userId(await apiAs('floater')))).can_deactivate).toBe(false)

    // The refusal itself on a [TEST-TEMP] stand-in in the same two departments.
    const temp = await tempIn('S8', ['bar', 'brewery'])
    const res = await (await apiAs('breweryMgr')).patch(`/api/users/${temp.id}`, { data: { active: false } })
    expect(res.status()).toBe(403)
    expect((await res.json()).error).toMatch(/only in your departments/i)
    // D58 lead decisions 1: nor any other account change.
    expect(await status('breweryMgr', 'PATCH', `/api/users/${temp.id}`, { name: tempTag('S8') })).toBe(403)
    expect(await status('breweryMgr', 'POST', `/api/users/${temp.id}/reset_password`)).toBe(403)
    expect((await rowOf('owner', temp.id)).active).toBe(true)

    // Their Brewery role is still breweryMgr's, through the dialog.
    await openUser(page, temp.name)
    await dialog.getByTestId('user-role-brewery').getByRole('combobox').click()
    await page.getByRole('option', { name: 'Manager' }).click()
    const put = page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().endsWith(`/api/users/${temp.id}/memberships`))
    await dialog.getByRole('button', { name: 'Save' }).click()
    expect((await put).status()).toBe(200)
    await expect(dialog).toBeHidden()
    expect((await rowOf('owner', temp.id)).memberships.map((m) => [m.department_key, m.role]).sort()).toEqual([
      ['bar', 'employee'],
      ['brewery', 'manager'],
    ])
  })

  // D58 lead decisions 1 (DEV QA gaps 12, 13): Add department on an owner or
  // an Owners member doesn't make their account the manager's.
  test('gaps 12, 13: after Add department, Reset password is not offered and the API refuses it (403)', async ({ page }) => {
    const owner = await apiAs('owner')
    const tempOwner = await tempIn('gap12 owner', [])
    const flag = await owner.patch(`/api/users/${tempOwner.id}`, { data: { is_owner: true } })
    expect(flag.status(), await flag.text()).toBe(200)
    const member = await tempIn('gap13 office member', ['office'])
    const set = await owner.put(`/api/users/${member.id}/memberships`, {
      data: { memberships: [{ department: 'office', role: 'employee' }, { department: 'owners', role: 'employee' }] },
    })
    expect(set.status(), await set.text()).toBe(200)

    try {
      const dialog = page.getByRole('dialog')
      for (const person of [tempOwner, member]) {
        await openUser(page, person.name)
        await dialog.getByTestId('user-add-department').getByRole('combobox').click()
        await page.getByRole('option', { name: 'Brewery' }).click()
        const added = page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().endsWith(`/api/users/${person.id}/memberships`))
        await dialog.getByRole('button', { name: 'Save' }).click()
        const res = await added
        expect(res.status()).toBe(200)
        expect(await res.text()).not.toContain('"owners"')
        await expect(dialog).toBeHidden()

        await openUser(page, person.name)
        await expect(dialog.getByTestId('user-read-only')).toBeVisible()
        await expect(dialog.getByLabel('Name')).toBeDisabled()
        await expect(dialog.getByRole('button', { name: 'Reset password' })).toHaveCount(0)
        await expect(dialog.getByTestId('staff-code-section')).toHaveCount(0)
        await expect(dialog).not.toContainText('Owners')
        await dialog.getByRole('button', { name: 'Cancel' }).click()

        expect(await status('breweryMgr', 'POST', `/api/users/${person.id}/reset_password`)).toBe(403)
        expect(await status('breweryMgr', 'PATCH', `/api/users/${person.id}`, { name: tempTag('gap12') })).toBe(403)
        expect(await status('breweryMgr', 'PUT', `/api/users/${person.id}/staff_code`, { code: '8642' })).toBe(403)
        expect((await rowOf('owner', person.id)).name).toBe(person.name)
      }
    } finally {
      await owner.patch(`/api/users/${tempOwner.id}`, { data: { is_owner: false } })
    }
  })

  test('S12: ownersAsst shows Office only; no Owners anywhere in the Users & Roles traffic', async ({ page }) => {
    const bodies: string[] = []
    page.on('response', async (r) => {
      if (r.url().includes('/api/') && r.request().resourceType() !== 'preflight') bodies.push(await r.text().catch(() => ''))
    })
    const listed = page.waitForResponse((r) => r.url().endsWith('/api/users') && r.request().method() === 'GET')
    await openUser(page, personas.ownersAsst.name)
    const list = await (await listed).json()
    const asst = (list.data as Row[]).find((u) => u.name === personas.ownersAsst.name)!
    expect(asst.memberships.map((m) => m.department_key)).toEqual(['office'])
    expect(asst.can_edit).toBe(false)

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByTestId('user-departments')).toHaveText(/Office/)
    await expect(dialog).not.toContainText('Owners')
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    for (const text of [JSON.stringify(list), ...bodies]) {
      expect(text).not.toContain('"department_key":"owners"')
      expect(text).not.toContain('"owners_only":true')
      expect(text).not.toContain('"Owners"')
    }
  })

  test('S13: on someone they don’t manage, name / reset password / staff code are 403', async () => {
    // bartender1 for the reads; a [TEST-TEMP] Taproom employee for the writes.
    const sam = await userId(await apiAs('bartender1'))
    expect(await status('breweryMgr', 'GET', `/api/users/${sam}/staff_code`)).toBe(403)
    const temp = await tempIn('S13', ['bar'])
    expect(await status('breweryMgr', 'PATCH', `/api/users/${temp.id}`, { name: tempTag('renamed') })).toBe(403)
    expect(await status('breweryMgr', 'PATCH', `/api/users/${temp.id}`, { schedulable: true })).toBe(403)
    expect(await status('breweryMgr', 'POST', `/api/users/${temp.id}/reset_password`)).toBe(403)
    expect(await status('breweryMgr', 'PUT', `/api/users/${temp.id}/staff_code`, { code: '8642' })).toBe(403)
    expect(await status('breweryMgr', 'DELETE', `/api/users/${temp.id}/staff_code`)).toBe(403)
    expect(await status('breweryMgr', 'GET', `/api/users/${temp.id}/staff_code`)).toBe(403)
    // A role in a department they don't manage, through the membership route.
    expect(await status('breweryMgr', 'PUT', `/api/users/${temp.id}/memberships`, { memberships: [{ department: 'bar', role: 'manager' }] })).toBe(403)
    const row = await rowOf('owner', temp.id)
    expect(row.name).toBe(temp.name)
    expect(row.memberships.map((m) => [m.department_key, m.role])).toEqual([['bar', 'employee']])
  })

  test('S14: Office positions are view only (403 from the API); Brewery positions still work', async ({ page }) => {
    const owner = await apiAs('owner')
    const mgr = await apiAs('breweryMgr')
    const depts = (await (await owner.get('/api/departments')).json()).data as { id: number; key: string }[]
    const office = depts.find((d) => d.key === 'office')!.id
    const brewery = depts.find((d) => d.key === 'brewery')!.id

    const theirs = await owner.post('/api/positions', { data: { name: tempTag('S14 Office'), department_id: office } })
    expect(theirs.status(), await theirs.text()).toBe(201)
    const officeId = (await theirs.json()).data.id as number
    positionIds.push(officeId)

    expect((await mgr.post('/api/positions', { data: { name: tempTag('S14 nope'), department_id: office } })).status()).toBe(403)
    expect((await mgr.patch(`/api/positions/${officeId}`, { data: { name: tempTag('S14 renamed') } })).status()).toBe(403)
    expect((await mgr.patch(`/api/positions/${officeId}`, { data: { department_id: brewery } })).status()).toBe(403)
    expect((await mgr.delete(`/api/positions/${officeId}`)).status()).toBe(403)

    const ours = await mgr.post('/api/positions', { data: { name: tempTag('S14 Brewery'), department_id: brewery } })
    expect(ours.status(), await ours.text()).toBe(201)
    const breweryId = (await ours.json()).data.id as number
    positionIds.push(breweryId)
    expect((await mgr.patch(`/api/positions/${breweryId}`, { data: { name: tempTag('S14 Brewery renamed') } })).status()).toBe(200)
    // Moving one into a department they don't manage needs both.
    expect((await mgr.patch(`/api/positions/${breweryId}`, { data: { department_id: office } })).status()).toBe(403)

    // The dialog: Office's group says view only and has no buttons; Brewery's has them.
    await page.goto('/scheduler')
    await settingsItem(page, 'scheduler-settings', 'scheduler-positions')
    const officeGroup = page.getByTestId('positions-group-office')
    await expect(officeGroup).toContainText('(view only: not your department)')
    await expect(officeGroup).toContainText('S14 Office')
    await expect(officeGroup.getByRole('button', { name: /Deactivate|Activate/ })).toHaveCount(0)
    const breweryGroup = page.getByTestId('positions-group-brewery')
    await expect(breweryGroup).not.toContainText('view only')
    await expect(breweryGroup.getByRole('button', { name: 'Deactivate' }).first()).toBeVisible()
    // New positions go only to their own departments.
    await page.getByRole('dialog').getByLabel('Department').click()
    await expect(page.getByRole('listbox').getByRole('option')).toHaveText(['Brewery'])
    await page.keyboard.press('Escape')

    const deleted = await mgr.delete(`/api/positions/${breweryId}`)
    expect([200, 204]).toContain(deleted.status())
  })
})

test.describe('dualMgr', () => {
  test.use({ storageState: authFile('dualMgr') })

  test('S9: a [TEST-TEMP] person in Taproom + Office: Deactivate, then reactivate', async ({ page }) => {
    const temp = await tempIn('S9', ['bar', 'office'])
    expect((await rowOf('dualMgr', temp.id)).can_deactivate).toBe(true)
    await toggleActive(page, temp.name, false)
    expect((await rowOf('owner', temp.id)).active).toBe(false)
    await toggleActive(page, temp.name, true)
    expect((await rowOf('owner', temp.id)).active).toBe(true)
  })

  // D58 lead decisions 1: nobody manages Owners, so only the Office role is
  // dualMgr's, and Owners doesn't show (reverses spec decision 7's chip).
  test('S11: Office + Owners: only the Office role changes, no Owners chip, details and Deactivate refused (403)', async ({ page }) => {
    const temp = await tempIn('S11', ['office'])
    const set = await (await apiAs('owner')).put(`/api/users/${temp.id}/memberships`, {
      data: { memberships: [{ department: 'office', role: 'employee' }, { department: 'owners', role: 'employee' }] },
    })
    expect(set.status(), await set.text()).toBe(200)

    await openUser(page, temp.name)
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByTestId('user-read-only')).toContainText('you can change only their role in yours')
    await expect(dialog).not.toContainText('Owners')
    await expect(dialog.getByLabel('Name')).toBeDisabled()
    await expect(dialog.getByRole('button', { name: 'Reset password' })).toHaveCount(0)
    await expectActiveGreyed(page)
    await dialog.getByTestId('user-role-office').getByRole('combobox').click()
    await page.getByRole('option', { name: 'Manager' }).click()
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden()
    const row = await rowOf('owner', temp.id)
    expect(row.name).toBe(temp.name)
    expect(await status('dualMgr', 'PATCH', `/api/users/${temp.id}`, { name: tempTag('S11') })).toBe(403)
    expect(row.memberships.map((m) => [m.department_key, m.role]).sort()).toEqual([
      ['office', 'manager'],
      ['owners', 'employee'],
    ])

    expect(await status('dualMgr', 'PATCH', `/api/users/${temp.id}`, { active: false })).toBe(403)
    expect((await rowOf('owner', temp.id)).active).toBe(true)
  })

  // DEV gate (O6 on DEV): the dialog opened before `/api/departments` came
  // back, Save sent no memberships, and the API removed Office.
  test('a slow department list: Save waits for it and keeps the person’s departments', async ({ page }) => {
    const temp = await tempIn('slow depts', ['bar', 'office'])
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    await page.route('**/api/departments', async (route) => {
      await held
      await route.continue()
    })

    await openUser(page, temp.name)
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill(`${temp.name} edited`)
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled()
    release()

    const put = page.waitForRequest((r) => r.method() === 'PUT' && r.url().endsWith(`/api/users/${temp.id}/memberships`))
    await dialog.getByRole('button', { name: 'Save' }).click()
    expect((await put).postDataJSON().memberships).toEqual(
      expect.arrayContaining([
        { department: 'bar', role: 'employee' },
        { department: 'office', role: 'employee' },
      ]),
    )
    await expect(dialog).toBeHidden()
    expect(await departmentsOf(temp.id)).toEqual(['bar', 'office'])
  })
})

test.describe('barMgr', () => {
  test.use({ storageState: authFile('barMgr') })

  test('S10: a [TEST-TEMP] person with no department: Deactivate and reactivate', async ({ page }) => {
    const temp = await tempIn('S10', [])
    // D58 lead decisions 1: no department, so barMgr edits them as well.
    expect(await rowOf('barMgr', temp.id)).toMatchObject({ can_edit: true, can_deactivate: true })
    // noDept (seeded) reads the same, untouched.
    expect((await rowOf('barMgr', await userId(await apiAs('noDept')))).can_deactivate).toBe(true)
    await toggleActive(page, temp.name, false)
    expect((await rowOf('owner', temp.id)).active).toBe(false)
    await toggleActive(page, temp.name, true)
    expect((await rowOf('owner', temp.id)).active).toBe(true)
  })
})

test.describe('owner', () => {
  test.use({ storageState: authFile('owner') })

  test('S9–S11 (owner): Deactivate is open on anyone, Owners members included', async ({ page }) => {
    const temp = await tempIn('owner', ['office'])
    await (await apiAs('owner')).put(`/api/users/${temp.id}/memberships`, {
      data: { memberships: [{ department: 'office', role: 'employee' }, { department: 'owners', role: 'employee' }] },
    })
    expect((await rowOf('owner', temp.id)).can_deactivate).toBe(true)
    await toggleActive(page, temp.name, false)
    await toggleActive(page, temp.name, true)
    expect((await rowOf('owner', temp.id)).active).toBe(true)
  })
})
