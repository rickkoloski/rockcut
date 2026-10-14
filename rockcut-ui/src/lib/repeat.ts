// D39: repeat rules for recurring Brewery tasks (spec §3.10). D32's event
// rules stay in events.ts; this reuses its date helpers.
import { formatDateKey, isoWeekday, weekOfMonth } from './events'
import type { TaskSeriesData } from './types'

export type TaskFrequency = 'never' | 'weekly' | 'monthly' | 'quarterly' | 'annually'
export type MonthRule = 'day' | 'weekday'
export type RepeatEnds = 'never' | 'until' | 'count'

export interface TaskRule {
  frequency: TaskFrequency
  /** Weekly: every 1–4 weeks. */
  interval: number
  /** Weekly: ISO weekdays, 1 = Mon … 7 = Sun. */
  weekdays: number[]
  /** Monthly and quarterly: day N, or the nth weekday. */
  monthRule: MonthRule
  dayOfMonth: number
  /** 1–4, or -1 for the last. */
  weekOfMonth: number
  weekday: number
  ends: RepeatEnds
  until: string // "" = none
  count: string // "" = none
  /** The first day: annually repeats its month and day. */
  startDate: string
}

export const MAX_REPEAT_COUNT = 400
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "1st", "2nd", "3rd", "4th", "11th", "22nd", "31st"; -1 is "last". */
export function ordinal(n: number): string {
  if (n === -1) return 'last'
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

/** "Wed", "Mon and Thu", "Mon, Wed and Fri". */
function dayList(days: number[]): string {
  const names = [...days].sort((a, b) => a - b).map((d) => WEEKDAY_SHORT[d - 1])
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** The rule a day suggests (spec "Creating one"): its weekday, its date, which weekday of the month it is. */
export function defaultRule(day: string, frequency: TaskFrequency = 'never'): TaskRule {
  return {
    frequency,
    interval: 1,
    weekdays: [isoWeekday(day)],
    monthRule: 'day',
    dayOfMonth: Number(day.slice(8, 10)),
    weekOfMonth: weekOfMonth(day),
    weekday: isoWeekday(day),
    ends: 'never',
    until: '',
    count: '',
    startDate: day,
  }
}

/** Point a rule at a new first day, keeping its frequency and end. */
export function reseed(rule: TaskRule, day: string): TaskRule {
  return { ...defaultRule(day, rule.frequency), interval: rule.interval, monthRule: rule.monthRule, ends: rule.ends, until: rule.until, count: rule.count }
}

/** "on the 14th", "on the 31st (or the last day)", "on the last Friday". */
function monthPart(r: TaskRule): string {
  if (r.monthRule === 'weekday') return `on the ${ordinal(r.weekOfMonth)} ${WEEKDAY_LONG[r.weekday - 1]}`
  return `on the ${ordinal(r.dayOfMonth)}${r.dayOfMonth > 28 ? ' (or the last day)' : ''}`
}

/**
 * The summary line: "Repeats every week on Wed", "Repeats every other week on
 * Mon and Thu, until Mar 31, 2027", "Repeats every month on the 31st (or the
 * last day)", "Repeats every 3 months on the 15th", "Repeats every year on Mar 1, 3 times".
 */
export function taskRepeatSummary(r: TaskRule): string {
  let base: string
  switch (r.frequency) {
    case 'never':
      return 'Does not repeat'
    case 'weekly': {
      if (r.weekdays.length === 0) return 'Pick at least one day'
      const every = r.interval === 1 ? 'every week' : r.interval === 2 ? 'every other week' : `every ${r.interval} weeks`
      base = `Repeats ${every} on ${dayList(r.weekdays)}`
      break
    }
    case 'monthly':
      base = `Repeats every month ${monthPart(r)}`
      break
    case 'quarterly':
      base = `Repeats every 3 months ${monthPart(r)}`
      break
    case 'annually': {
      const month = MONTHS[Number(r.startDate.slice(5, 7)) - 1]
      const day = Number(r.startDate.slice(8, 10))
      base = `Repeats every year on ${month} ${day}${month === 'Feb' && day === 29 ? ' (Feb 28 in other years)' : ''}`
      break
    }
  }
  if (r.ends === 'until' && r.until) return `${base}, until ${formatDateKey(r.until)}`
  if (r.ends === 'count' && r.count) return `${base}, ${r.count} ${Number(r.count) === 1 ? 'time' : 'times'}`
  return base
}

/** Why the rule can't be saved, or null. */
export function ruleProblem(r: TaskRule): string | null {
  if (r.frequency === 'never') return null
  if (r.frequency === 'weekly' && r.weekdays.length === 0) return 'Pick at least one day to repeat on'
  if (r.ends === 'until' && !r.until) return 'Pick the last date for the repeat'
  if (r.ends === 'until' && r.until < r.startDate) return 'The last date must be on or after the day'
  if (r.ends === 'count') {
    const n = Number(r.count)
    if (!Number.isInteger(n) || n < 1 || n > MAX_REPEAT_COUNT) return `Repeat 1 to ${MAX_REPEAT_COUNT} times`
  }
  return null
}

/**
 * Flat API params (D39: `repeat`, `repeat_*`). Only the rule's own options,
 * and both ends, the unused one blank (R1): a blank is "none", so Ends =
 * Never clears an end the series had.
 */
export function taskRepeatParams(r: TaskRule): Record<string, unknown> {
  if (r.frequency === 'never') return { repeat: 'never' }
  const p: Record<string, unknown> = { repeat: r.frequency }
  if (r.frequency === 'weekly') {
    p.repeat_weekdays = [...r.weekdays].sort((a, b) => a - b)
    p.repeat_interval = r.interval
  } else if (r.frequency !== 'annually') {
    p.repeat_month_rule = r.monthRule
    if (r.monthRule === 'day') p.repeat_day_of_month = r.dayOfMonth
    else {
      p.repeat_week_of_month = r.weekOfMonth
      p.repeat_weekday = r.weekday
    }
  }
  p.repeat_until = r.ends === 'until' ? r.until : ''
  p.repeat_count = r.ends === 'count' ? Number(r.count) : ''
  return p
}

/** A saved series as a TaskRule. */
export function ruleFromTaskSeries(s: Pick<TaskSeriesData, 'frequency' | 'month_rule' | 'interval' | 'weekdays' | 'day_of_month' | 'week_of_month' | 'weekday' | 'until_date' | 'count' | 'start_date'>): TaskRule {
  const base = defaultRule(s.start_date, s.frequency)
  return {
    ...base,
    interval: s.interval ?? 1,
    weekdays: s.weekdays ?? base.weekdays,
    monthRule: s.month_rule ?? 'day',
    dayOfMonth: s.day_of_month ?? base.dayOfMonth,
    weekOfMonth: s.week_of_month ?? base.weekOfMonth,
    weekday: s.weekday ?? base.weekday,
    ends: s.until_date ? 'until' : s.count ? 'count' : 'never',
    until: s.until_date ?? '',
    count: s.count ? String(s.count) : '',
  }
}

/** Do two rules make the same dates (compared through what the API is sent)? */
export function sameRule(a: TaskRule, b: TaskRule): boolean {
  const pa = taskRepeatParams(a)
  const pb = taskRepeatParams(b)
  return JSON.stringify(pa, Object.keys(pa).sort()) === JSON.stringify(pb, Object.keys(pb).sort())
}

/**
 * D42 §2.6: `next` differs from `original` only in Ends (Never / On a date /
 * After N times). Saved, it moves the series' end and changes no rule.
 */
export function endsOnlyChange(next: TaskRule, original: TaskRule): boolean {
  return !sameRule(next, original) && sameRule({ ...next, ends: original.ends, until: original.until, count: original.count }, original)
}

/**
 * A rule as History stores it (`detail.repeat`, snake_case, only its own
 * options) back as a summary. `startDate` gives an annual rule its day.
 */
export function summaryFromDetail(d: Record<string, unknown> | undefined, startDate: string | null | undefined): string {
  if (!d || typeof d.frequency !== 'string') return ''
  return taskRepeatSummary(
    ruleFromTaskSeries({
      frequency: d.frequency as TaskSeriesData['frequency'],
      month_rule: (d.month_rule as MonthRule) ?? null,
      interval: (d.interval as number) ?? 1,
      weekdays: (d.weekdays as number[]) ?? null,
      day_of_month: (d.day_of_month as number) ?? null,
      week_of_month: (d.week_of_month as number) ?? null,
      weekday: (d.weekday as number) ?? null,
      until_date: (d.until as string) ?? null,
      count: (d.count as number) ?? null,
      start_date: startDate ?? '2000-01-01',
    }),
  )
}

/**
 * Decision 2 (Matt, 2026-10-12): the confirm before later occurrences are
 * removed. With some changed on their own there are two choices.
 */
export function removeLaterWording(laterOpen: number, laterChanged: number) {
  const occ = (n: number) => `${n} later ${n === 1 ? 'occurrence' : 'occurrences'}`
  if (laterChanged > 0)
    return {
      message: `Removes ${occ(laterOpen)}. ${laterChanged} ${laterChanged === 1 ? 'was' : 'were'} changed on ${laterChanged === 1 ? 'its' : 'their'} own.`,
      keep: `Remove ${laterOpen}, keep the ${laterChanged} changed on ${laterChanged === 1 ? 'its' : 'their'} own`,
      removeAll: `Remove all ${laterOpen + laterChanged}`,
    }
  return { message: `Removes ${occ(laterOpen)}.`, keep: null, removeAll: 'Remove' }
}
