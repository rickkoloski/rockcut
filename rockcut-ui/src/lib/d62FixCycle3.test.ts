// D62 lead decisions 3 (QA recheck 2 fix cycle): gap 20's contract price-change lines.
import { describe, expect, it } from 'vitest'
import { contractPriceChanges, offerNow } from './purchasing'

describe('gap 20: which offer a contract line changes', () => {
  it('names the offer by its current price per pack, or says it has none', () => {
    expect(offerNow({ pack_name: 'box', current_price: { price_per_pack: '150' } })).toBe('now $150.00/box')
    expect(offerNow({ pack_name: 'sack', current_price: { price_per_pack: '42.5' } })).toBe('now $42.50/sack')
    expect(offerNow({ pack_name: 'box', current_price: null })).toBe('no current price')
  })

  it('adds it after the product only when given (several offers); one offer reads as before', () => {
    const lines = [
      { product: 'Citrine T90 Pellet · QA Supply Co', price: '159.5', changed: true, named: true, offer: 'now $150.00/box' },
      { product: 'Rahr 2-Row', price: '42', changed: true, offer: 'now $40.00/sack' },
      { product: 'Rahr Pale', price: '44', changed: true, offer: null },
    ]
    expect(contractPriceChanges(lines, 'QA Supply Co', 2026, '2026-11-20')).toEqual([
      'Citrine T90 Pellet · QA Supply Co (now $150.00/box) price becomes $159.50 from 2026-11-20',
      'QA Supply Co Rahr 2-Row (now $40.00/sack) price becomes $42.00 from 2026-11-20',
      'QA Supply Co Rahr Pale price becomes $44.00 from 2026-11-20',
    ])
  })
})
