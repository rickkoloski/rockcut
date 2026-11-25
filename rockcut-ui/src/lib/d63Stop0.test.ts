// D63 Stop 0 (6262): the order page's per-unit words are New order's.
import { expect, it } from 'vitest'
import { byUnitText, runningTotal, sumByUnit } from './purchasing'

it('bricks, pitchables and tablets (all `each`) stay apart, in New order\'s words', () => {
  const rows = [
    { unit: 'pitchables', quantity: 6 },
    { unit: 'bricks', quantity: 20 },
    { unit: 'pitchables', quantity: 6 },
    { unit: 'tablets', quantity: 1 },
    { unit: 'lb', quantity: 1980.5 },
  ]
  expect(byUnitText(sumByUnit(rows))).toBe('20 bricks · 1,980.5 lb · 12 pitchables · 1 tablet')
  const total = runningTotal(rows.map((r) => ({ packs: r.quantity, packSize: 1, packName: 'pack', unit: r.unit, price: null })))
  expect(byUnitText(total.byUnit)).toBe(byUnitText(sumByUnit(rows)))
})

it('cents of a pound add without float dust', () => {
  expect(sumByUnit([{ unit: 'lb', quantity: 0.1 }, { unit: 'lb', quantity: 0.2 }])).toEqual([{ unit: 'lb', quantity: '0.3' }])
})
