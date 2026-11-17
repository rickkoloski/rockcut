// Per-user, per-day time-off markers for the schedule grid — with start/end
// times for partial-day (timed) requests, clipped to each Denver day. A
// multi-day timed range reads "from 3:30 PM" on the first day, "until 12:00 PM"
// on the last, and all-day in between.
import { addDaysKey, formatDayHeading, formatTime, localDayKey } from './datetime'
import type { TimeOffRequest, TimeOffType } from './types'

export interface OffMarker {
  request: TimeOffRequest // D44: the chip opens its dialog
  label: string
  type: TimeOffType
  allDay: boolean
  pending: boolean // an unapproved request — shown, but not a hard conflict
}

/** Label for one request on one day, given its first/last Denver day keys. */
function labelForDay(r: TimeOffRequest, dayKey: string, startKey: string, endKey: string): string {
  if (r.all_day) return 'Off'
  if (startKey === endKey) return `Off ${formatTime(r.starts_at)}–${formatTime(r.ends_at)}`
  if (dayKey === startKey) return `Off from ${formatTime(r.starts_at)}`
  if (dayKey === endKey) return `Off until ${formatTime(r.ends_at)}`
  return 'Off' // interior day of a multi-day timed range
}

/** userId → (Denver day key → markers) for approved + pending requests
 *  overlapping [mondayKey, +6]. Denied/cancelled are ignored. */
export function buildOffMarkers(
  timeOff: TimeOffRequest[],
  mondayKey: string,
): Map<number, Map<string, OffMarker[]>> {
  const sunday = addDaysKey(mondayKey, 6)
  const m = new Map<number, Map<string, OffMarker[]>>()

  for (const r of timeOff) {
    if (r.status !== 'approved' && r.status !== 'pending') continue
    const pending = r.status === 'pending'
    const startKey = localDayKey(r.starts_at)
    const endKey = localDayKey(r.ends_at)
    let d = startKey < mondayKey ? mondayKey : startKey
    const end = endKey > sunday ? sunday : endKey

    const dayMap = m.get(r.user_id) ?? new Map<string, OffMarker[]>()
    while (d <= end) {
      const arr = dayMap.get(d) ?? []
      arr.push({ request: r, label: labelForDay(r, d, startKey, endKey), type: r.type, allDay: r.all_day, pending })
      dayMap.set(d, arr)
      d = addDaysKey(d, 1)
    }
    m.set(r.user_id, dayMap)
  }

  return m
}

// ---- D44: the time off dialog, the Time off page and View Schedule's agenda ----

export const TIME_OFF_TYPES: { value: TimeOffType; label: string }[] = [
  { value: 'pto', label: 'Vacation (PTO)' },
  { value: 'sick', label: 'Sick' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'personal', label: 'Personal' },
]
export const TIME_OFF_TYPE_LABEL = Object.fromEntries(TIME_OFF_TYPES.map((t) => [t.value, t.label])) as Record<TimeOffType, string>

function dayLabel(iso: string): string {
  return formatDayHeading(`${localDayKey(iso)}T12:00:00Z`)
}

/** "Mon, Sep 23 (all day)", "Mon, Sep 23 – Wed, Sep 25", "Mon, Sep 23, 3:30–5:00 PM", or across days. */
export function describeTimeOffRange(r: TimeOffRequest): string {
  if (r.all_day) {
    const s = dayLabel(r.starts_at)
    const e = dayLabel(r.ends_at)
    return s === e ? `${s} (all day)` : `${s} – ${e}`
  }
  if (localDayKey(r.starts_at) === localDayKey(r.ends_at)) {
    return `${dayLabel(r.starts_at)}, ${formatTime(r.starts_at)}–${formatTime(r.ends_at)}`
  }
  return `${dayLabel(r.starts_at)}, ${formatTime(r.starts_at)} – ${dayLabel(r.ends_at)}, ${formatTime(r.ends_at)}`
}

/**
 * D44 §2.4: past when its last day off (the Colorado day of `ends_at`) is
 * before today. The API's `TimeOff.past?/1` is the same rule.
 */
export function isPastTimeOff(r: TimeOffRequest, todayKey = localDayKey(new Date().toISOString())): boolean {
  return localDayKey(r.ends_at) < todayKey
}

/**
 * Who sees Approve / Deny / Remove on a request they can see (D25): an owner,
 * or a manager of any department. The API only returns a manager's own
 * requests and those of people they manage, all of which they may review;
 * it decides, and the UI hides only what it would refuse. Never on a past one.
 */
export function canReviewTimeOff(
  r: TimeOffRequest,
  who: { isOwner: boolean; managesDepartments: string[] },
  todayKey?: string,
): boolean {
  return (who.isOwner || who.managesDepartments.length > 0) && !isPastTimeOff(r, todayKey)
}

export interface AgendaTimeOffFilters {
  /** The agenda's department filter (a department key), if any. */
  departmentKey?: string | null
  /** A position filter is on: time off rows hide (they have no position). */
  positionFiltered?: boolean
  /** "Open shifts only": time off rows hide. */
  openOnly?: boolean
  /** "My shifts": only this person's time off. */
  mineUserId?: number | null
  /** The person's department keys (from the roster). */
  departmentsOf?: (userId: number) => string[]
}

/**
 * D44 §2.8: Colorado day key → the approved and pending requests covering it,
 * for days `from`–`to` (inclusive; either may be empty for open-ended). A
 * multi-day request shows on each of its days. Denied and cancelled requests
 * aren't shown. Within a day: by start, then name.
 */
export function agendaTimeOffByDay(
  timeOff: TimeOffRequest[],
  from: string,
  to: string,
  f: AgendaTimeOffFilters = {},
): Map<string, TimeOffRequest[]> {
  const out = new Map<string, TimeOffRequest[]>()
  if (f.positionFiltered || f.openOnly) return out

  for (const r of timeOff) {
    if (r.status !== 'approved' && r.status !== 'pending') continue
    if (f.mineUserId != null && r.user_id !== f.mineUserId) continue
    if (f.departmentKey && !(f.departmentsOf?.(r.user_id) ?? []).includes(f.departmentKey)) continue

    const startKey = localDayKey(r.starts_at)
    const endKey = localDayKey(r.ends_at)
    let d = from && startKey < from ? from : startKey
    const last = to && endKey > to ? to : endKey
    while (d <= last) {
      const list = out.get(d) ?? []
      list.push(r)
      out.set(d, list)
      d = addDaysKey(d, 1)
    }
  }

  const name = (r: TimeOffRequest) => r.user?.name || r.user?.email || ''
  for (const list of out.values()) {
    list.sort((a, b) => a.starts_at.localeCompare(b.starts_at) || name(a).localeCompare(name(b)))
  }
  return out
}

/** The agenda row's time: "All day", or the request's hours on that day. */
export function agendaTimeOffLabel(r: TimeOffRequest, dayKey: string): string {
  const label = labelForDay(r, dayKey, localDayKey(r.starts_at), localDayKey(r.ends_at))
  if (label === 'Off') return 'All day'
  const hours = label.replace(/^Off /, '')
  return hours.charAt(0).toUpperCase() + hours.slice(1)
}
