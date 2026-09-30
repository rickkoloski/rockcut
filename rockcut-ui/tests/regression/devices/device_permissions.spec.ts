import { test, expect as baseExpect } from '@playwright/test'

// Tablets sign in and out through full page loads (401 → reload → login) and
// the local API has one DB connection: under the full parallel suite a chain
// of loads can take several seconds. Assertions wait for up to 15 s.
const expect = baseExpect.configure({ timeout: 15_000 })
import { authFile } from '../../config/test-env'
import { apiAs, tempTag } from '../scheduler/helpers'
import { blankTablet, createDevice, deleteDevices, expectUnpaired, pairingCode, setUpTablet } from './helpers'

// D33 S3 (another department's manager) and S12 (deactivating the account).

let tag = ''
test.afterEach(async () => {
  if (tag) await deleteDevices(await apiAs('owner'), tag)
})

test.describe('breweryMgr', () => {
  test.use({ storageState: authFile('breweryMgr') })

  test('S3: can’t see, pair or revoke taproom tablets', async ({ page, browser }) => {
    tag = tempTag('S3 tablets')
    const device = await createDevice(await apiAs('owner'), tag)
    const tablet = await blankTablet(browser)
    await setUpTablet(tablet.page, await pairingCode(await apiAs('barMgr'), device.id), `${tag} iPad`)

    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Admin' })).toBeVisible()
    await page.getByRole('button', { name: 'Admin' }).click()
    await expect(page.getByRole('button', { name: 'Shared devices' })).toHaveCount(0)

    const api = await apiAs('breweryMgr')
    expect((await api.post(`/api/devices/${device.id}/pairing_code`)).status()).toBe(403)
    const tokenId = ((await (await (await apiAs('owner')).get('/api/devices')).json()).data as { id: number; tokens: { id: number }[] }[])
      .find((d) => d.id === device.id)!.tokens[0].id
    expect((await api.delete(`/api/device_tokens/${tokenId}`)).status()).toBe(403)

    // The tablet is untouched.
    await tablet.page.reload()
    await expect(tablet.page.getByTestId('device-chip')).toBeVisible()
    await tablet.context.close()
  })
})

test.describe('owner', () => {
  test.use({ storageState: authFile('owner') })

  test('S12: deactivating the device signs out every tablet', async ({ page, browser }) => {
    tag = tempTag('S12 tablets')
    const device = await createDevice(await apiAs('owner'), tag)
    const owner = await apiAs('owner')
    const one = await blankTablet(browser)
    await setUpTablet(one.page, await pairingCode(owner, device.id), `${tag} iPad 1`)
    const two = await blankTablet(browser)
    await setUpTablet(two.page, await pairingCode(owner, device.id), `${tag} iPad 2`)

    await page.goto('/devices')
    const saved = page.waitForResponse((r) => r.url().endsWith(`/api/devices/${device.id}`) && r.request().method() === 'PATCH')
    await page.getByTestId(`toggle-device-${device.id}`).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Deactivate' }).click()
    expect((await saved).status()).toBe(200)
    await page.reload()
    await expect(page.getByTestId(`device-row-${device.id}`)).toContainText('Deactivated')

    for (const t of [one, two]) {
      await t.page.reload()
      await expectUnpaired(t.page)
      await t.context.close()
    }
  })
})
