import { test, expect } from '@playwright/test'
import { buildOffWindows, conflictsFor } from '../../../src/lib/conflicts'
import { localInputToUtc } from '../../../src/lib/datetime'

// D36 item L (Matt, 2026-10-04): timed time off conflicts only with shifts
// that overlap its hours; all-day time off covers its whole Denver days.
// Pure logic: no browser, no server. Times are Denver wall clock.
const at = (local: string) => localInputToUtc(local)
const ME = 7

function off(startLocal: string, endLocal: string, allDay = false, status = 'approved') {
  return { user_id: ME, status, all_day: allDay, starts_at: at(startLocal), ends_at: at(endLocal) }
}

function timeOffConflict(timeOff: ReturnType<typeof off>[], shiftStart: string, shiftEnd: string) {
  const c = conflictsFor({ assigneeId: ME, startsAt: at(shiftStart), endsAt: at(shiftEnd) }, [], buildOffWindows(timeOff))
  return c.find((x) => x.kind === 'time_off')?.message ?? null
}

test('L1: time off 09:00–12:00 does not flag a 17:00–22:00 shift that day', () => {
  expect(timeOffConflict([off('2026-10-06T09:00', '2026-10-06T12:00')], '2026-10-06T17:00', '2026-10-06T22:00')).toBeNull()
})

test('L2: an overlapping shift is flagged "then"', () => {
  expect(timeOffConflict([off('2026-10-06T09:00', '2026-10-06T12:00')], '2026-10-06T11:00', '2026-10-06T15:00')).toBe(
    'Assignee has approved time off then',
  )
})

test('L3: all-day time off flags any shift that day, "that day"', () => {
  // Stored as 00:00–23:59 Denver, as the Time off page sends it.
  const allDay = [off('2026-10-06T00:00', '2026-10-06T23:59', true)]
  expect(timeOffConflict(allDay, '2026-10-06T17:00', '2026-10-06T22:00')).toBe('Assignee has approved time off that day')
  // Through midnight: a shift running 23:59–24:00 still counts, the next day doesn't.
  expect(timeOffConflict(allDay, '2026-10-06T23:59', '2026-10-07T01:00')).toBe('Assignee has approved time off that day')
  expect(timeOffConflict(allDay, '2026-10-07T00:00', '2026-10-07T06:00')).toBeNull()
})

test('L4: back-to-back does not count', () => {
  const t = [off('2026-10-06T09:00', '2026-10-06T12:00')]
  expect(timeOffConflict(t, '2026-10-06T12:00', '2026-10-06T16:00')).toBeNull()
  expect(timeOffConflict(t, '2026-10-06T05:00', '2026-10-06T09:00')).toBeNull()
})

test('L5: multi-day timed time off flags a shift inside the span', () => {
  const t = [off('2026-10-05T15:30', '2026-10-07T12:00')]
  expect(timeOffConflict(t, '2026-10-06T10:00', '2026-10-06T14:00')).toBe('Assignee has approved time off then')
  expect(timeOffConflict(t, '2026-10-05T08:00', '2026-10-05T15:00')).toBeNull()
  expect(timeOffConflict(t, '2026-10-07T13:00', '2026-10-07T18:00')).toBeNull()
})

test('L6: pending time off never conflicts', () => {
  expect(
    timeOffConflict([off('2026-10-06T09:00', '2026-10-06T12:00', false, 'pending')], '2026-10-06T10:00', '2026-10-06T11:00'),
  ).toBeNull()
})

test('another person\'s time off never conflicts', () => {
  const theirs = [{ ...off('2026-10-06T09:00', '2026-10-06T12:00'), user_id: ME + 1 }]
  expect(timeOffConflict(theirs, '2026-10-06T10:00', '2026-10-06T11:00')).toBeNull()
})
