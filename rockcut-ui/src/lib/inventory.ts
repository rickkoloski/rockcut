// D60 §3.2, §3.7: movement kinds and party roles as the screens name them.
import { formatQuantity, type Pack, type QuantityDisplay } from './brewingUnits'
import { onHandText } from './ingredientFeatures'
import type { IngredientLot, InventoryMovement, MovementKind, PartyRole } from './types'

export const KIND_LABELS: Record<MovementKind, string> = {
  opening: 'Opening amount',
  received: 'Received',
  used: 'Used in brewing',
  traded_out: 'Traded out',
  loaned_out: 'Loaned out',
  traded_in: 'Traded in',
  loaned_in: 'Loaned in',
  count: 'Count adjustment',
}

/** A movement's kind as the history shows it: a count that matched on-hand (0) is "Counted, no change" (gap 11). */
export const movementKindLabel = (m: Pick<InventoryMovement, 'kind' | 'quantity'>) =>
  m.kind === 'count' && Number(m.quantity) === 0 ? 'Counted, no change' : (KIND_LABELS[m.kind] ?? m.kind)

/** Matt, 2026-11-18 (gap 13): no movement or count is dated after today (Colorado); the API says the same. */
export const FUTURE_DATE = "The date can't be in the future"

/**
 * Record movement's "On hand" with Oldest first (gap 1): `onHandText`, as the
 * header, list and Count say it, with a hint when some is expired ("On hand:
 * 5 sacks usable · 4 sacks expired (pick that lot to use it)"); Oldest first
 * takes the usable part.
 */
export function oldestFirstOnHand(
  p: { on_hand: string | number | null; expired?: string | number | null; unit?: string | null },
  pack: Pack | null,
  mode: QuantityDisplay,
): string {
  const main = `On hand: ${onHandText(p, mode, pack)}`
  return Number(p.expired ?? 0) > 0 ? `${main} (pick that lot to use it)` : main
}

/** The kinds Record movement offers: out first (the usual), then in. Opening and counts have their own dialogs. */
export const OUTGOING: MovementKind[] = ['used', 'traded_out', 'loaned_out']
export const INCOMING: MovementKind[] = ['received', 'traded_in', 'loaned_in']
/** Trades and loans name the partner brewery. */
export const WITH_PARTNER: MovementKind[] = ['traded_out', 'loaned_out', 'traded_in', 'loaned_in']

/** D62 §3.2: the Companies page says Manufacturer; grain screens say Maltster (`manufacturerLabel`). */
export const ROLE_LABELS: Record<PartyRole, string> = {
  manufacturer: 'Manufacturer',
  supplier: 'Supplier',
  partner_brewery: 'Partner brewery',
}

export const ROLES: PartyRole[] = ['manufacturer', 'supplier', 'partner_brewery']

/** Oldest first, as the API takes stock: received date, then lot id. */
export const oldestFirst = (a: Pick<IngredientLot, 'received_date' | 'id'>, b: Pick<IngredientLot, 'received_date' | 'id'>) =>
  (a.received_date ?? '').localeCompare(b.received_date ?? '') || a.id - b.id

/**
 * The lot delete confirm (Matt, 2026-11-18, gap 9): "Delete lot H-D? Its
 * Received 4 sacks (200 lb) goes too." The stock is the lot's first movement,
 * in the person's display (with the total when that's packs). A lot with no
 * movements just asks. Only a lot that can be deleted gets here (gap 15).
 */
export function lotDeleteMessage(
  lot: Pick<IngredientLot, 'id' | 'lot_number' | 'pack_name' | 'pack_size'> & { unit?: string | null },
  movements: Pick<InventoryMovement, 'id' | 'kind' | 'quantity'>[],
  mode: QuantityDisplay,
): string {
  const name = `Delete lot ${lot.lot_number ?? `#${lot.id}`}?`
  if (movements.length === 0) return name
  const [first] = movements
  const shown = formatQuantity(first.quantity, lot.pack_name, lot.pack_size, lot.unit, mode)
  const total = formatQuantity(first.quantity, null, null, lot.unit, 'lb')
  const quantity = shown === total ? total : `${shown} (${total})`
  return `${name} Its ${KIND_LABELS[first.kind] ?? first.kind} ${quantity} goes too.`
}

export const LATER_MOVEMENTS = 'This lot has movements after its first; correct it with a movement or a count'

/**
 * Why the lot dialog's Delete is disabled, or null: the lot's
 * `delete_blocked`, or a later movement in the dialog's own movements (they
 * can refetch before the lot does; lead decisions 4). The API's rules and
 * wording.
 */
export function lotDeleteBlocked(lot: Pick<IngredientLot, 'delete_blocked'>, movements: unknown[]): string | null {
  return lot.delete_blocked ?? (movements.length > 1 ? LATER_MOVEMENTS : null)
}

/**
 * The lots a recipe line's lot picker offers: not depleted (D60 gap 8) and not
 * expired (D61 carry-over 5), except the lot the line already uses, which
 * stays shown whatever its status.
 */
export const recipeLotChoices = <T extends Pick<IngredientLot, 'id' | 'status'>>(lots: T[], currentLotId?: number | null): T[] =>
  lots.filter((l) => (l.status !== 'depleted' && l.status !== 'expired') || l.id === currentLotId)

/** D61: the order queries an order write refreshes (with GRAIN_KEYS when stock moves). */
export const ORDER_KEYS: unknown[][] = [['purchase_orders'], ['purchase_order'], ['parties'], ['ingredient_reorder'], ['contracts'], ['contract_shortfall'], ['ingredient_totals']]

/** Query keys every inventory or catalog write refreshes. */
export const GRAIN_KEYS: unknown[][] = [['ingredient_products'], ['ingredient_product'], ['ingredient_lots'], ['inventory_movements'], ['ingredients'], ['ingredient'], ['ingredient_reorder'], ['ingredient_totals']]
