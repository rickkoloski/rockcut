import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { apiAs, tempTag } from '../scheduler/helpers'
import type { PersonaKey } from '../../config/test-env'

// D53 Part 2: Idea Board spec helpers. Every spec works in its own
// `[TEST-TEMP]` lists (and labels), removed after it; the four starter lists
// are shared and only read.

export { apiAs, tempTag }

export interface ApiList {
  id: number
  name: string
  locked: boolean
  cards: ApiCard[] | null
}
export interface ApiCard {
  id: number
  list_id: number
  title: string
  locked: boolean
  watching: boolean
  sent_tasks: { state: string; task_id: number | null; department: { key: string } | null }[]
}

const made: { lists: [string, number][]; labels: [string, number][]; tasks: [string, number][] } = { lists: [], labels: [], tasks: [] }

async function json<T>(res: Awaited<ReturnType<APIRequestContext['get']>>, status = [200, 201]): Promise<T> {
  expect(status, await res.text()).toContain(res.status())
  return ((await res.json()) as { data: T }).data
}

export async function board(api: APIRequestContext, key: string) {
  return json<{ lists: ApiList[]; labels: { id: number; name: string }[] }>(await api.get(`/api/idea_boards/${key}/lists`))
}

/** A `[TEST-TEMP]` list, removed in `cleanupIdeas`. */
export async function tempList(persona: PersonaKey, key: string, label: string) {
  const api = await apiAs(persona)
  const list = await json<ApiList>(await api.post(`/api/idea_boards/${key}/lists`, { data: { name: tempTag(label).slice(0, 80) } }))
  made.lists.push([key, list.id])
  return list
}

export async function tempCard(persona: PersonaKey, key: string, listId: number, label: string, extra: Record<string, unknown> = {}) {
  const api = await apiAs(persona)
  return json<ApiCard>(await api.post(`/api/idea_boards/${key}/cards`, { data: { list_id: listId, title: tempTag(label), ...extra } }))
}

/** A list made through the UI, for `cleanupIdeas`. */
export function rememberList(key: string, id: number) {
  made.lists.push([key, id])
}

export function rememberTask(key: string, id: number) {
  made.tasks.push([key, id])
}

export function rememberLabel(key: string, id: number) {
  made.labels.push([key, id])
}

/** Delete what the spec made (lists for good, with their cards), as the owner. */
export async function cleanupIdeas() {
  const owner = await apiAs('owner')
  for (const [key, id] of made.tasks.splice(0)) await owner.delete(`/api/boards/${key}/tasks/${id}`)
  for (const [key, id] of made.lists.splice(0)) {
    await owner.post(`/api/idea_boards/${key}/lists/${id}/archive`)
    const res = await owner.delete(`/api/idea_boards/${key}/lists/${id}`)
    expect([204, 404]).toContain(res.status())
  }
  for (const [key, id] of made.labels.splice(0)) await owner.delete(`/api/idea_boards/${key}/labels/${id}`)
}

/**
 * The answer to the next Board write (`method` on a path matching `path`),
 * checked OK. Start it before the click and await it before a reload: a
 * reload cancels a write still on its way (S261 on DEV, lead decisions 6).
 */
export function written(page: Page, method: string, path: RegExp) {
  return page
    .waitForResponse((r) => r.request().method() === method && path.test(new URL(r.url()).pathname))
    .then((r) => {
      expect(r.ok(), `${method} ${r.url()} answered ${r.status()}`).toBe(true)
      return r
    })
}

/** Open a board (or a card on it) and wait for its lists. */
export async function openIdeas(page: Page, path: string) {
  await page.goto(path)
  await expect(page.getByTestId('idea-board')).toBeVisible({ timeout: 20_000 })
}

export const listColumn = (page: Page, id: number) => page.getByTestId(`idea-list-${id}`)
export const cardFace = (page: Page, id: number) => page.getByTestId(`idea-card-${id}`)

/**
 * D53 S239: a long press on `source` (a card) lifts it; the finger slides
 * onto `target` (another list's tab, a drop zone) and lets go there.
 */
export async function touchDropOn(page: Page, source: import('@playwright/test').Locator, target: import('@playwright/test').Locator) {
  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: [number, number][]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y]) => ({ x, y })) })
  await source.scrollIntoViewIfNeeded()
  const s = (await source.boundingBox())!
  let [x, y] = [s.x + Math.min(30, s.width / 2), s.y + s.height / 2]
  await touch('touchStart', [[x, y]])
  // The long press (250 ms) lifts it.
  await expect(page.locator('[aria-roledescription="sortable"][aria-pressed="true"]')).toHaveCount(1, { timeout: 5_000 })
  const t = (await target.boundingBox())!
  const [tx, ty] = [t.x + t.width / 2, t.y + t.height / 2]
  for (let i = 1; i <= 12; i++) await touch('touchMove', [[x + ((tx - x) * i) / 12, y + ((ty - y) * i) / 12]])
  ;[x, y] = [tx, ty]
  await touch('touchMove', [[x + 1, y]])
  await touch('touchEnd', [])
}

/** The card's place: its list id, from the API. */
export async function cardListId(persona: PersonaKey, key: string, cardId: number) {
  const b = await board(await apiAs(persona), key)
  return b.lists.find((l) => l.cards?.some((c) => c.id === cardId))?.id ?? null
}
