// D65 lead decisions 3 (DEV QA fix cycle): Copy's count quantities are whole (gap 4), and the order
// summary before a quantity is typed counts the line's own pack, never "sacks" (gap 6).
import { expect, it } from 'vitest'
import { copyQuantity, runningTotal } from './purchasing'

it('gap 4: a count copies whole; other units as sent', () => {
  expect(copyQuantity('750.00', 'tablets')).toBe('750')
  expect(copyQuantity('500.00', 'each')).toBe('500')
  expect(copyQuantity('10.00', 'gal')).toBe('10.00')
  expect(copyQuantity('271.50', 'lb')).toBe('271.50')
})

it('gap 6: a line with its offer and no quantity yet reads 0 of its pack and unit', () => {
  expect(runningTotal([{ packs: null, packSize: 5, packName: 'pail', unit: 'gal', price: 116.5 }]).text).toBe('0 pails · 0 gal · $0.00')
  expect(runningTotal([{ packs: null, packSize: 872, packName: 'tub', unit: 'tablets', price: 92 }]).text).toBe('0 tubs · 0 tablets · $0.00')
  // Typed: as before.
  expect(runningTotal([{ packs: 1, packSize: 44, packName: 'pail', unit: 'lb', price: 116.5 }]).text).toBe('1 pail · 44 lb · $116.50')
  // No offer yet: D61's empty order.
  expect(runningTotal([{ packs: null, packSize: null, price: null }]).text).toBe('0 sacks · 0 lb · $0.00')
})
