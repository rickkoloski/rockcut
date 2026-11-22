// D64 §5.2 (Stop 3): the Harvest dialog that opens when a Yeast harvest step
// is checked off (the Gantt, its linked Brewery task and the brewhouse
// device): what it starts with, what it sends, and the two questions.
import { brinkStateText, lbText, readLb, shortDate } from './yeast'
import type { YeastBrink } from './types'

/** The check-off preview's `yeast` (`needs_yeast`): the device gets the brinks here, not from the yeast routes. */
export interface HarvestPreview {
  brinks: YeastBrink[]
  /** The brink this batch's earlier pull went into, while it's still there (decision 16). */
  default_brink_id: number | null
  /** From what was pitched into the batch (§5.3); null when nothing was recorded (A5: asked). */
  defaults: { product_ids: number[]; generation: number; coferment: boolean } | null
  products: { id: number; code: string; label: string | null }[]
}

export type HarvestOutcome = 'harvested' | 'dumped'

export interface HarvestForm {
  outcome: HarvestOutcome
  brinkId: number | ''
  lb: string
  productIds: number[]
  generation: string
  note: string
}

/** The dialog's start: Harvest yeast, the default brink, and the strains and generation from the pitches (gen 1 when asked). */
export function initialHarvest(pre: HarvestPreview): HarvestForm {
  return {
    outcome: 'harvested',
    brinkId: pre.default_brink_id ?? '',
    lb: '',
    productIds: pre.defaults?.product_ids ?? [],
    generation: String(pre.defaults?.generation ?? 1),
    note: '',
  }
}

/** The picker's line: "YB1 · empty", "YB2 · 42 lb US-05 gen 2", "YB3 · dirty" (with yeast: "… · dirty"). */
export function brinkOption(b: Pick<YeastBrink, 'name' | 'dirty' | 'dirty_since' | 'yeast'>): string {
  if (!b.yeast) return b.dirty ? `${b.name} · dirty` : `${b.name} · empty`
  return `${brinkStateText(b)}${b.dirty ? ' · dirty' : ''}`
}

/** A generation a person typed: a whole number 1–999, or null. */
export function readGeneration(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null
  const n = Number(text)
  return n >= 1 && n <= 999 ? n : null
}

/** The first thing wrong with the form, in the order it reads; null when it can be sent. */
export function harvestError(f: HarvestForm): string | null {
  if (f.outcome === 'dumped') return null
  if (f.brinkId === '') return 'Pick the brink'
  const lb = readLb(f.lb)
  if (!lb.lb) return lb.error ?? 'Enter the yeast weight in lb'
  if (f.productIds.length === 0) return 'Pick the strain'
  if (readGeneration(f.generation) == null) return 'The generation is a whole number, 1 or more'
  return null
}

/** The check-off's flat `yeast_*` fields for the form (CLAUDE.md: flat params). */
export function harvestBody(f: HarvestForm): Record<string, unknown> {
  const note = f.note.trim() || null
  if (f.outcome === 'dumped') return { yeast_outcome: 'dumped', yeast_note: note }
  return {
    yeast_outcome: 'harvested',
    yeast_brink_id: f.brinkId,
    yeast_lb: readLb(f.lb).lb,
    yeast_product_ids: f.productIds,
    yeast_generation: readGeneration(f.generation),
    yeast_note: note,
  }
}

/** A 409 `yeast_question`: which one, and the answer each button sends. */
export type HarvestQuestion =
  | { kind: 'dirty'; message: string }
  | { kind: 'has_yeast'; message: string }

export function harvestQuestion(body: Record<string, unknown> | undefined): HarvestQuestion | null {
  if (body?.code !== 'yeast_question') return null
  const message = String(body.message ?? '')
  return body.question === 'dirty' ? { kind: 'dirty', message } : body.question === 'has_yeast' ? { kind: 'has_yeast', message } : null
}

/** The snackbar after the check-off: "Yeast harvest done · 30 lb → YB1", "… · Yeast dumped". */
export function harvestDoneText(stepName: string, f: HarvestForm, brinks: Pick<YeastBrink, 'id' | 'name'>[]): string {
  if (f.outcome === 'dumped') return `${stepName} done · Yeast dumped`
  const brink = brinks.find((b) => b.id === f.brinkId)?.name ?? 'the brink'
  return `${stepName} done · ${lbText(readLb(f.lb).lb)} → ${brink}`
}

/** The batch page's harvest line: "11/20 · 30 lb → YB2", "11/22 · 12 lb → YB2 (on top)". */
export const pullText = (p: { occurred_on: string; lb: string; brink: string; on_top: boolean }) =>
  `${shortDate(p.occurred_on)} · ${lbText(p.lb)} → ${p.brink}${p.on_top ? ' (on top)' : ''}`

/** `GET /api/yeast/batches/:id` (spec §6.6): what went into a batch and what came out. */
export interface YeastBatchPage {
  pitched: (
    | { source: 'lot'; occurred_on: string; quantity: string; unit: string | null; product: string | null; lot_number: string | null; note: string | null }
    | { source: 'brink'; occurred_on: string; lb: string; brink: string | null; strains: string[]; generation: number | null; coferment: boolean; note: string | null }
  )[]
  harvested: { entry_id: number; occurred_on: string; lb: string; brink: string; on_top: boolean; strains: string[]; generation: number | null; note: string | null }[]
  dumped: { done_on: string | null; note: string | null }[]
}

const SINGULAR: Record<string, string> = { bricks: 'brick', pitchables: 'pitchable', tablets: 'tablet' }

/** "2 bricks Chico Ale US-05, lot F123 · Mother", "38 lb from YB2 · US-05 gen 2", "… · Co-ferment: US-05 + WLP002 · gen 1". */
export function pitchedText(p: YeastBatchPage['pitched'][number]): string {
  if (p.source === 'lot') {
    const n = Number(p.quantity)
    const unit = p.unit ? (n === 1 ? (SINGULAR[p.unit] ?? p.unit) : p.unit) : ''
    return `${n.toLocaleString('en-US')} ${unit} ${p.product ?? ''}`.replace(/\s+/g, ' ').trim() + `${p.lot_number ? `, lot ${p.lot_number}` : ''} · Mother`
  }
  const strains = p.coferment ? `Co-ferment: ${p.strains.join(' + ')} · gen ${p.generation ?? '?'}` : `${p.strains.join(' + ')} gen ${p.generation ?? '?'}`
  return `${lbText(p.lb)} from ${p.brink ?? 'a brink'} · ${strains}`
}
