import { test, expect as baseExpect } from '@playwright/test'
import { contextWith, createTempPerson, meStatus, retireTempPerson, signIn, type TempPerson } from './helpers'
import { claimSpare } from './spares'

// D34 S2, S3, S14: sign-out and "Sign out of all other devices" revoke
// sessions on the server. S2/S3 use spare sessions; S14 revokes everything of
// a person, so it uses a throwaway [TEST-TEMP] person. In order, not in
// parallel: password hashing is slow on DEV's one vCPU.
const expect = baseExpect.configure({ timeout: 15_000 })
test.describe.configure({ timeout: 60_000, mode: 'default' })
test.use({ storageState: { cookies: [], origins: [] } })

let person: TempPerson | null = null
test.afterEach(async () => {
  await retireTempPerson(person)
  person = null
})

test('S2: Logout revokes the session; the old token gets 401', async ({ browser }) => {
  const token = claimSpare()
  const { context, page } = await contextWith(browser, token)

  await page.goto('/')
  await expect(page.getByTestId('logout-button')).toBeVisible()
  const revoked = page.waitForResponse((r) => r.url().endsWith('/api/session') && r.request().method() === 'DELETE')
  await page.getByTestId('logout-button').click()
  expect((await revoked).status()).toBe(200)
  await expect(page.getByTestId('login-email')).toBeVisible()

  expect(await meStatus(token)).toBe(401)
  await context.close()
})

test('S3: Logout in one browser leaves the other signed in', async ({ browser }) => {
  const a = await contextWith(browser, claimSpare())
  const bToken = claimSpare()
  const b = await contextWith(browser, bToken)

  await a.page.goto('/')
  await a.page.getByTestId('logout-button').click()
  await expect(a.page.getByTestId('login-email')).toBeVisible()

  await b.page.goto('/')
  await expect(b.page.getByTestId('logout-button')).toBeVisible()
  expect(await meStatus(bToken)).toBe(200)
  await a.context.close()
  await b.context.close()
})

test('S14: Profile → Sign out of all other devices keeps this browser only', async ({ browser }) => {
  person = await createTempPerson('S14 sign out others')
  const phoneToken = await signIn(person)
  const laptopToken = await signIn(person)
  const otherToken = await signIn(person)
  const phone = await contextWith(browser, phoneToken)
  const laptop = await contextWith(browser, laptopToken)

  await phone.page.goto('/profile')
  await phone.page.getByTestId('sign-out-others').click()
  await expect(phone.page.getByRole('dialog')).toContainText('everywhere except this browser')
  const done = phone.page.waitForResponse((r) => r.url().endsWith('/api/sessions/others'))
  await phone.page.getByRole('dialog').getByRole('button', { name: 'Sign out others' }).click()
  expect((await done).status()).toBe(200)
  await expect(phone.page.getByTestId('sign-out-others-success')).toContainText('Signed out of 2 other sessions')

  // Persist-verify: this browser survives a reload; the others are refused.
  await phone.page.reload()
  await expect(phone.page.getByTestId('profile-page')).toBeVisible()
  expect(await meStatus(phoneToken)).toBe(200)
  expect(await meStatus(otherToken)).toBe(401)
  await laptop.page.goto('/')
  await expect(laptop.page.getByTestId('login-email')).toBeVisible()
  await phone.context.close()
  await laptop.context.close()
})
