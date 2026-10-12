import { expect, type APIRequestContext, type Page } from '@playwright/test'
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
  days: { date: string; cards: ApiCard[]; header: unknown }[]
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

/** The persona's user id, from /api/me. */
export async function userId(api: APIRequestContext): Promise<number> {
  return (await (await api.get('/api/me')).json()).user.id
}
