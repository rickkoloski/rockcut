import { describe, expect, it } from 'vitest'
import { categoryOptions, differs, draftRangeError, draftsFrom, draftsValid, featuresPayload, grainCategories, onHandText, productMatches, rangeError, typesFor } from './ingredientFeatures'
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
  it('shows expired stock apart, in the same display', () => {
    expect(onHandText({ on_hand_lb: '682.5', expired_lb: '55', offers }, 'lb')).toBe('682.5 lb · 55 lb expired')
    expect(onHandText({ on_hand_lb: '682.5', expired_lb: '55', offers }, 'sacks')).toBe('12 sacks 22.5 lb · 1 sack expired')
    expect(onHandText({ on_hand_lb: '540', expired_lb: '0', offers }, 'sacks')).toBe('9 sacks 45 lb')
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
