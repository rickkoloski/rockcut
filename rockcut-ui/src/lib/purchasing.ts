// D61 §3.2–3.4: orders and receiving on the screens: money, the running
// total and target progress, whole packs (D62 §3.5; sacks for grain), the
// previous lot (A3) and how a line's lot rows add up.
import { LB_DECIMALS, PRICE_DECIMALS, formatQuantity, isCountUnit, packPlural, packWord, parseDecimal, unitDecimals, unitWord, type QuantityDisplay } from './brewingUnits'
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

/**
 * An offer's pack as the pickers show it (D62 lead decisions 1, gap 3): a
 * box "box · 11 lb"; a sack its size with the grain form, "55 lb whole"
 * (milled or whole is grain's; a hop offer has none). D65: any other pack
 * reads as the box does, "pail · 5 gal", "tub · 872 tablets".
 */
export function offerPackText(o: { pack_name: string; pack_size: string | number; form?: string | null; pack_note?: string | null }, unit = 'lb'): string {
  const size = `${Number(o.pack_size)} ${unit}`
  // D65 (A16): the pack note follows the pack, "tub · 872 tablets (5 lb)".
  if (o.pack_name !== 'sack') return `${o.pack_name} · ${size}${o.pack_note ? ` (${o.pack_note})` : ''}`
  return o.form ? `${size} ${o.form}` : size
}

/**
 * To order's offer (D62 decisions 2, gap 15): a hop box reads "box · 11 lb"
 * as on the order and Add lot pickers; a sack reads "50 lb" as in D61.
 */
export const reorderOfferPack = (o: { pack_name: string; pack_size: string | number; pack_note?: string | null }, unit = 'lb') =>
  o.pack_name !== 'sack' ? offerPackText({ ...o, form: null }, unit) : `${Number(o.pack_size)} ${unit}`

/**
 * The pack To order's caption counts in: each row's own (its offer's, else
 * its product's: boxes for hops, sacks for grain), "sack" for an empty list
 * as in D61, null ("packs") when they differ or one isn't known (gap 15).
 */
export function reorderListPack(rowPacks: (string | null)[]): string | null {
  if (rowPacks.length === 0) return 'sack'
  return rowPacks.every((p) => p != null) ? sharedPackName(rowPacks) : null
}

/** "1,980 lb": a quantity in its unit (whole numbers for `each`). */
export const amountText = (quantity: string | number, unit: string) =>
  `${Number(quantity).toLocaleString('en-US', { maximumFractionDigits: unitDecimals(unit) })} ${unitWord(unit, Number(quantity))}`

/** "1,980 lb · 11.5 gal": quantities per unit, never added together (D62 §3.8). */
export const byUnitText = (byUnit: UnitQuantity[]) => byUnit.map((u) => amountText(u.quantity, u.unit_label ?? u.unit)).join(' · ')

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
    // D65 lead decisions 3 (gap 6): a line with its offer but no packs yet
    // counts as 0 of its pack and unit ("0 pails · 0 gal"), never "0 sacks".
    if (l.packSize == null) continue
    const unit = l.unit ?? 'lb'
    const n = l.packs ?? 0
    packs += n
    names.push(l.packName ?? 'sack')
    units.set(unit, (units.get(unit) ?? 0) + n * l.packSize)
    if (l.price != null) cents += Math.round(n * l.price * 100)
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
 * D65 (D62 lead decisions 5, gap 1): a supplier's order target on the
 * Companies list, in packs ("40 packs"): every pack counts, sacks and boxes
 * alike. '' with no target.
 */
export const orderTargetText = (packs: number | null | undefined): string =>
  packs == null ? '' : `${packs} ${packs === 1 ? 'pack' : 'packs'}`

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
 * D62 lead decisions 5, gap 3: a split row of 0 says why Receive waits
 * ("Each lot needs at least 1 box. Remove the empty one."); null otherwise.
 */
export function emptySplitText(rows: string[], packName: string | null | undefined): string | null {
  return rows.some((r) => parsePacks(r, 0) === 0) ? `Each lot needs at least 1 ${packName ?? 'pack'}. Remove the empty one.` : null
}

/**
 * D65 (D62 lead decisions 5, Add lot supplier): the supplier a new lot starts
 * with: the reorder offer's, else the most recent offer's; null with no offers.
 * `offers` are the product's active offers.
 */
export function defaultLotSupplier(
  offers: { id: number; supplier_party_id: number; inserted_at: string }[],
  reorderOfferId: number | null | undefined,
): number | null {
  const reorder = offers.find((o) => o.id === reorderOfferId)
  if (reorder) return reorder.supplier_party_id
  const latest = [...offers].sort((a, b) => b.inserted_at.localeCompare(a.inserted_at) || b.id - a.id)[0]
  return latest?.supplier_party_id ?? null
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
 * year already over. A line whose name already ends with its manufacturer
 * (`named`, a hop's "Citra T90 Pellet · YCH") leaves the supplier off, as
 * every line is the contract's supplier's (D62 decisions 2, gap 18). When
 * the product has several offers from the supplier, `offer` names the one
 * picked by its current price ("now $150.00/box", decisions 3, gap 20).
 */
export function contractPriceChanges(lines: { product: string; price: string; changed: boolean; named?: boolean; offer?: string | null }[], supplier: string, year: number, today: string): string[] {
  if (year < Number(today.slice(0, 4))) return []
  const jan1 = `${year}-01-01`
  const from = jan1 > today ? jan1 : today
  return lines
    .filter((l) => l.changed)
    .map((l) => `${l.named ? '' : `${supplier} `}${l.product}${l.offer ? ` (${l.offer})` : ''} price becomes ${money(l.price)} from ${from}`)
}

/** Gap 20: which of several offers a contract line changes: "now $150.00/box", or "no current price". */
export function offerNow(o: { pack_name: string; current_price?: { price_per_pack: string } | null }): string {
  return o.current_price ? `now ${money(o.current_price.price_per_pack)}/${o.pack_name}` : 'no current price'
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

/**
 * D65 lead decisions 1 (gap 3, the API's `Catalog.default_pack_in/2`): the
 * pack a new offer in `unit` starts with: the unit's usual one when the
 * category takes it, else the category's first ("bottle" for a fl oz spice).
 */
export function defaultPackName(defaults: Record<string, string> | undefined, unit: string | null | undefined, names: string[]): string | null {
  const usual = defaults?.[unit ?? '']
  return usual && names.includes(usual) ? usual : (names[0] ?? null)
}

/**
 * D65 lead decisions 3 (gap 4): a quantity as Copy gives it: a count
 * (`each`, "tablets") is whole ("750", not "750.00"); other units as the API
 * sends them.
 */
export const copyQuantity = (quantity: string, unit: string) => (isCountUnit(unit) ? String(Number(quantity)) : quantity)
