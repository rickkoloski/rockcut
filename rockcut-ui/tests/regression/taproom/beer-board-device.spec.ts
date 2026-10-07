import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'
import { readFileSync } from 'node:fs'
import { createTempPerson, retireTempPerson, signIn, type TempPerson } from '../auth/helpers'
import { addEntry, cleanEntries, historyFor, personWithCode } from './helpers'

// D37 §3.3 / §3.5: the board on the Taproom tablet (S7–S11, S13). Codes belong to a
// [TEST-TEMP] Taproom person, so persona codes stay untouched. The wrong-code
// lockout itself is ExUnit's (the local limit is raised in config/dev.exs);
// here the lock message is checked with a stubbed 429.

test.use({ storageState: authFile('taproomDevice') })

let staff: { person: TempPerson; code: string }
const created: number[] = []

test.beforeAll(async () => {
  staff = await personWithCode('D37 tablet')
})
test.afterAll(async () => {
  await retireTempPerson(staff.person)
})
test.afterEach(async () => {
  await cleanEntries(created.splice(0))
})

test('S7: redeem with a staff code; recorded as that person on Shared Device', async ({ page }) => {
  const e = await addEntry(3, 'S7')
  created.push(e.id)
  await page.goto('/taproom/beer-board')
  await expect(page.getByTestId('board-tab-history')).toHaveCount(0)
  // S11: no CSV files on the tablet, whoever's code is typed later.
  await expect(page.getByTestId('board-add')).toBeVisible()
  await expect(page.getByTestId('board-export')).toHaveCount(0)
  await expect(page.getByTestId('board-import')).toHaveCount(0)
  await page.getByTestId('board-search').fill(e.recipient_name)
  await page.getByTestId(`board-redeem-${e.id}`).click()

  // No code: asked for one; nothing sent.
  await page.getByTestId('board-dialog-submit').click()
  await expect(page.getByTestId('board-redeem-dialog')).toContainText('Enter your 4-digit staff code')

  await page.getByTestId('board-staff-code').fill(staff.code)
  await page.getByTestId('board-dialog-submit').click()
  await expect(page.getByTestId('board-notice')).toContainText(`Recorded as ${staff.person.name}`)

  await page.reload()
  await page.getByTestId('board-search').fill(e.recipient_name)
  await expect(page.getByRole('row').filter({ hasText: e.recipient_name })).toContainText('2')
  const [latest] = await historyFor(e.recipient_name)
  expect(latest).toMatchObject({ action: 'redeemed', actor_name: staff.person.name, on_shared_device: true, beers_before: 3, beers_after: 2 })
})

test('S9: a wrong code is refused under the field; the dialog stays open', async ({ page }) => {
  const e = await addEntry(2, 'S9')
  created.push(e.id)
  await page.goto('/taproom/beer-board')
  await page.getByTestId('board-search').fill(e.recipient_name)
  await page.getByTestId(`board-redeem-${e.id}`).click()
  await page.getByTestId('board-staff-code').fill(staff.code === '0000' ? '0001' : '0000')
  await page.getByTestId('board-dialog-submit').click()
  await expect(page.getByTestId('board-redeem-dialog')).toContainText("That staff code isn't right")
  await expect(page.getByTestId('board-staff-code')).toHaveValue('')
  expect((await historyFor(e.recipient_name)).map((h) => h.action)).toEqual(['created'])
})

test('S9: the lockout message shows under the field', async ({ page }) => {
  const e = await addEntry(2, 'S9 lock')
  created.push(e.id)
  await page.route(`**/api/beer_board/${e.id}/redeem`, (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'staff_code_locked', retry_after_minutes: 7, message: 'Too many wrong codes. Try again in 7 minutes, or use Sign in as me.' }),
    }),
  )
  await page.goto('/taproom/beer-board')
  await page.getByTestId('board-search').fill(e.recipient_name)
  await page.getByTestId(`board-redeem-${e.id}`).click()
  await page.getByTestId('board-staff-code').fill('1234')
  await page.getByTestId('board-dialog-submit').click()
  await expect(page.getByTestId('board-redeem-dialog')).toContainText('Try again in 7 minutes, or use Sign in as me.')
})

test('S7/S8: add from the tablet, then pour the last beer', async ({ page }) => {
  await page.goto('/taproom/beer-board')
  await page.getByTestId('board-add').click()
  const name = `[TEST-TEMP] tablet add ${Date.now().toString(36)}`
  await page.getByTestId('board-recipient').fill(name)
  await page.getByTestId('board-purchaser').fill('Bo')
  await page.getByTestId('board-beers').fill('1')
  await page.getByTestId('board-staff-code').fill(staff.code)
  const saved = page.waitForResponse((r) => r.url().endsWith('/api/beer_board') && r.request().method() === 'POST')
  await page.getByTestId('board-dialog-submit').click()
  const e = (await (await saved).json()).data
  created.push(e.id)
  await expect(page.getByTestId('board-notice')).toContainText(`Recorded as ${staff.person.name}`)

  await page.getByTestId('board-search').fill(name)
  await page.getByTestId(`board-redeem-${e.id}`).click()
  await expect(page.getByTestId('board-redeem-last')).toBeVisible()
  await page.getByTestId('board-staff-code').fill(staff.code)
  await page.getByTestId('board-dialog-submit').click()
  await expect(page.getByTestId('board-notice')).toContainText('entry removed')
  await page.reload()
  await page.getByTestId('board-search').fill(name)
  await expect(page.getByRole('gridcell', { name, exact: true })).toHaveCount(0)
})

test('S13: "Sign in as me" on the tablet, then Redeem: no code asked; History shows just the name', async ({ page }) => {
  // A device-bound session for a [TEST-TEMP] Taproom person (D34: never a persona's token).
  const person = await createTempPerson('D37 S13')
  try {
    const e = await addEntry(3, 'S13')
    created.push(e.id)
    const deviceToken = JSON.parse(readFileSync(authFile('taproomDevice'), 'utf8'))
      .origins[0].localStorage.find((x: { name: string }) => x.name === 'rockcut_token').value as string

    await page.goto('/')
    await expect(page.getByTestId('device-chip')).toBeVisible()
    await page.getByTestId('personal-signin').click()
    await expect(page.getByTestId('login-email')).toBeVisible()
    // Token injection stands in for typing the person's password.
    await page.evaluate((t) => localStorage.setItem('rockcut_token', t), await signIn(person, deviceToken))
    await page.reload()
    await expect(page.getByTestId('personal-session-banner')).toContainText(person.name)

    await page.goto('/taproom/beer-board')
    await page.getByTestId('board-search').fill(e.recipient_name)
    await page.getByTestId(`board-redeem-${e.id}`).click()
    await expect(page.getByTestId('board-redeem-dialog')).toBeVisible()
    await expect(page.getByTestId('board-staff-code')).toHaveCount(0)
    const saved = page.waitForResponse((r) => r.url().endsWith(`/api/beer_board/${e.id}/redeem`))
    await page.getByTestId('board-dialog-submit').click()
    expect((await saved).status()).toBe(200)
    await expect(page.getByTestId('board-notice')).toContainText(`Redeemed 1 for ${e.recipient_name}`)
    await expect(page.getByTestId('board-notice')).not.toContainText('Recorded as')

    await page.reload()
    await expect(page.getByTestId('personal-session-banner')).toBeVisible()
    await page.getByTestId('board-search').fill(e.recipient_name)
    await expect(page.getByRole('row').filter({ hasText: e.recipient_name })).toContainText('2')
    const [latest] = await historyFor(e.recipient_name)
    expect(latest).toMatchObject({ action: 'redeemed', actor_name: person.name, on_shared_device: false, beers_before: 3, beers_after: 2 })
  } finally {
    await retireTempPerson(person)
  }
})

test('DEV pass 1 G4: a pasted code keeps its 4 digits (spaces and dashes dropped)', async ({ page }) => {
  await page.goto('/taproom/beer-board')
  await page.getByTestId('board-add').click()
  const field = page.getByTestId('board-staff-code')
  for (const text of [' 1234', '12 34', '12-34', '123456']) {
    await field.fill(text)
    await expect(field).toHaveValue('1234')
    // As a paste: one insertion of the whole text into the empty field.
    await field.fill('')
    await field.focus()
    await page.keyboard.insertText(text)
    await expect(field).toHaveValue('1234')
  }
  // Nothing submitted, so no limiter attempt is spent.
})
