import { describe, expect, it } from 'vitest'
import {
  asIsToFgdb,
  cleanIngredientSettings,
  ebcToLovibond,
  enteredAs,
  formatFeature,
  formatQuantity,
  lotPack,
  packPlural,
  packSizeLabel,
  packsToQuantity,
  parseDecimal,
  ppgToFgdb,
  productPack,
  quantityDisplay,
  quantityToPacks,
  readQuantity,
  roundString,
  srmToLovibond,
  toStored,
  wkToLintner,
} from './brewingUnits'

describe('conversions (D60 §3.5)', () => {
  it('as-is % → % FGDB with the moisture', () => {
    const r = asIsToFgdb(77.5, 4.5)
    expect(r.ok && r.value).toBeCloseTo(81.152, 3)
  })

  it('as-is needs a moisture under 100', () => {
    expect(asIsToFgdb(77.5, null)).toEqual({ ok: false, error: 'Enter the moisture first: as-is extract needs it' })
    expect(asIsToFgdb(77.5, undefined).ok).toBe(false)
    expect(asIsToFgdb(77.5, 100).ok).toBe(false)
    expect(asIsToFgdb(77.5, 120).ok).toBe(false)
    expect(asIsToFgdb(77.5, 0)).toEqual({ ok: true, value: 77.5 })
  })

  it('PPG → % FGDB: 37.0 PPG stores 80.1 (spec §9)', () => {
    expect(ppgToFgdb(37)).toBeCloseTo(80.0623, 4)
    expect(roundString(ppgToFgdb(37), 1)).toBe('80.1')
    expect(ppgToFgdb(46.214)).toBeCloseTo(100, 10)
  })

  it('SRM → °L: 3.0 SRM is 2.78 °L', () => {
    expect(srmToLovibond(3)).toBeCloseTo(2.7757, 4)
    expect(roundString(srmToLovibond(3), 2)).toBe('2.78')
  })

  it('EBC → °L', () => {
    expect(ebcToLovibond(5.91)).toBeCloseTo((5.91 / 1.97 + 0.76) / 1.3546, 10)
    expect(ebcToLovibond(5.91)).toBeCloseTo(2.7757, 3)
  })

  it('°WK → °Lintner', () => {
    expect(wkToLintner(250)).toBeCloseTo(76, 10)
  })

  it('toStored picks the conversion; the stored unit passes through', () => {
    expect(toStored('fgdb', 81)).toEqual({ ok: true, value: 81 })
    expect(toStored('lovibond', 2.5)).toEqual({ ok: true, value: 2.5 })
    expect(toStored('lintner', 140)).toEqual({ ok: true, value: 140 })
    expect(toStored('as_is', 77.5).ok).toBe(false)
    const asIs = toStored('as_is', 77.5, 4.5)
    expect(asIs.ok && asIs.value).toBeCloseTo(81.152, 3)
    const wk = toStored('wk', 250)
    expect(wk.ok && wk.value).toBeCloseTo(76, 10)
  })
})

describe('parseDecimal with decimals (D61 carry-over 4)', () => {
  it('refuses more places than the field keeps, with "Use at most N decimals"', () => {
    expect(parseDecimal('1.555', 2)).toEqual({ ok: false, error: 'Use at most 2 decimals' })
    expect(parseDecimal('81.55', 1)).toEqual({ ok: false, error: 'Use at most 1 decimal' })
    expect(parseDecimal('78.5', 0)).toEqual({ ok: false, error: 'Use a whole number' })
    expect(parseDecimal('1,234.567', 2)).toEqual({ ok: false, error: 'Use at most 2 decimals' })
  })

  it('takes up to that many, trailing zeros not counted; no limit without decimals', () => {
    expect(parseDecimal('1.55', 2)).toEqual({ ok: true, value: '1.55' })
    expect(parseDecimal('1.5500', 2)).toEqual({ ok: true, value: '1.5500' })
    expect(parseDecimal('78.0', 0)).toEqual({ ok: true, value: '78.0' })
    expect(parseDecimal('78', 0)).toEqual({ ok: true, value: '78' })
    expect(parseDecimal('', 2)).toEqual({ ok: true, value: null })
    expect(parseDecimal('1.55555')).toEqual({ ok: true, value: '1.55555' })
  })
})

describe('parseDecimal (4982, gap 3)', () => {
  it('takes . as the decimal point', () => {
    expect(parseDecimal('5.2')).toEqual({ ok: true, value: '5.2' })
    expect(parseDecimal(' 12 ')).toEqual({ ok: true, value: '12' })
    expect(parseDecimal('.5')).toEqual({ ok: true, value: '0.5' })
    expect(parseDecimal('5.')).toEqual({ ok: true, value: '5' })
  })

  it('takes commas only as thousands separators in groups of three', () => {
    expect(parseDecimal('1,234')).toEqual({ ok: true, value: '1234' })
    expect(parseDecimal('12,345.5')).toEqual({ ok: true, value: '12345.5' })
    expect(parseDecimal('1,234,567.25')).toEqual({ ok: true, value: '1234567.25' })
    expect(parseDecimal('1,234.5')).toEqual({ ok: true, value: '1234.5' })
  })

  it('refuses a comma decimal with "Use . for the decimal point"', () => {
    for (const bad of ['5,2', '1,23', '1,2345', ',5', '1.234,5', '12,34,567', ',']) {
      expect(parseDecimal(bad), bad).toEqual({ ok: false, error: 'Use . for the decimal point' })
    }
  })

  it('refuses a negative number with "Enter 0 or more"', () => {
    expect(parseDecimal('-1')).toEqual({ ok: false, error: 'Enter 0 or more' })
    expect(parseDecimal('-16.5')).toEqual({ ok: false, error: 'Enter 0 or more' })
  })

  it('empty is null', () => {
    expect(parseDecimal('')).toEqual({ ok: true, value: null })
    expect(parseDecimal('  ')).toEqual({ ok: true, value: null })
  })

  it('refuses anything else', () => {
    for (const bad of ['abc', '1.2.3', '5e3', '1 000', '.', '12lb', '-', '5-']) {
      expect(parseDecimal(bad).ok, bad).toBe(false)
    }
  })
})

describe('quantities (§3.7, §3.9; D62 §3.5 packs and units)', () => {
  it('packs ↔ the unit with a pack size (sacks ↔ lb for grain)', () => {
    expect(packsToQuantity(12, 22.5, 55)).toBe(682.5)
    expect(packsToQuantity(2, 10, 55)).toBe(120)
    expect(packsToQuantity(0.5, 0, 50)).toBe(25)
    expect(quantityToPacks(682.5, 55)).toEqual({ packs: 12, loose: 22.5 })
    expect(quantityToPacks(540, 55)).toEqual({ packs: 9, loose: 45 })
    expect(quantityToPacks(0.1 + 0.2, 55)).toEqual({ packs: 0, loose: 0.3 })
  })

  it('formatQuantity: sacks + lb, whole sacks, under a sack, lb', () => {
    expect(formatQuantity('682.5', 'sack', '55', 'lb', 'packs')).toBe('12 sacks 22.5 lb')
    expect(formatQuantity(660, 'sack', 55, 'lb', 'packs')).toBe('12 sacks')
    expect(formatQuantity(55, 'sack', 55, 'lb', 'packs')).toBe('1 sack')
    expect(formatQuantity(22.5, 'sack', 55, 'lb', 'packs')).toBe('22.5 lb')
    expect(formatQuantity(0, 'sack', 55, 'lb', 'packs')).toBe('0 lb')
    expect(formatQuantity('682.5', 'sack', 55, 'lb', 'lb')).toBe('682.5 lb')
    expect(formatQuantity(1650, 'sack', 55, 'lb', 'lb')).toBe('1,650 lb')
  })

  it('formatQuantity: no pack size is the total; a negative gets a minus; blank is a dash', () => {
    expect(formatQuantity(120, 'sack', null, 'lb', 'packs')).toBe('120 lb')
    expect(formatQuantity(-120, 'sack', 55, 'lb', 'packs')).toBe('−2 sacks 10 lb')
    expect(formatQuantity(-120, 'sack', 55, 'lb', 'lb')).toBe('−120 lb')
    expect(formatQuantity(null, 'sack', 55, 'lb', 'packs')).toBe('—')
  })

  it('formatQuantity: other packs and units (D62 §3.5)', () => {
    expect(formatQuantity(48.5, 'box', 11, 'lb', 'packs')).toBe('4 boxes 4.5 lb')
    expect(formatQuantity(11, 'box', 11, 'lb', 'packs')).toBe('1 box')
    expect(formatQuantity(11.5, 'pail', 5, 'gal', 'packs')).toBe('2 pails 1.5 gal')
    expect(formatQuantity(11.5, 'pail', 5, 'gal', 'lb')).toBe('11.5 gal')
    expect(formatQuantity(300, 'jug', 128, 'fl oz', 'packs')).toBe('2 jugs 44 fl oz')
    expect(formatQuantity(37.5, 'box', 11, 'lb', 'lb')).toBe('37.5 lb')
  })

  it('formatQuantity: each is whole numbers', () => {
    expect(formatQuantity(2600, 'tub', 1000, 'each', 'packs')).toBe('2 tubs 600 each')
    expect(formatQuantity(600.4, 'tub', 1000, 'each', 'packs')).toBe('600 each')
    expect(formatQuantity(600.6, 'tub', 1000, 'each', 'lb')).toBe('601 each')
    expect(quantityToPacks(2600.4, 1000, 'each')).toEqual({ packs: 2, loose: 600 })
    expect(packsToQuantity(1, 0.6, 1000, 'each')).toBe(1001)
  })

  it('pack plurals and labels', () => {
    expect(['sack', 'box', 'bag', 'pail', 'jug', 'bottle', 'tub', 'case', 'each'].map(packPlural)).toEqual([
      'sacks',
      'boxes',
      'bags',
      'pails',
      'jugs',
      'bottles',
      'tubs',
      'cases',
      'each',
    ])
    expect(packPlural(null)).toBe('packs')
    expect(packSizeLabel('sack', 'lb')).toBe('Sack size (lb)')
    expect(packSizeLabel('pail', 'gal')).toBe('Pail size (gal)')
  })

  it("productPack: the stocked lots' one pack, else the active offers'", () => {
    const sack = (size: string, more = {}) => ({ pack_name: 'sack', pack_size: size, ...more })
    expect(productPack([sack('55')])).toEqual({ name: 'sack', size: 55 })
    expect(productPack([sack('55'), sack('50')])).toBeNull()
    expect(productPack([sack('55'), sack('50', { active: false })])).toEqual({ name: 'sack', size: 55 })
    expect(productPack([], [])).toBeNull()
    expect(productPack([sack('55'), sack('50')], [sack('50', { on_hand: '100' }), sack('55', { on_hand: '0' })])).toEqual({ name: 'sack', size: 50 })
    // A box and a sack of the same size are two packs.
    expect(productPack([sack('11'), { pack_name: 'box', pack_size: '11' }])).toBeNull()
    expect(lotPack({ pack_name: 'sack', pack_size: null })).toBeNull()
  })
})

describe('reading a quantity box (lead decisions 3, gap 16)', () => {
  it('refuses over 0 but under 0.01 lb (a fraction of a tiny sack)', () => {
    expect(readQuantity('0.01', '', 0.5)).toEqual({ quantity: null, valid: false, error: 'Enter at least 0.01 lb' })
    expect(readQuantity('', '0.001', null, 'gal')).toEqual({ quantity: null, valid: false })
    expect(readQuantity('0.01', '', 0.5, 'gal')).toEqual({ quantity: null, valid: false, error: 'Enter at least 0.01 gal' })
  })

  it('D61 carry-over 4: refuses more than 2 decimals in either box (was rounded, or under 0.01 lb)', () => {
    expect(readQuantity('', '1.555', null)).toEqual({ quantity: null, valid: false })
    expect(readQuantity('', '0.001', null)).toEqual({ quantity: null, valid: false })
    expect(readQuantity('', '0.009', 50)).toEqual({ quantity: null, valid: false })
    expect(readQuantity('0.0001', '', 50)).toEqual({ quantity: null, valid: false })
    expect(readQuantity('', '1.55', null)).toEqual({ quantity: '1.55', valid: true })
    expect(readQuantity('', '1.550', null)).toEqual({ quantity: '1.55', valid: true })
  })

  it('keeps 0.01 lb, 0 (a count of nothing) and empty boxes', () => {
    expect(readQuantity('', '0.01', null)).toEqual({ quantity: '0.01', valid: true })
    expect(readQuantity('', '0', null)).toEqual({ quantity: '0', valid: true })
    expect(readQuantity('0', '0', 50)).toEqual({ quantity: '0', valid: true })
    expect(readQuantity('', '', 50)).toEqual({ quantity: null, valid: true })
  })

  it('adds packs and the loose part; a box that is refused is invalid with no quantity', () => {
    expect(readQuantity('2', '5.5', 50)).toEqual({ quantity: '105.5', valid: true })
    expect(readQuantity('1,234', '', null)).toEqual({ quantity: null, valid: true })
    expect(readQuantity('', '1,234', null)).toEqual({ quantity: '1234', valid: true })
    expect(readQuantity('', '5,2', null)).toEqual({ quantity: null, valid: false })
  })
})

describe('feature values', () => {
  it("formatFeature uses the type's decimals", () => {
    expect(formatFeature('2.8', 2)).toBe('2.80')
    expect(formatFeature('81', 1)).toBe('81.0')
    expect(formatFeature('0', 1)).toBe('0.0')
    expect(formatFeature(null, 1)).toBe('—')
  })

  it('enteredAs says what was typed', () => {
    expect(enteredAs({ entered_value: '3', entered_unit: 'srm' })).toBe('entered as 3.0 SRM')
    expect(enteredAs({ entered_value: '37.5', entered_unit: 'ppg' })).toBe('entered as 37.5 PPG')
    expect(enteredAs({ entered_value: null, entered_unit: null })).toBeNull()
    expect(enteredAs(null)).toBeNull()
  })
})

describe('the quantity display setting (§3.9)', () => {
  it('keeps packs or lb (the total), drops anything else (the old sacks too), and defaults to packs', () => {
    expect(cleanIngredientSettings({ quantity_display: 'lb', other: 1 })).toEqual({ quantity_display: 'lb' })
    expect(cleanIngredientSettings({ quantity_display: 'kg' })).toEqual({})
    expect(cleanIngredientSettings(null)).toEqual({})
    expect(cleanIngredientSettings({ quantity_display: 'packs' })).toEqual({ quantity_display: 'packs' })
    expect(cleanIngredientSettings({ quantity_display: 'sacks' })).toEqual({})
    expect(quantityDisplay(undefined)).toBe('packs')
    expect(quantityDisplay({ quantity_display: 'lb' })).toBe('lb')
  })
})
