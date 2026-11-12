import { test, expect } from '@playwright/test'
import { authFile, personas } from '../../config/test-env'
import { apiAs } from '../scheduler/helpers'
import { createTempPerson, retireTempPerson, type TempPerson } from '../auth/helpers'
import { addEntry, cleanEntries, csvFile, openUser, previewImport } from '../taproom/helpers'
import { settingsItem } from '../settingsMenu'

// D58 §3.12–§3.15, the UI follow-ups: S22 (import headers), S24 (Taproom
// "— None —"), S25 (readable staff-code activity), S26 (History search and
// export), S27 (push in a browser that can't). S23 (Redeem after the entry was
// removed) is D37's S17 in regression/taproom/beer-board-staff.spec.ts, and
// S28 (drag Idea Board lists) is regression/ideas/list-drag.spec.ts (the
// one-worker `idea-boards` project).

const people: TempPerson[] = []
const entries: number[] = []
test.afterAll(async () => {
  for (const p of people.splice(0)) await retireTempPerson(p)
  await cleanEntries(entries.splice(0))
})

test.describe('barMgr', () => {
  test.use({ storageState: authFile('barMgr') })

  test('S22: import: a blank header is "(blank)", a repeated one is listed once, a long one wraps', async ({ page }) => {
    // Preview and Cancel only: nothing is written.
    const long = 'X'.repeat(600)
    await previewImport(page, csvFile(['[TEST-TEMP] Pat,Lee,1,a,,b,c,d'], `For,Bought by,Beers,Notes,,Notes,${long},`))
    const ignored = page.getByTestId('import-ignored-columns')
    await expect(ignored).toHaveText(`Ignored columns: Notes, (blank), ${long}`)
    const box = (await ignored.boundingBox())!
    const frame = (await page.locator('.MuiDialog-paper').filter({ has: ignored }).boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width)
    await page.keyboard.press('Escape')
  })

  test('S26: History finds who made a change ("Sam Pour", "Shared Device"); Export CSV sends the search', async ({ page }) => {
    const entry = await addEntry(2, 'D58 S26', 'bartender1')
    entries.push(entry.id)

    await page.goto('/taproom/beer-board')
    await settingsItem(page, 'board-settings', 'board-tab-history')
    let searched = page.waitForResponse((r) => r.url().includes('/api/beer_board/history?') && r.url().includes('q=Sam+Pour'))
    await page.getByTestId('board-history-search').fill(personas.bartender1.name)
    const bySam: { actor_name: string; recipient_name: string; purchaser_name: string | null }[] = (await (await searched).json()).data
    expect(bySam.some((e) => e.recipient_name === entry.recipient_name && e.actor_name === personas.bartender1.name)).toBe(true)
    // Each one is Sam's change, or names Sam.
    for (const e of bySam) expect([e.actor_name, e.recipient_name, e.purchaser_name].join(' ')).toContain(personas.bartender1.name)
    await expect(page.getByText(entry.recipient_name).first()).toBeVisible()

    let asked = page.waitForResponse((r) => r.url().includes('/api/beer_board/history/export.csv'))
    await page.getByTestId('board-history-export').click()
    let exported = await asked
    expect(new URL(exported.url()).searchParams.get('q')).toBe(personas.bartender1.name)
    expect(await exported.text()).toContain(entry.recipient_name)

    searched = page.waitForResponse((r) => r.url().includes('/api/beer_board/history?') && r.url().includes('q=Shared+Device'))
    await page.getByTestId('board-history-search').fill('Shared Device')
    // Every change it finds was made on a tablet (there may be none on a fresh database).
    const found: { on_shared_device: boolean }[] = (await (await searched).json()).data
    expect(found.every((e) => e.on_shared_device)).toBe(true)
    asked = page.waitForResponse((r) => r.url().includes('/api/beer_board/history/export.csv'))
    await page.getByTestId('board-history-export').click()
    exported = await asked
    expect(new URL(exported.url()).searchParams.get('q')).toBe('Shared Device')
    expect(await exported.text()).not.toContain(entry.recipient_name)
  })
})

test.describe('owner', () => {
  test.use({ storageState: authFile('owner') })

  test('S24: Taproom "— None —" shows as such, and the staff code note says it is cleared', async ({ page }) => {
    // A [TEST-TEMP] Taproom employee with a code; Cancel, so nothing is written.
    const person = await createTempPerson('D58 S24', { schedulable: false })
    people.push(person)
    const owner = await apiAs('owner')
    const code = (await (await owner.get('/api/staff_codes/suggest')).json()).data.code
    expect((await owner.put(`/api/users/${person.id}/staff_code`, { data: { code } })).status()).toBe(200)

    await openUser(page, person.name)
    const taproom = page.getByTestId('user-role-bar')
    await expect(page.getByTestId('staff-code-section')).toBeVisible()
    await taproom.getByRole('combobox').click()
    await page.getByRole('option', { name: '— None —' }).click()
    await expect(taproom.getByRole('combobox')).toHaveText('— None —')
    await expect(page.getByTestId('staff-code-section')).toContainText('The staff code is cleared when you press Save.')
    await page.getByRole('button', { name: 'Cancel' }).click()
    const row = (await (await owner.get('/api/users')).json()).data.find((u: { id: number }) => u.id === person.id)
    expect(row.memberships.map((m: { department_key: string }) => m.department_key)).toEqual(['bar'])
    expect(row.has_staff_code).toBe(true)
  })

  test('S25: the change log reads "Staff code set", "Staff code shown", "Staff code removed"', async ({ page }) => {
    const person = await createTempPerson('D58 S25', { schedulable: false })
    people.push(person)
    const owner = await apiAs('owner')
    const code = (await (await owner.get('/api/staff_codes/suggest')).json()).data.code
    expect((await owner.put(`/api/users/${person.id}/staff_code`, { data: { code } })).status()).toBe(200)
    expect((await owner.get(`/api/users/${person.id}/staff_code`)).status()).toBe(200)
    expect((await owner.delete(`/api/users/${person.id}/staff_code`)).status()).toBeLessThan(300)

    await page.goto('/activity')
    // The log names a person by their email.
    const rows = page.getByRole('row').filter({ hasText: person.email })
    for (const label of ['Staff code set', 'Staff code shown', 'Staff code removed'])
      await expect(rows.filter({ has: page.getByRole('gridcell', { name: label, exact: true }) })).toHaveCount(1)
    await expect(page.getByRole('gridcell', { name: /^staff_code\./ })).toHaveCount(0)
  })
})

test.describe('brewer1', () => {
  test.use({ storageState: authFile('brewer1') })

  test('S27: Enable push where the browser refuses it: the message, the button still usable, nothing unhandled', async ({ page }) => {
    // A browser with push that refuses the subscription, as a private window
    // does. The dev server has no service worker, so one is stood in.
    await page.addInitScript(() => {
      const pushManager = {
        getSubscription: async () => null,
        subscribe: async () => {
          throw new DOMException('Registration failed - push service not available', 'AbortError')
        },
      }
      Object.defineProperty(navigator.serviceWorker, 'getRegistration', { value: async () => ({ pushManager }), configurable: true })
      Object.defineProperty(Notification, 'permission', { get: () => 'default', configurable: true })
      Notification.requestPermission = async () => 'granted'
    })
    await page.route('**/api/push/public_key', (route) =>
      route.fulfill({ json: { public_key: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U' } }),
    )
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    const subscribed: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/api/push/subscriptions') && r.method() === 'POST') subscribed.push(r.url())
    })

    await page.goto('/')
    await page.getByTestId('notification-bell').click()
    await page.getByTestId('notification-preferences').click()
    const dialog = page.getByRole('dialog', { name: 'Notification preferences' })
    const enable = dialog.getByRole('button', { name: 'Enable push' })
    await enable.click()
    await expect(dialog.getByTestId('push-error')).toHaveText('Push can’t be turned on in this browser (private windows don’t support it).')
    await expect(enable).toBeEnabled()
    // Again: the same message, still no unhandled error, nothing sent.
    await enable.click()
    await expect(dialog.getByTestId('push-error')).toBeVisible()
    expect(errors).toEqual([])
    expect(subscribed).toEqual([])
  })
})
