import { describe, expect, it } from 'vitest'
import {
  ACTING_IDLE_MS,
  ActingCancelled,
  actingExpired,
  deleteWithCode,
  isActingCancelled,
  recordedAs,
  staffCodeFailure,
  startActing,
  touchActing,
  withCode,
} from './acting'

// D40 (plan decision 3): the tablet's "acting as" window, 5 idle minutes.
describe('the acting timer', () => {
  const t0 = 1_700_000_000_000
  const s = startActing('1111', 'Jake Brewer', t0)

  it('is 5 minutes', () => expect(ACTING_IDLE_MS).toBe(5 * 60 * 1000))

  it('holds until 5 idle minutes have passed', () => {
    expect(actingExpired(s, t0)).toBe(false)
    expect(actingExpired(s, t0 + ACTING_IDLE_MS - 1)).toBe(false)
    expect(actingExpired(s, t0 + ACTING_IDLE_MS)).toBe(true)
  })

  it('activity restarts the 5 minutes (S43: a second tick within 5 minutes needs no code)', () => {
    const later = touchActing(s, t0 + 4 * 60_000)!
    expect(later.code).toBe('1111')
    expect(actingExpired(later, t0 + 8 * 60_000)).toBe(false)
    expect(actingExpired(later, t0 + 9 * 60_000)).toBe(true)
  })

  it('activity after it expired does not revive it (S44: a tablet that slept)', () => {
    expect(touchActing(s, t0 + ACTING_IDLE_MS + 1)).toBeNull()
  })
})

describe('staff-code responses', () => {
  const refused = (error: string, message = 'msg') => ({ response: { status: 422, data: { error, message } } })

  it('recognises D37’s three refusals with their copy', () => {
    expect(staffCodeFailure(refused('staff_code_required', 'Enter your staff code'))).toEqual({
      error: 'staff_code_required',
      message: 'Enter your staff code',
    })
    expect(staffCodeFailure(refused('staff_code_invalid'))?.error).toBe('staff_code_invalid')
    expect(staffCodeFailure({ response: { status: 429, data: { error: 'staff_code_locked', message: 'Too many' } } })?.message).toBe(
      'Too many',
    )
  })

  it('anything else is not a staff-code problem', () => {
    expect(staffCodeFailure(refused('display_required'))).toBeNull()
    expect(staffCodeFailure({ response: { status: 403, data: { error: 'Forbidden' } } })).toBeNull()
    expect(staffCodeFailure(new Error('network'))).toBeNull()
  })

  it('reads recorded_as from a response', () => {
    expect(recordedAs({ data: { data: {}, recorded_as: 'Jake Brewer' } })).toBe('Jake Brewer')
    expect(recordedAs({ data: { data: {} } })).toBeNull()
    expect(recordedAs(undefined)).toBeNull()
  })

  it('a cancelled dialog is its own error', () => {
    expect(isActingCancelled(new ActingCancelled())).toBe(true)
    expect(isActingCancelled(new Error('x'))).toBe(false)
  })
})

describe('sending the code', () => {
  it('adds it to a body only when there is one', () => {
    expect(withCode({ display: 'both' }, '1111')).toEqual({ display: 'both', staff_code: '1111' })
    expect(withCode({ display: 'both' }, undefined)).toEqual({ display: 'both' })
    expect(withCode(undefined, '1111')).toEqual({ staff_code: '1111' })
  })

  it('puts it in a DELETE’s query', () => {
    expect(deleteWithCode({ scope: 'this' }, '1111')).toEqual({ params: { scope: 'this', staff_code: '1111' } })
    expect(deleteWithCode(undefined, '1111')).toEqual({ params: { staff_code: '1111' } })
    expect(deleteWithCode(undefined, undefined)).toBeUndefined()
    expect(deleteWithCode({ scope: 'this' }, undefined)).toEqual({ params: { scope: 'this' } })
  })
})
