// TypeScript interfaces matching API JSON shapes (json_helpers.ex)

import type { ColorMode } from './colorMode'

export interface Brand {
  id: number
  name: string
  style: string | null
  description: string | null
  target_abv: number | null
  target_ibu: number | null
  target_srm: number | null
  status: string
  inserted_at: string
  updated_at: string
}

export interface Recipe {
  id: number
  brand_id: number
  brand: Brand | null
  version_major: number
  version_minor: number
  version: string
  batch_size: number
  batch_size_unit: string
  boil_time: number
  efficiency_target: number | null
  status: string
  notes: string | null
  recipe_ingredients: RecipeIngredient[] | null
  mash_steps: MashStep[] | null
  process_steps: ProcessStep[] | null
  water_profile: WaterProfile | null
  inserted_at: string
  updated_at: string
}

export interface RecipeIngredient {
  id: number
  recipe_id: number
  lot_id: number
  lot: IngredientLot | null
  amount: number
  unit: string
  use: string | null
  time_minutes: number | null
  sort_order: number
  notes: string | null
  inserted_at: string
  updated_at: string
}

export interface MashStep {
  id: number
  recipe_id: number
  step_number: number
  name: string
  temperature: number
  duration: number
  type: string
  notes: string | null
  inserted_at: string
  updated_at: string
}

export interface ProcessStep {
  id: number
  recipe_id: number
  step_number: number
  name: string
  day: number | null
  temperature: number | null
  duration: number | null
  duration_unit: string
  notes: string | null
  inserted_at: string
  updated_at: string
}

export interface WaterProfile {
  id: number
  recipe_id: number
  calcium: number | null
  magnesium: number | null
  sodium: number | null
  sulfate: number | null
  chloride: number | null
  bicarbonate: number | null
  ph_target: number | null
  notes: string | null
  inserted_at: string
  updated_at: string
}

export interface IngredientCategory {
  id: number
  name: string
  /** D62: a top-level category's stable key (`grains`, `hops`, …; never its name); null on children. */
  key?: string | null
  /** D60 §3.1: one level; Grains' children (Base, Crystal/Caramel, …). */
  parent_id: number | null
  sort_order: number
  field_definitions: CategoryFieldDefinition[] | null
  /** D61 carry-over 2: why Delete is refused (sub-categories, grains or ingredients), or null. */
  delete_blocked?: string | null
  /** D65 §4.2: what its products take (`Catalog.describe/1`); absent on old responses. */
  catalog?: CategoryCatalog
  inserted_at: string
  updated_at: string
}

/** D65 §4.2: a category's forms, units (per form, for sugars) and packs, and what it allows. */
export interface CategoryCatalog {
  /** The top-level key (a child's is its parent's). */
  key: string | null
  managed: boolean
  forms: string[]
  units: string[]
  form_units: Record<string, string[]>
  pack_names: string[]
  /** lb → bag, gal → pail, fl oz → jug, oz → bag, each → tub. */
  default_packs: Record<string, string>
  manufacturer_required: boolean
  allows_children: boolean
  allows_fields: boolean
  /** D65 (salts amendment): Water Salts' ingredients carry ion values. */
  ions?: boolean
  /** D64 §4.1: per form, the pack a yeast offer or lot starts with (Dry brick, Liquid pitchable); {} elsewhere. */
  form_packs?: Record<string, string>
  /** D64 §4.1: per form, how `each` reads (Dry bricks, Liquid pitchables); {} elsewhere. */
  form_unit_labels?: Record<string, string>
}

export interface CategoryFieldDefinition {
  id: number
  category_id: number
  field_name: string
  field_type: string
  options: string | null
  required: boolean
  sort_order: number
  inserted_at: string
  updated_at: string
}

export interface Ingredient {
  id: number
  name: string
  category_id: number
  category: CategorySummary | null
  notes: string | null
  /** D65: the chemical formula ("CaSO₄·2H₂O"), any category; null when not set. */
  formula?: string | null
  /** D65: ion values (ppm @ 1 g/gal) by key, on a Water Salts ingredient. */
  ions?: Record<string, string> | null
  /** D65 lead decisions 1 (gap 13): why Delete is refused (it has products or lots), or null. */
  delete_blocked?: string | null
  /** D64 (A13): a yeast strain's type (Ale, Lager, Brett, Lacto); null elsewhere. */
  yeast_strain_type_id?: number | null
  lots: IngredientLotSummary[] | null
  inserted_at: string
  updated_at: string
}

/** A category as other records embed it; `key` is D62's (null on a child). */
export interface CategorySummary {
  id: number
  name: string
  key?: string | null
  parent_id?: number | null
}

/** A product as other records embed it; `unit` is D62's (lb for grain). */
export interface ProductSummary {
  id: number
  name: string | null
  display_name: string
  unit?: string
  /** D65: "tablets" for `each` on a Tablet product. */
  unit_label?: string
  form?: string | null
  manufacturer: PartySummary | null
}

export interface IngredientLotSummary {
  id: number
  lot_number: string | null
  product_id: number | null
  supplier_party_id: number | null
  pack_name: string | null
  pack_size: string | null
  received_date: string | null
  status: string
  /** D60 §3.4: the lot's specs by feature key. */
  features: FeatureValues | null
  notes: string | null
}

export interface IngredientLot {
  id: number
  ingredient_id: number
  ingredient: { id: number; name: string; category: CategorySummary | null; yeast_strain_type_id?: number | null } | null
  lot_number: string | null
  /** D60: the product (grain lots). */
  product_id: number | null
  product: ProductSummary | null
  supplier_party_id: number | null
  supplier: PartySummary | null
  /** D62 §3.5: the pack ("sack", 55) in the product's unit. */
  pack_name: string | null
  pack_size: string | null
  /** The product's unit (null with no product). */
  unit?: string | null
  received_date: string | null
  /** D62 §3.4: a hop lot's crop year (required there; null elsewhere). */
  crop_year?: number | null
  status: string
  features: FeatureValues | null
  /** D62 §3.4: the feature keys whose value is outside the product's typical range. */
  outside_range?: string[]
  /** D62 §4.8: a hop lot's label for the recipe's lot picker ("YCH Citra T90 Pellet · L-1 · 2025 · 12.4% AA"); null otherwise. */
  label?: string | null
  /** The sum of its movements, in the product's unit (decimal string). */
  on_hand: string | null
  /** Why the lot can't be deleted (later movements, or a recipe uses it), or null (lead decisions 3, gap 15). */
  delete_blocked?: string | null
  /** D61 §3.4: $ per unit (its latest costed receipt, else the offer price: `estimated`), value of the on-hand; `unvalued` with no price. */
  unit_cost?: string | null
  value?: string | null
  estimated?: boolean
  unvalued?: boolean
  notes: string | null
  inserted_at: string
  updated_at: string
}

// ── D60 grain catalog and inventory ──

/** D62 §3.2: a maltster is a `manufacturer` (grain screens still say "Maltster"). */
export type PartyRole = 'manufacturer' | 'supplier' | 'partner_brewery'

export interface PartySummary {
  id: number
  name: string
}

export interface Party extends PartySummary {
  notes: string | null
  active: boolean
  /** D61 decision 48: a supplier's order size in packs (BSG: 40). */
  order_target_packs?: number | null
  /** D61 carry-over 2: why Delete is refused (what uses the company), or null. */
  delete_blocked?: string | null
  roles: PartyRole[] | null
  inserted_at: string
  updated_at: string
}

/**
 * A feature value as the API sends it (decimals as strings, trailing zeros
 * dropped). D62 §3.4: a product's range (hops' typical alpha) is `value`
 * (low) to `value_high`, either of them null.
 */
export interface FeatureValue {
  value: string | null
  value_high?: string | null
  entered_value: string | null
  entered_unit: string | null
}

export type FeatureValues = Record<string, FeatureValue>

export interface FeatureType {
  id: number
  key: string
  label: string
  unit_label: string
  min: string | null
  max: string | null
  decimals: number
  entered_units: string[]
  categories: FeatureApplicability[] | null
}

/**
 * D62 §3.4: where a feature lives in a category: on the product (`value`, a
 * standard; `range`, typical low–high; `none`) and on the lot (`copy` from
 * the standard; `enter` each time; `none`), and whether a lot must have it.
 */
export interface FeatureApplicability {
  category_id: number
  name: string
  sort_order: number
  required: boolean
  product_mode?: 'none' | 'value' | 'range'
  lot_mode?: 'none' | 'copy' | 'enter'
  lot_required?: boolean
  only_unit?: string | null
  /** D65: the feature applies only to products in this form (Brix on Liquid sugars). */
  only_form?: string | null
}

export interface OfferPrice {
  id: number
  offer_id: number
  price_per_pack: string
  /** $ per unit of the product (the price ÷ the pack size). */
  price_per_unit: string | null
  effective_on: string
  note: string | null
  entered_by: { id: number; name: string } | null
  inserted_at: string
}

export interface SupplierOffer {
  id: number
  product_id: number
  supplier_party_id: number
  supplier: PartySummary | null
  order_name: string | null
  /** D62 §3.5: the pack, e.g. "sack" · 55 (in the product's unit). */
  pack_name: string
  pack_size: string
  /** D65 (A16): a note on the pack, "5 lb" for a tub of 872 tablets; null when none. */
  pack_note?: string | null
  /** Grain's alone; null on a hop offer (D62 lead decisions 1, gap 3). */
  form: 'milled' | 'whole' | null
  notes: string | null
  active: boolean
  current_price: OfferPrice | null
  inserted_at: string
  updated_at: string
}

/** A product ("Rahr 2-Row"): an ingredient from one manufacturer (the maltster, for grain). */
export interface IngredientProduct {
  id: number
  ingredient_id: number
  ingredient: { id: number; name: string; category: CategorySummary | null; yeast_strain_type_id?: number | null } | null
  category: CategorySummary | null
  /** D62: the top-level category's key (`grains` for a grain on Base). */
  category_key: string | null
  /** D65 decision 8: null on a D65 product with no manufacturer ("None"). */
  manufacturer_party_id: number | null
  manufacturer: PartySummary | null
  name: string | null
  display_name: string
  /** D62 §3.3: the unit it's kept in (lb for grain), its form and origin (not used for grain). */
  unit: string
  /** D65: the unit as screens say it ("tablets" for `each` on a Tablet product). */
  unit_label?: string
  /** D65: its ingredient's ion values (Water Salts), read-only. */
  ions?: Record<string, string>
  form: string | null
  origin: string | null
  notes: string | null
  active: boolean
  features: FeatureValues | null
  offers: SupplierOffer[] | null
  /** In `unit`. */
  on_hand: string
  /** The part of `on_hand` in expired lots. */
  expired: string
  /** D61 §3.5: the reorder point in whole packs (null: none), and on hand (not expired) under it. */
  min_on_hand_packs?: number | null
  /** The offer picked on To order (lead decisions 1, gap 4); null: the default. */
  reorder_offer_id?: number | null
  below_minimum?: boolean
  /** D62 lead decisions 1, gap 9: sent back on a save; a save from an older version is refused (409). */
  lock_version: number
  inserted_at: string
  updated_at: string
}

export type MovementKind = 'opening' | 'received' | 'used' | 'traded_out' | 'traded_in' | 'loaned_out' | 'loaned_in' | 'count'

export interface InventoryMovement {
  id: number
  lot_id: number
  lot_number: string | null
  product_id: number | null
  kind: MovementKind
  /** Signed, in the product's unit: out is negative. */
  quantity: string
  occurred_on: string
  partner_party_id: number | null
  partner: PartySummary | null
  /** A receipt from an order with no note of its own names the order ("PO-7", "Order #12"). */
  note: string | null
  purchase_order_id?: number | null
  /** D64 §4.6: the batch a pitch of purchased yeast went into. */
  batch_id?: number | null
  /** Lead decisions 3, gap 5: a yeast pitch this viewer may take back. */
  can_remove?: boolean
  entered_by: { id: number; name: string } | null
  inserted_at: string
}

/** D64 (A13): a yeast Strain Type in the yeast settings. */
export interface YeastStrainType {
  id: number
  name: string
  position: number
  active: boolean
  retired_at: string | null
  /** How many strains have it; one in use can be renamed or retired, not deleted. */
  in_use: number
}

/** D64 §6.4: a batch a pitch can name (`GET /api/yeast/batches`). */
export interface YeastBatch {
  id: number
  /** "Galactic #41", "Altruism P1". */
  label: string
  number: string
  status: string
  /** Not completed or dumped: the picker offers these. */
  open: boolean
}

// ── D61 purchasing ──

export type OrderStatus = 'open' | 'received' | 'cancelled'

export interface PurchaseOrderLine {
  id: number
  offer_id: number
  offer: {
    id: number
    order_name: string | null
    /** The order name, else the product. */
    label: string
    pack_name: string
    pack_size: string
    /** D65 (A16): the pack note, "5 lb". */
    pack_note?: string | null
    product_id: number
    product: ProductSummary
  }
  packs_ordered: number
  packs_received: number | null
  price_per_pack: string
  /** The quantity (product's unit) and $ at the packs the line counts: received once the order is received, else ordered (decision 35). */
  line_quantity: string
  line_dollars: string
}

export interface PurchaseOrder {
  id: number
  supplier_party_id: number
  supplier: PartySummary | null
  ordered_on: string
  expected_on: string | null
  reference: string | null
  off_contract: boolean
  notes: string | null
  status: OrderStatus
  received_on: string | null
  created_by: { id: number; name: string } | null
  received_by: { id: number; name: string } | null
  cancelled_by: { id: number; name: string } | null
  received_at: string | null
  cancelled_at: string | null
  /** Lead decisions 2 (gap 1): sent back on Edit; a save from an older one is 409. */
  lock_version: number
  lines: PurchaseOrderLine[]
  total_packs: number
  /** D62 §3.8: the quantity per unit (lb and gal are never added). */
  by_unit: UnitQuantity[]
  total_dollars: string
  /** The supplier's order target (decision 48) and the next multiple of it at or above the packs. */
  target: { packs: number; next_multiple: number } | null
  inserted_at: string
  updated_at: string
}

/** A quantity in one unit (D62 §3.8). */
export interface UnitQuantity {
  unit: string
  /** D65 lead decisions 1 (gap 8): "tablets" when every product in it is a Tablet; else the unit. */
  unit_label?: string
  quantity: string
}

/** D62 §3.7: a line's quantity and price are in the contract unit (whole sacks, $/sack for grain). */
export interface ContractLine {
  id: number
  product_id: number
  product: ProductSummary
  /** The supplier offer its price goes on (lead, Stop 2 note 3). */
  offer_id: number | null
  quantity: number
  price: string
  /** D62 §3.7: `packs` (grain: whole sacks, $/sack) or `lb` (hops: lb, $/lb, figures by weight). */
  contract_unit?: 'packs' | 'lb'
  /** The product's unit (lb). */
  unit?: string
  contracted: number
  contracted_dollars: string
  /** The line offer's pack: on order and received are converted to it by weight (amendment 17a; may be 10.5). */
  pack_name: string
  pack_size: string
  on_order: number
  received: number
  received_dollars: string
  /** Contracted − received; negative when over. */
  remaining: number
  over_by: number | null
}

export interface Contract {
  id: number
  supplier_party_id: number
  supplier: PartySummary | null
  year: number
  notes: string | null
  created_by: { id: number; name: string } | null
  lines: ContractLine[]
  /** What's still owed over the lines (= the Shortfall), and what's over, never netted (gap 3). */
  remaining: number
  over: number
  /** D62 §3.7: the hop lines' remaining and over, in lb (`remaining`/`over` are the grain lines' sacks). */
  remaining_lb?: number
  over_lb?: number
  /** Why it can't be deleted (gap 18); null when it can. */
  delete_blocked: string | null
  /** Lead decisions 2 (gap 2): sent back on Edit; a save from an older one is 409. */
  lock_version: number
  inserted_at: string
  updated_at: string
}

export interface ShortfallRow {
  product_id: number
  display_name: string
  /** The line's pack ("sack"): the figures are in it. */
  pack_name: string
  /** D62 §3.7: a hop line's figures are in lb. */
  contract_unit?: 'packs' | 'lb'
  unit?: string
  contracted: number
  received: number
  short: number
}

export interface ReorderRow {
  product_id: number
  product: ProductSummary
  min_on_hand_packs: number
  /** The reorder offer (the latest order's while active, else the first active); null: no offer. */
  offer: (SupplierOffer & { label: string }) | null
  /** Usable (not expired) on hand in the product's unit. */
  on_hand: string | null
  on_hand_packs: string | null
  /** On open order lines (any offer); `on_order_packs` is it in the reorder offer's packs (item 20). */
  on_order: string | null
  on_order_packs: number | null
  to_order: number | null
  below_minimum: boolean
}

export interface InventoryTotalsRow {
  product_id: number
  display_name: string
  ingredient: string
  manufacturer: string
  category: string
  /** D62 lead decisions 1, gap 4: the category filter and the Form column. */
  category_id: number
  category_key: string | null
  form: string | null
  unit: string
  /** D65: "tablets" for `each` on a Tablet product. */
  unit_label?: string
  quantity: string
  expired: string
  /** The quantity ÷ the pack size when all its stocked lots share one pack, else null. */
  pack_name: string | null
  packs: string | null
  /** null when no lot has a value (gap 5). */
  value: string | null
  per_unit: string | null
  estimated: boolean
  unvalued_quantity: string
}

export interface InventoryTotals {
  as_of: string
  rows: InventoryTotalsRow[]
  /** D62 §3.8: $ over everything, quantities per unit. */
  total: { by_unit: (UnitQuantity & { expired: string })[]; value: string }
}

export interface OrderTotalsRow {
  order_id: number
  line_id: number
  ordered_on: string
  supplier_id: number
  supplier: string
  reference: string | null
  product: string
  status: OrderStatus
  pack_name: string
  packs_ordered: number
  packs_received: number | null
  unit: string
  /** D65: "tablets" for `each` on a Tablet product. */
  unit_label?: string
  quantity: string
  dollars: string
  packs: number
}

export interface OrderTotalsSum {
  /** Only meaningful when every line has the same pack; `by_pack` otherwise (D62 gap 11). */
  packs: number
  packs_ordered: number
  packs_received: number
  /** Packs per pack name, never added across names ("73 sacks · 47 boxes"). */
  by_pack: { pack_name: string; packs: number; packs_ordered: number; packs_received: number }[]
  by_unit: UnitQuantity[]
  dollars: string
}

export interface OrderTotals {
  rows: OrderTotalsRow[]
  by_supplier: (OrderTotalsSum & { supplier_id: number; supplier: string })[]
  total: OrderTotalsSum
}

export interface Batch {
  id: number
  brand_id: number
  brand: Brand | null
  batch_number: string
  status: string
  actual_og: number | null
  actual_fg: number | null
  actual_abv: number | null
  actual_volume: number | null
  ferm_start_date: string | null
  ferm_end_date: string | null
  ferm_temp: number | null
  package_date: string | null
  package_type: string | null
  rating: number | null
  tasting_notes: string | null
  notes: string | null
  brew_turns: BrewTurn[] | null
  inserted_at: string
  updated_at: string
}

export interface BrewTurn {
  id: number
  batch_id: number
  recipe_id: number
  recipe: { id: number; version: string; brand: Brand | null } | null
  turn_number: number
  brew_date: string | null
  actual_og: number | null
  actual_volume: number | null
  actual_efficiency: number | null
  notes: string | null
  inserted_at: string
  updated_at: string
}

export interface BatchLogEntry {
  id: number
  batch_id: number
  timestamp: string
  event_type: string
  gravity: number | null
  temperature: number | null
  ph: number | null
  notes: string | null
  inserted_at: string
  updated_at: string
}

export interface ApiResponse<T> {
  data: T
}

// ── Accounts / roles (D10) ──────────────────────────────────────────

export type Role = 'manager' | 'employee'

export interface Membership {
  department_id: number
  department_key: string | null
  department_name: string | null
  /** D59: Owners. Null when the department wasn't loaded. */
  owners_only?: boolean | null
  role: Role
}

export interface User {
  id: number
  email: string
  name: string | null
  active: boolean
  is_owner: boolean
  must_reset_password: boolean
  schedulable?: boolean
  // D33: 'device' for a shared tablet account; every human is 'person'.
  kind?: 'person' | 'device'
  home_department_id?: number | null
  // D37: a staff code is set (the code itself comes only from GET /api/users/:id/staff_code).
  has_staff_code?: boolean
  memberships: Membership[] | null
  // D58 §3.3, on `/api/users` rows (Users & Roles) only: what the signed-in
  // owner or manager may do with this person.
  can_edit?: boolean
  can_deactivate?: boolean
  addable_departments?: { key: string; name: string }[]
  inserted_at: string
  updated_at: string
}

export interface Department {
  id: number
  name: string
  key: string
  color?: string | null
  assignable?: boolean
  // D59: false for a department that isn't on the schedule (Owners).
  scheduling?: boolean
  // D59: only owners add or remove members; always employee.
  owners_only?: boolean
}

export interface Capabilities {
  modules: string[]
  manages_departments: string[]
  can_manage_users: boolean
  pending_owner_reviews: number
  // D44 §2.6: pending, current time off of one's own or reviewable (0 on a device).
  pending_time_off?: number
  // D33: present for a shared device only.
  kind?: 'device'
  home_department?: string
}

export interface Me {
  user: User
  capabilities: Capabilities
  // D33: sees Admin → Shared devices (owner, or manager of a device's home department).
  shared_devices?: boolean
  // D37: sees and sets Taproom staff codes in the user dialog (owners, Taproom managers).
  staff_codes?: boolean
  // D37: the Buy-a-Beer Board's History tab, import and export (owners, Taproom managers).
  beer_board_manage?: boolean
  // D41: the task boards this person can open, in department order.
  task_boards?: TaskBoardEntry[]
  // D53 Part 2: the Idea Boards this person can open, departments then Company.
  idea_boards?: IdeaBoardEntry[]
  // D43: the theme that applies here (the person's, or a shared tablet's own).
  color_mode?: ColorMode
  // D49: the Brewery board's "Show planned batches" (per person).
  show_planned_batches?: boolean
  // D58: each board's saved settings (`{ brewery: { span: 7 } }`), only what was changed.
  board_settings?: Record<string, Record<string, unknown>>
}

/**
 * D41: one of `/api/me`'s `task_boards`. `manage`: History and Edit Daily
 * items. Owners also get `{ key: 'all', name: 'All departments' }` last (no
 * color): the All departments view, not a board.
 */
export interface TaskBoardEntry {
  key: string
  name: string
  color?: string | null
  manage: boolean
  /** D59: false on a board that isn't on the schedule (Owners); absent on All departments. */
  scheduling?: boolean
}

// ── Shared devices (D33) ────────────────────────────────────────────

export interface DeviceTablet {
  id: number
  name: string
  paired_by: AuditActor | null
  paired_at: string
  last_seen_at: string | null
  revoked_at: string | null
}

export interface SharedDevice {
  id: number
  name: string
  active: boolean
  home_department_id: number
  home_department: Department | null
  // D43: the theme its tablets show.
  color_mode: ColorMode
  // D50: the device's own "Show planned batches" (the Brewery board and the Gantt's Task list).
  show_planned_batches?: boolean
  tokens: DeviceTablet[] | null
  inserted_at: string
}

export interface AuditActor {
  id: number
  email: string
  name: string | null
}

export interface AuditEntry {
  id: number
  action: string
  detail: Record<string, unknown>
  actor: AuditActor | null
  target: AuditActor | null
  inserted_at: string
}

// ── Scheduling (D11) ────────────────────────────────────────────────

export interface Position {
  id: number
  name: string
  group: string | null
  active: boolean
  department_id: number | null
  color_shade: number | null // HSL lightness (0..1) of the dept hue; null = auto
}

export interface ShiftUser {
  id: number
  email: string
  name: string | null
}

export type ShiftStatus = 'draft' | 'published'

export interface RosterEntry {
  id: number
  name: string
  departments: string[]
}

export interface ShiftTemplate {
  id: number
  position_id: number
  name: string
  start_time: string // "HH:MM:SS" (Denver wall clock)
  end_time: string
}

export interface ScheduleTemplateItem {
  id: number
  position_id: number
  position: Position | null
  assignee_id: number | null
  day_index: number
  start_time: string
  end_time: string
  notes: string | null
}

export interface ScheduleTemplate {
  id: number
  name: string
  kind: 'week' | 'day'
  items: ScheduleTemplateItem[]
  inserted_at: string
  updated_at: string
}

export interface AppNotification {
  id: number
  event: string
  title: string
  body: string | null
  data: Record<string, unknown>
  read_at: string | null
  inserted_at: string
}

export type NotificationPrefs = Record<string, Record<string, boolean>>

// ── Messaging (D23) ─────────────────────────────────────────────────

export interface Channel {
  key: string
  name: string
  kind: 'all' | 'managers' | 'department'
  unread: number
  // D33: false for a shared device (read-only channels).
  can_post?: boolean
}

export interface ChatMessage {
  id: number
  channel_key: string
  body: string
  user: { id: number; name: string | null; email: string } | null
  inserted_at: string
}

export interface CalendarFeed {
  subject_type: 'user' | 'department' | 'all'
  subject_id: number | null
  label: string
  token: string
  path: string
}

export type TimeOffType = 'pto' | 'sick' | 'unpaid' | 'personal'
export type TimeOffStatus = 'pending' | 'approved' | 'denied' | 'cancelled'

export interface TimeOffRequest {
  id: number
  user_id: number
  user: ShiftUser | null
  type: TimeOffType
  starts_at: string
  ends_at: string
  all_day: boolean
  note: string | null
  status: TimeOffStatus
  reviewer_note: string | null
  reviewed_at: string | null
  reviewed_by_id: number | null
  reviewed_by: ShiftUser | null
  inserted_at: string
}

export type AvailabilityKind = 'unavailable' | 'preferred'

export interface AvailabilitySlot {
  id: number
  user_id: number
  user: ShiftUser | null
  weekday: number // 0=Sun..6=Sat (Denver)
  kind: AvailabilityKind
  all_day: boolean
  start_time: string | null // "HH:MM:SS" (Denver wall clock)
  end_time: string | null
  note: string | null
  inserted_at: string
}

// D32 — schedule events: on the schedule with no assignee or position.
export type EventFrequency = 'weekly' | 'monthly_weekday'

export interface EventSeries {
  id: number
  frequency: EventFrequency
  interval: number
  weekdays: number[] | null // ISO 1 = Mon … 7 = Sun (weekly)
  week_of_month: number | null // 1–4, or -1 = last (monthly)
  weekday: number | null // ISO weekday (monthly)
  start_date: string
  until_date: string | null
  count: number | null
  generated_through: string | null
}

export interface ScheduleEvent {
  id: number
  department_id: number
  department: Department | null
  title: string
  notes: string | null
  all_day: boolean
  starts_at: string
  ends_at: string // exclusive; for all-day events, local midnight after the last day
  status: ShiftStatus
  created_by_id: number | null
  series_id: number | null
  series_exception: boolean
  series: EventSeries | null
  inserted_at: string
  updated_at: string
}

export interface Shift {
  id: number
  department_id: number
  department: Department | null
  position_id: number
  position: Position | null
  assignee_id: number | null
  assignee: ShiftUser | null
  starts_at: string
  ends_at: string
  status: ShiftStatus
  notes: string | null
  inserted_at: string
  updated_at: string
}

// D37: Buy-a-Beer Board
export interface BeerBoardEntry {
  id: number
  recipient_name: string
  purchaser_name: string
  beers_remaining: number
  moved_off_board_at: string
  imported_at: string | null
}

export interface BeerBoardEvent {
  id: number
  entry_id: number
  action: 'created' | 'redeemed' | 'edited' | 'deleted'
  actor_name: string | null
  on_shared_device: boolean
  recipient_name: string
  purchaser_name: string
  beers_before: number
  beers_after: number
  source: string | null
  inserted_at: string
}

/** D37 import: one validated file row (spreadsheet row number; header = row 1). */
export interface ImportRow {
  row: number
  recipient_name: string
  purchaser_name: string
  beers: number
  moved_off_board_at: string | null
}

/** One member of an import duplicate group: a board entry ("b:<id>") or a file row ("r:<row>"). */
export interface ImportGroupItem {
  id: string
  source: 'board' | 'file'
  row: number | null
  entry_id: number | null
  recipient_name: string
  purchaser_name: string
  beers: number
  moved_off_board_at: string | null
  imported_at: string | null
}

/** Board entries and file rows that share a For name (spec §3.6 step 3). */
export interface ImportGroup {
  key: string
  name: string
  total: number
  combinable: boolean
  combined_purchaser: string
  items: ImportGroupItem[]
}

export interface ImportPreview {
  mode: 'add' | 'replace'
  file_name: string
  errors: { row: number | null; message: string }[]
  /** Headers of the file's columns the import doesn't use (DEV pass 1 G5). */
  ignored_columns: string[]
  rows: ImportRow[]
  new: ImportRow[]
  groups: ImportGroup[]
  board: { count: number; beers: number }
  signature: string | null
}

export type ImportResolution =
  | { choice: 'allow' }
  | { choice: 'combine'; purchaser_name: string }
  | { choice: 'pick'; keep: string[] }

export interface ImportResult {
  imported: number
  combined: number
  deleted: number
  skipped: number
  removed: number
}

/** A board write's answer; `recorded_as` names the staff-code owner on a shared device. */
export interface BeerBoardWriteResult {
  data: BeerBoardEntry | null
  removed: boolean
  recorded_as?: string
}

// ── Brewery task board (D38) ────────────────────────────────────────

export type CompletedDisplay = 'planned_day' | 'completed_day' | 'both'

/**
 * One card on the board. A task can show on two days (spec §7), so `key`
 * ("<task_id>:<day>", "<task_id>:future" or "<task_id>:unfinished") is the
 * card's identity, not `id`.
 */
/** D53: one person on a task or a series. */
export interface TaskPerson {
  id: number
  name: string
}

export interface TaskCardData {
  key: string
  day: string // a date, "future" or "unfinished"
  id: number
  title: string
  notes: string | null
  due_on: string | null
  position: number
  /** The first of `assignees`, kept for one release (D53). Only a linked task's dialog reads them. */
  assignee_id: number | null
  assignee_name: string | null
  /** D53: everyone on it, first first. Read it through `cardPeople` (an API on the old version has none). */
  assignees?: TaskPerson[]
  done: boolean
  completed_at: string | null
  completed_on: string | null
  completed_display: CompletedDisplay | null
  completed_by_id: number | null
  completed_by_name: string | null
  created_by_id: number | null
  created_by_name: string | null
  /** Tags: "planned Mon 10/12", "done Wed 10/14", "from Future". */
  planned_on: string | null
  done_on: string | null
  from_future: boolean
  /** Can't be dragged or moved (a finished task shown on the day it was done). */
  locked: boolean
  /** Open and planned before today (the amber edge). */
  overdue: boolean
  /** D39: one occurrence of a recurring task (the date its rule made it for), and changed on its own. */
  series_id: number | null
  series_date: string | null
  series_exception: boolean
  /** D39 G2: the series has ended here and nothing open comes after it (no Stop repeating). */
  series_last: boolean
  /** D49 §3.12: made from a production step (null for the board's own tasks). */
  production: TaskProduction | null
  /** D53 §4.7: made by Send to task list (null otherwise; absent on an API before D53 Part 2). */
  from_idea?: FromIdea | null
  inserted_at: string
  updated_at: string
}

/**
 * D53 §4.7: the card a task came from. `link` is false (and `board`,
 * `card_id` null) when the card was deleted for good or this person can't
 * open its board; the title still shows.
 */
export interface FromIdea {
  title: string
  /** The card's board ("Taproom"); null once the card is deleted for good. */
  board_name: string | null
  board: string | null
  card_id: number | null
  link: boolean
}

/** D49: a linked task's step and batch (`batch_id` null for a standalone CIP). */
export type TestResult = 'pass' | 'fail'

export interface TaskProduction {
  step_id: number
  batch_id: number | null
  batch_status: string | null
  planned: boolean
  /** What the prompts name: "FDH", "Galactic P1" (null for a standalone CIP). */
  step_name: string
  batch_label: string | null
  /** D56 §3.2: the step's Pass / Fail (null without one; absent before D56). */
  result?: TestResult | null
  /** D56 decision 14: a failed test's retest day, null when it continued as planned. */
  retest_on?: string | null
  /** Its retest is done: Mark not done is refused until that's undone. */
  retest_done?: boolean
}

/** D39 `GET /api/boards/:dept/tasks/:id/series`: the rule and the open occurrences after this one. */
export interface TaskSeriesData {
  id: number
  title: string
  notes: string | null
  assignee_id: number | null
  assignees?: TaskPerson[]
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'annually'
  month_rule: 'day' | 'weekday' | null
  interval: number
  weekdays: number[] | null
  day_of_month: number | null
  week_of_month: number | null
  weekday: number | null
  start_date: string
  until_date: string | null
  count: number | null
  /** Open, after this one, not changed on their own. */
  later_open: number
  /** Open, after this one, changed on their own. */
  later_changed: number
  /**
   * D42 §2.6: asked with the dialog's repeat params, what saving them "This
   * and all following" would do: no rule change, an Ends-only change (the
   * end moves), or a rule change (a split); and what it removes.
   */
  change?: SeriesChange
}

export interface SeriesChange {
  kind: 'same' | 'ends' | 'rule'
  removes_open: number
  removes_changed: number
  /** D53 §4.8: a rule change only. Removed ones holding their own notes; kept ones moved off their day. */
  removes_noted?: number
  keeps_moved?: number
}

export interface HeaderShift {
  id: number
  position_name: string
  starts_at: string
  ends_at: string
}

export interface DayHeaderData {
  people: { user_id: number; name: string; hours: number; shifts: HeaderShift[] }[]
  open_shifts: HeaderShift[]
  events: { id: number; title: string; all_day: boolean; starts_at: string; ends_at: string }[]
  no_one_scheduled: boolean
}

export interface DailyCardItem {
  daily_item_id: number
  name: string
  active: boolean
  checked: boolean
  completed_by_name: string | null
  completed_at: string | null
}

/** An item on the Daily card's list (D38 §3.6 `/api/boards/:dept/daily_items`). */
export interface DailyItem {
  id: number
  name: string
  position: number
  active: boolean
  /** D42: retired items only: never ticked, so it can be deleted. */
  deletable?: boolean
}

/** One Brewery task board change-log entry (D38 History). Daily entries have no task_id. */
export interface TaskEvent {
  id: number
  task_id: number | null
  action:
    | 'created'
    | 'edited'
    | 'assigned'
    | 'unassigned'
    | 'moved'
    | 'completed'
    | 'uncompleted'
    | 'deleted'
    | 'daily_ticked'
    | 'daily_unticked'
    | 'item_added'
    | 'item_renamed'
    | 'item_retired'
    | 'item_reordered'
    | 'stopped_repeating' // D39
    | 'item_restored' // D39
    | 'made_repeating' // D39 Decision 6
    | 'item_deleted' // D42
  /** The task's title (or the Daily item's name) when it happened. */
  title: string
  actor_id: number | null
  actor_name: string | null
  on_shared_device: boolean
  detail: Record<string, unknown>
  inserted_at: string
}

/** A page of History, with names for the user and Daily item ids its details mention. */
export interface TaskEventPage {
  data: TaskEvent[]
  names: { users: Record<string, string>; items: Record<string, string> }
  page: number
  total: number
  per_page: number
}

export interface DailyCardData {
  date: string
  done: number
  total: number
  items: DailyCardItem[]
}

export interface BoardDay {
  date: string
  /** D59: null on a board that isn't on the schedule (Owners): no header at all. */
  header: DayHeaderData | null
  cards: TaskCardData[]
  daily: DailyCardData
}

export interface TaskBoardData {
  from: string
  to: string
  today: string
  days: BoardDay[]
  unfinished: TaskCardData[]
  future: TaskCardData[]
  /** D59: the owners the assignee picker offers too, on an owners-only board only (else empty). */
  owners?: { id: number; name: string }[]
}

/** D41 §3.6: a card on the All departments view, with its board's key. */
export type AllBoardCard = TaskCardData & { department: string }

/** D41: one board's Daily count on a day of the All departments view. */
export interface DailyCount {
  department: string
  done: number
  total: number
}

/** D41 §3.6: `GET /api/boards/all/tasks`, every board together (owners, read-only). */
export interface AllBoardData {
  from: string
  to: string
  today: string
  days: { date: string; cards: AllBoardCard[]; daily_counts: DailyCount[] }[]
  unfinished: AllBoardCard[]
  future: AllBoardCard[]
}

// ── Idea Boards (D53 Part 2) ────────────────────────────────────────

/** One of `/api/me`'s `idea_boards`: `manage` = lock, delete for good, labels; `history` = History. */
export interface IdeaBoardEntry {
  key: string
  name: string
  color?: string | null
  manage: boolean
  history: boolean
  /** D59: an owners-only department's board: its lock words say "an owner". */
  owners_only?: boolean
}

export interface IdeaPerson {
  id: number
  name: string
}

export interface IdeaLabel {
  id: number
  name: string
  color: string
  position: number
}

/** A card's chip for a task sent from it (§4.7). */
export interface IdeaSentTask {
  id: number
  state: 'on_list' | 'done' | 'repeating' | 'removed'
  task_id: number | null
  task_series_id: number | null
  task_title: string
  department: { key: string; name: string } | null
  due_on: string | null
  completed_on: string | null
  series: { frequency: string; interval: number } | null
  sent_at: string
}

/** What a card's face shows. */
export interface IdeaCardFace {
  id: number
  list_id: number
  title: string
  due_on: string | null
  position: number
  locked: boolean
  locked_at: string | null
  locked_by: IdeaPerson | null
  archived_at: string | null
  label_ids: number[]
  assignee_ids: number[]
  assignees: IdeaPerson[]
  checklist: { done: number; total: number }
  note_count: number
  watching: boolean
  sent_tasks: IdeaSentTask[]
}

export interface IdeaChecklistItem {
  id: number
  text: string
  position: number
  done: boolean
  done_at: string | null
  done_by: IdeaPerson | null
}

export interface IdeaNote {
  id: number
  body: string
  author: IdeaPerson | null
  author_id: number | null
  inserted_at: string
  edited_at: string | null
}

export interface IdeaListData {
  id: number
  name: string
  position: number
  locked: boolean
  locked_at: string | null
  locked_by: IdeaPerson | null
  archived_at: string | null
  cards: IdeaCardFace[] | null
}

/** A card for its dialog: the face plus everything else. */
export interface IdeaCard extends IdeaCardFace {
  description: string | null
  list: Omit<IdeaListData, 'cards'>
  labels: IdeaLabel[]
  created_by: IdeaPerson | null
  inserted_at: string
  updated_at: string
  checklist_items: IdeaChecklistItem[]
  notes: IdeaNote[]
}

export interface IdeaBoardData {
  lists: IdeaListData[]
  labels: IdeaLabel[]
}

export interface IdeaArchived {
  lists: (Omit<IdeaListData, 'cards'> & { card_count: number })[]
  cards: { id: number; title: string; description?: string | null; archived_at: string; list: { id: number; name: string } }[]
}

export interface IdeaEvent {
  id: number
  card_id: number | null
  list_id: number | null
  action: string
  title: string | null
  actor_id: number | null
  actor_name: string | null
  detail: Record<string, unknown>
  inserted_at: string
}

/** `GET …/cards/:id/send_to_tasks`: what the Send dialog offers. */
export interface IdeaSendOptions {
  departments: { key: string; name: string; assignee_ids: number[]; left_off: IdeaPerson[] }[]
  due_on: string | null
  checklist: { total: number; open: number }
  already_sent: boolean
}

/** D64 §6.3: a cell count as the Brinks tab shows it. */
export interface YeastCountSummary {
  id: number
  counted_on: string
  viable_millions_per_ml: string
  viability_pct: string
  /** Decision 18: the latest harvest's day when this count is from before it; null otherwise. */
  before_harvest_on: string | null
}

/** D64 §4.5: the yeast in a brink now. */
export interface YeastContents {
  harvest_id: number
  lock_version: number
  on_hand_lb: string
  generation: number
  coferment: boolean
  product_ids: number[]
  /** The strains' codes ("US-05"), in order. */
  strains: string[]
  harvested_on: string | null
  first_harvested_on: string | null
  sources: { batch_id: number | null; batch: string | null; generation: number | null; strains: string[]; lb: string; occurred_on: string }[]
  count: YeastCountSummary | null
}

/** D64 §4.4, §6.3: a brink with its state (`GET /api/yeast/brinks`). */
export interface YeastBrink {
  id: number
  name: string
  empty_weight_lb: string | null
  position: number
  active: boolean
  dirty: boolean
  dirty_since: string | null
  /** It has records, so it can be retired but not deleted. */
  has_history: boolean
  /** An open "Count YB2" task. */
  recount_due: boolean
  /** An open "Clean YB2" task. */
  clean_due: boolean
  yeast: YeastContents | null
}

/** D64 §6.3: one record in a brink's History. */
export interface YeastHistoryRecord {
  id: number
  status: 'in_brink' | 'emptied' | 'voided'
  generation: number
  coferment: boolean
  emptied_on: string | null
  entries: {
    id: number
    kind: 'harvested' | 'pitched' | 'dumped' | 'adjusted'
    quantity_lb: string
    occurred_on: string
    batch: string | null
    generation: number | null
    strains: string[]
    note: string | null
    entered_by: { id: number; name: string } | null
    device: string | null
    /** Stop 3: the Yeast harvest step a harvest came from. */
    step_id?: number | null
    /** Stop 3 (spec §8, A8): Remove is offered to this viewer (a pitch, dump or adjustment, the record's latest, theirs or a manager's). */
    can_remove?: boolean
  }[]
  counts: { id: number; counted_on: string; viable_millions_per_ml: string; viability_pct: string; note: string | null; entered_by: { id: number; name: string } | null; can_change?: boolean }[]
}
