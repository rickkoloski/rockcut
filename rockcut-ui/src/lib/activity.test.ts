import { describe, expect, it } from 'vitest'
import { actionLabel } from './activity'

describe('actionLabel', () => {
  it('D58 §3.13: staff-code entries read like the others', () => {
    expect(actionLabel('staff_code.set')).toBe('Staff code set')
    expect(actionLabel('staff_code.remove')).toBe('Staff code removed')
    expect(actionLabel('staff_code.reveal')).toBe('Staff code shown')
  })

  it('lead decisions 1: a deactivate that opened future shifts', () => {
    expect(actionLabel('user.shifts_unassigned')).toBe('Future shifts made open')
  })

  it('keeps known labels and shows an unknown action as it is', () => {
    expect(actionLabel('user.created')).toBe('User created')
    expect(actionLabel('something.new')).toBe('something.new')
  })
})
