import { expect, type Page } from '@playwright/test'
import { apiAs } from '../scheduler/helpers'
import { retireAll, shortTag, succeeds, tempTag } from './helpers'
import { schedule, templateId, type SBatch, type SStep } from './schedule'

// D56 helpers: [TEST-TEMP] templates copied from the seed's (with a pre-brew
// step or a retest), step types, and the test-result fields the schedule has.

const P = '/api/production'

/** A schedule step with D56's fields. */
export type RStep = SStep & { has_result: boolean; result: 'pass' | 'fail' | null; retest_days: number | null; retest_of_id: number | null }

export const rsteps = (b: SBatch) => b.steps as RStep[]
export const rstep = async (id: number) => (await schedule()).batches.flatMap(rsteps).find((s) => s.id === id)

/** What a D56 spec made in the setup; `cleanup()` retires it (afterAll). */
export class Setup {
  templates: number[] = []
  stepTypes: number[] = []

  /** A `[TEST-TEMP]` copy of a seed template. */
  async copy(seed: string, label: string): Promise<{ id: number; name: string }> {
    const api = await apiAs('breweryMgr')
    const res = await api.post(`${P}/templates/${await templateId(seed)}/duplicate`)
    expect(res.status(), await res.text()).toBe(201)
    const id = (await res.json()).data.id as number
    this.templates.push(id)
    const name = tempTag(label)
    const renamed = await api.patch(`${P}/templates/${id}`, { data: { name } })
    expect(renamed.status(), await renamed.text()).toBe(200)
    return { id, name }
  }

  /** A `[TEST-TEMP]` plain step type. */
  async stepType(label: string, attrs: Record<string, unknown> = {}): Promise<{ id: number; name: string }> {
    const name = shortTag(label)
    const res = await (await apiAs('breweryMgr')).post(`${P}/step_types`, { data: { name, ...attrs } })
    expect(res.status(), await res.text()).toBe(201)
    const id = (await res.json()).data.id as number
    this.stepTypes.push(id)
    return { id, name }
  }

  /** Add a step to one of this spec's templates. */
  async addStep(templateId: number, attrs: Record<string, unknown>) {
    const res = await (await apiAs('breweryMgr')).post(`${P}/templates/${templateId}/steps`, { data: attrs })
    expect(res.status(), await res.text()).toBe(201)
  }

  async cleanup() {
    await retireAll('templates', this.templates.splice(0))
    await retireAll('step_types', this.stepTypes.splice(0))
  }
}

/** D56 decisions 18, 19: a persona's Gantt view on the account back to nothing expanded, no Label by, no mix. */
export async function resetGanttView(persona: Parameters<typeof apiAs>[0] = 'brewer1') {
  const res = await (await apiAs(persona)).put('/api/me/board_settings/production', { data: { expanded: [], label_by: {}, mix: [] } })
  expect(res.status(), await res.text()).toBe(200)
}

/** Check a step off through the API with a result (and an answer to the move prompt). */
export async function checkOffResult(step: SStep, body: Record<string, unknown>, persona: Parameters<typeof apiAs>[0] = 'brewer1') {
  const res = await (await apiAs(persona)).post(`${P}/steps/${step.id}/complete`, { data: { done_on: step.due_on, answer: 'move_all', ...body } })
  expect(res.status(), await res.text()).toBe(200)
  return res
}

/** Mark a step not done (cleanup of results: retests first). */
export async function uncheck(id: number) {
  await succeeds((await apiAs('brewer1')).post(`${P}/steps/${id}/uncomplete`), `un-check step ${id}`)
}

/** Un-check every done test and retest of these batches, latest retest first. */
export async function uncheckResults(batchIds: number[]) {
  const sched = await schedule()
  const done = sched.batches
    .filter((b) => batchIds.includes(b.id))
    .flatMap(rsteps)
    .filter((s) => s.has_result && s.done_on)
    .sort((a, b) => (b.retest_of_id ? 1 : 0) - (a.retest_of_id ? 1 : 0) || b.due_on.localeCompare(a.due_on) || b.id - a.id)
  for (const s of done) await uncheck(s.id)
}

/** The result prompt: Pass or Fail, then (for a Fail) Retest in `days` or Continue, and Check off. */
export async function answerResult(page: Page, o: { result: 'pass' } | { result: 'fail'; retest?: number; continue?: true }) {
  const prompt = page.getByTestId('result-prompt')
  await expect(prompt).toBeVisible()
  await page.getByTestId(`result-${o.result}`).check()
  if (o.result === 'fail') {
    if (o.continue) await page.getByTestId('result-continue').check()
    else {
      await page.getByTestId('result-retest').check()
      if (o.retest != null) await page.getByTestId('result-retest-days').fill(String(o.retest))
    }
  }
  await page.getByTestId('result-apply').click()
}
