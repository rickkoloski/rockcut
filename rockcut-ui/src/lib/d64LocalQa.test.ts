// D64 lead decisions 3 and 5: History's direction, the first-harvest date, packs that are the unit.
import { describe, expect, it } from 'vitest'
import { packIsUnit } from './brewingUnits'
import { harvestError } from './harvest'
import { beforeHarvestText, entryAmountText } from './yeast'
import type { YeastBrink } from './types'

const e = (id: number, kind: string, quantity_lb: string) => ({ id, kind, quantity_lb })

describe('entryAmountText (gap 2)', () => {
  const entries = [e(1, 'harvested', '40'), e(2, 'adjusted', '-7.00'), e(3, 'pitched', '-5'), e(4, 'adjusted', '7')]
  it('an adjustment says which way and from what', () => {
    expect(entryAmountText(entries[1], entries, 'Adjusted')).toBe('Adjusted −7 lb (40 → 33)')
    expect(entryAmountText(entries[3], entries, 'Adjusted')).toBe('Adjusted +7 lb (28 → 35)')
  })
  it('anything else is its amount', () => expect(entryAmountText(entries[2], entries, 'Pitched')).toBe('Pitched 5 lb'))
  it('decimals stay clean', () => {
    const d = [e(1, 'harvested', '0.3'), e(2, 'adjusted', '-0.1')]
    expect(entryAmountText(d[1], d, 'Adjusted')).toBe('Adjusted −0.1 lb (0.3 → 0.2)')
  })
})

describe('beforeHarvestText (gap 3)', () => {
  const b = { name: 'YB2', yeast: { first_harvested_on: '2026-11-23' } } as YeastBrink
  it('refuses the day before, allows the day itself', () => {
    expect(beforeHarvestText(b, '2026-11-22')).toBe("YB2's yeast was harvested 11/23. Pick that day or later.")
    expect(beforeHarvestText(b, '2026-11-23')).toBeNull()
    expect(beforeHarvestText({ ...b, yeast: null }, '2026-01-01')).toBeNull()
  })
})

describe('packIsUnit (gap 1)', () => {
  it('a brick of 1 brick, not a case of 12 or a tub of 872', () => {
    expect(packIsUnit('brick', '1', 'bricks')).toBe(true)
    expect(packIsUnit('pitchable', 1, 'pitchables')).toBe(true)
    expect(packIsUnit('case', '12', 'bricks')).toBe(false)
    expect(packIsUnit('brick', '2', 'bricks')).toBe(false)
    expect(packIsUnit('tub', '1', 'tablets')).toBe(false)
  })
})

it('a generation over 999 has its own sentence', () => {
  expect(harvestError({ outcome: 'harvested', brinkId: 1, lb: '5', productIds: [1], generation: '1000', note: '' })).toBe('The generation is 999 or less')
})
