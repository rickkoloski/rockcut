// D47: words the Gantt's dialogs share (plain functions, no components).

import { dayLabel, daysBetween, firstBrew } from '../../../lib/gantt'
import type { SchedBatch, SchedStep, Tank } from '../../../lib/production'

export function stepStatus(step: SchedStep, today: string): string {
  if (step.done_on) return `Done ${dayLabel(step.done_on)}${step.done_by ? ` by ${step.done_by.name}` : ''}`
  if (step.due_on === today) return 'Due today'
  if (step.due_on < today) return `Late (planned ${dayLabel(step.due_on)})`
  return 'Planned'
}

/** "day 12": days after the end of the first brew day. */
export function dayN(step: SchedStep, batch: SchedBatch | null): string | null {
  const brew = batch && firstBrew(batch.steps)
  return brew ? `day ${daysBetween(brew.done_on ?? brew.due_on, step.due_on)}` : null
}

/** The out-of-service periods of `tank` that touch `from`…`to` (or are going on, without dates). */
export function outagesIn(tank: Tank, from?: string, to?: string) {
  return tank.outages.filter((o) => o.state !== 'past' && (!from || !to || (o.starts_on <= to && (!o.ends_on || o.ends_on >= from))))
}

export interface Renumber {
  batch_id: number
  brand: string
  from: string
  to: string
}

/** "Batch numbers updated: Enos P2 → P1." */
export const renumberText = (r: Renumber[]) =>
  r.length ? `Batch numbers updated: ${r.map((x) => `${x.brand} ${x.from} → ${x.to}`).join(', ')}.` : ''
