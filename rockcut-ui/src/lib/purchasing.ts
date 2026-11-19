// D61 §3.2–3.4: orders and receiving on the screens: money, the running
// total and target progress, whole sacks, the previous lot (A3) and how a
// line's lot rows add up.
import { formatQuantity, type QuantityDisplay } from './brewingUnits'
import type { IngredientLot, OrderStatus } from './types'

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  open: 'Open',
  received: 'Received',
  cancelled: 'Cancelled',
}

/** "$1,512.00"; "—" for nothing. */
export function money(v: string | number | null | undefined, digits = 2): string {
  if (v == null || v === '') return '—'
  return Number(v).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits })
}

const lbText = (lb: number) => `${lb.toLocaleString('en-US', { maximumFractionDigits: 2 })} lb`
const sacksText = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'sack' : 'sacks'}`

/**
 * Whole sacks typed in a box: the number, or null when empty or not a whole
 * number ≥ `min`. Thousands separators in groups of three are taken, as in
 * the other number boxes (`1,234` is 1234; D61 lead decisions 1, gap 10).
 */
export function parseSacks(text: string, min = 1): number | null {
  const typed = text.trim()
  const t = /^\d{1,3}(,\d{3})+$/.test(typed) ? typed.replace(/,/g, '') : typed
  if (!/^\d+$/.test(t)) return null
  const n = Number(t)
  return n >= min ? n : null
}

export interface DraftLine {
  sacks: number | null
  sackSize: number | null
  price: number | null
}

/**
 * The order's running total (§3.2): "36 sacks · 1,980 lb · $1,512.00" over
 * the lines with an offer and whole sacks (a line without a price adds its
 * sacks and lb, not $).
 */
export function runningTotal(lines: DraftLine[]): { sacks: number; lb: number; dollars: number; text: string } {
  let sacks = 0
  let lb = 0
  let cents = 0
  for (const l of lines) {
    if (l.sacks == null || l.sackSize == null) continue
    sacks += l.sacks
    lb += l.sacks * l.sackSize
    if (l.price != null) cents += Math.round(l.sacks * l.price * 100)
  }
  lb = Math.round(lb * 100) / 100
  const dollars = cents / 100
  return { sacks, lb, dollars, text: `${sacksText(sacks)} · ${lbText(lb)} · ${money(dollars)}` }
}

/**
 * Progress to the supplier's order target (decision 48): the next multiple
 * at or above the sacks, at least one target ("36 of 40 sacks", "40 of 40
 * sacks", "44 of 80 sacks"); null without a target.
 */
export function targetProgress(sacks: number, target: number | null | undefined): string | null {
  if (!target || target <= 0) return null
  const next = Math.max(target, Math.ceil(sacks / target) * target)
  return `${sacks} of ${next} sacks`
}

/**
 * A3: the product's previous lot for an offer's sack size: its most recently
 * received lot that isn't expired and holds that sack size (then the highest
 * id). The API picks the same one when a line has no lot.
 */
export function previousLot<T extends Pick<IngredientLot, 'id' | 'status' | 'received_date' | 'sack_size_lb'>>(lots: T[], sackSize: string | number): T | null {
  const size = Number(sackSize)
  const fits = lots.filter((l) => l.status !== 'expired' && l.sack_size_lb != null && Number(l.sack_size_lb) === size)
  fits.sort((a, b) => (b.received_date ?? '').localeCompare(a.received_date ?? '') || b.id - a.id)
  return fits[0] ?? null
}

/** The lots a receipt can go into: not expired, the offer's sack size (A3, note 6), newest first. */
export function receivableLots<T extends Pick<IngredientLot, 'id' | 'status' | 'received_date' | 'sack_size_lb'>>(lots: T[], sackSize: string | number): T[] {
  const size = Number(sackSize)
  return lots
    .filter((l) => l.status !== 'expired' && l.sack_size_lb != null && Number(l.sack_size_lb) === size)
    .sort((a, b) => (b.received_date ?? '').localeCompare(a.received_date ?? '') || b.id - a.id)
}

/** "Lot W123 · received 2026-10-02 · 8 sacks on hand" in the person's sacks/lb setting. */
export function lotChoiceLabel(lot: Pick<IngredientLot, 'id' | 'lot_number' | 'received_date' | 'on_hand_lb' | 'sack_size_lb'>, mode: QuantityDisplay): string {
  return `Lot ${lot.lot_number ?? `#${lot.id}`} · received ${lot.received_date ?? '—'} · ${formatQuantity(lot.on_hand_lb, lot.sack_size_lb, mode)} on hand`
}

/**
 * How a split line's lot rows add up (§3.3): "6 + 4 = 10 of 10"; `ok` when
 * every row is whole sacks ≥ 1 and they make the sacks received.
 */
export function splitSummary(rows: (number | null)[], received: number): { text: string; ok: boolean } {
  const n = rows.map((r) => r ?? 0)
  const sum = n.reduce((a, b) => a + b, 0)
  return { text: `${n.join(' + ')} = ${sum} of ${received}`, ok: rows.every((r) => r != null && r >= 1) && sum === received }
}

/**
 * Which line an API refusal from Receive belongs to: the first whose product
 * or offer it names, else the first with a lot it names (`lots`: the lot
 * numbers each line's rows name, any case: "Lot W123 is expired"), else the
 * only line; null when it can't tell (the dialog shows it on top).
 */
export function lineForError<T extends { id: number; offer: { label: string; product: { display_name: string } } }>(
  lines: T[],
  message: string,
  lots: Record<number, string[]> = {},
): number | null {
  const named = lines.find((l) => message.includes(l.offer.product.display_name) || message.includes(l.offer.label))
  if (named) return named.id
  const m = message.toLowerCase()
  const byLot = lines.find((l) => (lots[l.id] ?? []).some((n) => n.trim() !== '' && m.includes(`lot ${n.trim().toLowerCase()} `)))
  if (byLot) return byLot.id
  return lines.length === 1 ? lines[0].id : null
}

/**
 * The offer prices saving a contract writes (decision 23, A2, decision 40):
 * for each new or changed line, "BSG Rahr 2-Row price becomes $42.00 from
 * 2027-01-01", effective Jan 1 of the year or today if later; none for a
 * year already over.
 */
export function contractPriceChanges(lines: { product: string; price: string; changed: boolean }[], supplier: string, year: number, today: string): string[] {
  if (year < Number(today.slice(0, 4))) return []
  const jan1 = `${year}-01-01`
  const from = jan1 > today ? jan1 : today
  return lines.filter((l) => l.changed).map((l) => `${supplier} ${l.product} price becomes ${money(l.price)} from ${from}`)
}

/**
 * To order with a chosen offer (§3.5): on hand (usable lb) and on order (lb
 * on open lines of any offer) ÷ its sack size, to 2 decimals (lead decisions
 * 1, item 20, as 17a), and ⌈minimum − on hand − on order⌉ when above 0.
 */
export function toOrder(minimum: number, usableLb: number, sackSize: number, onOrderLb: number): { onHandSacks: number; onOrderSacks: number; toOrder: number } {
  const inSacks = (lb: number) => Math.round((lb / sackSize) * 100) / 100
  const onHandSacks = inSacks(usableLb)
  const onOrderSacks = inSacks(onOrderLb)
  return { onHandSacks, onOrderSacks, toOrder: Math.max(0, Math.ceil(minimum - onHandSacks - onOrderSacks - 1e-9)) }
}

/**
 * A contract figure in sacks (amendment 17a: converted by weight, so it may
 * be a part sack): to 2 decimals, whole numbers without them ("10.5", "6",
 * "1,234.25").
 */
export function sacksFigure(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/**
 * Lead decisions 2 (gap 3): the Contracts Year picker's years: every year
 * that has a contract, this year ±2 and the year shown, ascending.
 */
export const contractYears = (thisYear: number, withContracts: number[], shown: number): number[] =>
  [...new Set([thisYear - 2, thisYear - 1, thisYear, thisYear + 1, thisYear + 2, ...withContracts, shown])].sort((a, b) => a - b)

/** Lead decisions 2 (gap 3): the contract dialog's Year box: a whole year 2000–2100 (the API's range), else null. */
export const contractYear = (text: string): number | null => {
  const t = text.trim()
  if (!/^\d{4}$/.test(t)) return null
  const n = Number(t)
  return n >= 2000 && n <= 2100 ? n : null
}
