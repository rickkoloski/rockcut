import { expect, type Page } from '@playwright/test'
import type { PersonaKey } from '../../config/test-env'
import { addDays, apiAs, denverToday, denverUtc, tempTag } from '../scheduler/helpers'
import { localDayKey } from '../../../src/lib/datetime'

// D44: time off specs. Every request made here carries a `[TEST-TEMP]` note
// (tempTag) and is cancelled by id afterwards (`cleanupTimeOff`). A request
// that has already passed can't be cancelled any more; a reseed deletes those
// (notes starting `[TEST-TEMP]`). Until then they stay, and a person's
// requests can't overlap (DEV fix cycle 1, G7), so specs that make one, or
// that could meet a `[SEED]` row, take their days from `freeDays`.

export { addDays, apiAs, denverToday, denverUtc, tempTag }

export interface ApiTimeOff {
  id: number
  user_id: number
  status: 'pending' | 'approved' | 'denied' | 'cancelled'
  note: string | null
  reviewer_note: string | null
}

export interface ApiNotification {
  event: string
  title: string
  body: string | null
  data: { url?: string } | null
}

/** Everything a test made, by id and requester, for `cleanupTimeOff`. */
export const made: { id: number; requester: PersonaKey }[] = []

const ids = new Map<PersonaKey, number>()

/** A persona's user id (from `/api/me`). */
export async function userId(persona: PersonaKey): Promise<number> {
  if (!ids.has(persona)) {
    const me = await (await (await apiAs(persona)).get('/api/me')).json()
    ids.set(persona, me.user.id)
  }
  return ids.get(persona)!
}

/** The `pending_time_off` badge count `/api/me` gives a persona now. */
export async function apiBadge(persona: PersonaKey): Promise<number> {
  const me = await (await (await apiAs(persona)).get('/api/me')).json()
  return me.capabilities.pending_time_off ?? 0
}

interface Dates {
  first: string // Colorado day key
  last: string
  /** Timed: "HH:MM" on `first` and `last`; all day otherwise (00:00 → 23:59, as the form sends). */
  from?: string
  to?: string
}

function body(d: Dates, note: string, extra: Record<string, unknown> = {}) {
  const timed = !!d.from
  return {
    type: 'pto',
    all_day: !timed,
    starts_at: denverUtc(d.first, d.from ?? '00:00'),
    ends_at: denverUtc(d.last, d.to ?? '23:59'),
    note,
    ...extra,
  }
}

/** `persona` requests time off for themselves (pending). */
export async function requestOwn(persona: PersonaKey, d: Dates, note: string, extra: Record<string, unknown> = {}): Promise<ApiTimeOff> {
  const res = await (await apiAs(persona)).post('/api/time_off', { data: body(d, note, extra) })
  expect(res.status(), await res.text()).toBe(201)
  const r = (await res.json()).data as ApiTimeOff
  made.push({ id: r.id, requester: persona })
  return r
}

/** `manager` enters time off for `employee` (created approved; past dates allowed). */
export async function enterFor(manager: PersonaKey, employee: PersonaKey, d: Dates, note: string): Promise<ApiTimeOff> {
  const res = await (await apiAs(manager)).post('/api/time_off', { data: body(d, note, { user_id: await userId(employee) }) })
  expect(res.status(), await res.text()).toBe(201)
  const r = (await res.json()).data as ApiTimeOff
  made.push({ id: r.id, requester: employee })
  return r
}

export async function review(persona: PersonaKey, id: number, status: 'approved' | 'denied', note?: string) {
  return (await apiAs(persona)).post(`/api/time_off/${id}/review`, { data: { status, reviewer_note: note ?? null } })
}

/** One request as `persona` sees it (from the list), or undefined. */
export async function findAs(persona: PersonaKey, id: number): Promise<ApiTimeOff | undefined> {
  const list = (await (await (await apiAs(persona)).get('/api/time_off')).json()).data as ApiTimeOff[]
  return list.find((r) => r.id === id)
}

/** Remember a request the UI made (found by its unique note), for cleanup. */
export async function adopt(persona: PersonaKey, note: string): Promise<ApiTimeOff> {
  const list = (await (await (await apiAs(persona)).get('/api/time_off')).json()).data as ApiTimeOff[]
  const r = list.find((x) => x.note === note)
  expect(r, `no request with note ${note}`).toBeTruthy()
  made.push({ id: r!.id, requester: persona })
  return r!
}

/** Cancel, by id and as its requester, every request this test made that can still be cancelled. */
export async function cleanupTimeOff() {
  for (const { id, requester } of made.splice(0)) {
    const r = await findAs(requester, id)
    if (!r || !r.note?.startsWith('[TEST-TEMP]')) continue
    if (r.status === 'pending' || r.status === 'approved') {
      // 422 for one already past: `setup` removes it.
      await (await apiAs(requester)).post(`/api/time_off/${id}/cancel`)
    }
  }
}

/** A persona's in-app notifications of `event` whose body contains `text`. */
export async function notificationsOf(persona: PersonaKey, event: string, text: string): Promise<ApiNotification[]> {
  const list = (await (await (await apiAs(persona)).get('/api/notifications')).json()).data as ApiNotification[]
  return list.filter((n) => n.event === event && (n.body ?? '').includes(text))
}

/** The red count on a nav item (`Schedule` section, `Time off` item); 0 when there's none. */
export async function navBadge(page: Page, label: 'Schedule' | 'Time off'): Promise<number> {
  const item = page
    .locator('.MuiDrawer-paper')
    .first()
    .getByRole('button', { name: new RegExp(`^(\\d+ )?${label}$`) })
  await expect(item).toBeVisible()
  const badge = item.locator('.MuiBadge-badge:not(.MuiBadge-invisible)')
  return (await badge.count()) === 0 ? 0 : Number(await badge.first().innerText())
}

/** Poll a nav badge until it reads `n`. */
export async function expectNavBadge(page: Page, label: 'Schedule' | 'Time off', n: number) {
  await expect.poll(() => navBadge(page, label), { message: `${label} badge` }).toBe(n)
}

/** View Schedule showing `from`–`to`. */
export async function openAgenda(page: Page, from: string, to: string) {
  await page.goto('/schedule')
  await page.getByLabel('From').fill(from)
  await page.getByLabel('To').fill(to)
}

export const dialog = (page: Page) => page.getByTestId('time-off-dialog')

/** Today in Colorado and the days around it. */
export const today = () => denverToday()
export const dayFrom = (n: number) => addDays(denverToday(), n)

/**
 * The first `n` days in a row, starting `start` days from today and moving
 * `step` days at a time, on which `persona` has no pending or approved time off.
 */
export async function freeDays(persona: PersonaKey, start: number, n = 1, step = 1): Promise<{ first: string; last: string }> {
  const list = (await (await (await apiAs(persona)).get('/api/time_off')).json()).data as (ApiTimeOff & { starts_at: string; ends_at: string })[]
  const taken = list
    .filter((r) => r.status === 'pending' || r.status === 'approved')
    .map((r) => [localDayKey(r.starts_at), localDayKey(r.ends_at)] as const)
  for (let s = start, i = 0; i < 400; s += step, i++) {
    const first = dayFrom(s)
    const last = dayFrom(s + n - 1)
    if (!taken.some(([a, b]) => a <= last && first <= b)) return { first, last }
  }
  throw new Error(`no free days for ${persona}`)
}
