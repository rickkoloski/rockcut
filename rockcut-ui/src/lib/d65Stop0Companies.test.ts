// D65 Stop 0 (D62 lead decisions 5, gap 1): the Companies list's Order target in packs.
import { describe, expect, it } from 'vitest'
import { orderTargetText } from './purchasing'

describe('gap 1: Order target', () => {
  it('reads in packs, never sacks', () => {
    expect(orderTargetText(40)).toBe('40 packs')
    expect(orderTargetText(1)).toBe('1 pack')
  })

  it('is empty with no target', () => {
    expect(orderTargetText(null)).toBe('')
    expect(orderTargetText(undefined)).toBe('')
  })
})
