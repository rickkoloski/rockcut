// D65 lead decisions 2 (QA recheck 1 leftovers): a count's pack reads "tubs of 872 tablets" (gap 8),
// and a count where 0 isn't allowed says "Enter at least 1 tablet" for 0 as it's typed (gap 16).
import { describe, expect, it } from 'vitest'
import { packSizeText, readQuantity } from './brewingUnits'

it('gap 8: a pack and its size, a count reading "tubs of 872 tablets"', () => {
  expect(packSizeText('tub', '872', 'tablets')).toBe('tubs of 872 tablets')
  expect(packSizeText('case', 12, 'each')).toBe('cases of 12 each')
  expect(packSizeText('sack', '55.00', 'lb')).toBe('55 lb sacks')
  expect(packSizeText('pail', 5, 'gal')).toBe('5 gal pails')
})

describe('gap 16: 0 tablets where 0 isn’t allowed', () => {
  it('positive: 0 (packs or loose) is refused with the smallest the API takes', () => {
    expect(readQuantity('', '0', null, 'tablets', 'X', true)).toEqual({ quantity: null, valid: false, error: 'Enter at least 1 tablet' })
    expect(readQuantity('0', '', 333, 'tablets', 'X', true)).toEqual({ quantity: null, valid: false, error: 'Enter at least 1 tablet' })
    expect(readQuantity('', '0', null, 'each', 'X', true).error).toBe('Enter at least 1')
    expect(readQuantity('1', '', 333, 'tablets', 'X', true)).toEqual({ quantity: '333', valid: true })
  })

  it('Count (0 allowed) and decimal units are as before', () => {
    expect(readQuantity('', '0', null, 'tablets', 'X')).toEqual({ quantity: '0', valid: true })
    expect(readQuantity('', '0', null, 'gal', null, true)).toEqual({ quantity: '0', valid: true })
    expect(readQuantity('', '-1', null, 'tablets', 'X', true)).toEqual({ quantity: null, valid: false })
  })
})
