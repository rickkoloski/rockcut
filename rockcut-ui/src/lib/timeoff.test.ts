import { describe, expect, it } from 'vitest'
import {
  agendaTimeOffByDay,
  agendaTimeOffLabel,
  buildOffMarkers,
  canReviewTimeOff,
  describeTimeOffRange,
  isPastTimeOff,
  timeOffLastDayKey,
} from './timeoff'
import { buildOffWindows, conflictsFor } from './conflicts'
import type { TimeOffRequest, TimeOffStatus } from './types'

// Colorado is UTC-6 in October (MDT) and UTC-7 in November (MST).
function req(id: number, starts_at: string, ends_at: string, opts: Partial<TimeOffRequest> & { status?: TimeOffStatus } = {}): TimeOffRequest {
  return {
    id,
    user_id: 1,
    user: { id: 1, email: 'sam@rockcut-test.com', name: 'Sam Pour' },
    type: 'pto',
    starts_at,
    ends_at,
    all_day: true,
    note: null,
    status: 'approved',
    reviewer_note: null,
    reviewed_at: null,
    reviewed_by_id: null,
    reviewed_by: null,
    inserted_at: '2026-10-01T00:00:00Z',
    ...opts,
  }
}

// Mon Oct 5 00:00 → Wed Oct 7 23:59, Colorado.
const allDay = req(1, '2026-10-05T06:00:00Z', '2026-10-08T05:59:00Z')

describe('isPastTimeOff', () => {
  it('stays current through its last Colorado day', () => {
    expect(isPastTimeOff(allDay, '2026-10-07')).toBe(false)
    expect(isPastTimeOff(allDay, '2026-10-08')).toBe(true)
  })

  it('uses the Colorado day of ends_at, not the UTC one', () => {
    // Ends Wed Oct 7 23:30 Colorado = Thu Oct 8 05:30 UTC.
    const late = req(2, '2026-10-07T14:00:00Z', '2026-10-08T05:30:00Z', { all_day: false })
    expect(isPastTimeOff(late, '2026-10-07')).toBe(false)
    expect(isPastTimeOff(late, '2026-10-08')).toBe(true)
  })
})

describe('canReviewTimeOff', () => {
  const owner = { isOwner: true, managesDepartments: [] }
  const manager = { isOwner: false, managesDepartments: ['bar'] }
  const employee = { isOwner: false, managesDepartments: [] }

  it('owners and managers review current requests; employees never', () => {
    expect(canReviewTimeOff(allDay, owner, '2026-10-06')).toBe(true)
    expect(canReviewTimeOff(allDay, manager, '2026-10-06')).toBe(true)
    expect(canReviewTimeOff(allDay, employee, '2026-10-06')).toBe(false)
  })

  it('nobody reviews a past request', () => {
    expect(canReviewTimeOff(allDay, owner, '2026-10-08')).toBe(false)
    expect(canReviewTimeOff(allDay, manager, '2026-10-08')).toBe(false)
  })
})

describe('describeTimeOffRange', () => {
  it('reads one all-day, several all-day and timed requests', () => {
    expect(describeTimeOffRange(req(3, '2026-10-05T06:00:00Z', '2026-10-06T05:59:00Z'))).toMatch(/Oct 5 \(all day\)$/)
    expect(describeTimeOffRange(allDay)).toMatch(/Oct 5 – .*Oct 7$/)
    expect(describeTimeOffRange(req(4, '2026-10-05T20:00:00Z', '2026-10-05T23:00:00Z', { all_day: false }))).toMatch(/Oct 5, 2:00\s?PM–5:00\s?PM$/)
  })
})

describe('buildOffMarkers', () => {
  it('each marker carries its request', () => {
    const m = buildOffMarkers([allDay], '2026-10-05')
    expect(m.get(1)?.get('2026-10-06')?.[0].request).toBe(allDay)
  })
})

describe('agendaTimeOffByDay', () => {
  const pending = req(5, '2026-10-06T06:00:00Z', '2026-10-07T05:59:00Z', {
    status: 'pending',
    user_id: 2,
    user: { id: 2, email: 'b@rockcut-test.com', name: 'Alex Draft' },
  })
  const denied = req(6, '2026-10-06T06:00:00Z', '2026-10-07T05:59:00Z', { status: 'denied' })
  const cancelled = req(7, '2026-10-06T06:00:00Z', '2026-10-07T05:59:00Z', { status: 'cancelled' })
  const depts: Record<number, string[]> = { 1: ['bar'], 2: ['brewery'] }
  const departmentsOf = (id: number) => depts[id] ?? []

  it('puts a multi-day request on each of its days, inside the range', () => {
    const days = agendaTimeOffByDay([allDay], '2026-10-06', '2026-10-12')
    expect([...days.keys()]).toEqual(['2026-10-06', '2026-10-07'])
  })

  it('shows approved and pending, not denied or cancelled', () => {
    const days = agendaTimeOffByDay([allDay, pending, denied, cancelled], '2026-10-05', '2026-10-07')
    expect(days.get('2026-10-06')?.map((r) => r.id)).toEqual([1, 5])
    expect(days.get('2026-10-05')?.map((r) => r.id)).toEqual([1])
  })

  it('orders a day by start, then name', () => {
    const early = req(8, '2026-10-06T06:00:00Z', '2026-10-07T05:59:00Z', { user: { id: 3, email: 'z', name: 'Zed' }, user_id: 3 })
    const days = agendaTimeOffByDay([early, allDay, pending], '2026-10-06', '2026-10-06')
    expect(days.get('2026-10-06')?.map((r) => r.id)).toEqual([1, 5, 8])
  })

  it('a department filter keeps the members of that department', () => {
    const days = agendaTimeOffByDay([allDay, pending], '2026-10-06', '2026-10-06', { departmentKey: 'bar', departmentsOf })
    expect(days.get('2026-10-06')?.map((r) => r.id)).toEqual([1])
  })

  it('a position filter or Open shifts only hides time off', () => {
    expect(agendaTimeOffByDay([allDay], '2026-10-05', '2026-10-07', { positionFiltered: true }).size).toBe(0)
    expect(agendaTimeOffByDay([allDay], '2026-10-05', '2026-10-07', { openOnly: true }).size).toBe(0)
  })

  it('My shifts keeps only my own', () => {
    const days = agendaTimeOffByDay([allDay, pending], '2026-10-06', '2026-10-06', { mineUserId: 2 })
    expect(days.get('2026-10-06')?.map((r) => r.id)).toEqual([5])
  })

  it('an open-ended range keeps every day', () => {
    expect(agendaTimeOffByDay([allDay], '', '').size).toBe(3)
  })
})

describe('agendaTimeOffLabel', () => {
  it('all day, timed one day, and a multi-day timed range', () => {
    expect(agendaTimeOffLabel(allDay, '2026-10-06')).toBe('All day')
    const timed = req(9, '2026-10-05T20:00:00Z', '2026-10-05T23:00:00Z', { all_day: false })
    expect(agendaTimeOffLabel(timed, '2026-10-05')).toMatch(/^2:00\s?PM–5:00\s?PM$/)
    // Mon 3:30 PM → Wed 12:00 PM Colorado.
    const span = req(10, '2026-10-05T21:30:00Z', '2026-10-07T18:00:00Z', { all_day: false })
    expect(agendaTimeOffLabel(span, '2026-10-05')).toMatch(/^From 3:30\s?PM$/)
    expect(agendaTimeOffLabel(span, '2026-10-06')).toBe('All day')
    expect(agendaTimeOffLabel(span, '2026-10-07')).toMatch(/^Until 12:00\s?PM$/)
  })
})

// Lead decision 2: `ends_at` is exclusive at a day boundary. QA's case: Wed
// Nov 18 8:00 PM → Thu Nov 19 12:00 AM Colorado (MST, UTC-7).
describe('time off ending at 12:00 AM', () => {
  const evening = req(11, '2026-11-19T03:00:00Z', '2026-11-19T07:00:00Z', { all_day: false, status: 'pending', type: 'personal' })
  // Tue Nov 17 8:00 PM → Thu Nov 19 12:00 AM.
  const twoNights = req(12, '2026-11-18T03:00:00Z', '2026-11-19T07:00:00Z', { all_day: false })
  // Ends one minute later: Thursday is covered.
  const pastMidnight = req(13, '2026-11-19T03:00:00Z', '2026-11-19T07:01:00Z', { all_day: false })
  // All day Wed Nov 18 (00:00 → 23:59).
  const wednesday = req(14, '2026-11-18T07:00:00Z', '2026-11-19T06:59:00Z')

  it('the last day is the day before', () => {
    expect(timeOffLastDayKey(evening)).toBe('2026-11-18')
    expect(timeOffLastDayKey(twoNights)).toBe('2026-11-18')
    expect(timeOffLastDayKey(pastMidnight)).toBe('2026-11-19')
    expect(timeOffLastDayKey(wednesday)).toBe('2026-11-18')
  })

  it('the Scheduler shows it on Wednesday only', () => {
    const days = buildOffMarkers([evening], '2026-11-16').get(1)!
    expect([...days.keys()]).toEqual(['2026-11-18'])
    expect(days.get('2026-11-18')![0].label).toMatch(/^Off 8:00\s?PM–12:00\s?AM$/)
    expect([...buildOffMarkers([twoNights], '2026-11-16').get(1)!.keys()]).toEqual(['2026-11-17', '2026-11-18'])
    expect([...buildOffMarkers([pastMidnight], '2026-11-16').get(1)!.keys()]).toEqual(['2026-11-18', '2026-11-19'])
  })

  it('the agenda shows it on Wednesday only', () => {
    const days = agendaTimeOffByDay([evening, twoNights], '2026-11-16', '2026-11-22')
    expect(days.get('2026-11-19')).toBeUndefined()
    expect(days.get('2026-11-18')?.map((r) => r.id)).toEqual([12, 11])
    expect(agendaTimeOffLabel(evening, '2026-11-18')).toMatch(/^8:00\s?PM–12:00\s?AM$/)
    expect(agendaTimeOffLabel(twoNights, '2026-11-17')).toMatch(/^From 8:00\s?PM$/)
    expect(agendaTimeOffLabel(twoNights, '2026-11-18')).toMatch(/^Until 12:00\s?AM$/)
  })

  it('a Thursday shift is no conflict (buildOffWindows uses the exact end)', () => {
    const off = buildOffWindows([{ ...evening, status: 'approved' }])
    const thursday = { assigneeId: 1, startsAt: '2026-11-19T07:00:00Z', endsAt: '2026-11-19T15:00:00Z' }
    expect(conflictsFor(thursday, [], off)).toEqual([])
    const late = { assigneeId: 1, startsAt: '2026-11-19T05:00:00Z', endsAt: '2026-11-19T08:00:00Z' }
    expect(conflictsFor(late, [], off)).toHaveLength(1)
  })
})
