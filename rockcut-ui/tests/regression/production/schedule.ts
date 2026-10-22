import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { addDays, apiAs, denverToday, tempTag } from '../scheduler/helpers'
import { createTank, retireTanks, shortTag, succeeds, templates } from './helpers'

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
  split_parent_id: number | null
  part_number: number | null
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

  /**
   * Split parents are un-split first (a part's finished steps and the Split
   * are un-checked; D48 M2 refuses to delete a split parent), and every
   * request has to succeed, so a leak fails the spec instead of the next one.
   */
  async cleanup() {
    const api = await apiAs('brewer1')
    const sched = await schedule()
    // Batches the spec planned, and any it planned through the page under its brands (parts go with their parent).
    const ids = new Set(this.batches.splice(0))
    for (const b of sched.batches) if (this.brands.includes(b.brand_id) && !b.split_parent_id) ids.add(b.id)
    for (const id of ids) {
      const b = sched.batches.find((x) => x.id === id)
      if (!b) continue
      const parts = sched.batches.filter((x) => x.split_parent_id === id)
      if (parts.length) {
        const done = parts.flatMap((p) => p.steps).filter((s) => s.done_on)
        done.sort((x, y) => y.done_on!.localeCompare(x.done_on!))
        for (const s of done) await succeeds(api.post(`${P}/steps/${s.id}/uncomplete`), `un-check step ${s.id} of a part of batch ${id}`)
        const split = b.steps.find((s) => s.behavior === 'split' && s.done_on)
        if (split) await succeeds(api.post(`${P}/steps/${split.id}/uncomplete`), `un-check the Split of batch ${id}`)
        await succeeds(api.delete(`${P}/batches/${id}/split`), `undo the split of batch ${id}`)
      }
      if (b.status !== 'planned') {
        const brew = b.steps.find((s) => s.first_brew && s.done_on)
        if (brew) await succeeds(api.post(`${P}/steps/${brew.id}/uncomplete`), `un-check brew day of batch ${id}`)
      }
      await succeeds(api.delete(`${P}/batches/${id}`), `delete batch ${id}`)
    }
    // Standalone CIPs: the spec's own, and any it added through the page on its tanks. A 404 is one the spec already deleted.
    const cips = new Set([...this.cips.splice(0), ...sched.cips.filter((c) => c.tank_id && this.tanks.includes(c.tank_id)).map((c) => c.id)])
    for (const id of cips) await succeeds(api.delete(`${P}/cips/${id}`), `delete CIP ${id}`, [404])
    await retireTanks(this.tanks.splice(0))
    for (const id of this.brands.splice(0)) await succeeds(api.delete(`/api/brands/${id}`), `delete brand ${id}`)
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

/**
 * Press `el` (at `x` px into it) and move to the middle of the row
 * `gantt-lane-…` named by `laneId`. When it's off the grid, the pointer waits
 * in the grid's edge zone and the grid scrolls itself (D48 auto-scroll). The
 * button stays down: the caller checks the hint or drop row, then releases.
 * `tick` runs while it waits: with `page.clock` installed, the scrolling
 * frames only come when the clock moves.
 */
export async function dragToLane(page: Page, el: Locator, laneId: string, x = 20, tick?: () => Promise<void>) {
  await el.scrollIntoViewIfNeeded()
  const box = (await el.boundingBox())!
  const [px, py] = [box.x + x, box.y + box.height / 2]
  await page.mouse.move(px, py)
  await page.mouse.down()
  await page.mouse.move(px, py + 6, { steps: 3 })
  await followToLane(page, px, laneId, py, tick)
}

/** During a drag: move to the middle of the row `laneId`, waiting in the edge zone while the grid scrolls to it. */
export async function followToLane(page: Page, px: number, laneId: string, startY?: number, tick?: () => Promise<void>) {
  const grid = (await gantt(page).boundingBox())!
  const from = startY ?? grid.y + grid.height / 2
  const [top, bottom] = [grid.y + 47 + 45, grid.y + grid.height - 45]
  for (let i = 0; i < 200; i++) {
    const lane = (await page.getByTestId(laneId).boundingBox())!
    const mid = lane.y + Math.min(lane.height, 54) / 2
    if (mid > top && mid < bottom) {
      await page.mouse.move(px, mid, { steps: 6 })
      return
    }
    // The last (or first) row can't leave the edge zone: once the grid
    // can't scroll further that way, aim at the part of the row in view.
    const scroll = await gantt(page).evaluate((e) => ({ at: e.scrollTop, max: e.scrollHeight - e.clientHeight, view: e.clientHeight }))
    if ((mid >= bottom && scroll.at >= scroll.max - 1) || (mid <= top && scroll.at <= 0)) {
      const [lo, hi] = [Math.max(lane.y, grid.y + 48), Math.min(lane.y + lane.height, grid.y + scroll.view - 2)]
      if (hi - lo < 8) throw new Error(`${laneId} is out of the grid's reach`)
      await page.mouse.move(px, (lo + hi) / 2, { steps: 6 })
      return
    }
    // In the edge zone, and far enough from the press to count as heading there.
    const y = mid >= bottom ? Math.max(grid.y + grid.height - 8, from + 20) : Math.min(grid.y + 47 + 8, from - 20)
    await page.mouse.move(px, y, { steps: 3 })
    if (tick) await tick()
    else await page.waitForTimeout(40)
  }
  throw new Error(`${laneId} never scrolled into the grid`)
}

/** The last message shown (the Undo snackbar). */
export const snack = (page: Page) => page.getByTestId('gantt-snack-text').last()

export async function undo(page: Page) {
  await page.getByTestId('gantt-undo').click()
  await expect(snack(page)).toHaveText('Undone.')
}
