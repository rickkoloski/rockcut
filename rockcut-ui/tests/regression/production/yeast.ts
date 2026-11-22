import { expect, type Page } from '@playwright/test'
import { addTemplateStep, apiAs, createTemplate, retireAll, stepTypes, tempTag } from './helpers'
import { addDays, batchOf, Made, stepOf, today, type SBatch } from './schedule'

// D64 Stop 3: Yeast harvest steps on [TEST-TEMP] batches, harvested into a
// spec's own [TEST-TEMP] brinks (the seeded YB1–YB4 are only read). Clean-up
// goes backwards, newest entry first, across a brink's records: a pitch, dump
// or adjustment is Removed, a harvest's step is un-checked, and counts go when
// nothing else can; then `Made.cleanup` deletes the batches, and the brinks are
// cleaned and retired (one with history can't be deleted; `setup` takes them). Specs never pitch from a brink and
// count after it on one record (each would lock the other), never pitch
// purchased yeast into a batch they delete (the movement holds the batch),
// and never answer "This brink is empty" (its adjustment can't be removed);
// those are the API's tests and the browser check.

const P = '/api/production'

export interface ApiBrink {
  id: number
  name: string
  empty_weight_lb: string | null
  dirty: boolean
  recount_due: boolean
  clean_due: boolean
  yeast: { on_hand_lb: string; generation: number; coferment: boolean; strains: string[]; product_ids: number[] } | null
}

export interface HistoryEntry {
  id: number
  kind: string
  quantity_lb: string
  device: string | null
  entered_by: { id: number; name: string } | null
  step_id?: number | null
  can_remove?: boolean
}

export class Yeast {
  made = new Made()
  brinks: number[] = []
  templates: number[] = []
  private templateName: string | null = null

  /**
   * `lean` (specs outside the one-worker `production` project): no tank or
   * template of its own, since those lists are shared and a production spec
   * reorders every active row. The batch is the seeded ale, unassigned, and
   * its two Yeast harvest steps are added to it.
   */
  constructor(private opts: { lean?: boolean } = {}) {}

  /** A [TEST-TEMP] template: Brew day, Yeast harvest on day 7, a second (#2) on day 8, Package on day 20. */
  async template(): Promise<string> {
    if (this.templateName) return this.templateName
    const types = Object.fromEntries((await stepTypes()).map((t) => [t.name, t.id]))
    expect(types['Yeast harvest'], 'the Yeast harvest step type').toBeTruthy()
    const t = await createTemplate(tempTag('Harvest ale'))
    this.templates.push(t.id)
    await addTemplateStep(t.id, { step_type_id: types['Yeast harvest'], day_offset: 7 })
    await addTemplateStep(t.id, { step_type_id: types['Yeast harvest'], day_offset: 8, detail: '#2' })
    const full = await addTemplateStep(t.id, { step_type_id: types['Package'], day_offset: 20 })
    expect(full.issues).toEqual([])
    this.templateName = full.name
    return full.name
  }

  /** A [TEST-TEMP] brink (a Brewery manager adds it). */
  async brink(label: string, emptyWeight: string | null = null): Promise<ApiBrink> {
    const mgr = await apiAs('breweryMgr')
    const res = await mgr.post('/api/yeast/brinks', { data: { name: tempTag(label).slice(0, 40), empty_weight_lb: emptyWeight, position: 900 } })
    expect(res.status(), await res.text()).toBe(201)
    const b = (await res.json()).data as ApiBrink
    this.brinks.push(b.id)
    return b
  }

  /** A batch on the template brewed 8 days ago with a number: "Yeast harvest" was due yesterday, "Yeast harvest - #2" today. */
  async brewed(label: string): Promise<SBatch> {
    const brand = await this.made.brand(label)
    if (this.opts.lean) {
      const b = await this.made.plan({ brand_id: brand.id, template: '[SEED] Standard ale', brew_on: addDays(today(), -8), tank_ids: [null] })
      await this.made.checkOff(stepOf(b, 'Brew day'), `8${Math.floor(Math.random() * 1e6)}`)
      const type = (await stepTypes()).find((t) => t.name === 'Yeast harvest')!.id
      const api = await apiAs('brewer1')
      for (const [due_on, detail] of [
        [addDays(today(), -1), null],
        [today(), '#2'],
      ]) {
        const res = await api.post(`${P}/batches/${b.id}/steps`, { data: { step_type_id: type, due_on, detail } })
        expect(res.status(), await res.text()).toBe(201)
      }
      return batchOf(b.id)
    }
    const tank = await this.made.tank('FV')
    const b = await this.made.plan({ brand_id: brand.id, template: await this.template(), brew_on: addDays(today(), -8), tank_ids: [tank.id] })
    await this.made.checkOff(stepOf(b, 'Brew day'), `8${Math.floor(Math.random() * 1e6)}`)
    return batchOf(b.id)
  }

  async cleanup() {
    const brewer = await apiAs('brewer1')
    const mgr = await apiAs('breweryMgr')
    for (const id of this.brinks) {
      for (let i = 0; i < 20; i++) {
        const records = (await (await brewer.get(`/api/yeast/brinks/${id}/history`)).json()).data as {
          status: string
          entries: HistoryEntry[]
          counts: { id: number }[]
        }[]
        const live = records.filter((r) => r.status !== 'voided')
        const last = live.flatMap((r) => r.entries).sort((a, b) => b.id - a.id)[0]
        if (last && ['pitched', 'dumped', 'adjusted'].includes(last.kind)) {
          const res = await mgr.delete(`/api/yeast/entries/${last.id}`)
          if (res.ok()) continue
        }
        if (last?.kind === 'harvested' && last.step_id) {
          const res = await brewer.post(`${P}/steps/${last.step_id}/uncomplete`)
          if (res.ok()) continue
        }
        const count = live.flatMap((r) => r.counts)[0]
        if (count) {
          const res = await mgr.delete(`/api/yeast/counts/${count.id}`)
          if (res.ok()) continue
        }
        break
      }
    }
    await this.made.cleanup()
    for (const id of this.brinks.splice(0)) {
      const b = await brink(id)
      if (!b) continue
      if (b.yeast) await mgr.post(`/api/yeast/brinks/${id}/dump`, { data: { occurred_on: today(), note: 'clean-up' } })
      if ((await brink(id))?.dirty) await mgr.post(`/api/yeast/brinks/${id}/clean`)
      const del = await mgr.delete(`/api/yeast/brinks/${id}`)
      if (del.status() !== 204) await mgr.put(`/api/yeast/brinks/${id}`, { data: { active: false } })
    }
    await retireAll('templates', this.templates.splice(0))
    this.templateName = null
  }
}

export async function brink(id: number): Promise<ApiBrink | undefined> {
  const list = (await (await (await apiAs('brewer1')).get('/api/yeast/brinks?all=true')).json()).data as ApiBrink[]
  return list.find((b) => b.id === id)
}

export async function history(id: number): Promise<{ status: string; entries: HistoryEntry[]; counts: { id: number }[] }[]> {
  return (await (await (await apiAs('brewer1')).get(`/api/yeast/brinks/${id}/history`)).json()).data
}

/** A yeast product of the reference seed by its code ("US-05"). */
export async function yeastProduct(code: string): Promise<{ id: number; name: string }> {
  const api = await apiAs('brewer1')
  const cats = (await (await api.get('/api/ingredient_categories')).json()).data as { id: number; key: string | null }[]
  const yeast = cats.find((c) => c.key === 'yeast')!.id
  const products = (await (await api.get(`/api/ingredient_products?category_id=${yeast}`)).json()).data as { id: number; name: string | null }[]
  const p = products.find((x) => x.name === code)
  expect(p, `the reference yeast ${code}`).toBeTruthy()
  return p as { id: number; name: string }
}

/** A count on the brink (as brewer1). */
export async function addCount(brinkId: number) {
  const res = await (await apiAs('brewer1')).post('/api/yeast/counts', {
    data: { brink_id: brinkId, counted_on: today(), viable_millions_per_ml: '1200', viability_pct: '92' },
  })
  expect(res.status(), await res.text()).toBe(201)
}

/** A pitch from a brink into a batch (as brewer1). */
export async function pitchFrom(brinkId: number, batchId: number, lb: string) {
  const res = await (await apiAs('brewer1')).post(`/api/yeast/brinks/${brinkId}/pitch`, { data: { lb, batch_id: batchId, occurred_on: today() } })
  expect(res.status(), await res.text()).toBe(200)
}

/** The Harvest dialog: pick the brink, the weight, and (when asked) the strain. */
export async function fillHarvest(page: Page, opts: { brinkId?: number; lb?: string; strainId?: number; generation?: string; note?: string }) {
  const d = page.getByTestId('harvest-dialog')
  await expect(d).toBeVisible()
  if (opts.brinkId != null) {
    await d.getByTestId('harvest-brink').click()
    await page.getByTestId(`harvest-brink-option-${opts.brinkId}`).click()
  }
  if (opts.lb != null) await d.getByTestId('harvest-lb').fill(opts.lb)
  if (opts.strainId != null) {
    await d.getByTestId('harvest-strains').click()
    await page.getByTestId(`harvest-strain-option-${opts.strainId}`).click()
    await page.keyboard.press('Escape')
  }
  if (opts.generation != null) await d.getByTestId('harvest-generation').fill(opts.generation)
  if (opts.note != null) await d.getByTestId('harvest-note').fill(opts.note)
  return d
}

export { P }
