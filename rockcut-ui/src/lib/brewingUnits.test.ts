import { describe, expect, it } from 'vitest'
import {
  asIsToFgdb,
  cleanIngredientSettings,
  ebcToLovibond,
  enteredAs,
  formatFeature,
  formatQuantity,
  lbToSacks,
  parseDecimal,
  ppgToFgdb,
  productSackSize,
  quantityDisplay,
  roundString,
  sacksToLb,
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

describe('quantities (§3.7, §3.9)', () => {
  it('sacks ↔ lb with a sack size', () => {
    expect(sacksToLb(12, 22.5, 55)).toBe(682.5)
    expect(sacksToLb(2, 10, 55)).toBe(120)
    expect(sacksToLb(0.5, 0, 50)).toBe(25)
    expect(lbToSacks(682.5, 55)).toEqual({ sacks: 12, lb: 22.5 })
    expect(lbToSacks(540, 55)).toEqual({ sacks: 9, lb: 45 })
    expect(lbToSacks(0.1 + 0.2, 55)).toEqual({ sacks: 0, lb: 0.3 })
  })

  it('formatQuantity: sacks + lb, whole sacks, under a sack, lb', () => {
    expect(formatQuantity('682.5', '55', 'sacks')).toBe('12 sacks 22.5 lb')
    expect(formatQuantity(660, 55, 'sacks')).toBe('12 sacks')
    expect(formatQuantity(55, 55, 'sacks')).toBe('1 sack')
    expect(formatQuantity(22.5, 55, 'sacks')).toBe('22.5 lb')
    expect(formatQuantity(0, 55, 'sacks')).toBe('0 lb')
    expect(formatQuantity('682.5', 55, 'lb')).toBe('682.5 lb')
    expect(formatQuantity(1650, 55, 'lb')).toBe('1,650 lb')
  })

  it('formatQuantity: no sack size is lb; a negative gets a minus; blank is a dash', () => {
    expect(formatQuantity(120, null, 'sacks')).toBe('120 lb')
    expect(formatQuantity(-120, 55, 'sacks')).toBe('−2 sacks 10 lb')
    expect(formatQuantity(-120, 55, 'lb')).toBe('−120 lb')
    expect(formatQuantity(null, 55, 'sacks')).toBe('—')
  })

  it("productSackSize: the stocked lots' one size, else the active offers'", () => {
    expect(productSackSize([{ sack_size_lb: '55' }])).toBe(55)
    expect(productSackSize([{ sack_size_lb: '55' }, { sack_size_lb: '50' }])).toBeNull()
    expect(productSackSize([{ sack_size_lb: '55' }, { sack_size_lb: '50', active: false }])).toBe(55)
    expect(productSackSize([], [])).toBeNull()
    expect(
      productSackSize(
        [{ sack_size_lb: '55' }, { sack_size_lb: '50' }],
        [
          { sack_size_lb: '50', on_hand_lb: '100' },
          { sack_size_lb: '55', on_hand_lb: '0' },
        ],
      ),
    ).toBe(50)
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
  it('keeps sacks or lb, drops anything else, and defaults to sacks', () => {
    expect(cleanIngredientSettings({ quantity_display: 'lb', other: 1 })).toEqual({ quantity_display: 'lb' })
    expect(cleanIngredientSettings({ quantity_display: 'kg' })).toEqual({})
    expect(cleanIngredientSettings(null)).toEqual({})
    expect(quantityDisplay(undefined)).toBe('sacks')
    expect(quantityDisplay({ quantity_display: 'lb' })).toBe('lb')
  })
})
