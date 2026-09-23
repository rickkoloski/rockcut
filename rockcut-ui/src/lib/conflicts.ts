// D24 — Scheduling conflict detection (client-side, non-blocking).
//
// Flags an assigned shift that (a) falls on a day the assignee has approved
// time off, or (b) overlaps another shift for the same assignee. Open
// (unassigned) shifts never conflict. All data needed is already loaded by the
// scheduler, so this is pure and shared by the week grid and the shift dialog.
import { addDaysKey, localDayKey, utcToLocalInput, weekdayOf } from './datetime'
import type { Shift } from './types'

export type ConflictKind = 'time_off' | 'overlap' | 'availability'

export interface ShiftConflict {
  kind: ConflictKind
  message: string
  otherShiftId?: number
}

/** Half-open interval overlap on ISO instants: [aStart,aEnd) ∩ [bStart,bEnd) ≠ ∅.
 *  Back-to-back shifts (one ends exactly as the next starts) do NOT overlap. */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd)
}

/** Denver day keys a shift touches, start day through end day (handles overnight). */
function dayKeysSpanned(startsAt: string, endsAt: string): string[] {
  const first = localDayKey(startsAt)
  const last = localDayKey(endsAt)
  const keys: string[] = []
  let d = first
  // Cap the walk so a bad range can never spin (a shift spans at most a day or two).
  for (let i = 0; i < 14 && d <= last; i++) {
    keys.push(d)
    d = addDaysKey(d, 1)
  }
  return keys.length ? keys : [first]
}

export interface ConflictCandidate {
  assigneeId: number | null
  startsAt: string
  endsAt: string
  /** A shift id to skip when checking overlaps (the one being edited). */
  excludeId?: number
}

// ── Availability (D25) — recurring weekly unavailable windows ────────

/** A normalized "unavailable" window on one weekday (0=Sun..6=Sat, Denver). */
export interface UnavailableWindow {
  weekday: number
  allDay: boolean
  startMin: number // minutes from midnight (Denver wall clock)
  endMin: number
}

/** userId -> their unavailable windows. */
export type UnavailabilityByUser = Map<number, UnavailableWindow[]>

/** Availability slot shape (structural — matches AvailabilitySlot from the API). */
interface SlotLike {
  user_id: number
  weekday: number
  kind: string
  all_day: boolean
  start_time: string | null // "HH:MM:SS"
  end_time: string | null
}

function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (Number.isNaN(h) ? 0 : h) * 60 + (Number.isNaN(m) ? 0 : m)
}

/** Build the per-user unavailable-window index from raw slots (only `unavailable`). */
export function buildUnavailability(slots: SlotLike[]): UnavailabilityByUser {
  const m: UnavailabilityByUser = new Map()
  for (const s of slots) {
    if (s.kind !== 'unavailable') continue
    const arr = m.get(s.user_id) ?? []
    arr.push({
      weekday: s.weekday,
      allDay: s.all_day,
      startMin: s.all_day ? 0 : hhmmToMin(s.start_time ?? '00:00'),
      endMin: s.all_day ? 1440 : hhmmToMin(s.end_time ?? '00:00'),
    })
    m.set(s.user_id, arr)
  }
  return m
}

/** Per-weekday local segments a shift occupies (splits an overnight shift in two). */
function shiftLocalSegments(startsAt: string, endsAt: string): Array<{ weekday: number; startMin: number; endMin: number }> {
  const sLocal = utcToLocalInput(startsAt)
  const eLocal = utcToLocalInput(endsAt)
  const sDay = sLocal.slice(0, 10)
  const eDay = eLocal.slice(0, 10)
  const sMin = hhmmToMin(sLocal.slice(11, 16))
  const eMin = hhmmToMin(eLocal.slice(11, 16))
  if (sDay === eDay) return [{ weekday: weekdayOf(sDay), startMin: sMin, endMin: eMin }]
  // Overnight: the start day through midnight, then midnight through the end day.
  return [
    { weekday: weekdayOf(sDay), startMin: sMin, endMin: 1440 },
    { weekday: weekdayOf(eDay), startMin: 0, endMin: eMin },
  ]
}

const NO_UNAVAILABILITY: UnavailabilityByUser = new Map()

/** Conflicts for a candidate shift against loaded shifts, approved time off,
 *  and (D25) the assignee's recurring unavailable windows. */
export function conflictsFor(
  candidate: ConflictCandidate,
  allShifts: Shift[],
  offDays: Map<number, Set<string>>,
  unavailability: UnavailabilityByUser = NO_UNAVAILABILITY,
): ShiftConflict[] {
  const { assigneeId, startsAt, endsAt, excludeId } = candidate
  if (assigneeId == null || !startsAt || !endsAt) return []

  const out: ShiftConflict[] = []

  // (a) Approved time off on any Denver day the shift touches.
  const off = offDays.get(assigneeId)
  if (off && dayKeysSpanned(startsAt, endsAt).some((k) => off.has(k))) {
    out.push({ kind: 'time_off', message: 'Assignee has approved time off that day' })
  }

  // (b) Double-booking: another shift for the same person overlapping in time.
  for (const s of allShifts) {
    if (s.id === excludeId) continue
    if (s.assignee_id !== assigneeId) continue
    if (rangesOverlap(startsAt, endsAt, s.starts_at, s.ends_at)) {
      out.push({ kind: 'overlap', message: 'Overlaps another shift for this employee', otherShiftId: s.id })
    }
  }

  // (c) Availability: the shift falls on a window the assignee marked unavailable.
  const windows = unavailability.get(assigneeId)
  if (windows?.length) {
    const segs = shiftLocalSegments(startsAt, endsAt)
    const hit = segs.some((seg) =>
      windows.some(
        (w) => w.weekday === seg.weekday && (w.allDay || (seg.startMin < w.endMin && w.startMin < seg.endMin)),
      ),
    )
    if (hit) out.push({ kind: 'availability', message: 'Assignee marked this time unavailable' })
  }

  return out
}

/** Conflicts for an existing shift (excludes itself from the overlap check). */
export function shiftConflicts(
  shift: Shift,
  allShifts: Shift[],
  offDays: Map<number, Set<string>>,
  unavailability: UnavailabilityByUser = NO_UNAVAILABILITY,
): ShiftConflict[] {
  return conflictsFor(
    { assigneeId: shift.assignee_id, startsAt: shift.starts_at, endsAt: shift.ends_at, excludeId: shift.id },
    allShifts,
    offDays,
    unavailability,
  )
}

/** shiftId → its conflicts, for every conflicting shift in the set. */
export function conflictMap(
  shifts: Shift[],
  offDays: Map<number, Set<string>>,
  unavailability: UnavailabilityByUser = NO_UNAVAILABILITY,
): Map<number, ShiftConflict[]> {
  const m = new Map<number, ShiftConflict[]>()
  for (const s of shifts) {
    const c = shiftConflicts(s, shifts, offDays, unavailability)
    if (c.length) m.set(s.id, c)
  }
  return m
}
