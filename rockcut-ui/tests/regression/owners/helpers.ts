import { expect, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { authFile, type PersonaKey } from '../../config/test-env'
import { addDays, apiAs, denverToday, tempTag, userId } from '../brewery/taskBoardHelpers'

// D59: shared helpers for the Owners department specs (spec §5, O1–O13). They
// run in the one-worker `owners` project: O2 puts office1 in Owners for a
// while, which O10 and the negative specs must not see, and the Owners boards
// are shared by every file here.

export { addDays, apiAs, denverToday, tempTag, userId }

export const OWNERS = 'owners'

const made: { tasks: number[] } = { tasks: [] }

/** A `[TEST-TEMP]` task on the Owners board, as `persona`; deleted in `cleanupOwners`. */
export async function ownersTask(persona: PersonaKey, label: string, attrs: Record<string, unknown> = {}) {
  const api = await apiAs(persona)
  const res = await api.post(`/api/boards/${OWNERS}/tasks`, { data: { title: tempTag(label), due_on: denverToday(), ...attrs } })
  expect(res.status(), await res.text()).toBe(201)
  const task = (await res.json()).data as { id: number; title: string; assignees: { id: number }[] }
  made.tasks.push(task.id)
  return task
}

/** A task made through the UI, for `cleanupOwners`. */
export function rememberOwnersTask(id: number) {
  made.tasks.push(id)
}

/** Delete the Owners tasks this spec made, by id, as the owner. */
export async function cleanupOwners() {
  const owner = await apiAs('owner')
  for (const id of made.tasks.splice(0)) {
    const res = await owner.delete(`/api/boards/${OWNERS}/tasks/${id}`, { params: { scope: 'following', changed: 'remove' } })
    expect([204, 404, 410]).toContain(res.status())
  }
}

export interface OwnersCard {
  id: number
  title: string
  due_on: string | null
  done: boolean
  assignees: { id: number; name: string }[]
}

/** Every card on the Owners board from today for `days` days (Unfinished and Future too). */
export async function ownersCards(persona: PersonaKey, days = 7): Promise<{ cards: (OwnersCard & { on: string })[]; headers: unknown[] }> {
  const res = await (await apiAs(persona)).get(`/api/boards/${OWNERS}/tasks`, { params: { from: denverToday(), to: addDays(denverToday(), days - 1) } })
  expect(res.status(), await res.text()).toBe(200)
  const board = (await res.json()).data as {
    days: { date: string; header: unknown; cards: OwnersCard[] }[]
    unfinished: OwnersCard[]
    future: OwnersCard[]
  }
  return {
    cards: [
      ...board.days.flatMap((d) => d.cards.map((c) => ({ ...c, on: d.date }))),
      ...board.unfinished.map((c) => ({ ...c, on: 'unfinished' })),
      ...board.future.map((c) => ({ ...c, on: 'future' })),
    ],
    headers: board.days.map((d) => d.header),
  }
}

/** The department's id, from `/api/departments`. */
export async function deptId(api: APIRequestContext, key: string): Promise<number> {
  const depts = (await (await api.get('/api/departments')).json()).data as { id: number; key: string }[]
  return depts.find((d) => d.key === key)!.id
}

/** A person's memberships as `{ department, role }`, read by the owner. */
export async function membershipsOf(persona: PersonaKey) {
  const owner = await apiAs('owner')
  const id = await userId(await apiAs(persona))
  const users = (await (await owner.get('/api/users')).json()).data as { id: number; memberships: { department_key: string; role: string }[] }[]
  return users
    .find((u) => u.id === id)!
    .memberships.map((m) => ({ department: m.department_key, role: m.role }))
    .sort((a, b) => a.department.localeCompare(b.department))
}

/** The board switcher's entries (task boards or Idea Boards), in order; the menu is left closed. */
export async function switcherEntries(page: Page) {
  await page.getByTestId('board-switcher').click()
  const items = page.getByTestId('board-switcher-menu').getByRole('menuitem')
  await expect(items.first()).toBeVisible()
  const names = (await items.allInnerTexts()).map((n) => n.trim())
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('board-switcher-menu')).toBeHidden()
  return names
}

export async function openTaskBoard(page: Page, path: string) {
  await page.goto(path)
  await expect(page.getByTestId('board-grid')).toBeVisible({ timeout: 20_000 })
}

/** The permanent sidebar (the Home page repeats some labels as cards). */
export const nav = (page: Page) => page.locator('.MuiDrawer-docked')

/**
 * The Messages channel names in the sidebar, in order, with the Messages
 * section open. Messages is the sidebar's last section, so they're the buttons
 * after its heading (each also shows its unread count; the name is the last line).
 */
export async function channelNames(page: Page): Promise<string[]> {
  await page.goto('/messages/all')
  await expect(page.getByRole('heading', { name: 'All-staff' })).toBeVisible({ timeout: 20_000 })
  const buttons = nav(page).getByRole('button')
  await expect(nav(page).getByRole('button', { name: /All-staff$/ })).toBeVisible()
  const texts = (await buttons.allInnerTexts()).map((t) => t.trim().split('\n').at(-1)!.trim())
  return texts.slice(texts.indexOf('Messages') + 1)
}

/** A page signed in as another persona, beside the spec's own (closed by the caller). */
export async function pageAs(browser: Browser, persona: PersonaKey) {
  const context = await browser.newContext({ storageState: authFile(persona) })
  return { context, page: await context.newPage() }
}

/** HTTP status of one API call as `persona`. */
export async function status(persona: PersonaKey, method: string, path: string, data?: unknown) {
  const api = await apiAs(persona)
  return (await api.fetch(path, { method, data })).status()
}
