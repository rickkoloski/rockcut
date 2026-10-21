// D47 §3.6 the Gantt: the date math and layout as pure functions (plan
// "lib/gantt.ts"). Dates are "YYYY-MM-DD" Colorado day keys; a day's column
// is its index from the view's first day.

import { addDaysKey } from './datetime'
import type { Flag, SchedBatch, SchedStep, Tank } from './production'

// ── Days ──

const utc = (key: string) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)))

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / 86_400_000)

export const minKey = (a: string, b: string) => (a < b ? a : b)
export const maxKey = (a: string, b: string) => (a > b ? a : b)

/** 0 = Sunday … 6 = Saturday. */
export const weekday = (key: string) => new Date(utc(key)).getUTCDay()
export const isWeekend = (key: string) => [0, 6].includes(weekday(key))

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "Tue Oct 27" */
export function dayLabel(key: string): string {
  return `${WEEKDAYS[weekday(key)]} ${MONTHS[Number(key.slice(5, 7)) - 1]} ${Number(key.slice(8, 10))}`
}

/** The months the view crosses: where each starts (column) and its name ("Oct 2026" for January or the first). */
export function monthLabels(from: string, days: number): { index: number; label: string }[] {
  const out: { index: number; label: string }[] = []
  for (let i = 0; i < days; i++) {
    const key = addDaysKey(from, i)
    if (i === 0 || key.endsWith('-01')) {
      const m = Number(key.slice(5, 7))
      out.push({ index: i, label: i === 0 || m === 1 ? `${MONTHS[m - 1]} ${key.slice(0, 4)}` : MONTHS[m - 1] })
    }
  }
  return out
}

// ── The range and zoom (§3.6 toolbar) ──

export const ZOOMS = [2, 6, 12] as const
export type Zoom = (typeof ZOOMS)[number]
export const MIN_DAYS = 7
export const MAX_DAYS = 730
export const STEP_DAYS = 28

export interface Range {
  from: string
  to: string
}

/** The default view: a week back, then 12 weeks on. */
export const defaultRange = (today: string): Range => ({ from: addDaysKey(today, -7), to: addDaysKey(today, 77) })

/** A range kept to 7–730 days (counting both ends), `to` moving to fit. */
export function clampRange(r: Range): Range {
  const days = daysBetween(r.from, r.to) + 1
  if (days < MIN_DAYS) return { from: r.from, to: addDaysKey(r.from, MIN_DAYS - 1) }
  if (days > MAX_DAYS) return { from: r.from, to: addDaysKey(r.from, MAX_DAYS - 1) }
  return r
}

/** ‹ 4 wks / 4 wks ›: the same length, moved. */
export const shiftRange = (r: Range, days: number): Range => ({ from: addDaysKey(r.from, days), to: addDaysKey(r.to, days) })

/** "Today": the same length, starting a week back. */
export function rangeAroundToday(r: Range, today: string): Range {
  const len = daysBetween(r.from, r.to)
  const from = addDaysKey(today, -7)
  return { from, to: addDaysKey(from, len) }
}

/** Pixels per day: the zoom's weeks across the timeline's width, never under 10 (narrower, it scrolls). */
export const dayWidth = (timelineWidth: number, zoom: Zoom) => Math.max(10, Math.floor(timelineWidth / (zoom * 7)))

/** Initials above the dots need room (§3.6: hidden below 14 px per day). */
export const showInitials = (dayPx: number) => dayPx >= 14

// ── Parts (one per vessel: the beer in one tank; as the API's `Parts`) ──

export interface Part {
  key: string
  batch: SchedBatch
  vessel: number
  tankId: number | null
  /** The first Brew day (the first tank) or the Transfer/Filter into it. */
  fill: SchedStep | null
  /** A full Package or a Split in it, or the next Transfer/Filter. */
  exit: SchedStep | null
  cip: SchedStep | null
  /** First and last day: its fill (or first step) to its last step, CIP included. */
  start: string
  end: string
  /** Its vessel's steps, plus the step that empties it. */
  steps: SchedStep[]
  planned: boolean
}

const order = (a: SchedStep, b: SchedStep) => a.due_on.localeCompare(b.due_on) || a.position - b.position || a.id - b.id

export function firstBrew(steps: SchedStep[]): SchedStep | null {
  return steps.filter((s) => s.behavior === 'brew').sort((a, b) => a.id - b.id)[0] ?? null
}

export function buildParts(batch: SchedBatch): Part[] {
  const brew = firstBrew(batch.steps)
  return batch.vessels.map(({ vessel_index: k, tank_id }) => {
    const own = batch.steps.filter((s) => s.vessel_index === k)
    const fill = k === 0 ? brew : (batch.steps.filter((s) => s.behavior === 'transfer' && s.vessel_index === k).sort(order)[0] ?? null)
    const exit =
      batch.steps
        .filter(
          (s) =>
            (s.behavior === 'package' && s.vessel_index === k && !s.package_partial) ||
            (s.behavior === 'split' && s.vessel_index === k) ||
            (s.behavior === 'transfer' && s.vessel_index === k + 1),
        )
        .sort(order)[0] ?? null
    const steps = (exit && !own.includes(exit) ? [...own, exit] : own).sort(order)
    const cip = own.filter((s) => s.behavior === 'cip').sort(order).at(-1) ?? null
    const days = steps.map((s) => s.due_on).sort()
    return {
      key: `${batch.id}.${k}`,
      batch,
      vessel: k,
      tankId: tank_id,
      fill,
      exit,
      cip,
      start: fill?.due_on ?? days[0],
      end: days.at(-1) ?? fill?.due_on ?? '',
      steps,
      planned: batch.status === 'planned',
    }
  })
}

/** "Galactic #40 · 20 bbl", "· after transfer" for a later tank. */
export function partLabel(p: Part): string {
  const vol = p.batch.volume_bbl != null ? ` · ${p.batch.volume_bbl} bbl` : ''
  return `${p.batch.label}${vol}${p.vessel > 0 ? ' · after transfer' : ''}`
}

// ── Phases over time ──

/**
 * The phase in force on each day of a batch, as the bar colors it: each
 * step that starts a phase starts it on the day it was done (or is planned),
 * a marker on its day; it lasts until the next one, whichever tank it's in.
 */
export function phaseAt(batch: SchedBatch): (day: string) => number | null {
  const starts = batch.steps
    .filter((s) => s.phase_id != null)
    .map((s) => ({ day: s.done_on ?? s.due_on, phase: s.phase_id as number, s }))
    .sort((a, b) => a.day.localeCompare(b.day) || a.s.position - b.s.position || a.s.id - b.s.id)
  return (day) => {
    let phase: number | null = null
    for (const x of starts) {
      if (x.day > day) break
      phase = x.phase
    }
    return phase
  }
}

export interface Segment {
  /** Columns from the view's first day. */
  from: number
  to: number
  /** A phase id, or 'cip' for a CIP day (hatched). */
  fill: number | 'cip' | null
}

/** A part's bar within the view as runs of the same fill, CIP days hatched. */
export function segments(part: Part, viewFrom: string, viewDays: number, phase: (day: string) => number | null): Segment[] {
  const cipDays = new Set(part.steps.filter((s) => s.behavior === 'cip' && s.vessel_index === part.vessel).map((s) => s.due_on))
  const first = Math.max(0, daysBetween(viewFrom, part.start))
  const last = Math.min(viewDays - 1, daysBetween(viewFrom, part.end))
  const out: Segment[] = []
  for (let i = first; i <= last; i++) {
    const day = addDaysKey(viewFrom, i)
    const fill = cipDays.has(day) ? 'cip' : phase(day)
    const prev = out.at(-1)
    if (prev && prev.fill === fill && prev.to === i - 1) prev.to = i
    else out.push({ from: i, to: i, fill })
  }
  return out
}

// ── Stacking (§3.6: nothing draws on top of anything else) ──

/** A track for each item (inclusive days), the first free one, by start; and how many tracks. */
export function assignTracks<T extends { start: string; end: string }>(items: T[]): { tracks: Map<T, number>; count: number } {
  const ends: string[] = []
  const tracks = new Map<T, number>()
  for (const item of [...items].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))) {
    let t = ends.findIndex((end) => end < item.start)
    if (t < 0) t = ends.length
    ends[t] = item.end
    tracks.set(item, t)
  }
  return { tracks, count: Math.max(1, ends.length) }
}

// ── Dots ──

export type DotState = 'done' | 'late' | 'today' | 'planned'

export function dotState(step: SchedStep, today: string): DotState {
  if (step.done_on) return 'done'
  if (step.due_on < today) return 'late'
  if (step.due_on === today) return 'today'
  return 'planned'
}

/** The dots under a part's bar: its task-list steps and CIPs, with their place among the dots of the same day. */
export function partDots(part: Part): { step: SchedStep; slot: number; of: number }[] {
  const shown = part.steps.filter((s) => (s.on_task_list && !s.marker) || s.behavior === 'cip')
  const byDay = new Map<string, SchedStep[]>()
  for (const s of shown) byDay.set(s.due_on, [...(byDay.get(s.due_on) ?? []), s])
  return shown.map((s) => {
    const same = byDay.get(s.due_on)!
    return { step: s, slot: same.indexOf(s), of: same.length }
  })
}

// ── Flags on a bar (§3.6 badge) ──

/** The flags about a part: about its batch, and its tank (or no tank). */
export function partFlags(part: Part, flags: Flag[]): Flag[] {
  return flags.filter((f) => f.batch_ids.includes(part.batch.id) && (f.tank_id == null || f.tank_id === part.tankId))
}

/** "!", "!3", "✓" (all signed off), or null. */
export function badgeText(flags: Flag[]): string | null {
  if (!flags.length) return null
  const open = flags.filter((f) => !f.signed_off).length
  if (!open) return '✓'
  return open === 1 ? '!' : `!${open}`
}

/** The toolbar chip: "6 flags · 1 signed off". */
export function flagChip(flags: Flag[]): string {
  const signed = flags.filter((f) => f.signed_off).length
  const n = flags.length
  return `${n} flag${n === 1 ? '' : 's'}${signed ? ` · ${signed} signed off` : ''}`
}

// ── Rows ──

export const TRACK_H = 54
export const STEP_ROW_H = 28
/** In a track: the bar, the initials under it, the dots under them. */
export const BAR_TOP = 4
export const BAR_H = 26
export const INITIALS_TOP = 31
export const DOT_TOP = 41
export const DOT = 11

export interface Row {
  /** A tank, or Unassigned (`tank` null). */
  tank: Tank | null
  parts: Part[]
  cips: SchedStep[]
  track: Map<Part | SchedStep, number>
  tracks: number
  /** Expanded: every step of its parts, one row each. */
  stepRows: { part: Part; step: SchedStep }[]
  top: number
  height: number
}

/** The tanks in order, then Unassigned, with their tracks, step rows and place. */
export function layoutRows(tanks: Tank[], parts: Part[], cips: SchedStep[], expanded: Set<string>): Row[] {
  const keys: (Tank | null)[] = [...tanks, null]
  let top = 0
  return keys.map((tank) => {
    const mine = parts.filter((p) => p.tankId === (tank?.id ?? null))
    const myCips = tank ? cips.filter((c) => c.tank_id === tank.id) : []
    const items: (Part | SchedStep)[] = [...mine, ...myCips]
    const spans = items.map((x) => ('key' in x ? { x, start: x.start, end: x.end } : { x, start: x.due_on, end: x.due_on }))
    const { tracks, count } = assignTracks(spans)
    const track = new Map<Part | SchedStep, number>(spans.map((s) => [s.x, tracks.get(s)!]))
    const open = expanded.has(rowKey(tank))
    const stepRows = open
      ? [...mine].sort((a, b) => a.start.localeCompare(b.start)).flatMap((part) => part.steps.map((step) => ({ part, step })))
      : []
    const height = count * TRACK_H + stepRows.length * STEP_ROW_H
    const row = { tank, parts: mine, cips: myCips, track, tracks: count, stepRows, top, height }
    top += height
    return row
  })
}

export const rowKey = (tank: Tank | null) => (tank ? String(tank.id) : 'unassigned')

// ── Remembered per person, in this browser (plan decision 6) ──

export interface GanttPrefs {
  range: Range | null
  zoom: Zoom
  collapsed: boolean
  expanded: string[]
}

const prefKey = (userId: number | string, name: string) => `rockcut.production.${userId}.${name}`

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private windows and full storage: it just isn't remembered.
  }
}

const isKey = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

/** The saved view, or the defaults (6 weeks; the left column names-only on a phone). */
export function readPrefs(userId: number | string, phone: boolean): GanttPrefs {
  let range: Range | null = null
  try {
    const r = JSON.parse(read(prefKey(userId, 'range')) ?? 'null')
    if (r && isKey(r.from) && isKey(r.to)) range = clampRange(r)
  } catch {
    range = null
  }
  const zoom = Number(read(prefKey(userId, 'zoom')))
  const collapsed = read(prefKey(userId, 'collapsed'))
  let expanded: string[] = []
  try {
    const e = JSON.parse(read(prefKey(userId, 'expanded')) ?? '[]')
    if (Array.isArray(e)) expanded = e.filter((x) => typeof x === 'string')
  } catch {
    expanded = []
  }
  return {
    range,
    zoom: (ZOOMS as readonly number[]).includes(zoom) ? (zoom as Zoom) : 6,
    collapsed: collapsed === null ? phone : collapsed === 'true',
    expanded,
  }
}

export function writePref<K extends keyof GanttPrefs>(userId: number | string, name: K, value: GanttPrefs[K]) {
  write(prefKey(userId, name), typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : JSON.stringify(value))
}
