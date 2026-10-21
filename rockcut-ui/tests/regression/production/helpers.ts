import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { addDays, apiAs, denverToday, tempTag } from '../scheduler/helpers'

// Shared helpers for the D46 production setup specs. Every row a spec makes
// has a unique `[TEST-TEMP]` name; specs retire what they made (names stay
// taken until a reseed's cleanup, which is why each name is unique).

export { addDays, apiAs, denverToday, tempTag }

/** A unique `[TEST-TEMP]` name within 30 characters (tanks, phases, step types). */
export function shortTag(label: string): string {
  const id = (Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 4)).slice(0, 6)
  return `[TEST-TEMP] ${label.slice(0, 10)} ${id}`
}

/** Open a nav entry under the Brewery heading (the section opens on a Brewery page). */
export async function openBreweryNav(page: Page, label: string) {
  await page.goto('/brewery')
  await page.locator('.MuiDrawer-paper:visible').getByText(label, { exact: true }).click()
}

export interface ApiTank {
  id: number
  name: string
  retired_at: string | null
  outages: { id: number; starts_on: string; ends_on: string | null; state: string; reason: string | null }[]
}

export interface ApiTemplate {
  id: number
  name: string
  issues: { code: string; message: string }[]
  steps: { id: number; name: string; day_offset: number; vessel_index: number; notes: string | null; phase_id: number | null; on_task_list: boolean }[]
  links: { id: number; from_step_id: number; to_step_id: number; default_answer: string }[]
}

const P = '/api/production'

async function ok<T>(res: Awaited<ReturnType<APIRequestContext['get']>>, status = 200): Promise<T> {
  expect(res.status(), await res.text()).toBe(status)
  return ((await res.json()) as { data: T }).data
}

export async function tanks(api?: APIRequestContext): Promise<ApiTank[]> {
  return ok(await (api ?? (await apiAs('brewer1'))).get(`${P}/tanks`))
}

export const activeTankIds = async () => (await tanks()).filter((t) => !t.retired_at).map((t) => t.id)

export async function createTank(name: string, capacity = 20): Promise<ApiTank> {
  return ok(await (await apiAs('brewer1')).post(`${P}/tanks`, { data: { name, capacity_bbl: capacity } }), 201)
}

export async function addOutage(tankId: number, starts_on: string, ends_on: string | null, reason?: string) {
  return ok<{ id: number }>(await (await apiAs('brewer1')).post(`${P}/tanks/${tankId}/outages`, { data: { starts_on, ends_on, reason } }), 201)
}

/** Retire tanks a spec made (and put the active order back if given). */
export async function retireTanks(ids: number[], order?: number[]) {
  const api = await apiAs('brewer1')
  for (const id of ids) await api.delete(`${P}/tanks/${id}`)
  if (order) {
    const active = await activeTankIds()
    const kept = order.filter((id) => active.includes(id))
    await api.post(`${P}/tanks/reorder`, { data: { ids: [...kept, ...active.filter((id) => !kept.includes(id))] } })
  }
}

export async function stepTypes(): Promise<{ id: number; name: string; built_in: boolean; retired_at: string | null }[]> {
  return ok(await (await apiAs('brewer1')).get(`${P}/step_types`))
}

export async function phases(): Promise<{ id: number; name: string; color: string; retired_at: string | null }[]> {
  return ok(await (await apiAs('brewer1')).get(`${P}/phases`))
}

export async function template(id: number): Promise<ApiTemplate> {
  return ok(await (await apiAs('brewer1')).get(`${P}/templates/${id}`))
}

export async function templates(): Promise<{ id: number; name: string; retired_at: string | null }[]> {
  return ok(await (await apiAs('brewer1')).get(`${P}/templates`))
}

export async function createTemplate(name: string): Promise<ApiTemplate> {
  return ok(await (await apiAs('brewer1')).post(`${P}/templates`, { data: { name } }), 201)
}

export async function addTemplateStep(id: number, attrs: Record<string, unknown>): Promise<ApiTemplate> {
  return ok(await (await apiAs('brewer1')).post(`${P}/templates/${id}/steps`, { data: attrs }), 201)
}

/** Retire whatever these specs made, by kind. */
export async function retireAll(kind: 'templates' | 'step_types' | 'phases', ids: number[]) {
  const api = await apiAs('brewer1')
  for (const id of ids) await api.delete(`${P}/${kind}/${id}`)
}

/** The id at the end of a `data-testid` such as `tank-name-12`. */
export async function idOf(page: Page, selector: string): Promise<number> {
  const testId = await page.locator(selector).first().getAttribute('data-testid')
  return Number(testId!.split('-').pop())
}

/** Pick an option from an MUI select by its test id and the option's test id. */
export async function pick(page: Page, selectTestId: string, optionTestId: string) {
  await page.getByTestId(selectTestId).click()
  await page.getByTestId(optionTestId).click()
}
