import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs } from '../scheduler/helpers'
import { createTempPerson, retireTempPerson, type TempPerson } from './helpers'
import { openUser, personWithCode } from '../taproom/helpers'

// D37 DEV pass 1 G1: a department manager renames someone and removes them
// from the manager's department in one save. The rename must land before the
// manager stops managing them (it used to say "Forbidden" and drop the rename).

interface SavedUser {
  id: number
  name: string
  has_staff_code?: boolean
  memberships: { department_key: string }[]
}

async function asOwner(id: number): Promise<SavedUser> {
  const users = (await (await (await apiAs('owner')).get('/api/users')).json()).data as SavedUser[]
  return users.find((u) => u.id === id)!
}

/** Rename `person` and set `dept` to "— None —" in one save. */
async function renameAndRemove(page: Page, person: TempPerson, dept: string) {
  await openUser(page, person.name)
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(`${person.name} renamed`)
  await dialog.getByRole('combobox', { name: dept }).click()
  await page.getByRole('option', { name: '— None —' }).click()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Forbidden')).toHaveCount(0)
}

test.describe('as barMgr', () => {
  test.use({ storageState: authFile('barMgr') })
  let person: TempPerson | null = null

  test.afterEach(async () => retireTempPerson(person))

  test('G1: rename and remove from the Taproom in one save', async ({ page }) => {
    const withCode = await personWithCode('D37 G1 taproom')
    person = withCode.person
    await renameAndRemove(page, person, 'Taproom')

    const saved = await asOwner(person.id)
    expect(saved.name).toBe(`${person.name} renamed`)
    expect(saved.memberships.map((m) => m.department_key)).not.toContain('bar')
    expect(saved.has_staff_code).toBe(false)
  })
})

test.describe('as breweryMgr', () => {
  test.use({ storageState: authFile('breweryMgr') })
  let person: TempPerson | null = null

  test.afterEach(async () => retireTempPerson(person))

  test('G1: rename and remove from the Brewery in one save', async ({ page }) => {
    person = await createTempPerson('D37 G1 brewery', {
      ready: false,
      memberships: [{ department: 'brewery', role: 'employee' }],
    })
    await renameAndRemove(page, person, 'Brewery')

    const saved = await asOwner(person.id)
    expect(saved.name).toBe(`${person.name} renamed`)
    expect(saved.memberships.map((m) => m.department_key)).not.toContain('brewery')
  })
})
