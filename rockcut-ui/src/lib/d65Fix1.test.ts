// D65 lead decisions 1 (local QA fix cycle): a count is never rounded before it's sent (gaps 5, 7),
// the default pack (gap 3), one place for Brix and ions (gap 4), "1 tablet" (gap 6), "tablets" on sums (gap 8).
import { describe, expect, it } from 'vitest'
import { boxText, formatFeature, formatQuantity, productShortName, readQuantity, wholeCountMessage } from './brewingUnits'
import { formatRange, ionsText, rangeDraftsFrom, draftsFrom } from './ingredientFeatures'
import { amountText, byUnitText, defaultPackName } from './purchasing'
import type { FeatureType } from './types'

const brix = { id: 1, key: 'brix', label: 'Brix', unit_label: '°Bx', decimals: 1 } as FeatureType

describe('gaps 5, 7: a count is whole, never rounded', () => {
  it('0.5 tub of 333 is 166.5 tablets: refused, naming the product, and nothing to send', () => {
    expect(readQuantity('0.5', '', 333, 'tablets', 'Kettle Tabs Tablet')).toEqual({ quantity: null, valid: false, error: 'Kettle Tabs Tablet is counted in whole tablets' })
    // 0.01 of the seeded 872-tablet tub is 8.72.
    expect(readQuantity('0.01', '', 872, 'tablets', 'Whirlfloc T').error).toBe('Whirlfloc T is counted in whole tablets')
    // A loose 2.5 says the same, not "Use a whole number"; another `each` says "whole numbers".
    expect(readQuantity('', '2.5', null, 'tablets', 'Whirlfloc T').error).toBe('Whirlfloc T is counted in whole tablets')
    expect(readQuantity('1', '0.5', 10, 'each', 'Clarifier Powder').error).toBe('Clarifier Powder is counted in whole numbers')
  })

  it('whole results go as they are', () => {
    expect(readQuantity('0.5', '', 500, 'tablets', 'X')).toEqual({ quantity: '250', valid: true })
    expect(readQuantity('1', '400', 872, 'tablets', 'X')).toEqual({ quantity: '1272', valid: true })
    expect(readQuantity('', '0', null, 'tablets', 'X')).toEqual({ quantity: '0', valid: true })
  })

  it('grain, hops and gal stay decimal: 0.5 sack is 27.5 lb', () => {
    expect(readQuantity('0.5', '', 55, 'lb')).toEqual({ quantity: '27.5', valid: true })
    expect(readQuantity('0.5', '', 11, 'lb')).toEqual({ quantity: '5.5', valid: true })
    expect(readQuantity('0.33', '', 5, 'gal')).toEqual({ quantity: '1.65', valid: true })
  })

  it("the product's name as the API's refusal says it", () => {
    expect(productShortName({ name: 'T', form: 'Tablet', ingredient: { name: 'Whirlfloc' } })).toBe('Whirlfloc T')
    expect(productShortName({ name: null, form: 'Tablet', ingredient: { name: 'Kettle Tabs' } })).toBe('Kettle Tabs Tablet')
    expect(wholeCountMessage(null, 'tablets')).toBe('This product is counted in whole tablets')
  })
})

it('gap 3: the default pack is the unit usual one when the category takes it, else its first', () => {
  const defaults = { lb: 'bag', 'fl oz': 'bottle', gal: 'pail' }
  expect(defaultPackName(defaults, 'fl oz', ['bag', 'jar', 'bottle', 'case'])).toBe('bottle')
  expect(defaultPackName({ 'fl oz': 'jug' }, 'fl oz', ['bag', 'jar', 'bottle', 'case'])).toBe('bag')
  expect(defaultPackName(defaults, 'lb', ['bag', 'pail'])).toBe('bag')
  expect(defaultPackName(defaults, 'oz', [])).toBeNull()
})

describe('gap 4: Brix and ions with one place', () => {
  it('on screens: ions, Brix values and Brix ranges', () => {
    expect(ionsText({ ca_ppm_per_g_gal: '72', so4_ppm_per_g_gal: '103' })).toBe('Ca 72.0 · SO₄ 103.0')
    expect(ionsText({ ca_ppm_per_g_gal: '61.5' })).toBe('Ca 61.5')
    expect(formatFeature('14', brix)).toBe('14.0')
    expect(formatRange({ value: '6.5', value_high: '9' }, brix)).toBe('6.5–9.0')
    expect(formatRange({ value: '12', value_high: '12' }, brix)).toBe('12.0')
    // Hop ranges still read as typed.
    expect(formatRange({ value: '11', value_high: '13' }, { key: 'alpha_acid_pct', decimals: 2 })).toBe('11–13')
  })

  it('in reopened dialogs: Brix boxes padded, others as stored', () => {
    expect(boxText('14', brix)).toBe('14.0')
    expect(boxText('', brix)).toBe('')
    expect(boxText('81.5', { key: 'extract_fgdb', decimals: 2 })).toBe('81.5')
    expect(draftsFrom({ brix: { value: '14', entered_value: null, entered_unit: null } } as never, [brix]).brix.text).toBe('14.0')
    expect(rangeDraftsFrom({ brix: { value: '6.5', value_high: '9' } } as never, [brix]).brix).toEqual({ low: '6.5', high: '9.0' })
  })
})

it('gap 6: exactly 1 tablet is singular', () => {
  expect(formatQuantity(1, 'tub', 500, 'tablets', 'packs')).toBe('1 tablet')
  expect(formatQuantity(-1, 'tub', 500, 'tablets', 'lb')).toBe('−1 tablet')
  expect(formatQuantity(501, 'tub', 500, 'tablets', 'packs')).toBe('1 tub 1 tablet')
  expect(formatQuantity(2, 'tub', 500, 'tablets', 'lb')).toBe('2 tablets')
  expect(formatQuantity(1000, 'tub', 500, 'tablets', 'packs')).toBe('2 tubs')
  expect(amountText('1', 'tablets')).toBe('1 tablet')
  expect(amountText('1', 'lb')).toBe('1 lb')
})

it("gap 8: a sum says its label ('tablets'), else the unit", () => {
  expect(byUnitText([{ unit: 'each', unit_label: 'tablets', quantity: '500' }, { unit: 'gal', quantity: '5' }])).toBe('500 tablets · 5 gal')
  expect(byUnitText([{ unit: 'each', unit_label: 'each', quantity: '1617' }])).toBe('1,617 each')
})
