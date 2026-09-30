import { readFileSync } from 'node:fs'
import { test, expect as baseExpect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs, tempTag } from '../scheduler/helpers'
import { blankTablet, createDevice, deleteDevices, getDevice, pairingCode, setUpTablet } from './helpers'

// DEV G4: signing a tablet out always asks first, and never drops the tablet's
// token unless the server revoked it. Full page loads on a busy local API.
const expect = baseExpect.configure({ timeout: 15_000 })

function tokenOf(persona: 'bartender1'): string {
  const state = JSON.parse(readFileSync(authFile(persona), 'utf8'))
  return state.origins[0].localStorage.find((e: { name: string }) => e.name === 'rockcut_token').value
}

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

  test('G4: a stale tab’s person Logout never unpairs the tablet', async ({ browser }) => {
    tag = tempTag('G4 stale')
    const owner = await apiAs('owner')
    const device = await createDevice(owner, tag)
    const { context, page: a } = await blankTablet(browser)
    await setUpTablet(a, await pairingCode(owner, device.id), `${tag} iPad`)
    const deviceToken = await a.evaluate(() => localStorage.getItem('rockcut_token'))

    await a.getByTestId('personal-signin').click()
    await a.evaluate((t) => localStorage.setItem('rockcut_token', t), tokenOf('bartender1'))
    await a.reload()
    await expect(a.getByTestId('personal-session-banner')).toBeVisible()

    // Tab B misses storage events (as if the browser didn't deliver them), so it stays stale.
    const b = await context.newPage()
    await b.addInitScript(() => {
      const add = window.addEventListener.bind(window)
      window.addEventListener = ((type: string, ...rest: unknown[]) =>
        type === 'storage' ? undefined : (add as (...x: unknown[]) => void)(type, ...rest)) as typeof window.addEventListener
    })
    await b.goto('/time_off')
    await expect(b.getByTestId('personal-session-banner')).toBeVisible()

    await a.getByTestId('logout-button').click()
    await expect(a.getByTestId('device-chip')).toBeVisible()

    // The stale tab's Logout: the tablet stays paired, and B re-syncs to it.
    await b.getByTestId('logout-button').click()
    await expect(b.getByTestId('device-chip')).toBeVisible()
    expect(await b.evaluate(() => localStorage.getItem('rockcut_token'))).toBe(deviceToken)
    const t = (await getDevice(owner, device.id))!.tokens[0]
    expect(t.revoked_at).toBeNull()
    await context.close()
  })
})
