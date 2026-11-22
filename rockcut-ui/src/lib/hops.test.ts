import { describe, expect, it } from 'vitest'
import {
  HOP_FORMS,
  applicability,
  formatRange,
  isManagedCategory,
  keyedCategories,
  lotTypesFor,
  missingRequired,
  outsideRange,
  parseCropYear,
  productTypesFor,
  rangeDraftError,
  rangeDraftsFrom,
  rangesPayload,
  requiredLotKeys,
  toggleLabels,
} from './ingredientFeatures'
import { hopBoxPrice, hopBoxes } from './purchasing'
import type { FeatureApplicability, FeatureType, IngredientCategory } from './types'

// D62 Stage 2: the hop helpers.
const HOPS = 3
const GRAINS = 1
const BASE = 80

const type = (id: number, key: string, label: string, rows: Partial<FeatureApplicability>[], max = '100', decimals = 2): FeatureType => ({
  id,
  key,
  label,
  unit_label: '%',
  min: '0',
  max,
  decimals,
  entered_units: [],
  categories: rows.map((r, i) => ({ category_id: HOPS, name: '', sort_order: i, required: false, ...r })),
})

const hopRow = (lot_required = false): Partial<FeatureApplicability> => ({ category_id: HOPS, product_mode: 'range', lot_mode: 'enter', lot_required })
const alpha = type(6, 'alpha_acid_pct', 'Alpha acid', [hopRow(true)])
const beta = type(8, 'beta_acid_pct', 'Beta acid', [hopRow()])
const oil = type(9, 'total_oil_ml_100g', 'Total oil', [hopRow()], '10')
const extract = type(1, 'extract_fgdb', 'Extract', [{ category_id: GRAINS, product_mode: 'value', lot_mode: 'copy' }], '100', 1)
const yeastOnly = type(7, 'attenuation_pct', 'Attenuation', [{ category_id: HOPS, product_mode: 'none', lot_mode: 'none' }], '100', 0)
const types = [alpha, beta, oil, extract, yeastOnly]

const cat = (id: number, name: string, parent_id: number | null, key: string | null): IngredientCategory =>
  ({ id, name, parent_id, key, sort_order: 0 }) as IngredientCategory

describe('categories by key (D62)', () => {
  const categories = [cat(GRAINS, 'Malt (renamed)', null, 'grains'), cat(BASE, 'Base', GRAINS, null), cat(HOPS, 'Hops', null, 'hops'), cat(4, 'Fruits', null, 'fruits')]

  it('finds Hops by its key, with no children', () => {
    expect(keyedCategories(categories, 'hops')).toEqual({ category: categories[2], children: [] })
    expect(keyedCategories(categories, 'grains').children.map((c) => c.id)).toEqual([BASE])
    expect(keyedCategories(categories, 'yeast').category).toBeNull()
  })

  it('Grains, its children and Hops take no custom fields; D65 §4.1: nor does Fruits', () => {
    expect([GRAINS, BASE, HOPS, 4].map((id) => isManagedCategory(categories, id))).toEqual([true, true, true, true])
  })

  it('hop forms are the API list', () => {
    expect(HOP_FORMS).toEqual(['T90 Pellet', 'Cryo', 'Whole leaf', 'Extract'])
  })
})

describe('feature modes (§3.4)', () => {
  it('a hop product carries ranges; a lot enters values; alpha is required', () => {
    expect(applicability(alpha, HOPS)?.product_mode).toBe('range')
    expect(productTypesFor(types, HOPS).map((t) => t.key)).toEqual(['alpha_acid_pct', 'beta_acid_pct', 'total_oil_ml_100g'])
    expect(lotTypesFor(types, HOPS).map((t) => t.key)).toEqual(['alpha_acid_pct', 'beta_acid_pct', 'total_oil_ml_100g'])
    expect(requiredLotKeys(types, HOPS)).toEqual(['alpha_acid_pct'])
  })

  it('a grain child reads its parent row: a standard copied to the lot', () => {
    expect(applicability(extract, BASE, GRAINS)?.lot_mode).toBe('copy')
    expect(productTypesFor(types, BASE, GRAINS).map((t) => t.key)).toEqual(['extract_fgdb'])
    expect(requiredLotKeys(types, BASE, GRAINS)).toEqual([])
  })
})

describe('ranges', () => {
  it('reads "11–13", an open end, or nothing', () => {
    expect(formatRange({ value: '11', value_high: '13' }, 2)).toBe('11–13')
    expect(formatRange({ value: '11.5', value_high: '12.67' }, 2)).toBe('11.5–12.67')
    // D62 lead decisions 1, gap 2: one end, or the same both ends.
    expect(formatRange({ value: null, value_high: '4.5' }, 2)).toBe('≤ 4.5')
    expect(formatRange({ value: '2.5', value_high: null }, 2)).toBe('≥ 2.5')
    expect(formatRange({ value: '12.5', value_high: '12.50' }, 2)).toBe('12.5')
    expect(formatRange({ value: '', value_high: '' }, 2)).toBeNull()
    expect(formatRange(undefined, 2)).toBeNull()
  })

  it('marks a value outside it (an open end doesn\'t limit); inside, blank or no range is not marked', () => {
    const r = { value: '11', value_high: '13' }
    expect([outsideRange('14.1', r), outsideRange('10.99', r), outsideRange('11', r), outsideRange('13', r)]).toEqual([true, true, false, false])
    expect(outsideRange('20', { value: '11', value_high: null })).toBe(false)
    expect(outsideRange('', r)).toBe(false)
    expect(outsideRange('14', undefined)).toBe(false)
  })

  it('refuses low above high, an end out of bounds or with too many places; either end may be blank', () => {
    expect(rangeDraftError(alpha, { low: '13', high: '11' })).toBe('Alpha acid: low is above high')
    expect(rangeDraftError(oil, { low: '2.5', high: '10.5' })).toBe('Total oil must be between 0 and 10')
    expect(rangeDraftError(alpha, { low: '11.125', high: '' })).toBe('Alpha acid: Use at most 2 decimals')
    expect(rangeDraftError(alpha, { low: '', high: '13' })).toBeNull()
    expect(rangeDraftError(alpha, { low: '11', high: '11' })).toBeNull()
  })

  it('sends {low, high}, null to drop a stored one, nothing for an untouched empty pair', () => {
    const stored = { beta_acid_pct: { value: '3.5', value_high: '4.5', entered_value: null, entered_unit: null } }
    const drafts = rangeDraftsFrom(stored, [alpha, beta, oil])
    expect(drafts.beta_acid_pct).toEqual({ low: '3.5', high: '4.5' })
    expect(rangesPayload({ ...drafts, alpha_acid_pct: { low: '11', high: '' }, beta_acid_pct: { low: '', high: '' } }, stored)).toEqual({
      alpha_acid_pct: { low: '11', high: null },
      beta_acid_pct: null,
    })
  })
})

describe('hop lots', () => {
  it('crop year: 2000 through next year (Colorado), required', () => {
    expect(parseCropYear('2025', '2026-11-20')).toEqual({ year: 2025, error: null })
    expect(parseCropYear(' 2027 ', '2026-11-20')).toEqual({ year: 2027, error: null })
    expect(parseCropYear('2028', '2026-11-20').error).toBe('A year from 2000 to 2027')
    expect(parseCropYear('1999', '2026-11-20').error).toBe('A year from 2000 to 2027')
    expect(parseCropYear('25', '2026-11-20').error).toBe('A year from 2000 to 2027')
    expect(parseCropYear('', '2026-11-20').error).toBe('Enter the crop year')
  })

  it('names the required features left empty', () => {
    const empty = { text: '', entered_value: null, entered_unit: null }
    expect(missingRequired({ alpha_acid_pct: empty, beta_acid_pct: { ...empty, text: '4' } }, [alpha, beta], ['alpha_acid_pct'])).toEqual(['Alpha acid'])
    expect(missingRequired({ alpha_acid_pct: { ...empty, text: '12.4' } }, [alpha, beta], ['alpha_acid_pct'])).toEqual([])
  })
})

describe('toggle labels (lead, Stop 1 note 1)', () => {
  it('reads by the pack and unit; the second button is the unit', () => {
    expect(toggleLabels('sack', 'lb')).toEqual({ packsLabel: 'Sacks + lb', totalLabel: 'lb' })
    expect(toggleLabels('box', 'lb')).toEqual({ packsLabel: 'Boxes + lb', totalLabel: 'lb' })
    expect(toggleLabels('pail', 'gal')).toEqual({ packsLabel: 'Pails + gal', totalLabel: 'gal' })
  })
})

describe('hop contract lines (§3.7, A1)', () => {
  it('shows the box equivalent of the lb and the box price of the $/lb', () => {
    expect(hopBoxes('440')).toBe('440 lb = 40 boxes')
    expect(hopBoxes('11')).toBe('11 lb = 1 box')
    expect(hopBoxes('445')).toBe('445 lb = 40.45 boxes')
    expect(hopBoxes('4,400')).toBe('4,400 lb = 400 boxes')
    expect(hopBoxes('')).toBeNull()
    expect(hopBoxPrice('14.50')).toBe('$159.50 / box')
    expect(hopBoxPrice('x')).toBeNull()
  })
})
