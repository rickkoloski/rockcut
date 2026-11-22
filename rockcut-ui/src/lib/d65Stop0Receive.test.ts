// D65 Stop 0 (D62 lead decisions 5, gap 3): a Receive split of 0 says why Receive waits.
import { describe, expect, it } from 'vitest'
import { emptySplitText } from './purchasing'

describe('gap 3: a Receive split of 0', () => {
  it('says why Receive waits, in boxes for hops and sacks for grain', () => {
    expect(emptySplitText(['0', '2'], 'box')).toBe('Each lot needs at least 1 box. Remove the empty one.')
    expect(emptySplitText(['3', ' 00 '], 'sack')).toBe('Each lot needs at least 1 sack. Remove the empty one.')
  })

  it('says nothing for whole packs, a blank or a typo (the sum already shows those)', () => {
    expect(emptySplitText(['1', '2'], 'box')).toBeNull()
    expect(emptySplitText(['', '2'], 'box')).toBeNull()
    expect(emptySplitText(['x', '2'], 'sack')).toBeNull()
  })
})
