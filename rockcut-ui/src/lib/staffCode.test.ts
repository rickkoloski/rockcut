import { describe, expect, it } from 'vitest'
import { staffCodeAction } from './staffCode'

describe('staffCodeAction (D58 §3.8)', () => {
  it('Remove waits for Save, which sends the delete', () => {
    expect(staffCodeAction(true, '', true)).toBe('delete')
    expect(staffCodeAction(true, '', false)).toBeNull()
  })

  it('typed digits replace the code, removed or not', () => {
    expect(staffCodeAction(true, '1234', false)).toBe('put')
    expect(staffCodeAction(true, '1234', true)).toBe('put')
  })

  it('sends nothing when the save clears the code anyway', () => {
    expect(staffCodeAction(false, '', true)).toBeNull()
    expect(staffCodeAction(false, '1234', false)).toBeNull()
  })
})
