import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { addDays, apiAs, denverToday, tempTag } from '../scheduler/helpers'
import { createTank, retireTanks, shortTag, templates } from './helpers'

// D47 helpers: the schedule through the API, and the Gantt in the page.
// Every spec makes its own [TEST-TEMP] brand, tanks and batches and removes
// them afterwards (`Made.cleanup`); a reseed's cleanup catches leftovers.

const P = '/api/production'

export interface SStep {
  id: number
  batch_id: number | null
  tank_id: number | null
  name: string
  type_name: string | null
  behavior: string | null
  marker: boolean
  first_brew: boolean
  vessel_index: number
  due_on: string
  done_on: string | null
  notes: string | null
  assignee_id: number | null
  temperature: number | null
  detail: string | null
  package_partial: boolean
  added: boolean
  ramp_group: string | null
}

export interface SBatch {
  id: number
  brand_id: number
  label: string
  p_number: string | null
  batch_number: string | null
  status: string
  vessels: { vessel_index: number; tank_id: number | null }[]
  steps: SStep[]
  links: { id: number; from_step_id: number; to_step_id: number; default_answer: string }[]
}

export interface SFlag {
  key: string
  kind: string
  message: string
  signature: string
  batch_ids: number[]
  tank_id: number | null
  signed_off: boolean
  was_signed_off: boolean
}

export interface Sched {
  today: string
  batches: SBatch[]
  cips: SStep[]
  statuses: { tank_id: number; line: string; alert: boolean; state: string; batch_label: string | null }[]
  flags: SFlag[]
  tanks: { id: number; name: string }[]
  next_batch_number: string
}

export const today = () => denverToday()
export { addDays }

async function ok<T>(res: Awaited<ReturnType<APIRequestContext['get']>>, status = 200): Promise<T> {
  expect(res.status(), await res.text()).toBe(status)
  return (await res.json()) as T
}

/** The schedule from 300 days back to 400 ahead (every batch a spec makes). */
export async function schedule(api?: APIRequestContext): Promise<Sched> {
  const t = today()
  const body = await ok<{ data: Sched }>(await (api ?? (await apiAs('brewer1'))).get(`${P}/schedule?from=${addDays(t, -300)}&to=${addDays(t, 400)}`))
  return body.data
}

export const batchOf = async (id: number) => (await schedule()).batches.find((b) => b.id === id)!
export const stepOf = (b: SBatch, name: string) => b.steps.find((s) => s.name === name)!

/** The P-numbers now, by batch id. */
export async function pNumbers(): Promise<Map<number, string>> {
  return new Map((await schedule()).batches.filter((b) => b.p_number).map((b) => [b.id, b.p_number!]))
}

export async function templateId(name: string): Promise<number> {
  return (await templates()).find((t) => t.name === name)!.id
}

/** What a spec made; `cleanup()` in afterAll removes it (brewed batches are un-checked first). */
export class Made {
  brands: number[] = []
  tanks: number[] = []
  batches: number[] = []
  cips: number[] = []

  async brand(label: string): Promise<{ id: number; name: string }> {
    const name = tempTag(label)
    const b = (await ok<{ data: { id: number; name: string } }>(await (await apiAs('brewer1')).post('/api/brands', { data: { name } }), 201)).data
    this.brands.push(b.id)
    return b
  }

  async tank(label: string, capacity = 20) {
    const t = await createTank(shortTag(label), capacity)
    this.tanks.push(t.id)
    return t
  }

  async plan(attrs: { brand_id: number; template: string; brew_on: string; volume?: number; tank_ids?: (number | null)[]; two_days?: boolean }): Promise<SBatch> {
    const body = await ok<{ data: { batches: SBatch[] } }>(
      await (await apiAs('brewer1')).post(`${P}/batches`, {
        data: {
          brand_id: attrs.brand_id,
          template_id: await templateId(attrs.template),
          brew_on: attrs.brew_on,
          volume_bbl: attrs.volume ?? 20,
          brew_two_days: attrs.two_days ?? false,
          tank_ids: attrs.tank_ids ?? [],
        },
      }),
      201,
    )
    const b = body.data.batches[0]
    this.batches.push(b.id)
    return b
  }

  /** Check a step off through the API on its own day (a first Brew day takes `number`). */
  async checkOff(step: SStep, number?: string) {
    return ok(await (await apiAs('brewer1')).post(`${P}/steps/${step.id}/complete`, { data: { done_on: step.due_on, batch_number: number, answer: 'move_only' } }))
  }

  async cleanup() {
    const api = await apiAs('brewer1')
    const sched = await schedule()
    for (const id of this.batches.splice(0)) {
      const b = sched.batches.find((x) => x.id === id)
      if (b && b.status !== 'planned') {
        const brew = b.steps.find((s) => s.first_brew && s.done_on)
        if (brew) await api.post(`${P}/steps/${brew.id}/uncomplete`)
      }
      await api.delete(`${P}/batches/${id}`)
    }
    for (const id of this.cips.splice(0)) await api.delete(`${P}/cips/${id}`)
    // Standalone CIPs a spec added through the page, on its tanks.
    for (const c of sched.cips.filter((c) => c.tank_id && this.tanks.includes(c.tank_id))) await api.delete(`${P}/cips/${c.id}`)
    await retireTanks(this.tanks.splice(0))
    for (const id of this.brands.splice(0)) await api.delete(`/api/brands/${id}`)
  }
}

// ── The Gantt in the page ──

export const gantt = (page: Page) => page.getByTestId('gantt')

export async function openGantt(page: Page) {
  await page.goto('/brewery/production')
  await expect(page.getByTestId('gantt-inner')).toBeVisible()
}

/** Toolbar → Add process ▾ → Plan batch… or CIP & Sanitize… (D48 §3.6). */
export async function addProcess(page: Page, which: 'plan' | 'cip') {
  await page.getByTestId('gantt-add-process').click()
  await page.getByTestId(which === 'plan' ? 'gantt-plan' : 'gantt-add-cip').click()
}

/** Pixels per day in the page now. */
export async function dayPx(page: Page): Promise<number> {
  const from = await page.getByTestId('gantt-from').inputValue()
  const to = await page.getByTestId('gantt-to').inputValue()
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1
  return (await page.getByTestId('gantt-dates').boundingBox())!.width / days
}

/** Drag `el` by whole days (and `dy` pixels) with the mouse, in small steps. */
export async function dragBy(page: Page, el: Locator, days: number, dy = 0, at?: { x?: number }) {
  await el.scrollIntoViewIfNeeded()
  const box = (await el.boundingBox())!
  const px = await dayPx(page)
  const x = box.x + (at?.x ?? box.width / 2)
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + Math.sign(days || 1) * 6, y + Math.sign(dy) * 6, { steps: 3 })
  await page.mouse.move(x + days * px, y + dy, { steps: 12 })
  await page.waitForTimeout(100)
  await page.mouse.up()
}

/** The last message shown (the Undo snackbar). */
export const snack = (page: Page) => page.getByTestId('gantt-snack-text').last()

export async function undo(page: Page) {
  await page.getByTestId('gantt-undo').click()
  await expect(snack(page)).toHaveText('Undone.')
}
