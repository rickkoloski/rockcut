import { describe, expect, it } from 'vitest'
import { categoryOptions, differs, draftRangeError, draftsFrom, draftsValid, featuresPayload, grainCategories, isGrainCategory, onHandText, productMatches, rangeError, typesFor } from './ingredientFeatures'
import type { FeatureType, IngredientCategory, IngredientProduct } from './types'

const type = (id: number, key: string, cats: [number, number][]): FeatureType => ({
  id,
  key,
  label: key,
  unit_label: '',
  min: '0',
  max: '100',
  decimals: 1,
  entered_units: [],
  categories: cats.map(([category_id, sort_order]) => ({ category_id, name: '', sort_order, required: false })),
})

const types = [type(1, 'extract_fgdb', [[1, 0]]), type(2, 'color_lovibond', [[1, 1]]), type(5, 'moisture_pct', [[1, 4]]), type(6, 'alpha_acid_pct', [[3, 0]])]

describe('typesFor (D60 §3.4)', () => {
  it("applies a parent's features to its child, in their order", () => {
    expect(typesFor(types, 80, 1).map((t) => t.key)).toEqual(['extract_fgdb', 'color_lovibond', 'moisture_pct'])
    expect(typesFor(types, 3).map((t) => t.key)).toEqual(['alpha_acid_pct'])
    expect(typesFor(types, 99, null)).toEqual([])
  })
})

describe('feature drafts and the payload', () => {
  const stored = {
    extract_fgdb: { value: '81.5', entered_value: '37.7', entered_unit: 'ppg' },
    moisture_pct: { value: '4.7', entered_value: null, entered_unit: null },
  }

  it('fills the boxes from stored values', () => {
    expect(draftsFrom(stored, types.slice(0, 3))).toEqual({
      extract_fgdb: { text: '81.5', entered_value: '37.7', entered_unit: 'ppg' },
      color_lovibond: { text: '', entered_value: null, entered_unit: null },
      moisture_pct: { text: '4.7', entered_value: null, entered_unit: null },
    })
  })

  it('sends filled boxes (comma decimals too), null for an emptied one, nothing for an untouched empty one', () => {
    const drafts = {
      extract_fgdb: { text: '81.5', entered_value: '37.7', entered_unit: 'ppg' },
      color_lovibond: { text: '', entered_value: null, entered_unit: null },
      moisture_pct: { text: '', entered_value: null, entered_unit: null },
      protein_pct: { text: '11.2', entered_value: null, entered_unit: null },
    }
    expect(featuresPayload(drafts, stored)).toEqual({
      extract_fgdb: { value: '81.5', entered_value: '37.7', entered_unit: 'ppg' },
      moisture_pct: null,
      protein_pct: { value: '11.2', entered_value: null, entered_unit: null },
    })
  })

  it('a refused box makes the drafts invalid', () => {
    expect(draftsValid({ a: { text: '5.2', entered_value: null, entered_unit: null } })).toBe(true)
    expect(draftsValid({ a: { text: '5,2', entered_value: null, entered_unit: null } })).toBe(false)
    expect(draftsValid({ a: { text: '5x', entered_value: null, entered_unit: null } })).toBe(false)
  })

  it("D61 carry-over 4: more decimals than the feature type keeps make the drafts invalid", () => {
    const extract = type(1, 'extract_fgdb', [[1, 0]])
    const color = { ...type(2, 'color_lovibond', [[1, 1]]), decimals: 2 }
    const d = (text: string) => ({ text, entered_value: null, entered_unit: null })
    expect(draftsValid({ extract_fgdb: d('81.5'), color_lovibond: d('2.78') }, [extract, color])).toBe(true)
    expect(draftsValid({ extract_fgdb: d('81.55') }, [extract, color])).toBe(false)
    expect(draftsValid({ color_lovibond: d('2.789') }, [extract, color])).toBe(false)
    expect(draftsValid({ extract_fgdb: d('81.50') }, [extract])).toBe(true)
  })
})

describe('differs from the standard', () => {
  const v = (value: string) => ({ value, entered_value: null, entered_unit: null })
  it('compares numbers; one missing differs', () => {
    expect(differs(v('4.7'), v('4.70'))).toBe(false)
    expect(differs(v('5.2'), v('4.7'))).toBe(true)
    expect(differs(undefined, v('4.7'))).toBe(true)
    expect(differs(v('4.7'), undefined)).toBe(true)
    expect(differs(undefined, undefined)).toBe(false)
  })
})

describe('grain categories and search', () => {
  const cat = (id: number, name: string, parent_id: number | null, sort_order: number): IngredientCategory => ({
    id,
    name,
    parent_id,
    sort_order,
    field_definitions: null,
    inserted_at: '',
    updated_at: '',
  })

  it("finds Grains and its children in order", () => {
    const { grains, children } = grainCategories([cat(3, 'Hops', null, 2), cat(81, 'Crystal/Caramel', 1, 1), cat(1, 'Grains', null, 0), cat(80, 'Base', 1, 0)])
    expect(grains?.id).toBe(1)
    expect(children.map((c) => c.name)).toEqual(['Base', 'Crystal/Caramel'])
  })

  it('search matches grain, maltster, product name and suppliers', () => {
    const p = {
      display_name: 'Weyermann Rauch Malt (Beech Smoked Malt)',
      ingredient: { id: 1, name: 'Beech Smoked Malt', category: null },
      maltster: { id: 1, name: 'Weyermann' },
      name: 'Rauch Malt',
      offers: [{ supplier: { id: 8, name: 'BSG' }, order_name: 'Weyermann - Rauch' }],
    } as unknown as IngredientProduct
    for (const t of ['rauch', 'BEECH', 'weyer', 'bsg', '']) expect(productMatches(p, t), t).toBe(true)
    expect(productMatches(p, 'rahr')).toBe(false)
  })
})

describe('onHandText (§3.7)', () => {
  const offers = [{ sack_size_lb: '55', active: true }] as IngredientProduct['offers']
  it('D61 carry-over 3: usable and expired apart, in the same display; no expired, just the amount', () => {
    expect(onHandText({ on_hand_lb: '693', expired_lb: '43', offers: [{ sack_size_lb: '50', active: true }] as IngredientProduct['offers'] }, 'sacks')).toBe(
      '13 sacks usable · 43 lb expired',
    )
    expect(onHandText({ on_hand_lb: '693', expired_lb: '43', offers }, 'sacks')).toBe('11 sacks 45 lb usable · 43 lb expired')
    expect(onHandText({ on_hand_lb: '693', expired_lb: '43', offers }, 'lb')).toBe('650 lb usable · 43 lb expired')
    expect(onHandText({ on_hand_lb: '682.5', expired_lb: '55', offers }, 'sacks')).toBe('11 sacks 22.5 lb usable · 1 sack expired')
    expect(onHandText({ on_hand_lb: '540', expired_lb: '0', offers }, 'sacks')).toBe('9 sacks 45 lb')
    expect(onHandText({ on_hand_lb: '540', expired_lb: null, offers }, 'lb')).toBe('540 lb')
    // Floating point doesn't leak into the text.
    expect(onHandText({ on_hand_lb: '0.3', expired_lb: '0.1', offers }, 'lb')).toBe('0.2 lb usable · 0.1 lb expired')
  })
})

describe('lead decisions 2', () => {
  const v = (value: string) => ({ value })

  it('gap 4: changed from standard compares the values as shown', () => {
    expect(differs(v('2.789'), v('2.79'), 2)).toBe(false)
    expect(differs(v('80.1'), v('80.16'), 1)).toBe(true)
    expect(differs(v('11.50'), v('11.456'), 2)).toBe(true)
    expect(differs(v('80.14'), v('80.1'), 1)).toBe(false)
  })

  it('gaps 10, 11: a value outside the range is refused on the form, naming the feature', () => {
    const moisture = { ...type(5, 'moisture_pct', [[1, 0]]), label: 'Moisture' }
    const color = { ...type(2, 'color_lovibond', [[1, 0]]), label: 'Color', max: '1000' }
    expect(rangeError(moisture, 150)).toBe('Moisture must be between 0 and 100')
    expect(rangeError(color, 1001)).toBe('Color must be between 0 and 1,000')
    expect(rangeError(moisture, 100)).toBeNull()
    expect(rangeError(moisture, null)).toBeNull()
    const drafts = { moisture_pct: { text: '150', entered_value: null, entered_unit: null } }
    expect(draftRangeError(moisture, drafts.moisture_pct)).toBe('Moisture must be between 0 and 100')
    expect(draftsValid(drafts)).toBe(true)
    expect(draftsValid(drafts, [moisture])).toBe(false)
    expect(draftsValid({ moisture_pct: { text: '99.5', entered_value: null, entered_unit: null } }, [moisture])).toBe(true)
  })

  it('gap 8: pickers list each parent then its children', () => {
    const c = (id: number, name: string, sort_order: number, parent_id: number | null = null) => ({ id, name, sort_order, parent_id }) as IngredientCategory
    const options = categoryOptions([c(1, 'Grains', 0), c(2, 'Hops', 1), c(10, 'Crystal/Caramel', 1, 1), c(11, 'Base', 0, 1), c(3, 'Yeast Strains', 2)])
    expect(options.map((o) => `${'  '.repeat(o.depth)}${o.category.name}`)).toEqual(['Grains', '  Base', '  Crystal/Caramel', 'Hops', 'Yeast Strains'])
  })
})

describe('isGrainCategory (D61 carry-over 5)', () => {
  const cat = (id: number, name: string, parent_id: number | null) => ({ id, name, parent_id, sort_order: 0 }) as IngredientCategory
  const categories = [cat(1, 'Grains', null), cat(2, 'Base', 1), cat(3, 'Hops', null), cat(4, 'Pellets', 3)]
  it('is Grains and its children only', () => {
    expect([1, 2, 3, 4, 99].map((id) => isGrainCategory(categories, id))).toEqual([true, true, false, false, false])
    expect(isGrainCategory([], 1)).toBe(false)
  })
})
