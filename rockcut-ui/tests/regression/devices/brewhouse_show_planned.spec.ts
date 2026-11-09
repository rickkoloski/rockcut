import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs } from '../scheduler/helpers'
import { blankTablet, createDevice, deleteDevices, pairingCode, setUpTablet } from './helpers'

// D50 D9 (decision 5): Show planned batches on the brewhouse device is the
// device's own setting, in Shared devices (owners; default on). Its own
// [TEST-TEMP] device, so the seed's breweryDevice is left alone.

test.use({ storageState: authFile('owner') })

const PREFIX = '[TEST-TEMP] D50 planned'

test.afterAll(async () => {
  await deleteDevices(await apiAs('owner'), PREFIX)
})

test('D9: the owner turns it off for a Brewery device; it stays off after a reload; the tablet’s /api/me follows; no person changes', async ({ page, browser }) => {
  const owner = await apiAs('owner')
  const device = await createDevice(owner, `${PREFIX} ${Date.now().toString(36)}`, 'brewery')
  const taproom = await createDevice(owner, `${PREFIX} bar ${Date.now().toString(36)}`, 'bar')
  const brewerBefore = (await (await (await apiAs('brewer1')).get('/api/me')).json()).show_planned_batches

  await page.goto('/devices')
  const toggle = page.getByTestId(`device-show-planned-${device.id}`)
  await expect(toggle).toBeChecked()
  // Only a Brewery device has it.
  await expect(page.getByTestId(`device-show-planned-${taproom.id}`)).toHaveCount(0)
  const saved = page.waitForResponse((r) => r.url().endsWith(`/api/devices/${device.id}`) && r.request().method() === 'PATCH')
  await toggle.click()
  expect((await saved).status()).toBe(200)
  await page.reload()
  await expect(page.getByTestId(`device-show-planned-${device.id}`)).not.toBeChecked()

  // A tablet paired to it reads its own setting.
  const { context, page: tablet } = await blankTablet(browser)
  try {
    // The tablet's own /api/me after pairing (relative or on the API host, as the build has it).
    let me: { show_planned_batches?: boolean } | null = null
    tablet.on('response', async (r) => {
      if (new URL(r.url()).pathname === '/api/me' && r.ok()) me = await r.json()
    })
    await setUpTablet(tablet, await pairingCode(owner, device.id), '[TEST-TEMP] D50 tab')
    await expect.poll(() => me?.show_planned_batches).toBe(false)
  } finally {
    await context.close()
  }
  expect((await (await (await apiAs('brewer1')).get('/api/me')).json()).show_planned_batches).toBe(brewerBefore)
})
