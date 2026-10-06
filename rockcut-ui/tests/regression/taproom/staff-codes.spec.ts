import { test, expect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs } from '../scheduler/helpers'
import { createTempPerson, retireTempPerson, type TempPerson } from '../auth/helpers'

// D37 §3.2: staff codes in the Users & Roles edit dialog (S1–S4, S12, S16).
// Codes are set on [TEST-TEMP] Taproom people, never on personas: the seeded
// persona codes are what the shared-device specs type.

/** Open `name`'s edit dialog, paging through the grid (it shows 100 rows a page). */
async function openUser(page: Page, name: string) {
  await page.goto('/users')
  const cell = page.getByRole('gridcell', { name, exact: true }).first()
  const next = page.getByRole('button', { name: 'Go to next page' })
  await expect(page.getByRole('gridcell').first()).toBeVisible()
  while (!(await cell.isVisible()) && (await next.isEnabled())) {
    await next.click()
  }
  await cell.click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

async function freeCode(): Promise<string> {
  const res = await (await apiAs('barMgr')).get('/api/staff_codes/suggest')
  expect(res.status()).toBe(200)
  return (await res.json()).data.code
}

test.describe('as barMgr', () => {
  test.use({ storageState: authFile('barMgr') })

  let a: TempPerson | null = null
  let b: TempPerson | null = null

  test.beforeEach(async () => {
    a = await createTempPerson('D37 code A', { ready: false })
    b = await createTempPerson('D37 code B', { ready: false })
  })

  test.afterEach(async () => {
    await retireTempPerson(a)
    await retireTempPerson(b)
  })

  test('S1: set a code; it reopens masked and the eye reveals it', async ({ page }) => {
    const code = await freeCode()
    await openUser(page, a!.name)
    await expect(page.getByTestId('staff-code-section')).toContainText('No code yet')
    await page.getByTestId('staff-code-input').fill(code)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()

    // Persist-verify: reload, reopen.
    await page.reload()
    await openUser(page, a!.name)
    await expect(page.getByTestId('staff-code-input')).toHaveValue('••••')
    const reveal = page.waitForResponse((r) => r.url().endsWith(`/api/users/${a!.id}/staff_code`))
    await page.getByTestId('staff-code-toggle').click()
    expect((await reveal).status()).toBe(200)
    await expect(page.getByTestId('staff-code-input')).toHaveValue(code)

    // Hidden again the next time the dialog opens.
    await page.getByRole('button', { name: 'Cancel' }).click()
    await openUser(page, a!.name)
    await expect(page.getByTestId('staff-code-input')).toHaveValue('••••')

    // The list never shows codes.
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('columnheader', { name: /staff code/i })).toHaveCount(0)
  })

  test('S2: a code in use is refused; Suggest fills a free one', async ({ page }) => {
    const code = await freeCode()
    const set = await (await apiAs('barMgr')).put(`/api/users/${a!.id}/staff_code`, { data: { code } })
    expect(set.status()).toBe(200)

    await openUser(page, b!.name)
    await page.getByTestId('staff-code-input').fill(code)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('That code is already in use')

    await page.getByTestId('staff-code-suggest').click()
    await expect(page.getByTestId('staff-code-input')).toHaveValue(/^\d{4}$/)
    await expect(page.getByTestId('staff-code-input')).not.toHaveValue(code)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()

    await page.reload()
    await openUser(page, b!.name)
    await expect(page.getByTestId('staff-code-input')).toHaveValue('••••')
  })

  test('S12: leaving the Taproom ends the code', async () => {
    const api = await apiAs('barMgr')
    expect((await api.put(`/api/users/${a!.id}/staff_code`, { data: { code: await freeCode() } })).status()).toBe(200)
    const owner = await apiAs('owner')
    const moved = await owner.put(`/api/users/${a!.id}/memberships`, {
      data: { memberships: [{ department: 'office', role: 'employee' }] },
    })
    expect(moved.status(), await moved.text()).toBe(200)
    expect((await moved.json()).data.has_staff_code).toBe(false)
  })

  test('Remove clears the code at once', async ({ page }) => {
    expect((await (await apiAs('barMgr')).put(`/api/users/${a!.id}/staff_code`, { data: { code: await freeCode() } })).status()).toBe(200)
    await openUser(page, a!.name)
    await page.getByTestId('staff-code-remove').click()
    await expect(page.getByTestId('staff-code-section')).toContainText('No code yet')
    await page.getByRole('button', { name: 'Cancel' }).click()
    await page.reload()
    await openUser(page, a!.name)
    await expect(page.getByTestId('staff-code-section')).toContainText('No code yet')
  })
})

test.describe('as owner', () => {
  test.use({ storageState: authFile('owner') })

  test('S3: no Staff code section for someone outside the Taproom', async ({ page }) => {
    await openUser(page, 'Jake Brewer')
    await expect(page.getByTestId('staff-code-section')).toHaveCount(0)
  })

  test('S16: an owner reveals a Taproom member’s code', async ({ page }) => {
    const p = await createTempPerson('D37 owner reveal', { ready: false })
    try {
      const code = await freeCode()
      expect((await (await apiAs('owner')).put(`/api/users/${p.id}/staff_code`, { data: { code } })).status()).toBe(200)
      await openUser(page, p.name)
      await page.getByTestId('staff-code-toggle').click()
      await expect(page.getByTestId('staff-code-input')).toHaveValue(code)
    } finally {
      await retireTempPerson(p)
    }
  })
})

test.describe('as breweryMgr', () => {
  test.use({ storageState: authFile('breweryMgr') })

  test('S4: a manager of another department sees no Staff code section and gets 403', async ({ page }) => {
    // floater is in the Brewery and the Taproom, so breweryMgr can open them.
    await openUser(page, 'Jordan Float')
    await expect(page.getByTestId('staff-code-section')).toHaveCount(0)

    const api = await apiAs('breweryMgr')
    const users = (await (await api.get('/api/users')).json()).data as { id: number; name: string }[]
    const floater = users.find((u) => u.name === 'Jordan Float')!
    expect((await api.get(`/api/users/${floater.id}/staff_code`)).status()).toBe(403)
    expect((await api.put(`/api/users/${floater.id}/staff_code`, { data: { code: '1234' } })).status()).toBe(403)
    expect((await api.get('/api/staff_codes/suggest')).status()).toBe(403)
  })
})
