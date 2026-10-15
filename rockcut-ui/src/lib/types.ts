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
  sort_order: number
  field_definitions: CategoryFieldDefinition[] | null
  inserted_at: string
  updated_at: string
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
  category: { id: number; name: string } | null
  notes: string | null
  lots: IngredientLotSummary[] | null
  inserted_at: string
  updated_at: string
}

export interface IngredientLotSummary {
  id: number
  lot_number: string | null
  supplier: string | null
  received_date: string | null
  status: string
  alpha_acid: number | null
  color_lovibond: number | null
  attenuation: number | null
  extract_potential_fgdb: number | null
  maltster: string | null
  moisture_perc: number | null
  protein_perc: number | null
  diastatic_power_linter: number | null
  order_name: string | null
  order_unit_size: string | null
  notes: string | null
}

export interface IngredientLot {
  id: number
  ingredient_id: number
  ingredient: { id: number; name: string; category: { id: number; name: string } | null } | null
  lot_number: string | null
  supplier: string | null
  received_date: string | null
  status: string
  alpha_acid: number | null
  color_lovibond: number | null
  attenuation: number | null
  extract_potential_fgdb: number | null
  maltster: string | null
  protein_perc: number | null
  moisture_perc: number | null
  diastatic_power_linter: number | null
  order_name: string | null
  order_unit_size: string | null
  properties: Record<string, unknown> | null
  notes: string | null
  inserted_at: string
  updated_at: string
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
  inserted_at: string
  updated_at: string
}

export interface Department {
  id: number
  name: string
  key: string
  color?: string | null
  assignable?: boolean
}

export interface Capabilities {
  modules: string[]
  manages_departments: string[]
  can_manage_users: boolean
  pending_owner_reviews: number
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
  // D43: the theme that applies here (a shared tablet's own, also during "Sign in as me").
  color_mode?: ColorMode
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
export interface TaskCardData {
  key: string
  day: string // a date, "future" or "unfinished"
  id: number
  title: string
  notes: string | null
  due_on: string | null
  position: number
  assignee_id: number | null
  assignee_name: string | null
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
  inserted_at: string
  updated_at: string
}

/** D39 `GET /api/boards/:dept/tasks/:id/series`: the rule and the open occurrences after this one. */
export interface TaskSeriesData {
  id: number
  title: string
  notes: string | null
  assignee_id: number | null
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
  header: DayHeaderData
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
