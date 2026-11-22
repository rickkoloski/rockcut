// D65 lead decisions 4 (DEV QA recheck 1, gap 7): before any line has an offer, the order summary
// counts in "packs", or "sacks" for a supplier whose offers are all sacks (D61's grain wording).
import { expect, it } from 'vitest'
import { emptyOrderPack, runningTotal, targetProgress } from './purchasing'

it('gap 7: no offer yet reads packs; a sacks-only supplier keeps sacks', () => {
  expect(emptyOrderPack([])).toBeNull()
  expect(emptyOrderPack(['sack', 'tub', 'pail'])).toBeNull()
  expect(emptyOrderPack(['tub'])).toBeNull()
  expect(emptyOrderPack(['sack', 'sack'])).toBe('sack')

  expect(runningTotal([{ packs: null, packSize: null, price: null }], null).text).toBe('0 packs · 0 lb · $0.00')
  expect(targetProgress(0, 40, emptyOrderPack(['sack', 'tub']))).toBe('0 of 40 packs')
  expect(runningTotal([], emptyOrderPack(['sack'])).text).toBe('0 sacks · 0 lb · $0.00')
  expect(targetProgress(0, 40, emptyOrderPack(['sack']))).toBe('0 of 40 sacks')
  // Once a line has its offer, its own pack (gap 6), whatever the supplier.
  expect(runningTotal([{ packs: null, packSize: 5, packName: 'pail', unit: 'gal', price: 1 }], null).text).toBe('0 pails · 0 gal · $0.00')
})
