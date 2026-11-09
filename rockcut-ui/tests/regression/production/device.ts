import { expect, type Locator, type Page } from '@playwright/test'
import { apiAs } from '../scheduler/helpers'
import { createTempPerson, retireTempPerson, type TempPerson } from '../auth/helpers'
import { dayPx } from './schedule'

// D50 helpers: the brewhouse device on the schedule. Codes belong to
// [TEST-TEMP] people (set by their department's manager), so persona codes
// stay untouched, as in D40's task-board-tablets spec.

export type Coded = { person: TempPerson; code: string }

/** A `[TEST-TEMP]` member of `dept` with a staff code. */
export async function staffWithCode(label: string, dept: 'brewery' | 'bar' = 'brewery'): Promise<Coded> {
  const person = await createTempPerson(label, { ready: false, schedulable: false, memberships: [{ department: dept, role: 'employee' }] })
  const mgr = await apiAs(dept === 'brewery' ? 'breweryMgr' : 'barMgr')
  const code = (await (await mgr.get('/api/staff_codes/suggest')).json()).data.code as string
  const res = await mgr.put(`/api/users/${person.id}/staff_code`, { data: { code } })
  expect(res.status(), await res.text()).toBe(200)
  return { person, code }
}

export const retireCoded = async (people: (Coded | null)[]) => {
  for (const p of people) await retireTempPerson(p?.person ?? null)
}

/** The staff-code dialog: type `code` and Continue. */
export async function enterCode(page: Page, code: string) {
  await expect(page.getByTestId('acting-code-dialog')).toBeVisible()
  await page.getByTestId('acting-staff-code').fill(code)
  await page.getByTestId('acting-submit').click()
}

export const firstName = (c: Coded) => c.person.name.split(' ')[0]

/** "Acting as …" ends now (the banner's Done), so the next write asks again. */
export async function doneActing(page: Page) {
  await page.getByTestId('acting-done').click()
  await expect(page.getByTestId('acting-banner')).toHaveCount(0)
}

// ── Touch (CDP touch events: Chrome makes `pointerType: touch` pointer events) ──

async function fingers(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  return (type: 'touchStart' | 'touchMove' | 'touchEnd', points: [number, number][]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y]) => ({ x, y })) })
}

const middle = async (el: Locator) => {
  await el.scrollIntoViewIfNeeded()
  const b = (await el.boundingBox())!
  return [b.x + b.width / 2, b.y + b.height / 2] as [number, number]
}

/** A long-press let go without moving: the Gantt's selection mode (D48). */
export async function longPress(page: Page, el: Locator) {
  const touch = await fingers(page)
  const at = await middle(el)
  await touch('touchStart', [at])
  // The Gantt's LONG_PRESS_MS is 450.
  await page.waitForTimeout(650)
  await touch('touchEnd', [])
}

/** A finger tap (no long-press). */
export async function tap(page: Page, el: Locator) {
  await page.touchscreen.tap(...(await middle(el)))
}

/** Long-press `el`, then slide it by whole days and let go: a touch drag on the Gantt. */
export async function touchDragBy(page: Page, el: Locator, days: number) {
  const touch = await fingers(page)
  const [x, y] = await middle(el)
  const px = await dayPx(page)
  await touch('touchStart', [[x, y]])
  await page.waitForTimeout(650)
  const to = x + days * px
  for (let i = 1; i <= 12; i++) await touch('touchMove', [[x + ((to - x) * i) / 12, y]])
  await page.waitForTimeout(100)
  await touch('touchEnd', [])
}
