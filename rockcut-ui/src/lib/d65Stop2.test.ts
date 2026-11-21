// D65 Stop 2: features on fruit and sugar lots (only_form, standards vs typical ranges), ions, the pack note.
import { describe, expect, it } from 'vitest'
import { convertDecimals, formatFeature } from './brewingUnits'
import { ionsText, lotFeatureBasis, lotTypesFor } from './ingredientFeatures'
import { offerPackText, reorderOfferPack } from './purchasing'
import type { FeatureType } from './types'

const SUGARS = 7
const FRUITS = 5
const type = (id: number, key: string, rows: { category_id: number; product_mode: 'none' | 'value' | 'range'; lot_mode: 'none' | 'copy' | 'enter'; only_form?: string | null }[]): FeatureType =>
  ({
    id,
    key,
    label: key,
    unit_label: '',
    min: '0',
    max: '100',
    decimals: key === 'brix' ? 1 : 2,
    entered_units: [],
    categories: rows.map((r, i) => ({ name: '', sort_order: i, required: false, lot_required: false, ...r })),
  }) as unknown as FeatureType

const brix = type(10, 'brix', [
  { category_id: FRUITS, product_mode: 'range', lot_mode: 'enter' },
  { category_id: SUGARS, product_mode: 'none', lot_mode: 'enter', only_form: 'Liquid' },
])
const extract = type(1, 'extract_fgdb', [{ category_id: SUGARS, product_mode: 'value', lot_mode: 'copy' }])

describe('only_form (Brix on Liquid sugars)', () => {
  it('a Dry sugar lot has extract only; a Liquid one extract and Brix; fruit Brix', () => {
    expect(lotTypesFor([extract, brix], SUGARS, null, 'Dry').map((t) => t.key)).toEqual(['extract_fgdb'])
    expect(lotTypesFor([extract, brix], SUGARS, null, 'Liquid').map((t) => t.key)).toEqual(['extract_fgdb', 'brix'])
    expect(lotTypesFor([extract, brix], FRUITS, null, 'Purée').map((t) => t.key)).toEqual(['brix'])
    // Without a form (old callers), nothing is left out.
    expect(lotTypesFor([extract, brix], SUGARS).map((t) => t.key)).toEqual(['extract_fgdb', 'brix'])
  })
})

describe('lotFeatureBasis', () => {
  it('a standard (extract) prefills the lot; a typical range (fruit Brix) never does', () => {
    const values = { extract_fgdb: { value: '91', value_high: null }, brix: { value: '6.5', value_high: '9' } } as never
    expect(lotFeatureBasis(values, [extract], SUGARS)).toEqual({ standard: { extract_fgdb: { value: '91', value_high: null } }, typical: {} })
    expect(lotFeatureBasis(values, [brix], FRUITS)).toEqual({ standard: {}, typical: { brix: { value: '6.5', value_high: '9' } } })
    expect(lotFeatureBasis(null, [brix], FRUITS)).toEqual({ standard: {}, typical: {} })
  })
})

describe('ionsText', () => {
  it('the set ions in order, short labels, 1 decimal; null with none', () => {
    expect(ionsText({ so4_ppm_per_g_gal: '147.4', ca_ppm_per_g_gal: '61.5' })).toBe('Ca 61.5 · SO₄ 147.4')
    expect(ionsText({ hco3_ppm_per_g_gal: '191.9', na_ppm_per_g_gal: '72.3' })).toBe('HCO₃ 191.9 · Na 72.3')
    expect(ionsText({})).toBeNull()
    expect(ionsText(null)).toBeNull()
  })
})

describe('the pack note (A16)', () => {
  it('follows the pack wherever it reads by name; a sack has none', () => {
    expect(offerPackText({ pack_name: 'tub', pack_size: '872', pack_note: '5 lb' }, 'tablets')).toBe('tub · 872 tablets (5 lb)')
    expect(offerPackText({ pack_name: 'tub', pack_size: '872', pack_note: null }, 'tablets')).toBe('tub · 872 tablets')
    expect(reorderOfferPack({ pack_name: 'tub', pack_size: '872', pack_note: '5 lb' }, 'tablets')).toBe('tub · 872 tablets (5 lb)')
    expect(offerPackText({ pack_name: 'sack', pack_size: '55', form: 'whole' })).toBe('55 lb whole')
  })
})

describe('extract at 2 decimals reads as before', () => {
  it('extract trims to 1–2 places; Color still pads to its 2; a bare number pads as before', () => {
    expect(formatFeature('81.5', { key: 'extract_fgdb', decimals: 2 })).toBe('81.5')
    expect(formatFeature('91', { key: 'extract_fgdb', decimals: 2 })).toBe('91.0')
    expect(formatFeature('81.95', { key: 'extract_fgdb', decimals: 2 })).toBe('81.95')
    expect(formatFeature('2', { key: 'color_lovibond', decimals: 2 })).toBe('2.00')
    expect(formatFeature('8.5', 1)).toBe('8.5')
  })
})

describe('conversions round extract as D60 did', () => {
  it('extract converts to 1 place (37.0 PPG → 80.1); other features to their decimals', () => {
    expect(convertDecimals({ key: 'extract_fgdb', decimals: 2 })).toBe(1)
    expect(convertDecimals({ key: 'color_lovibond', decimals: 2 })).toBe(2)
  })
})

