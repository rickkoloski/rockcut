// D64 Stop 1: yeast products on the screens (bricks and pitchables, the lab,
// pitch size on Liquid only) and D65 DEV QA gap 9 (an order line with no offer
// reads "Packs" / "$ / pack", "Sacks" for a sacks-only supplier).
import { describe, expect, it } from 'vitest'
import { emptyOrderPack, offerPackText, orderLineWords, runningTotal } from './purchasing'
import { formatQuantity, isCountUnit, minQuantity, packSizeText, perUnitLabel, productShortName, readQuantity, unitWord, wholeCountMessage } from './brewingUnits'
import { itemLabel, lotTypesFor, manufacturerLabel, noManufacturerAllowed, pickerName, requiredLotKeys, unitLabel } from './ingredientFeatures'
import type { FeatureType } from './types'

describe('gap 9: an order line before its offer', () => {
  it('reads Packs / $ / pack for no supplier, a mixed one, or any other pack', () => {
    for (const packs of [[], ['sack', 'tub'], ['tub'], ['brick', 'pitchable']]) {
      expect(orderLineWords(null, packs)).toEqual({ pack: null, label: 'Packs', priceLabel: '$ / pack' })
    }
  })

  it('reads Sacks / $ / sack for a sacks-only supplier', () => {
    expect(orderLineWords(undefined, ['sack', 'sack'])).toEqual({ pack: 'sack', label: 'Sacks', priceLabel: '$ / sack' })
  })

  it("once an offer is picked, the offer's pack, whatever the supplier", () => {
    expect(orderLineWords('tub', ['sack'])).toEqual({ pack: 'tub', label: 'Tubs', priceLabel: '$ / tub' })
    expect(orderLineWords('box', [])).toEqual({ pack: 'box', label: 'Boxes', priceLabel: '$ / box' })
  })

  it("shares gap 7's rule with the order summary, so the two can't drift", () => {
    for (const packs of [[], ['sack'], ['sack', 'tub'], ['brick']]) {
      const line = orderLineWords(null, packs).pack
      expect(line).toBe(emptyOrderPack(packs))
      expect(runningTotal([], emptyOrderPack(packs)).text.split(' · ')[0]).toBe(`0 ${line === 'sack' ? 'sacks' : 'packs'}`)
    }
  })
})

describe('yeast units: bricks and pitchables', () => {
  it('are whole counts, singular for 1', () => {
    expect(isCountUnit('bricks') && isCountUnit('pitchables') && isCountUnit('tablets')).toBe(true)
    expect(isCountUnit('lb')).toBe(false)
    expect(unitWord('bricks', 1)).toBe('brick')
    expect(unitWord('pitchables', 2)).toBe('pitchables')
    expect(perUnitLabel('bricks')).toBe('brick')
    expect(perUnitLabel('lb')).toBe('lb')
    expect(minQuantity('pitchables')).toBe('Enter at least 1 pitchable')
  })

  it('a fraction is refused with the code, never rounded', () => {
    expect(wholeCountMessage('US-05', 'bricks')).toBe('US-05 is counted in whole bricks')
    expect(readQuantity('', '1.5', null, 'bricks', 'US-05', true)).toEqual({ quantity: null, valid: false, error: 'US-05 is counted in whole bricks' })
    expect(readQuantity('', '2', null, 'bricks', 'US-05', true)).toEqual({ quantity: '2', valid: true })
    // The refusal side: a decimal unit keeps its part.
    expect(readQuantity('', '1.5', null, 'lb', 'x', true).valid).toBe(true)
  })

  it("a yeast product goes by its code in a refusal; another by its short name", () => {
    expect(productShortName({ name: 'US-05', form: 'Dry', ingredient: { name: 'Chico Ale' }, category_key: 'yeast' })).toBe('US-05')
    expect(productShortName({ name: 'T', form: 'Tablet', ingredient: { name: 'Whirlfloc' }, category_key: 'consumables' })).toBe('Whirlfloc T')
  })

  it('a product reads bricks (Dry) or pitchables (Liquid); a Liquid fining in each stays each', () => {
    expect(unitLabel({ unit: 'each', form: 'Dry', category_key: 'yeast' })).toBe('bricks')
    expect(unitLabel({ unit: 'each', form: 'Liquid', category_key: 'yeast' })).toBe('pitchables')
    expect(unitLabel({ unit: 'each', form: 'Liquid', category_key: 'consumables' })).toBe('each')
    expect(unitLabel({ unit: 'each', form: 'Dry', unit_label: 'bricks' })).toBe('bricks')
  })

  it('a brick of one reads "brick · 1 (500 g)" and "4 bricks"; a case of 10 says so', () => {
    expect(offerPackText({ pack_name: 'brick', pack_size: '1', pack_note: '500 g' }, 'bricks')).toBe('brick · 1 (500 g)')
    expect(offerPackText({ pack_name: 'case', pack_size: '10' }, 'bricks')).toBe('case · 10 bricks')
    expect(packSizeText('brick', 1, 'bricks')).toBe('bricks')
    expect(packSizeText('case', 10, 'pitchables')).toBe('cases of 10 pitchables')
    expect(packSizeText('tub', 872, 'tablets')).toBe('tubs of 872 tablets')
    expect(formatQuantity('4', 'brick', '1', 'bricks', 'packs')).toBe('4 bricks')
    expect(formatQuantity('1', 'brick', '1', 'bricks', 'lb')).toBe('1 brick')
  })
})

describe('yeast labels and features', () => {
  it('the manufacturer is the Lab, required (no None); a strain and a yeast product', () => {
    expect(manufacturerLabel('yeast')).toBe('Lab')
    expect(manufacturerLabel('grains')).toBe('Maltster')
    expect(manufacturerLabel('fruits')).toBe('Manufacturer')
    expect(noManufacturerAllowed('yeast')).toBe(false)
    expect(noManufacturerAllowed('fruits')).toBe(true)
    expect(noManufacturerAllowed('hops')).toBe(false)
    expect(itemLabel('yeast')).toBe('Strain')
  })

  it('pickers lead with the strain and code ("Chico Ale US-05 · Fermentis")', () => {
    const p = { display_name: 'Chico Ale US-05 · Fermentis', form: 'Dry', name: 'US-05', ingredient: { name: 'Chico Ale' }, manufacturer: { name: 'Fermentis' }, category_key: 'yeast' }
    expect(pickerName(p)).toBe('Chico Ale US-05 · Fermentis')
    expect(pickerName({ ...p, display_name: 'x', category_key: 'hops', form: 'T90 Pellet', name: null, ingredient: { name: 'Citra' }, manufacturer: { name: 'YCH' } })).toBe('Citra T90 Pellet · YCH')
  })

  const yeastTypes: FeatureType[] = [
    { id: 1, key: 'ferm_temp_f', label: 'Fermentation temp', unit_label: '°F', min: '32', max: '100', decimals: 0, categories: [{ category_id: 9, name: 'Yeast Strains', sort_order: 0, required: false, product_mode: 'range', lot_mode: 'none', lot_required: false, only_unit: null, only_form: null }] },
    { id: 2, key: 'pitch_bbl', label: 'Pitch size', unit_label: 'bbl', min: '0.5', max: '60', decimals: 1, categories: [{ category_id: 9, name: 'Yeast Strains', sort_order: 2, required: false, product_mode: 'value', lot_mode: 'copy', lot_required: true, only_unit: null, only_form: 'Liquid' }] },
  ] as unknown as FeatureType[]

  it('pitch size is on Liquid lots, required there; Dry lots have neither it nor temp', () => {
    expect(lotTypesFor(yeastTypes, 9, null, 'Liquid').map((t) => t.key)).toEqual(['pitch_bbl'])
    expect(lotTypesFor(yeastTypes, 9, null, 'Dry')).toEqual([])
    expect(requiredLotKeys(yeastTypes, 9, null, 'Liquid')).toEqual(['pitch_bbl'])
    expect(requiredLotKeys(yeastTypes, 9, null, 'Dry')).toEqual([])
    // Without a form (a category-wide question), it's listed.
    expect(requiredLotKeys(yeastTypes, 9, null)).toEqual(['pitch_bbl'])
  })
})
