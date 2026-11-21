// D62 lead decisions 1 (local QA fix cycle): the helpers behind gaps 2, 3, 5 and 8.
import { describe, expect, it } from 'vitest'
import { formatRange, manufacturersFor, pickerName } from './ingredientFeatures'
import { offerPackText } from './purchasing'

describe('gap 2: ranges', () => {
  it('both ends, equal ends, one end, none', () => {
    expect(formatRange({ value: '11', value_high: '13' }, 2)).toBe('11–13')
    expect(formatRange({ value: '12.5', value_high: '12.5' }, 2)).toBe('12.5')
    expect(formatRange({ value: '12', value_high: null }, 2)).toBe('≥ 12')
    expect(formatRange({ value: null, value_high: '9' }, 2)).toBe('≤ 9')
    expect(formatRange({ value: null, value_high: null }, 2)).toBeNull()
  })
})

describe('gap 3: offer packs', () => {
  it('a hop offer reads box · 11 lb with no form; grain keeps its form', () => {
    expect(offerPackText({ pack_name: 'box', pack_size: '11', form: null })).toBe('box · 11 lb')
    // A hop offer saved before the fix still said "whole": the box never shows it.
    expect(offerPackText({ pack_name: 'box', pack_size: '11.0', form: 'whole' })).toBe('box · 11 lb')
    expect(offerPackText({ pack_name: 'sack', pack_size: '55', form: 'whole' })).toBe('55 lb whole')
    expect(offerPackText({ pack_name: 'sack', pack_size: '50', form: 'milled' })).toBe('50 lb milled')
  })
})

describe('gap 5: manufacturers in what is shown', () => {
  const parties = [
    { id: 1, name: 'Rahr' },
    { id: 2, name: 'Yakima Chief Hops' },
    { id: 3, name: 'New Maltster' },
  ]
  const products = [
    { manufacturer_party_id: 1, category_key: 'grains' },
    { manufacturer_party_id: 2, category_key: 'hops' },
  ]

  it('grain screens list maltsters, Hops lists hop growers, both lists both', () => {
    expect(manufacturersFor(parties, products, ['grains']).map((p) => p.name)).toEqual(['Rahr'])
    expect(manufacturersFor(parties, products, ['hops']).map((p) => p.name)).toEqual(['Yakima Chief Hops'])
    expect(manufacturersFor(parties, products, ['grains', 'hops']).map((p) => p.name)).toEqual(['Rahr', 'Yakima Chief Hops'])
  })

  it("keeps the product's own manufacturer even when it makes nothing else here", () => {
    expect(manufacturersFor(parties, products, ['grains'], 3).map((p) => p.name)).toEqual(['Rahr', 'New Maltster'])
  })
})

describe('gap 8: line pickers', () => {
  it('a product with a form leads with variety and form; grain keeps its name', () => {
    const maker = { name: 'Yakima Chief Hops' }
    expect(pickerName({ display_name: 'Yakima Chief Hops Citra T90 Pellet', form: 'T90 Pellet', name: null, ingredient: { name: 'Citra' }, manufacturer: maker })).toBe(
      'Citra T90 Pellet · Yakima Chief Hops',
    )
    expect(pickerName({ display_name: 'x', form: 'T90 Pellet', name: 'Lupomax', ingredient: { name: 'Citra' }, manufacturer: maker })).toBe('Citra T90 Pellet (Lupomax) · Yakima Chief Hops')
    expect(pickerName({ display_name: 'Rahr 2-Row', form: null, name: null, ingredient: { name: '2-Row' }, manufacturer: { name: 'Rahr' } })).toBe('Rahr 2-Row')
  })
})
