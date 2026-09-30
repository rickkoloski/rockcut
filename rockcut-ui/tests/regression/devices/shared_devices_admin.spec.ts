import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs, tempTag } from '../scheduler/helpers'
import { deleteDevices } from './helpers'

// D33 S1: the owner creates a shared device. It isn't a person anywhere.

let tag = ''
test.afterEach(async () => {
  if (tag) await deleteDevices(await apiAs('owner'), tag)
})

test.describe('owner', () => {
  test.use({ storageState: authFile('owner') })

  test('S1: creates a device; it persists, is logged, and is nowhere in the people lists', async ({ page }) => {
    tag = tempTag('S1 tablets')

    await page.goto('/devices')
    await page.getByTestId('add-device').click()
    await page.getByTestId('device-account-name').fill(tag)
    await page.getByLabel('Home department').click()
    await page.getByRole('option', { name: 'Taproom' }).click()
    const created = page.waitForResponse((r) => r.url().endsWith('/api/devices') && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Save' }).click()
    expect((await created).status()).toBe(201)

    // Persist-verify.
    await page.reload()
    const row = page.locator('[data-testid^="device-row-"]', { hasText: tag })
    await expect(row).toBeVisible()
    await expect(row).toContainText('Home: Taproom')
    const id = Number((await row.getAttribute('data-testid'))!.replace('device-row-', ''))

    // Not in Users & Roles (UI and API), the roster, or any assignee list.
    const api = await apiAs('owner')
    const users = (await (await api.get('/api/users')).json()).data as { id: number }[]
    expect(users.some((u) => u.id === id)).toBe(false)
    const roster = (await (await api.get('/api/roster')).json()).data as { id: number }[]
    expect(roster.some((u) => u.id === id)).toBe(false)
    await page.goto('/users')
    await expect(page.getByText('Users & Roles').first()).toBeVisible()
    await expect(page.getByText(tag)).toHaveCount(0)

    // The API refuses it as an assignee (S14).
    const positions = (await (await api.get('/api/positions')).json()).data as { id: number; department_id: number }[]
    const res = await api.post('/api/shifts', {
      data: { position_id: positions[0].id, assignee_id: id, starts_at: '2030-01-07T16:00:00Z', ends_at: '2030-01-07T22:00:00Z' },
    })
    expect(res.status()).toBe(422)

    // The owner's change log shows the create.
    await page.goto('/activity')
    await expect(page.getByRole('row').filter({ hasText: tag }).filter({ hasText: 'Shared device created' })).toBeVisible()
  })
})
