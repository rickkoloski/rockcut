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

/** True when every box holds a number or nothing. */
export const draftsValid = (drafts: FeatureDrafts) => Object.values(drafts).every((d) => parseDecimal(d.text).ok)

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

/** A lot's value that isn't the product's standard (one present without the other counts). */
export function differs(lot: FeatureValue | undefined, standard: FeatureValue | undefined): boolean {
  if (!lot && !standard) return false
  if (!lot || !standard) return true
  return Number(lot.value) !== Number(standard.value)
}

/** Grains and its children, for the grains screens: the parent, and the children in order. */
export function grainCategories(categories: IngredientCategory[]): { grains: IngredientCategory | null; children: IngredientCategory[] } {
  const grains = categories.find((c) => c.name === 'Grains' && c.parent_id == null) ?? null
  const children = grains ? categories.filter((c) => c.parent_id === grains.id).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)) : []
  return { grains, children }
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
