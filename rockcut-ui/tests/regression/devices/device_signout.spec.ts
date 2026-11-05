import { test, expect as baseExpect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs, tempTag } from '../scheduler/helpers'
import { blankTablet, createDevice, deleteDevices, getDevice, pairingCode, setUpTablet } from './helpers'

// DEV G4: signing a tablet out always asks first, and never drops the tablet's
// token unless the server revoked it. Full page loads on a busy local API.
const expect = baseExpect.configure({ timeout: 15_000 })
// Several full page loads per test on the local dev server (see device_session.spec.ts).
test.describe.configure({ timeout: 60_000 })

let tag = ''
test.afterEach(async () => {
  if (tag) await deleteDevices(await apiAs('owner'), tag)
  tag = ''
})

test.describe('taproomDevice (server call mocked; the shared persona token is never revoked)', () => {
  test.use({ storageState: authFile('taproomDevice') })

  test('G4: if the server can’t revoke, the tablet keeps its token and says so', async ({ page }) => {
    await page.route('**/api/session', (route) =>
      route.request().method() === 'DELETE'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Server error' }) })
        : route.continue(),
    )
    await page.goto('/')
    const before = await page.evaluate(() => localStorage.getItem('rockcut_token'))
    await page.getByTestId('device-signout').click()
    await expect(page.getByRole('dialog')).toContainText('A manager will need to pair this tablet again.')
    await page.getByTestId('device-signout-confirm').click()

    await expect(page.getByTestId('device-signout-error')).toContainText('Server error')
    expect(await page.evaluate(() => localStorage.getItem('rockcut_token'))).toBe(before)
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
    await page.reload()
    await expect(page.getByTestId('device-chip')).toBeVisible()
  })
})

test.describe('a paired [TEST-TEMP] tablet', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('G4: a confirmed sign-out revokes the token on the server and lands on setup', async ({ browser }) => {
    tag = tempTag('G4 signout')
    const owner = await apiAs('owner')
    const device = await createDevice(owner, tag)
    const tablet = await blankTablet(browser)
    await setUpTablet(tablet.page, await pairingCode(owner, device.id), `${tag} iPad`)

    await tablet.page.getByTestId('device-signout').click()
    const revoked = tablet.page.waitForResponse((r) => r.url().endsWith('/api/session') && r.request().method() === 'DELETE')
    await tablet.page.getByTestId('device-signout-confirm').click()
    expect((await revoked).status()).toBe(200)
    await expect(tablet.page.getByTestId('device-code')).toBeVisible()

    // Persist-verify on the server.
    const t = (await getDevice(owner, device.id))!.tokens[0]
    expect(t.revoked_at).not.toBeNull()
    await tablet.context.close()
  })
})
