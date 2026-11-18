// D60 §3.2, §3.7: movement kinds and party roles as the screens name them.
import { formatQuantity, type QuantityDisplay } from './brewingUnits'
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

/** A movement's kind as the history shows it: a count that matched on-hand (0 lb) is "Counted, no change" (gap 11). */
export const movementKindLabel = (m: Pick<InventoryMovement, 'kind' | 'quantity_lb'>) =>
  m.kind === 'count' && Number(m.quantity_lb) === 0 ? 'Counted, no change' : (KIND_LABELS[m.kind] ?? m.kind)

/** Matt, 2026-11-18 (gap 13): no movement or count is dated after today (Colorado); the API says the same. */
export const FUTURE_DATE = "The date can't be in the future"

/**
 * Record movement's "On hand" with Oldest first (gap 1): what oldest first
 * can take, the stock in lots that aren't expired, with the expired stock
 * noted ("On hand: 5 sacks · 4 sacks expired (pick that lot to use it)").
 */
export function oldestFirstOnHand(p: { on_hand_lb: string | number | null; expired_lb?: string | number | null }, sackSize: number | null, mode: QuantityDisplay): string {
  const expired = Number(p.expired_lb ?? 0)
  const usable = Number(p.on_hand_lb ?? 0) - expired
  const main = `On hand: ${formatQuantity(usable, sackSize, mode)}`
  return expired > 0 ? `${main} · ${formatQuantity(expired, sackSize, mode)} expired (pick that lot to use it)` : main
}

/** The kinds Record movement offers: out first (the usual), then in. Opening and counts have their own dialogs. */
export const OUTGOING: MovementKind[] = ['used', 'traded_out', 'loaned_out']
export const INCOMING: MovementKind[] = ['received', 'traded_in', 'loaned_in']
/** Trades and loans name the partner brewery. */
export const WITH_PARTNER: MovementKind[] = ['traded_out', 'loaned_out', 'traded_in', 'loaned_in']

export const ROLE_LABELS: Record<PartyRole, string> = {
  maltster: 'Maltster',
  supplier: 'Supplier',
  partner_brewery: 'Partner brewery',
}

export const ROLES: PartyRole[] = ['maltster', 'supplier', 'partner_brewery']

/** Oldest first, as the API takes stock: received date, then lot id. */
export const oldestFirst = (a: Pick<IngredientLot, 'received_date' | 'id'>, b: Pick<IngredientLot, 'received_date' | 'id'>) =>
  (a.received_date ?? '').localeCompare(b.received_date ?? '') || a.id - b.id

/**
 * The lot delete confirm (Matt, 2026-11-18, gap 9): "Delete lot H-D? Its
 * Received 4 sacks (200 lb) goes too." The stock is the lot's first movement,
 * in the person's display (with the lb when that's sacks). A lot with no
 * movements just asks; one with more than its first says the API will refuse.
 */
export function lotDeleteMessage(lot: Pick<IngredientLot, 'id' | 'lot_number' | 'sack_size_lb'>, movements: Pick<InventoryMovement, 'id' | 'kind' | 'quantity_lb'>[], mode: QuantityDisplay): string {
  const name = `Delete lot ${lot.lot_number ?? `#${lot.id}`}?`
  if (movements.length === 0) return name
  if (movements.length > 1) return `${name} It has movements after its first, so it can't be deleted; correct it with a movement or a count.`
  const [first] = movements
  const shown = formatQuantity(first.quantity_lb, lot.sack_size_lb, mode)
  const lb = formatQuantity(first.quantity_lb, null, 'lb')
  const quantity = shown === lb ? lb : `${shown} (${lb})`
  return `${name} Its ${KIND_LABELS[first.kind] ?? first.kind} ${quantity} goes too.`
}

/** Query keys every inventory or catalog write refreshes. */
export const GRAIN_KEYS: unknown[][] = [['ingredient_products'], ['ingredient_product'], ['ingredient_lots'], ['inventory_movements'], ['ingredients'], ['ingredient']]
