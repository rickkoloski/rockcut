// D60 lead decisions 2 (gap 7): a recipe's estimated OG and IBU. The brand's
// recipe list asked the grid for them through `formula: '=EST_OG(id)'`, but
// the vendored datagrid-extended stub (task 3999, 2026-09-30) is a plain
// grid that ignores formulas, so the columns had been blank since then. The
// page asks `/api/formulas/execute` itself: two calls per recipe, one request.

export interface RecipeEstimate {
  og: number | null
  ibu: number | null
}

export interface FormulaResult {
  status: 'ok' | 'error'
  value?: unknown
}

/** The `calls` for `/api/formulas/execute`: est_og then est_ibu for each recipe. */
export function estimateCalls(recipeIds: number[]) {
  return recipeIds.flatMap((id) => [
    { function: 'est_og', args: { recipe_id: id } },
    { function: 'est_ibu', args: { recipe_id: id } },
  ])
}

const num = (r: FormulaResult | undefined) => (r?.status === 'ok' && typeof r.value === 'number' ? r.value : null)

/** The results of `estimateCalls(recipeIds)`, by recipe id. A call that failed is null. */
export function readEstimates(recipeIds: number[], results: FormulaResult[]): Record<number, RecipeEstimate> {
  return Object.fromEntries(recipeIds.map((id, i) => [id, { og: num(results[2 * i]), ibu: num(results[2 * i + 1]) }]))
}

/** "1.045"; "—" with nothing to estimate from (no grain gives exactly 1). */
export const formatOg = (og: number | null | undefined) => (og == null || og <= 1 ? '—' : og.toFixed(3))

/** "23.4"; "—" when unknown. */
export const formatIbu = (ibu: number | null | undefined) => (ibu == null ? '—' : String(Math.round(ibu * 10) / 10))
