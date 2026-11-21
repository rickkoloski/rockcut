// D62 lead decisions 2 (local QA recheck fix cycle): the helpers behind gaps 15 and 18.
import { describe, expect, it } from 'vitest'
import { contractPriceChanges, reorderListPack, reorderOfferPack } from './purchasing'

describe('gap 15: To order offers and caption', () => {
  it('a hop box reads box · 11 lb; a sack reads as D61 ("50 lb", no form)', () => {
    expect(reorderOfferPack({ pack_name: 'box', pack_size: '11' })).toBe('box · 11 lb')
    expect(reorderOfferPack({ pack_name: 'sack', pack_size: '50.0' })).toBe('50 lb')
  })

  it("the caption follows each row's pack: boxes, sacks, packs; an empty list says sacks", () => {
    expect(reorderListPack(['box', 'box'])).toBe('box')
    expect(reorderListPack(['sack'])).toBe('sack')
    expect(reorderListPack(['sack', 'box'])).toBeNull()
    expect(reorderListPack(['box', null])).toBeNull()
    expect(reorderListPack([])).toBe('sack')
  })
})

describe('gap 18: contract price changes', () => {
  it('a hop line (its name ends with the manufacturer) leaves the supplier off; grain keeps D61', () => {
    const lines = [
      { product: 'Citrine T90 Pellet · QA Supply Co', price: '159.5', changed: true, named: true },
      { product: 'Rahr 2-Row', price: '42', changed: true },
    ]
    expect(contractPriceChanges(lines, 'QA Supply Co', 2026, '2026-11-20')).toEqual([
      'Citrine T90 Pellet · QA Supply Co price becomes $159.50 from 2026-11-20',
      'QA Supply Co Rahr 2-Row price becomes $42.00 from 2026-11-20',
    ])
  })
})
