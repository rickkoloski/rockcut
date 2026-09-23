// Per-user, per-day time-off markers for the schedule grid — with start/end
// times for partial-day (timed) requests, clipped to each Denver day. A
// multi-day timed range reads "from 3:30 PM" on the first day, "until 12:00 PM"
// on the last, and all-day in between.
import { addDaysKey, formatTime, localDayKey } from './datetime'
import type { TimeOffRequest, TimeOffType } from './types'

export interface OffMarker {
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
      arr.push({ label: labelForDay(r, d, startKey, endKey), type: r.type, allDay: r.all_day, pending })
      dayMap.set(d, arr)
      d = addDaysKey(d, 1)
    }
    m.set(r.user_id, dayMap)
  }

  return m
}
