// D61 §3.2–3.4: orders and receiving on the screens: money, the running
// total and target progress, whole packs (D62 §3.5; sacks for grain), the
// previous lot (A3) and how a line's lot rows add up.
import { LB_DECIMALS, PRICE_DECIMALS, formatQuantity, packPlural, packWord, parseDecimal, unitDecimals, type QuantityDisplay } from './brewingUnits'
import type { IngredientLot, OrderStatus, UnitQuantity } from './types'

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

/** "1,980 lb": a quantity in its unit (whole numbers for `each`). */
export const amountText = (quantity: string | number, unit: string) =>
  `${Number(quantity).toLocaleString('en-US', { maximumFractionDigits: unitDecimals(unit) })} ${unit}`

/** "1,980 lb · 11.5 gal": quantities per unit, never added together (D62 §3.8). */
export const byUnitText = (byUnit: UnitQuantity[]) => byUnit.map((u) => amountText(u.quantity, u.unit)).join(' · ')

/**
 * The one pack name a set of lines shares ("sack" on a grain-only order),
 * else null: the words then say "packs" (D62 §3.5, A5).
 */
export function sharedPackName(names: (string | null | undefined)[]): string | null {
  const unique = new Set(names.filter((n): n is string => !!n))
  return unique.size === 1 ? [...unique][0] : null
}

/**
 * Whole packs typed in a box: the number, or null when empty or not a whole
 * number ≥ `min`. Thousands separators in groups of three are taken, as in
 * the other number boxes (`1,234` is 1234; D61 lead decisions 1, gap 10).
 */
export function parsePacks(text: string, min = 1): number | null {
  const typed = text.trim()
  const t = /^\d{1,3}(,\d{3})+$/.test(typed) ? typed.replace(/,/g, '') : typed
  if (!/^\d+$/.test(t)) return null
  const n = Number(t)
  return n >= min ? n : null
}

export interface DraftLine {
  packs: number | null
  packSize: number | null
  /** The offer's pack ("sack") and the product's unit (lb). */
  packName?: string | null
  unit?: string
  price: number | null
}

/**
 * The order's running total (§3.2): "36 sacks · 1,980 lb · $1,512.00" over
 * the lines with an offer and whole packs (a line without a price adds its
 * packs and quantity, not $). D62 §3.5, §3.8: "packs" when the lines' packs
 * differ, and the quantity per unit.
 */
export function runningTotal(lines: DraftLine[]): { packs: number; byUnit: UnitQuantity[]; dollars: number; text: string } {
  let packs = 0
  let cents = 0
  const units = new Map<string, number>()
  const names: (string | null | undefined)[] = []
  for (const l of lines) {
    if (l.packs == null || l.packSize == null) continue
    const unit = l.unit ?? 'lb'
    packs += l.packs
    names.push(l.packName ?? 'sack')
    units.set(unit, (units.get(unit) ?? 0) + l.packs * l.packSize)
    if (l.price != null) cents += Math.round(l.packs * l.price * 100)
  }
  if (units.size === 0) units.set('lb', 0)
  const byUnit = [...units.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([unit, q]) => ({ unit, quantity: String(Math.round(q * 100) / 100) }))
  const dollars = cents / 100
  const packText = `${packs.toLocaleString('en-US')} ${packWord(names.length ? sharedPackName(names) : 'sack', packs)}`
  return { packs, byUnit, dollars, text: `${packText} · ${byUnitText(byUnit)} · ${money(dollars)}` }
}

/**
 * Progress to the supplier's order target (decision 48; D62 A5: every pack
 * counts): the next multiple at or above the packs, at least one target
 * ("36 of 40 sacks", "40 of 40 sacks", "44 of 80 sacks"; "36 of 40 packs"
 * when the order's packs differ); null without a target.
 */
export function targetProgress(packs: number, target: number | null | undefined, packName: string | null = 'sack'): string | null {
  if (!target || target <= 0) return null
  const next = Math.max(target, Math.ceil(packs / target) * target)
  return `${packs} of ${next} ${packPlural(packName)}`
}

/**
 * A3: the product's previous lot for an offer's pack size: its most recently
 * received lot that isn't expired and holds that pack size (then the highest
 * id). The API picks the same one when a line has no lot.
 */
export function previousLot<T extends Pick<IngredientLot, 'id' | 'status' | 'received_date' | 'pack_size'>>(lots: T[], packSize: string | number): T | null {
  const size = Number(packSize)
  const fits = lots.filter((l) => l.status !== 'expired' && l.pack_size != null && Number(l.pack_size) === size)
  fits.sort((a, b) => (b.received_date ?? '').localeCompare(a.received_date ?? '') || b.id - a.id)
  return fits[0] ?? null
}

/** The lots a receipt can go into: not expired, the offer's pack size (A3, note 6), newest first. */
export function receivableLots<T extends Pick<IngredientLot, 'id' | 'status' | 'received_date' | 'pack_size'>>(lots: T[], packSize: string | number): T[] {
  const size = Number(packSize)
  return lots
    .filter((l) => l.status !== 'expired' && l.pack_size != null && Number(l.pack_size) === size)
    .sort((a, b) => (b.received_date ?? '').localeCompare(a.received_date ?? '') || b.id - a.id)
}

/** "Lot W123 · received 2026-10-02 · 8 sacks on hand" in the person's packs/total setting. */
export function lotChoiceLabel(
  lot: Pick<IngredientLot, 'id' | 'lot_number' | 'received_date' | 'on_hand' | 'pack_name' | 'pack_size'> & { unit?: string | null },
  mode: QuantityDisplay,
): string {
  return `Lot ${lot.lot_number ?? `#${lot.id}`} · received ${lot.received_date ?? '—'} · ${formatQuantity(lot.on_hand, lot.pack_name, lot.pack_size, lot.unit, mode)} on hand`
}

/**
 * How a split line's lot rows add up (§3.3): "6 + 4 = 10 of 10"; `ok` when
 * every row is whole packs ≥ 1 and they make the packs received.
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
 * To order with a chosen offer (§3.5): on hand (usable, in the product's
 * unit) and on order (on open lines of any offer) ÷ its pack size, to 2
 * decimals (lead decisions 1, item 20, as 17a), and ⌈minimum − on hand − on
 * order⌉ when above 0.
 */
export function toOrder(minimum: number, usable: number, packSize: number, onOrder: number): { onHandPacks: number; onOrderPacks: number; toOrder: number } {
  const inPacks = (q: number) => Math.round((q / packSize) * 100) / 100
  const onHandPacks = inPacks(usable)
  const onOrderPacks = inPacks(onOrder)
  return { onHandPacks, onOrderPacks, toOrder: Math.max(0, Math.ceil(minimum - onHandPacks - onOrderPacks - 1e-9)) }
}

/**
 * A contract figure in packs (amendment 17a: converted by weight, so it may
 * be a part pack): to 2 decimals, whole numbers without them ("10.5", "6",
 * "1,234.25").
 */
export function packsFigure(n: number): string {
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

/**
 * D62 §3.7: a hop contract line's box equivalent beside its lb, "440 lb =
 * 40 boxes" ("445 lb = 40.45 boxes"); null until it's a number.
 */
export function hopBoxes(lb: string, boxSize: string | number | null | undefined = 11): string | null {
  const parsed = parseDecimal(lb, LB_DECIMALS)
  if (!parsed.ok || parsed.value == null || !boxSize) return null
  const n = Number(parsed.value)
  const boxes = Math.round((n / Number(boxSize)) * 100) / 100
  return `${n.toLocaleString('en-US')} lb = ${boxes.toLocaleString('en-US')} ${packWord('box', boxes)}`
}

/** D62 A1: a hop line's $/lb as the offer's box price, "$159.50 / box"; null until it's a number. */
export function hopBoxPrice(perLb: string, boxSize: string | number | null | undefined = 11): string | null {
  const parsed = parseDecimal(perLb, PRICE_DECIMALS)
  if (!parsed.ok || parsed.value == null || !boxSize) return null
  return `${money(Number(parsed.value) * Number(boxSize))} / box`
}
