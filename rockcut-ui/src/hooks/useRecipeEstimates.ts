import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { estimateCalls, readEstimates, type FormulaResult, type RecipeEstimate } from '../lib/recipeEstimates'

/**
 * D60 lead decisions 2 (gap 7): estimated OG and IBU for `recipeIds`, in one
 * request. `key` decides what refreshes it (a recipe page uses
 * `['recipe', id, 'estimates']`, so its grain bill's writes refresh it).
 */
export function useRecipeEstimates(key: unknown[], recipeIds: number[]) {
  return useQuery<Record<number, RecipeEstimate>>({
    queryKey: [...key, recipeIds],
    queryFn: async () => {
      const { data } = await api.post<{ results: FormulaResult[] }>('/api/formulas/execute', { calls: estimateCalls(recipeIds) })
      return readEstimates(recipeIds, data.results)
    },
    enabled: recipeIds.length > 0,
    // A grain bill edited on the recipe page shows on the brand's list when you come back.
    staleTime: 0,
  })
}
