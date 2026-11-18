// D60 §3.4: feature values (a maltster product's standard specs, a lot's
// specs) on the screens: which feature types apply to a category, the boxes'
// drafts, the payload the API takes, and a lot value that differs from the
// standard.
import { formatQuantity, parseDecimal, productSackSize, type QuantityDisplay } from './brewingUnits'
import type { FeatureType, FeatureValue, FeatureValues, IngredientCategory, IngredientProduct } from './types'

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
      return [t.key, { text: v?.value ?? '', entered_value: v?.entered_value ?? null, entered_unit: v?.entered_unit ?? null }]
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

/** True when every box holds a number or nothing, and (given the types) each number is in its range. */
export const draftsValid = (drafts: FeatureDrafts, types: FeatureType[] = []) =>
  Object.values(drafts).every((d) => parseDecimal(d.text).ok) && types.every((t) => !draftRangeError(t, drafts[t.key]))

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

/** Grains and its children, for the grains screens: the parent, and the children in order. */
export function grainCategories(categories: IngredientCategory[]): { grains: IngredientCategory | null; children: IngredientCategory[] } {
  const grains = categories.find((c) => c.name === 'Grains' && c.parent_id == null) ?? null
  const children = grains ? categories.filter((c) => c.parent_id === grains.id).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)) : []
  return { grains, children }
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

/** What the grains list's search matches: grain, maltster, product name, suppliers and their order names. */
export function productMatches(p: IngredientProduct, term: string): boolean {
  const t = term.trim().toLowerCase()
  if (!t) return true
  return [p.display_name, p.ingredient?.name, p.maltster?.name, p.name, ...(p.offers ?? []).flatMap((o) => [o.supplier?.name, o.order_name])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(t)
}

/** A product's on-hand as the account shows it, expired stock apart: "12 sacks 22.5 lb · 1 sack expired" (§3.7). */
export function onHandText(p: Pick<IngredientProduct, 'on_hand_lb' | 'expired_lb' | 'offers'>, mode: QuantityDisplay, sackSize = productSackSize(p.offers)): string {
  const main = formatQuantity(p.on_hand_lb, sackSize, mode)
  return Number(p.expired_lb) > 0 ? `${main} · ${formatQuantity(p.expired_lb, sackSize, mode)} expired` : main
}
