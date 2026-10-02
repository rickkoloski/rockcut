import { test, expect } from '@playwright/test'

// Several full page loads per test on the local dev server (see device_session.spec.ts).
test.describe.configure({ timeout: 60_000 })
import { authFile } from '../../config/test-env'
import { apiAs, tempTag } from '../scheduler/helpers'
import { createDevice, deleteDevices } from './helpers'

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

test.describe('owner, device controls (DEV G5, G9)', () => {
  test.use({ storageState: authFile('owner') })

  test('G9: a deactivated device offers no "Pair a tablet"; the API refuses a code (422)', async ({ page }) => {
    tag = tempTag('G9 tablets')
    const api = await apiAs('owner')
    const device = await createDevice(api, tag)
    expect((await api.patch(`/api/devices/${device.id}`, { data: { active: false } })).status()).toBe(200)

    await page.goto('/devices')
    const row = page.getByTestId(`device-row-${device.id}`)
    await expect(row).toContainText('Deactivated')
    await expect(page.getByTestId(`pair-tablet-${device.id}`)).toHaveCount(0)
    expect((await api.post(`/api/devices/${device.id}/pairing_code`)).status()).toBe(422)

    expect((await api.patch(`/api/devices/${device.id}`, { data: { active: true } })).status()).toBe(200)
    await page.reload()
    await expect(page.getByTestId(`pair-tablet-${device.id}`)).toBeVisible()
  })

  test('G5: Deactivate asks first; Cancel changes nothing', async ({ page }) => {
    tag = tempTag('G5 tablets')
    const api = await apiAs('owner')
    const device = await createDevice(api, tag)

    await page.goto('/devices')
    await page.getByTestId(`toggle-device-${device.id}`).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Deactivate')
    await expect(dialog).toContainText('signed out')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await page.reload()
    await expect(page.getByTestId(`device-row-${device.id}`)).not.toContainText('Deactivated')

    await page.getByTestId(`toggle-device-${device.id}`).click()
    const saved = page.waitForResponse((r) => r.url().endsWith(`/api/devices/${device.id}`) && r.request().method() === 'PATCH')
    await page.getByRole('dialog').getByRole('button', { name: 'Deactivate' }).click()
    expect((await saved).status()).toBe(200)
    await page.reload()
    await expect(page.getByTestId(`device-row-${device.id}`)).toContainText('Deactivated')
  })
})
