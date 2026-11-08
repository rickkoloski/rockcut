import { test, expect as baseExpect, type Page } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { apiAs, tempTag } from '../scheduler/helpers'
import { contextWith, createTempPerson, retireTempPerson, signIn, type TempPerson } from '../auth/helpers'
import { blankTablet, createDevice, deleteDevices, expectUnpaired, getDevice, pairingCode, setUpTablet } from './helpers'

// D55 §2.1 (task 5120), T1–T4: one 401 on one route asks GET /api/me once
// before a tablet unpairs or a person is signed out. The forced 401 is the
// browser's (page.route); the server's token stays good, so T1/T2 can use the
// shared personas: at worst they lose their own localStorage, not the token.
const expect = baseExpect.configure({ timeout: 15_000 })
test.describe.configure({ timeout: 60_000 })

/** The next GET /api/channels answers 401 in this page only; resolves once it has. */
async function stray401(page: Page) {
  let hit!: () => void
  const done = new Promise<void>((r) => (hit = r))
  await page.route('**/api/channels', async (route) => {
    await route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Unauthorized"}' })
    hit()
  }, { times: 1 })
  return done
}

const storedToken = (page: Page) => page.evaluate(() => localStorage.getItem('rockcut_token'))

test.describe('taproomDevice', () => {
  test.use({ storageState: authFile('taproomDevice') })

  test('T1: a 401 on /api/channels with /api/me fine: the tablet stays paired and keeps working', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('device-chip')).toBeVisible()
    const token = await storedToken(page)
    expect(token).toMatch(/^dev_/)

    const meChecks: string[] = []
    page.on('request', (r) => {
      if (new URL(r.url()).pathname === '/api/me') meChecks.push(r.url())
    })
    const hit = await stray401(page)
    await page.goto('/messages/all')
    await hit
    // One recheck, answered 200: nothing changes.
    await expect.poll(() => meChecks.length).toBeGreaterThanOrEqual(1)
    await expect(page.getByTestId('device-unpaired-notice')).toHaveCount(0)
    expect(await storedToken(page)).toBe(token)
    expect(await page.evaluate(() => localStorage.getItem('rockcut_device_unpaired'))).toBeNull()

    // Persist-verify: after a reload it's still the paired tablet and the page works.
    await page.reload()
    await expect(page.getByTestId('device-chip')).toContainText('Shared device · Taproom')
    await expect(page.getByRole('heading', { name: 'All-staff' })).toBeVisible()
  })
})

test.describe('bartender1', () => {
  test.use({ storageState: authFile('bartender1') })

  test('T2: a 401 on /api/channels with /api/me fine: the person stays signed in', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('account-menu')).toBeVisible()
    const token = await storedToken(page)

    const hit = await stray401(page)
    await page.goto('/messages/all')
    await hit
    await expect(page.getByRole('heading', { name: 'All-staff' })).toBeVisible()
    expect(await storedToken(page)).toBe(token)

    await page.reload()
    await expect(page.getByTestId('account-menu')).toBeVisible()
    await expect(page.getByTestId('login-password')).toHaveCount(0)
  })
})

test.describe('the token really ended', () => {
  let tag = ''
  let person: TempPerson | null = null
  test.afterEach(async () => {
    if (tag) await deleteDevices(await apiAs('owner'), tag)
    tag = ''
    await retireTempPerson(person)
    person = null
  })

  test('T3: a tablet revoked in Shared devices still unpairs on its next request', async ({ browser }) => {
    tag = tempTag('D55 T3 tablets')
    const owner = await apiAs('owner')
    const device = await createDevice(owner, tag)
    const tablet = await blankTablet(browser)
    await setUpTablet(tablet.page, await pairingCode(await apiAs('barMgr'), device.id), `${tag} iPad`)

    const tokenId = (await getDevice(owner, device.id))!.tokens[0].id
    expect((await owner.delete(`/api/device_tokens/${tokenId}`)).status()).toBe(204)

    await tablet.page.goto('/messages/all')
    await expectUnpaired(tablet.page)
    // Persist-verify: still unpaired after a reload.
    await tablet.page.reload()
    await expectUnpaired(tablet.page)
    await tablet.context.close()
  })

  test('T4: a deactivated person is still signed out on their next request', async ({ browser }) => {
    person = await createTempPerson('D55 T4')
    const { context, page } = await contextWith(browser, await signIn(person))
    await page.goto('/')
    await expect(page.getByTestId('account-menu')).toBeVisible()

    const owner = await apiAs('owner')
    expect((await owner.patch(`/api/users/${person.id}`, { data: { active: false } })).status()).toBe(200)

    await page.goto('/messages/all')
    await expect(page.getByTestId('login-password')).toBeVisible()
    expect(await storedToken(page)).toBeNull()
    await context.close()
  })
})
