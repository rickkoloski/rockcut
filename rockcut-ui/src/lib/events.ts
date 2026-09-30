// D32 — helpers for schedule events (Denver date keys, like the rest of the schedule).
import { addDaysKey, formatTimeRange, localDayKey, utcToLocalInput, weekdayOf } from './datetime'
import type { EventSeries, ScheduleEvent } from './types'

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const ORDINALS: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', [-1]: 'last' }

/** ISO weekday (1 = Mon … 7 = Sun) of a "YYYY-MM-DD" key. */
export function isoWeekday(dayKey: string): number {
  return weekdayOf(dayKey) || 7
}

/** Which occurrence of its weekday a date is in its month: 1–4, or -1 for a 5th (last). */
export function weekOfMonth(dayKey: string): number {
  const n = Math.ceil(Number(dayKey.slice(8, 10)) / 7)
  return n > 4 ? -1 : n
}

/** The Denver day keys an event covers (an all-day `ends_at` is exclusive). */
export function eventDayKeys(e: ScheduleEvent): string[] {
  const first = localDayKey(e.starts_at)
  const last = e.all_day
    ? addDaysKey(utcToLocalInput(e.ends_at).slice(0, 10), -1)
    : localDayKey(new Date(new Date(e.ends_at).getTime() - 1).toISOString())
  const keys: string[] = []
  for (let k = first; k <= last && keys.length < 62; k = addDaysKey(k, 1)) keys.push(k)
  return keys.length ? keys : [first]
}

/** "All day" or "7:00 PM – 9:00 PM". */
export function eventTimeLabel(e: ScheduleEvent): string {
  return e.all_day ? 'All day' : formatTimeRange(e.starts_at, e.ends_at)
}

export interface RepeatRule {
  frequency: 'weekly' | 'monthly_weekday'
  interval: number
  weekdays: number[]
  weekOfMonth: number
  weekday: number
  until: string // "" = none
  count: string // "" = none
}

/** "Every Tuesday", "Every other week on Tue, Thu", "Monthly on the 3rd Sunday", plus the end. */
export function repeatSummary(r: RepeatRule): string {
  let base: string
  if (r.frequency === 'weekly') {
    const days = [...r.weekdays].sort((a, b) => a - b)
    if (days.length === 0) return 'Pick at least one day'
    const names = days.length === 1 ? DAY_NAMES[days[0] - 1] : days.map((d) => DAY_SHORT[d - 1]).join(', ')
    base = r.interval === 2 ? `Every other week on ${names}` : `Every ${names}`
  } else {
    base = `Monthly on the ${ORDINALS[r.weekOfMonth]} ${DAY_NAMES[r.weekday - 1]}`
  }
  if (r.until) return `${base}, until ${formatDateKey(r.until)}`
  if (r.count) return `${base}, ${r.count} times`
  return `${base} (scheduled 12 months ahead)`
}

/** A saved series as a RepeatRule. */
export function ruleFromSeries(s: EventSeries): RepeatRule {
  return {
    frequency: s.frequency,
    interval: s.interval,
    weekdays: s.weekdays ?? [],
    weekOfMonth: s.week_of_month ?? 1,
    weekday: s.weekday ?? 1,
    until: s.until_date ?? '',
    count: s.count ? String(s.count) : '',
  }
}

/** Flat API params for a repeat rule (D32 API: `repeat`, `repeat_*`). */
export function repeatParams(r: RepeatRule): Record<string, unknown> {
  const p: Record<string, unknown> = { repeat: r.frequency, repeat_interval: r.frequency === 'weekly' ? r.interval : 1 }
  if (r.frequency === 'weekly') p.repeat_weekdays = r.weekdays
  else {
    p.repeat_week_of_month = r.weekOfMonth
    p.repeat_weekday = r.weekday
  }
  if (r.until) p.repeat_until = r.until
  else if (r.count) p.repeat_count = Number(r.count)
  return p
}

/** "Sep 28, 2027" for a date key. */
export function formatDateKey(key: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${key}T12:00:00Z`),
  )
}
