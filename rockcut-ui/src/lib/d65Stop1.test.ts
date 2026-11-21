// D65 Stop 1: the label helpers for products with no manufacturer, the tablets unit and the catalog's lists.
import { describe, expect, it } from 'vitest'
import { formatQuantity, minQuantity, readQuantity, unitDecimals } from './brewingUnits'
import { offerPackText, reorderOfferPack } from './purchasing'
import { allowsChildren, isManagedCategory, isManagedKey, makerName, onHandText, pickerName, unitLabel, unitsFor } from './ingredientFeatures'
import type { IngredientCategory } from './types'

const none = { display_name: 'Whirlfloc T · None', form: 'Tablet', name: 'T', ingredient: { name: 'Whirlfloc' }, manufacturer: null }

describe('makerName and pickerName (decision 8)', () => {
  it('reads None for no manufacturer, never empty, nil or undefined', () => {
    expect(makerName(none)).toBe('None')
    expect(makerName({ manufacturer: { name: 'Oregon Fruit' } })).toBe('Oregon Fruit')
    expect(makerName(undefined)).toBe('None')
  })

  it('a None product in a picker is its display name; a maker leads with variety and form as D62', () => {
    expect(pickerName(none)).toBe('Whirlfloc T · None')
    expect(pickerName({ display_name: 'Yakima Chief Hops Citra T90 Pellet', form: 'T90 Pellet', name: null, ingredient: { name: 'Citra' }, manufacturer: { name: 'Yakima Chief Hops' } })).toBe(
      'Citra T90 Pellet · Yakima Chief Hops',
    )
  })
})

describe('unitLabel and each in whole numbers (§4.3)', () => {
  it('tablets for each on a Tablet product; the API label wins; lb with nothing', () => {
    expect(unitLabel({ unit: 'each', form: 'Tablet' })).toBe('tablets')
    expect(unitLabel({ unit: 'each', form: 'Liquid' })).toBe('each')
    expect(unitLabel({ unit: 'gal', unit_label: 'gal' })).toBe('gal')
    expect(unitLabel({ unit: 'each', unit_label: 'tablets' })).toBe('tablets')
    expect(unitLabel(null)).toBe('lb')
  })

  it('tablets are whole: decimals, the smallest quantity, packs view and total', () => {
    expect(unitDecimals('tablets')).toBe(0)
    expect(unitDecimals('fl oz')).toBe(2)
    expect(minQuantity('tablets')).toBe('Enter at least 1 tablet')
    expect(minQuantity('each')).toBe('Enter at least 1')
    expect(minQuantity('gal')).toBe('Enter at least 0.01 gal')
    expect(readQuantity('', '2.5', null, 'tablets')).toEqual({ quantity: null, valid: false, error: 'This product is counted in whole tablets' })
    expect(readQuantity('1', '400', 872, 'tablets')).toEqual({ quantity: '1272', valid: true })
    expect(formatQuantity(1272, 'tub', 872, 'tablets', 'packs')).toBe('1 tub 400 tablets')
    expect(formatQuantity(1272, 'tub', 872, 'tablets', 'lb')).toBe('1,272 tablets')
    expect(onHandText({ on_hand: '1272', unit: 'each', form: 'Tablet', offers: null }, 'lb')).toBe('1,272 tablets')
  })
})

describe('the catalog lists (§4.2)', () => {
  const sugars = { units: ['lb', 'gal'], form_units: { Dry: ['lb'], Liquid: ['lb', 'gal'] } }

  it('units by form for sugars; the list otherwise; none without a catalog', () => {
    expect(unitsFor(sugars, 'Dry')).toEqual(['lb'])
    expect(unitsFor(sugars, 'Liquid')).toEqual(['lb', 'gal'])
    expect(unitsFor(sugars, null)).toEqual(['lb', 'gal'])
    expect(unitsFor({ units: ['oz', 'fl oz'], form_units: {} }, 'Ground')).toEqual(['oz', 'fl oz'])
    expect(unitsFor(undefined, 'Dry')).toEqual([])
  })

  it('every key but yeast and future is managed', () => {
    for (const key of ['grains', 'hops', 'fruits', 'spices', 'sugars', 'consumables']) expect(isManagedKey(key)).toBe(true)
    expect(isManagedKey('yeast')).toBe(false)
    expect(isManagedKey('future')).toBe(false)
  })

  it('A9: no children or fields on Fruits, Spices, Sugars (and Hops); Other Consumables takes children and fields', () => {
    const cat = (id: number, key: string | null, parent: number | null = null) =>
      ({ id, name: key ?? 'child', key, parent_id: parent, sort_order: 0, field_definitions: null, inserted_at: '', updated_at: '' }) as IngredientCategory
    const categories = [cat(1, 'fruits'), cat(2, 'consumables'), cat(3, null, 2), cat(4, 'hops'), cat(5, 'grains'), cat(6, 'yeast')]
    expect(categories.map((c) => allowsChildren(c))).toEqual([false, true, false, false, true, true])
    expect(categories.map((c) => isManagedCategory(categories, c.id))).toEqual([true, false, false, true, true, false])
    // The API's catalog wins when it's there.
    expect(allowsChildren({ ...cat(7, 'spices'), catalog: { allows_children: true } as IngredientCategory['catalog'] })).toBe(true)
  })
})

describe('D65 packs in the pickers', () => {
  it('any pack but a sack reads by name; grain and hops as before', () => {
    expect(offerPackText({ pack_name: 'pail', pack_size: '5' }, 'gal')).toBe('pail · 5 gal')
    expect(offerPackText({ pack_name: 'tub', pack_size: '872' }, 'tablets')).toBe('tub · 872 tablets')
    expect(offerPackText({ pack_name: 'box', pack_size: '11' })).toBe('box · 11 lb')
    expect(offerPackText({ pack_name: 'sack', pack_size: '55', form: 'whole' })).toBe('55 lb whole')
    expect(reorderOfferPack({ pack_name: 'bag', pack_size: '50' })).toBe('bag · 50 lb')
    expect(reorderOfferPack({ pack_name: 'sack', pack_size: '50' })).toBe('50 lb')
  })
})
