import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { addDays, apiAs, denverToday, denverUtc, tempTag } from '../scheduler/helpers'

// Shared helpers for the D38 task board specs (tests/regression/brewery/task-board-*.spec.ts).
// They run in their own one-worker project (playwright.config.ts): "Move all to
// today" moves every open past task, so two board specs mustn't overlap.

export { addDays, apiAs, denverToday, denverUtc, tempTag }

export interface ApiTask {
  id: number
  title: string
  due_on: string | null
  position: number
  done: boolean
  assignee_id: number | null
  notes: string | null
  completed_display: string | null
}

export interface ApiCard extends ApiTask {
  key: string
  locked: boolean
}

export interface ApiBoard {
  today: string
  days: { date: string; cards: ApiCard[]; header: unknown; daily: ApiDailyCard }[]
  unfinished: ApiCard[]
  future: ApiCard[]
}

/** Create a task as `api` (a Brewery member); returns it. */
export async function createTask(api: APIRequestContext, attrs: { title: string; due_on?: string | null; assignee_id?: number | null; notes?: string }) {
  const res = await api.post('/api/brewery/tasks', { data: attrs })
  expect(res.status(), await res.text()).toBe(201)
  return (await res.json()).data as ApiTask
}

export async function completeTask(api: APIRequestContext, id: number, display?: string) {
  const res = await api.post(`/api/brewery/tasks/${id}/complete`, { data: display ? { display } : {} })
  expect(res.status(), await res.text()).toBe(200)
}

export async function getBoard(api: APIRequestContext, from: string, to: string): Promise<ApiBoard> {
  const res = await api.get('/api/brewery/tasks', { params: { from, to } })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()).data
}

/** Titles of one day's cards, in order. */
export async function dayTitles(api: APIRequestContext, date: string): Promise<string[]> {
  const board = await getBoard(api, date, date)
  return board.days[0].cards.map((c) => c.title)
}

export async function futureTitles(api: APIRequestContext): Promise<string[]> {
  const t = denverToday()
  return (await getBoard(api, t, t)).future.map((c) => c.title)
}

/**
 * Delete every `[TEST-TEMP]` task this spec could have left: the ids it
 * created, plus a sweep of the Unfinished card, the Future list and a month
 * either side of today.
 */
export async function cleanupTasks(ids: number[]) {
  const api = await apiAs('breweryMgr')
  const today = denverToday()
  const seen = new Set(ids)
  for (const [from, to] of [
    [addDays(today, -31), addDays(today, -1)],
    [today, addDays(today, 30)],
  ]) {
    const board = await getBoard(api, from, to)
    for (const c of [...board.unfinished, ...board.future, ...board.days.flatMap((d) => d.cards)]) {
      if (c.title.startsWith('[TEST-TEMP]')) seen.add(c.id)
    }
  }
  for (const id of seen) {
    const res = await api.delete(`/api/brewery/tasks/${id}`)
    expect([204, 404]).toContain(res.status())
  }
}

/** Open the board (optionally on a range) and wait for it. */
export async function openBoard(page: Page, range?: { from: string; to: string }) {
  await page.goto(range ? `/brewery/tasks?from=${range.from}&to=${range.to}` : '/brewery/tasks')
  await expect(page.getByTestId('board-grid')).toBeVisible({ timeout: 20_000 })
}

/** A task's card on a day (`date`), the Future list (`future`) or the Unfinished card (`unfinished`). */
export const card = (page: Page, id: number, where: string) => page.getByTestId(`task-${id}:${where}`)

/** The card keys in one list, in order. */
export async function listKeys(page: Page, listTestId: string): Promise<string[]> {
  return page
    .getByTestId(listTestId)
    .locator('[data-testid^="task-"][data-done]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.slice('task-'.length)))
}

/** Wait for the board's next successful write of this kind (move, complete, …). */
export function boardWrite(page: Page, path: RegExp, method = 'POST') {
  return page.waitForResponse((r) => path.test(new URL(r.url()).pathname) && r.request().method() === method && r.ok())
}

/**
 * Click one of the board's check boxes (a task or a Daily check) and wait for
 * it to show `checked`. Not `locator.check()`: these boxes follow the cached
 * board, which reaches React a tick after the click (TanStack Query batches its
 * updates), and `check()` reads the box back at once, so under load it can see
 * the old state and throw "did not change its state".
 */
export async function setBoardCheck(box: Locator, checked: boolean) {
  await expect(box).toBeChecked({ checked: !checked })
  await box.click()
  await expect(box).toBeChecked({ checked })
}

/** The persona's user id, from /api/me. */
export async function userId(api: APIRequestContext): Promise<number> {
  return (await (await api.get('/api/me')).json()).user.id
}

/** The lifted item's place in the list (`aria-pressed` marks it; the overlay copy has no sortable wrapper). */
const LIFTED = '[aria-roledescription="sortable"][aria-pressed="true"]'

/**
 * Where the lifted item's placeholder shows in `list`, once nothing in it is
 * still sliding: 'ok' when it's just before `before` (or last, with no
 * `before`), else a few words for the failure message.
 */
async function dropSpot(list: Locator, before?: Locator) {
  return list.evaluate(
    (el, beforeEl) => {
      const items = Array.from(el.querySelectorAll('[aria-roledescription="sortable"]'))
      if (items.some((e) => e.getAnimations().length > 0)) return 'still moving'
      const top = (e: Element) => e.getBoundingClientRect().top
      const shown = items.sort((a, b) => top(a) - top(b))
      const at = shown.findIndex((e) => e.getAttribute('aria-pressed') === 'true')
      if (at < 0) return 'not in this list'
      if (!beforeEl) return at === shown.length - 1 ? 'ok' : `${at + 1} of ${shown.length}, not last`
      const next = shown.findIndex((e) => e.contains(beforeEl))
      return next === at + 1 ? 'ok' : `${at + 1} of ${shown.length}, with the target card at ${next + 1}`
    },
    before ? await before.elementHandle() : null,
  )
}

/**
 * Mouse-drag `source` into `list`: to its end, or just before `before` (a
 * card in it). Like a person watching the gap: round to just below the list,
 * up into its bottom edge (the placeholder goes last), then up onto `before`
 * (the placeholder slides in front of it), and let go only once the
 * placeholder shows there. (Dropped straight onto a card from above, a
 * sortable item lands after it; so does one already in front of it.) Moves
 * in steps so the 8px activation distance and the collision checks see it.
 *
 * DEV run 2, S23e: on the straight line in, the placeholder went last, then
 * flicked in front of `before` as the list grew under the pointer, and
 * `before` was still sliding back when its box was read. The pointer went to
 * that stale spot, which was the placeholder's own slot, and the drop
 * landed at the end. So the route comes up from below the list (no cards
 * crossed on the way in), and nothing is read or let go until the
 * placeholder has settled where it should be. A source that can't be lifted
 * (a locked card, the Daily card) gets the same moves with no waiting.
 */
export async function mouseDrag(page: Page, source: Locator, list: Locator, before?: Locator) {
  const vp = page.viewportSize()!
  await source.scrollIntoViewIfNeeded()
  const liftable = await source.evaluate((e) => !!e.closest('[aria-roledescription="sortable"]') && !e.closest('[data-locked="true"]'))
  const s = (await source.boundingBox())!
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2)
  await page.mouse.down()
  await page.mouse.move(s.x + s.width / 2 + 12, s.y + s.height / 2 + 12, { steps: 4 })
  if (liftable) await expect(page.locator(LIFTED)).toHaveCount(1)
  let l = (await list.boundingBox())!
  if (l.y + l.height > vp.height * 0.8) {
    // Scrolling under a pointer resting on the board would move the card
    // into whatever list passed beneath it, and resting near an edge sets
    // off auto-scroll: specs that need both ends on screen use a tall viewport.
    throw new Error('mouseDrag: the target list ends near or past the bottom of the screen; use a taller viewport')
  }
  const below = l.y + l.height + 24
  await page.mouse.move(s.x + s.width / 2 + 12, below, { steps: 10 })
  await page.mouse.move(l.x + l.width / 2, below, { steps: 20 })
  // Up into the bottom edge. Lists the pointer crossed may have grown and
  // pushed this one down, so aim again until the placeholder is last.
  await expect(async () => {
    l = (await list.boundingBox())!
    await page.mouse.move(l.x + l.width / 2, l.y + l.height - 4, { steps: 3 })
    if (liftable) expect(await dropSpot(list)).toBe('ok')
  }).toPass({ timeout: 10_000 })
  if (before) {
    // Read with the placeholder last and nothing shifted, so this is where `before` sits.
    const b = (await before.boundingBox())!
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 })
    if (liftable) await expect.poll(() => dropSpot(list, before), { timeout: 10_000 }).toBe('ok')
  }
  await page.mouse.up()
}

/** Move a task back to a day through the API (to put shared data back after a spec). */
export async function moveTask(api: APIRequestContext, id: number, dueOn: string | null, beforeId: number | null = null) {
  const res = await api.post(`/api/brewery/tasks/${id}/move`, { data: { due_on: dueOn, before_id: beforeId } })
  expect(res.status(), await res.text()).toBe(200)
}

/** "Mon 10/12", as the board labels a day. */
export const dayLabel = (key: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'numeric', day: 'numeric' })
    .format(new Date(`${key}T12:00:00Z`))
    .replace(',', '')

// ── Daily card (S24–S31) ─────────────────────────────────────────────

export interface ApiDailyItem {
  id: number
  name: string
  position: number
  active: boolean
}

export interface ApiDailyCard {
  date: string
  done: number
  total: number
  items: { daily_item_id: number; name: string; active: boolean; checked: boolean; completed_by_name: string | null }[]
}

/** The four items every Daily card starts with, in order. */
export const DEFAULT_DAILY_ITEMS = ['Backups', 'Gravities', 'Temps', 'Pressures']

export async function dailyItems(api: APIRequestContext): Promise<ApiDailyItem[]> {
  const res = await api.get('/api/brewery/daily_items')
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()).data
}

export async function dailyCard(api: APIRequestContext, date: string): Promise<ApiDailyCard> {
  return (await getBoard(api, date, date)).days[0].daily
}

/** Tick (or untick) one Daily check through the API. */
export async function setCheck(api: APIRequestContext, date: string, itemId: number, checked: boolean) {
  const path = `/api/brewery/daily_checks/${date}/${itemId}`
  const res = checked ? await api.put(path) : await api.delete(path)
  expect([200, 204], await res.text()).toContain(res.status())
}

/**
 * Put the Daily items back: the four defaults by their ids, with their names,
 * active, in order; every other active item retired.
 */
export async function restoreDailyItems(defaults: ApiDailyItem[]) {
  const api = await apiAs('breweryMgr')
  for (const item of await dailyItems(api)) {
    const original = defaults.find((d) => d.id === item.id)
    if (!original) {
      const res = await api.patch(`/api/brewery/daily_items/${item.id}`, { data: { active: false } })
      expect(res.status(), await res.text()).toBe(200)
    } else if (item.name !== original.name) {
      const res = await api.patch(`/api/brewery/daily_items/${item.id}`, { data: { name: original.name } })
      expect(res.status(), await res.text()).toBe(200)
    }
  }
  const res = await api.put('/api/brewery/daily_items/order', { data: { ids: defaults.map((d) => d.id) } })
  expect(res.status(), await res.text()).toBe(200)
  expect((await dailyItems(api)).map((i) => i.name)).toEqual(DEFAULT_DAILY_ITEMS)
}
