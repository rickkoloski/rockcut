// D60 §3.4: feature values (a product's standard specs, a lot's
// specs) on the screens: which feature types apply to a category, the boxes'
// drafts, the payload the API takes, and a lot value that differs from the
// standard.
import { boxText, formatQuantity, packPlural, paddedRange, parseDecimal, productPack, type Pack, type QuantityDisplay } from './brewingUnits'
import type { FeatureApplicability, FeatureType, FeatureValue, FeatureValues, IngredientCategory, IngredientProduct } from './types'

/** One feature's box: the text typed, and what was typed in another unit when the convert popup filled it. */
export interface FeatureDraft {
  text: string
  entered_value: string | null
  entered_unit: string | null
}

export type FeatureDrafts = Record<string, FeatureDraft>

/** The feature types that apply to a category or its parent, in their sort order. */
export function typesFor(types: FeatureType[], categoryId: number | null | undefined, parentId?: number | null): FeatureType[] {
  const ids = new Set([categoryId, parentId].filter((id): id is number => id != null))
  const order = (t: FeatureType) => Math.min(...(t.categories ?? []).filter((c) => ids.has(c.category_id)).map((c) => c.sort_order))
  return types
    .filter((t) => (t.categories ?? []).some((c) => ids.has(c.category_id)))
    .sort((a, b) => order(a) - order(b) || a.id - b.id)
}

/** Boxes filled from stored values (blank where there's none). */
export function draftsFrom(values: FeatureValues | null | undefined, types: FeatureType[]): FeatureDrafts {
  return Object.fromEntries(
    types.map((t) => {
      const v = values?.[t.key]
      return [t.key, { text: boxText(v?.value, t), entered_value: v?.entered_value ?? null, entered_unit: v?.entered_unit ?? null }]
    }),
  )
}

const bound = (v: string | null) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 4 })

/**
 * "Moisture must be between 0 and 100" when `value` is outside the type's
 * range (the API's own check, gap 10/11: refused on the form, not only by the
 * server); null inside it or with no number.
 */
export function rangeError(type: Pick<FeatureType, 'label' | 'min' | 'max'>, value: number | null): string | null {
  if (value == null || Number.isNaN(value)) return null
  const low = type.min != null && value < Number(type.min)
  const high = type.max != null && value > Number(type.max)
  return low || high ? `${type.label} must be between ${bound(type.min)} and ${bound(type.max)}` : null
}

/** A box's range message (null when it's empty, refused as text, or in range). */
export function draftRangeError(type: FeatureType, draft: FeatureDraft | undefined): string | null {
  const parsed = parseDecimal(draft?.text ?? '')
  return parsed.ok && parsed.value != null ? rangeError(type, Number(parsed.value)) : null
}

/**
 * True when every box holds a number or nothing, and (given the types) each
 * number has at most its type's decimals (D61 carry-over 4) and is in its range.
 */
export function draftsValid(drafts: FeatureDrafts, types: FeatureType[] = []): boolean {
  const decimals = new Map(types.map((t) => [t.key, t.decimals]))
  return Object.entries(drafts).every(([key, d]) => parseDecimal(d.text, decimals.get(key)).ok) && types.every((t) => !draftRangeError(t, drafts[t.key]))
}

/**
 * The `features` the API takes: each filled box as `{value, entered_value,
 * entered_unit}`, and `null` for a box emptied that had a stored value
 * (removes it). Untouched empty boxes are left out.
 */
export function featuresPayload(
  drafts: FeatureDrafts,
  stored?: FeatureValues | null,
): Record<string, { value: string; entered_value: string | null; entered_unit: string | null } | null> {
  const out: Record<string, { value: string; entered_value: string | null; entered_unit: string | null } | null> = {}
  for (const [key, d] of Object.entries(drafts)) {
    const parsed = parseDecimal(d.text)
    if (!parsed.ok) continue
    if (parsed.value == null) {
      if (stored?.[key]) out[key] = null
      continue
    }
    out[key] = { value: parsed.value, entered_value: d.entered_unit ? d.entered_value : null, entered_unit: d.entered_unit }
  }
  return out
}

/**
 * A lot's value that isn't the product's standard (one present without the
 * other counts). Compared as shown, at the type's `decimals` (gap 4: 2.789
 * and 2.79 both read 2.79 °L, so neither is "changed"); the lots list and
 * the lot dialog both use this.
 */
export function differs(lot: Pick<FeatureValue, 'value'> | undefined, standard: Pick<FeatureValue, 'value'> | undefined, decimals?: number): boolean {
  if (!lot && !standard) return false
  if (!lot || !standard) return true
  if (decimals == null) return Number(lot.value) !== Number(standard.value)
  return Number(lot.value).toFixed(decimals) !== Number(standard.value).toFixed(decimals)
}

/**
 * Grains and its children, for the grains screens: the parent, and the
 * children in order. D62: found by the category's key, so renaming Grains
 * in Settings changes nothing.
 */
export function grainCategories(categories: IngredientCategory[]): { grains: IngredientCategory | null; children: IngredientCategory[] } {
  const grains = categories.find((c) => c.key === 'grains' && c.parent_id == null) ?? null
  const children = grains ? categories.filter((c) => c.parent_id === grains.id).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)) : []
  return { grains, children }
}

/**
 * D62: the top-level category with `key` and its children, in order (Grains
 * and Base, Crystal/Caramel, …; Hops and none).
 */
export function keyedCategories(categories: IngredientCategory[], key: string): { category: IngredientCategory | null; children: IngredientCategory[] } {
  const category = categories.find((c) => c.key === key && c.parent_id == null) ?? null
  const children = category ? categories.filter((c) => c.parent_id === category.id).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)) : []
  return { category, children }
}

/** D62 §3.6 (amendments): a hop product's forms, as the API lists them. */
export const HOP_FORMS = ['T90 Pellet', 'Cryo', 'Whole leaf', 'Extract'] as const

/**
 * D62: the categories with products, packs and movements. D65 §4.2: every
 * key but Yeast Strains (D64) and Future Ingredients.
 */
export const MANAGED_KEYS = ['grains', 'hops', 'fruits', 'spices', 'sugars', 'consumables'] as const
export const isManagedKey = (key: string | null | undefined) => !!key && (MANAGED_KEYS as readonly string[]).includes(key)

/** D65: the categories whose products take a form and unit from the catalog's lists and may have no manufacturer. */
export const D65_KEYS = ['fruits', 'spices', 'sugars', 'consumables'] as const
export const isD65Key = (key: string | null | undefined) => !!key && (D65_KEYS as readonly string[]).includes(key)

/** What one of a category's items is called on its screens ("Grain", "Hop"). */
export const itemLabel = (key: string | null | undefined) => (key === 'hops' ? 'Hop' : key === 'grains' ? 'Grain' : 'Ingredient')

/** D65 decision 8: a product's manufacturer as screens say it; "None" when there isn't one. */
export const makerName = (p: { manufacturer?: { name: string } | null } | null | undefined) => p?.manufacturer?.name ?? 'None'

/** D65 §4.3: a product's unit as screens say it ("tablets" for `each` on a Tablet product). */
export const unitLabel = (p: { unit?: string | null; unit_label?: string | null; form?: string | null } | null | undefined): string =>
  p?.unit_label ?? (p?.unit === 'each' && p?.form === 'Tablet' ? 'tablets' : (p?.unit ?? 'lb'))

/**
 * D65 §4.2: the units a product of `form` may be in, from its category's
 * catalog: Sugars by form (Dry lb; Liquid lb or gal), the rest the list.
 */
export function unitsFor(catalog: { units: string[]; form_units?: Record<string, string[]> } | null | undefined, form: string | null | undefined): string[] {
  if (!catalog) return []
  return (form && catalog.form_units?.[form]) || catalog.units
}

/** What one of a category's products is called ("Maltster product", "Hop product"). */
export const productLabel = (key: string | null | undefined) => (key === 'grains' ? 'Maltster product' : key === 'hops' ? 'Hop product' : 'Product')

/**
 * D62 §3.4: how a feature lives in a category (or its parent): its
 * applicability row, the category's own first; null when it doesn't apply.
 */
export function applicability(type: Pick<FeatureType, 'categories'>, categoryId: number | null | undefined, parentId?: number | null): FeatureApplicability | null {
  const rows = type.categories ?? []
  return rows.find((c) => c.category_id === categoryId) ?? rows.find((c) => parentId != null && c.category_id === parentId) ?? null
}

/** The feature types a category's products carry (a standard or a range), in order. */
export function productTypesFor(types: FeatureType[], categoryId: number | null | undefined, parentId?: number | null): FeatureType[] {
  return typesFor(types, categoryId, parentId).filter((t) => (applicability(t, categoryId, parentId)?.product_mode ?? 'value') !== 'none')
}

/**
 * The feature types a category's lots carry (copied or entered), in order.
 * D65: with the product's `form`, a feature for another form only (Brix on
 * Liquid sugars) is left out.
 */
export function lotTypesFor(types: FeatureType[], categoryId: number | null | undefined, parentId?: number | null, form?: string | null): FeatureType[] {
  return typesFor(types, categoryId, parentId).filter((t) => {
    const a = applicability(t, categoryId, parentId)
    return (a?.lot_mode ?? 'copy') !== 'none' && (!a?.only_form || form === undefined || a.only_form === form)
  })
}

/** The keys of the features a category's lots must have (hops: alpha acid). */
export function requiredLotKeys(types: FeatureType[], categoryId: number | null | undefined, parentId?: number | null): string[] {
  return typesFor(types, categoryId, parentId)
    .filter((t) => applicability(t, categoryId, parentId)?.lot_required)
    .map((t) => t.key)
}

/** True when the category keeps this feature as a typical range on the product. */
export const isRangeType = (type: FeatureType, categoryId: number | null | undefined, parentId?: number | null) =>
  applicability(type, categoryId, parentId)?.product_mode === 'range'

/**
 * A range as the screens show it (D62 lead decisions 1, gap 2): "11–13",
 * "12.5" when both ends are the same, "≥ 12" with no high end, "≤ 9" with no
 * low end; null with neither. The caller adds the unit.
 */
export function formatRange(v: Pick<FeatureValue, 'value' | 'value_high'> | null | undefined, type: number | { key: string; decimals: number }): string | null {
  // Ranges read as typed on the supplier's sheet, without padding ("11–13", not "11.00–13.00");
  // D65 lead decisions 1 (gap 4): Brix always shows its one place ("6.5–9.0").
  const decimals = typeof type === 'number' ? type : type.decimals
  const min = paddedRange(type) ? decimals : 0
  const end = (x: string | null | undefined) => (x != null && x !== '' ? Number(x).toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: decimals }) : '')
  const low = end(v?.value)
  const high = end(v?.value_high)
  if (low && high) return low === high ? low : `${low}–${high}`
  if (low) return `≥ ${low}`
  if (high) return `≤ ${high}`
  return null
}

/** True when `value` lies outside the range (an open end doesn't limit); false with no value or range. */
export function outsideRange(value: string | number | null | undefined, range: Pick<FeatureValue, 'value' | 'value_high'> | null | undefined): boolean {
  if (value == null || value === '' || !range) return false
  const n = Number(value)
  if (Number.isNaN(n)) return false
  const low = range.value != null && range.value !== '' ? Number(range.value) : null
  const high = range.value_high != null && range.value_high !== '' ? Number(range.value_high) : null
  return (low != null && n < low) || (high != null && n > high)
}

/** A range's two boxes (D62 §3.4). */
export interface RangeDraft {
  low: string
  high: string
}

export type RangeDrafts = Record<string, RangeDraft>

/** Range boxes filled from stored values. */
export function rangeDraftsFrom(values: FeatureValues | null | undefined, types: FeatureType[]): RangeDrafts {
  return Object.fromEntries(types.map((t) => [t.key, { low: boxText(values?.[t.key]?.value, t), high: boxText(values?.[t.key]?.value_high, t) }]))
}

/**
 * What's wrong with a range's boxes, as the API says it: an end that isn't
 * a number, has too many decimals or is out of bounds, or "Alpha acid: low
 * is above high"; null when it's fine (either end may be blank).
 */
export function rangeDraftError(type: FeatureType, d: RangeDraft | undefined): string | null {
  const low = parseDecimal(d?.low ?? '', type.decimals)
  const high = parseDecimal(d?.high ?? '', type.decimals)
  if (!low.ok) return `${type.label}: ${low.error}`
  if (!high.ok) return `${type.label}: ${high.error}`
  const bounds = rangeError(type, low.value == null ? null : Number(low.value)) ?? rangeError(type, high.value == null ? null : Number(high.value))
  if (bounds) return bounds
  if (low.value != null && high.value != null && Number(low.value) > Number(high.value)) return `${type.label}: low is above high`
  return null
}

/**
 * The `features` the API takes for ranges: `{low, high}` per range with
 * either end filled, `null` for one emptied that had a stored value.
 */
export function rangesPayload(drafts: RangeDrafts, stored?: FeatureValues | null): Record<string, { low: string | null; high: string | null } | null> {
  const out: Record<string, { low: string | null; high: string | null } | null> = {}
  for (const [key, d] of Object.entries(drafts)) {
    const low = parseDecimal(d.low)
    const high = parseDecimal(d.high)
    if (!low.ok || !high.ok) continue
    if (low.value == null && high.value == null) {
      if (stored?.[key]) out[key] = null
      continue
    }
    out[key] = { low: low.value, high: high.value }
  }
  return out
}

/**
 * D62: a category's key, or its parent's for a child (`grains`, `hops`, …);
 * null when neither has one.
 */
export function categoryKey(
  categories: Pick<IngredientCategory, 'id' | 'key' | 'parent_id'>[],
  category: Pick<IngredientCategory, 'id' | 'parent_id'> & { key?: string | null } | null | undefined,
): string | null {
  if (!category) return null
  if (category.key) return category.key
  const parent = category.parent_id != null ? categories.find((c) => c.id === category.parent_id) : null
  return parent?.key ?? null
}

/**
 * D62 lead decisions 1, gap 5: the manufacturers with products in the
 * categories with these keys (grain screens list maltsters, not hop growers),
 * in the order given. `keep` (a product's current manufacturer) stays in
 * whatever it makes.
 */
export function manufacturersFor<T extends { id: number }>(
  parties: T[],
  products: Pick<IngredientProduct, 'manufacturer_party_id' | 'category_key'>[],
  keys: readonly string[],
  keep?: number | null,
): T[] {
  const ids = new Set(products.filter((p) => p.category_key != null && keys.includes(p.category_key)).map((p) => p.manufacturer_party_id))
  return parties.filter((p) => ids.has(p.id) || p.id === keep)
}

/** D62 §3.2: what the manufacturer is called on a category's screens ("Maltster" for grain). */
export const manufacturerLabel = (key: string | null | undefined) => (key === 'grains' ? 'Maltster' : 'Manufacturer')

/** True for Grains and its children (D61 carry-over 5: they take no custom fields). */
export function isGrainCategory(categories: IngredientCategory[], id: number): boolean {
  const { grains, children } = grainCategories(categories)
  return !!grains && (grains.id === id || children.some((c) => c.id === id))
}

/**
 * D62 §3.1: a category that takes no custom fields: Grains, Hops and their
 * children. D65 §4.1: and Fruits, Spices & Flavorings and Sugars and
 * Extracts (the API's `catalog.allows_fields`; Other Consumables takes them).
 */
export function isManagedCategory(categories: IngredientCategory[], id: number): boolean {
  const category = categories.find((c) => c.id === id)
  if (category?.catalog) return !category.catalog.allows_fields
  return ['grains', 'hops', 'fruits', 'spices', 'sugars'].includes(categoryKey(categories, category) ?? '')
}

/** D65 A9: whether a top-level category takes subcategories (Grains, Other Consumables do; Hops, Fruits, Spices, Sugars don't). */
export function allowsChildren(category: Pick<IngredientCategory, 'key' | 'parent_id' | 'catalog'> | null | undefined): boolean {
  if (!category || category.parent_id != null) return false
  if (category.catalog) return category.catalog.allows_children
  return !['hops', 'fruits', 'spices', 'sugars'].includes(category.key ?? '')
}

/**
 * Categories for a picker, each parent followed by its children (indented,
 * `depth` 1), both in sort order (gap 8: Grains' five children were
 * interleaved with the top-level categories).
 */
export function categoryOptions(categories: IngredientCategory[]): { category: IngredientCategory; depth: 0 | 1 }[] {
  const order = (a: IngredientCategory, b: IngredientCategory) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
  const ids = new Set(categories.map((c) => c.id))
  // A child whose parent isn't listed shows at the top level.
  const top = categories.filter((c) => c.parent_id == null || !ids.has(c.parent_id)).sort(order)
  return top.flatMap((parent) => [
    { category: parent, depth: 0 as const },
    ...categories
      .filter((c) => c.parent_id === parent.id)
      .sort(order)
      .map((child) => ({ category: child, depth: 1 as const })),
  ])
}

/**
 * D62 lead decisions 1, gap 8: a product in a line picker. A product with a
 * form leads with its variety and form, "Citra T90 Pellet · Yakima Chief
 * Hops", so a phone that cuts the end off still tells one company's lines
 * apart; grain keeps its name ("Rahr 2-Row").
 */
export function pickerName(p: Pick<IngredientProduct, 'display_name' | 'form' | 'name'> & { ingredient?: { name: string } | null; manufacturer?: { name: string } | null }): string {
  // D65: a product with no manufacturer already reads "Whirlfloc T · None".
  if (!p.form || !p.ingredient || !p.manufacturer) return p.display_name
  return `${p.ingredient.name} ${p.form}${p.name ? ` (${p.name})` : ''} · ${p.manufacturer.name}`
}

/** A select (and its menu items) whose long names wrap instead of being cut off at phone width (gap 8). */
export const WRAP_SELECT = { '& .MuiSelect-select.MuiInputBase-input': { whiteSpace: 'normal', overflowWrap: 'anywhere' } } as const
export const WRAP_ITEM = { whiteSpace: 'normal', overflowWrap: 'anywhere' } as const

/** What the grains list's search matches: ingredient, manufacturer, product name, suppliers and their order names. */
export function productMatches(p: IngredientProduct, term: string): boolean {
  const t = term.trim().toLowerCase()
  if (!t) return true
  return [p.display_name, p.ingredient?.name, p.manufacturer?.name, p.name, ...(p.offers ?? []).flatMap((o) => [o.supplier?.name, o.order_name])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(t)
}

/**
 * A product's on-hand as the account shows it (§3.7, D61 carry-over 3): with
 * expired stock, the usable part and the expired part ("11 sacks 50 lb usable
 * · 43 lb expired", "650 lb usable · 43 lb expired"); without, just the
 * amount, in its pack and unit (D62 §3.5). The product header, Grains list,
 * Count and Record movement all use it, so they read the same.
 */
export function onHandText(
  p: { on_hand: string | number | null; expired?: string | number | null; unit?: string | null; unit_label?: string | null; form?: string | null; offers?: IngredientProduct['offers'] },
  mode: QuantityDisplay,
  pack: Pack | null = productPack(p.offers),
): string {
  const show = (q: string | number | null) => formatQuantity(q, pack?.name, pack?.size, unitLabel(p), mode)
  const expired = Number(p.expired ?? 0)
  if (!(expired > 0)) return show(p.on_hand)
  const usable = Math.round((Number(p.on_hand ?? 0) - expired) * 100) / 100
  return `${show(usable)} usable · ${show(expired)} expired`
}

/**
 * The quantity toggle's labels on a page with one pack and one unit (lead,
 * Stop 1 note 1): "Sacks + lb" / "lb" on grain, "Boxes + lb" / "lb" on
 * hops, "Pails + gal" / "gal" on a purée.
 */
export function toggleLabels(packName: string | null | undefined, unit: string | null | undefined): { packsLabel: string; totalLabel: string } {
  const plural = packPlural(packName)
  const u = unit ?? 'lb'
  return { packsLabel: `${plural.charAt(0).toUpperCase()}${plural.slice(1)} + ${u}`, totalLabel: u }
}

/**
 * D62 §3.4: a hop lot's crop year as typed: a four-digit year from 2000
 * through next year (Colorado). `{year}` or `{error}` (blank: "Enter the
 * crop year").
 */
export function parseCropYear(text: string, today: string): { year: number; error: null } | { year: null; error: string } {
  const t = text.trim()
  const last = Number(today.slice(0, 4)) + 1
  if (t === '') return { year: null, error: 'Enter the crop year' }
  if (!/^\d{4}$/.test(t) || Number(t) < 2000 || Number(t) > last) return { year: null, error: `A year from 2000 to ${last}` }
  return { year: Number(t), error: null }
}

/** The required lot features (`requiredLotKeys`) a lot's boxes leave empty, by label ("Alpha acid"). */
export function missingRequired(drafts: FeatureDrafts, types: FeatureType[], required: string[]): string[] {
  return types.filter((t) => required.includes(t.key) && (drafts[t.key]?.text ?? '').trim() === '').map((t) => t.label)
}

/**
 * D65 §4.4: a product's feature values as a lot's form uses them: the
 * standards a lot starts from and marks changes against (sugars' extract,
 * grain's specs) and the typical ranges shown beside a box and never copied
 * (fruit's Brix, hop alpha). Keyed by feature key.
 */
export function lotFeatureBasis(
  values: FeatureValues | null | undefined,
  types: FeatureType[],
  categoryId: number | null | undefined,
  parentId?: number | null,
): { standard: FeatureValues; typical: FeatureValues } {
  const standard: FeatureValues = {}
  const typical: FeatureValues = {}
  for (const t of types) {
    const v = values?.[t.key]
    if (!v) continue
    if (isRangeType(t, categoryId, parentId)) typical[t.key] = v
    else standard[t.key] = v
  }
  return { standard, typical }
}

/** D65 (salts amendment): the seven ions, in order, with the short label screens use. */
export const IONS = [
  { key: 'ca_ppm_per_g_gal', label: 'Ca' },
  { key: 'mg_ppm_per_g_gal', label: 'Mg' },
  { key: 'co3_ppm_per_g_gal', label: 'CO₃' },
  { key: 'hco3_ppm_per_g_gal', label: 'HCO₃' },
  { key: 'so4_ppm_per_g_gal', label: 'SO₄' },
  { key: 'na_ppm_per_g_gal', label: 'Na' },
  { key: 'cl_ppm_per_g_gal', label: 'Cl' },
] as const

/** "Ca 61.5 · SO₄ 147.4" (the set ones, in order); null with none. */
export function ionsText(ions: Record<string, string | number> | null | undefined): string | null {
  // D65 lead decisions 1 (gap 4): always one place ("Ca 72.0", "SO₄ 103.0").
  const parts = IONS.filter((i) => ions?.[i.key] != null).map((i) => `${i.label} ${Number(ions![i.key]).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`)
  return parts.length ? parts.join(' · ') : null
}

