// D63 Stop 1 (§5.1): g and mL, on the screens' side of every unit function.
import { describe, expect, it } from 'vitest'
import { copyQuantity, amountText, byUnitText, defaultPackName, offerPackText, reorderOfferPack, runningTotal, sumByUnit } from './purchasing'
import { formatQuantity, minQuantity, packSizeLabel, packSizeText, perUnitLabel, readQuantity, unitDecimals } from './brewingUnits'
import { toggleLabels, unitLabel, unitsFor } from './ingredientFeatures'

describe('g and mL', () => {
  it('are decimal units to 0.01, never counts', () => {
    for (const unit of ['g', 'mL']) {
      expect(unitDecimals(unit)).toBe(2)
      expect(minQuantity(unit)).toBe(`Enter at least 0.01 ${unit}`)
      expect(readQuantity('', '480.25', null, unit)).toEqual({ quantity: '480.25', valid: true })
      expect(readQuantity('', '480.255', null, unit).valid).toBe(false)
      expect(readQuantity('0.01', '', 0.5, unit).error).toBe(`Enter at least 0.01 ${unit}`)
      expect(perUnitLabel(unit)).toBe(unit)
      expect(copyQuantity('480.00', unit)).toBe('480.00')
    }
    expect(readQuantity('2', '', 250, 'g')).toEqual({ quantity: '500', valid: true })
    expect(readQuantity('1.5', '2500', 10_000, 'mL')).toEqual({ quantity: '17500', valid: true })
  })

  it('read in packs and the unit', () => {
    expect(formatQuantity(500, 'bag', 250, 'g', 'packs')).toBe('2 bags')
    expect(formatQuantity(480, 'bag', 250, 'g', 'packs')).toBe('1 bag 230 g')
    expect(formatQuantity(12_500.5, 'jug', 10_000, 'mL', 'packs')).toBe('1 jug 2,500.5 mL')
    expect(formatQuantity(10_000, 'jug', 10_000, 'mL', 'lb')).toBe('10,000 mL')
    expect(formatQuantity(1, null, null, 'g', 'packs')).toBe('1 g')
  })

  it('in offers, labels and toggles', () => {
    expect(offerPackText({ pack_name: 'bag', pack_size: '250.0' }, 'g')).toBe('bag · 250 g')
    expect(reorderOfferPack({ pack_name: 'jug', pack_size: '10000' }, 'mL')).toBe('jug · 10,000 mL')
    expect(packSizeLabel('bottle', 'mL')).toBe('Bottle size (mL)')
    expect(packSizeText('bag', 250, 'g')).toBe('250 g bags')
    expect(packSizeText('jug', '10000.0', 'mL')).toBe('10,000 mL jugs')
    expect(toggleLabels('bag', 'g')).toEqual({ packsLabel: 'Bags + g', totalLabel: 'g' })
    expect(unitLabel({ unit: 'mL', form: 'Liquid', category_key: 'consumables' })).toBe('mL')
    expect(unitsFor({ units: ['fl oz', 'lb', 'each', 'g', 'mL'], form_units: {} }, 'Powder')).toContain('g')
    const defaults = { 'fl oz': 'jug', g: 'bag', mL: 'bottle' }
    expect(defaultPackName(defaults, 'g', ['jug', 'bottle', 'bag', 'tub'])).toBe('bag')
    expect(defaultPackName(defaults, 'mL', ['jug', 'bottle', 'bag', 'tub'])).toBe('bottle')
  })

  it('have their own subtotals', () => {
    const by = sumByUnit([
      { unit: 'mL', quantity: 10_000 },
      { unit: 'g', quantity: 500 },
      { unit: 'lb', quantity: 50 },
      { unit: 'g', quantity: 0.25 },
    ])
    expect(byUnitText(by)).toBe('500.25 g · 50 lb · 10,000 mL')
    expect(amountText(0, 'g')).toBe('0 g')
    const order = runningTotal([
      { packs: 2, packSize: 250, packName: 'bag', unit: 'g', price: 18.5 },
      { packs: 1, packSize: 10_000, packName: 'jug', unit: 'mL', price: 355 },
    ])
    expect(order.text).toBe('3 packs · 500 g · 10,000 mL · $392.00')
  })
})
