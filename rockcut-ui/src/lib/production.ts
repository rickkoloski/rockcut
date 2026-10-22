// D46 production setup: tanks and out-of-service periods, phases and step
// types, process templates (spec §3.2–§3.4). Types, API paths, error text,
// the phase palette and the template preview's model.

import { contrastText } from './colors'

// ── Types (the API's JSON) ──

export type TankKind = 'unitank' | 'fermenter' | 'serving'
export type TankLocation = 'brewhouse' | 'walk_in'
export type OutageState = 'now' | 'coming' | 'past'

export interface Outage {
  id: number
  tank_id: number
  starts_on: string
  ends_on: string | null
  reason: string | null
  state: OutageState
  /** "Tue Oct 27 – Mon Nov 2" / "Tue Oct 27 – until further notice" */
  label: string
}

export interface Tank {
  id: number
  name: string
  kind: TankKind
  capacity_bbl: number
  location: TankLocation
  position: number
  notes: string | null
  retired_at: string | null
  outages: Outage[]
}

export interface Phase {
  id: number
  name: string
  color: string
  position: number
  retired_at: string | null
}

export type Behavior = 'plain' | 'brew' | 'set_temp' | 'transfer' | 'split' | 'cip' | 'package'

export interface StepType {
  id: number
  name: string
  full_name: string | null
  behavior: Behavior
  built_in: boolean
  starts_phase_id: number | null
  on_task_list: boolean
  position: number
  retired_at: string | null
}

export interface TemplateIssue {
  code: string
  message: string
}

export interface TemplateSummary {
  id: number
  name: string
  notes: string | null
  position: number
  retired_at: string | null
  step_count: number
  issues: TemplateIssue[]
}

export interface TemplateStep {
  id: number
  step_type_id: number | null
  marker: boolean
  /** "FDH", "Dry hop - #2", "Set temp - 52°", or a marker's phase. */
  name: string
  type_name: string | null
  full_name: string | null
  behavior: Behavior | null
  phase_id: number | null
  day_offset: number
  vessel_index: number
  detail: string | null
  temperature: number | null
  /** How a Split's parts leave (D47): "Split - Transfer" / "Split - Filter". Null for anything else. */
  split_method: SplitMethod | null
  /** A Package that takes only some of the beer (D47): not the tank's exit. */
  package_partial: boolean
  notes: string | null
  on_task_list: boolean
  position: number
  ramp_group: string | null
}

export type SplitMethod = 'transfer' | 'filter'

export const SPLIT_METHODS: { key: SplitMethod; label: string }[] = [
  { key: 'transfer', label: 'Transfer' },
  { key: 'filter', label: 'Filter' },
]

export type Answer = 'move_all' | 'move_only'

export interface TemplateLink {
  id: number
  from_step_id: number
  to_step_id: number
  default_answer: Answer
}

export interface Template extends TemplateSummary {
  steps: TemplateStep[]
  links: TemplateLink[]
}

// ── The schedule (D47, `GET /schedule`) ──

export type BatchStatus = 'planned' | 'fermenting' | 'completed' | 'dumped' | string

export interface Person {
  id: number
  name: string
}

/** A batch step, or a standalone CIP & Sanitize (`batch_id` null, `tank_id` set). */
export interface SchedStep {
  id: number
  batch_id: number | null
  tank_id: number | null
  step_type_id: number | null
  marker: boolean
  /** "FDH - #2", "Set temp - 52°", "Brew day - 1 of 2", or a marker's phase. */
  name: string
  type_name: string | null
  full_name: string | null
  behavior: Behavior | null
  /** The batch's first Brew day (its number prompt). */
  first_brew: boolean
  phase_id: number | null
  vessel_index: number
  detail: string | null
  temperature: number | null
  split_method: SplitMethod | null
  package_partial: boolean
  notes: string | null
  on_task_list: boolean
  position: number
  due_on: string
  done_on: string | null
  done_by: Person | null
  assignee_id: number | null
  assignee: Person | null
  /** D48: added to the batch (not from its template). */
  added: boolean
  /** D48: the Set temp steps of one ramp share it. */
  ramp_group: string | null
}

export interface SchedLink {
  id: number
  from_step_id: number
  to_step_id: number
  default_answer: Answer
}

export interface SchedBatch {
  id: number
  brand_id: number
  brand_name: string | null
  batch_number: string | null
  /** "P2" while planned. */
  p_number: string | null
  /** "Galactic #40" / "Altruism P1" */
  label: string
  status: BatchStatus
  volume_bbl: number | null
  template_id: number | null
  template_name: string | null
  brew_two_days: boolean
  /** D48: a split's part: its parent, its number (1…n) and the parent's Split step that fills it. */
  split_parent_id: number | null
  part_number: number | null
  split_step_id: number | null
  vessels: { vessel_index: number; tank_id: number | null }[]
  steps: SchedStep[]
  links: SchedLink[]
}

export interface TankStatusLine {
  tank_id: number
  state: 'out' | 'in_use' | 'sani' | 'dirty' | 'clean'
  /** "Day 18 · Fermentation · 68° · set to 58° today" */
  line: string
  /** Red: a late temperature change, or dirty with no CIP planned. */
  alert: boolean
  batch_id: number | null
  batch_label: string | null
}

export interface Flag {
  key: string
  kind: 'tank_overlap' | 'too_big' | 'dirty_fill' | 'dirty_no_cip' | 'out_of_order' | 'no_tank' | 'out_of_service' | 'cip_with_beer'
  message: string
  signature: string
  batch_ids: number[]
  tank_id: number | null
  signed_off: boolean
  was_signed_off: boolean
  signoff: { user_id: number | null; user_name: string | null; note: string | null; signed_at: string } | null
}

export interface Schedule {
  from: string
  to: string
  today: string
  tanks: Tank[]
  phases: Phase[]
  step_types: StepType[]
  batches: SchedBatch[]
  cips: SchedStep[]
  statuses: TankStatusLine[]
  flags: Flag[]
  next_batch_number: string
  brewers: Person[]
  /** D48 §3.8: brewers' clean / dirty marks on tanks. */
  condition_marks: ConditionMark[]
}

export interface ConditionMark {
  id: number
  tank_id: number
  state: 'clean' | 'dirty'
  marked_on: string
  note: string | null
  user_id: number | null
  user_name: string | null
  inserted_at: string
}

// ── API ──

export const PROD = '/api/production'
export const prodPath = (...parts: (string | number)[]) => [PROD, ...parts].join('/')

export const TANKS_KEY = ['production', 'tanks']
export const PHASES_KEY = ['production', 'phases']
export const STEP_TYPES_KEY = ['production', 'step_types']
export const TEMPLATES_KEY = ['production', 'templates']
export const templateKey = (id: number | string) => ['production', 'template', String(id)]
/** Every schedule query starts with this; writes invalidate it. */
export const SCHEDULE_KEY = ['production', 'schedule']
export const scheduleKey = (from: string, to: string) => [...SCHEDULE_KEY, from, to]

type ErrorBody = { error?: string; message?: string; errors?: Record<string, string[]> }

const bodyOf = (err: unknown): ErrorBody | undefined =>
  (err as { response?: { data?: ErrorBody } })?.response?.data

/** Field errors from a 422 changeset: `{ name: "A tank named FV1 already exists." }`. */
export function fieldErrors(err: unknown): Record<string, string> {
  const errors = bodyOf(err)?.errors ?? {}
  return Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, v[0]]))
}

/** A 404 on a row the page still shows: someone else removed it (D46 QA minor 3). */
export const GONE_MESSAGE = 'This was removed by someone else. Reload to see the latest.'

/** One sentence for an alert: a coded 422's message, else the first field error. */
export function prodError(err: unknown): string {
  if ((err as { response?: { status?: number } })?.response?.status === 404) return GONE_MESSAGE
  const body = bodyOf(err)
  if (body?.message) return body.message
  const first = Object.values(body?.errors ?? {})[0]?.[0]
  if (first) return first
  if ((err as { response?: { status?: number } })?.response?.status === 403) return 'You can’t change this.'
  return 'Something went wrong. Try again.'
}

// ── Labels ──

export const TANK_KINDS: { key: TankKind; label: string }[] = [
  { key: 'unitank', label: 'Unitank' },
  { key: 'fermenter', label: 'Fermenter' },
  { key: 'serving', label: 'Serving tank' },
]

export const TANK_LOCATIONS: { key: TankLocation; label: string }[] = [
  { key: 'brewhouse', label: 'Brewhouse' },
  { key: 'walk_in', label: 'Walk-in' },
]

export const kindLabel = (k: TankKind) => TANK_KINDS.find((x) => x.key === k)?.label ?? k
export const locationLabel = (l: TankLocation) => TANK_LOCATIONS.find((x) => x.key === l)?.label ?? l

export const BEHAVIOR_LABELS: Record<Behavior, string> = {
  plain: 'Plain step',
  brew: 'Brew day',
  set_temp: 'Sets the temperature',
  transfer: 'Moves the beer to another tank',
  split: 'Splits the batch',
  cip: 'Cleans the tank',
  package: 'Packages the beer',
}

/** A batch number as saved: leading `#`s and spaces dropped ("#40" is 40), as the API does (D47 QA M2). */
export const plainBatchNumber = (n: string) => n.replace(/^[#\s]+/, '').trim()

/** "First tank", "After transfer 2". */
export const vesselLabel = (k: number) => (k === 0 ? 'First tank' : `After transfer ${k}`)

export const answerLabel = (a: Answer) => (a === 'move_all' ? 'moves with it' : 'stays')

// ── Dates ("YYYY-MM-DD", local, no time zone) ──

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const parts = (key: string) => key.split('-').map(Number) as [number, number, number]

/** "Oct 27" */
export function monthDay(key: string): string {
  const [, m, d] = parts(key)
  return `${MONTHS[m - 1]} ${d}`
}

/** "Tue Oct 27" */
export function weekdayMonthDay(key: string): string {
  const [y, m, d] = parts(key)
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]} ${MONTHS[m - 1]} ${d}`
}

/** "Oct 27–Nov 2", "Oct 27–30", "Oct 27", or "from Oct 20". */
export function shortPeriod(o: Pick<Outage, 'starts_on' | 'ends_on'>): string {
  if (!o.ends_on) return `from ${monthDay(o.starts_on)}`
  if (o.ends_on === o.starts_on) return monthDay(o.starts_on)
  const [, m1] = parts(o.starts_on)
  const [, m2, d2] = parts(o.ends_on)
  return `${monthDay(o.starts_on)}–${m1 === m2 ? d2 : monthDay(o.ends_on)}`
}

/**
 * The tank's current period, or else its next one, and how many more are
 * coming after it (the list's "Out Oct 27–Nov 2 +1" chip).
 */
export function headlineOutage(tank: Tank): { outage: Outage; more: number } | null {
  const ahead = tank.outages.filter((o) => o.state !== 'past').sort((a, b) => a.starts_on.localeCompare(b.starts_on))
  return ahead.length ? { outage: ahead[0], more: ahead.length - 1 } : null
}

export const OUTAGE_GROUPS: { state: OutageState; label: string }[] = [
  { state: 'now', label: 'Now' },
  { state: 'coming', label: 'Coming up' },
  { state: 'past', label: 'Past' },
]

// ── Phase palette ──

export interface PaletteColor {
  token: string
  label: string
  light: string
  dark: string
}

/** The 12 phase colors: the mockup's nine, then rose, apricot and slate. */
export const PHASE_PALETTE: PaletteColor[] = [
  { token: 'brew', label: 'Lavender', light: '#D6C3E3', dark: '#5C4A6B' },
  { token: 'lag', label: 'Pale green', light: '#DCE8C8', dark: '#3B4D30' },
  { token: 'ferm', label: 'Green', light: '#B5D39D', dark: '#4F7A3B' },
  { token: 'dr', label: 'Gold', light: '#EBCF84', dark: '#8C7330' },
  { token: 'crash', label: 'Sky', light: '#A3C2D6', dark: '#3F6A84' },
  { token: 'lager', label: 'Steel blue', light: '#86A9C2', dark: '#34566E' },
  { token: 'cond', label: 'Teal', light: '#9FCFC3', dark: '#2F6157' },
  { token: 'carb', label: 'Amber', light: '#E2B866', dark: '#8D6A26' },
  { token: 'pack', label: 'Sand', light: '#CDBFA6', dark: '#6B6250' },
  { token: 'rose', label: 'Rose', light: '#E6B3BE', dark: '#7A4552' },
  { token: 'apricot', label: 'Apricot', light: '#F2C49B', dark: '#8A5530' },
  { token: 'slate', label: 'Slate', light: '#B9BFCB', dark: '#4E5566' },
]

/** The hatch color for a CIP & Sanitize day. */
export const CIP_COLOR = { light: '#AEB8A6', dark: '#4A5745' }

export type Mode = 'light' | 'dark'

/** A phase token's fill for the mode and the text color that reads on it. */
export function phaseFill(token: string | null | undefined, mode: Mode): { bg: string; fg: string } {
  const c = PHASE_PALETTE.find((p) => p.token === token) ?? PHASE_PALETTE[PHASE_PALETTE.length - 1]
  const bg = mode === 'dark' ? c.dark : c.light
  return { bg, fg: contrastText(bg) }
}

// ── Template editor ──

/** Each step's incoming links, "after FDH · moves with it". */
export function linkSummary(t: Template, step: TemplateStep): string[] {
  const byId = new Map(t.steps.map((s) => [s.id, s]))
  return t.links
    .filter((l) => l.to_step_id === step.id)
    .map((l) => `after ${byId.get(l.from_step_id)?.name ?? '?'} · ${answerLabel(l.default_answer)}`)
}

/** The tanks a template uses: 0 … the highest vessel_index. */
export const templateVessels = (t: Template) => Math.max(0, ...t.steps.map((s) => s.vessel_index))

// ── Tanks in a template (D46 QA M1) ──

const isTransfer = (s: TemplateStep) => s.behavior === 'transfer'

/** The tanks entries can go in: the first, and each one a Transfer/Filter starts. */
export function existingTanks(t: Template, excludeId?: number): number[] {
  const started = t.steps.filter((s) => isTransfer(s) && s.id !== excludeId).map((s) => s.vessel_index)
  return [0, ...[...new Set(started)].sort((a, b) => a - b)]
}

/**
 * The tank a new Transfer/Filter on `day` moves the beer into: one past the
 * highest tank used on an earlier day (the API's rule). `excludeId` is the
 * transfer being edited.
 */
export function newTankFor(t: Template, day: number, excludeId?: number): number {
  const others = t.steps.filter((s) => s.id !== excludeId)
  let k = Math.max(0, ...others.filter((s) => s.day_offset < day).map((s) => s.vessel_index)) + 1
  // Another transfer the same day into k goes first; this one goes on from there.
  while (others.some((s) => isTransfer(s) && s.day_offset === day && s.vessel_index === k)) k++
  return k
}

/**
 * Why a Transfer/Filter can't go on `day` (D47 task 0, N1, the API's rule):
 * transfers stay in day order. A new one can't come before an existing one;
 * `entry` (being edited, it keeps its tank) can't pass the ones either side.
 */
export function transferOrderError(t: Template, day: number | null, entry?: TemplateStep | null): string | null {
  if (day == null) return null
  const others = t.steps.filter((s) => isTransfer(s) && s.id !== entry?.id)
  const before = entry ? others.filter((s) => s.vessel_index < entry.vessel_index && s.day_offset > day) : others.filter((s) => s.day_offset > day)
  const after = entry ? others.filter((s) => s.vessel_index > entry.vessel_index && s.day_offset < day) : []
  const message = (side: string, d: number) => `Transfers stay in day order: this one would come ${side} the transfer on day ${d}.`
  if (before.length) return message('before', Math.min(...before.map((s) => s.day_offset)))
  if (after.length) return message('after', Math.max(...after.map((s) => s.day_offset)))
  return null
}

/** "the first tank", "the tank after transfer 2" (in a sentence). */
export const vesselPhrase = (k: number) => (k === 0 ? 'the first tank' : `the tank after transfer ${k}`)

/** Every entry reachable along links from `id` (`dir` "down" = what follows it). */
export function reachable(t: Template, id: number, dir: 'down' | 'up'): Set<number> {
  const seen = new Set<number>()
  const todo = [id]
  while (todo.length) {
    const at = todo.pop()!
    for (const l of t.links) {
      const [from, to] = dir === 'down' ? [l.from_step_id, l.to_step_id] : [l.to_step_id, l.from_step_id]
      if (from === at && !seen.has(to)) {
        seen.add(to)
        todo.push(to)
      }
    }
  }
  return seen
}

/**
 * What a ramp's fields make: the temperatures, or why not (D46 QA minor 5:
 * the limits are the API's, 28–80°F in whole degrees, at least 1° a day and
 * at most the gap between start and target, D47 task 0 N3).
 */
export function rampPlan(start: string, target: string, change: string): { temps: number[] } | { error: string } {
  const whole = (v: string) => /^\d+$/.test(v.trim())
  if (![start, target].every(whole) || [start, target].some((v) => Number(v) < 28 || Number(v) > 80))
    return { error: 'Start and target are whole degrees from 28 to 80°F.' }
  if (!whole(change) || Number(change) < 1) return { error: 'The change per day is a whole number of degrees, at least 1.' }
  if (Number(start) === Number(target)) return { error: 'The start and target temperatures are the same.' }
  const gap = Math.abs(Number(start) - Number(target))
  if (Number(change) > gap) return { error: `The change per day can be at most ${gap}°, the gap between start and target.` }
  return { temps: rampTemperatures(Number(start), Number(target), Number(change)) }
}

/** The temperatures of a ramp, as the API makes them (its last is the target). */
export function rampTemperatures(start: number, target: number, change: number): number[] {
  if (!(change > 0) || start === target) return []
  const dir = target < start ? -1 : 1
  const temps: number[] = []
  for (let t = start; dir * (target - t) > 0; t += dir * change) temps.push(t)
  return [...temps, target]
}

// ── Preview: one sample batch, phase colors over time ──

export interface PreviewBar {
  vessel: number
  /** First and last day (offsets) the beer is in this tank, CIP included. */
  start: number
  end: number
  /** Phase id (or null) for each day start…end. */
  phases: (number | null)[]
  /** CIP & Sanitize days in this tank. */
  cipDays: number[]
  /** Task-list steps: their day and name. */
  dots: { day: number; name: string }[]
}

/**
 * The template as one batch: a bar per tank from the day the beer arrives
 * (day 0, or its Transfer) to its last entry (its CIP), coloured by the phase
 * in force each day. A phase starts on its entry's day and lasts until the
 * next one, whichever tank it's in (the beer carries it through a transfer).
 */
export function previewBars(t: Template): PreviewBar[] {
  const ordered = [...t.steps].sort((a, b) => a.day_offset - b.day_offset || a.position - b.position)
  const lastDay = Math.max(0, ...ordered.map((s) => s.day_offset))
  const phaseOn: (number | null)[] = []
  let current: number | null = null
  for (let d = 0; d <= lastDay; d++) {
    for (const s of ordered) if (s.day_offset === d && s.phase_id) current = s.phase_id
    phaseOn.push(current)
  }

  const bars: PreviewBar[] = []
  for (let k = 0; k <= templateVessels(t); k++) {
    const entry = k === 0 ? 0 : ordered.find((s) => s.behavior === 'transfer' && s.vessel_index === k)?.day_offset
    const own = ordered.filter((s) => s.vessel_index === k)
    if (entry === undefined && own.length === 0) continue
    const start = entry ?? Math.min(...own.map((s) => s.day_offset))
    const end = Math.max(start, ...own.map((s) => s.day_offset))
    bars.push({
      vessel: k,
      start,
      end,
      phases: phaseOn.slice(start, end + 1),
      cipDays: own.filter((s) => s.behavior === 'cip').map((s) => s.day_offset),
      dots: own.filter((s) => s.on_task_list && s.behavior !== 'cip').map((s) => ({ day: s.day_offset, name: s.name })),
    })
  }
  return bars
}
