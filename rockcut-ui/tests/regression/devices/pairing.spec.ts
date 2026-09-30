import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs, tempTag } from '../scheduler/helpers'
import { blankTablet, createDevice, deleteDevices, getDevice, pairingCode, setUpTablet } from './helpers'

// D33 S2, S4, S11: pairing tablets and revoking one.

let tag = ''
test.afterEach(async () => {
  if (tag) await deleteDevices(await apiAs('owner'), tag)
})

test.describe('barMgr (manager of the home department)', () => {
  test.use({ storageState: authFile('barMgr') })

  test('S2: pairs a tablet from Shared devices; it signs in and shows last seen', async ({ page, browser }) => {
    tag = tempTag('S2 tablets')
    const device = await createDevice(await apiAs('owner'), tag)

    await page.goto('/devices')
    await page.getByTestId(`pair-tablet-${device.id}`).click()
    const code = (await page.getByTestId('pairing-code').textContent())!.trim()
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    await page.getByRole('button', { name: 'Done' }).click()

    // A second browser: "Set up as a shared device".
    const tablet = await blankTablet(browser)
    await setUpTablet(tablet.page, code, `${tag} iPad 1`)
    await expect(tablet.page.getByTestId('device-chip')).toContainText('Shared device · Taproom')
    await tablet.page.reload()
    await expect(tablet.page.getByTestId('device-chip')).toBeVisible()

    // Persist-verify on the manager's side: listed, paired by barMgr, last seen set.
    await page.reload()
    const row = page.getByTestId(`device-row-${device.id}`)
    await expect(row.getByRole('row').filter({ hasText: `${tag} iPad 1` })).toContainText('Casey Tap')
    const t = (await getDevice(await apiAs('barMgr'), device.id))!.tokens[0]
    expect(t.last_seen_at).not.toBeNull()
    await expect(page.getByTestId(`tablet-last-seen-${t.id}`)).not.toHaveText('—')

    await tablet.context.close()
  })

  test('S11: revokes one of two tablets; only that one is signed out', async ({ page, browser }) => {
    tag = tempTag('S11 tablets')
    const device = await createDevice(await apiAs('owner'), tag)
    const mgr = await apiAs('barMgr')

    const one = await blankTablet(browser)
    await setUpTablet(one.page, await pairingCode(mgr, device.id), `${tag} iPad 1`)
    const two = await blankTablet(browser)
    await setUpTablet(two.page, await pairingCode(mgr, device.id), `${tag} iPad 2`)

    const tokens = (await getDevice(mgr, device.id))!.tokens
    const first = tokens.find((t) => t.name.endsWith('iPad 1'))!

    await page.goto('/devices')
    await page.getByTestId(`revoke-token-${first.id}`).click()
    const revoked = page.waitForResponse((r) => r.url().endsWith(`/api/device_tokens/${first.id}`))
    await page.getByRole('button', { name: 'Revoke' }).click()
    expect((await revoked).status()).toBe(204)

    // Persist-verify: still revoked after a reload.
    await page.reload()
    await expect(page.getByTestId(`tablet-row-${first.id}`)).toContainText('Revoked')

    // iPad 1's next request is 401 → back to setup; iPad 2 keeps working.
    await one.page.reload()
    await expect(one.page.getByTestId('device-setup-link')).toBeVisible({ timeout: 15_000 }) // 401 → reload → login: two page loads
    await two.page.reload()
    await expect(two.page.getByTestId('device-chip')).toBeVisible()

    await one.context.close()
    await two.context.close()
  })
})

test('S4: a wrong code is refused with a clear message', async ({ browser }) => {
  const tablet = await blankTablet(browser)
  await tablet.page.goto('/')
  await tablet.page.getByTestId('device-setup-link').click()
  await tablet.page.getByTestId('device-code').fill('ZZZZ-ZZZZ')
  await tablet.page.getByTestId('device-name').fill('[TEST-TEMP] wrong code')
  await tablet.page.getByTestId('device-submit').click()
  await expect(tablet.page.getByRole('alert')).toContainText('That code is invalid or has expired')
  await expect(tablet.page.getByTestId('device-chip')).toHaveCount(0)
  await tablet.context.close()
})
