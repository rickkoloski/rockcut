// D60 §3.2, §3.7: movement kinds and party roles as the screens name them.
import type { IngredientLot, MovementKind, PartyRole } from './types'

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

/** Query keys every inventory or catalog write refreshes. */
export const GRAIN_KEYS: unknown[][] = [['ingredient_products'], ['ingredient_product'], ['ingredient_lots'], ['inventory_movements'], ['ingredients'], ['ingredient']]
